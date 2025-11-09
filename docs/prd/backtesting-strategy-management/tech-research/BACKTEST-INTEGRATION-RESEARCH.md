# 回测框架集成技术预研

> **预研负责人**: 后端负责人  
> **预研时间**: 2024-11-09 ~ 2024-11-11  
> **预研状态**: 📅 待开始  
> **优先级**: 🔥 P0

---

## 📋 预研目标

研究如何将回测框架（Orchestrator）与回测任务管理模块进行集成，确保：
1. 接口契约清晰
2. 数据流转顺畅
3. 错误处理完善
4. 性能满足要求

---

## 🎯 关键问题

### 1. 接口集成方式

**问题描述**:
- 回测任务管理如何调用Orchestrator？
- 是直接调用还是通过消息队列？
- 如何处理长时间运行的任务？

**需要研究**:
- [ ] Orchestrator的启动方式（API/CLI/SDK）
- [ ] 会话管理机制
- [ ] 状态回调机制
- [ ] 进度报告机制

**技术选型**:
- 方案A: 直接调用Orchestrator SDK
- 方案B: 通过消息队列（Redis/BullMQ）异步调用
- 方案C: 通过HTTP API调用

---

### 2. 配置传递

**问题描述**:
- 回测任务的配置如何转换为Orchestrator需要的配置？
- 策略脚本如何传递？
- 数据集如何关联？

**需要研究**:
- [ ] BacktestSessionConfig的完整结构
- [ ] 策略Manifest的生成方式
- [ ] 数据集路径的解析
- [ ] 参数校验流程

**配置映射**:
```typescript
// 回测任务配置
interface BacktestTaskConfig {
  strategyId: string;
  scriptVersionId: string;
  datasetId: string;
  parameters: Record<string, any>;
  executionOptions: {
    initialCapital: number;
    slippage: SlippageConfig;
    fee: FeeConfig;
  };
}

// Orchestrator配置
interface BacktestSessionConfig {
  sessionId: string;
  data: DataConfig;
  strategy: StrategyConfig;
  execution: ExecutionConfig;
  risk: RiskConfig;
  analytics?: AnalyticsConfig;
  output?: OutputConfig;
}

// 需要实现转换函数
function convertToSessionConfig(
  taskConfig: BacktestTaskConfig
): BacktestSessionConfig {
  // TODO: 实现转换逻辑
}
```

---

### 3. 状态同步

**问题描述**:
- 如何实时获取回测任务的执行状态？
- 如何处理任务暂停/恢复/终止？
- 如何获取实时日志？

**需要研究**:
- [ ] Orchestrator的状态机
- [ ] 控制事件的触发方式
- [ ] 日志流的订阅机制
- [ ] 进度更新的频率

**状态映射**:
```typescript
// Orchestrator状态
enum SessionState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  STOPPED = 'stopped'
}

// 任务状态
enum TaskStatus {
  SUBMITTED = 'submitted',
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// 需要实现状态映射
function mapSessionStateToTaskStatus(
  sessionState: SessionState
): TaskStatus {
  // TODO: 实现映射逻辑
}
```

---

### 4. 结果收集

**问题描述**:
- 回测完成后如何获取结果？
- 结果数据的格式是什么？
- 如何存储到数据库？

**需要研究**:
- [ ] 结果输出的位置和格式
- [ ] Ledger数据的读取方式
- [ ] Analytics数据的结构
- [ ] Parquet文件的解析

**结果结构**:
```typescript
interface BacktestResult {
  sessionId: string;
  status: 'completed' | 'failed';
  
  // 性能指标
  metrics: {
    totalReturn: number;
    annualizedReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
    // ... 更多指标
  };
  
  // 交易记录
  trades: Array<TradeRecord>;
  
  // 权益曲线
  equityCurve: Array<{
    timestamp: number;
    equity: number;
    drawdown: number;
  }>;
  
  // 日志文件路径
  logPath: string;
  
  // Parquet文件路径
  ledgerPath: string;
}
```

---

### 5. 错误处理

**问题描述**:
- 如何处理回测执行中的错误？
- 如何区分不同类型的错误？
- 如何向用户展示错误信息？

**需要研究**:
- [ ] Orchestrator的错误类型
- [ ] 错误的捕获和传递
- [ ] 错误日志的记录
- [ ] 用户友好的错误提示

**错误分类**:
```typescript
enum BacktestErrorType {
  // 配置错误
  CONFIG_INVALID = 'config_invalid',
  STRATEGY_NOT_FOUND = 'strategy_not_found',
  DATASET_NOT_FOUND = 'dataset_not_found',
  
  // 执行错误
  STRATEGY_RUNTIME_ERROR = 'strategy_runtime_error',
  DATA_LOADING_ERROR = 'data_loading_error',
  RISK_ENGINE_ERROR = 'risk_engine_error',
  
  // 系统错误
  OUT_OF_MEMORY = 'out_of_memory',
  TIMEOUT = 'timeout',
  UNKNOWN_ERROR = 'unknown_error'
}
```

---

### 6. 性能优化

**问题描述**:
- 如何支持并发回测任务？
- 如何控制资源占用？
- 如何优化大数据集的处理？

**需要研究**:
- [ ] 并发控制策略
- [ ] 资源限制配置
- [ ] 内存优化方案
- [ ] 数据分片加载

---

## 🔬 POC计划

### POC 1: 基础集成
**目标**: 验证能否成功调用Orchestrator并运行简单回测

**步骤**:
1. 创建测试策略脚本
2. 准备测试数据集
3. 构建SessionConfig
4. 调用Orchestrator启动回测
5. 监听状态变化
6. 获取结果

**预期结果**:
- [ ] 能够成功启动回测
- [ ] 能够获取状态更新
- [ ] 能够获取最终结果

**代码示例**:
```typescript
// POC测试代码
async function testBasicIntegration() {
  // 1. 准备配置
  const config: BacktestSessionConfig = {
    sessionId: 'test-session-001',
    data: {
      provider: 'parquet-duckdb',
      source: '/path/to/dataset.parquet',
      timeframe: '1m'
    },
    strategy: {
      scriptPath: '/path/to/strategy.ts',
      parameters: { period: 20 }
    },
    execution: {
      initialCapital: 100000,
      slippage: { type: 'fixed', value: 0.0001 }
    },
    risk: {
      maxOrderSize: 1000
    }
  };
  
  // 2. 创建Orchestrator实例
  const orchestrator = new Orchestrator(config);
  
  // 3. 订阅状态变化
  orchestrator.on('stateChange', (state) => {
    console.log('State:', state);
  });
  
  // 4. 启动回测
  await orchestrator.start();
  
  // 5. 等待完成
  await orchestrator.waitForCompletion();
  
  // 6. 获取结果
  const result = await orchestrator.getResult();
  console.log('Result:', result);
}
```

---

### POC 2: 状态控制
**目标**: 验证暂停/恢复/终止功能

**步骤**:
1. 启动长时间运行的回测
2. 测试暂停功能
3. 测试恢复功能
4. 测试终止功能

**预期结果**:
- [ ] 能够暂停正在运行的回测
- [ ] 能够恢复暂停的回测
- [ ] 能够终止回测
- [ ] 状态转换正确

---

### POC 3: 实时日志
**目标**: 验证实时日志推送功能

**步骤**:
1. 订阅日志流
2. 启动回测
3. 接收实时日志
4. 测试日志过滤

**预期结果**:
- [ ] 能够接收实时日志
- [ ] 日志延迟 < 500ms
- [ ] 支持日志分级

---

## 📊 技术方案对比

### 方案A: 直接SDK调用

**优点**:
- ✅ 调用简单直接
- ✅ 性能最优
- ✅ 错误处理容易

**缺点**:
- ❌ 耦合度高
- ❌ 难以横向扩展
- ❌ 进程管理复杂

**适用场景**: 单机部署，任务量不大

---

### 方案B: 消息队列异步调用

**优点**:
- ✅ 解耦性好
- ✅ 易于横向扩展
- ✅ 支持任务优先级
- ✅ 支持重试机制

**缺点**:
- ❌ 增加系统复杂度
- ❌ 需要额外的消息队列服务
- ❌ 调试相对困难

**适用场景**: 分布式部署，高并发任务

**技术选型**: BullMQ (基于Redis)

```typescript
// 使用BullMQ的示例
import { Queue, Worker } from 'bullmq';

// 创建任务队列
const backtestQueue = new Queue('backtest-tasks', {
  connection: redisConnection
});

// 添加任务
await backtestQueue.add('run-backtest', {
  taskId: 'task-001',
  config: sessionConfig
});

// 创建Worker处理任务
const worker = new Worker('backtest-tasks', async (job) => {
  const { taskId, config } = job.data;
  
  // 运行回测
  const orchestrator = new Orchestrator(config);
  await orchestrator.start();
  
  // 更新进度
  await job.updateProgress(50);
  
  // 等待完成
  const result = await orchestrator.waitForCompletion();
  
  return result;
}, {
  connection: redisConnection
});
```

---

### 方案C: HTTP API调用

**优点**:
- ✅ 语言无关
- ✅ 易于部署
- ✅ 支持远程调用

**缺点**:
- ❌ 需要实现HTTP服务
- ❌ 长连接管理复杂
- ❌ 性能开销较大

**适用场景**: 微服务架构，跨语言调用

---

## 🎯 推荐方案

### 初期（MVP）: 方案A - 直接SDK调用
**理由**:
- 快速实现，降低初期复杂度
- 满足单机部署需求
- 便于调试和问题排查

### 中期（扩展）: 方案B - 消息队列异步调用
**理由**:
- 支持横向扩展
- 提升系统可靠性
- 支持更多高级特性

### 迁移路径:
1. 封装统一的BacktestExecutor接口
2. 初期使用DirectExecutor实现
3. 后期替换为QueueExecutor实现
4. 业务代码无需改动

```typescript
// 统一接口
interface BacktestExecutor {
  submit(config: BacktestSessionConfig): Promise<string>;
  getStatus(sessionId: string): Promise<SessionState>;
  pause(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  getResult(sessionId: string): Promise<BacktestResult>;
}

// 直接执行器
class DirectExecutor implements BacktestExecutor {
  // 实现...
}

// 队列执行器
class QueueExecutor implements BacktestExecutor {
  // 实现...
}
```

---

## 📅 预研时间表

| 日期 | 任务 | 产出 |
|------|------|------|
| 2024-11-09 | 文档调研 | 理解Orchestrator接口 |
| 2024-11-10 | POC 1 | 基础集成验证 |
| 2024-11-10 | POC 2 | 状态控制验证 |
| 2024-11-11 | POC 3 | 实时日志验证 |
| 2024-11-11 | 方案设计 | 完整技术方案文档 |

---

## ✅ 交付物

- [ ] 技术预研报告（本文档）
- [ ] POC代码示例
- [ ] 接口设计文档
- [ ] 集成方案设计
- [ ] 风险评估报告

---

## 📞 联系方式

- **预研负责人**: 后端负责人
- **技术支持**: 回测框架团队
- **Slack频道**: #trading-backtest-project

---

**文档维护**: 后端负责人  
**最后更新**: 2024-11-09  
**版本**: v1.0

