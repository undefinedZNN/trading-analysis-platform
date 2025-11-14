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
  ProgressUpdatedEventData,
} from '../interfaces/session';

import type { BacktestSessionConfig } from '../interfaces/config';
import type { ServiceContainer } from '../interfaces/container';
import { ServiceTokens } from '../container/tokens';

import {
  SessionError,
  SessionDestroyedError,
} from '../interfaces/session';

import { SessionStateMachine } from './session-state-machine';
import { SessionState as State } from '../interfaces/session';
import { EventReplay } from '../../events/replay';
import type { BarEvent } from '../../data/timeframe/interfaces';
import { lastValueFrom } from 'rxjs';

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
  
  /** 事件重放器 */
  private eventReplay: EventReplay | null = null;
  
  /** 数据加载订阅 */
  private dataSubscription: any = null;
  
  /** 是否正在执行 */
  private isExecuting: boolean = false;
  
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
   * 兼容旧接口的方法形式
   */
  getState(): SessionState {
    return this.state;
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
      // 模块已经在 createSession 时通过 moduleCoordinator.initializeModules() 初始化了
      // 这里只需要启动数据加载和事件重放
      
      // 初始化成功，转换到运行状态
      this.transitionState(State.Running, 'Initialization completed');
      
      this._metadata.startedAt = Date.now();
      
      this.emitEvent({
        type: 'session.started' as SessionEventType,
        sessionId: this.id,
        timestamp: Date.now(),
      });
      
      // 启动数据加载和事件重放（异步执行，不阻塞）
      this.startExecution().catch((error) => {
        console.error(`[Session ${this.id}] Execution failed:`, error);
        this.transitionState(State.Failed, `Execution failed: ${error}`);
        this._metadata.error = String(error);
        
        this.emitEvent({
          type: 'session.failed' as SessionEventType,
          sessionId: this.id,
          timestamp: Date.now(),
          data: { error: String(error) },
        });
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
   * 启动执行（数据加载和事件重放）
   */
  private async startExecution(): Promise<void> {
    if (this.isExecuting) {
      return; // 已经在执行中
    }
    
    this.isExecuting = true;
    
    try {
      // 1. 获取服务
      const dataProvider = this.container.tryResolve(ServiceTokens.DataProvider) as any;
      const eventBus = this.container.tryResolve(ServiceTokens.EventBus) as any;
      const eventStore = this.container.tryResolve(ServiceTokens.EventStore) as any;
      
      if (!dataProvider || !eventBus || !eventStore) {
        throw new Error('Required services not found in container');
      }
      
      // 2. 启动 EventBus
      if (typeof eventBus.start === 'function') {
        eventBus.start();
      }
      
      // 3. 从 DataProvider 加载数据并发布到 EventBus
      const dataConfig = this.config.data;
      if (!dataConfig?.source) {
        throw new Error('Data source configuration is missing');
      }
      
      const { source, timeframe } = dataConfig;
      const symbol = source.symbols?.[0] || 'UNKNOWN';
      const startTime = source.timeRange?.start || '';
      const endTime = source.timeRange?.end || '';
      
      // 使用数据集的原始 granularity 作为 baseTimeframe
      // timeframe.primary 可能是重采样后的时间周期（如 5m），但数据加载必须使用原始数据的时间周期（如 1s）
      // 优先使用 source.baseGranularity，如果没有则从路径推断，最后使用默认值
      let baseTimeframe = (source as any)?.baseGranularity;
      
      if (!baseTimeframe) {
        // 从路径推断：路径格式为 .../ES-最新/ES/1s，最后一部分是 granularity
        const pathParts = source.path.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        // 检查是否是时间周期格式（如 1s, 5m, 1h）
        if (lastPart && /^\d+[smhd]$/.test(lastPart)) {
          baseTimeframe = lastPart;
        } else {
          // 如果路径格式不对，使用默认值
          baseTimeframe = timeframe?.primary || '1m';
        }
      }
      
      console.log(`[Session ${this.id}] Starting data fetch:`, {
        symbol,
        startTime,
        endTime,
        baseTimeframe,
        configuredTimeframe: timeframe?.primary,
      });
      
      // 4. 确保 EventBus 有订阅者（否则事件不会被处理）
      // 订阅所有事件以确保管道激活
      const eventSubscription = eventBus.subscribe('market.bar').subscribe(() => {
        // 事件会被自动处理
      });
      
      // 5. 订阅数据流并发布到 EventBus
      let processedBars = 0;
      let lastProgressUpdate = 0;
      const PROGRESS_UPDATE_INTERVAL = 100; // 每100条更新一次进度
      
      const barEvents$ = dataProvider.fetch({
        symbol,
        start: startTime,
        end: endTime,
        baseTimeframe,
        gapPolicy: source.gapPolicy || 'fill',
      });
      
      // 订阅数据流
      this.dataSubscription = barEvents$.subscribe({
        next: (bar: BarEvent) => {
          // 将 BarEvent 转换为 EventBus 事件
          if (typeof eventBus.publish === 'function') {
            eventBus.publish({
              type: 'market.bar',
              eventId: `bar-${bar.sequenceId}`,
              timestamp: new Date(bar.timestamp).getTime(),
              sequenceId: bar.sequenceId,
              payload: {
                symbol: bar.symbol,
                timeframe: bar.timeframe,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume,
                features: bar.features,
              },
            });
          }
          
          processedBars++;
          this.stats.processedEvents++;
          
          // 定期发送进度更新（每处理 N 条记录）
          if (processedBars - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
            lastProgressUpdate = processedBars;
            
            // 使用线性进度估算（假设数据加载占 90%，剩余 10% 用于处理）
            // 实际进度会在完成时更新为 100%
            const estimatedProgress = Math.min(0.90, processedBars / (processedBars + 1000));
            
            this.emitEvent({
              type: 'session.progress-updated' as SessionEventType,
              sessionId: this.id,
              timestamp: Date.now(),
              data: {
                progress: estimatedProgress,
                processedEvents: processedBars,
                totalEvents: undefined,
                message: `Processed ${processedBars} bars`,
              } as ProgressUpdatedEventData,
            });
          }
        },
        error: (error: Error) => {
          console.error(`[Session ${this.id}] Data loading error:`, error);
          this.transitionState(State.Failed, `Data loading failed: ${error.message}`);
          this._metadata.error = error.message;
          
          this.emitEvent({
            type: 'session.failed' as SessionEventType,
            sessionId: this.id,
            timestamp: Date.now(),
            data: { error: error.message },
          });
        },
        complete: () => {
          console.log(`[Session ${this.id}] Data loading completed, processed ${processedBars} bars`);
          
          // 取消事件订阅
          if (eventSubscription) {
            eventSubscription.unsubscribe();
          }
          
          // 数据加载完成，等待 EventBus 处理完所有事件
          setTimeout(() => {
            // 发送最终进度
            this.emitEvent({
              type: 'session.progress-updated' as SessionEventType,
              sessionId: this.id,
              timestamp: Date.now(),
              data: {
                progress: 1.0,
                processedEvents: processedBars,
                totalEvents: processedBars,
                message: 'Backtest execution completed',
              } as ProgressUpdatedEventData,
            });
            
            // 标记为完成
            this.transitionState(State.Completed, 'Backtest execution completed');
            this._metadata.completedAt = Date.now();
            
            this.emitEvent({
              type: 'session.completed' as SessionEventType,
              sessionId: this.id,
              timestamp: Date.now(),
            });
            
            this.isExecuting = false;
          }, 1000);
        },
      });
      
    } catch (error) {
      this.isExecuting = false;
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
