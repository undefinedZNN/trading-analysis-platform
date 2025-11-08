/**
 * 配置验证器
 * 
 * 负责验证回测会话配置的完整性和正确性
 * 
 * @module orchestrator/config/validator
 */

import type {
  BacktestSessionConfig,
  DataConfig,
  StrategyConfig,
  ExecutionConfig,
  RiskConfig,
  ConfigValidationResult,
  ConfigValidationError,
} from '../interfaces/config';

// ============================================================================
// 验证器类
// ============================================================================

/**
 * 配置验证器
 */
export class ConfigValidator {
  private errors: ConfigValidationError[] = [];
  private warnings: string[] = [];
  
  /**
   * 验证会话配置
   * 
   * @param config 会话配置
   * @returns 验证结果
   */
  validate(config: BacktestSessionConfig): ConfigValidationResult {
    this.errors = [];
    this.warnings = [];
    
    // 验证各部分配置
    this.validateSessionId(config.sessionId);
    this.validateDataConfig(config.data);
    this.validateStrategyConfig(config.strategy);
    this.validateExecutionConfig(config.execution);
    this.validateRiskConfig(config.risk);
    
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
  
  /**
   * 验证会话ID
   */
  private validateSessionId(sessionId: string): void {
    if (!sessionId) {
      this.addError('sessionId', 'Session ID is required', 'required');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      this.addError(
        'sessionId',
        'Session ID must contain only alphanumeric characters, hyphens, and underscores',
        'format',
        sessionId
      );
    }
  }
  
  /**
   * 验证数据配置
   */
  private validateDataConfig(config: DataConfig): void {
    if (!config) {
      this.addError('data', 'Data configuration is required', 'required');
      return;
    }
    
    // 验证数据源
    if (!config.source) {
      this.addError('data.source', 'Data source is required', 'required');
    } else {
      if (!config.source.path) {
        this.addError('data.source.path', 'Data source path is required', 'required');
      }
      
      if (!config.source.symbols || config.source.symbols.length === 0) {
        this.addError('data.source.symbols', 'At least one symbol is required', 'required');
      }
      
      if (!config.source.timeRange) {
        this.addError('data.source.timeRange', 'Time range is required', 'required');
      } else {
        if (!config.source.timeRange.start) {
          this.addError('data.source.timeRange.start', 'Start time is required', 'required');
        }
        if (!config.source.timeRange.end) {
          this.addError('data.source.timeRange.end', 'End time is required', 'required');
        }
        
        // 验证时间范围合理性
        if (config.source.timeRange.start && config.source.timeRange.end) {
          const start = new Date(config.source.timeRange.start);
          const end = new Date(config.source.timeRange.end);
          
          if (isNaN(start.getTime())) {
            this.addError('data.source.timeRange.start', 'Invalid start time format', 'format');
          }
          if (isNaN(end.getTime())) {
            this.addError('data.source.timeRange.end', 'Invalid end time format', 'format');
          }
          
          if (start.getTime() >= end.getTime()) {
            this.addError('data.source.timeRange', 'Start time must be before end time', 'range');
          }
        }
      }
    }
    
    // 验证时间框架
    if (!config.timeframe) {
      this.addError('data.timeframe', 'Timeframe configuration is required', 'required');
    } else {
      if (!config.timeframe.primary) {
        this.addError('data.timeframe.primary', 'Primary timeframe is required', 'required');
      } else if (!this.isValidTimeframe(config.timeframe.primary)) {
        this.addError(
          'data.timeframe.primary',
          'Invalid timeframe format',
          'format',
          config.timeframe.primary
        );
      }
      
      // 验证辅助时间框架
      if (config.timeframe.auxiliary) {
        for (const tf of config.timeframe.auxiliary) {
          if (!this.isValidTimeframe(tf)) {
            this.addError(
              'data.timeframe.auxiliary',
              `Invalid auxiliary timeframe: ${tf}`,
              'format',
              tf
            );
          }
        }
      }
    }
  }
  
  /**
   * 验证策略配置
   */
  private validateStrategyConfig(config: StrategyConfig): void {
    if (!config) {
      this.addError('strategy', 'Strategy configuration is required', 'required');
      return;
    }
    
    if (!config.strategyId) {
      this.addError('strategy.strategyId', 'Strategy ID is required', 'required');
    }
    
    if (!config.scriptContent) {
      this.addError('strategy.scriptContent', 'Strategy script content is required', 'required');
    }
    
    if (!config.manifest) {
      this.addError('strategy.manifest', 'Strategy manifest is required', 'required');
    }
  }
  
  /**
   * 验证执行配置
   */
  private validateExecutionConfig(config: ExecutionConfig): void {
    if (!config) {
      this.addError('execution', 'Execution configuration is required', 'required');
      return;
    }
    
    if (!config.initialCapital) {
      this.addError('execution.initialCapital', 'Initial capital is required', 'required');
    } else {
      const capital = parseFloat(config.initialCapital);
      if (isNaN(capital) || capital <= 0) {
        this.addError(
          'execution.initialCapital',
          'Initial capital must be a positive number',
          'range',
          config.initialCapital
        );
      }
    }
    
    // 验证滑点配置
    if (config.slippage) {
      if (!config.slippage.model) {
        this.addError('execution.slippage.model', 'Slippage model is required', 'required');
      }
    }
    
    // 验证手续费配置
    if (config.fee) {
      if (!config.fee.model) {
        this.addError('execution.fee.model', 'Fee model is required', 'required');
      }
    }
  }
  
  /**
   * 验证风控配置
   */
  private validateRiskConfig(config: RiskConfig): void {
    if (!config) {
      this.addError('risk', 'Risk configuration is required', 'required');
      return;
    }
    
    if (!config.rules) {
      this.addError('risk.rules', 'Risk rules array is required', 'required');
      return;
    }
    
    // 验证每个规则
    for (let i = 0; i < config.rules.length; i++) {
      const rule = config.rules[i];
      
      if (!rule.ruleId) {
        this.addError(`risk.rules[${i}].ruleId`, 'Rule ID is required', 'required');
      }
      
      if (!rule.type) {
        this.addError(`risk.rules[${i}].type`, 'Rule type is required', 'required');
      }
      
      if (rule.enabled === undefined) {
        this.addError(`risk.rules[${i}].enabled`, 'Rule enabled flag is required', 'required');
      }
      
      if (rule.priority === undefined) {
        this.addError(`risk.rules[${i}].priority`, 'Rule priority is required', 'required');
      } else if (rule.priority < 0) {
        this.addError(
          `risk.rules[${i}].priority`,
          'Rule priority must be non-negative',
          'range',
          rule.priority
        );
      }
      
      if (!rule.params) {
        this.addError(`risk.rules[${i}].params`, 'Rule params are required', 'required');
      }
    }
    
    // 检查规则ID唯一性
    const ruleIds = new Set<string>();
    for (const rule of config.rules) {
      if (rule.ruleId && ruleIds.has(rule.ruleId)) {
        this.addError(
          'risk.rules',
          `Duplicate rule ID: ${rule.ruleId}`,
          'custom',
          rule.ruleId
        );
      }
      ruleIds.add(rule.ruleId);
    }
  }
  
  /**
   * 添加验证错误
   */
  private addError(
    path: string,
    message: string,
    type: ConfigValidationError['type'],
    value?: unknown
  ): void {
    this.errors.push({
      path,
      message,
      type,
      value,
    });
  }
  
  /**
   * 添加警告
   */
  private addWarning(message: string): void {
    this.warnings.push(message);
  }
  
  /**
   * 验证时间框架格式
   */
  private isValidTimeframe(timeframe: string): boolean {
    // 支持的格式: 1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 1w
    return /^\d+[mhdw]$/.test(timeframe);
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 验证配置（便捷函数）
 * 
 * @param config 会话配置
 * @returns 验证结果
 */
export function validateConfig(config: BacktestSessionConfig): ConfigValidationResult {
  const validator = new ConfigValidator();
  return validator.validate(config);
}

/**
 * 快速验证（抛出错误）
 * 
 * @param config 会话配置
 * @throws 如果验证失败
 */
export function validateConfigOrThrow(config: BacktestSessionConfig): void {
  const result = validateConfig(config);
  
  if (!result.valid) {
    const errorMessages = result.errors
      .map(err => `${err.path}: ${err.message}`)
      .join('\n');
    
    throw new Error(`Configuration validation failed:\n${errorMessages}`);
  }
}

