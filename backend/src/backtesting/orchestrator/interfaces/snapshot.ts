/**
 * 快照接口定义
 * 
 * 定义快照的核心接口，支持跨模块的快照创建、存储和恢复
 * 
 * @module orchestrator/interfaces/snapshot
 */

// ============================================================================
// 快照元数据
// ============================================================================

/**
 * 快照元数据
 */
export interface SnapshotMeta {
  /** 会话ID */
  sessionId: string;
  
  /** 检查点ID */
  checkpointId: string;
  
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
  
  /** 会话状态 */
  status: string;
  
  /** 序列号 */
  sequenceId?: string;
  
  /** 创建原因 */
  reason?: string;
  
  /** 快照版本 */
  version: string;
  
  /** 快照大小（字节） */
  size?: number;
  
  /** 是否压缩 */
  compressed: boolean;
  
  /** 其他元数据 */
  metadata?: Record<string, unknown>;

  /** 标签集合 */
  tags?: string[];
}

// ============================================================================
// 模块快照
// ============================================================================

/**
 * 策略快照
 */
export interface StrategySnapshot {
  /** 策略ID */
  strategyId: string;
  
  /** 策略状态 */
  state: Record<string, unknown>;
  
  /** 内部变量 */
  variables?: Record<string, unknown>;
  
  /** 持仓信息 */
  positions?: unknown[];
  
  /** 其他数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 执行快照
 */
export interface ExecutionSnapshot {
  /** 活动订单 */
  activeOrders: unknown[];
  
  /** 订单历史 */
  orderHistory?: unknown[];
  
  /** 成交记录 */
  fills?: unknown[];
  
  /** 执行状态 */
  state: Record<string, unknown>;
  
  /** 其他数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 风控快照
 */
export interface RiskSnapshot {
  /** 风控状态 */
  state: Record<string, unknown>;
  
  /** 规则状态 */
  ruleStates?: Record<string, unknown>;
  
  /** 风控指标 */
  metrics?: Record<string, unknown>;
  
  /** 其他数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 数据快照
 */
export interface DataSnapshot {
  /** 数据游标 */
  cursor?: unknown;
  
  /** 缓存数据 */
  cache?: unknown;
  
  /** 数据状态 */
  state?: Record<string, unknown>;
  
  /** 其他数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 事件存储检查点
 */
export interface EventStoreCheckpoint {
  /** 最后序列号 */
  lastSequenceId: string;
  
  /** 已处理事件数 */
  processedCount: number;
  
  /** 最后处理的事件时间戳 */
  lastTimestamp?: number;
  
  /** 总线状态 */
  busState?: Record<string, unknown>;
  
  /** 其他数据 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 会话快照
// ============================================================================

/**
 * 会话快照
 * 
 * 包含所有模块的快照数据
 */
export interface ModuleSnapshot {
  /** 模块状态数据 */
  state: unknown;
  /** 状态捕获时间 */
  timestamp?: number;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

export interface SessionSnapshot {
  /** 元数据 */
  meta: SnapshotMeta;
  
  /** 模块快照（按模块名称索引） */
  modules: Record<string, ModuleSnapshot>;
  
  /** 事件存储检查点 */
  eventStoreCheckpoint: EventStoreCheckpoint;
}

/**
 * 快照列表查询选项
 */
export interface SnapshotListOptions {
  limit?: number;
  sortBy?: 'createdAt' | 'checkpointId';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// 快照存储接口
// ============================================================================

/**
 * 快照存储接口
 */
export interface SnapshotStorage {
  /**
   * 保存快照
   * 
   * @param snapshot 快照数据
   * @returns 保存的文件路径
   */
  save(snapshot: SessionSnapshot): Promise<string>;
  
  /**
   * 加载快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 快照数据
   */
  load(sessionId: string, checkpointId: string): Promise<SessionSnapshot>;
  
  /**
   * 删除快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 是否成功
   */
  delete(sessionId: string, checkpointId: string): Promise<boolean>;
  
  /**
   * 列出快照
   * 
   * @param sessionId 会话ID
   * @returns 快照元数据列表
   */
  list(sessionId: string, options?: SnapshotListOptions): Promise<SnapshotMeta[]>;
  
  /**
   * 检查快照是否存在
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 是否存在
   */
  exists(sessionId: string, checkpointId: string): Promise<boolean>;

  /**
   * 清理会话快照
   */
  cleanup(sessionId: string): Promise<void>;

  /**
   * 获取存储统计
   */
  getStats(sessionId: string): Promise<{
    count: number;
    totalSize: number;
    oldestSnapshot?: SnapshotMeta;
    newestSnapshot?: SnapshotMeta;
  }>;
}

// ============================================================================
// 快照序列化器接口
// ============================================================================

/**
 * 快照序列化器接口
 */
export interface SnapshotSerializer {
  /**
   * 序列化快照
   * 
   * @param snapshot 快照数据
   * @returns 序列化后的字符串
   */
  serialize(snapshot: SessionSnapshot): string;
  
  /**
   * 反序列化快照
   * 
   * @param data 序列化的字符串
   * @returns 快照数据
   */
  deserialize(data: string): SessionSnapshot;
  
  /**
   * 压缩数据
   * 
   * @param data 原始数据
   * @returns 压缩后的数据
   */
  compress?(data: string): Promise<Buffer> | Buffer;
  
  /**
   * 解压缩数据
   * 
   * @param data 压缩的数据
   * @returns 原始数据
   */
  decompress?(data: Buffer): Promise<string> | string;
}

// ============================================================================
// 快照协调器接口
// ============================================================================

// ============================================================================
// 快照管理器配置
// ============================================================================

/**
 * 快照管理器配置
 */
export interface SnapshotManagerConfig {
  /** 存储引擎 */
  storage: SnapshotStorage;
  
  /** 快照版本 */
  version?: string;
  
  /** 版本管理配置 */
  versionConfig?: {
    maxSnapshots?: number;
    minSnapshots?: number;
    expirationMs?: number;
    cleanupStrategy?: 'oldest' | 'least-used' | 'size-based';
  };
  
  /** 是否自动清理 */
  autoCleanup?: boolean;
  
  /** 是否启用增量快照 */
  incrementalSnapshot?: boolean;
}

// ============================================================================
// 快照异常
// ============================================================================

/**
 * 快照异常基类
 */
export class SnapshotError extends Error {
  public cause?: Error;

  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/**
 * 快照不存在异常
 */
export class SnapshotNotFoundError extends SnapshotError {
  constructor(sessionId: string, checkpointId: string) {
    super(`Snapshot not found: ${sessionId}/${checkpointId}`);
    this.name = 'SnapshotNotFoundError';
  }
}

/**
 * 快照已存在异常
 */
export class SnapshotAlreadyExistsError extends SnapshotError {
  constructor(sessionId: string, checkpointId: string) {
    super(`Snapshot already exists: ${sessionId}/${checkpointId}`);
    this.name = 'SnapshotAlreadyExistsError';
  }
}

/**
 * 快照序列化异常
 */
export class SnapshotSerializationError extends SnapshotError {
  constructor(message: string, cause?: Error) {
    super(`Serialization error: ${message}`);
    this.name = 'SnapshotSerializationError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * 快照恢复异常
 */
export class SnapshotRestoreError extends SnapshotError {
  constructor(message: string, cause?: Error) {
    super(`Restore error: ${message}`);
    this.name = 'SnapshotRestoreError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * 快照存储错误
 */
export class SnapshotStorageError extends SnapshotError {
  constructor(message: string, cause?: Error) {
    super(`Storage error: ${message}`);
    this.name = 'SnapshotStorageError';
    if (cause) {
      this.cause = cause;
    }
  }
}
