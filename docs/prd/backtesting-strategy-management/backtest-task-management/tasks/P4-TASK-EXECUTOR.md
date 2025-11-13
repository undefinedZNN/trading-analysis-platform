# Phase 4: 任务执行与调度 - 详细任务

**阶段状态**: ⚪ 待开始  
**完成进度**: 0% (0/10)  
**预计完成**: 2025-11-20  
**优先级**: 🔴 P0（核心功能）

---

## 📋 阶段目标

实现回测任务的自动执行能力，让任务从 `pending` 状态自动转换到 `running`，并调用 Orchestrator 完成回测计算。

**核心目标**：
1. ✅ 实现 TaskExecutor 服务（调用 Orchestrator）
2. ✅ 实现任务状态机和状态转换逻辑
3. ✅ 实现进度追踪和数据库更新
4. ✅ 实现日志收集和存储
5. ✅ 实现错误处理和任务失败逻辑

**不包含**（后期优化）：
- ❌ Bull 队列（先直接执行，Phase 5优化）
- ❌ 任务暂停/恢复（Phase 5）
- ❌ 任务优先级调度（Phase 5）
- ❌ 分布式执行（Phase 5）

---

## 📋 任务列表

### ⚪ P4-01: TaskExecutor 服务创建 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 0.5天  
**优先级**: P0

**任务描述**:
创建 TaskExecutor 服务的基础架构和接口定义。

**完成内容**:
- [ ] 创建 `backend/src/backtesting/tasks/task-executor.service.ts`
- [ ] 定义 TaskExecutor 接口
- [ ] 实现基础的 `executeTask(taskId)` 方法框架
- [ ] 注入 BacktestTasksService 和 TaskLogsService
- [ ] 添加日志记录器

**代码结构**:
```typescript
@Injectable()
export class TaskExecutorService {
  constructor(
    private readonly tasksService: BacktestTasksService,
    private readonly logsService: TaskLogsService,
  ) {}
  
  async executeTask(taskId: string): Promise<void> {
    // TODO: 实现
  }
  
  private async prepareTaskConfig(task: BacktestTaskEntity) {
    // 准备 Orchestrator 配置
  }
  
  private async handleProgress(taskId: string, progress: number) {
    // 处理进度更新
  }
  
  private async handleCompletion(taskId: string, result: any) {
    // 处理完成事件
  }
  
  private async handleError(taskId: string, error: Error) {
    // 处理错误
  }
}
```

**验收标准**:
- [ ] 服务类创建成功
- [ ] 可以通过 DI 注入其他服务
- [ ] 基础方法签名定义完整

---

### ⚪ P4-02: Orchestrator 集成准备 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 0.5天  
**优先级**: P0

**任务描述**:
准备与 Orchestrator 模块集成所需的依赖和配置。

**完成内容**:
- [ ] 导入 Orchestrator 相关模块
- [ ] 研究 Orchestrator API 使用方式
- [ ] 创建配置转换工具（Task → Orchestrator Config）
- [ ] 处理策略脚本加载逻辑
- [ ] 处理数据集路径解析

**关键代码**:
```typescript
private async prepareOrchestratorConfig(
  task: BacktestTaskEntity
): Promise<OrchestratorConfig> {
  // 1. 加载策略脚本
  const strategy = await this.strategiesService.findOne(task.strategyId);
  const version = strategy.scriptVersions.find(v => v.scriptVersionId === task.scriptVersionId);
  
  // 2. 加载数据集信息
  const dataset = await this.datasetsService.findOne(task.datasetId);
  
  // 3. 构建配置
  return {
    sessionId: task.taskId,
    strategy: {
      code: version.code,
      params: task.strategyParams,
    },
    data: {
      source: 'parquet',
      path: dataset.path,
      symbol: dataset.tradingPair,
      granularity: task.dataConfig.timeframe || dataset.granularity,
      timeRange: task.dataConfig.timeRange,
    },
    execution: task.executionConfig,
  };
}
```

**验收标准**:
- [ ] 可以成功导入 Orchestrator 模块
- [ ] 配置转换逻辑正确
- [ ] 可以加载策略脚本和数据集

---

### ⚪ P4-03: 实现 executeTask 核心逻辑 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 2天  
**优先级**: P0 ⭐ **核心**

**任务描述**:
实现任务执行的核心流程，调用 Orchestrator 并处理回调。

**完成内容**:
- [ ] 实现完整的 `executeTask()` 方法
- [ ] 调用 Orchestrator API 创建会话
- [ ] 订阅 Orchestrator 事件（进度、完成、错误）
- [ ] 实现状态转换逻辑（pending → running → completed/failed）
- [ ] 实现进度更新逻辑
- [ ] 实现结果保存逻辑

**核心流程**:
```typescript
async executeTask(taskId: string): Promise<void> {
  try {
    // 1. 获取任务
    const task = await this.tasksService.findOne(taskId);
    
    // 2. 验证状态
    if (task.status !== BacktestTaskStatus.PENDING) {
      throw new Error(`Task ${taskId} is not in pending status`);
    }
    
    // 3. 更新状态为 running
    await this.tasksService.updateStatus(taskId, BacktestTaskStatus.RUNNING);
    await this.logsService.info(taskId, 'TaskExecutor', 'Task execution started');
    
    // 4. 准备配置
    const config = await this.prepareOrchestratorConfig(task);
    
    // 5. 创建 Orchestrator 会话
    const orchestrator = this.createOrchestrator();
    const session = await orchestrator.createSession(config);
    
    // 6. 订阅事件
    this.subscribeToEvents(session, taskId);
    
    // 7. 启动执行
    await orchestrator.start(taskId);
    
    // 8. 等待完成（通过事件处理）
    
  } catch (error) {
    await this.handleError(taskId, error);
  }
}

private subscribeToEvents(session: any, taskId: string) {
  // 进度事件
  session.on('progress', async (event) => {
    await this.handleProgress(taskId, event.progress);
  });
  
  // 完成事件
  session.on('completed', async (result) => {
    await this.handleCompletion(taskId, result);
  });
  
  // 错误事件
  session.on('error', async (error) => {
    await this.handleError(taskId, error);
  });
  
  // 日志事件
  session.on('log', async (log) => {
    await this.logsService.create({
      taskId,
      level: log.level,
      module: log.module,
      message: log.message,
      metadata: log.metadata,
    });
  });
}
```

**验收标准**:
- [ ] 可以成功启动任务执行
- [ ] 状态正确转换
- [ ] 事件订阅工作正常
- [ ] 错误处理完善

---

### ⚪ P4-04: 实现进度追踪 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 0.5天  
**优先级**: P0

**任务描述**:
实现任务执行进度的实时追踪和数据库更新。

**完成内容**:
- [ ] 实现 `handleProgress()` 方法
- [ ] 更新数据库中的 progress 字段
- [ ] 添加进度日志
- [ ] 实现进度节流（避免频繁更新数据库）

**代码实现**:
```typescript
private progressUpdateThrottle = new Map<string, number>();
private readonly PROGRESS_UPDATE_INTERVAL = 1000; // 1秒

private async handleProgress(taskId: string, progress: number): Promise<void> {
  // 节流：每秒最多更新一次
  const lastUpdate = this.progressUpdateThrottle.get(taskId) || 0;
  const now = Date.now();
  
  if (now - lastUpdate < this.PROGRESS_UPDATE_INTERVAL && progress < 100) {
    return;
  }
  
  this.progressUpdateThrottle.set(taskId, now);
  
  // 更新数据库
  await this.tasksService.updateProgress(taskId, progress);
  
  // 记录日志（每10%记录一次）
  if (progress % 10 === 0) {
    await this.logsService.info(
      taskId,
      'TaskExecutor',
      `Progress: ${progress}%`
    );
  }
}
```

**验收标准**:
- [ ] 进度更新到数据库
- [ ] 节流机制生效
- [ ] 日志记录正确

---

### ⚪ P4-05: 实现完成处理 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 1天  
**优先级**: P0

**任务描述**:
处理任务完成后的结果保存和状态更新。

**完成内容**:
- [ ] 实现 `handleCompletion()` 方法
- [ ] 从 Orchestrator 结果中提取回测指标
- [ ] 保存 resultSummary 到数据库
- [ ] 保存结果文件路径（如果有）
- [ ] 更新任务状态为 completed
- [ ] 设置 completedAt 时间
- [ ] 记录完成日志

**代码实现**:
```typescript
private async handleCompletion(taskId: string, result: any): Promise<void> {
  this.logger.log(`Task ${taskId} completed successfully`);
  
  try {
    // 1. 提取结果摘要
    const resultSummary = this.extractResultSummary(result);
    
    // 2. 保存结果文件（如果有详细数据）
    let resultFilePath: string | undefined;
    if (result.detailedData) {
      resultFilePath = await this.saveResultFile(taskId, result.detailedData);
    }
    
    // 3. 更新任务状态
    await this.tasksService.update(taskId, {
      status: BacktestTaskStatus.COMPLETED,
      progress: 100,
      completedAt: new Date(),
      resultSummary,
      resultFilePath,
    });
    
    // 4. 记录日志
    await this.logsService.info(
      taskId,
      'TaskExecutor',
      'Task completed successfully',
      { resultSummary }
    );
    
    // 5. 清理资源
    this.progressUpdateThrottle.delete(taskId);
    
  } catch (error) {
    this.logger.error(`Failed to save task result: ${error.message}`);
    throw error;
  }
}

private extractResultSummary(result: any): ResultSummary {
  return {
    totalReturn: result.metrics?.totalReturn || 0,
    annualizedReturn: result.metrics?.annualizedReturn || 0,
    maxDrawdown: result.metrics?.maxDrawdown || 0,
    sharpeRatio: result.metrics?.sharpeRatio || 0,
    winRate: result.metrics?.winRate || 0,
    profitLossRatio: result.metrics?.profitLossRatio || 0,
    totalTrades: result.trades?.length || 0,
    finalCapital: result.portfolio?.equity || 0,
    processedBars: result.processedBars || 0,
    executionTime: result.executionTime || 0,
  };
}
```

**验收标准**:
- [ ] 结果正确保存到数据库
- [ ] 状态正确更新
- [ ] 完成时间记录正确
- [ ] 日志完整

---

### ⚪ P4-06: 实现错误处理 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 0.5天  
**优先级**: P0

**任务描述**:
实现任务执行失败时的错误处理和状态更新。

**完成内容**:
- [ ] 实现 `handleError()` 方法
- [ ] 保存错误信息到数据库
- [ ] 保存错误堆栈
- [ ] 更新任务状态为 failed
- [ ] 记录错误日志
- [ ] 清理资源

**代码实现**:
```typescript
private async handleError(taskId: string, error: Error): Promise<void> {
  this.logger.error(`Task ${taskId} failed: ${error.message}`);
  
  try {
    // 1. 更新任务状态
    await this.tasksService.update(taskId, {
      status: BacktestTaskStatus.FAILED,
      completedAt: new Date(),
      errorMessage: error.message,
      errorStack: error.stack,
    });
    
    // 2. 记录错误日志
    await this.logsService.error(
      taskId,
      'TaskExecutor',
      `Task execution failed: ${error.message}`,
      { 
        errorStack: error.stack,
        errorName: error.name,
      }
    );
    
    // 3. 清理资源
    this.progressUpdateThrottle.delete(taskId);
    
  } catch (saveError) {
    this.logger.error(
      `Failed to save error state for task ${taskId}: ${saveError.message}`
    );
  }
}
```

**验收标准**:
- [ ] 错误信息保存到数据库
- [ ] 状态正确更新为 failed
- [ ] 错误日志记录
- [ ] 不会导致系统崩溃

---

### ⚪ P4-07: 实现任务取消功能 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 0.5天  
**优先级**: P1

**任务描述**:
实现正在运行的任务的取消功能。

**完成内容**:
- [ ] 在 TaskExecutor 中实现 `cancelTask()` 方法
- [ ] 停止 Orchestrator 会话
- [ ] 更新任务状态为 cancelled
- [ ] 记录取消日志
- [ ] 清理资源

**代码实现**:
```typescript
private activeSessions = new Map<string, any>();

async cancelTask(taskId: string): Promise<void> {
  this.logger.log(`Cancelling task ${taskId}`);
  
  try {
    // 1. 检查任务状态
    const task = await this.tasksService.findOne(taskId);
    if (task.status !== BacktestTaskStatus.RUNNING) {
      throw new BadRequestException('Only running tasks can be cancelled');
    }
    
    // 2. 停止 Orchestrator 会话
    const session = this.activeSessions.get(taskId);
    if (session) {
      await session.stop();
      this.activeSessions.delete(taskId);
    }
    
    // 3. 更新状态
    await this.tasksService.update(taskId, {
      status: BacktestTaskStatus.CANCELLED,
      completedAt: new Date(),
    });
    
    // 4. 记录日志
    await this.logsService.info(
      taskId,
      'TaskExecutor',
      'Task cancelled by user'
    );
    
    // 5. 清理资源
    this.progressUpdateThrottle.delete(taskId);
    
  } catch (error) {
    this.logger.error(`Failed to cancel task ${taskId}: ${error.message}`);
    throw error;
  }
}
```

**验收标准**:
- [ ] 可以取消正在运行的任务
- [ ] Orchestrator 会话正确停止
- [ ] 状态正确更新
- [ ] 资源正确清理

---

### ⚪ P4-08: 实现手动触发接口 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 0.5天  
**优先级**: P1

**任务描述**:
在 Controller 中添加手动触发任务执行的接口。

**完成内容**:
- [ ] 在 BacktestTasksController 中添加 `POST /tasks/:taskId/execute` 端点
- [ ] 添加 Swagger 文档
- [ ] 调用 TaskExecutor.executeTask()
- [ ] 返回执行状态

**代码实现**:
```typescript
// backend/src/backtesting/tasks/backtest-tasks.controller.ts

@Post(':taskId/execute')
@ApiOperation({
  summary: '手动执行任务',
  description: '手动触发 pending 状态的任务开始执行',
})
@ApiParam({
  name: 'taskId',
  description: '任务ID',
  type: 'string',
})
@ApiOkResponse({
  description: '任务开始执行',
})
@ApiBadRequestResponse({
  description: '任务状态不允许执行',
})
async executeTask(
  @Param('taskId', ParseUUIDPipe) taskId: string,
): Promise<{ message: string }> {
  // 异步执行，不等待完成
  this.taskExecutor.executeTask(taskId).catch(error => {
    this.logger.error(`Task execution failed: ${error.message}`);
  });
  
  return {
    message: 'Task execution started',
  };
}
```

**验收标准**:
- [ ] API 端点创建成功
- [ ] Swagger 文档完整
- [ ] 可以通过 API 触发任务执行
- [ ] 异步执行不阻塞响应

---

### ⚪ P4-09: 单元测试 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 1天  
**优先级**: P1

**任务描述**:
为 TaskExecutor 编写完整的单元测试。

**完成内容**:
- [ ] 创建 `task-executor.service.spec.ts`
- [ ] Mock Orchestrator 依赖
- [ ] 测试 executeTask 正常流程
- [ ] 测试进度更新
- [ ] 测试完成处理
- [ ] 测试错误处理
- [ ] 测试取消功能
- [ ] 测试边界条件

**测试用例**:
```typescript
describe('TaskExecutorService', () => {
  describe('executeTask', () => {
    it('should execute task successfully', async () => {
      // ...
    });
    
    it('should handle progress updates', async () => {
      // ...
    });
    
    it('should handle completion', async () => {
      // ...
    });
    
    it('should handle errors', async () => {
      // ...
    });
    
    it('should reject non-pending tasks', async () => {
      // ...
    });
  });
  
  describe('cancelTask', () => {
    it('should cancel running task', async () => {
      // ...
    });
    
    it('should reject non-running tasks', async () => {
      // ...
    });
  });
});
```

**验收标准**:
- [ ] 测试覆盖率 ≥ 80%
- [ ] 所有测试通过
- [ ] 测试用例完整

---

### ⚪ P4-10: 集成测试和文档 (必做)
**状态**: ⚪ 待开始  
**预计时间**: 1天  
**优先级**: P1

**任务描述**:
进行端到端集成测试，并完善文档。

**完成内容**:
- [ ] 创建集成测试脚本
- [ ] 测试完整的任务执行流程
- [ ] 验证数据库状态变化
- [ ] 验证日志记录
- [ ] 更新 API_EXAMPLES.md
- [ ] 更新 README.md
- [ ] 创建使用指南

**集成测试脚本**:
```bash
#!/bin/bash
# test-task-execution.sh

echo "=== 回测任务执行集成测试 ==="

# 1. 创建任务
TASK_ID=$(curl -s -X POST http://localhost:3000/api/v1/backtesting/tasks \
  -H "Content-Type: application/json" \
  -d '{ ... }' | jq -r '.taskId')

echo "Task created: $TASK_ID"

# 2. 触发执行
curl -X POST http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID/execute

# 3. 监控进度
while true; do
  STATUS=$(curl -s http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID | jq -r '.status')
  PROGRESS=$(curl -s http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID | jq -r '.progress')
  
  echo "Status: $STATUS, Progress: $PROGRESS%"
  
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  
  sleep 5
done

# 4. 验证结果
echo "=== Task Result ==="
curl -s http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID | jq '.resultSummary'
```

**验收标准**:
- [ ] 集成测试通过
- [ ] 文档更新完整
- [ ] 可以按照文档完成任务执行

---

## 📊 Phase 4 总结

### 完成情况
- **待完成**: 10/10 (0%)
- **预计耗时**: 约 8 天
- **预计代码量**: ~2000 行

### 交付成果
1. **TaskExecutor 服务**: 完整的任务执行引擎
2. **Orchestrator 集成**: 策略脚本执行能力
3. **进度追踪**: 实时进度更新
4. **日志收集**: 完整的执行日志
5. **错误处理**: 健壮的异常处理
6. **API 接口**: 手动触发执行
7. **单元测试**: ≥80% 覆盖率
8. **集成测试**: 端到端验证
9. **文档**: 使用指南和示例

### 依赖关系
- **依赖**: Phase 1（数据库和API）✅
- **被依赖**: Phase 5（优化和高级特性）

### 风险评估
- 🟡 **中风险**: Orchestrator 集成复杂度未知
- 🟢 **低风险**: 数据库和 API 已完成
- 🟡 **中风险**: 错误处理需要考虑各种异常情况

### 下一步
完成 Phase 4 后，系统将具备：
- ✅ 完整的任务创建能力（Phase 1）
- ✅ 完整的前端界面（Phase 2-3）
- ✅ **完整的任务执行能力（Phase 4）** ⭐
- ⏳ 性能优化和高级特性（Phase 5）

---

**文档版本**: 1.0  
**创建时间**: 2025-11-13  
**维护者**: Backend Team

