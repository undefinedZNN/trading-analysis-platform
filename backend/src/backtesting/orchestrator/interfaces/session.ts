/**
 * 会话接口定义
 * 
 * 定义回测会话的状态、生命周期和管理接口
 * 
 * @module orchestrator/interfaces/session
 */

import type { BacktestSessionConfig } from './config';
import type { ServiceContainer } from './container';

// ============================================================================
// 会话状态
// ============================================================================

/**
 * 会话状态枚举
 */
export enum SessionState {
  /** 空闲 - 会话已创建但未启动 */
  Idle = 'idle',
  
  /** 初始化中 - 正在初始化模块 */
  Initializing = 'initializing',
  
  /** 运行中 - 回测正在执行 */
  Running = 'running',
  
  /** 已暂停 - 回测已暂停 */
  Paused = 'paused',
  
  /** 已停止 - 回测已停止（可以恢复） */
  Stopped = 'stopped',
  
  /** 已完成 - 回测正常完成 */
  Completed = 'completed',
  
  /** 失败 - 回测因错误而失败 */
  Failed = 'failed',
  
  /** 已销毁 - 会话已被销毁 */
  Destroyed = 'destroyed',
}

// ============================================================================
// 状态转换
// ============================================================================

/**
 * 允许的状态转换
 */
export const ALLOWED_STATE_TRANSITIONS: Record<SessionState, SessionState[]> = {
  [SessionState.Idle]: [
    SessionState.Initializing,
    SessionState.Destroyed,
  ],
  [SessionState.Initializing]: [
    SessionState.Running,
    SessionState.Failed,
    SessionState.Destroyed,
  ],
  [SessionState.Running]: [
    SessionState.Paused,
    SessionState.Stopped,
    SessionState.Completed,
    SessionState.Failed,
    SessionState.Destroyed,
  ],
  [SessionState.Paused]: [
    SessionState.Running,
    SessionState.Stopped,
    SessionState.Destroyed,
  ],
  [SessionState.Stopped]: [
    SessionState.Initializing,  // 可以重新初始化
    SessionState.Destroyed,
  ],
  [SessionState.Completed]: [
    SessionState.Destroyed,
  ],
  [SessionState.Failed]: [
    SessionState.Destroyed,
  ],
  [SessionState.Destroyed]: [],  // 终态，不允许任何转换
};

// ============================================================================
// 会话事件
// ============================================================================

/**
 * 会话事件类型
 */
export enum SessionEventType {
  /** 会话已创建 */
  Created = 'session.created',
  
  /** 状态已改变 */
  StateChanged = 'session.state-changed',
  
  /** 会话已启动 */
  Started = 'session.started',
  
  /** 会话已暂停 */
  Paused = 'session.paused',
  
  /** 会话已恢复 */
  Resumed = 'session.resumed',
  
  /** 会话已停止 */
  Stopped = 'session.stopped',
  
  /** 会话已完成 */
  Completed = 'session.completed',
  
  /** 会话失败 */
  Failed = 'session.failed',
  
  /** 会话已销毁 */
  Destroyed = 'session.destroyed',
  
  /** 进度更新 */
  ProgressUpdated = 'session.progress-updated',
}

/**
 * 会话事件
 */
export interface SessionEvent {
  /** 事件类型 */
  type: SessionEventType;
  
  /** 会话ID */
  sessionId: string;
  
  /** 时间戳 */
  timestamp: number;
  
  /** 事件数据 */
  data?: unknown;
}

/**
 * 状态改变事件数据
 */
export interface StateChangedEventData {
  /** 之前的状态 */
  previousState: SessionState;
  
  /** 当前状态 */
  currentState: SessionState;
  
  /** 原因 */
  reason?: string;
}

/**
 * 进度更新事件数据
 */
export interface ProgressUpdatedEventData {
  /** 当前进度 (0-1) */
  progress: number;
  
  /** 已处理的事件数 */
  processedEvents: number;
  
  /** 总事件数 */
  totalEvents?: number;
  
  /** 消息 */
  message?: string;
}

// ============================================================================
// 会话元数据
// ============================================================================

/**
 * 会话元数据
 */
export interface SessionMetadata {
  /** 创建时间 */
  createdAt: number;
  
  /** 启动时间 */
  startedAt?: number;
  
  /** 完成时间 */
  completedAt?: number;
  
  /** 持续时间（毫秒） */
  duration?: number;
  
  /** 错误信息（如果失败） */
  error?: string;
  
  /** 其他元数据 */
  [key: string]: unknown;
}

// ============================================================================
// 会话接口
// ============================================================================

/**
 * 回测会话接口
 */
export interface Session {
  /** 会话ID */
  readonly id: string;
  
  /** 会话配置 */
  readonly config: BacktestSessionConfig;
  
  /** 服务容器 */
  readonly container: ServiceContainer;
  
  /** 当前状态 */
  readonly state: SessionState;

  /**
   * 获取当前状态（兼容旧接口）
   */
  getState(): SessionState;
  
  /** 会话元数据 */
  readonly metadata: SessionMetadata;
  
  /**
   * 初始化会话
   * 
   * @returns Promise
   */
  initialize(): Promise<void>;
  
  /**
   * 启动会话
   * 
   * @returns Promise
   */
  start(): Promise<void>;
  
  /**
   * 暂停会话
   * 
   * @returns Promise
   */
  pause(): Promise<void>;
  
  /**
   * 恢复会话
   * 
   * @returns Promise
   */
  resume(): Promise<void>;
  
  /**
   * 停止会话
   * 
   * @param reason 停止原因
   * @returns Promise
   */
  stop(reason?: string): Promise<void>;
  
  /**
   * 销毁会话
   * 
   * @returns Promise
   */
  destroy(): Promise<void>;
  
  /**
   * 检查状态转换是否允许
   * 
   * @param toState 目标状态
   * @returns 是否允许
   */
  canTransitionTo(toState: SessionState): boolean;
  
  /**
   * 订阅会话事件
   * 
   * @param eventType 事件类型
   * @param handler 事件处理器
   * @returns 取消订阅函数
   */
  on(eventType: SessionEventType, handler: (event: SessionEvent) => void): () => void;
  
  /**
   * 获取会话统计信息
   * 
   * @returns 统计信息
   */
  getStats(): SessionStats;
}

/**
 * 会话统计信息
 */
export interface SessionStats {
  /** 会话ID */
  sessionId: string;
  
  /** 当前状态 */
  state: SessionState;
  
  /** 运行时长（毫秒） */
  uptime: number;
  
  /** 已处理事件数 */
  processedEvents: number;
  
  /** 错误数 */
  errorCount: number;
  
  /** 其他统计 */
  [key: string]: unknown;
}

// ============================================================================
// 会话异常
// ============================================================================

/**
 * 会话异常基类
 */
export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

/**
 * 非法状态转换异常
 */
export class InvalidStateTransitionError extends SessionError {
  constructor(from: SessionState, to: SessionState) {
    super(`Invalid state transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * 会话未初始化异常
 */
export class SessionNotInitializedError extends SessionError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} is not initialized`);
    this.name = 'SessionNotInitializedError';
  }
}

/**
 * 会话已销毁异常
 */
export class SessionDestroyedError extends SessionError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} has been destroyed`);
    this.name = 'SessionDestroyedError';
  }
}
