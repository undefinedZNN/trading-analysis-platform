/**
 * 策略加载器服务
 * 
 * 负责加载、编译和初始化策略
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScriptVersionEntity } from '../../entities/script-version.entity';
import { StrategyCompilerService } from '../../strategy/compiler.service';
import { StrategyInstance } from '../interfaces/execution.interface';

/**
 * 策略加载器
 */
@Injectable()
export class StrategyLoaderService {
  private readonly logger = new Logger(StrategyLoaderService.name);

  constructor(
    @InjectRepository(ScriptVersionEntity)
    private readonly scriptVersionRepository: Repository<ScriptVersionEntity>,
    private readonly compilerService: StrategyCompilerService,
  ) {}

  /**
   * 加载策略
   * 
   * @param strategyId 策略ID
   * @param versionId 版本ID
   * @returns 策略实例
   */
  async loadStrategy(
    strategyId: string,
    versionId: string,
  ): Promise<StrategyInstance> {
    this.logger.log(`Loading strategy: ${strategyId}/${versionId}`);

    // 1. 从数据库加载策略代码
    const scriptVersion = await this.scriptVersionRepository.findOne({
      where: {
        strategyId,
        scriptVersionId: versionId,
      },
    });

    if (!scriptVersion) {
      throw new NotFoundException(
        `Strategy version not found: ${strategyId}/${versionId}`,
      );
    }

    // 2. 编译策略代码
    const compiledResult = await this.compilerService.compile(
      scriptVersion.code,
    );

    if (!compiledResult.success || !compiledResult.code) {
      const errorMessage = compiledResult.errors?.join(', ') || 'Unknown compilation error';
      throw new Error(`Failed to compile strategy: ${errorMessage}`);
    }

    // 3. 执行编译后的代码获取模块
    // 使用vm模块执行代码
    const vm = require('vm');
    const module = { exports: {} };
    const sandbox = {
      module,
      exports: module.exports,
      require,
      console,
      process,
    };
    
    try {
      vm.runInNewContext(compiledResult.code, sandbox);
    } catch (error) {
      throw new Error(`Failed to execute strategy: ${error.message}`);
    }

    // 4. 提取生命周期钩子
    const lifecycle = this.extractLifecycle(module.exports);

    // 5. 验证策略接口
    this.validateStrategy(lifecycle);

    // 6. 创建策略实例
    const instance: StrategyInstance = {
      strategyId,
      versionId,
      code: scriptVersion.code,
      module,
      lifecycle,
      parameterSchema: scriptVersion.parameterSchema,
      factorSchema: scriptVersion.factorSchema,
    };

    this.logger.log(`Strategy loaded successfully: ${strategyId}/${versionId}`);

    return instance;
  }

  /**
   * 提取生命周期钩子
   * 
   * @param module 编译后的模块
   * @returns 生命周期钩子
   */
  private extractLifecycle(module: any): StrategyInstance['lifecycle'] {
    const lifecycle: StrategyInstance['lifecycle'] = {};

    // 检查默认导出
    const defaultExport = module.default || module;

    if (typeof defaultExport === 'object') {
      // 对象形式: { onInit, onBar, onStop, onError }
      if (typeof defaultExport.onInit === 'function') {
        lifecycle.onInit = defaultExport.onInit;
      }
      if (typeof defaultExport.onBar === 'function') {
        lifecycle.onBar = defaultExport.onBar;
      }
      if (typeof defaultExport.onStop === 'function') {
        lifecycle.onStop = defaultExport.onStop;
      }
      if (typeof defaultExport.onError === 'function') {
        lifecycle.onError = defaultExport.onError;
      }
    } else {
      // 检查命名导出
      if (typeof module.onInit === 'function') {
        lifecycle.onInit = module.onInit;
      }
      if (typeof module.onBar === 'function') {
        lifecycle.onBar = module.onBar;
      }
      if (typeof module.onStop === 'function') {
        lifecycle.onStop = module.onStop;
      }
      if (typeof module.onError === 'function') {
        lifecycle.onError = module.onError;
      }
    }

    return lifecycle;
  }

  /**
   * 验证策略接口
   * 
   * @param lifecycle 生命周期钩子
   */
  private validateStrategy(lifecycle: StrategyInstance['lifecycle']): void {
    // 必须至少有 onBar 钩子
    if (!lifecycle.onBar) {
      throw new Error(
        'Invalid strategy: missing required lifecycle hook "onBar"',
      );
    }

    // 验证钩子函数签名
    if (lifecycle.onInit && typeof lifecycle.onInit !== 'function') {
      throw new Error('Invalid strategy: onInit must be a function');
    }

    if (lifecycle.onBar && typeof lifecycle.onBar !== 'function') {
      throw new Error('Invalid strategy: onBar must be a function');
    }

    if (lifecycle.onStop && typeof lifecycle.onStop !== 'function') {
      throw new Error('Invalid strategy: onStop must be a function');
    }

    if (lifecycle.onError && typeof lifecycle.onError !== 'function') {
      throw new Error('Invalid strategy: onError must be a function');
    }
  }

  /**
   * 卸载策略
   * 
   * @param instance 策略实例
   */
  async unloadStrategy(instance: StrategyInstance): Promise<void> {
    this.logger.log(
      `Unloading strategy: ${instance.strategyId}/${instance.versionId}`,
    );

    // 清理资源
    instance.module = null;
    instance.lifecycle = {};

    this.logger.log(
      `Strategy unloaded: ${instance.strategyId}/${instance.versionId}`,
    );
  }

  /**
   * 重新加载策略
   * 
   * @param strategyId 策略ID
   * @param versionId 版本ID
   * @returns 策略实例
   */
  async reloadStrategy(
    strategyId: string,
    versionId: string,
  ): Promise<StrategyInstance> {
    this.logger.log(`Reloading strategy: ${strategyId}/${versionId}`);

    // 重新加载
    return this.loadStrategy(strategyId, versionId);
  }
}

