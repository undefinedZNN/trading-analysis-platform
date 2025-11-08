/**
 * 配置合并器
 * 
 * 负责合并多个配置源：
 * 1. 系统默认配置
 * 2. 策略 Manifest 配置
 * 3. 用户自定义配置
 * 
 * 优先级：用户配置 > Manifest 配置 > 默认配置
 * 
 * @module orchestrator/config/merger
 */

import type {
  BacktestSessionConfig,
  DataConfig,
  TimeframeConfig,
  StrategyConfig,
  ExecutionConfig,
  RiskConfig,
  AnalyticsConfig,
  OutputConfig,
  LogConfig,
  ConfigMergeOptions,
} from '../interfaces/config';

import {
  DEFAULT_DATA_CONFIG,
  DEFAULT_EXECUTION_CONFIG,
  DEFAULT_RISK_CONFIG,
  DEFAULT_ANALYTICS_CONFIG,
  DEFAULT_OUTPUT_CONFIG,
  DEFAULT_LOG_CONFIG,
} from './defaults';

// ============================================================================
// 深度合并工具函数
// ============================================================================

/**
 * 深度合并两个对象
 * 
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];
      
      if (sourceValue === undefined) {
        continue;
      }
      
      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue as any);
      } else {
        result[key] = sourceValue as any;
      }
    }
  }
  
  return result;
}

// ============================================================================
// 配置合并器
// ============================================================================

/**
 * 配置合并器类
 */
export class ConfigMerger {
  /**
   * 合并数据配置
   * 
   * @param userConfig 用户配置
   * @param manifestConfig Manifest 配置
   * @returns 合并后的配置
   */
  static mergeDataConfig(
    userConfig: Partial<DataConfig>,
    manifestConfig?: Partial<DataConfig>
  ): DataConfig {
    let config = { ...DEFAULT_DATA_CONFIG } as DataConfig;
    
    if (manifestConfig) {
      config = deepMerge(config, manifestConfig);
    }
    
    config = deepMerge(config, userConfig);
    
    return config;
  }
  
  /**
   * 合并执行配置
   * 
   * @param userConfig 用户配置
   * @param manifestConfig Manifest 配置
   * @returns 合并后的配置
   */
  static mergeExecutionConfig(
    userConfig: Partial<ExecutionConfig>,
    manifestConfig?: Partial<ExecutionConfig>
  ): ExecutionConfig {
    let config = { ...DEFAULT_EXECUTION_CONFIG } as ExecutionConfig;
    
    if (manifestConfig) {
      config = deepMerge(config, manifestConfig);
    }
    
    config = deepMerge(config, userConfig);
    
    return config;
  }
  
  /**
   * 合并风控配置
   * 
   * @param userConfig 用户配置
   * @param manifestConfig Manifest 配置
   * @returns 合并后的配置
   */
  static mergeRiskConfig(
    userConfig: Partial<RiskConfig>,
    manifestConfig?: Partial<RiskConfig>
  ): RiskConfig {
    let config = { ...DEFAULT_RISK_CONFIG };
    
    if (manifestConfig) {
      config = deepMerge(config, manifestConfig);
    }
    
    config = deepMerge(config, userConfig);
    
    return config;
  }
  
  /**
   * 合并分析配置
   * 
   * @param userConfig 用户配置
   * @returns 合并后的配置
   */
  static mergeAnalyticsConfig(
    userConfig?: Partial<AnalyticsConfig>
  ): AnalyticsConfig {
    if (!userConfig) {
      return { ...DEFAULT_ANALYTICS_CONFIG };
    }
    
    return deepMerge(DEFAULT_ANALYTICS_CONFIG, userConfig);
  }
  
  /**
   * 合并输出配置
   * 
   * @param userConfig 用户配置
   * @returns 合并后的配置
   */
  static mergeOutputConfig(
    userConfig?: Partial<OutputConfig>
  ): OutputConfig {
    if (!userConfig) {
      return { ...DEFAULT_OUTPUT_CONFIG };
    }
    
    return deepMerge(DEFAULT_OUTPUT_CONFIG, userConfig);
  }
  
  /**
   * 合并日志配置
   * 
   * @param userConfig 用户配置
   * @returns 合并后的配置
   */
  static mergeLogConfig(
    userConfig?: Partial<LogConfig>
  ): LogConfig {
    if (!userConfig) {
      return { ...DEFAULT_LOG_CONFIG };
    }
    
    return deepMerge(DEFAULT_LOG_CONFIG, userConfig);
  }
  
  /**
   * 合并完整会话配置
   * 
   * @param userConfig 用户配置
   * @param options 合并选项
   * @returns 合并后的配置
   */
  static mergeSessionConfig(
    userConfig: Partial<BacktestSessionConfig>,
    options?: ConfigMergeOptions
  ): BacktestSessionConfig {
    const opts: ConfigMergeOptions = {
      deepMerge: true,
      ...options,
    };
    
    // 提取 Manifest 配置（目前 Manifest 没有 config 字段，这里暂时不使用）
    const manifestConfig = undefined;
    
    // 合并各部分配置
    const mergedConfig: BacktestSessionConfig = {
      sessionId: userConfig.sessionId || '',
      name: userConfig.name,
      description: userConfig.description,
      data: this.mergeDataConfig(
        userConfig.data || ({} as DataConfig),
        manifestConfig?.data
      ),
      strategy: userConfig.strategy as StrategyConfig,
      execution: this.mergeExecutionConfig(
        userConfig.execution || ({} as ExecutionConfig),
        manifestConfig?.execution
      ),
      risk: this.mergeRiskConfig(
        userConfig.risk || ({} as RiskConfig),
        manifestConfig?.risk
      ),
      analytics: this.mergeAnalyticsConfig(userConfig.analytics),
      output: this.mergeOutputConfig(userConfig.output),
      log: this.mergeLogConfig(userConfig.log),
      metadata: userConfig.metadata || {},
    };
    
    return mergedConfig;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 合并配置（便捷函数）
 * 
 * @param userConfig 用户配置
 * @param options 合并选项
 * @returns 合并后的配置
 */
export function mergeConfig(
  userConfig: Partial<BacktestSessionConfig>,
  options?: ConfigMergeOptions
): BacktestSessionConfig {
  return ConfigMerger.mergeSessionConfig(userConfig, options);
}

/**
 * 从 Manifest 提取配置
 * 
 * @param manifest 策略 Manifest
 * @returns 提取的配置
 */
export function extractManifestConfig(manifest: any): { timeframe?: Partial<TimeframeConfig> } {
  return {
    timeframe: {
      primary: manifest.requiredTimeframe || '1m',
      auxiliary: manifest.auxiliaryTimeframes || [],
    },
  };
}

