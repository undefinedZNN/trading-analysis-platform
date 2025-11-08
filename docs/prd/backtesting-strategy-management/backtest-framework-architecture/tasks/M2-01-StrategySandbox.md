# M2-01: StrategySandbox 策略沙箱

**任务ID**: M2-01  
**里程碑**: M2 - 策略沙箱、风控与执行撮合  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 12天  
**优先级**: 🔥 高  
**依赖**: M1-04 (EventBus)

---

## 📋 任务概述

实现策略沙箱，托管策略脚本的生命周期，提供策略上下文 API，支持状态快照与恢复，处理策略日志和指标输出。

## 🎯 核心目标

1. **生命周期管理** - 实现完整的策略生命周期钩子（onInit/onBar/onExecutionReport 等）
2. **上下文 API** - 提供策略访问行情、仓位、下单、日志、指标的统一接口
3. **快照与恢复** - 支持策略状态的序列化和恢复
4. **参数管理** - 支持策略参数的声明、校验和动态访问
5. **自定义特征** - 支持策略定义和注册自定义特征

## 📐 设计要求

### 生命周期接口

```typescript
interface StrategyLifecycle {
  // 初始化钩子
  onInit?(ctx: StrategyContext): Promise<void> | void;
  
  // 预热数据处理
  onWarmup?(ctx: StrategyContext, event: MarketBarEvent): Promise<void> | void;
  
  // 主时间框架 bar 事件
  onBar?(ctx: StrategyContext, event: MarketBarEvent): Promise<void> | void;
  
  // 辅助时间框架事件
  onAuxStream?(ctx: StrategyContext, event: MarketBarEvent): Promise<void> | void;
  
  // 执行回报事件
  onExecutionReport?(ctx: StrategyContext, event: ExecutionReportEvent): Promise<void> | void;
  
  // 风控决策事件
  onRiskDecision?(ctx: StrategyContext, event: RiskDecisionEvent): Promise<void> | void;
  
  // 控制事件
  onControl?(ctx: StrategyContext, event: BaseEvent<ControlEvent>): Promise<void> | void;
  
  // 快照生成
  onSnapshot?(ctx: StrategyContext): Promise<StrategySnapshot>;
  
  // 快照恢复
  onRestore?(ctx: StrategyContext, snapshot: StrategySnapshot): Promise<void> | void;
  
  // 停止钩子
  onStop?(ctx: StrategyContext, reason: string): Promise<void> | void;
  
  // 错误处理
  onError?(ctx: StrategyContext, error: Error): Promise<void> | void;
}
```

### 策略上下文 API

```typescript
interface StrategyContext {
  // 基础信息
  sessionId: string;
  strategyId: string;
  manifest: StrategyManifest;
  
  // 时间相关
  now(): string;                          // 当前事件时间戳
  
  // 交易操作
  publishIntent(intent: OrderIntentPayload): void;
  cancelIntent(intentId: string): void;
  
  // 仓位查询
  getPosition(symbol: string): PositionSnapshot | undefined;
  getPortfolio(): PortfolioUpdatePayload;
  
  // 特征访问
  getFeature(event: MarketBarEvent, featureId: string): string | number | undefined;
  
  // 参数访问
  getParameters<T = Record<string, unknown>>(): T;
  setParameterOverrides(params: Record<string, unknown>): void;
  
  // 日志与指标
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>): void;
  metrics: {
    increment(counter: string, value?: number, tags?: Record<string, string>): void;
    observe(histogram: string, value: number, tags?: Record<string, string>): void;
    gauge(metric: string, value: number, tags?: Record<string, string>): void;
  };
  
  // 状态管理
  requestSnapshot(): Promise<StrategySnapshot>;
  
  // 共享状态（用于自定义特征）
  sharedState: Map<string, Observable<unknown>>;
  registerSharedState(key: string, observable: Observable<unknown>): void;
}
```

### 策略 Manifest

```typescript
interface StrategyManifest {
  strategyId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  requiredTimeframe: Timeframe;
  auxStreams?: Timeframe[];
  featureDeps: string[];
  dataDeps: Array<{ symbol: string; market?: string }>;
  defaultParameters: Record<string, unknown>;
  warmupBars?: number;
  parameterSchema?: Record<string, ParameterSchema>;
}
```

### 策略脚本结构

```typescript
// 策略脚本导出约定
export const parameters = defineParameters({
  entryThreshold: {
    type: 'number',
    title: '入场阈值',
    default: 1.5,
    minimum: 0,
    maximum: 5,
    'x-component': 'Slider'
  }
});

export const customFeatures = defineFeatures([
  {
    id: 'custom-signal',
    label: '自定义信号',
    valueType: 'enum',
    domain: ['buy', 'sell', 'neutral'],
    compute(stream) {
      return stream; // RxJS 管道
    }
  }
]);

const strategy: StrategyLifecycle = {
  onInit(ctx) {
    ctx.log('info', 'Strategy initialized');
  },
  
  onBar(ctx, event) {
    const ma20 = ctx.getFeature(event, 'MA20');
    // 策略逻辑...
  }
};

export default strategy;
```

## 🔧 实现要点

### 1. 策略加载器

```typescript
class StrategyLoader {
  async load(scriptContent: string, manifest: StrategyManifest): Promise<StrategyInstance> {
    // 1. 编译策略脚本
    const compiled = await this.compileScript(scriptContent);
    
    // 2. 提取导出
    const {
      default: lifecycle,
      parameters,
      customFeatures
    } = compiled;
    
    // 3. 校验生命周期接口
    this.validateLifecycle(lifecycle);
    
    // 4. 注册自定义特征
    if (customFeatures) {
      this.registerCustomFeatures(customFeatures);
    }
    
    // 5. 创建策略实例
    return new StrategyInstance(lifecycle, manifest, parameters);
  }
}
```

### 2. 沙箱运行时

```typescript
class StrategySandbox {
  private instance: StrategyInstance;
  private context: StrategyContext;
  private subscriptions: Subscription[] = [];
  
  async start(eventBus: EventBus): Promise<void> {
    // 1. 初始化上下文
    this.context = this.createContext();
    
    // 2. 调用 onInit
    await this.instance.lifecycle.onInit?.(this.context);
    
    // 3. 订阅事件
    this.subscribeToEvents(eventBus);
  }
  
  private subscribeToEvents(eventBus: EventBus): void {
    // 订阅行情事件
    this.subscriptions.push(
      eventBus.subscribe('market.bar', async (event) => {
        if (event.payload.bar.timeframe === this.manifest.requiredTimeframe) {
          await this.handleBar(event);
        } else {
          await this.handleAuxStream(event);
        }
      })
    );
    
    // 订阅执行回报
    this.subscriptions.push(
      eventBus.subscribe('execution.report', async (event) => {
        await this.handleExecutionReport(event);
      })
    );
    
    // 订阅风控决策
    this.subscriptions.push(
      eventBus.subscribe('risk.decision', async (event) => {
        await this.handleRiskDecision(event);
      })
    );
    
    // 订阅控制事件
    this.subscriptions.push(
      eventBus.subscribe('control', async (event) => {
        await this.handleControl(event);
      })
    );
  }
  
  private async handleBar(event: BaseEvent<MarketBarEvent>): Promise<void> {
    try {
      await this.instance.lifecycle.onBar?.(this.context, event.payload);
    } catch (error) {
      await this.handleError(error);
    }
  }
}
```

### 3. 上下文实现

```typescript
class StrategyContextImpl implements StrategyContext {
  constructor(
    private sandbox: StrategySandbox,
    private eventBus: EventBus,
    private portfolioStore: PortfolioStore
  ) {}
  
  publishIntent(intent: OrderIntentPayload): void {
    const event: BaseEvent<OrderIntentPayload> = {
      eventId: generateId(),
      eventType: 'strategy.intent',
      sessionId: this.sessionId,
      sequenceId: '', // 由 EventBus 分配
      timestamp: this.now(),
      source: this.strategyId,
      payload: intent
    };
    
    this.eventBus.publish(event);
  }
  
  log(level: string, message: string, extra?: Record<string, unknown>): void {
    const logEvent: BaseEvent<StrategyLogPayload> = {
      eventId: generateId(),
      eventType: 'strategy.log',
      sessionId: this.sessionId,
      sequenceId: '',
      timestamp: this.now(),
      source: this.strategyId,
      payload: {
        strategyId: this.strategyId,
        level,
        message,
        extra
      }
    };
    
    this.eventBus.publish(logEvent);
  }
  
  getPosition(symbol: string): PositionSnapshot | undefined {
    return this.portfolioStore.getPosition(this.strategyId, symbol);
  }
}
```

### 4. 快照与恢复

```typescript
interface StrategySnapshot {
  state: Record<string, unknown>;
  sharedState: Record<string, unknown>;
  createdAt: string;
  lastSequenceId: string;
}

class SnapshotManager {
  async createSnapshot(
    instance: StrategyInstance,
    context: StrategyContext
  ): Promise<StrategySnapshot> {
    // 1. 调用策略的 onSnapshot（如果实现）
    let strategyState = {};
    if (instance.lifecycle.onSnapshot) {
      const snapshot = await instance.lifecycle.onSnapshot(context);
      strategyState = snapshot.state;
    }
    
    // 2. 序列化共享状态
    const sharedState = await this.serializeSharedState(context.sharedState);
    
    // 3. 组装快照
    return {
      state: strategyState,
      sharedState,
      createdAt: new Date().toISOString(),
      lastSequenceId: context.lastProcessedSeq
    };
  }
  
  async restoreSnapshot(
    instance: StrategyInstance,
    context: StrategyContext,
    snapshot: StrategySnapshot
  ): Promise<void> {
    // 1. 恢复共享状态
    await this.restoreSharedState(context.sharedState, snapshot.sharedState);
    
    // 2. 调用策略的 onRestore
    if (instance.lifecycle.onRestore) {
      await instance.lifecycle.onRestore(context, snapshot);
    }
  }
}
```

## 📦 交付物清单

### 必需交付物

- [ ] **设计文档** (`docs/design/strategy-sandbox-design.md`)
  - 生命周期序列图
  - 上下文API设计
  - 快照机制说明
  
- [ ] **接口定义** (`backend/src/backtesting/strategy/interfaces.ts`)
  - `StrategyLifecycle` 接口
  - `StrategyContext` 接口
  - `StrategyManifest` 类型
  
- [ ] **实现代码**
  - 沙箱核心 (`backend/src/backtesting/strategy/sandbox.ts`)
  - 策略加载器 (`backend/src/backtesting/strategy/loader.ts`)
  - 上下文实现 (`backend/src/backtesting/strategy/context.ts`)
  - 快照管理 (`backend/src/backtesting/strategy/snapshot.ts`)
  - `defineParameters` 工具 (`backend/src/backtesting/strategy/define-parameters.ts`)
  - `defineFeatures` 工具 (`backend/src/backtesting/strategy/define-features.ts`)
  
- [ ] **示例策略** (`backend/src/backtesting/strategy/examples/`)
  - `simple-ma-crossover.ts` - 简单均线交叉策略
  - `mean-reversion.ts` - 均值回归策略
  
- [ ] **模块 README** (`backend/src/backtesting/strategy/README.md`)

### 测试要求

- [ ] **单元测试**
  - `sandbox.spec.ts` - 沙箱生命周期
  - `context.spec.ts` - 上下文 API
  - `loader.spec.ts` - 策略加载
  - `snapshot.spec.ts` - 快照恢复
  - 覆盖率要求：≥ 85%

- [ ] **集成测试**
  - `strategy-execution.integration.spec.ts`
    - ✓ 示例策略跑 mock 行情
    - ✓ 参数访问和覆盖
    - ✓ 快照恢复测试
    - ✓ 日志和指标输出

## 🔗 依赖关系

### 上游依赖
- M1-04: EventBus

### 下游依赖
- M3-01: Orchestrator

## ✅ 验收标准

### 功能验收
1. ✅ 所有生命周期钩子正常触发
2. ✅ 策略可以正常下单和查询仓位
3. ✅ 参数和特征访问正确
4. ✅ 日志和指标事件正确发布
5. ✅ 快照和恢复功能完整

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07

