/**
 * 会话实现
 * 
 * 实现回测会话的完整生命周期管理
 * 
 * @module orchestrator/session/session
 */

import type {
  Session,
  SessionState,
  SessionMetadata,
  SessionStats,
  SessionEvent,
  SessionEventType,
  StateChangedEventData,
} from '../interfaces/session';

import type { BacktestSessionConfig } from '../interfaces/config';
import type { ServiceContainer } from '../interfaces/container';

import {
  SessionError,
  SessionDestroyedError,
} from '../interfaces/session';

import { SessionStateMachine } from './session-state-machine';
import { SessionState as State } from '../interfaces/session';

// ============================================================================
// 事件发射器类型
// ============================================================================

type EventHandler = (event: SessionEvent) => void;

// ============================================================================
// 会话实现
// ============================================================================

/**
 * 默认会话实现
 */
export class DefaultSession implements Session {
  /** 会话ID */
  readonly id: string;
  
  /** 会话配置 */
  readonly config: BacktestSessionConfig;
  
  /** 服务容器 */
  readonly container: ServiceContainer;
  
  /** 状态机 */
  private stateMachine: SessionStateMachine;
  
  /** 会话元数据 */
  private _metadata: SessionMetadata;
  
  /** 事件处理器 */
  private eventHandlers: Map<SessionEventType, Set<EventHandler>> = new Map();
  
  /** 统计信息 */
  private stats: {
    processedEvents: number;
    errorCount: number;
  } = {
    processedEvents: 0,
    errorCount: 0,
  };
  
  /**
   * 构造函数
   * 
   * @param config 会话配置
   * @param container 服务容器
   */
  constructor(config: BacktestSessionConfig, container: ServiceContainer) {
    this.id = config.sessionId;
    this.config = config;
    this.container = container;
    this.stateMachine = new SessionStateMachine(State.Idle);
    
    this._metadata = {
      createdAt: Date.now(),
    };
    
    // 发布创建事件
    this.emitEvent({
      type: 'session.created' as SessionEventType,
      sessionId: this.id,
      timestamp: Date.now(),
    });
  }
  
  /**
   * 获取当前状态
   */
  get state(): SessionState {
    return this.stateMachine.getState();
  }
  
  /**
   * 获取会话元数据
   */
  get metadata(): SessionMetadata {
    return { ...this._metadata };
  }
  
  /**
   * 初始化会话
   */
  async initialize(): Promise<void> {
    this.checkNotDestroyed();
    
    // 转换到初始化状态
    this.transitionState(State.Initializing, 'Starting initialization');
    
    try {
      // TODO: 在这里初始化各个模块
      // 例如：初始化 DataProvider, EventBus, Strategy, Risk, Execution 等
      
      // 模拟初始化延迟
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 初始化成功，转换到运行状态
      this.transitionState(State.Running, 'Initialization completed');
      
      this._metadata.startedAt = Date.now();
      
      this.emitEvent({
        type: 'session.started' as SessionEventType,
        sessionId: this.id,
        timestamp: Date.now(),
      });
    } catch (error) {
      // 初始化失败
      this.transitionState(State.Failed, `Initialization failed: ${error}`);
      this._metadata.error = String(error);
      
      this.emitEvent({
        type: 'session.failed' as SessionEventType,
        sessionId: this.id,
        timestamp: Date.now(),
        data: { error: String(error) },
      });
      
      throw error;
    }
  }
  
  /**
   * 启动会话
   */
  async start(): Promise<void> {
    this.checkNotDestroyed();
    
    // 如果是 Idle 状态，先初始化
    if (this.state === State.Idle) {
      await this.initialize();
      return;
    }
    
    // 如果是 Paused 状态，恢复
    if (this.state === State.Paused) {
      await this.resume();
      return;
    }
    
    throw new SessionError(`Cannot start session in ${this.state} state`);
  }
  
  /**
   * 暂停会话
   */
  async pause(): Promise<void> {
    this.checkNotDestroyed();
    
    this.transitionState(State.Paused, 'Session paused by user');
    
    this.emitEvent({
      type: 'session.paused' as SessionEventType,
      sessionId: this.id,
      timestamp: Date.now(),
    });
  }
  
  /**
   * 恢复会话
   */
  async resume(): Promise<void> {
    this.checkNotDestroyed();
    
    this.transitionState(State.Running, 'Session resumed by user');
    
    this.emitEvent({
      type: 'session.resumed' as SessionEventType,
      sessionId: this.id,
      timestamp: Date.now(),
    });
  }
  
  /**
   * 停止会话
   */
  async stop(reason?: string): Promise<void> {
    this.checkNotDestroyed();
    
    this.transitionState(State.Stopped, reason || 'Session stopped by user');
    
    this.emitEvent({
      type: 'session.stopped' as SessionEventType,
      sessionId: this.id,
      timestamp: Date.now(),
      data: { reason },
    });
  }
  
  /**
   * 销毁会话
   */
  async destroy(): Promise<void> {
    if (this.state === State.Destroyed) {
      return; // 已经销毁，直接返回
    }
    
    this.transitionState(State.Destroyed, 'Session destroyed');
    
    // 计算持续时间
    if (this._metadata.startedAt) {
      this._metadata.completedAt = Date.now();
      this._metadata.duration = this._metadata.completedAt - this._metadata.startedAt;
    }
    
    this.emitEvent({
      type: 'session.destroyed' as SessionEventType,
      sessionId: this.id,
      timestamp: Date.now(),
    });
    
    // 清理资源
    this.eventHandlers.clear();
  }
  
  /**
   * 检查状态转换是否允许
   */
  canTransitionTo(toState: SessionState): boolean {
    return this.stateMachine.canTransitionTo(toState);
  }
  
  /**
   * 订阅会话事件
   */
  on(eventType: SessionEventType, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    
    this.eventHandlers.get(eventType)!.add(handler);
    
    // 返回取消订阅函数
    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }
  
  /**
   * 获取会话统计信息
   */
  getStats(): SessionStats {
    const uptime = this._metadata.startedAt
      ? Date.now() - this._metadata.startedAt
      : 0;
    
    return {
      sessionId: this.id,
      state: this.state,
      uptime,
      processedEvents: this.stats.processedEvents,
      errorCount: this.stats.errorCount,
    };
  }
  
  // ==========================================================================
  // 私有辅助方法
  // ==========================================================================
  
  /**
   * 转换状态
   */
  private transitionState(toState: SessionState, reason?: string): void {
    const previousState = this.state;
    
    this.stateMachine.transitionTo(toState, reason);
    
    // 发布状态改变事件
    const eventData: StateChangedEventData = {
      previousState,
      currentState: toState,
      reason,
    };
    
    this.emitEvent({
      type: 'session.state-changed' as SessionEventType,
      sessionId: this.id,
      timestamp: Date.now(),
      data: eventData,
    });
  }
  
  /**
   * 发布事件
   */
  private emitEvent(event: SessionEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${event.type}:`, error);
        }
      });
    }
  }
  
  /**
   * 检查会话是否已销毁
   */
  private checkNotDestroyed(): void {
    if (this.state === State.Destroyed) {
      throw new SessionDestroyedError(this.id);
    }
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建会话
 * 
 * @param config 会话配置
 * @param container 服务容器
 * @returns 会话实例
 */
export function createSession(
  config: BacktestSessionConfig,
  container: ServiceContainer
): Session {
  return new DefaultSession(config, container);
}

