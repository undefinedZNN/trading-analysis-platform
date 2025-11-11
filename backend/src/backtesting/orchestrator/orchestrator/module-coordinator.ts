/**
 * 模块协调器实现
 * 
 * 负责初始化和管理所有回测模块
 * 
 * @module orchestrator/orchestrator/module-coordinator
 */

import type { ModuleCoordinator } from '../interfaces/orchestrator';
import type { BacktestSessionConfig } from '../interfaces/config';
import type { ServiceContainer } from '../interfaces/container';
import { ServiceTokens } from '../container/tokens';

/**
 * 模块协调器实现
 */
export class ModuleCoordinatorImpl implements ModuleCoordinator {
  /**
   * 初始化所有模块
   * 
   * 按照依赖顺序初始化各个模块：
   * 1. DataProvider
   * 2. TimeframeAdapter
   * 3. FeatureRegistry
   * 4. EventBus
   * 5. StrategySandbox
   * 6. RiskEngine
   * 7. ExecutionEngine
   * 8. LedgerService
   */
  async initializeModules(
    container: ServiceContainer,
    config: BacktestSessionConfig
  ): Promise<void> {
    // 1. 初始化 DataProvider
    const dataProvider = container.tryResolve(ServiceTokens.DataProvider);
    if (dataProvider && typeof dataProvider === 'object' && 'initialize' in dataProvider) {
      await (dataProvider as any).initialize?.(config.data);
    }
    
    // 2. 初始化 TimeframeAdapter
    const timeframeAdapter = container.tryResolve(ServiceTokens.TimeframeAdapter);
    if (timeframeAdapter && typeof timeframeAdapter === 'object' && 'initialize' in timeframeAdapter) {
      await (timeframeAdapter as any).initialize?.(config.data?.timeframe);
    }
    
    // 3. 初始化 FeatureRegistry
    const featureRegistry = container.tryResolve(ServiceTokens.FeatureRegistry);
    if (featureRegistry && typeof featureRegistry === 'object' && 'initialize' in featureRegistry) {
      await (featureRegistry as any).initialize?.();
    }
    
    // 4. 初始化 EventBus
    const eventBus = container.tryResolve(ServiceTokens.EventBus);
    if (eventBus && typeof eventBus === 'object' && 'initialize' in eventBus) {
      await (eventBus as any).initialize?.();
    }
    
    // 5. 初始化 StrategySandbox
    const strategySandbox = container.tryResolve(ServiceTokens.StrategySandbox);
    if (strategySandbox && typeof strategySandbox === 'object' && 'initialize' in strategySandbox) {
      await (strategySandbox as any).initialize?.(config.strategy);
    }
    
    // 6. 初始化 RiskEngine
    const riskEngine = container.tryResolve(ServiceTokens.RiskEngine);
    if (riskEngine && typeof riskEngine === 'object' && 'initialize' in riskEngine) {
      await (riskEngine as any).initialize?.(config.risk);
    }
    
    // 7. 初始化 ExecutionEngine
    const executionEngine = container.tryResolve(ServiceTokens.ExecutionEngine);
    if (executionEngine && typeof executionEngine === 'object' && 'initialize' in executionEngine) {
      await (executionEngine as any).initialize?.(config.execution);
    }
    
    // 8. 初始化 LedgerService
    const ledgerService = container.tryResolve(ServiceTokens.LedgerService);
    if (ledgerService && typeof ledgerService === 'object' && 'initialize' in ledgerService) {
      await (ledgerService as any).initialize?.();
    }
  }
  
  /**
   * 获取模块状态
   * 
   * 收集所有模块的当前状态，用于快照
   */
  getModuleStates(container: ServiceContainer): Record<string, unknown> {
    const states: Record<string, unknown> = {};
    
    // 收集各模块状态
    const tokens = [
      ServiceTokens.DataProvider,
      ServiceTokens.TimeframeAdapter,
      ServiceTokens.FeatureRegistry,
      ServiceTokens.EventBus,
      ServiceTokens.EventStore,
      ServiceTokens.StrategySandbox,
      ServiceTokens.RiskEngine,
      ServiceTokens.ExecutionEngine,
      ServiceTokens.LedgerService,
    ];
    
    for (const token of tokens) {
      const service = container.tryResolve(token);
      if (service && typeof service === 'object' && 'getState' in service) {
        states[token] = (service as any).getState?.();
      }
    }
    
    return states;
  }
  
  /**
   * 恢复模块状态
   * 
   * 从快照恢复各模块的状态
   */
  async restoreModuleStates(
    container: ServiceContainer,
    states: Record<string, unknown>
  ): Promise<void> {
    // 按依赖顺序恢复状态
    const tokens = [
      ServiceTokens.DataProvider,
      ServiceTokens.TimeframeAdapter,
      ServiceTokens.FeatureRegistry,
      ServiceTokens.EventBus,
      ServiceTokens.EventStore,
      ServiceTokens.StrategySandbox,
      ServiceTokens.RiskEngine,
      ServiceTokens.ExecutionEngine,
      ServiceTokens.LedgerService,
    ];
    
    for (const token of tokens) {
      if (states[token]) {
        const service = container.tryResolve(token);
        if (service && typeof service === 'object' && 'setState' in service) {
          await (service as any).setState?.(states[token]);
        }
      }
    }
  }
}

/**
 * 创建模块协调器
 */
export function createModuleCoordinator(): ModuleCoordinator {
  return new ModuleCoordinatorImpl();
}
