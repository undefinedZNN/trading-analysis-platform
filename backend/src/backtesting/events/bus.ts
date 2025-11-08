/**
 * EventBus 核心实现
 * 
 * 职责：
 * 1. 事件路由：发布/订阅机制
 * 2. 背压控制：缓冲区管理
 * 3. 状态管理：运行状态控制
 * 4. 控制事件：START/PAUSE/RESUME/STOP
 * 5. 死信队列：错误处理
 * 
 * @module EventBus
 */

import { Subject, Observable, BehaviorSubject, merge, EMPTY } from 'rxjs';
import {
  filter,
  tap,
  catchError,
  bufferTime,
  mergeMap,
  share,
  takeUntil,
} from 'rxjs/operators';
import type {
  EventBus as IEventBus,
  EventStore,
  BaseEvent,
  EventType,
  RunStatus,
  BusState,
  ControlEvent,
  SubscriptionOptions,
  RetryPolicy,
  DeadLetterEvent,
  BusMetrics,
} from './interfaces';
import { BusStateMachine } from './state-machine';

/**
 * EventBus 配置选项
 */
export interface EventBusConfig {
  /**
   * 缓冲区大小（默认 10000）
   */
  bufferSize?: number;

  /**
   * 背压阈值百分比（默认 0.8）
   */
  backpressureThreshold?: number;

  /**
   * 批处理窗口时间（毫秒，默认 50）
   */
  batchWindowMs?: number;

  /**
   * 是否启用死信队列（默认 true）
   */
  enableDeadLetter?: boolean;

  /**
   * 默认重试策略
   */
  defaultRetryPolicy?: RetryPolicy;
}

/**
 * EventBus 核心实现
 */
export class EventBus implements IEventBus {
  // === 核心 Subjects ===
  private readonly eventSubject: Subject<BaseEvent>;
  private readonly controlSubject: Subject<ControlEvent>;
  private readonly stateSubject: BehaviorSubject<BusState>;
  private readonly deadLetterSubject: Subject<DeadLetterEvent>;
  private readonly destroySubject: Subject<void>;

  // === 状态管理 ===
  private readonly stateMachine: BusStateMachine;
  private readonly store: EventStore;
  private readonly config: Required<EventBusConfig>;

  // === 运行时数据 ===
  private eventCount: number;
  private errorCount: number;
  private deadLetterCount: number;
  private lastEventTime: number | null;
  private startTime: number | null;

  // === 公开的 Observables ===
  public readonly event$: Observable<BaseEvent>;
  public readonly control$: Observable<ControlEvent>;
  public readonly state$: Observable<BusState>;
  public readonly deadLetter$: Observable<DeadLetterEvent>;

  constructor(store: EventStore, config: EventBusConfig = {}) {
    // 初始化配置
    this.config = {
      bufferSize: config.bufferSize ?? 10000,
      backpressureThreshold: config.backpressureThreshold ?? 0.8,
      batchWindowMs: config.batchWindowMs ?? 50,
      enableDeadLetter: config.enableDeadLetter ?? true,
      defaultRetryPolicy: config.defaultRetryPolicy ?? {
        maxRetries: 3,
        retryDelayMs: 100,
        backoffMultiplier: 2,
      },
    };

    // 初始化 Subjects
    this.eventSubject = new Subject<BaseEvent>();
    this.controlSubject = new Subject<ControlEvent>();
    this.deadLetterSubject = new Subject<DeadLetterEvent>();
    this.destroySubject = new Subject<void>();

    // 初始化状态
    this.stateMachine = new BusStateMachine();
    this.store = store;
    this.eventCount = 0;
    this.errorCount = 0;
    this.deadLetterCount = 0;
    this.lastEventTime = null;
    this.startTime = null;

    // 初始化 state subject
    this.stateSubject = new BehaviorSubject<BusState>({
      status: this.stateMachine.getStatus(),
      eventCount: 0,
      errorCount: 0,
      bufferUsage: 0,
      backpressure: false,
    });

    // 设置事件流管道
    this.event$ = this.createEventPipeline();
    this.control$ = this.createControlPipeline();
    this.state$ = this.stateSubject.asObservable();
    this.deadLetter$ = this.deadLetterSubject.asObservable();

    // 启动控制事件处理
    this.setupControlHandler();
  }

  /**
   * 创建事件处理管道
   */
  private createEventPipeline(): Observable<BaseEvent> {
    return this.eventSubject.pipe(
      // 检查是否处于运行状态
      filter(() => this.stateMachine.getStatus() === 'running'),

      // 记录事件到 store
      tap((event) => this.recordEvent(event)),

      // 更新统计
      tap(() => this.updateMetrics()),

      // 检查背压
      tap(() => this.checkBackpressure()),

      // 错误处理
      catchError((error, caught) => {
        this.handleEventError(error);
        return caught; // 继续流
      }),

      // 在销毁时停止
      takeUntil(this.destroySubject),

      // 共享给所有订阅者
      share()
    );
  }

  /**
   * 创建控制事件管道
   */
  private createControlPipeline(): Observable<ControlEvent> {
    return this.controlSubject.pipe(
      tap((controlEvent) => {
        console.log(`[EventBus] Control event: ${controlEvent.type}`);
      }),
      takeUntil(this.destroySubject),
      share()
    );
  }

  /**
   * 设置控制事件处理器
   */
  private setupControlHandler(): void {
    this.control$.subscribe({
      next: (controlEvent) => {
        this.handleControlEvent(controlEvent);
      },
      error: (error) => {
        console.error('[EventBus] Control handler error:', error);
      },
    });
  }

  /**
   * 处理控制事件
   */
  private handleControlEvent(controlEvent: ControlEvent): void {
    const { type, payload } = controlEvent;

    switch (type) {
      case 'START':
        this.start();
        break;

      case 'PAUSE':
        this.pause();
        break;

      case 'RESUME':
        this.resume();
        break;

      case 'STOP':
        this.stop();
        break;

      case 'RESET':
        this.reset();
        break;

      case 'CHECKPOINT':
        if (payload?.checkpointId) {
          this.checkpoint(payload.checkpointId);
        }
        break;

      case 'SEEK':
        if (payload?.eventId !== undefined) {
          this.seek(payload.eventId);
        }
        break;

      default:
        console.warn(`[EventBus] Unknown control event type: ${type}`);
    }
  }

  /**
   * 记录事件到 store
   */
  private recordEvent(event: BaseEvent): void {
    try {
      this.store.append(event);
      this.eventCount++;
      this.lastEventTime = Date.now();
    } catch (error) {
      console.error('[EventBus] Failed to record event:', error);
      this.errorCount++;
    }
  }

  /**
   * 更新度量统计
   */
  private updateMetrics(): void {
    const bufferUsage = this.eventCount / this.config.bufferSize;
    const backpressure = bufferUsage >= this.config.backpressureThreshold;

    this.stateSubject.next({
      status: this.stateMachine.getStatus(),
      eventCount: this.eventCount,
      errorCount: this.errorCount,
      bufferUsage,
      backpressure,
    });
  }

  /**
   * 检查背压
   */
  private checkBackpressure(): void {
    const bufferUsage = this.eventCount / this.config.bufferSize;

    if (bufferUsage >= this.config.backpressureThreshold) {
      console.warn(
        `[EventBus] Backpressure detected: ${(bufferUsage * 100).toFixed(1)}% buffer usage`
      );

      // 发出背压控制事件
      this.controlSubject.next({
        type: 'PAUSE',
        timestamp: Date.now(),
        payload: { reason: 'backpressure' },
      });
    }
  }

  /**
   * 处理事件错误
   */
  private handleEventError(error: any): void {
    this.errorCount++;

    if (this.config.enableDeadLetter) {
      const deadLetterEvent: DeadLetterEvent = {
        originalEvent: error.event || {},
        error: error.message || String(error),
        timestamp: Date.now(),
        retryCount: error.retryCount || 0,
      };

      this.deadLetterSubject.next(deadLetterEvent);
      this.deadLetterCount++;
    }

    console.error('[EventBus] Event processing error:', error);
  }

  // === 公开 API ===

  /**
   * 发布事件
   */
  publish(event: BaseEvent): void {
    if (this.stateMachine.getStatus() === 'stopped') {
      throw new Error('Cannot publish event: EventBus is stopped');
    }

    this.eventSubject.next(event);
  }

  /**
   * 订阅事件
   */
  subscribe(
    eventType: EventType | EventType[],
    options: SubscriptionOptions = {}
  ): Observable<BaseEvent> {
    const types = Array.isArray(eventType) ? eventType : [eventType];

    return this.event$.pipe(
      filter((event) => types.includes(event.type)),
      options.predicate ? filter(options.predicate) : tap(),
      options.batchSize
        ? bufferTime(this.config.batchWindowMs, undefined, options.batchSize)
        : tap(),
      options.batchSize ? mergeMap((batch) => batch) : tap()
    );
  }

  /**
   * 启动事件总线
   */
  start(): void {
    if (this.stateMachine.canTransition('start')) {
      this.stateMachine.transition('start');
      this.startTime = Date.now();

      console.log('[EventBus] Started');

      this.updateMetrics();
    }
  }

  /**
   * 暂停事件总线
   */
  pause(): void {
    if (this.stateMachine.canTransition('pause')) {
      this.stateMachine.transition('pause');

      console.log('[EventBus] Paused');

      this.updateMetrics();
    }
  }

  /**
   * 恢复事件总线
   */
  resume(): void {
    if (this.stateMachine.canTransition('resume')) {
      this.stateMachine.transition('resume');

      console.log('[EventBus] Resumed');

      this.updateMetrics();
    }
  }

  /**
   * 停止事件总线
   */
  stop(): void {
    if (this.stateMachine.canTransition('stop')) {
      this.stateMachine.transition('stop');

      console.log('[EventBus] Stopped');

      this.updateMetrics();
    }
  }

  /**
   * 重置事件总线
   */
  reset(): void {
    if (this.stateMachine.canTransition('reset')) {
      this.stateMachine.transition('reset');

      // 清空统计
      this.eventCount = 0;
      this.errorCount = 0;
      this.deadLetterCount = 0;
      this.lastEventTime = null;
      this.startTime = null;

      // 清空 store
      this.store.clear();

      console.log('[EventBus] Reset');

      this.updateMetrics();
    }
  }

  /**
   * 创建检查点
   */
  checkpoint(id: string): void {
    try {
      this.store.checkpoint(id);
      console.log(`[EventBus] Checkpoint created: ${id}`);
    } catch (error) {
      console.error('[EventBus] Failed to create checkpoint:', error);
      throw error;
    }
  }

  /**
   * 跳转到指定事件
   */
  seek(eventId: number): void {
    // 实现留给 EventStore
    console.log(`[EventBus] Seeking to event ${eventId}`);
    // TODO: 实现 seek 逻辑
  }

  /**
   * 获取当前运行状态
   */
  getStatus(): RunStatus {
    return this.stateMachine.getStatus();
  }

  /**
   * 获取度量统计
   */
  getMetrics(): BusMetrics {
    const now = Date.now();
    const uptime = this.startTime ? now - this.startTime : 0;
    const throughput = uptime > 0 ? (this.eventCount / uptime) * 1000 : 0;

    return {
      totalEvents: this.eventCount,
      errorCount: this.errorCount,
      deadLetterCount: this.deadLetterCount,
      bufferUsage: this.eventCount / this.config.bufferSize,
      backpressure: this.stateSubject.value.backpressure,
      throughput,
      uptime,
    };
  }

  /**
   * 销毁事件总线
   */
  destroy(): void {
    console.log('[EventBus] Destroying...');

    // 停止所有流
    this.destroySubject.next();
    this.destroySubject.complete();

    // 完成所有 Subjects
    this.eventSubject.complete();
    this.controlSubject.complete();
    this.stateSubject.complete();
    this.deadLetterSubject.complete();

    console.log('[EventBus] Destroyed');
  }
}

