import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategyEntity } from '../entities/strategy.entity';
import { StrategyScriptVersionEntity } from '../entities/strategy-script-version.entity';
import {
  CreateStrategyScriptDto,
  ListStrategyScriptsQueryDto,
  UpdateStrategyScriptDto,
} from '../dto/strategy-script.dto';

export interface PaginatedScriptsResult {
  items: StrategyScriptVersionEntity[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class StrategyScriptsService {
  constructor(
    @InjectRepository(StrategyEntity)
    private readonly strategyRepo: Repository<StrategyEntity>,
    @InjectRepository(StrategyScriptVersionEntity)
    private readonly scriptRepo: Repository<StrategyScriptVersionEntity>,
  ) {}

  async listScripts(
    strategyId: number,
    query: ListStrategyScriptsQueryDto,
  ): Promise<PaginatedScriptsResult> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const qb = this.scriptRepo
      .createQueryBuilder('script')
      .where('script.strategyId = :strategyId', { strategyId })
      .orderBy('script.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async getScriptById(scriptId: number): Promise<StrategyScriptVersionEntity> {
    const script = await this.scriptRepo.findOne({ where: { scriptId } });
    if (!script) {
      throw new NotFoundException('脚本版本不存在或已删除');
    }
    return script;
  }

  async createScript(
    strategyId: number,
    dto: CreateStrategyScriptDto,
  ): Promise<StrategyScriptVersionEntity> {
    const strategy = await this.strategyRepo.findOne({ where: { strategyId } });
    if (!strategy) {
      throw new NotFoundException('策略不存在或已被删除');
    }

    const versionCode = (dto.versionCode ?? this.generateVersionCode()).trim();
    if (!versionCode) {
      throw new BadRequestException('版本号不能为空');
    }

    const duplicated = await this.scriptRepo.findOne({
      where: { strategyId, versionCode },
    });
    if (duplicated) {
      throw new BadRequestException('脚本版本号已存在，请更换后重试');
    }

    this.ensureValidManifest(dto.manifest);

    const script = this.scriptRepo.create({
      strategyId,
      versionCode,
      description: dto.description?.trim() ?? null,
      changelog: dto.changelog?.trim() ?? null,
      scriptSource: dto.scriptSource,
      manifest: dto.manifest ?? null,
      isPrimary: dto.isPrimary ?? false,
      createdBy: dto.createdBy ?? strategy.createdBy ?? null,
      updatedBy: dto.createdBy ?? strategy.createdBy ?? null,
    });

    const saved = await this.scriptRepo.save(script);
    if (saved.isPrimary) {
      await this.resetPrimaryFlag(strategyId, saved.scriptId);
    }
    return saved;
  }

  async updateScript(
    scriptId: number,
    dto: UpdateStrategyScriptDto,
  ): Promise<StrategyScriptVersionEntity> {
    const script = await this.scriptRepo.findOne({ where: { scriptId } });
    if (!script) {
      throw new NotFoundException('脚本版本不存在或已删除');
    }

    if (dto.description !== undefined) {
      script.description = dto.description?.trim() ?? null;
    }
    if (dto.changelog !== undefined) {
      script.changelog = dto.changelog?.trim() ?? null;
    }
    if (dto.scriptSource !== undefined) {
      script.scriptSource = dto.scriptSource;
    }
    if (dto.manifest !== undefined) {
      this.ensureValidManifest(dto.manifest);
      script.manifest = dto.manifest ?? null;
    }
    if (dto.isPrimary !== undefined) {
      script.isPrimary = dto.isPrimary;
    }
    script.updatedBy = dto.updatedBy ?? script.updatedBy;

    const saved = await this.scriptRepo.save(script);
    if (dto.isPrimary) {
      await this.resetPrimaryFlag(script.strategyId, script.scriptId);
    }
    return saved;
  }

  private async resetPrimaryFlag(strategyId: number, scriptId: number) {
    await this.scriptRepo
      .createQueryBuilder()
      .update()
      .set({ isPrimary: false })
      .where('strategy_id = :strategyId', { strategyId })
      .andWhere('script_id <> :scriptId', { scriptId })
      .execute();
  }

  private ensureValidManifest(manifest: Record<string, unknown> | null | undefined) {
    if (manifest === undefined || manifest === null) {
      return;
    }
    if (typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new BadRequestException('Manifest 必须为对象');
    }
    const entry = manifest['entry'] ?? manifest['main'];
    if (entry !== undefined && (typeof entry !== 'string' || !entry.trim())) {
      throw new BadRequestException('Manifest.entry 必须为非空字符串');
    }
  }

  private generateVersionCode(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = `${now.getUTCMonth() + 1}`.padStart(2, '0');
    const d = `${now.getUTCDate()}`.padStart(2, '0');
    const hh = `${now.getUTCHours()}`.padStart(2, '0');
    const mm = `${now.getUTCMinutes()}`.padStart(2, '0');
    const ss = `${now.getUTCSeconds()}`.padStart(2, '0');
    return `v${y}${m}${d}-${hh}${mm}${ss}`;
  }
}
