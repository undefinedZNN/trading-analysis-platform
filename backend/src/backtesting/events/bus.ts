/**
 * EventBus 核心实现（面向 BusStateMachine 接口）
 *
 * 该实现承担以下职责：
 * 1. 事件路由（发布/订阅）
 * 2. 状态机驱动的运行状态管理
 * 3. 背压检测与控制事件
 * 4. 度量指标采集
 * 5. 死信队列派发
 */

import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { catchError, filter, share, takeUntil, tap } from 'rxjs/operators';
import type {
  EventBus as IEventBus,
  BaseEvent,
  EventType,
  RunStatus,
  BusState,
  ControlEvent,
  SubscriptionOptions,
  RetryPolicy,
  DeadLetterEvent,
  BusMetrics,
  RecordedEvent,
  SerializedError,
} from './interfaces';
import { BusStateMachine } from './state-machine';

/**
 * 为兼容当前 EventStore 实现与规划中的接口，这里只声明实际需要的方法。
 */
type EventStoreLike = {
  append(event: BaseEvent | RecordedEvent): Promise<void> | void;
  clear?: () => Promise<void> | void;
  checkpoint?: (id: string) => Promise<void> | void;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 1000,
  backoffFactor: 2,
};

/**
 * EventBus 配置选项
 */
export interface EventBusConfig {
  bufferSize?: number;
  backpressureThreshold?: number;
  batchWindowMs?: number;
  enableDeadLetter?: boolean;
  defaultRetryPolicy?: RetryPolicy;
  sessionId?: string;
}

/**
 * EventBus 核心实现
 */
export class EventBus implements IEventBus {
  // === Subjects ===
  private readonly eventSubject = new Subject<BaseEvent>();
  private readonly controlSubject = new Subject<ControlEvent>();
  private readonly deadLetterSubject = new Subject<DeadLetterEvent>();
  private readonly destroySubject = new Subject<void>();
  private readonly stateSubject: BehaviorSubject<BusState>;
  private readonly metricsSubject: BehaviorSubject<BusMetrics>;

  // === Observable 暴露 ===
  public readonly event$: Observable<BaseEvent>;
  public readonly control$: Observable<ControlEvent>;
  public readonly state$: Observable<BusState>;
  public readonly deadLetter$: Observable<DeadLetterEvent>;
  public readonly metrics$: Observable<BusMetrics>;

  // === 状态 & 依赖 ===
  private readonly stateMachine = new BusStateMachine();
  private readonly store: EventStoreLike;
  private readonly config: Required<EventBusConfig>;
  private currentState: BusState;
  private readonly sessionId: string;

  // === 运行时指标 ===
  private eventCount = 0;
  private errorCount = 0;
  private deadLetterCount = 0;
  private lastEventTime: number | null = null;
  private startTime: number | null = null;
  private lastSequenceId: string;
  private readonly eventsByType: Partial<Record<EventType, number>> = {};

  constructor(store: EventStoreLike, config: EventBusConfig = {}) {
    this.store = store;
    this.config = {
      bufferSize: config.bufferSize ?? 10000,
      backpressureThreshold: config.backpressureThreshold ?? 0.8,
      batchWindowMs: config.batchWindowMs ?? 50,
      enableDeadLetter: config.enableDeadLetter ?? true,
      defaultRetryPolicy: config.defaultRetryPolicy ?? DEFAULT_RETRY_POLICY,
      sessionId: config.sessionId ?? 'default-session',
    };

    this.sessionId = this.config.sessionId;
    this.currentState = this.stateMachine.createInitialState(this.sessionId);
    this.lastSequenceId = this.currentState.currentSeq;

    this.stateSubject = new BehaviorSubject<BusState>(this.currentState);
    this.metricsSubject = new BehaviorSubject<BusMetrics>(this.buildMetricsSnapshot());

    this.event$ = this.createEventPipeline();
    this.control$ = this.createControlPipeline();
    this.state$ = this.stateSubject.asObservable();
    this.deadLetter$ = this.deadLetterSubject.asObservable();
    this.metrics$ = this.metricsSubject.asObservable();

    this.setupControlHandler();
  }

  /**
   * 创建事件处理管道
   */
  private createEventPipeline(): Observable<BaseEvent> {
    return this.eventSubject.pipe(
      filter(() => this.stateMachine.canAcceptEvents(this.currentState.status)),
      tap((event) => this.recordEvent(event)),
      tap(() => this.updateMetrics()),
      tap(() => this.checkBackpressure()),
      catchError((error, caught) => {
        this.handleEventError(error);
        return caught;
      }),
      takeUntil(this.destroySubject),
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
   * 控制事件处理入口
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

      case 'SNAPSHOT':
      case 'CHECKPOINT':
        if (payload?.checkpointId) {
          this.checkpoint(payload.checkpointId);
        }
        break;

      case 'SEEK':
        if (payload?.eventId !== undefined) {
          this.seek(payload.eventId);
        } else if (payload?.sequenceId) {
          this.seekBySequence(payload.sequenceId);
        }
        break;

      default:
        console.warn(`[EventBus] Unknown control event type: ${type}`);
    }
  }

  /**
   * 发布事件
   */
  publish<T = unknown>(event: BaseEvent<T>): void {
    if (!this.stateMachine.canAcceptEvents(this.currentState.status)) {
      throw new Error(`Cannot publish event: EventBus is ${this.currentState.status}`);
    }

    const normalized = this.normalizeEvent(event);
    this.eventSubject.next(normalized);
  }

  /**
   * 订阅事件（支持 Observable 或 handler 两种模式）
   */
  subscribe<T = unknown>(
    eventType: EventType | EventType[],
    options?: SubscriptionOptions
  ): Observable<BaseEvent<T>>;
  subscribe<T = unknown>(
    eventType: EventType | EventType[],
    handler: (event: BaseEvent<T>) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Subscription;
  subscribe<T = unknown>(
    eventType: EventType | EventType[],
    handlerOrOptions?: SubscriptionOptions | ((event: BaseEvent<T>) => void | Promise<void>),
    maybeOptions?: SubscriptionOptions
  ): Observable<BaseEvent<T>> | Subscription {
    const hasHandler = typeof handlerOrOptions === 'function';
    const options = (hasHandler ? maybeOptions : handlerOrOptions) ?? {};
    const stream$ = this.createSubscriptionStream<T>(eventType, options);

    if (!hasHandler) {
      return stream$;
    }

    const handler = handlerOrOptions as (event: BaseEvent<T>) => void | Promise<void>;
    return stream$.subscribe({
      next: (event) => {
        try {
          const result = handler(event);
          if (this.isPromise(result)) {
            result.catch((error) => this.handleEventError(error, event));
          }
        } catch (error) {
          this.handleEventError(error, event);
        }
      },
      error: (error) => {
        this.handleSubscriptionError(error);
      },
    });
  }

  /**
   * 外部控制指令入口
   */
  async control(event: ControlEvent): Promise<void> {
    const enriched: ControlEvent = {
      ...event,
      sessionId: event.sessionId ?? this.sessionId,
    };
    this.controlSubject.next(enriched);
  }

  /**
   * 启动总线
   */
  start(): void {
    const transitioned =
      this.tryTransition('initializing') || this.tryTransition('running');

    if (transitioned) {
      this.startTime = Date.now();
      this.emitControl('START');
      this.updateMetrics();
    }
  }

  /**
   * 暂停总线
   */
  pause(): void {
    if (this.tryTransition('paused')) {
      this.emitControl('PAUSE');
      this.updateMetrics();
    }
  }

  /**
   * 恢复总线
   */
  resume(): void {
    if (this.tryTransition('running')) {
      this.emitControl('RESUME');
      this.updateMetrics();
    }
  }

  /**
   * 停止总线
   */
  stop(): void {
    const transitioned =
      this.tryTransition('stopping') || this.tryTransition('stopped');

    if (transitioned) {
      this.emitControl('STOP');
      this.updateMetrics();
    }
  }

  /**
   * 重置总线
   */
  reset(): void {
    let transitioned = false;

    transitioned = this.tryTransition('stopping') || transitioned;
    transitioned = this.tryTransition('stopped') || transitioned;
    transitioned = this.tryTransition('idle') || transitioned;

    if (transitioned) {
      this.clearRuntimeStats();
      this.clearStore();
      this.emitControl('RESET');
      this.updateMetrics();
    }
  }

  /**
   * 创建检查点
   */
  checkpoint(id: string): void {
    if (typeof this.store.checkpoint !== 'function') {
      console.warn('[EventBus] Checkpoint requested but store does not support it');
      return;
    }

    try {
      this.store.checkpoint(id);
      console.log(`[EventBus] Checkpoint created: ${id}`);
    } catch (error) {
      console.error('[EventBus] Failed to create checkpoint:', error);
      throw error;
    }
  }

  /**
   * 根据事件 ID 跳转（占位实现）
   */
  seek(eventId: number): void {
    console.log(`[EventBus] Seeking to event ${eventId} (not implemented)`);
  }

  /**
   * 根据序列号跳转（占位实现）
   */
  private seekBySequence(sequenceId: string): void {
    console.log(`[EventBus] Seeking to sequence ${sequenceId} (not implemented)`);
  }

  /**
   * 获取当前运行状态
   */
  getStatus(): RunStatus {
    return this.currentState.status;
  }

  /**
   * 获取当前状态快照
   */
  getState(): BusState {
    return this.currentState;
  }

  /**
   * 获取度量统计
   */
  getMetrics(): BusMetrics {
    return this.metricsSubject.value;
  }

  /**
   * 等待队列清空（当前实现为同步流程）
   */
  async drain(): Promise<void> {
    // 当前未实现复杂队列，直接返回
  }

  /**
   * 关闭事件总线
   */
  async close(): Promise<void> {
    this.destroy();
  }

  /**
   * 销毁事件总线
   */
  destroy(): void {
    console.log('[EventBus] Destroying...');

    this.destroySubject.next();
    this.destroySubject.complete();

    this.eventSubject.complete();
    this.controlSubject.complete();
    this.stateSubject.complete();
    this.deadLetterSubject.complete();
    this.metricsSubject.complete();

    console.log('[EventBus] Destroyed');
  }

  // === 内部工具方法 ===

  private createSubscriptionStream<T>(
    eventType: EventType | EventType[],
    options: SubscriptionOptions
  ): Observable<BaseEvent<T>> {
    const types = Array.isArray(eventType) ? eventType : [eventType];
    let stream$ = this.event$.pipe(
      filter((event) => types.includes(event.eventType))
    );

    if (options.predicate) {
      stream$ = stream$.pipe(filter(options.predicate));
    }

    return stream$ as Observable<BaseEvent<T>>;
  }

  private recordEvent(event: BaseEvent): void {
    try {
      const appendResult = this.store.append(event);
      if (this.isPromise(appendResult)) {
        appendResult.catch((error) => this.handleEventError(error, event));
      }

      this.eventCount++;
      this.lastEventTime = Date.now();
      this.lastSequenceId = event.sequenceId;
      this.eventsByType[event.eventType] =
        (this.eventsByType[event.eventType] ?? 0) + 1;

      this.patchState({
        processedCount: this.eventCount,
        currentSeq: this.lastSequenceId,
        logicalTime: event.timestamp,
      });
    } catch (error) {
      this.handleEventError(error, event);
    }
  }

  private updateMetrics(): void {
    this.metricsSubject.next(this.buildMetricsSnapshot());
  }

  private buildMetricsSnapshot(): BusMetrics {
    const now = Date.now();
    const uptime = this.startTime ? now - this.startTime : 0;
    const throughput = uptime > 0 ? (this.eventCount / uptime) * 1000 : 0;
    const bufferUsage =
      this.config.bufferSize === 0
        ? 0
        : this.eventCount / this.config.bufferSize;

    return {
      timestamp: new Date(now).toISOString(),
      sessionId: this.sessionId,
      eventsPerSecond: throughput,
      inflight: 0,
      totalProcessed: this.eventCount,
      deadLetterCount: this.deadLetterCount,
      subscriptionCount: 0,
      eventsByType: { ...(this.eventsByType as Record<EventType, number>) },
      avgProcessingLatency: 0,
      totalEvents: this.eventCount,
      errorCount: this.errorCount,
      bufferUsage,
      throughput,
      uptime,
    };
  }

  private checkBackpressure(): void {
    const bufferUsage =
      this.config.bufferSize === 0
        ? 0
        : this.eventCount / this.config.bufferSize;

    if (bufferUsage >= this.config.backpressureThreshold) {
      console.warn(
        `[EventBus] Backpressure detected: ${(bufferUsage * 100).toFixed(1)}% buffer usage`
      );

      this.emitControl('PAUSE', { reason: 'backpressure' });
    }
  }

  private handleEventError(error: unknown, event?: BaseEvent): void {
    this.errorCount++;

    if (this.config.enableDeadLetter) {
      const deadLetterEvent: DeadLetterEvent = {
        originalEvent: event ?? (this.extractOriginalEvent(error) ?? ({} as BaseEvent)),
        error: this.serializeError(error),
        failedAt: new Date().toISOString(),
        retryCount: typeof (error as any)?.retryCount === 'number' ? (error as any).retryCount : 0,
      };

      this.deadLetterCount++;
      this.deadLetterSubject.next(deadLetterEvent);
    }

    console.error('[EventBus] Event processing error:', error);
  }

  private handleSubscriptionError(error: unknown): void {
    console.error('[EventBus] Subscription error:', error);
  }

  private tryTransition(to: RunStatus): boolean {
    if (!this.stateMachine.canTransition(this.currentState.status, to)) {
      return false;
    }

    const nextState = this.stateMachine.transition(this.currentState, to);
    this.updateState(nextState);
    return true;
  }

  private updateState(state: BusState): void {
    this.currentState = state;
    this.stateSubject.next(this.currentState);
  }

  private patchState(patch: Partial<BusState>): void {
    this.updateState({
      ...this.currentState,
      ...patch,
    });
  }

  private normalizeEvent<T>(event: BaseEvent<T>): BaseEvent<T> {
    const legacyType = (event as BaseEvent<T> & { type?: EventType }).type;
    const eventType = event.eventType ?? legacyType;
    if (!eventType) {
      throw new Error('Event type is required');
    }

    const rawSequence = (
      (event as BaseEvent<T> & { sequenceId?: string | number }).sequenceId ??
      (event as { sequenceId?: string | number }).sequenceId ??
      `${this.eventCount + 1}`
    ) as string | number;
    const sequenceId =
      typeof rawSequence === 'number' ? rawSequence.toString() : rawSequence;

    const timestamp = event.timestamp ?? new Date().toISOString();

    const normalized = {
      ...event,
      eventType,
      sequenceId,
      timestamp,
      sessionId: event.sessionId ?? this.sessionId,
    } as BaseEvent<T> & { type?: EventType };

    normalized.type = normalized.type ?? eventType;
    return normalized;
  }

  private emitControl(type: ControlEvent['type'], payload?: ControlEvent['payload']): void {
    this.controlSubject.next({
      type,
      sessionId: this.sessionId,
      payload,
    });
  }

  private clearRuntimeStats(): void {
    this.eventCount = 0;
    this.errorCount = 0;
    this.deadLetterCount = 0;
    this.lastEventTime = null;
    this.startTime = null;
    this.lastSequenceId = '0';
    Object.keys(this.eventsByType).forEach((key) => delete this.eventsByType[key as EventType]);

    this.patchState({
      processedCount: 0,
      currentSeq: '0',
      logicalTime: new Date().toISOString(),
    });
  }

  private clearStore(): void {
    if (typeof this.store.clear === 'function') {
      this.store.clear();
    }
  }

  private extractOriginalEvent(error: unknown): BaseEvent | undefined {
    if (error && typeof error === 'object' && 'event' in error) {
      return (error as { event?: BaseEvent }).event;
    }
    return undefined;
  }

  private serializeError(error: unknown): SerializedError {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return {
      name: 'Error',
      message: typeof error === 'string' ? error : JSON.stringify(error),
    };
  }

  private isPromise<T>(value: unknown): value is Promise<T> {
    return !!value && typeof (value as Promise<T>).then === 'function';
  }
}
