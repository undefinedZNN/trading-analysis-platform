/**
 * StrategySandbox 核心接口定义
 * 
 * 定义策略生命周期、上下文 API、Manifest 等核心类型
 */

import { Observable } from 'rxjs';

// =====================================================================
// 基础类型
// =====================================================================

/** 时间框架类型 */
export type Timeframe = '1s' | '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | string;

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 订单方向 */
export type OrderSide = 'buy' | 'sell';

/** 订单类型 */
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';

/** 时间类型 (ISO8601 字符串或 epoch 毫秒) */
export type Timestamp = string | number;

// =====================================================================
// 事件 Payload 类型
// =====================================================================

/**
 * 市场行情事件 Payload
 */
export interface MarketBarPayload {
  symbol: string;
  timeframe: Timeframe;
  timestamp: Timestamp;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades?: number;
  notional?: string;
  features?: Record<string, string | number>;
  source?: string;
}

/**
 * 订单意图 Payload
 */
export interface OrderIntentPayload {
  intentId: string;
  strategyId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string;
  price?: string;
  stopPrice?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  clientOrderId?: string;
  extra?: Record<string, unknown>;
}

/**
 * 执行回报 Payload
 */
export interface ExecutionReportPayload {
  orderId: string;
  clientOrderId?: string;
  strategyId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: 'new' | 'partial' | 'filled' | 'canceled' | 'rejected';
  orderQuantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  avgPrice?: string;
  lastPrice?: string;
  lastQuantity?: string;
  commission?: string;
  commissionAsset?: string;
  timestamp: Timestamp;
  reason?: string;
  extra?: Record<string, unknown>;
}

/**
 * 风控决策 Payload
 */
export interface RiskDecisionPayload {
  decisionId: string;
  strategyId: string;
  action: 'allow' | 'reject' | 'reduce' | 'force_close';
  intentId?: string;
  orderId?: string;
  reason?: string;
  suggestedQuantity?: string;
  timestamp: Timestamp;
  extra?: Record<string, unknown>;
}

/**
 * 策略日志 Payload
 */
export interface StrategyLogPayload {
  strategyId: string;
  level: LogLevel;
  message: string;
  extra?: Record<string, unknown>;
}

/**
 * 策略指标 Payload
 */
export interface StrategyMetricPayload {
  strategyId: string;
  metricType: 'counter' | 'histogram' | 'gauge';
  metricName: string;
  value: number;
  tags?: Record<string, string>;
}

/**
 * 仓位快照
 */
export interface PositionSnapshot {
  symbol: string;
  side: 'long' | 'short' | 'neutral';
  quantity: string;
  entryPrice: string;
  currentPrice: string;
  unrealizedPnL: string;
  realizedPnL: string;
  commission: string;
  lastUpdate: Timestamp;
}

/**
 * 投资组合更新 Payload
 */
export interface PortfolioUpdatePayload {
  strategyId: string;
  cash: string;
  equity: string;
  margin?: string;
  marginLevel?: string;
  positions: Record<string, PositionSnapshot>;
  timestamp: Timestamp;
}

/**
 * 控制事件 Payload
 */
export interface ControlEventPayload {
  action: 'start' | 'pause' | 'resume' | 'stop' | 'reset' | 'checkpoint' | 'seek';
  targetSequenceId?: string;
  checkpointId?: string;
  reason?: string;
}

// =====================================================================
// 参数定义
// =====================================================================

/**
 * 参数模式定义
 */
export interface ParameterSchema {
  type: 'number' | 'string' | 'boolean' | 'enum';
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  required?: boolean;
  'x-component'?: string;  // UI 组件提示
  [key: string]: unknown;  // 扩展字段
}

/**
 * 参数定义
 */
export type ParametersDefinition = Record<string, ParameterSchema>;

// =====================================================================
// 特征定义
// =====================================================================

/**
 * 特征值类型
 */
export type FeatureValueType = 'number' | 'string' | 'boolean' | 'enum';

/**
 * 自定义特征定义
 */
export interface CustomFeatureDefinition {
  id: string;
  label: string;
  description?: string;
  valueType: FeatureValueType;
  domain?: unknown[];  // enum 类型的值域
  compute: (stream: Observable<MarketBarPayload>) => Observable<MarketBarPayload>;
}

// =====================================================================
// 策略 Manifest
// =====================================================================

/**
 * 策略 Manifest
 * 
 * 定义策略的元数据、依赖、参数等
 */
export interface StrategyManifest {
  /** 策略唯一标识 */
  strategyId: string;
  
  /** 策略名称 */
  name: string;
  
  /** 策略版本 */
  version: string;
  
  /** 策略描述 */
  description: string;
  
  /** 作者 */
  author: string;
  
  /** 主时间框架 */
  requiredTimeframe: Timeframe;
  
  /** 辅助时间框架流 */
  auxStreams?: Timeframe[];
  
  /** 特征依赖 (FeatureRegistry 中的 ID) */
  featureDeps: string[];
  
  /** 数据依赖 (需要的标的列表) */
  dataDeps: Array<{ symbol: string; market?: string }>;
  
  /** 默认参数 */
  defaultParameters: Record<string, unknown>;
  
  /** 预热 bar 数量 */
  warmupBars?: number;
  
  /** 参数模式 */
  parameterSchema?: ParametersDefinition;
  
  /** 自定义特征定义 */
  customFeatures?: CustomFeatureDefinition[];
  
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}

// =====================================================================
// 策略快照
// =====================================================================

/**
 * 策略快照
 * 
 * 用于状态序列化和恢复
 */
export interface StrategySnapshot {
  /** 策略自定义状态 */
  state: Record<string, unknown>;
  
  /** 共享状态 (用于自定义特征) */
  sharedState: Record<string, unknown>;
  
  /** 创建时间 */
  createdAt: Timestamp;
  
  /** 最后处理的序列号 */
  lastSequenceId: string;
  
  /** 扩展数据 */
  extra?: Record<string, unknown>;
}

// =====================================================================
// 策略上下文 (StrategyContext)
// =====================================================================

/**
 * 策略指标接口
 */
export interface StrategyMetrics {
  /**
   * 计数器递增
   * @param counter 计数器名称
   * @param value 递增值 (默认 1)
   * @param tags 标签
   */
  increment(counter: string, value?: number, tags?: Record<string, string>): void;
  
  /**
   * 直方图观测
   * @param histogram 直方图名称
   * @param value 观测值
   * @param tags 标签
   */
  observe(histogram: string, value: number, tags?: Record<string, string>): void;
  
  /**
   * 仪表盘设置
   * @param metric 指标名称
   * @param value 当前值
   * @param tags 标签
   */
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
}

/**
 * 策略上下文接口
 * 
 * 提供策略访问系统资源的统一接口
 */
export interface StrategyContext {
  // ===== 基础信息 =====
  
  /** 会话 ID */
  readonly sessionId: string;
  
  /** 策略 ID */
  readonly strategyId: string;
  
  /** 策略 Manifest */
  readonly manifest: StrategyManifest;
  
  // ===== 时间相关 =====
  
  /**
   * 获取当前事件时间戳 (ISO8601)
   */
  now(): string;
  
  // ===== 交易操作 =====
  
  /**
   * 发布订单意图
   * @param intent 订单意图
   */
  publishIntent(intent: OrderIntentPayload): void;
  
  /**
   * 取消订单意图
   * @param intentId 意图 ID
   */
  cancelIntent(intentId: string): void;
  
  // ===== 仓位查询 =====
  
  /**
   * 获取指定标的的仓位
   * @param symbol 标的代码
   */
  getPosition(symbol: string): PositionSnapshot | undefined;
  
  /**
   * 获取投资组合快照
   */
  getPortfolio(): PortfolioUpdatePayload;
  
  // ===== 特征访问 =====
  
  /**
   * 从行情事件中获取特征值
   * @param event 行情事件
   * @param featureId 特征 ID
   */
  getFeature(event: MarketBarPayload, featureId: string): string | number | undefined;
  
  // ===== 参数访问 =====
  
  /**
   * 获取策略参数
   */
  getParameters<T = Record<string, unknown>>(): T;
  
  /**
   * 设置参数覆盖 (运行时动态调整)
   * @param params 参数覆盖
   */
  setParameterOverrides(params: Record<string, unknown>): void;
  
  // ===== 日志与指标 =====
  
  /**
   * 记录日志
   * @param level 日志级别
   * @param message 日志消息
   * @param extra 额外信息
   */
  log(level: LogLevel, message: string, extra?: Record<string, unknown>): void;
  
  /**
   * 指标接口
   */
  readonly metrics: StrategyMetrics;
  
  // ===== 状态管理 =====
  
  /**
   * 请求生成快照
   */
  requestSnapshot(): Promise<StrategySnapshot>;
  
  // ===== 共享状态 (用于自定义特征) =====
  
  /**
   * 共享状态存储
   */
  readonly sharedState: Map<string, Observable<unknown>>;
  
  /**
   * 注册共享状态
   * @param key 状态键
   * @param observable 状态流
   */
  registerSharedState(key: string, observable: Observable<unknown>): void;
}

// =====================================================================
// 策略生命周期 (StrategyLifecycle)
// =====================================================================

/**
 * 策略生命周期接口
 * 
 * 策略脚本需要实现这些钩子函数
 */
export interface StrategyLifecycle {
  /**
   * 初始化钩子
   * 在策略启动时调用一次
   */
  onInit?(ctx: StrategyContext): Promise<void> | void;
  
  /**
   * 预热数据处理钩子
   * 在正式交易前处理预热数据
   */
  onWarmup?(ctx: StrategyContext, bar: MarketBarPayload): Promise<void> | void;
  
  /**
   * 主时间框架 bar 事件钩子
   * 每个主时间框架 bar 触发一次
   */
  onBar?(ctx: StrategyContext, bar: MarketBarPayload): Promise<void> | void;
  
  /**
   * 辅助时间框架事件钩子
   * 每个辅助流 bar 触发一次
   */
  onAuxStream?(ctx: StrategyContext, bar: MarketBarPayload): Promise<void> | void;
  
  /**
   * 执行回报事件钩子
   * 订单状态变化时触发
   */
  onExecutionReport?(ctx: StrategyContext, report: ExecutionReportPayload): Promise<void> | void;
  
  /**
   * 风控决策事件钩子
   * 风控层做出决策时触发
   */
  onRiskDecision?(ctx: StrategyContext, decision: RiskDecisionPayload): Promise<void> | void;
  
  /**
   * 控制事件钩子
   * 系统控制事件时触发
   */
  onControl?(ctx: StrategyContext, control: ControlEventPayload): Promise<void> | void;
  
  /**
   * 快照生成钩子
   * 系统请求快照时调用
   */
  onSnapshot?(ctx: StrategyContext): Promise<StrategySnapshot> | StrategySnapshot;
  
  /**
   * 快照恢复钩子
   * 从快照恢复时调用
   */
  onRestore?(ctx: StrategyContext, snapshot: StrategySnapshot): Promise<void> | void;
  
  /**
   * 停止钩子
   * 策略停止时调用
   */
  onStop?(ctx: StrategyContext, reason: string): Promise<void> | void;
  
  /**
   * 错误处理钩子
   * 策略执行出错时调用
   */
  onError?(ctx: StrategyContext, error: Error): Promise<void> | void;
}

// =====================================================================
// 策略实例
// =====================================================================

/**
 * 策略实例接口
 * 
 * 封装加载后的策略
 */
export interface StrategyInstance {
  /** 策略生命周期实现 */
  lifecycle: StrategyLifecycle;
  
  /** 策略 Manifest */
  manifest: StrategyManifest;
  
  /** 参数定义 */
  parameters: ParametersDefinition;
  
  /** 自定义特征 */
  customFeatures?: CustomFeatureDefinition[];
}

// =====================================================================
// 工具类型
// =====================================================================

/**
 * 基础事件类型
 */
export interface BaseEvent<T = unknown> {
  eventId: string;
  eventType: string;
  sessionId: string;
  sequenceId: string;
  timestamp: Timestamp;
  source: string;
  payload: T;
}

/**
 * 策略加载器接口
 */
export interface StrategyLoader {
  /**
   * 加载策略脚本
   * @param scriptContent 脚本内容
   * @param manifest Manifest
   */
  load(scriptContent: string, manifest: StrategyManifest): Promise<StrategyInstance>;
}

/**
 * 沙箱配置
 */
export interface SandboxConfig {
  /** 是否启用错误隔离 */
  isolateErrors?: boolean;
  
  /** 超时设置 (毫秒) */
  timeout?: number;
  
  /** 是否启用调试模式 */
  debug?: boolean;
  
  /** 扩展配置 */
  [key: string]: unknown;
}

/**
 * 投资组合存储接口
 */
export interface PortfolioStore {
  /**
   * 获取仓位
   * @param strategyId 策略 ID
   * @param symbol 标的代码
   */
  getPosition(strategyId: string, symbol: string): PositionSnapshot | undefined;
  
  /**
   * 获取投资组合
   * @param strategyId 策略 ID
   */
  getPortfolio(strategyId: string): PortfolioUpdatePayload;
  
  /**
   * 更新仓位
   * @param strategyId 策略 ID
   * @param symbol 标的代码
   * @param position 仓位快照
   */
  updatePosition(strategyId: string, symbol: string, position: PositionSnapshot): void;
}

