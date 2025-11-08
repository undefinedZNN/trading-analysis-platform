# Orchestrator 编排器模块

[![完成度](https://img.shields.io/badge/完成度-100%25-brightgreen.svg)](https://github.com)
[![测试](https://img.shields.io/badge/测试-83个-blue.svg)](https://github.com)

> 回测框架的核心编排模块，负责管理回测会话的完整生命周期、模块协调、状态管理、快照恢复和结果收集。

## 📋 目录

- [概述](#概述)
- [核心功能](#核心功能)
- [架构设计](#架构设计)
- [快速开始](#快速开始)
- [详细文档](#详细文档)
- [API 参考](#api-参考)
- [示例](#示例)
- [测试](#测试)
- [最佳实践](#最佳实践)
- [已知限制](#已知限制)

## 概述

Orchestrator 是回测框架的核心编排模块，提供了完整的会话管理、生命周期控制、模块协调和状态管理能力。它将所有底层模块（数据、特征、事件、策略、风控、执行、账本）整合在一起，提供统一的接口来创建和管理回测会话。

### 主要特性

✅ **会话管理** - 创建、获取、列出、销毁回测会话  
✅ **生命周期控制** - 启动、暂停、恢复、停止、定位  
✅ **模块协调** - 自动初始化和协调8个核心模块  
✅ **快照管理** - 创建、列出、恢复会话快照  
✅ **结果收集** - 统一的结果收集和导出接口  
✅ **配置管理** - 自动配置合并、验证和应用  
✅ **依赖注入** - 基于 DI 容器的模块管理  
✅ **事件驱动** - 完整的事件发布和订阅机制

## 核心功能

### 1. 配置管理 ✅

完整的配置管理体系，支持配置合并、验证和应用。

**核心特性**:
- 17个配置接口（Session、Data、Strategy、Execution等）
- 多层配置合并（用户配置 + 策略配置 + 默认配置）
- 完整的配置验证（schema、约束、依赖）
- 配置模板和预设

📄 [配置管理完成总结](./M3-01-A-COMPLETION-SUMMARY.md)

### 2. 依赖注入容器 ✅

灵活的服务容器，支持服务注册、解析和生命周期管理。

**核心特性**:
- ServiceContainer 接口和实现
- 29个预定义服务Token
- Singleton/Transient 生命周期
- 自动依赖解析
- 循环依赖检测

📄 [DI容器完成总结](./M3-01-B-COMPLETION-SUMMARY.md)

### 3. 会话状态机 ✅

严格的状态机管理，确保会话状态转换的正确性。

**核心特性**:
- 8个会话状态（Idle、Initializing、Running、Paused、Stopping、Stopped、Destroying、Destroyed）
- 10个事件类型（StateChanged、Started、Paused、Resumed、Stopped等）
- 状态转换验证
- 状态历史追踪
- 事件发布和订阅

📄 [会话状态机完成总结](./M3-01-C-COMPLETION-SUMMARY.md)

### 4. 编排器核心 ✅

完整的编排器实现，提供会话管理、生命周期控制、快照管理和结果收集。

**核心特性**:
- 会话管理（创建、获取、列出、销毁）
- 生命周期控制（start、pause、resume、stop、seek）
- 模块协调（8个模块的自动初始化）
- 快照管理（创建、列出、恢复）
- 结果收集（统一的结果接口）

📄 [编排器核心完成总结](./M3-01-D-COMPLETION-SUMMARY.md)

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator 架构                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Orchestrator (编排器)                     │   │
│  │  • createSession()    会话创建                      │   │
│  │  • start/pause/resume 生命周期控制                  │   │
│  │  • createSnapshot()   快照管理                      │   │
│  │  • getResults()       结果收集                      │   │
│  └────────────┬────────────────────────────────────────┘   │
│               │                                             │
│               ├─────────────────────────────────────────┐   │
│               │                                         │   │
│  ┌────────────▼───────────┐    ┌────────────▼─────────┐   │
│  │  ModuleCoordinator     │    │  ServiceContainer     │   │
│  │  • 模块初始化          │    │  • 服务注册           │   │
│  │  • 状态收集            │    │  • 依赖解析           │   │
│  │  • 状态恢复            │    │  • 生命周期管理       │   │
│  └────────────┬───────────┘    └────────────┬─────────┘   │
│               │                             │               │
│               └──────────┬──────────────────┘               │
│                          │                                  │
│            ┌─────────────┴─────────────┐                    │
│            │                           │                    │
│   ┌────────▼────────┐     ┌───────────▼──────────┐         │
│   │  M1: 数据与总线  │     │  M2: 策略/风控/执行   │         │
│   │  • DataProvider │     │  • StrategySandbox   │         │
│   │  • EventBus     │     │  • RiskEngine        │         │
│   │  • FeatureReg   │     │  • ExecutionEngine   │         │
│   │  • TimeframeAdp │     │  • LedgerService     │         │
│   └─────────────────┘     └──────────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 模块结构

```
orchestrator/
├── config/                    # 配置管理
│   ├── defaults.ts           # 默认配置
│   ├── merger.ts             # 配置合并
│   ├── validator.ts          # 配置验证
│   └── index.ts              # 导出
├── container/                 # 依赖注入容器
│   ├── service-container.ts  # 容器实现
│   ├── tokens.ts             # 服务Token
│   └── index.ts              # 导出
├── session/                   # 会话管理
│   ├── session.ts            # 会话实现
│   ├── session-state-machine.ts  # 状态机
│   └── index.ts              # 导出
├── orchestrator/              # 编排器核心
│   ├── orchestrator.ts       # 编排器实现
│   ├── module-coordinator.ts # 模块协调器
│   └── index.ts              # 导出
├── interfaces/                # 接口定义
│   ├── config.ts             # 配置接口
│   ├── container.ts          # 容器接口
│   ├── session.ts            # 会话接口
│   └── orchestrator.ts       # 编排器接口
├── examples/                  # 示例代码
│   ├── basic-example.ts      # 基础示例
│   └── advanced-example.ts   # 高级示例
├── __tests__/                 # 测试
│   ├── config.test.ts        # 配置测试 (12个)
│   ├── container.test.ts     # 容器测试 (19个)
│   ├── session.test.ts       # 会话测试 (20个)
│   ├── orchestrator.spec.ts  # 编排器测试 (16个)
│   └── integration.spec.ts   # 集成测试 (16个)
├── README.md                  # 本文档
└── index.ts                   # 主入口
```

## 快速开始

### 安装

```bash
npm install
```

### 基础使用

```typescript
import {
  createOrchestrator,
  createModuleCoordinator,
  type BacktestSessionConfig,
} from './orchestrator';

// 1. 创建编排器
const moduleCoordinator = createModuleCoordinator();
const orchestrator = createOrchestrator(moduleCoordinator);

// 2. 定义配置
const config: BacktestSessionConfig = {
  sessionId: 'my-backtest',
  data: {
    source: 'parquet',
    basePath: '/data',
    symbol: 'BTCUSDT',
    startTime: '2024-01-01',
    endTime: '2024-12-31',
  },
  strategy: {
    strategyId: 'ma-crossover',
    version: '1.0.0',
    name: 'MA Crossover',
    description: 'Moving average crossover strategy',
    scriptPath: './strategies/ma-crossover.js',
  },
  execution: {
    initialCapital: 10000,
    leverage: 1,
    slippageModel: { type: 'fixed', value: 0.001 },
    feeModel: {
      type: 'percentage',
      makerFee: 0.001,
      takerFee: 0.002,
    },
  },
};

// 3. 创建会话
const session = await orchestrator.createSession(config);

// 4. 启动回测
await orchestrator.start('my-backtest');

// 5. 控制会话
await orchestrator.pause('my-backtest');
await orchestrator.resume('my-backtest');

// 6. 创建快照
const checkpointId = await orchestrator.createSnapshot(
  'my-backtest',
  'mid-test checkpoint'
);

// 7. 获取结果
const results = await orchestrator.getResults('my-backtest');
console.log('Results:', results);

// 8. 清理
await orchestrator.destroySession('my-backtest');
```

## 详细文档

### 配置管理

#### 配置结构

```typescript
interface BacktestSessionConfig {
  // 会话基本信息
  sessionId: string;                    // 会话ID
  
  // 数据配置
  data: DataConfig;                     // 数据源配置
  
  // 策略配置
  strategy: StrategyConfig;             // 策略配置
  
  // 执行配置
  execution: ExecutionConfig;           // 执行参数
  
  // 可选配置
  timeframe?: TimeframeConfig;          // 时间框架
  risk?: RiskConfig;                    // 风险控制
  analytics?: AnalyticsConfig;          // 分析配置
  output?: OutputConfig;                // 输出配置
  log?: LogConfig;                      // 日志配置
}
```

#### 配置合并

配置按以下优先级合并：
1. **用户配置** (最高优先级)
2. **策略配置** (中等优先级)
3. **默认配置** (最低优先级)

```typescript
import { mergeConfig } from './orchestrator';

const userConfig = { /* ... */ };
const mergedConfig = mergeConfig(userConfig);
```

#### 配置验证

所有配置都会经过严格验证：

```typescript
import { validateConfig } from './orchestrator';

const result = validateConfig(config);
if (!result.valid) {
  console.error('配置错误:', result.errors);
}
```

### 会话管理

#### 创建会话

```typescript
const session = await orchestrator.createSession(config);
console.log('会话状态:', session.getState());
```

#### 获取会话

```typescript
const session = orchestrator.getSession('session-id');
if (session) {
  console.log('找到会话:', session.getState());
}
```

#### 列出会话

```typescript
const sessions = orchestrator.listSessions();
console.log(`总共 ${sessions.length} 个会话`);
```

#### 销毁会话

```typescript
await orchestrator.destroySession('session-id');
```

#### 销毁所有会话

```typescript
await orchestrator.destroyAll();
```

### 生命周期控制

#### 状态转换图

```
Idle → Initializing → Running → Paused → Running → Stopping → Stopped
                         ↓                            ↓
                      Stopping → Stopped           Stopped
                                    ↓
                                Destroying → Destroyed
```

#### 启动会话

```typescript
await orchestrator.start('session-id');
```

#### 暂停会话

```typescript
await orchestrator.pause('session-id');
```

#### 恢复会话

```typescript
await orchestrator.resume('session-id');
```

#### 停止会话

```typescript
await orchestrator.stop('session-id', '用户停止');
```

#### 定位到指定序列号

```typescript
await orchestrator.seek('session-id', 'sequence-id-100');
```

### 快照管理

#### 创建快照

```typescript
const checkpointId = await orchestrator.createSnapshot(
  'session-id',
  '每日快照'
);
console.log('快照ID:', checkpointId);
```

#### 列出快照

```typescript
const snapshots = await orchestrator.listSnapshots('session-id');
snapshots.forEach(snapshot => {
  console.log(`${snapshot.checkpointId}: ${snapshot.reason}`);
});
```

#### 恢复快照

```typescript
await orchestrator.restoreSnapshot('session-id', checkpointId);
```

### 结果收集

```typescript
const results = await orchestrator.getResults('session-id');

console.log('会话ID:', results.sessionId);
console.log('状态:', results.status);
console.log('持续时间:', results.duration, 'ms');
console.log('已处理事件:', results.stats.processedEvents);
console.log('错误数:', results.stats.errorCount);

if (results.trades) {
  console.log('交易数:', results.trades.length);
}

if (results.metrics) {
  console.log('性能指标:', results.metrics);
}
```

### 事件监听

```typescript
session.on(SessionEventType.StateChanged, (event) => {
  console.log(`状态变化: ${event.oldState} -> ${event.newState}`);
});

session.on(SessionEventType.Started, () => {
  console.log('会话已启动');
});

session.on(SessionEventType.Paused, () => {
  console.log('会话已暂停');
});

session.on(SessionEventType.Error, (event) => {
  console.error('错误:', event.error);
});

session.on(SessionEventType.Progress, (event) => {
  console.log(`进度: ${event.progress}%`);
});
```

## API 参考

### Orchestrator 接口

```typescript
interface Orchestrator {
  // 会话管理
  createSession(config: BacktestSessionConfig): Promise<Session>;
  getSession(sessionId: string): Session | undefined;
  listSessions(): Session[];
  destroySession(sessionId: string): Promise<void>;
  destroyAll(): Promise<void>;
  
  // 生命周期控制
  start(sessionId: string): Promise<void>;
  pause(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
  stop(sessionId: string, reason?: string): Promise<void>;
  seek(sessionId: string, sequenceId: string): Promise<void>;
  
  // 快照管理
  createSnapshot(sessionId: string, reason?: string): Promise<string>;
  listSnapshots(sessionId: string): Promise<CheckpointMeta[]>;
  restoreSnapshot(sessionId: string, checkpointId: string): Promise<void>;
  
  // 结果收集
  getResults(sessionId: string): Promise<SessionResults>;
}
```

### Session 接口

```typescript
interface Session {
  // 状态查询
  getState(): SessionState;
  getStats(): SessionStats;
  getMetadata(): SessionMetadata;
  canTransitionTo(newState: SessionState): boolean;
  
  // 生命周期控制
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  
  // 事件监听
  on(event: SessionEventType, handler: (event: SessionEvent) => void): void;
  off(event: SessionEventType, handler: (event: SessionEvent) => void): void;
}
```

完整 API 文档请参考 [API.md](./API.md)

## 示例

### 基础示例

📄 [基础示例](./examples/basic-example.ts)

演示如何创建和管理单个回测会话。

```bash
ts-node examples/basic-example.ts
```

### 高级示例

📄 [高级示例](./examples/advanced-example.ts)

演示高级功能：
- 多会话并行运行
- 快照管理和恢复
- 事件监听和处理
- 错误处理和恢复

```bash
ts-node examples/advanced-example.ts
```

## 测试

### 运行所有测试

```bash
npm test -- orchestrator
```

### 运行单元测试

```bash
npm test -- config.test.ts        # 配置管理测试 (12个)
npm test -- container.test.ts     # DI容器测试 (19个)
npm test -- session.test.ts       # 会话测试 (20个)
npm test -- orchestrator.spec.ts  # 编排器测试 (16个)
```

### 运行集成测试

```bash
npm test -- integration.spec.ts   # 集成测试 (16个)
```

### 测试覆盖率

```bash
npm run test:cov
```

### 测试统计

| 模块 | 测试数 | 覆盖率 | 状态 |
|------|--------|--------|------|
| 配置管理 | 12 | ~95% | ✅ |
| DI容器 | 19 | ~98% | ✅ |
| 会话状态机 | 20 | ~100% | ✅ |
| 编排器核心 | 16 | ~90% | ✅ |
| 集成测试 | 16 | ~85% | ✅ |
| **总计** | **83** | **~93%** | **✅** |

## 最佳实践

### 1. 配置管理

- ✅ 使用配置模板和预设
- ✅ 在创建会话前验证配置
- ✅ 分离不同环境的配置
- ✅ 使用环境变量管理敏感信息

```typescript
// 使用配置模板
const baseConfig = {
  data: { /* 数据配置 */ },
  execution: { /* 执行配置 */ },
};

// 创建特定策略的配置
const strategyConfig = {
  ...baseConfig,
  strategy: { /* 策略配置 */ },
};
```

### 2. 会话管理

- ✅ 使用有意义的会话ID
- ✅ 及时清理不需要的会话
- ✅ 监控会话状态和统计
- ✅ 处理会话事件

```typescript
// 使用描述性的会话ID
const sessionId = `${strategyId}_${symbol}_${Date.now()}`;

// 监控会话
session.on(SessionEventType.Error, (event) => {
  logger.error('会话错误:', event.error);
  // 处理错误...
});

// 及时清理
try {
  // 运行回测...
} finally {
  await orchestrator.destroySession(sessionId);
}
```

### 3. 快照管理

- ✅ 定期创建快照
- ✅ 使用有意义的快照原因
- ✅ 限制快照数量
- ✅ 快照持久化（生产环境）

```typescript
// 定期创建快照
setInterval(async () => {
  const checkpointId = await orchestrator.createSnapshot(
    sessionId,
    `自动快照 ${new Date().toISOString()}`
  );
  logger.info('快照创建:', checkpointId);
}, 60000); // 每分钟

// 限制快照数量
const snapshots = await orchestrator.listSnapshots(sessionId);
if (snapshots.length > 10) {
  // 删除最旧的快照...
}
```

### 4. 错误处理

- ✅ 使用 try-catch 包裹异步操作
- ✅ 区分不同类型的错误
- ✅ 记录错误日志
- ✅ 实现错误恢复机制

```typescript
try {
  await orchestrator.start(sessionId);
} catch (error) {
  if (error instanceof SessionNotFoundError) {
    logger.error('会话不存在:', sessionId);
  } else if (error instanceof InvalidSessionStateError) {
    logger.error('无效的状态转换');
  } else {
    logger.error('未知错误:', error);
  }
  
  // 错误恢复...
}
```

### 5. 性能优化

- ✅ 并行创建多个会话
- ✅ 使用连接池
- ✅ 限制并发会话数
- ✅ 监控内存使用

```typescript
// 并行创建会话
const sessions = await Promise.all(
  configs.map(config => orchestrator.createSession(config))
);

// 限制并发
const limit = 5;
for (let i = 0; i < configs.length; i += limit) {
  const batch = configs.slice(i, i + limit);
  await Promise.all(
    batch.map(config => orchestrator.createSession(config))
  );
}
```

## 已知限制

### 当前限制

1. **快照存储** - 当前使用内存存储，生产环境需要持久化
2. **服务容器配置** - `createServiceContainer()` 方法需要完善服务注册
3. **并发限制** - 大量并发会话可能导致内存压力
4. **状态持久化** - 会话状态在进程重启后丢失

### 待优化

- [ ] 快照持久化（文件系统或数据库）
- [ ] 会话状态持久化
- [ ] 结果导出功能增强
- [ ] 性能监控和指标收集
- [ ] 分布式会话管理
- [ ] 自动错误恢复机制
- [ ] 会话优先级和调度

## 进度与里程碑

### M3-01 子任务进度

- [x] **M3-01-A: 配置管理与验证** ✅ (100%)
  - 17个配置接口
  - 配置合并器、验证器
  - 12个单元测试

- [x] **M3-01-B: 依赖注入容器** ✅ (100%)
  - ServiceContainer 实现
  - 29个服务Token
  - 19个单元测试

- [x] **M3-01-C: 会话状态机** ✅ (100%)
  - 8状态状态机
  - Session 实现
  - 20个单元测试

- [x] **M3-01-D: 编排器核心** ✅ (100%)
  - Orchestrator 实现
  - ModuleCoordinator 实现
  - 16个单元测试

- [x] **M3-01-E: 集成测试与文档** ✅ (100%)
  - 16个集成测试
  - 完整文档
  - 示例代码

### 代码统计

```
总代码量: ~8,500行
  • 接口定义: ~1,000行
  • 实现代码: ~5,500行
  • 测试代码: ~2,000行
  
测试统计: 83个单元测试
  • 配置管理: 12个
  • DI容器: 19个
  • 会话状态机: 20个
  • 编排器核心: 16个
  • 集成测试: 16个
  
测试覆盖率: ~93%
```

## 相关文档

- [配置管理完成总结](./M3-01-A-COMPLETION-SUMMARY.md)
- [DI容器完成总结](./M3-01-B-COMPLETION-SUMMARY.md)
- [会话状态机完成总结](./M3-01-C-COMPLETION-SUMMARY.md)
- [编排器核心完成总结](./M3-01-D-COMPLETION-SUMMARY.md)
- [M3-01-E完成总结](./M3-01-E-COMPLETION-SUMMARY.md)
- [任务拆分文档](../../docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/M3-01-TASK-BREAKDOWN.md)
- [回测框架总体架构](../../docs/prd/backtesting-strategy-management/backtest-framework-architecture/README.md)

## 许可证

MIT

---

**最后更新**: 2024-11-07  
**版本**: 1.0.0  
**状态**: ✅ 已完成 (100%)
