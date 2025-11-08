# M1-04: EventBus & EventStore 事件总线与事件存储

**任务ID**: M1-04  
**里程碑**: M1 - 数据/特征与事件总线基线  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 12天  
**优先级**: 🔥 高  
**依赖**: 无（可与其他 M1 任务并行）

---

## 📋 任务概述

实现基于 RxJS 的事件总线系统，支持事件路由、背压控制、状态管理、控制事件处理、死信队列，以及可重放的事件存储（EventStore）和检查点（Checkpoint）机制。

## 🎯 核心目标

1. **统一事件路由** - 所有模块通过事件总线通信，解耦各模块
2. **状态管理** - 维护回测会话的运行状态（idle/running/paused/stopped 等）
3. **控制事件** - 支持 START/PAUSE/RESUME/SEEK/STOP/SNAPSHOT 等控制操作
4. **事件存储与重放** - 持久化所有事件，支持断点续跑和回放
5. **背压与死信** - 处理事件积压和异常，保证系统稳定性

## 📐 设计要求

### 核心接口定义

```typescript
interface EventBus {
  // 发布事件
  publish<T = unknown>(event: BaseEvent<T>): void;
  
  // 订阅事件
  subscribe<T = unknown>(
    eventType: EventType | EventType[],
    handler: (event: BaseEvent<T>) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Subscription;
  
  // 状态流
  state$: Observable<BusState>;
  
  // 控制事件入口
  control(event: ControlEvent): Promise<void>;
  
  // 死信队列
  deadLetter$: Observable<DeadLetterEvent>;
  
  // 指标流
  metrics$: Observable<BusMetrics>;
}

interface SubscriptionOptions {
  priority?: number;           // 订阅优先级
  concurrency?: number;        // 并发处理数
  retryPolicy?: RetryPolicy;
}

type EventType =
  | 'market.bar'
  | 'strategy.intent'
  | 'strategy.log'
  | 'strategy.metric'
  | 'risk.decision'
  | 'execution.report'
  | 'portfolio.update'
  | 'ledger.record'
  | 'control'
  | 'system.deadletter';

interface BaseEvent<TPayload = unknown> {
  eventId: string;
  eventType: EventType;
  sessionId: string;
  sequenceId: string;
  timestamp: string;
  source: string;
  payload: TPayload;
  metadata?: Record<string, unknown>;
}

type RunStatus =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'error';

interface BusState {
  sessionId: string;
  status: RunStatus;
  currentSeq: string;
  logicalTime: string;
  clockMode: 'event' | 'wall';
  inflight: number;
  lastCheckpoint?: CheckpointMeta;
}

interface ControlEvent {
  type: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'SNAPSHOT' | 'SEEK';
  sessionId: string;
  payload?: {
    sequenceId?: string;
    timestamp?: string;
    reason?: string;
  };
}
```

### EventStore 接口

```typescript
interface EventStore {
  // 追加事件
  append(event: RecordedEvent): Promise<void>;
  
  // 从指定序列号开始读取
  readFrom(sequenceId: string): AsyncIterable<RecordedEvent>;
  
  // 获取最新事件
  latest(): Promise<RecordedEvent | undefined>;
  
  // 创建检查点
  createCheckpoint(snapshot: CheckpointSnapshot): Promise<string>;
  
  // 加载检查点
  loadCheckpoint(checkpointId: string): Promise<CheckpointSnapshot>;
  
  // 列出检查点
  listCheckpoints(): Promise<CheckpointMeta[]>;
}

interface RecordedEvent {
  sequenceId: string;
  timestamp: string;
  streamId: string;
  payload: BaseEvent;
  status: 'pending' | 'processed' | 'skipped';
  error?: SerializedError;
}

interface CheckpointSnapshot {
  meta: CheckpointMeta;
  busState: BusState;
  moduleStates: Record<string, unknown>;
}

interface CheckpointMeta {
  sequenceId: string;
  timestamp: string;
  createdAt: string;
  reason: 'auto' | 'manual' | 'pause';
}
```

## 🔧 实现要点

### 1. 事件总线核心实现

```typescript
class EventBusImpl implements EventBus {
  private subjects = new Map<EventType, Subject<BaseEvent>>();
  private stateSubject = new BehaviorSubject<BusState>(initialState);
  private deadLetterSubject = new Subject<DeadLetterEvent>();
  private metricsSubject = new Subject<BusMetrics>();
  private sequenceCounter = 0;
  
  publish<T>(event: BaseEvent<T>): void {
    // 1. 分配 sequenceId
    event.sequenceId = this.generateSequenceId();
    
    // 2. 检查状态（如果 paused 则缓冲）
    if (this.state$.value.status === 'paused') {
      this.buffer(event);
      return;
    }
    
    // 3. 存储事件
    this.eventStore.append({
      sequenceId: event.sequenceId,
      timestamp: event.timestamp,
      streamId: this.getStreamId(event),
      payload: event,
      status: 'pending'
    });
    
    // 4. 发布到对应主题
    const subject = this.getOrCreateSubject(event.eventType);
    subject.next(event);
    
    // 5. 更新状态
    this.updateState({ currentSeq: event.sequenceId, logicalTime: event.timestamp });
    
    // 6. 发布指标
    this.publishMetrics({ eventType: event.eventType, action: 'published' });
  }
  
  subscribe<T>(
    eventType: EventType | EventType[],
    handler: (event: BaseEvent<T>) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Subscription {
    const types = Array.isArray(eventType) ? eventType : [eventType];
    const observables = types.map(t => this.getOrCreateSubject(t));
    
    return merge(...observables)
      .pipe(
        // 应用背压策略
        this.applyBackpressure(options),
        // 错误处理
        catchError(error => this.handleError(error))
      )
      .subscribe({
        next: async (event) => {
          try {
            await handler(event);
            this.markProcessed(event.sequenceId);
          } catch (error) {
            this.publishDeadLetter(event, error);
          }
        }
      });
  }
  
  async control(event: ControlEvent): Promise<void> {
    switch (event.type) {
      case 'START':
        await this.handleStart();
        break;
      case 'PAUSE':
        await this.handlePause();
        break;
      case 'RESUME':
        await this.handleResume();
        break;
      case 'SEEK':
        await this.handleSeek(event.payload?.sequenceId);
        break;
      case 'SNAPSHOT':
        await this.handleSnapshot(event.payload?.reason);
        break;
      case 'STOP':
        await this.handleStop();
        break;
    }
  }
}
```

### 2. 状态机实现

```typescript
class BusStateMachine {
  private transitions: Map<RunStatus, RunStatus[]> = new Map([
    ['idle', ['initializing']],
    ['initializing', ['running', 'error']],
    ['running', ['paused', 'stopping', 'completed', 'error']],
    ['paused', ['running', 'stopping']],
    ['stopping', ['stopped']],
    ['stopped', ['idle']],
    ['completed', ['idle']],
    ['error', ['idle']]
  ]);
  
  canTransition(from: RunStatus, to: RunStatus): boolean {
    return this.transitions.get(from)?.includes(to) || false;
  }
  
  transition(state: BusState, to: RunStatus): BusState {
    if (!this.canTransition(state.status, to)) {
      throw new Error(`Invalid state transition: ${state.status} -> ${to}`);
    }
    return { ...state, status: to };
  }
}
```

### 3. EventStore 实现（混合内存+Parquet）

```typescript
class HybridEventStore implements EventStore {
  private memoryBuffer: RecordedEvent[] = [];
  private maxBufferSize = 10000;
  private parquetWriter: ParquetWriter;
  
  async append(event: RecordedEvent): Promise<void> {
    // 1. 写入内存缓冲
    this.memoryBuffer.push(event);
    
    // 2. 如果缓冲满了，刷新到 Parquet
    if (this.memoryBuffer.length >= this.maxBufferSize) {
      await this.flushToParquet();
    }
  }
  
  async *readFrom(sequenceId: string): AsyncIterable<RecordedEvent> {
    // 1. 从 Parquet 读取历史事件
    const historicalEvents = await this.readFromParquet(sequenceId);
    for (const event of historicalEvents) {
      yield event;
    }
    
    // 2. 从内存缓冲读取最新事件
    const memoryEvents = this.memoryBuffer.filter(
      e => e.sequenceId >= sequenceId
    );
    for (const event of memoryEvents) {
      yield event;
    }
  }
  
  async createCheckpoint(snapshot: CheckpointSnapshot): Promise<string> {
    const checkpointId = `checkpoint-${snapshot.meta.sequenceId}`;
    const filePath = path.join(this.checkpointDir, `${checkpointId}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
    return checkpointId;
  }
}
```

### 4. 背压控制

```typescript
function applyBackpressure(options?: SubscriptionOptions) {
  return (source: Observable<BaseEvent>) => {
    return source.pipe(
      // 根据优先级排序（如果需要）
      ...(options?.priority ? [prioritize(options.priority)] : []),
      // 控制并发
      mergeMap(
        event => from(processEvent(event)),
        options?.concurrency || 1
      ),
      // 缓冲策略
      bufferTime(100),
      filter(events => events.length > 0),
      mergeMap(events => from(events))
    );
  };
}
```

## 📦 交付物清单

### 必需交付物

- [ ] **设计文档** (`docs/design/event-bus-design.md`)
  - 事件总线架构图
  - 状态机图
  - 事件流转流程
  - EventStore 设计
  
- [ ] **接口定义** (`backend/src/backtesting/events/interfaces.ts`)
  - `EventBus` 接口
  - `EventStore` 接口
  - 所有事件类型定义
  
- [ ] **实现代码**
  - `EventBus` 实现 (`backend/src/backtesting/events/bus.ts`)
  - 状态机 (`backend/src/backtesting/events/state-machine.ts`)
  - EventStore 实现 (`backend/src/backtesting/events/store.ts`)
  - 死信处理 (`backend/src/backtesting/events/dead-letter.ts`)
  - 控制事件处理 (`backend/src/backtesting/events/control-handler.ts`)
  
- [ ] **模块 README** (`backend/src/backtesting/events/README.md`)

### 测试要求

- [ ] **单元测试**
  - `bus.spec.ts` - 发布/订阅、状态管理
  - `state-machine.spec.ts` - 状态转换逻辑
  - `store.spec.ts` - 事件存储和读取
  - `control-handler.spec.ts` - 控制事件处理
  - 覆盖率要求：≥ 85%

- [ ] **集成测试**
  - `event-pipeline.integration.spec.ts`
    - ✓ 策略→风控→执行伪模块串联
    - ✓ 暂停/恢复流程
    - ✓ 事件重放
    - ✓ 死信处理

## 🔗 依赖关系

### 下游依赖
- M2-01: StrategySandbox
- M2-02: RiskEngine
- M2-03: ExecutionEngine
- M3-01: Orchestrator

## ✅ 验收标准

### 功能验收
1. ✅ 事件发布和订阅正常工作
2. ✅ 状态机转换符合设计
3. ✅ 控制事件处理正确
4. ✅ 事件存储和重放功能完整
5. ✅ 死信队列捕获异常事件

### 性能验收
1. ✅ 支持 10000+ 事件/秒的吞吐量
2. ✅ 内存使用稳定，无泄漏
3. ✅ 暂停/恢复延迟 < 100ms

### 测试验收
1. ✅ 单元测试覆盖率 ≥ 85%
2. ✅ 所有集成测试通过

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07  
**下一步行动**: 分配负责人，开始设计阶段

