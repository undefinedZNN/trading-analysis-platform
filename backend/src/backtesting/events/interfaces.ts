/**
 * EventBus & EventStore 核心接口定义
 * 
 * 事件总线系统是回测框架的核心通信机制，提供：
 * - 统一的事件发布/订阅
 * - 状态管理和控制流
 * - 事件持久化和重放
 * - 死信队列和错误处理
 */

import { Observable, Subscription } from 'rxjs';

/**
 * 事件类型枚举
 */
export type EventType =
  // 市场数据事件
  | 'market.bar'              // K线数据
  | 'market.tick'             // Tick数据
  | 'market.orderbook'        // 订单簿
  
  // 策略事件
  | 'strategy.intent'         // 策略交易意图
  | 'strategy.log'            // 策略日志
  | 'strategy.metric'         // 策略指标
  | 'strategy.state'          // 策略状态
  
  // 风控事件
  | 'risk.decision'           // 风控决策
  | 'risk.alert'              // 风控警告
  | 'risk.violation'          // 风控违规
  
  // 执行事件
  | 'execution.order'         // 订单
  | 'execution.fill'          // 成交
  | 'execution.cancel'        // 撤单
  | 'execution.reject'        // 拒绝
  
  // 投资组合事件
  | 'portfolio.update'        // 持仓更新
  | 'portfolio.pnl'           // 盈亏
  
  // 账簿事件
  | 'ledger.record'           // 账簿记录
  | 'ledger.snapshot'         // 账簿快照
  
  // 控制事件
  | 'control'                 // 控制指令
  
  // 系统事件
  | 'system.deadletter'       // 死信
  | 'system.error'            // 系统错误
  | 'system.heartbeat';       // 心跳

/**
 * 基础事件接口
 */
export interface BaseEvent<TPayload = unknown> {
  /** 事件唯一ID */
  eventId: string;
  
  /** 事件类型 */
  eventType: EventType;
  
  /** 会话ID */
  sessionId: string;
  
  /** 序列ID（保证顺序） */
  sequenceId: string;
  
  /** 事件时间戳（ISO8601） */
  timestamp: string;
  
  /** 事件来源 */
  source: string;
  
  /** 事件载荷 */
  payload: TPayload;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
  
  /** 关联ID（用于追踪事件链路） */
  correlationId?: string;
  
  /** 因果ID（用于建立因果关系） */
  causationId?: string;
}

/**
 * 运行状态枚举
 */
export type RunStatus =
  | 'idle'              // 空闲
  | 'initializing'      // 初始化中
  | 'running'           // 运行中
  | 'paused'            // 已暂停
  | 'stopping'          // 停止中
  | 'stopped'           // 已停止
  | 'completed'         // 已完成
  | 'error';            // 错误状态

/**
 * 总线状态
 */
export interface BusState {
  /** 会话ID */
  sessionId: string;
  
  /** 运行状态 */
  status: RunStatus;
  
  /** 当前序列号 */
  currentSeq: string;
  
  /** 逻辑时间（回测时间） */
  logicalTime: string;
  
  /** 时钟模式 */
  clockMode: 'event' | 'wall';
  
  /** 正在处理的事件数 */
  inflight: number;
  
  /** 已处理事件总数 */
  processedCount: number;
  
  /** 最后检查点 */
  lastCheckpoint?: CheckpointMeta;
  
  /** 启动时间 */
  startedAt?: string;
  
  /** 暂停时间 */
  pausedAt?: string;
  
  /** 完成时间 */
  completedAt?: string;
}

/**
 * 控制事件类型
 */
export type ControlEventType =
  | 'START'         // 开始
  | 'PAUSE'         // 暂停
  | 'RESUME'        // 恢复
  | 'STOP'          // 停止
  | 'SNAPSHOT'      // 快照
  | 'SEEK';         // 跳转

/**
 * 控制事件
 */
export interface ControlEvent {
  /** 控制类型 */
  type: ControlEventType;
  
  /** 会话ID */
  sessionId: string;
  
  /** 载荷 */
  payload?: {
    /** 目标序列号（SEEK时使用） */
    sequenceId?: string;
    
    /** 目标时间戳（SEEK时使用） */
    timestamp?: string;
    
    /** 原因说明 */
    reason?: string;
    
    /** 额外参数 */
    [key: string]: unknown;
  };
}

/**
 * 订阅选项
 */
export interface SubscriptionOptions {
  /** 订阅优先级（数字越大优先级越高） */
  priority?: number;
  
  /** 并发处理数 */
  concurrency?: number;
  
  /** 重试策略 */
  retryPolicy?: RetryPolicy;
  
  /** 订阅名称（用于日志和调试） */
  name?: string;
  
  /** 是否持久化订阅 */
  durable?: boolean;
}

/**
 * 重试策略
 */
export interface RetryPolicy {
  /** 最大重试次数 */
  maxRetries: number;
  
  /** 初始延迟（毫秒） */
  initialDelay: number;
  
  /** 最大延迟（毫秒） */
  maxDelay: number;
  
  /** 退避因子 */
  backoffFactor: number;
  
  /** 可重试的错误类型 */
  retryableErrors?: string[];
}

/**
 * 死信事件
 */
export interface DeadLetterEvent {
  /** 原始事件 */
  originalEvent: BaseEvent;
  
  /** 错误信息 */
  error: SerializedError;
  
  /** 失败时间 */
  failedAt: string;
  
  /** 重试次数 */
  retryCount: number;
  
  /** 订阅名称 */
  subscription?: string;
}

/**
 * 序列化错误
 */
export interface SerializedError {
  /** 错误名称 */
  name: string;
  
  /** 错误消息 */
  message: string;
  
  /** 堆栈跟踪 */
  stack?: string;
  
  /** 错误代码 */
  code?: string;
  
  /** 额外信息 */
  details?: Record<string, unknown>;
}

/**
 * 总线指标
 */
export interface BusMetrics {
  /** 时间戳 */
  timestamp: string;
  
  /** 会话ID */
  sessionId: string;
  
  /** 每秒事件数 */
  eventsPerSecond: number;
  
  /** 正在处理的事件数 */
  inflight: number;
  
  /** 已处理事件总数 */
  totalProcessed: number;
  
  /** 死信事件数 */
  deadLetterCount: number;
  
  /** 订阅数量 */
  subscriptionCount: number;
  
  /** 按类型统计的事件数 */
  eventsByType: Record<EventType, number>;
  
  /** 平均处理延迟（毫秒） */
  avgProcessingLatency: number;
}

/**
 * 事件总线接口
 */
export interface EventBus {
  /**
   * 发布事件
   */
  publish<T = unknown>(event: BaseEvent<T>): void;
  
  /**
   * 订阅事件
   */
  subscribe<T = unknown>(
    eventType: EventType | EventType[],
    handler: (event: BaseEvent<T>) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Subscription;
  
  /**
   * 状态流（Observable）
   */
  readonly state$: Observable<BusState>;
  
  /**
   * 控制事件入口
   */
  control(event: ControlEvent): Promise<void>;
  
  /**
   * 死信队列流
   */
  readonly deadLetter$: Observable<DeadLetterEvent>;
  
  /**
   * 指标流
   */
  readonly metrics$: Observable<BusMetrics>;
  
  /**
   * 获取当前状态
   */
  getState(): BusState;
  
  /**
   * 等待所有事件处理完成
   */
  drain(): Promise<void>;
  
  /**
   * 关闭事件总线
   */
  close(): Promise<void>;
}

/**
 * 记录的事件（持久化格式）
 */
export interface RecordedEvent {
  /** 序列ID */
  sequenceId: string;
  
  /** 时间戳 */
  timestamp: string;
  
  /** 流ID（用于分区） */
  streamId: string;
  
  /** 事件载荷 */
  payload: BaseEvent;
  
  /** 处理状态 */
  status: 'pending' | 'processed' | 'skipped' | 'failed';
  
  /** 错误信息（如果失败） */
  error?: SerializedError;
  
  /** 处理时间 */
  processedAt?: string;
}

/**
 * 检查点元数据
 */
export interface CheckpointMeta {
  /** 检查点ID */
  checkpointId: string;
  
  /** 序列ID */
  sequenceId: string;
  
  /** 逻辑时间 */
  timestamp: string;
  
  /** 创建时间 */
  createdAt: string;
  
  /** 创建原因 */
  reason: 'auto' | 'manual' | 'pause' | 'error';
  
  /** 大小（字节） */
  sizeBytes?: number;
  
  /** 描述 */
  description?: string;
}

/**
 * 检查点快照
 */
export interface CheckpointSnapshot {
  /** 元数据 */
  meta: CheckpointMeta;
  
  /** 总线状态 */
  busState: BusState;
  
  /** 模块状态（各模块的状态快照） */
  moduleStates: Record<string, unknown>;
  
  /** 待处理事件缓冲区 */
  pendingEvents?: BaseEvent[];
}

/**
 * 事件存储接口
 */
export interface EventStore {
  /**
   * 追加事件
   */
  append(event: RecordedEvent): Promise<void>;
  
  /**
   * 从指定序列号开始读取
   */
  readFrom(sequenceId: string): AsyncIterable<RecordedEvent>;
  
  /**
   * 获取最新事件
   */
  latest(): Promise<RecordedEvent | undefined>;
  
  /**
   * 创建检查点
   */
  createCheckpoint(snapshot: CheckpointSnapshot): Promise<string>;
  
  /**
   * 加载检查点
   */
  loadCheckpoint(checkpointId: string): Promise<CheckpointSnapshot>;
  
  /**
   * 列出检查点
   */
  listCheckpoints(sessionId?: string): Promise<CheckpointMeta[]>;
  
  /**
   * 获取事件统计
   */
  getStats(): Promise<EventStoreStats>;
  
  /**
   * 清理旧数据
   */
  cleanup(olderThan: string): Promise<number>;
  
  /**
   * 关闭存储
   */
  close(): Promise<void>;
}

/**
 * 事件存储统计
 */
export interface EventStoreStats {
  /** 总事件数 */
  totalEvents: number;
  
  /** 总检查点数 */
  totalCheckpoints: number;
  
  /** 最早事件时间 */
  earliestEvent?: string;
  
  /** 最新事件时间 */
  latestEvent?: string;
  
  /** 存储大小（字节） */
  storageSizeBytes: number;
  
  /** 按类型统计 */
  eventsByType: Record<EventType, number>;
}

/**
 * 事件处理器（策略、风控、执行等模块实现）
 */
export interface EventHandler<TPayload = unknown> {
  /** 处理器名称 */
  readonly name: string;
  
  /** 订阅的事件类型 */
  readonly subscribedEvents: EventType[];
  
  /** 处理事件 */
  handle(event: BaseEvent<TPayload>): Promise<void> | void;
  
  /** 获取模块状态快照 */
  getSnapshot?(): Promise<unknown>;
  
  /** 恢复模块状态 */
  restoreSnapshot?(snapshot: unknown): Promise<void>;
}

/**
 * 事件过滤器
 */
export interface EventFilter {
  /** 事件类型 */
  eventType?: EventType | EventType[];
  
  /** 会话ID */
  sessionId?: string;
  
  /** 来源 */
  source?: string;
  
  /** 时间范围 */
  timeRange?: {
    start: string;
    end: string;
  };
  
  /** 序列范围 */
  sequenceRange?: {
    start: string;
    end: string;
  };
  
  /** 自定义谓词 */
  predicate?: (event: BaseEvent) => boolean;
}

