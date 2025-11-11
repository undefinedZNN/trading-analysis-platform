/**
 * 编排器接口定义
 * 
 * 定义编排器的核心接口，负责管理回测会话的完整生命周期
 * 
 * @module orchestrator/interfaces/orchestrator
 */

import type { Session } from './session';
import type { BacktestSessionConfig } from './config';
import type { ServiceContainer } from './container';
import type { SessionSnapshot } from './snapshot';
export type { SessionSnapshot } from './snapshot';
export { SnapshotNotFoundError } from './snapshot';

// ============================================================================
// 快照相关
// ============================================================================

/**
 * 检查点元数据
 */
export interface CheckpointMeta {
  /** 检查点ID */
  checkpointId: string;
  
  /** 会话ID */
  sessionId: string;
  
  /** 创建时间 */
  createdAt: number;
  
  /** 序列号 */
  sequenceId?: string;
  
  /** 原因 */
  reason?: string;
  
  /** 文件大小（字节） */
  size?: number;
  
  /** 其他元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 结果相关
// ============================================================================

/**
 * 会话结果
 */
export interface SessionResults {
  /** 会话ID */
  sessionId: string;
  
  /** 会话状态 */
  status: 'completed' | 'failed' | 'stopped';
  
  /** 开始时间 */
  startTime: number;
  
  /** 结束时间 */
  endTime: number;
  
  /** 持续时间（毫秒） */
  duration: number;
  
  /** 统计信息 */
  stats: {
    /** 已处理事件数 */
    processedEvents: number;
    
    /** 错误数 */
    errorCount: number;
    
    /** 其他统计 */
    [key: string]: unknown;
  };
  
  /** 交易记录 */
  trades?: unknown[];
  
  /** 性能指标 */
  metrics?: Record<string, unknown>;
  
  /** 错误信息（如果失败） */
  error?: string;
}

// ============================================================================
// 编排器接口
// ============================================================================

/**
 * 编排器接口
 * 
 * 负责管理所有回测会话的生命周期
 */
export interface Orchestrator {
  /**
   * 创建会话
   * 
   * @param config 会话配置
   * @returns 创建的会话
   */
  createSession(config: BacktestSessionConfig): Promise<Session>;
  
  /**
   * 获取会话
   * 
   * @param sessionId 会话ID
   * @returns 会话实例或 undefined
   */
  getSession(sessionId: string): Session | undefined;
  
  /**
   * 列出所有会话
   * 
   * @returns 会话列表
   */
  listSessions(): Session[];
  
  /**
   * 启动会话
   * 
   * @param sessionId 会话ID
   * @returns Promise
   */
  start(sessionId: string): Promise<void>;
  
  /**
   * 暂停会话
   * 
   * @param sessionId 会话ID
   * @returns Promise
   */
  pause(sessionId: string): Promise<void>;
  
  /**
   * 恢复会话
   * 
   * @param sessionId 会话ID
   * @returns Promise
   */
  resume(sessionId: string): Promise<void>;
  
  /**
   * 定位到指定序列号
   * 
   * @param sessionId 会话ID
   * @param sequenceId 序列号
   * @returns Promise
   */
  seek(sessionId: string, sequenceId: string): Promise<void>;
  
  /**
   * 停止会话
   * 
   * @param sessionId 会话ID
   * @param reason 停止原因
   * @returns Promise
   */
  stop(sessionId: string, reason?: string): Promise<void>;
  
  /**
   * 创建快照
   * 
   * @param sessionId 会话ID
   * @param reason 快照原因
   * @returns 快照ID
   */
  createSnapshot(sessionId: string, reason?: string): Promise<string>;
  
  /**
   * 列出快照
   * 
   * @param sessionId 会话ID
   * @returns 快照元数据列表
   */
  listSnapshots(sessionId: string): Promise<CheckpointMeta[]>;
  
  /**
   * 恢复快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 快照ID
   * @returns Promise
   */
  restoreSnapshot(sessionId: string, checkpointId: string): Promise<void>;
  
  /**
   * 获取结果
   * 
   * @param sessionId 会话ID
   * @returns 会话结果
   */
  getResults(sessionId: string): Promise<SessionResults>;
  
  /**
   * 销毁会话
   * 
   * @param sessionId 会话ID
   * @returns Promise
   */
  destroySession(sessionId: string): Promise<void>;
  
  /**
   * 销毁所有会话
   * 
   * @returns Promise
   */
  destroyAll(): Promise<void>;
}

// ============================================================================
// 模块协调器接口
// ============================================================================

/**
 * 模块协调器接口
 * 
 * 负责初始化和管理所有回测模块
 */
export interface ModuleCoordinator {
  /**
   * 初始化所有模块
   * 
   * @param container 服务容器
   * @param config 会话配置
   * @returns Promise
   */
  initializeModules(
    container: ServiceContainer,
    config: BacktestSessionConfig
  ): Promise<void>;
  
  /**
   * 获取模块状态
   * 
   * @param container 服务容器
   * @returns 模块状态
   */
  getModuleStates(container: ServiceContainer): Record<string, unknown>;
  
  /**
   * 恢复模块状态
   * 
   * @param container 服务容器
   * @param states 模块状态
   * @returns Promise
   */
  restoreModuleStates(
    container: ServiceContainer,
    states: Record<string, unknown>
  ): Promise<void>;
}

// ============================================================================
// 编排器异常
// ============================================================================

/**
 * 编排器异常基类
 */
export class OrchestratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrchestratorError';
  }
}

/**
 * 会话不存在异常
 */
export class SessionNotFoundError extends OrchestratorError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * 会话已存在异常
 */
export class SessionAlreadyExistsError extends OrchestratorError {
  constructor(sessionId: string) {
    super(`Session already exists: ${sessionId}`);
    this.name = 'SessionAlreadyExistsError';
  }
}
