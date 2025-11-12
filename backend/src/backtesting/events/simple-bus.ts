/**
 * 简化的 EventBus 实现 (M1-04-B 核心功能)
 * 
 * 提供核心事件总线功能：
 * - 发布/订阅
 * - 状态管理
 * - 基本背压控制
 * 
 * 完整版实现将在后续迭代中完成
 */

import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { filter, tap, share, takeUntil } from 'rxjs/operators';

/**
 * 简化的事件类型
 */
export interface SimpleEvent {
  type: string;
  timestamp: number;
  payload?: any;
}

/**
 * 简化的运行状态
 */
export type SimpleRunStatus = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * 简化的状态机
 */
export class SimpleStateMachine {
  private status: SimpleRunStatus = 'idle';

  private readonly transitions: Map<SimpleRunStatus, SimpleRunStatus[]> = new Map([
    ['idle', ['running']],
    ['running', ['paused', 'stopped']],
    ['paused', ['running', 'stopped']],
    ['stopped', ['idle']],
  ]);

  getStatus(): SimpleRunStatus {
    return this.status;
  }

  canTransition(action: 'start' | 'pause' | 'resume' | 'stop' | 'reset'): boolean {
    const targetStatus = this.getTargetStatus(action);
    if (!targetStatus) return false;

    const allowed = this.transitions.get(this.status) || [];
    return allowed.includes(targetStatus);
  }

  transition(action: 'start' | 'pause' | 'resume' | 'stop' | 'reset'): void {
    const targetStatus = this.getTargetStatus(action);
    if (!targetStatus) {
      throw new Error(`Unknown action: ${action}`);
    }

    if (!this.canTransition(action)) {
      throw new Error(`Invalid transition: ${this.status} -> ${targetStatus} (action: ${action})`);
    }

    this.status = targetStatus;
  }

  private getTargetStatus(action: string): SimpleRunStatus | null {
    switch (action) {
      case 'start':
        return 'running';
      case 'pause':
        return 'paused';
      case 'resume':
        return 'running';
      case 'stop':
        return 'stopped';
      case 'reset':
        return 'idle';
      default:
        return null;
    }
  }
}

/**
 * 简化的事件记录
 */
export interface SimpleRecordedEvent extends SimpleEvent {
  eventId: number;
  recordedAt: number;
}

/**
 * 简化的检查点元数据
 */
export interface SimpleCheckpointMeta {
  checkpointId: string;
  timestamp: number;
  eventId: number;
}

/**
 * 简化的检查点快照
 */
export interface SimpleCheckpointSnapshot extends SimpleCheckpointMeta {
  eventCount: number;
  state: any;
}

/**
 * 简化的事件存储
 */
export interface SimpleEventStore {
  append(event: SimpleEvent): void;
  getRange(startId: number, endId: number): SimpleRecordedEvent[];
  getFrom(startId: number): SimpleRecordedEvent[];
  getAll(): SimpleRecordedEvent[];
  checkpoint(id: string): SimpleCheckpointMeta;
  restore(checkpointId: string): SimpleCheckpointSnapshot;
  listCheckpoints(): SimpleCheckpointMeta[];
  clear(): void;
  getEventCount(): number;
  destroy(): void;
}

/**
 * 简化的度量统计
 */
export interface SimpleBusMetrics {
  totalEvents: number;
  errorCount: number;
  deadLetterCount: number;
  bufferUsage: number;
  backpressure: boolean;
  throughput: number;
  uptime: number;
}

/**
 * 简化的总线状态
 */
export interface SimpleBusState {
  status: SimpleRunStatus;
  eventCount: number;
  errorCount: number;
  bufferUsage: number;
  backpressure: boolean;
}

/**
 * 简化的控制事件
 */
export interface SimpleControlEvent {
  type: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'RESET' | 'CHECKPOINT' | 'SEEK';
  timestamp: number;
  payload?: any;
}

/**
 * 简化的死信事件
 */
export interface SimpleDeadLetterEvent {
  originalEvent: any;
  error: string;
  timestamp: number;
  retryCount: number;
}

/**
 * 简化的订阅选项
 */
export interface SimpleSubscriptionOptions {
  predicate?: (event: SimpleEvent) => boolean;
  batchSize?: number;
}

/**
 * 简化的EventBus配置
 */
export interface SimpleEventBusConfig {
  bufferSize?: number;
  backpressureThreshold?: number;
  enableDeadLetter?: boolean;
}

/**
 * 简化的 EventBus 实现
 */
export class SimpleEventBus {
  private readonly eventSubject: Subject<SimpleEvent>;
  private readonly controlSubject: Subject<SimpleControlEvent>;
  private readonly stateSubject: BehaviorSubject<SimpleBusState>;
  private readonly deadLetterSubject: Subject<SimpleDeadLetterEvent>;
  private readonly destroySubject: Subject<void>;

  private readonly stateMachine: SimpleStateMachine;
  private readonly store: SimpleEventStore;
  private readonly config: Required<SimpleEventBusConfig>;

  private eventCount: number;
  private errorCount: number;
  private deadLetterCount: number;
  private startTime: number | null;

  public readonly event$: Observable<SimpleEvent>;
  public readonly control$: Observable<SimpleControlEvent>;
  public readonly state$: Observable<SimpleBusState>;
  public readonly deadLetter$: Observable<SimpleDeadLetterEvent>;

  constructor(store: SimpleEventStore, config: SimpleEventBusConfig = {}) {
    this.config = {
      bufferSize: config.bufferSize ?? 1000,
      backpressureThreshold: config.backpressureThreshold ?? 0.8,
      enableDeadLetter: config.enableDeadLetter ?? true,
    };

    this.eventSubject = new Subject<SimpleEvent>();
    this.controlSubject = new Subject<SimpleControlEvent>();
    this.deadLetterSubject = new Subject<SimpleDeadLetterEvent>();
    this.destroySubject = new Subject<void>();

    this.stateMachine = new SimpleStateMachine();
    this.store = store;
    this.eventCount = 0;
    this.errorCount = 0;
    this.deadLetterCount = 0;
    this.startTime = null;

    this.stateSubject = new BehaviorSubject<SimpleBusState>({
      status: this.stateMachine.getStatus(),
      eventCount: 0,
      errorCount: 0,
      bufferUsage: 0,
      backpressure: false,
    });

    this.event$ = this.createEventPipeline();
    this.control$ = this.createControlPipeline();
    this.state$ = this.stateSubject.asObservable();
    this.deadLetter$ = this.deadLetterSubject.asObservable();

    this.setupControlHandler();
  }

  private createEventPipeline(): Observable<SimpleEvent> {
    return this.eventSubject.pipe(
      filter(() => this.stateMachine.getStatus() === 'running'),
      // 注意：事件已在 publish() 中存储到 store，此处只负责分发给订阅者
      takeUntil(this.destroySubject),
      share()
    );
  }

  private createControlPipeline(): Observable<SimpleControlEvent> {
    return this.controlSubject.pipe(
      takeUntil(this.destroySubject),
      share()
    );
  }

  private setupControlHandler(): void {
    this.control$.subscribe({
      next: (controlEvent) => this.handleControlEvent(controlEvent),
    });
  }

  private handleControlEvent(controlEvent: SimpleControlEvent): void {
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
    }
  }

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

  publish(event: SimpleEvent): void {
    if (this.stateMachine.getStatus() === 'stopped') {
      throw new Error('Cannot publish event: EventBus is stopped');
    }
    
    // 立即存储事件到 store（不依赖订阅者）
    if (this.stateMachine.getStatus() === 'running') {
      this.store.append(event);
      this.eventCount++;
      this.updateMetrics();
    }
    
    this.eventSubject.next(event);
  }

  subscribe(
    eventType: string | string[],
    options: SimpleSubscriptionOptions = {}
  ): Observable<SimpleEvent> {
    const types = Array.isArray(eventType) ? eventType : [eventType];

    return this.event$.pipe(
      filter((event) => types.includes(event.type)),
      options.predicate ? filter(options.predicate) : tap()
    );
  }

  start(): void {
    if (this.stateMachine.canTransition('start')) {
      this.stateMachine.transition('start');
      this.startTime = Date.now();
      this.updateMetrics();
    }
  }

  pause(): void {
    if (this.stateMachine.canTransition('pause')) {
      this.stateMachine.transition('pause');
      this.updateMetrics();
    }
  }

  resume(): void {
    if (this.stateMachine.canTransition('resume')) {
      this.stateMachine.transition('resume');
      this.updateMetrics();
    }
  }

  stop(): void {
    if (this.stateMachine.canTransition('stop')) {
      this.stateMachine.transition('stop');
      this.updateMetrics();
    }
  }

  reset(): void {
    if (this.stateMachine.canTransition('reset')) {
      this.stateMachine.transition('reset');
      this.eventCount = 0;
      this.errorCount = 0;
      this.deadLetterCount = 0;
      this.startTime = null;
      this.store.clear();
      this.updateMetrics();
    }
  }

  checkpoint(id: string): void {
    this.store.checkpoint(id);
  }

  getStatus(): SimpleRunStatus {
    return this.stateMachine.getStatus();
  }

  getMetrics(): SimpleBusMetrics {
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

  destroy(): void {
    this.destroySubject.next();
    this.destroySubject.complete();
    this.eventSubject.complete();
    this.controlSubject.complete();
    this.stateSubject.complete();
    this.deadLetterSubject.complete();
  }
}

/**
 * 简化的 EventStore 实现
 */
export class SimpleEventStore implements SimpleEventStore {
  private memoryBuffer: SimpleRecordedEvent[] = [];
  private eventIdCounter: number = 0;
  private checkpoints: Map<string, SimpleCheckpointSnapshot> = new Map();

  append(event: SimpleEvent): void {
    const recordedEvent: SimpleRecordedEvent = {
      ...event,
      eventId: this.eventIdCounter++,
      recordedAt: Date.now(),
    };
    this.memoryBuffer.push(recordedEvent);
  }

  getRange(startId: number, endId: number): SimpleRecordedEvent[] {
    return this.memoryBuffer.filter(
      (event) => event.eventId >= startId && event.eventId <= endId
    );
  }

  getFrom(startId: number): SimpleRecordedEvent[] {
    return this.memoryBuffer.filter((event) => event.eventId >= startId);
  }

  getAll(): SimpleRecordedEvent[] {
    return [...this.memoryBuffer];
  }

  checkpoint(id: string): SimpleCheckpointMeta {
    const snapshot: SimpleCheckpointSnapshot = {
      checkpointId: id,
      timestamp: Date.now(),
      eventId: this.eventIdCounter - 1,
      eventCount: this.memoryBuffer.length,
      state: {},
    };

    this.checkpoints.set(id, snapshot);

    return {
      checkpointId: id,
      timestamp: snapshot.timestamp,
      eventId: snapshot.eventId,
    };
  }

  restore(checkpointId: string): SimpleCheckpointSnapshot {
    const snapshot = this.checkpoints.get(checkpointId);
    if (!snapshot) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    return snapshot;
  }

  listCheckpoints(): SimpleCheckpointMeta[] {
    return Array.from(this.checkpoints.values()).map((snapshot) => ({
      checkpointId: snapshot.checkpointId,
      timestamp: snapshot.timestamp,
      eventId: snapshot.eventId,
    }));
  }

  clear(): void {
    this.memoryBuffer = [];
    this.eventIdCounter = 0;
    this.checkpoints.clear();
  }

  getEventCount(): number {
    return this.memoryBuffer.length;
  }

  destroy(): void {
    this.clear();
  }
}

