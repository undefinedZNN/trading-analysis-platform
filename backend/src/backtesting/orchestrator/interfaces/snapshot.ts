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
  
  /** 标签 */
  tags?: string[];
  
  /** 其他元数据 */
  metadata?: Record<string, unknown>;
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
export interface SessionSnapshot {
  /** 元数据 */
  meta: SnapshotMeta;
  
  /** 模块快照 */
  modules: {
    /** 策略快照 */
    strategy?: StrategySnapshot;
    
    /** 执行快照 */
    execution?: ExecutionSnapshot;
    
    /** 风控快照 */
    risk?: RiskSnapshot;
    
    /** 数据快照 */
    data?: DataSnapshot;
  };
  
  /** 事件存储检查点 */
  eventStoreCheckpoint: EventStoreCheckpoint;
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
  list(sessionId: string): Promise<SnapshotMeta[]>;
  
  /**
   * 检查快照是否存在
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 是否存在
   */
  exists(sessionId: string, checkpointId: string): Promise<boolean>;
  
  /**
   * 清理会话的所有快照
   * 
   * @param sessionId 会话ID
   * @returns 清理的快照数量
   */
  cleanup?(sessionId: string): Promise<number>;
  
  /**
   * 获取存储统计信息
   * 
   * @param sessionId 会话ID (可选)
   * @returns 统计信息
   */
  getStats?(sessionId?: string): Promise<{
    totalSnapshots: number;
    totalSize: number;
    oldestSnapshot?: string;
    newestSnapshot?: string;
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

/**
 * 快照协调器接口
 * 
 * 协调各模块的快照创建和恢复
 */
export interface SnapshotCoordinator {
  /**
   * 创建快照
   * 
   * @param sessionId 会话ID
   * @param reason 创建原因
   * @returns 检查点ID
   */
  createSnapshot(sessionId: string, reason?: string): Promise<string>;
  
  /**
   * 恢复快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns Promise
   */
  restoreSnapshot(sessionId: string, checkpointId: string): Promise<void>;
  
  /**
   * 列出快照
   * 
   * @param sessionId 会话ID
   * @returns 快照元数据列表
   */
  listSnapshots(sessionId: string): Promise<SnapshotMeta[]>;
  
  /**
   * 删除快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 是否成功
   */
  deleteSnapshot(sessionId: string, checkpointId: string): Promise<boolean>;
  
  /**
   * 验证快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 是否有效
   */
  validateSnapshot(sessionId: string, checkpointId: string): Promise<boolean>;
}

// ============================================================================
// 快照管理器配置
// ============================================================================

/**
 * 快照管理器配置
 */
export interface SnapshotManagerConfig {
  /** 存储根目录 */
  storageRoot: string;
  
  /** 是否启用压缩 */
  enableCompression?: boolean;
  
  /** 快照版本 */
  version?: string;
  
  /** 最大快照数量 */
  maxSnapshots?: number;
  
  /** 自动清理旧快照 */
  autoCleanup?: boolean;
  
  /** 增量快照支持 */
  incrementalSnapshot?: boolean;
}

// ============================================================================
// 快照异常
// ============================================================================

/**
 * 快照异常基类
 */
export class SnapshotError extends Error {
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
  cause?: Error;
  
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
  cause?: Error;
  
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
  cause?: Error;
  
  constructor(message: string, cause?: Error) {
    super(`Storage error: ${message}`);
    this.name = 'SnapshotStorageError';
    if (cause) {
      this.cause = cause;
    }
  }
}

