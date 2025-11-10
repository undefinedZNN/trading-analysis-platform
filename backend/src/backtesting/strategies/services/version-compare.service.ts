/**
 * 版本对比服务
 * 
 * 协调代码差异和Schema差异的计算
 * 
 * @module strategies/services/version-compare
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScriptVersionEntity } from '../../entities/script-version.entity';
import { CodeDiffService } from './code-diff.service';
import { SchemaDiffService } from './schema-diff.service';
import { CompareCacheService, CacheStats } from './compare-cache.service';
import { StrategyScriptParser } from '../strategy-script.parser';
import {
  CompareVersionsDto,
  CompareVersionsResponseDto,
  CompareMode,
} from '../dto/version-compare.dto';

/**
 * 版本对比服务
 */
@Injectable()
export class VersionCompareService {
  private readonly logger = new Logger(VersionCompareService.name);

  constructor(
    @InjectRepository(ScriptVersionEntity)
    private readonly scriptRepository: Repository<ScriptVersionEntity>,
    private readonly codeDiffService: CodeDiffService,
    private readonly schemaDiffService: SchemaDiffService,
    private readonly cacheService: CompareCacheService,
    private readonly parserService: StrategyScriptParser,
  ) {}

  /**
   * 对比两个版本
   * 
   * @param dto 对比请求
   * @returns 对比结果
   */
  async compareVersions(
    dto: CompareVersionsDto,
  ): Promise<CompareVersionsResponseDto> {
    const compareMode = dto.mode || CompareMode.FULL;

    // 尝试从缓存获取
    const cached = this.cacheService.get(
      dto.strategyId,
      dto.sourceVersionId,
      dto.targetVersionId,
      compareMode,
    );

    if (cached) {
      this.logger.debug(
        `Cache hit for compare: ${dto.strategyId}/${dto.sourceVersionId} vs ${dto.targetVersionId}`,
      );
      return cached;
    }

    this.logger.debug(
      `Cache miss for compare: ${dto.strategyId}/${dto.sourceVersionId} vs ${dto.targetVersionId}`,
    );

    // 获取两个版本的脚本
    const [sourceScript, targetScript] = await Promise.all([
      this.getScript(dto.strategyId, dto.sourceVersionId),
      this.getScript(dto.strategyId, dto.targetVersionId),
    ]);

    // 验证版本
    if (sourceScript.scriptVersionId === targetScript.scriptVersionId) {
      throw new BadRequestException('Cannot compare a version with itself');
    }

    const response: CompareVersionsResponseDto = {
      strategyId: dto.strategyId,
      sourceVersion: {
        id: sourceScript.scriptVersionId,
        version: sourceScript.versionName,
        createdAt: sourceScript.createdAt.toISOString(),
      },
      targetVersion: {
        id: targetScript.scriptVersionId,
        version: targetScript.versionName,
        createdAt: targetScript.createdAt.toISOString(),
      },
      mode: dto.mode || CompareMode.FULL,
      comparedAt: new Date().toISOString(),
      hasDifferences: false,
    };

    // 根据模式计算差异
    if (compareMode === CompareMode.CODE || compareMode === CompareMode.FULL) {
      // 计算代码差异
      const codeDiff = this.codeDiffService.calculateDiff(
        sourceScript.code,
        targetScript.code,
      );
      response.codeDiff = codeDiff;
      
      if (this.codeDiffService.hasDifferences(codeDiff)) {
        response.hasDifferences = true;
      }
    }

    if (compareMode === CompareMode.SCHEMA || compareMode === CompareMode.FULL) {
      // 解析Schema
      const [sourceSchema, targetSchema] = await Promise.all([
        this.parseSchema(sourceScript.code),
        this.parseSchema(targetScript.code),
      ]);

      // 计算Schema差异
      const schemaDiff = this.schemaDiffService.compareSchemas(
        sourceSchema,
        targetSchema,
      );
      response.schemaDiff = schemaDiff;

      if (this.schemaDiffService.hasDifferences(schemaDiff)) {
        response.hasDifferences = true;
      }
    }

    // 缓存结果
    this.cacheService.set(
      dto.strategyId,
      dto.sourceVersionId,
      dto.targetVersionId,
      compareMode,
      response,
    );

    return response;
  }

  /**
   * 获取策略脚本
   * 
   * @param strategyId 策略ID
   * @param versionId 版本ID
   * @returns 策略脚本
   */
  private async getScript(
    strategyId: string,
    versionId: string,
  ): Promise<ScriptVersionEntity> {
    const script = await this.scriptRepository.findOne({
      where: {
        scriptVersionId: versionId,
        strategyId,
      },
    });

    if (!script) {
      throw new NotFoundException(
        `Strategy script not found: ${strategyId}/${versionId}`,
      );
    }

    return script;
  }

  /**
   * 解析Schema
   * 
   * @param code 策略代码
   * @returns Schema对象
   */
  private async parseSchema(code: string): Promise<{
    parameters?: any;
    factors?: any;
  }> {
    try {
      const result = await this.parserService.parse(code);
      return {
        parameters: result.parameters || {},
        factors: result.factors || {},
      };
    } catch (error) {
      // 如果解析失败,返回空Schema
      return {
        parameters: {},
        factors: {},
      };
    }
  }

  /**
   * 获取版本列表(用于对比选择)
   * 
   * @param strategyId 策略ID
   * @returns 版本列表
   */
  async getVersionsForCompare(strategyId: string): Promise<Array<{
    id: string;
    version: string;
    createdAt: string;
    isActive: boolean;
  }>> {
    const scripts = await this.scriptRepository.find({
      where: { strategyId },
      order: { createdAt: 'DESC' },
      select: ['scriptVersionId', 'versionName', 'createdAt', 'isMaster'],
    });

    return scripts.map(script => ({
      id: script.scriptVersionId,
      version: script.versionName,
      createdAt: script.createdAt.toISOString(),
      isActive: script.isMaster,
    }));
  }

  /**
   * 清除策略的缓存
   * 
   * @param strategyId 策略ID
   * @returns 清除的缓存条目数
   */
  invalidateStrategyCache(strategyId: string): number {
    return this.cacheService.invalidateStrategy(strategyId);
  }

  /**
   * 清除版本的缓存
   * 
   * @param strategyId 策略ID
   * @param versionId 版本ID
   * @returns 清除的缓存条目数
   */
  invalidateVersionCache(strategyId: string, versionId: string): number {
    return this.cacheService.invalidateVersion(strategyId, versionId);
  }

  /**
   * 获取缓存统计信息
   * 
   * @returns 缓存统计
   */
  getCacheStats(): CacheStats {
    return this.cacheService.getStats();
  }

  /**
   * 清空所有缓存
   */
  clearCache(): void {
    this.cacheService.clear();
  }
}

