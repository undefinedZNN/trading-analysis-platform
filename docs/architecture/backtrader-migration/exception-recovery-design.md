# 异常恢复设计方案

**版本**: v1.0  
**创建时间**: 2025-11-20  
**状态**: 需求调研阶段

---

## 📋 核心问题

1. **Worker 崩溃处理**：Worker 进程崩溃时，正在执行的任务如何处理？
2. **断点续跑**：是否支持从中断点继续执行？
3. **任务队列持久化**：Worker 重启后，未完成的任务如何恢复？
4. **数据一致性**：崩溃时如何保证数据完整性？
5. **错误分类**：如何区分可恢复错误和不可恢复错误？
6. **告警通知**：异常时如何通知管理员和用户？

---

## 🎯 异常场景分析

### 场景 1：Worker 进程崩溃

```
Worker 正在执行回测任务
  ↓
突然崩溃（OOM / 代码错误 / 系统重启）
  ↓
任务状态：RUNNING
问题：
  - 任务永远卡在 RUNNING 状态
  - 用户不知道任务失败了
  - 资源无法释放
```

**需求**：
- ✅ 检测 Worker 崩溃
- ✅ 更新任务状态为 FAILED
- ✅ 通知用户
- ✅ 清理资源

---

### 场景 2：网络中断

```
Worker 正在执行任务
  ↓
网络中断（无法发送心跳、无法上传结果）
  ↓
Backend 认为 Worker 离线
  ↓
任务状态：？
```

**需求**：
- ✅ Worker 心跳超时检测
- ✅ 标记任务为 TIMEOUT
- ✅ 可选：重新调度任务

---

### 场景 3：任务执行超时

```
用户提交了一个回测任务
  ↓
预计 10 分钟完成
  ↓
实际运行了 2 小时还没完成（可能死循环）
  ↓
需要强制终止
```

**需求**：
- ✅ 任务超时检测
- ✅ 强制终止任务
- ✅ 释放资源

---

### 场景 4：数据损坏

```
Worker 正在写入结果文件
  ↓
突然崩溃
  ↓
结果文件不完整（Parquet 文件损坏）
  ↓
Backend 无法读取结果
```

**需求**：
- ✅ 原子写入（临时文件 + 重命名）
- ✅ 写入失败时自动清理
- ✅ 结果文件校验

---

### 场景 5：RabbitMQ 连接断开

```
Worker 正在执行任务
  ↓
RabbitMQ 连接断开
  ↓
无法发送进度更新
  ↓
任务完成后无法发送结果
```

**需求**：
- ✅ 自动重连 RabbitMQ
- ✅ 消息缓存（连接恢复后重新发送）
- ✅ 结果文件持久化（即使消息丢失，Backend 也能读取）

---

## 📊 异常恢复方案

### 方案 A：基础版（任务失败标记）

**特点**：
- 检测异常
- 标记任务失败
- 不支持自动恢复

**实现**：

#### 1. Worker 心跳检测

```typescript
// Backend: 定时检查 Worker 心跳
@Cron('*/30 * * * * *')  // 每 30 秒检查一次
async checkWorkerHeartbeats() {
  const workers = await this.workerRepo.find({
    where: { status: 'online' }
  });
  
  const now = new Date();
  const timeout = 60 * 1000;  // 60 秒超时
  
  for (const worker of workers) {
    const lastHeartbeat = new Date(worker.last_heartbeat);
    const elapsed = now.getTime() - lastHeartbeat.getTime();
    
    if (elapsed > timeout) {
      // Worker 心跳超时
      console.warn(`Worker ${worker.worker_id} heartbeat timeout`);
      
      // 标记 Worker 为离线
      await this.workerRepo.update(worker.worker_id, {
        status: 'offline',
        offline_at: now
      });
      
      // 查找该 Worker 正在执行的任务
      const runningTasks = await this.backtestTaskRepo.find({
        where: {
          worker_id: worker.worker_id,
          status: 'RUNNING'
        }
      });
      
      // 标记任务为失败
      for (const task of runningTasks) {
        await this.backtestTaskRepo.update(task.task_id, {
          status: 'FAILED',
          error_message: 'Worker crashed or disconnected',
          completed_at: now
        });
        
        // 发送失败通知
        await this.notificationService.notifyTaskFailed(task);
      }
    }
  }
}
```

#### 2. 任务超时检测

```typescript
// Backend: 定时检查任务超时
@Cron('0 */5 * * * *')  // 每 5 分钟检查一次
async checkTaskTimeouts() {
  const now = new Date();
  
  // 查找运行中的任务
  const runningTasks = await this.backtestTaskRepo.find({
    where: { status: 'RUNNING' }
  });
  
  for (const task of runningTasks) {
    // 计算运行时长
    const startedAt = new Date(task.started_at);
    const elapsedMinutes = (now.getTime() - startedAt.getTime()) / (1000 * 60);
    
    // 检查是否超过用户设置的超时时间
    const userTimeout = task.config?.timeout_minutes || 60;  // 默认 60 分钟
    const systemMaxTimeout = 48 * 60;  // 系统硬限制 48 小时
    
    if (elapsedMinutes > Math.min(userTimeout, systemMaxTimeout)) {
      console.warn(`Task ${task.task_id} timeout after ${elapsedMinutes} minutes`);
      
      // 标记任务为超时失败
      await this.backtestTaskRepo.update(task.task_id, {
        status: 'FAILED',
        error_message: `Task timeout after ${elapsedMinutes.toFixed(1)} minutes`,
        completed_at: now
      });
      
      // 发送超时通知
      await this.notificationService.notifyTaskTimeout(task);
      
      // 通知 Worker 终止任务（如果 Worker 还在线）
      if (task.worker_id) {
        await this.sendCancelTask(task.worker_id, task.task_id);
      }
    }
  }
}
```

#### 3. Worker 端异常捕获

```python
import signal
import sys

class BacktestWorker:
    def __init__(self):
        self.current_task_id = None
        self.setup_signal_handlers()
    
    def setup_signal_handlers(self):
        """设置信号处理器"""
        signal.signal(signal.SIGTERM, self.handle_shutdown)
        signal.signal(signal.SIGINT, self.handle_shutdown)
    
    def handle_shutdown(self, signum, frame):
        """优雅关闭"""
        print(f"⚠️ Received signal {signum}, shutting down gracefully...")
        
        if self.current_task_id:
            # 发送任务失败消息
            self.send_task_failed(
                self.current_task_id,
                error="Worker shutting down"
            )
        
        # 清理资源
        self.cleanup()
        sys.exit(0)
    
    def execute_task(self, task):
        self.current_task_id = task['task_id']
        
        try:
            # 执行回测
            result = self.run_backtest(task)
            
            # 发送成功消息
            self.send_task_completed(task['task_id'], result)
            
        except Exception as e:
            # 捕获所有异常
            print(f"❌ Task {task['task_id']} failed: {e}")
            
            # 发送失败消息
            self.send_task_failed(
                task['task_id'],
                error=str(e),
                traceback=traceback.format_exc()
            )
        
        finally:
            self.current_task_id = None
            # 清理临时文件
            self.cleanup_temp_files(task['task_id'])
```

#### 4. 原子写入结果文件

```python
def save_results_atomically(self, task_id, trades_df, metrics):
    """原子写入结果文件"""
    result_dir = f'/data/backtests/{task_id}'
    os.makedirs(result_dir, exist_ok=True)
    
    # 写入临时文件
    temp_trades_file = f'{result_dir}/trades.parquet.tmp'
    temp_result_file = f'{result_dir}/result.json.tmp'
    
    try:
        # 写入交易数据
        trades_df.to_parquet(temp_trades_file)
        
        # 写入统计结果
        with open(temp_result_file, 'w') as f:
            json.dump(metrics, f, indent=2)
        
        # 校验文件完整性（可选）
        self.verify_parquet_file(temp_trades_file)
        self.verify_json_file(temp_result_file)
        
        # 原子重命名（成功后才会对外可见）
        os.rename(temp_trades_file, f'{result_dir}/trades.parquet')
        os.rename(temp_result_file, f'{result_dir}/result.json')
        
        print(f"✅ Results saved for task {task_id}")
        
    except Exception as e:
        # 写入失败，清理临时文件
        print(f"❌ Failed to save results: {e}")
        
        if os.path.exists(temp_trades_file):
            os.remove(temp_trades_file)
        if os.path.exists(temp_result_file):
            os.remove(temp_result_file)
        
        raise
```

**优点**：
- ✅ 实现简单
- ✅ 覆盖主要异常场景
- ✅ 数据一致性有保障

**缺点**：
- ⚠️ 任务失败后不会自动重试
- ⚠️ 不支持断点续跑

---

### 方案 B：自动重试

**特点**：
- 检测异常
- 自动重试失败任务
- 重试次数限制

**实现**：

```typescript
// Backend: 失败任务自动重试
@Cron('0 */1 * * * *')  // 每分钟检查一次
async retryFailedTasks() {
  const failedTasks = await this.backtestTaskRepo.find({
    where: {
      status: 'FAILED',
      retry_count: LessThan(3),  // 最多重试 3 次
      error_type: Not('USER_ERROR')  // 不重试用户代码错误
    }
  });
  
  for (const task of failedTasks) {
    // 判断错误类型，决定是否重试
    if (this.isRetryableError(task.error_message)) {
      console.log(`♻️ Retrying task ${task.task_id} (attempt ${task.retry_count + 1})`);
      
      // 增加重试计数
      await this.backtestTaskRepo.update(task.task_id, {
        retry_count: task.retry_count + 1,
        status: 'PENDING',  // 重新入队
        error_message: null
      });
      
      // 重新提交任务到 RabbitMQ
      await this.taskQueue.sendTask(task);
    }
  }
}

isRetryableError(errorMessage: string): boolean {
  // 可重试的错误类型
  const retryableErrors = [
    'Worker crashed',
    'Worker disconnected',
    'Network error',
    'RabbitMQ connection lost',
    'Temporary file system error'
  ];
  
  return retryableErrors.some(err => errorMessage.includes(err));
}
```

**错误分类**：

| 错误类型 | 是否重试 | 示例 |
|---------|---------|------|
| **Worker 崩溃** | ✅ 重试 | Worker crashed, Worker disconnected |
| **网络错误** | ✅ 重试 | Network error, RabbitMQ connection lost |
| **资源不足** | ✅ 重试（延迟） | Out of memory, Disk full |
| **用户代码错误** | ❌ 不重试 | SyntaxError, NameError, TypeError |
| **数据错误** | ❌ 不重试 | Data not found, Invalid parameter |
| **超时** | ⚠️ 可选 | Task timeout |

**优点**：
- ✅ 自动恢复瞬时故障
- ✅ 提高成功率

**缺点**：
- ⚠️ 可能浪费资源（重复执行）
- ⚠️ 需要正确分类错误

---

### 方案 C：断点续跑（Checkpointing） ⭐ 高级

**特点**：
- 定期保存任务进度（Checkpoint）
- 崩溃后从最近的 Checkpoint 恢复
- 避免重新执行整个任务

**实现**：

```python
class BacktestWorker:
    def run_backtest_with_checkpointing(self, task):
        task_id = task['task_id']
        checkpoint_dir = f'/data/backtests/{task_id}/checkpoints'
        os.makedirs(checkpoint_dir, exist_ok=True)
        
        # 1. 检查是否有 Checkpoint
        checkpoint = self.load_checkpoint(checkpoint_dir)
        
        if checkpoint:
            print(f"🔄 Resuming from checkpoint: {checkpoint['datetime']}")
            # 从 Checkpoint 恢复状态
            cerebro = self.restore_cerebro_state(checkpoint)
            start_idx = checkpoint['data_index']
        else:
            print(f"🚀 Starting new backtest")
            cerebro = self.init_cerebro(task)
            start_idx = 0
        
        # 2. 执行回测，定期保存 Checkpoint
        total_bars = len(task['data'])
        checkpoint_interval = 1000  # 每 1000 根K线保存一次
        
        for idx in range(start_idx, total_bars):
            # 运行一根K线
            cerebro.next()
            
            # 定期保存 Checkpoint
            if idx % checkpoint_interval == 0:
                self.save_checkpoint(checkpoint_dir, {
                    'datetime': cerebro.datetime.datetime(),
                    'data_index': idx,
                    'account_value': cerebro.broker.getvalue(),
                    'positions': cerebro.broker.positions,
                    'trades': cerebro.trades,
                    # ... 更多状态
                })
                
                # 更新进度
                progress = idx / total_bars
                self.send_progress(task_id, progress)
        
        # 3. 完成后删除 Checkpoint
        self.cleanup_checkpoints(checkpoint_dir)
        
        return cerebro.get_results()
    
    def save_checkpoint(self, checkpoint_dir, state):
        """保存 Checkpoint"""
        checkpoint_file = f'{checkpoint_dir}/latest.pkl'
        temp_file = f'{checkpoint_file}.tmp'
        
        try:
            # 序列化状态
            with open(temp_file, 'wb') as f:
                pickle.dump(state, f)
            
            # 原子重命名
            os.rename(temp_file, checkpoint_file)
            print(f"✅ Checkpoint saved: {state['datetime']}")
            
        except Exception as e:
            print(f"⚠️ Failed to save checkpoint: {e}")
            if os.path.exists(temp_file):
                os.remove(temp_file)
    
    def load_checkpoint(self, checkpoint_dir):
        """加载 Checkpoint"""
        checkpoint_file = f'{checkpoint_dir}/latest.pkl'
        
        if not os.path.exists(checkpoint_file):
            return None
        
        try:
            with open(checkpoint_file, 'rb') as f:
                return pickle.load(f)
        except Exception as e:
            print(f"⚠️ Failed to load checkpoint: {e}")
            return None
```

**Checkpoint 策略**：

| 策略 | Checkpoint 频率 | 恢复时间 | 存储开销 |
|------|---------------|---------|---------|
| **不保存** | - | - | 无 |
| **按时间** | 每 5 分钟 | 最多重跑 5 分钟 | 中 |
| **按进度** | 每 10% | 最多重跑 10% | 低 |
| **按K线数** | 每 1000 根 | 取决于数据量 | 低 |

**优点**：
- ✅ 大任务崩溃后不用从头开始
- ✅ 显著减少重跑时间

**缺点**：
- ⚠️ 实现复杂
- ⚠️ Checkpoint 序列化开销
- ⚠️ Backtrader 状态难以完整序列化

**适用场景**：
- 长时间运行的回测（> 1 小时）
- 大数据量回测
- Worker 不稳定的环境

---

## 🎯 推荐方案

### MVP 阶段：方案 A（基础版） ⭐⭐⭐

**理由**：
- ✅ 实现简单
- ✅ 覆盖主要场景
- ✅ 数据一致性有保障
- ✅ 满足基本需求

**实现优先级**：
1. ✅ Worker 心跳检测
2. ✅ 任务超时检测
3. ✅ Worker 异常捕获
4. ✅ 原子写入结果文件

---

### 正式生产（可选）：方案 A + 方案 B（自动重试）

**理由**：
- ✅ 提高系统鲁棒性
- ✅ 减少人工干预

**渐进式升级**：
- 第一阶段：方案 A（基础异常处理）
- 第二阶段：方案 B（自动重试，仅限特定错误）
- 第三阶段（可选）：方案 C（断点续跑，仅限长任务）

---

## 📊 告警通知

### 告警级别

| 级别 | 场景 | 通知对象 | 通知方式 |
|------|------|---------|---------|
| **INFO** | 任务开始、完成 | 用户 | 站内消息 |
| **WARNING** | Worker 心跳超时、任务重试 | 管理员 | 邮件 |
| **ERROR** | 任务失败、Worker 崩溃 | 用户 + 管理员 | 邮件 + 短信 |
| **CRITICAL** | 系统级故障（RabbitMQ 断开、数据库故障） | 管理员 | 短信 + 电话 |

### 通知内容

```typescript
// 任务失败通知（用户）
{
  "level": "ERROR",
  "title": "回测任务失败",
  "message": "您的回测任务 [MA Cross Strategy] 执行失败",
  "details": {
    "task_id": "task-uuid",
    "strategy_name": "MA Cross Strategy",
    "error": "Worker crashed or disconnected",
    "started_at": "2023-11-20 10:00:00",
    "failed_at": "2023-11-20 10:15:00"
  },
  "actions": [
    {"label": "查看详情", "url": "/backtests/task-uuid"},
    {"label": "重新运行", "action": "retry"}
  ]
}

// Worker 崩溃告警（管理员）
{
  "level": "ERROR",
  "title": "Worker 崩溃告警",
  "message": "Worker #3 已崩溃，影响 2 个正在执行的任务",
  "details": {
    "worker_id": "worker-3",
    "last_heartbeat": "2023-11-20 10:14:30",
    "affected_tasks": ["task-1", "task-2"]
  },
  "actions": [
    {"label": "重启 Worker", "action": "restart_worker"},
    {"label": "查看日志", "url": "/admin/workers/worker-3/logs"}
  ]
}
```

---

## ❓ 待确认的问题

### 1. 自动重试策略

**问题**：是否需要自动重试失败任务？

**选项**：
- **A. 不自动重试**：用户手动重试 ⭐（MVP）
  - 简单，避免浪费资源
  
- **B. 自动重试（有限次数）**：仅重试特定错误
  - 最多重试 3 次
  - 只重试可恢复错误（Worker 崩溃、网络错误）

**你的选择**：[ ]

---

### 2. 断点续跑

**问题**：是否需要支持断点续跑？

**选项**：
- **A. 不需要**：MVP 阶段不做 ⭐
  - 实现复杂，优先级低
  
- **B. 需要**：直接实现
  - 适用于长时间运行的回测

**你的选择**：[ ]

---

### 3. Checkpoint 频率（如果支持断点续跑）

**问题**：多久保存一次 Checkpoint？

**选项**：
- **A. 按时间**：每 5 分钟
- **B. 按进度**：每 10%
- **C. 按K线数**：每 1000 根 ⭐
- **D. 混合**：每 1% 或 5 分钟

**你的选择**：[ ]

---

### 4. 任务失败后的数据处理

**问题**：任务失败后，是否保留部分结果？

**选项**：
- **A. 全部删除**：清理所有临时文件 ⭐
  - 避免垃圾数据
  
- **B. 保留部分结果**：保留已计算的交易数据
  - 便于问题排查

**你的选择**：[ ]

---

### 5. 告警通知方式

**问题**：需要哪些告警通知方式？

**选项**（可多选）：
- [ ] 站内消息
- [ ] 邮件
- [ ] 短信（仅 CRITICAL）
- [ ] Webhook（接入钉钉/企业微信）

**你的选择**：[ ]

---

### 6. Worker 健康检查

**问题**：如何检查 Worker 健康状态？

**选项**：
- **A. 只检查心跳** ⭐（MVP）
  - 简单，基本够用
  
- **B. 心跳 + 资源监控**
  - 检查 CPU、内存、磁盘使用率
  - Worker 资源不足时自动停止接收新任务

**你的选择**：[ ]

---

## 📚 相关文档

- [Worker 通信设计](./worker-communication-design.md)
- [Backtrader 最终方案](./backtrader-final-solution.md)
- [回测数据缓存](./data-caching-design.md)

---

**下一步**：确认上述问题后，我会创建详细的异常恢复实现代码。

