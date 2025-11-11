/**
 * 执行引擎接口定义
 */

/**
 * 执行状态
 */
export enum ExecutionStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
  COMPLETED = 'completed',
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  /** 数据集ID */
  datasetId: number;
  /** 策略ID */
  strategyId: string;
  /** 版本ID */
  versionId: string;
  /** 开始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime: Date;
  /** 时间周期 */
  timeframe: string;
  /** 初始资金 */
  initialCapital: number;
  /** 回放速度 (0=最快, 1=正常, 2=2倍速) */
  speed?: number;
  /** 是否记录日志 */
  enableLogging?: boolean;
  /** 策略自定义参数 */
  parameters?: Record<string, any>;
}

/**
 * 执行会话
 */
export interface ExecutionSession {
  /** 会话ID */
  sessionId: string;
  /** 策略ID */
  strategyId: string;
  /** 版本ID */
  versionId: string;
  /** 状态 */
  status: ExecutionStatus;
  /** 配置 */
  config: ExecutionConfig;
  /** 创建时间 */
  createdAt: Date;
  /** 开始时间 */
  startedAt?: Date;
  /** 结束时间 */
  endedAt?: Date;
  /** 当前时间 */
  currentTime?: Date;
  /** 错误信息 */
  error?: string;
}

/**
 * 执行指标
 */
export interface ExecutionMetrics {
  /** 会话ID */
  sessionId: string;
  /** 已处理Bar数 */
  barsProcessed: number;
  /** 已处理事件数 */
  eventsProcessed: number;
  /** 执行时间(ms) */
  executionTime: number;
  /** 平均延迟(ms) */
  avgLatency: number;
  /** 生成信号数 */
  signalsGenerated: number;
  /** 下单数 */
  ordersPlaced: number;
  /** 错误数 */
  errors: number;
  /** 内存使用(MB) */
  memoryUsage: number;
  /** CPU使用率(%) */
  cpuUsage: number;
  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 执行日志
 */
export interface ExecutionLog {
  /** 会话ID */
  sessionId: string;
  /** 日志级别 */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** 日志消息 */
  message: string;
  /** 时间戳 */
  timestamp: Date;
  /** 额外数据 */
  data?: any;
}

/**
 * 策略实例
 */
export interface StrategyInstance {
  /** 策略ID */
  strategyId: string;
  /** 版本ID */
  versionId: string;
  /** 策略代码 */
  code: string;
  /** 编译后的模块 */
  module: any;
  /** 策略生命周期钩子 */
  lifecycle: {
    onInit?: (ctx: any) => void | Promise<void>;
    onBar?: (ctx: any, bar: any) => void | Promise<void>;
    onStop?: (ctx: any, reason: string) => void | Promise<void>;
    onError?: (ctx: any, error: Error) => void | Promise<void>;
  };
  /** 参数Schema */
  parameterSchema?: any;
  /** 因子Schema */
  factorSchema?: any;
}

/**
 * 市场Bar数据
 */
export interface MarketBar {
  /** 品种 */
  symbol: string;
  /** 时间戳 */
  timestamp: Date;
  /** 开盘价 */
  open: number;
  /** 最高价 */
  high: number;
  /** 最低价 */
  low: number;
  /** 收盘价 */
  close: number;
  /** 成交量 */
  volume: number;
  /** 时间周期 */
  timeframe?: string;
}

/**
 * 策略上下文
 */
export interface StrategyContext {
  /** 策略ID */
  strategyId: string;
  /** 会话ID */
  sessionId: string;
  /** 当前时间 */
  currentTime: Date;
  /** 获取参数 */
  getParameters: <T = any>() => T;
  /** 获取仓位 */
  getPosition: (symbol: string) => any;
  /** 获取投资组合 */
  getPortfolio: () => any;
  /** 获取特征值 */
  getFeature: (bar: MarketBar, featureName: string) => any;
  /** 发布交易意图 */
  publishIntent: (intent: any) => void;
  /** 记录日志 */
  log: (level: string, message: string, data?: any) => void;
  /** 记录指标 */
  metrics: {
    increment: (name: string, value?: number, tags?: any) => void;
    gauge: (name: string, value: number, tags?: any) => void;
  };
}

