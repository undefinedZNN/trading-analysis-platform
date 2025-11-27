# 🧪 Backend消费者隔离测试结果

**测试时间**: 2025-11-26 11:28 AM

## ✅ 测试结论

**Backend消费者工作完全正常！**

### 测试证据

#### 1. Status消息消费 ✅
- **发送**: 模拟Worker发送status消息（RUNNING）
- **结果**: 任务状态从 `pending` → `running`
- **数据**: `assignedWorkerId` 正确更新为 `test-worker-01`

#### 2. Progress消息消费 ✅
- **发送**: 模拟Worker发送progress消息（15%, 50%）
- **结果**: `metricsSnapshot` 正确更新
- **数据**: 
  ```json
  {
    "totalBars": 10000,
    "processedBars": 5000,
    "currentDate": "2025-11-26T11:28:23.429740",
    "estimatedTimeLeft": 120
  }
  ```

#### 3. 数据库写入 ✅
- API返回了最新数据
- 所有字段正确保存
- 时间戳正确记录

---

## 🔍 问题定位

### 排除的可能性

❌ **不是Backend问题**
- 消费者已正常启动
- 队列绑定正确
- 消息处理逻辑正常
- 数据库写入正常

✅ **问题在Worker**
- Worker可能没有发送消息
- Worker发送的消息格式可能不对
- Worker使用的routing key可能不对

---

## 🕵️ 详细调查

### Backend期望的消息格式

#### Status消息
```json
{
  "task_id": "xxx",
  "worker_id": "worker-id",
  "status": "RUNNING",
  "start_time": "2025-11-26T11:00:00",
  "timestamp": "2025-11-26T11:00:00"
}
```

**Routing Key**: `status.*` (通配符，接受status.update, status.change等)

#### Progress消息
```json
{
  "task_id": "xxx",
  "worker_id": "worker-id",
  "progress": 0.5,  // 0.0-1.0之间的小数
  "processed_bars": 5000,
  "total_bars": 10000,
  "current_date": "2025-11-26T11:00:00",
  "estimated_time_left": 120,
  "timestamp": 1234567890
}
```

**Routing Key**: `progress.*` (通配符，接受progress.update等)

### Worker实际发送的格式

#### Status消息 (backtest_executor.py:299-308)
```python
self.rabbitmq_client.send_message(
    routing_key='status.change',  # ⚠️ 使用status.change
    message={
        'task_id': task_id,
        'worker_id': self.worker_id,
        'status': 'RUNNING',
        'start_time': datetime.now().isoformat(),
        'timestamp': time.time(),  # ⚠️ float类型，Backend期望string
    }
)
```

**潜在问题**:
1. `routing_key='status.change'` - 应该能被`status.*`匹配，理论上没问题
2. `timestamp`是float - Backend可能期望string

#### Progress消息 (rabbitmq_client.py:189-215)
```python
def send_progress(..., worker_id=None, ..., details=None):
    payload = {
        'task_id': task_id,
        'progress': progress_fraction,  # 已转换为0-1
        'message': message,
        'timestamp': time.time(),
    }
    
    if worker_id:
        payload['worker_id'] = worker_id  # ✅ worker_id在顶层
    
    if details:
        # ✅ 关键字段已提升到顶层
        payload['processed_bars'] = details.get('processed_bars')
        payload['total_bars'] = details.get('total_bars')
        payload['current_date'] = details.get('current_date')
        payload['estimated_time_left'] = details.get('estimated_time_left')
```

**检查点**:
1. 格式看起来正确 ✅
2. 但需要确认Worker是否真的在调用时传入了这些参数

---

## 🎯 下一步诊断

### 1. 检查Worker是否真的发送了消息

**方法**: 使用消息监控脚本
```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
source venv/bin/activate
python3 /tmp/monitor_rabbitmq_messages.py
```

**预期**: 
- 如果看到status消息 → Worker发送了，检查格式
- 如果没看到 → Worker根本没发送

### 2. 检查Worker日志中的发送确认

**查找**:
```bash
grep -E "(send_message|Status sent|Progress sent)" worker.log
```

### 3. 检查ProgressTracker调用时的参数

**关键代码** (backtest_executor.py):
```python
self.rabbitmq_client.send_progress(
    task_id=self.task_id,
    worker_id=self.worker_id,  # ← 是否传入？
    progress=progress,
    message=f'Processing... {progress:.1f}%',
    processed_bars=self.current_bar,  # ← 参数名是否正确？
    total_bars=self.total_bars,
    current_date=datetime.now().isoformat(),
)
```

**需要检查**:
1. `worker_id`是否传入
2. 参数名是否与`send_progress`的签名匹配
3. `details`参数是否正确构造

---

## 📊 测试数据

### 成功的测试消息（可用于对比）

#### Status消息
```json
{
  "task_id": "e1f7d868-5fe8-4a49-abfa-3114dd6fcb56",
  "worker_id": "test-worker-01",
  "status": "RUNNING",
  "start_time": "2025-11-26T11:28:17.422038",
  "timestamp": "2025-11-26T11:28:17.422042"
}
```

#### Progress消息
```json
{
  "task_id": "e1f7d868-5fe8-4a49-abfa-3114dd6fcb56",
  "worker_id": "test-worker-01",
  "progress": 0.5,
  "processed_bars": 5000,
  "total_bars": 10000,
  "current_date": "2025-11-26T11:28:23.429740",
  "estimated_time_left": 120,
  "timestamp": 1764127703429
}
```

---

## 🛠️ 可能的修复方案

### 如果Worker没发送消息
- 检查异常处理，可能消息发送失败但被吞掉了
- 添加更详细的日志

### 如果消息格式不对
- 对比成功的测试消息
- 检查`send_progress`的参数传递
- 确保`worker_id`被正确传入

### 如果routing key不匹配
- Backend使用`status.*`和`progress.*`通配符
- Worker使用`status.change`和`progress.update`
- 理论上应该匹配，但可以统一为`.update`

---

## 📝 建议的修复步骤

1. **启动消息监控**（Terminal 1）
   ```bash
   cd /Volumes/CODE/trading-analysis-platform/backtest-worker
   source venv/bin/activate
   python3 /tmp/monitor_rabbitmq_messages.py  # 选择2监控进度
   ```

2. **启动第二个监控**（Terminal 2）
   ```bash
   cd /Volumes/CODE/trading-analysis-platform/backtest-worker
   source venv/bin/activate
   python3 /tmp/monitor_rabbitmq_messages.py backtest.status  # 监控状态
   ```

3. **启动Worker**（Terminal 3）
   ```bash
   cd /Volumes/CODE/trading-analysis-platform/backtest-worker
   ./start_worker.sh
   ```

4. **创建测试任务**（前端）
   - 使用5m数据
   - 时间范围1天

5. **观察监控终端**
   - 是否收到status消息？
   - 是否收到progress消息？
   - 消息格式是否与测试消息一致？

6. **根据观察结果修复**
   - 如果没收到消息 → 检查Worker发送逻辑
   - 如果格式不对 → 修复参数传递
   - 如果Backend还是没更新 → 检查Backend日志的错误

---

**测试脚本位置**:
- Backend消费者测试: `/tmp/test_backend_consumer.py`
- 消息监控工具: `/tmp/monitor_rabbitmq_messages.py`

