# 回测任务管理 - 需求对齐文档

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**对齐目的**: 确保开发方向正确，避免返工

---

## 📋 对齐议程

1. [核心功能确认](#1-核心功能确认)
2. [技术架构对齐](#2-技术架构对齐)
3. [与现有模块的关系](#3-与现有模块的关系)
4. [关键决策点](#4-关键决策点)
5. [功能边界](#5-功能边界)
6. [待澄清问题](#6-待澄清问题)

---

## 1. 核心功能确认

### 1.1 最小可行产品（MVP）

**核心功能**:
- ✅ 创建回测任务（选择策略版本 + 数据集 + 配置参数）
- ✅ 执行回测任务（调用Orchestrator）
- ✅ 查看任务列表（分页、筛选、状态）
- ✅ 查看任务详情（状态、进度、日志）
- ✅ 基础任务操作（取消任务）

**可选功能**（V1.1或更后版本）:
- ⚠️ 任务暂停/恢复
- ⚠️ 快照管理
- ⚠️ 任务重试
- ⚠️ 任务优先级
- ⚠️ 并发任务限制配置

### 1.2 用户故事确认

#### 故事1：创建回测任务
```
作为策略开发者，
我想基于某个策略版本创建回测任务，
以便验证策略在历史数据上的表现。

验收标准：
- 可以选择已有的策略和版本
- 可以选择已清洗的数据集
- 可以配置策略参数（根据Schema动态生成表单）
- 可以配置执行参数（初始资金、手续费等）
- 提交后任务进入执行队列
```

#### 故事2：监控任务执行
```
作为策略开发者，
我想实时查看任务的执行进度和日志，
以便了解回测的运行情况。

验收标准：
- 可以看到任务状态（排队/运行中/完成/失败）
- 可以看到执行进度（百分比）
- 可以看到实时日志
- 可以看到关键指标（已处理事件数、当前时间等）
```

#### 故事3：查看任务结果
```
作为策略开发者，
我想在任务完成后查看回测结果，
以便分析策略的绩效。

验收标准：
- 任务完成后可以跳转到结果分析页面
- 可以看到基础绩效指标（收益率、最大回撤等）
- 可以看到交易明细
```

**🔴 问题1**: 以上用户故事是否完整？是否有遗漏的核心场景？

---

## 2. 技术架构对齐

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面层                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 任务列表页面  │  │ 创建任务页面  │  │ 任务详情页面  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP API
┌─────────────────────────────────────────────────────────────┐
│                    后端 API 层（NestJS）                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           TaskController                              │   │
│  │  - listTasks()                                        │   │
│  │  - createTask()                                       │   │
│  │  - getTaskDetail()                                    │   │
│  │  - cancelTask()                                       │   │
│  │  - getTaskLogs()                                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    服务层（Business Logic）                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ TaskService  │  │TaskScheduler │  │ TaskExecutor │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    任务队列层（Bull + Redis）                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Bull Queue: backtest-tasks                    │   │
│  │  - 任务入队、出队                                      │   │
│  │  - 并发控制                                           │   │
│  │  - 重试机制                                           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              回测执行层（Orchestrator - 已完成）              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Orchestrator                                  │   │
│  │  - createSession()                                    │   │
│  │  - start()                                            │   │
│  │  - getResults()                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  M1: DataProvider, EventBus, Features                       │
│  M2: Strategy, Risk, Execution, Ledger                      │
│  M3: Snapshot, Analytics                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    数据持久层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PostgreSQL   │  │  File System │  │    Redis     │      │
│  │ (任务元数据)  │  │  (快照数据)   │  │  (队列状态)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**🔴 问题2**: 这个架构是否合理？是否有更好的方案？

---

### 2.2 核心组件职责

#### TaskService
- **职责**: 任务的CRUD操作
- **方法**:
  - `createTask()`: 验证参数，创建任务记录
  - `listTasks()`: 查询任务列表
  - `getTaskById()`: 查询任务详情
  - `updateTaskStatus()`: 更新任务状态
  - `deleteTask()`: 删除任务

#### TaskScheduler
- **职责**: 任务调度，管理队列
- **方法**:
  - `scheduleTask()`: 将任务加入队列
  - `getQueueStatus()`: 获取队列状态
  - `setTaskPriority()`: 设置任务优先级（可选）

#### TaskExecutor
- **职责**: 执行回测任务，调用Orchestrator
- **方法**:
  - `executeTask()`: 执行单个任务
  - `setupOrchestrator()`: 配置Orchestrator
  - `handleProgress()`: 处理进度回调
  - `handleCompletion()`: 处理完成事件
  - `handleError()`: 处理错误

**🔴 问题3**: 这个职责划分是否清晰？是否需要调整？

---

### 2.3 与Orchestrator的集成方式

#### 方案A：直接调用（推荐）

```typescript
class TaskExecutor {
  async executeTask(taskId: string) {
    const task = await this.taskService.getTaskById(taskId);
    
    // 1. 创建Orchestrator配置
    const config = {
      sessionId: taskId,
      data: {
        source: 'parquet',
        basePath: task.dataset.path,
        symbol: task.dataset.symbol,
        // ...
      },
      strategy: {
        strategyId: task.strategy.id,
        scriptPath: task.scriptVersion.path,
        params: task.strategyParams,
      },
      execution: task.executionConfig,
    };
    
    // 2. 创建会话
    const orchestrator = createOrchestrator(moduleCoordinator);
    const session = await orchestrator.createSession(config);
    
    // 3. 监听事件
    session.on(SessionEventType.Progress, (event) => {
      this.updateProgress(taskId, event.progress);
    });
    
    session.on(SessionEventType.Completed, () => {
      this.handleCompletion(taskId);
    });
    
    session.on(SessionEventType.Error, (error) => {
      this.handleError(taskId, error);
    });
    
    // 4. 启动会话
    await orchestrator.start(taskId);
    
    // 5. 等待完成
    // ... (实际会在事件回调中处理)
  }
}
```

**优点**:
- 简单直接
- 充分利用已有功能
- 状态同步清晰

**缺点**:
- 任务执行在API进程中，可能影响API响应

#### 方案B：Worker进程执行

```typescript
// Bull队列的Processor
@Processor('backtest-tasks')
class BacktestTaskProcessor {
  @Process()
  async handleTask(job: Job) {
    const taskId = job.data.taskId;
    // ... 调用Orchestrator（同方案A）
  }
}
```

**优点**:
- 任务执行独立于API进程
- 更好的资源隔离
- 支持分布式执行

**缺点**:
- 稍微复杂一些
- 需要配置Worker进程

**✅ 已确认**: 使用方案A（API进程直接执行），后期可优化到方案B（Worker进程）

---

## 3. 与现有模块的关系

### 3.1 依赖关系

```
回测任务管理模块
    ├── 依赖：策略管理模块（阶段1）✅
    │   └── 读取策略和脚本版本信息
    ├── 依赖：交易数据管理模块 ✅
    │   └── 读取数据集信息
    ├── 依赖：Orchestrator（M3）✅
    │   └── 执行回测
    └── 被依赖：结果分析模块（阶段3）⏸️
        └── 提供任务ID和结果数据路径
```

### 3.2 数据流

```
1. 用户创建任务
   ↓
2. TaskService 创建任务记录（DB）
   ↓
3. TaskScheduler 加入队列（Redis）
   ↓
4. TaskExecutor 出队并执行
   ↓
5. 调用 Orchestrator.createSession()
   ↓
6. Orchestrator 执行回测
   ├── 发送进度事件 → TaskExecutor → 更新DB
   ├── 记录日志 → TaskExecutor → 写入DB
   └── 完成 → TaskExecutor → 更新状态 + 结果摘要
   ↓
7. 用户查看结果（阶段3）
```

**🔴 问题5**: 这个数据流是否完整？是否有遗漏的环节？

---

### 3.3 数据库表关系

```sql
-- 已有表（阶段1）
strategies (策略表)
script_versions (脚本版本表)

-- 已有表（交易数据管理）
datasets (数据集表)

-- 新增表（阶段2）
backtest_tasks (回测任务表)
  ├── strategy_id → strategies.strategy_id
  ├── script_version_id → script_versions.script_version_id
  └── dataset_id → datasets.dataset_id

task_logs (任务日志表)
  └── task_id → backtest_tasks.task_id

task_snapshots (任务快照表)
  └── task_id → backtest_tasks.task_id

-- 未来表（阶段3）
backtest_results (回测结果表)
  └── task_id → backtest_tasks.task_id
```

**🔴 问题6**: 是否需要在阶段2就创建 backtest_results 表？还是留到阶段3？

---

## 4. 关键决策点

### 决策1：任务状态设计

**选项A：简化状态**（推荐MVP）
```
submitted → queued → running → (completed | failed | cancelled)
```

**选项B：完整状态**
```
submitted → queued → running → (completed | failed)
                ↓         ↓
              paused   cancelled
                ↓
             queued (恢复)
```

**✅ 已确认决策**: MVP使用选项A（简化状态），V1.1再支持暂停/恢复

---

### 决策2：日志存储方式

**选项A：全部存入PostgreSQL**
- 优点：查询方便，事务性强
- 缺点：日志量大时性能下降

**选项B：PostgreSQL + 文件系统**
- 优点：灵活，可以归档
- 缺点：查询稍复杂

**选项C：PostgreSQL（近期） + 归档（历史）**
- 优点：平衡性能和查询便利性
- 缺点：需要归档机制

**✅ 已确认决策**: MVP使用选项A（全部存PostgreSQL），后期优化到选项C（归档历史日志）

---

### 决策3：实时通信方式

**选项A：SSE（Server-Sent Events）**
- 优点：单向推送，简单
- 缺点：只能服务器推送到客户端

**选项B：WebSocket**
- 优点：双向通信
- 缺点：复杂度高

**选项C：轮询**
- 优点：最简单
- 缺点：延迟高，请求多

**✅ 已确认决策**: 使用SSE推送日志，轮询查询进度（简单有效）

---

### 决策4：并发任务数限制

**方案A：硬编码**
```typescript
const MAX_CONCURRENT_TASKS = 5;
```

**方案B：配置文件**
```yaml
backtest:
  maxConcurrentTasks: 5
```

**方案C：动态配置（数据库）**
```sql
system_config
  key: 'backtest.maxConcurrentTasks'
  value: '5'
```

**✅ 已确认决策**: MVP使用方案B（配置文件：maxConcurrentTasks: 5），易于调整

---

### 决策5：任务结果存储

**方案A：复用Orchestrator的结果**
- 结果由Orchestrator直接写入Parquet
- 任务表只存储结果文件路径

**方案B：任务模块负责结果收集**
- 从Orchestrator获取结果
- 写入自己的结果表

**✅ 已确认决策**: 使用方案A（复用Orchestrator结果），任务表只存结果文件路径

---

## 5. 功能边界

### 5.1 本阶段实现

✅ **确定实现**:
1. 任务CRUD
2. 任务创建向导（4步）
3. 任务列表（分页、筛选）
4. 任务详情（状态、进度）
5. 实时日志查看
6. 取消任务
7. 调用Orchestrator执行
8. 基础错误处理

### 5.2 本阶段不实现

❌ **明确不实现**（留到V1.1或更后）:
1. 任务暂停/恢复
2. 任务重试
3. 快照管理
4. 任务优先级
5. 批量操作
6. 任务模板
7. 任务克隆
8. 分布式执行
9. 资源配额管理

### 5.3 可选功能（待讨论）

⚠️ **可选实现**:
1. 任务搜索（关键词）
2. 任务标签
3. 任务备注
4. 预估执行时间
5. 执行历史对比

**🔴 问题7**: 以上可选功能是否要在MVP中实现？哪些必须要有？

---

## 6. 待澄清问题

### 问题列表

| ID | 问题 | 优先级 | 状态 |
|----|------|--------|------|
| Q1 | 用户故事是否完整？ | 🔴 高 | ⏸️ 待讨论 |
| Q2 | 整体架构是否合理？ | 🔴 高 | ⏸️ 待讨论 |
| Q3 | 组件职责划分是否清晰？ | 🔴 高 | ⏸️ 待讨论 |
| Q4 | 使用方案A还是方案B执行任务？ | 🔴 高 | ⏸️ 待讨论 |
| Q5 | 数据流是否完整？ | 🟡 中 | ⏸️ 待讨论 |
| Q6 | 是否需要提前创建结果表？ | 🟡 中 | ⏸️ 待讨论 |
| Q7 | 哪些可选功能必须实现？ | 🟡 中 | ⏸️ 待讨论 |
| Q8 | 是否需要任务执行超时控制？ | 🟡 中 | ⏸️ 待讨论 |
| Q9 | 任务失败后是否自动重试？ | 🟡 中 | ⏸️ 待讨论 |
| Q10 | 是否需要任务执行通知（邮件/钉钉）？ | 🟢 低 | ⏸️ 待讨论 |

---

## 7. 建议的MVP范围

基于以上分析，建议MVP包含：

### 核心功能
1. ✅ 任务创建（4步向导）
2. ✅ 任务列表（分页、基础筛选）
3. ✅ 任务详情（状态、进度、日志）
4. ✅ 取消任务
5. ✅ 调用Orchestrator执行
6. ✅ 基础错误处理

### 技术方案
1. ✅ 方案A：直接调用Orchestrator（简单快速）
2. ✅ Bull队列用于任务调度
3. ✅ SSE推送日志，轮询查询进度
4. ✅ PostgreSQL存储任务和日志
5. ✅ 配置文件设置并发数

### 延后功能（V1.1）
1. ⏸️ 任务暂停/恢复
2. ⏸️ 快照管理
3. ⏸️ 任务重试
4. ⏸️ Worker进程执行
5. ⏸️ 分布式调度

---

## 8. 下一步行动

### 立即行动
1. ✅ 完成需求对齐会议
2. ⏸️ 确认MVP范围
3. ⏸️ 确认关键决策点
4. ⏸️ 更新DASHBOARD.md

### 后续行动
1. ⏸️ 开始数据库设计
2. ⏸️ 开始API设计
3. ⏸️ 研究Bull队列
4. ⏸️ 设计前端原型

---

## 9. 会议记录模板

### 需求对齐会议（待召开）

**日期**: TBD  
**参与人**: TBD  
**议程**: 讨论本文档中的所有待确认项

**讨论要点**:
- [ ] 确认用户故事
- [ ] 确认架构方案
- [ ] 确认技术选型
- [ ] 确认MVP范围
- [ ] 分配任务

**会议产出**:
- 更新后的需求文档
- 确认的技术方案
- 明确的任务分配

---

## 附录：参考资料

### A. Orchestrator使用示例

参考已有示例：
- `backend/src/backtesting/orchestrator/examples/basic-example.ts`
- `backend/src/backtesting/e2e-tests/examples/business-backtest.ts`

### B. Bull队列文档

- [Bull文档](https://docs.bullmq.io/)
- [NestJS Bull集成](https://docs.nestjs.com/techniques/queues)

### C. SSE实现参考

```typescript
// NestJS SSE示例
@Sse('logs/stream')
logStream(@Param('taskId') taskId: string): Observable<MessageEvent> {
  return interval(1000).pipe(
    map(() => ({
      data: { logs: this.getRecentLogs(taskId) },
    })),
  );
}
```

---

**文档状态**: 🟡 待对齐  
**最后更新**: 2025-11-12  
**下次审查**: 待安排

