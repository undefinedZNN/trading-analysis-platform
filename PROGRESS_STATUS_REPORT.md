# 进度显示状态报告 📊

## 📋 问题总结

### 当前状况
1. **Worker实际执行**：✅ 正常运行，已产生 300+ 交易笔数
2. **进度更新**：❌ 前端显示 0%
3. **数据传输**：❌ Backend API返回的 `metricsSnapshot` 为 `null`

### 根本原因
Worker的进度更新消息 **没有被正确发送到RabbitMQ**，或者Backend未正确消费进度队列。

---

## 🔍 检查要点

### 1. 检查修复是否生效

```bash
# 方法1：查看任务状态
curl -s 'http://localhost:3000/api/v1/backtesting/tasks/73956c32-ff25-4ee8-aad7-42acba026d76' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('✅ 任务状态:', d['status'])
print('📊 进度:', d.get('progress', 0), '%')
print('📈 metricsSnapshot:')
if d.get('metricsSnapshot'):
    import json
    print(json.dumps(d['metricsSnapshot'], indent=2))
    print()
    print('🎯 总Bars:', d['metricsSnapshot'].get('totalBars', 'N/A'))
    print('⏳ 当前Bars:', d['metricsSnapshot'].get('processedBars', 'N/A'))
else:
    print('  ❌ 无数据')
"
```

### 2. 检查Worker是否发送进度消息

```bash
# 查看Worker日志中的进度发送
grep -i "progress\|total_bars" /Users/zen/.cursor/projects/Volumes-CODE-trading-analysis-platform/terminals/4.txt | tail -10
```

### 3. 检查RabbitMQ队列

```bash
# 检查progress队列中的消息数
docker exec trading-rabbitmq rabbitmqctl list_queues -p /backtest name messages 2>/dev/null | grep progress
```

---

## 🎨 前端UI改造方案

### 当前UI问题
- ✅ 已有 `currentBar` 和 `totalBars` 字段定义
- ❌ UI未显示这些详细信息
- ❌ 只显示百分比进度，不够直观

### 改进方案

#### 方案A：在现有卡片中增强显示
在 `BacktestTaskCard.tsx` 的进度条下方添加：
```tsx
{/* 进度详情（运行中时显示） */}
{task.status === BacktestTaskStatus.RUNNING && (
  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
    <Space size="middle">
      {task.metricsSnapshot?.totalBars && (
        <span>
          📊 数据进度: {formatNumber(task.metricsSnapshot.processedBars)} / 
          {formatNumber(task.metricsSnapshot.totalBars)} bars
        </span>
      )}
      {task.metricsSnapshot?.currentDate && (
        <span>
          📅 当前时间: {task.metricsSnapshot.currentDate}
        </span>
      )}
      {task.metricsSnapshot?.estimatedTimeLeft && (
        <span>
          ⏱ 预计剩余: {formatDuration(task.metricsSnapshot.estimatedTimeLeft)}
        </span>
      )}
    </Space>
  </div>
)}
```

#### 方案B：创建独立的进度详情组件
创建 `TaskProgressDetail.tsx` 组件，用于详细展示：
- 总Bars数
- 已处理Bars数
- 当前日期
- 预计剩余时间
- 实时交易笔数（来自resultSummary）

---

## 🛠️ 立即修复步骤

### Step 1: 检查Worker进度发送逻辑

Worker的 `ProgressTracker` 应该在每次 `prenext()` 和 `next()` 时更新进度。

**检查点**：`backtest-worker/src/backtrader_integration/execution/backtest_executor.py`

```python
class ProgressTracker:
    def update(self, current_bar: int):
        self.current_bar = current_bar
        current_time = time.time()
        
        # 每10%进度 或 每5分钟 报告一次
        progress = (current_bar / self.total_bars) if self.total_bars > 0 else 0
        
        should_report = (
            progress >= self.last_progress + 0.10 or  # 进度增加10%
            current_time - self.last_report_time >= 300  # 距上次报告5分钟
        )
        
        if should_report:
            self.rabbitmq_client.send_progress(
                task_id=self.task_id,
                worker_id=self.worker_id,
                progress=progress,
                processed_bars=current_bar,
                total_bars=self.total_bars,
                # ... 其他信息
            )
```

### Step 2: 检查Backend是否消费进度队列

**检查点**：`backend/src/backtesting/tasks/consumers/backtest-message.consumer.ts`

Backend应该：
1. 监听 `backtest.progress` 队列
2. 调用 `tasksService.updateProgressFromWorker()`
3. 将 `metricsSnapshot` 更新到数据库

### Step 3: 验证数据库字段

`backtest_tasks` 表应该有 `metrics_snapshot` 字段（JSONB类型），用于存储：
```json
{
  "processedBars": 123456,
  "totalBars": 5302427,
  "currentDate": "2023-05-15",
  "estimatedTimeLeft": 3600
}
```

---

## ✅ 验证清单

- [ ] Worker日志中有 "Progress:" 或 "send_progress" 相关输出
- [ ] RabbitMQ `backtest.progress` 队列有消息流动
- [ ] Backend日志中有 "Received progress" 消息
- [ ] API返回的task对象包含非空的 `metricsSnapshot`
- [ ] 前端UI显示了详细的进度信息（bars数、交易笔数等）

---

## 📝 待办事项

1. **立即**：检查Worker的 `ProgressTracker` 是否被正确调用
2. **短期**：修复进度消息发送逻辑
3. **中期**：改造前端UI，增强进度显示
4. **长期**：添加实时WebSocket推送进度更新

---

## 🎯 预期效果

修复后，前端应该显示：

```
执行中
[=========>          ] 42%

📊 数据进度: 2,226,919 / 5,302,427 bars
📅 当前时间: 2023-05-15
⏱ 预计剩余: 约 15 分钟
💰 当前交易: 338 笔
```

---

**Created**: 2025-11-26 00:35  
**Task ID**: 73956c32-ff25-4ee8-aad7-42acba026d76  
**Worker ID**: e7e91ce1-edcd-4609-bfad-270df8b6297d

