/**
 * Orchestrator 配置接口定义
 * 
 * 定义回测会话的配置结构，包括：
 * - 数据配置
 * - 策略配置
 * - 执行配置
 * - 风控配置
 * - 分析配置
 * - 输出配置
 * 
 * @module orchestrator/interfaces/config
 */

import type { StrategyManifest } from '../../strategy/interfaces';

// ============================================================================
// 数据配置
// ============================================================================

/**
 * 数据源配置
 */
export interface DataSourceConfig {
  /** 数据提供者类型 */
  provider: 'parquet-duckdb' | 'csv' | 'custom';
  
  /** 数据路径或连接字符串 */
  path: string;
  
  /** 交易对列表 */
  symbols: string[];
  
  /** 时间范围 */
  timeRange: {
    start: string; // ISO 8601
    end: string;   // ISO 8601
  };
  
  /** 缺口处理策略 */
  gapPolicy?: 'forward-fill' | 'zero-fill' | 'drop' | 'linear-interpolate';
  
  /** 数据集的原始时间周期（用于数据加载） */
  baseGranularity?: string;
}

/**
 * 时间框架配置
 */
export interface TimeframeConfig {
  /** 主时间框架 */
  primary: string; // e.g., '1m', '5m', '1h'
  
  /** 辅助时间框架 */
  auxiliary?: string[];
}

/**
 * 数据配置
 */
export interface DataConfig {
  /** 数据源 */
  source: DataSourceConfig;
  
  /** 时间框架 */
  timeframe: TimeframeConfig;
}

// ============================================================================
// 策略配置
// ============================================================================

/**
 * 策略配置
 */
export interface StrategyConfig {
  /** 策略ID */
  strategyId: string;
  
  /** 策略名称 */
  name?: string;
  
  /** 策略脚本内容 */
  scriptContent: string;
  
  /** 策略清单 */
  manifest: StrategyManifest;
  
  /** 策略参数（覆盖默认参数） */
  parameters?: Record<string, unknown>;
  
  /** 自定义特征 */
  customFeatures?: string[];
}

// ============================================================================
// 执行配置
// ============================================================================

/**
 * 撮合配置
 */
export interface MatchingConfig {
  /** 市价单成交策略 */
  marketFillPolicy?: 'open' | 'close' | 'mid';
  
  /** 限价单成交策略 */
  limitFillPolicy?: 'limit-price' | 'aggressive';
}

/**
 * 滑点模型配置
 */
export interface SlippageConfig {
  /** 滑点模型类型 */
  model: 'zero' | 'fixed-spread' | 'proportional' | 'market-impact';
  
  /** 模型参数 */
  params?: Record<string, unknown>;
}

/**
 * 手续费模型配置
 */
export interface FeeConfig {
  /** 手续费模型类型 */
  model: 'zero' | 'fixed-rate' | 'tiered';
  
  /** 模型参数 */
  params?: Record<string, unknown>;
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  /** 初始资金 */
  initialCapital: string; // Big.js string
  
  /** 撮合配置 */
  matching?: MatchingConfig;
  
  /** 滑点配置 */
  slippage?: SlippageConfig;
  
  /** 手续费配置 */
  fee?: FeeConfig;
}

// ============================================================================
// 风控配置
// ============================================================================

/**
 * 风控规则配置
 */
export interface RiskRuleConfig {
  /** 规则ID */
  ruleId: string;
  
  /** 规则类型 */
  type: string;
  
  /** 是否启用 */
  enabled: boolean;
  
  /** 优先级（数值越小优先级越高） */
  priority: number;
  
  /** 规则参数 */
  params: Record<string, unknown>;
}

/**
 * 风控配置
 */
export interface RiskConfig {
  /** 风控规则列表 */
  rules: RiskRuleConfig[];
  
  /** 日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

// ============================================================================
// 分析配置
// ============================================================================

/**
 * 分析配置
 */
export interface AnalyticsConfig {
  /** 是否启用实时分析 */
  realtime?: boolean;
  
  /** 分析指标列表 */
  metrics?: string[];
  
  /** 是否生成报告 */
  generateReport?: boolean;
}

// ============================================================================
// 输出配置
// ============================================================================

/**
 * 输出配置
 */
export interface OutputConfig {
  /** 输出目录 */
  directory?: string;
  
  /** 输出格式 */
  formats?: ('json' | 'csv' | 'parquet')[];
  
  /** 是否压缩 */
  compress?: boolean;
  
  /** 是否包含特征快照 */
  includeFeatures?: boolean;
}

// ============================================================================
// 日志配置
// ============================================================================

/**
 * 日志配置
 */
export interface LogConfig {
  /** 日志级别 */
  level?: 'debug' | 'info' | 'warn' | 'error';
  
  /** 日志输出路径 */
  path?: string;
  
  /** 是否输出到控制台 */
  console?: boolean;
}

// ============================================================================
// 回测会话配置
// ============================================================================

/**
 * 回测会话配置
 */
export interface BacktestSessionConfig {
  /** 会话ID */
  sessionId: string;
  
  /** 会话名称 */
  name?: string;
  
  /** 会话描述 */
  description?: string;
  
  /** 数据配置 */
  data: DataConfig;
  
  /** 策略配置 */
  strategy: StrategyConfig;
  
  /** 执行配置 */
  execution: ExecutionConfig;
  
  /** 风控配置 */
  risk: RiskConfig;
  
  /** 分析配置 */
  analytics?: AnalyticsConfig;
  
  /** 输出配置 */
  output?: OutputConfig;
  
  /** 日志配置 */
  log?: LogConfig;
  
  /** 其他元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 配置合并选项
// ============================================================================

/**
 * 配置合并选项
 */
export interface ConfigMergeOptions {
  /** 是否允许覆盖必填字段 */
  allowOverride?: boolean;
  
  /** 是否深度合并 */
  deepMerge?: boolean;
  
  /** 是否验证合并后的配置 */
  validate?: boolean;
}

// ============================================================================
// 配置验证结果
// ============================================================================

/**
 * 配置验证错误
 */
export interface ConfigValidationError {
  /** 错误路径 */
  path: string;
  
  /** 错误消息 */
  message: string;
  
  /** 错误类型 */
  type: 'required' | 'type' | 'format' | 'range' | 'custom';
  
  /** 实际值 */
  value?: unknown;
}

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  /** 是否有效 */
  valid: boolean;
  
  /** 验证错误列表 */
  errors: ConfigValidationError[];
  
  /** 警告列表 */
  warnings?: string[];
}

