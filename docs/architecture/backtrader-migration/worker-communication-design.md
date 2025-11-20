# Worker 与主服务通信设计

**版本**: v1.0  
**更新时间**: 2025-11-20  
**状态**: 待确认

---

## 📋 目录

1. [通信架构概览](#通信架构概览)
2. [消息队列设计](#消息队列设计)
3. [状态同步设计](#状态同步设计)
4. [消息格式定义](#消息格式定义)
5. [状态更新时机](#状态更新时机)
6. [错误处理机制](#错误处理机制)
7. [待确认的问题](#待确认的问题)

---

## 📐 通信架构概览

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Backend                           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Backtest Task Service                                │ │
│  │  - 创建回测任务                                         │ │
│  │  - 任务状态管理                                         │ │
│  │  - 结果收集                                             │ │
│  └───────────────────────────────────────────────────────┘ │
│           │ publish                         │ consume       │
│           ▼                                 ▼               │
└───────────┼─────────────────────────────────┼───────────────┘
            │                                 │
            │        RabbitMQ Broker          │
            │                                 │
┌───────────▼─────────────────────────────────▼───────────────┐
│                                                             │
│  Queue: backtest.task           Queue: backtest.status     │
│  Queue: backtest.progress       Queue: backtest.heartbeat  │
│                                                             │
└───────────┬─────────────────────────────────┬───────────────┘
            │ consume                         │ publish
            ▼                                 ▼
┌───────────┴─────────────────────────────────┴───────────────┐
│                 Python Backtrader Worker                     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Task Consumer                                        │ │
│  │  - 消费回测任务                                         │ │
│  │  - 执行回测                                             │ │
│  │  - 发布状态更新                                         │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 📨 消息队列设计

### 队列列表

| 队列名称 | 方向 | 用途 | 消息类型 |
|---------|------|------|---------|
| `backtest.task` | Backend → Worker | 发布回测任务 | 任务配置 |
| `backtest.status` | Worker → Backend | 回测状态更新 | 状态变更 |
| `backtest.progress` | Worker → Backend | 回测进度更新 | 进度信息 |
| `backtest.result` | Worker → Backend | 回测结果 | 完整结果 |
| `backtest.error` | Worker → Backend | 错误通知 | 错误信息 |
| `worker.heartbeat` | Worker → Backend | Worker 心跳 | 健康状态 |

### 队列配置

```javascript
// RabbitMQ 队列配置
const queueConfig = {
  'backtest.task': {
    durable: true,          // 持久化
    prefetch: 1,            // 每次只取 1 个任务
    priority: true,         // 支持优先级
    maxPriority: 10,        // 最大优先级
    messageTtl: 3600000,    // 消息 TTL: 1 小时
  },
  
  'backtest.status': {
    durable: true,
    autoDelete: false,
  },
  
  'backtest.progress': {
    durable: false,         // 不持久化（实时数据）
    autoDelete: true,       // 自动删除
    messageTtl: 60000,      // 1 分钟 TTL
  },
  
  'backtest.result': {
    durable: true,
    autoDelete: false,
  },
  
  'backtest.error': {
    durable: true,
    autoDelete: false,
  },
  
  'worker.heartbeat': {
    durable: false,
    autoDelete: true,
    messageTtl: 120000,     // 2 分钟 TTL
  },
};
```

---

## 🔄 状态同步设计

### 任务状态机

```
┌─────────┐
│ PENDING │  初始状态（任务已创建）
└────┬────┘
     │
     ▼
┌─────────┐
│ QUEUED  │  已发布到队列
└────┬────┘
     │
     ▼
┌─────────┐
│ RUNNING │  Worker 正在执行
└────┬────┘
     │
     ├──────────┬──────────┐
     ▼          ▼          ▼
┌─────────┐ ┌────────┐ ┌─────────┐
│COMPLETED│ │ FAILED │ │CANCELLED│
└─────────┘ └────────┘ └─────────┘
```

### 状态定义

| 状态 | 说明 | 谁负责更新 | 更新时机 |
|------|------|-----------|---------|
| `PENDING` | 任务已创建，等待发布 | Backend | 创建任务时 |
| `QUEUED` | 已发布到队列，等待 Worker | Backend | 发布消息后 |
| `RUNNING` | Worker 正在执行 | Worker | 开始执行时 |
| `COMPLETED` | 执行成功 | Worker | 回测完成时 |
| `FAILED` | 执行失败 | Worker | 发生错误时 |
| `CANCELLED` | 用户取消 | Backend | 用户取消时 |

### 需要同步的状态信息

#### 1. 任务基本状态
```typescript
interface TaskStatus {
  taskId: string;
  status: 'PENDING' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  workerId?: string;          // 执行该任务的 Worker ID
  startTime?: Date;           // 开始执行时间
  endTime?: Date;             // 结束时间
  duration?: number;          // 执行耗时（秒）
  updatedAt: Date;            // 状态更新时间
}
```

#### 2. 执行进度
```typescript
interface TaskProgress {
  taskId: string;
  progress: number;           // 0.0 - 1.0
  processedBars: number;      // 已处理的 K 线数
  totalBars: number;          // 总 K 线数
  currentDate?: string;       // 当前回测到的日期
  estimatedTimeLeft?: number; // 预计剩余时间（秒）
  updatedAt: Date;
}
```

#### 3. 执行结果
```typescript
interface TaskResult {
  taskId: string;
  status: 'COMPLETED';
  
  // 绩效指标
  metrics: {
    totalReturn: number;         // 总收益率
    annualReturn: number;        // 年化收益率
    sharpeRatio: number;         // 夏普比率
    maxDrawdown: number;         // 最大回撤
    winRate: number;             // 胜率
    totalTrades: number;         // 总交易次数
    profitFactor: number;        // 盈亏比
  };
  
  // 数据文件路径
  files: {
    trades: string;              // 交易记录 Parquet 文件
    factors: string;             // 因子数据 Parquet 文件
    equity: string;              // 权益曲线 Parquet 文件
  };
  
  // 统计信息
  stats: {
    processedBars: number;
    executionTime: number;       // 执行时间（秒）
    peakMemory: number;          // 峰值内存（MB）
  };
  
  completedAt: Date;
}
```

#### 4. 错误信息
```typescript
interface TaskError {
  taskId: string;
  status: 'FAILED';
  
  error: {
    type: string;                // 错误类型
    message: string;             // 错误消息
    code?: string;               // 错误代码
    stack?: string;              // 堆栈信息（开发环境）
    context?: Record<string, any>; // 错误上下文
  };
  
  // 部分结果（如果有）
  partialResult?: {
    processedBars: number;
    lastProcessedDate?: string;
  };
  
  failedAt: Date;
}
```

#### 5. Worker 健康状态
```typescript
interface WorkerHeartbeat {
  workerId: string;
  status: 'idle' | 'busy';
  currentTaskId?: string;       // 当前执行的任务 ID
  
  resources: {
    cpuUsage: number;           // CPU 使用率 (0-1)
    memoryUsage: number;        // 内存使用量（MB）
    memoryLimit: number;        // 内存限制（MB）
  };
  
  stats: {
    tasksCompleted: number;     // 已完成任务数
    tasksFailed: number;        // 失败任务数
    uptime: number;             // 运行时间（秒）
  };
  
  timestamp: Date;
}
```

---

## 📋 消息格式定义

### 1. 任务消息 (Backend → Worker)

```typescript
// 队列: backtest.task
interface BacktestTaskMessage {
  // 基本信息
  taskId: string;
  userId: string;
  priority: number;             // 1-10，默认 5
  
  // 策略信息
  strategy: {
    code: string;               // Python 策略代码
    className: string;          // 策略类名
    parameters: Record<string, any>; // 策略参数
  };
  
  // 数据信息
  data: {
    source: 'parquet' | 'csv';
    path: string;               // Parquet 文件路径
    symbol: string;             // 标的代码
    startDate?: string;         // 开始日期
    endDate?: string;           // 结束日期
  };
  
  // 回测配置
  config: {
    initialCash: number;        // 初始资金
    commission: number;         // 手续费率
    slippage: number;           // 滑点
    enableFactors: boolean;     // 是否收集因子
    factorNames?: string[];     // 要收集的因子名称
  };
  
  // 超时设置
  timeoutConfig?: {
    idleTimeout?: number;       // 空闲超时（秒），默认 600
    absoluteMaxTime?: number;   // 绝对最大时间（秒），可选
  };
  
  // 创建时间
  createdAt: string;
}
```

**示例**：
```json
{
  "taskId": "task-20251120-001",
  "userId": "user-123",
  "priority": 5,
  "strategy": {
    "code": "class MACrossStrategy(bt.Strategy):\n    ...",
    "className": "MACrossStrategy",
    "parameters": {
      "fast_period": 10,
      "slow_period": 20
    }
  },
  "data": {
    "source": "parquet",
    "path": "/data/datasets/AAPL_daily.parquet",
    "symbol": "AAPL",
    "startDate": "2020-01-01",
    "endDate": "2023-12-31"
  },
  "config": {
    "initialCash": 100000,
    "commission": 0.001,
    "slippage": 0.0005,
    "enableFactors": true,
    "factorNames": ["rsi", "ma_fast", "ma_slow"]
  },
  "timeoutConfig": {
    "idleTimeout": 600,
    "absoluteMaxTime": 3600
  },
  "createdAt": "2025-11-20T10:00:00Z"
}
```

---

### 2. 状态消息 (Worker → Backend)

```typescript
// 队列: backtest.status
interface BacktestStatusMessage {
  taskId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  workerId: string;
  
  // 可选字段（根据状态）
  startTime?: string;
  endTime?: string;
  duration?: number;
  
  timestamp: string;
}
```

**示例 - 开始执行**：
```json
{
  "taskId": "task-20251120-001",
  "status": "RUNNING",
  "workerId": "worker-01",
  "startTime": "2025-11-20T10:05:00Z",
  "timestamp": "2025-11-20T10:05:00Z"
}
```

**示例 - 执行完成**：
```json
{
  "taskId": "task-20251120-001",
  "status": "COMPLETED",
  "workerId": "worker-01",
  "startTime": "2025-11-20T10:05:00Z",
  "endTime": "2025-11-20T10:08:30Z",
  "duration": 210,
  "timestamp": "2025-11-20T10:08:30Z"
}
```

---

### 3. 进度消息 (Worker → Backend)

```typescript
// 队列: backtest.progress
interface BacktestProgressMessage {
  taskId: string;
  workerId: string;
  
  progress: number;             // 0.0 - 1.0
  processedBars: number;
  totalBars: number;
  currentDate?: string;
  estimatedTimeLeft?: number;   // 秒
  
  timestamp: string;
}
```

**示例**：
```json
{
  "taskId": "task-20251120-001",
  "workerId": "worker-01",
  "progress": 0.45,
  "processedBars": 450,
  "totalBars": 1000,
  "currentDate": "2021-06-15",
  "estimatedTimeLeft": 120,
  "timestamp": "2025-11-20T10:06:30Z"
}
```

---

### 4. 结果消息 (Worker → Backend)

```typescript
// 队列: backtest.result
interface BacktestResultMessage {
  taskId: string;
  workerId: string;
  status: 'COMPLETED';
  
  metrics: {
    totalReturn: number;
    annualReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    profitFactor: number;
  };
  
  files: {
    trades: string;
    factors: string;
    equity: string;
  };
  
  stats: {
    processedBars: number;
    executionTime: number;
    peakMemory: number;
  };
  
  completedAt: string;
}
```

**示例**：
```json
{
  "taskId": "task-20251120-001",
  "workerId": "worker-01",
  "status": "COMPLETED",
  "metrics": {
    "totalReturn": 0.155,
    "annualReturn": 0.05,
    "sharpeRatio": 1.2,
    "maxDrawdown": -0.08,
    "winRate": 0.55,
    "totalTrades": 42,
    "profitFactor": 1.8
  },
  "files": {
    "trades": "/data/backtests/task-20251120-001/trades.parquet",
    "factors": "/data/backtests/task-20251120-001/factors.parquet",
    "equity": "/data/backtests/task-20251120-001/equity.parquet"
  },
  "stats": {
    "processedBars": 1000,
    "executionTime": 210,
    "peakMemory": 256
  },
  "completedAt": "2025-11-20T10:08:30Z"
}
```

---

### 5. 错误消息 (Worker → Backend)

```typescript
// 队列: backtest.error
interface BacktestErrorMessage {
  taskId: string;
  workerId: string;
  status: 'FAILED';
  
  error: {
    type: 'DATA_ERROR' | 'STRATEGY_ERROR' | 'TIMEOUT' | 'SYSTEM_ERROR';
    message: string;
    code?: string;
    stack?: string;
    context?: Record<string, any>;
  };
  
  partialResult?: {
    processedBars: number;
    lastProcessedDate?: string;
  };
  
  failedAt: string;
}
```

**示例 - 数据错误**：
```json
{
  "taskId": "task-20251120-001",
  "workerId": "worker-01",
  "status": "FAILED",
  "error": {
    "type": "DATA_ERROR",
    "message": "Parquet file not found or corrupted",
    "code": "PARQUET_READ_ERROR",
    "context": {
      "filePath": "/data/datasets/AAPL_daily.parquet",
      "expectedColumns": ["open", "high", "low", "close", "volume"]
    }
  },
  "failedAt": "2025-11-20T10:05:15Z"
}
```

**示例 - 策略错误**：
```json
{
  "taskId": "task-20251120-002",
  "workerId": "worker-01",
  "status": "FAILED",
  "error": {
    "type": "STRATEGY_ERROR",
    "message": "NameError: name 'bt' is not defined",
    "code": "STRATEGY_EXECUTION_ERROR",
    "stack": "Traceback (most recent call last):\n  File \"strategy.py\", line 10...",
    "context": {
      "strategyClass": "MACrossStrategy",
      "line": 10
    }
  },
  "partialResult": {
    "processedBars": 150,
    "lastProcessedDate": "2020-03-15"
  },
  "failedAt": "2025-11-20T10:06:45Z"
}
```

---

### 6. 心跳消息 (Worker → Backend)

```typescript
// 队列: worker.heartbeat
interface WorkerHeartbeatMessage {
  workerId: string;
  status: 'idle' | 'busy';
  currentTaskId?: string;
  
  resources: {
    cpuUsage: number;
    memoryUsage: number;
    memoryLimit: number;
  };
  
  stats: {
    tasksCompleted: number;
    tasksFailed: number;
    uptime: number;
  };
  
  timestamp: string;
}
```

**示例 - 空闲状态**：
```json
{
  "workerId": "worker-01",
  "status": "idle",
  "resources": {
    "cpuUsage": 0.05,
    "memoryUsage": 128,
    "memoryLimit": 2048
  },
  "stats": {
    "tasksCompleted": 42,
    "tasksFailed": 2,
    "uptime": 86400
  },
  "timestamp": "2025-11-20T10:10:00Z"
}
```

**示例 - 繁忙状态**：
```json
{
  "workerId": "worker-01",
  "status": "busy",
  "currentTaskId": "task-20251120-003",
  "resources": {
    "cpuUsage": 0.75,
    "memoryUsage": 512,
    "memoryLimit": 2048
  },
  "stats": {
    "tasksCompleted": 42,
    "tasksFailed": 2,
    "uptime": 86400
  },
  "timestamp": "2025-11-20T10:10:00Z"
}
```

---

## ⏱️ 状态更新时机

### Backend 发送消息的时机

| 事件 | 队列 | 消息类型 | 触发条件 |
|------|------|---------|---------|
| 创建回测任务 | `backtest.task` | TaskMessage | 用户点击"开始回测" |
| 取消任务 | `backtest.task` | CancelMessage | 用户点击"取消" |

### Worker 发送消息的时机

| 事件 | 队列 | 消息类型 | 触发条件 | 频率 |
|------|------|---------|---------|------|
| 开始执行 | `backtest.status` | StatusMessage | 开始执行任务 | 一次 |
| 进度更新 | `backtest.progress` | ProgressMessage | 处理 K 线数据 | 每 5% 或每 30 秒 |
| 执行完成 | `backtest.status` | StatusMessage | 回测完成 | 一次 |
| 执行完成 | `backtest.result` | ResultMessage | 回测完成 | 一次 |
| 执行失败 | `backtest.status` | StatusMessage | 发生错误 | 一次 |
| 执行失败 | `backtest.error` | ErrorMessage | 发生错误 | 一次 |
| Worker 心跳 | `worker.heartbeat` | HeartbeatMessage | 定时发送 | 每 30 秒 |

### 详细的状态更新流程

#### 正常执行流程

```
时间轴: ────────────────────────────────────────────────►

Backend:
  T0: 创建任务 → DB (status: PENDING)
  T1: 发布任务消息 → backtest.task
  T2: 更新状态 → DB (status: QUEUED)

Worker:
  T3: 消费任务消息
  T4: 发布状态消息 → backtest.status (RUNNING)
  
Backend:
  T5: 消费状态消息
  T6: 更新状态 → DB (status: RUNNING, startTime)

Worker:
  T7-T20: 执行回测
    - T7: 发布进度 → backtest.progress (0%)
    - T10: 发布进度 → backtest.progress (25%)
    - T13: 发布进度 → backtest.progress (50%)
    - T16: 发布进度 → backtest.progress (75%)
    - T19: 发布进度 → backtest.progress (95%)
  
  T21: 保存结果到 Parquet
  T22: 发布状态消息 → backtest.status (COMPLETED)
  T23: 发布结果消息 → backtest.result

Backend:
  T24: 消费状态消息
  T25: 更新状态 → DB (status: COMPLETED, endTime, duration)
  T26: 消费结果消息
  T27: 保存结果 → DB (metrics, files)
```

#### 失败执行流程

```
时间轴: ────────────────────────────────────►

Backend:
  T0: 创建任务 → DB (status: PENDING)
  T1: 发布任务消息 → backtest.task
  T2: 更新状态 → DB (status: QUEUED)

Worker:
  T3: 消费任务消息
  T4: 发布状态消息 → backtest.status (RUNNING)

Backend:
  T5: 消费状态消息
  T6: 更新状态 → DB (status: RUNNING, startTime)

Worker:
  T7-T12: 执行回测
    - T7: 发布进度 → backtest.progress (0%)
    - T10: 发布进度 → backtest.progress (25%)
  
  T13: ❌ 发生错误（如数据读取失败）
  T14: 发布状态消息 → backtest.status (FAILED)
  T15: 发布错误消息 → backtest.error

Backend:
  T16: 消费状态消息
  T17: 更新状态 → DB (status: FAILED, endTime)
  T18: 消费错误消息
  T19: 保存错误 → DB (errorMessage, errorType, context)
  T20: 可选：发送通知给用户
```

---

## 🛡️ 错误处理机制

### 1. 消息发送失败

**场景**: Backend 或 Worker 无法发布消息到 RabbitMQ

**处理**:
- Backend: 将任务状态设为 `FAILED`，记录错误
- Worker: 重试 3 次，间隔 5 秒，最后标记任务失败

```python
# Worker 端重试逻辑
def publish_with_retry(queue, message, max_retries=3):
    for attempt in range(max_retries):
        try:
            rabbitmq.publish(queue, message)
            logger.info(f"Message published to {queue}")
            return True
        except Exception as e:
            logger.warning(f"Publish failed (attempt {attempt+1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
            else:
                logger.error(f"Failed to publish after {max_retries} attempts")
                return False
```

---

### 2. 消息消费失败

**场景**: Backend 或 Worker 无法处理收到的消息

**处理**:
- 记录错误日志
- **不确认消息** (NACK)，让消息重新进入队列
- 设置最大重试次数（3 次）
- 超过重试次数后，消息进入死信队列 (DLQ)

```javascript
// Backend 端消费逻辑
async consumeMessage(message) {
  try {
    await this.processMessage(message);
    channel.ack(message); // 确认消息
  } catch (error) {
    logger.error('Failed to process message:', error);
    
    // 检查重试次数
    const retryCount = message.properties.headers['x-retry-count'] || 0;
    
    if (retryCount < 3) {
      // 重新入队
      channel.nack(message, false, true);
      message.properties.headers['x-retry-count'] = retryCount + 1;
    } else {
      // 进入死信队列
      channel.nack(message, false, false);
      await this.sendToDLQ(message);
    }
  }
}
```

---

### 3. Worker 宕机

**场景**: Worker 进程崩溃或服务器宕机

**Backend 检测机制**:
```typescript
// 心跳监控
class WorkerHealthMonitor {
  private readonly HEARTBEAT_TIMEOUT = 120; // 2 分钟
  
  @Cron('*/30 * * * * *') // 每 30 秒检查一次
  async checkWorkerHealth() {
    const workers = await this.getActiveWorkers();
    
    for (const worker of workers) {
      const lastHeartbeat = worker.lastHeartbeatAt;
      const now = new Date();
      const secondsSinceHeartbeat = (now - lastHeartbeat) / 1000;
      
      if (secondsSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
        // Worker 可能已宕机
        logger.error(`Worker ${worker.id} is not responding`);
        
        // 标记 Worker 为离线
        await this.markWorkerOffline(worker.id);
        
        // 重新调度该 Worker 正在执行的任务
        const runningTask = await this.getRunningTask(worker.id);
        if (runningTask) {
          await this.requeueTask(runningTask.id);
        }
      }
    }
  }
}
```

**处理流程**:
1. 检测到 Worker 超时（2 分钟无心跳）
2. 标记 Worker 为离线
3. 查找该 Worker 正在执行的任务
4. 将任务状态改为 `QUEUED`，重新发布到队列
5. 发送告警通知

---

### 4. 任务超时

**场景**: 任务执行时间过长

**Worker 端实现**:
```python
import signal

def execute_backtest_with_timeout(task, timeout=600):
    """
    执行回测，带超时控制
    """
    def timeout_handler(signum, frame):
        raise TimeoutError(f"Task {task['taskId']} exceeded timeout of {timeout}s")
    
    # 设置超时信号
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(timeout)
    
    try:
        result = execute_backtest(task)
        signal.alarm(0)  # 取消超时
        return result
    except TimeoutError as e:
        logger.error(f"Task timeout: {e}")
        # 发布错误消息
        publish_error({
            'taskId': task['taskId'],
            'error': {
                'type': 'TIMEOUT',
                'message': str(e),
            }
        })
        raise
```

---

### 5. 重复消息

**场景**: 同一消息被多次投递

**幂等性保证**:
```typescript
// Backend 端幂等性检查
class BacktestTaskService {
  async processStatusMessage(message: BacktestStatusMessage) {
    const { taskId, status, timestamp } = message;
    
    // 查询当前状态
    const task = await this.taskRepository.findOne(taskId);
    
    // 检查消息是否过期
    if (task.updatedAt > new Date(timestamp)) {
      logger.warn(`Ignoring outdated status message for task ${taskId}`);
      return; // 忽略旧消息
    }
    
    // 检查状态转换是否合法
    if (!this.isValidTransition(task.status, status)) {
      logger.warn(`Invalid status transition: ${task.status} → ${status}`);
      return;
    }
    
    // 更新状态
    await this.updateTaskStatus(taskId, status, timestamp);
  }
  
  private isValidTransition(from: string, to: string): boolean {
    const validTransitions = {
      'PENDING': ['QUEUED', 'CANCELLED'],
      'QUEUED': ['RUNNING', 'CANCELLED'],
      'RUNNING': ['COMPLETED', 'FAILED', 'CANCELLED'],
    };
    
    return validTransitions[from]?.includes(to) ?? false;
  }
}
```

---

## ✅ 已确认的配置

所有设计决策已全部确认，可以开始实施！

### 通信配置

| 配置项 | 确认值 | 说明 |
|--------|--------|------|
| **进度更新频率** | 每 1% 或 1 分钟，最小间隔 10 秒 | 既及时又避免过于频繁 |
| **消息保留时间** | 立即删除 | 状态已存数据库，节省空间 |
| **Worker 心跳频率** | 每 30 秒 | 及时发现 Worker 宕机 |
| **失败任务重试** | 不自动重试 | 用户可手动重试 |
| **结果文件存储** | 共享存储 (NFS/S3) | Backend 和 Worker 都可访问 |

### 超时配置

| 配置项 | 确认值 | 说明 |
|--------|--------|------|
| **超时策略** | 混合策略（空闲超时 + 系统硬限制） | 智能检测卡住，有兜底保护 |
| **默认空闲超时** | 10 分钟 | 10 分钟无进度更新 → 超时 |
| **系统硬限制** | 48 小时 | 无论如何不超过 48 小时 |
| **用户自定义** | 允许 | 用户可自定义两个超时时间 |

### 超时策略详解

**工作原理**：
```python
# 默认配置
DEFAULT_CONFIG = {
    'idleTimeout': 600,        # 10 分钟（600 秒）
    'absoluteMaxTime': None,   # 用户默认不设置
}

# 系统硬限制
SYSTEM_MAX_TIME = 172800       # 48 小时（系统级别，不暴露给用户）

# 实际执行时的有效超时
effective_idle_timeout = user_config.get('idleTimeout', 600)
effective_max_time = user_config.get('absoluteMaxTime') or SYSTEM_MAX_TIME
```

**超时判断**：
1. **空闲超时**（优先）：10 分钟内无进度更新 → 超时
2. **系统硬限制**（兜底）：运行超过 48 小时（或用户设置的时间）→ 超时

**用户体验**：
- 默认情况：只要任务在推进，就不会超时（但有 48 小时硬限制）
- 任务卡住：10 分钟无进度更新，自动终止
- 极端情况：运行 48 小时后强制终止

### 进度更新策略详解

**实现逻辑**：
```python
class ProgressReporter:
    def __init__(self):
        self.last_update_time = 0
        self.last_progress = 0
        self.min_interval = 10         # 最小间隔 10 秒
        self.progress_threshold = 0.01  # 1%
        self.time_threshold = 60        # 1 分钟
    
    def should_update(self, current_progress):
        now = time.time()
        time_diff = now - self.last_update_time
        progress_diff = current_progress - self.last_progress
        
        # 条件 1: 进度变化 >= 1% 且距离上次更新 >= 10 秒
        if progress_diff >= self.progress_threshold and time_diff >= self.min_interval:
            return True
        
        # 条件 2: 距离上次更新 >= 1 分钟（强制更新）
        if time_diff >= self.time_threshold:
            return True
        
        return False
```

**效果**：
- 小数据集（100 条）：最多每 10 秒更新一次，避免过于频繁
- 大数据集（10000 条）：进度变化 1% 时更新，体验好
- 极慢任务：至少每 1 分钟更新一次，用户知道任务还在运行

---

## 📋 实施清单

设计已完成，可以开始实施：

- ✅ 消息格式定义完成
- ✅ 状态同步机制明确
- ✅ 状态更新时机确定
- ✅ 错误处理策略完善
- ✅ 所有配置参数确认

---

## 🚀 下一步

1. **Backend 实现**
   - RabbitMQ 队列配置
   - 消息发布/消费
   - 状态管理
   - 超时监控

2. **Worker 实现**
   - 任务消费
   - 进度上报
   - 超时检测
   - 错误处理

3. **共享存储配置**
   - NFS 或 S3 设置
   - Parquet 文件路径规范

**准备就绪，可以开始 POC 实施！** 🎉

