# 🎯 系统就绪 - 准备测试

**时间**: 2025-11-26 11:19 AM

## ✅ 系统状态

### 1. Backend (正常运行)
- **进程**: PID 59665
- **状态**: ✅ 运行中
- **消费者**: 全部启动成功
  ```
  ✅ Progress consumer started
  ✅ Status consumer started
  ✅ Result consumer started
  ✅ Error consumer started
  ✅ Log consumer started
  ✅ Heartbeat consumer started
  ```

### 2. Worker (正常运行)
- **进程**: PID 64052
- **状态**: ✅ 运行中
- **队列**: `backtest.tasks`
- **注册**: worker-python-01

### 3. RabbitMQ
- **状态**: ✅ 连接正常
- **队列**: 全部清空（无遗留消息）
  - `backtest.tasks`: 0 条消息
  - `backtest.status`: 0 条消息
  - `backtest.progress`: 0 条消息
  - `backtest.results`: 0 条消息
  - `backtest.errors`: 0 条消息

### 4. 配置同步
- **Backend**: 移除了 `x-message-ttl` 参数
- **Worker**: 移除了所有额外参数
- **结果**: ✅ 队列参数完全一致，无冲突

---

## 🔧 已解决的问题

### 问题1: 队列参数冲突
- **症状**: `PRECONDITION_FAILED - inequivalent arg 'x-message-ttl'`
- **原因**: Backend和Worker创建队列时使用了不同的参数
- **解决**: 统一配置，双方都使用简单的持久化队列（durable:true）

### 问题2: 多个Worker进程
- **症状**: 3个Worker同时运行，导致任务分配混乱
- **原因**: 旧Worker没有正确停止
- **解决**: 强制杀掉所有旧进程，启动新Worker

### 问题3: 进度不同步
- **症状**: Worker执行任务，但前端显示"pending"
- **已修复**:
  - Worker发送格式：top-level fields (不嵌套details)
  - Backend消费者：已正常启动，可以接收消息
  - 队列参数：已统一，无冲突

---

## 📝 测试步骤

### 推荐配置

**数据集选择**: `ES-23/ES/5m`（5分钟聚合数据）
- 路径: `ES-23/ES/5m/agg_5m_from_1s.parquet`
- 优点: 数据量适中，执行快速，适合测试

**时间范围**: 1-2天
- 开始: `2024-12-01`
- 结束: `2024-12-02`
- 原因: 快速验证功能，避免长时间等待

**策略参数**:
- 信号周期: `5m`
- 初始资金: `100000`

### 操作流程

1. **访问前端**: http://localhost:5173
2. **创建任务**: 使用上述推荐配置
3. **开始回测**: 点击"开始回测"按钮
4. **获取任务ID**: 从URL或任务列表复制
5. **告知任务ID**: 反馈给系统进行监控

---

## 🔍 监控点

### 关键日志位置

**Backend日志**: 
```bash
tail -f /Users/zen/.cursor/projects/Volumes-CODE-trading-analysis-platform/terminals/3.txt
```

**Worker日志**:
```bash
tail -f /tmp/worker-*.log
```

**监控命令**:
```bash
# 检查任务状态
curl -s 'http://localhost:3000/api/v1/backtesting/tasks/<TASK_ID>' | jq '.status, .metricsSnapshot'

# 检查队列状态
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
python3 /tmp/check_queues.py
```

### 预期行为

1. **任务创建** (5秒内)
   - Backend日志: "Task dispatched successfully"
   - 任务队列: 1条消息

2. **Worker接收** (立即)
   - Worker日志: "Received task message"
   - 任务队列: 0条消息（已消费）

3. **状态更新** (1秒内)
   - Backend日志: "Task status updated: running"
   - 前端显示: "运行中"

4. **进度更新** (每2秒)
   - Worker日志: "Progress sent successfully"
   - Backend日志: "Progress updated"
   - 前端显示: 进度条更新

5. **任务完成** (1-2分钟)
   - Worker日志: "Backtest completed"
   - Backend日志: "Result received"
   - 前端显示: "已完成"

---

## ⚠️ 故障排查

### 如果前端一直显示"pending"

**检查1: Backend消费者**
```bash
grep "consumer started" /Users/zen/.cursor/projects/Volumes-CODE-trading-analysis-platform/terminals/3.txt | tail -10
```
应该看到6个消费者启动

**检查2: Worker连接**
```bash
ps aux | grep start_rabbitmq_worker | grep -v grep
```
应该有1个进程运行

**检查3: 队列消息**
```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
source venv/bin/activate
python3 /tmp/check_queues.py
```
任务队列应该为空（已被Worker消费）

**检查4: Backend日志**
```bash
tail -50 /Users/zen/.cursor/projects/Volumes-CODE-trading-analysis-platform/terminals/3.txt | grep -E "status|progress"
```
应该看到状态或进度更新

### 如果进度一直是0%

**可能原因**:
1. 数据加载中（大数据集需要等待）
2. Worker崩溃（检查Worker进程是否存在）
3. 数据路径错误（检查Worker错误日志）

**解决方法**:
- 使用5m数据集（不是1s数据集）
- 缩短时间范围（1-2天）
- 检查Worker日志是否有错误

---

## 🎯 成功标准

✅ 前端创建任务后，状态立即变为"运行中"  
✅ 进度条每2秒更新一次  
✅ 可以看到 `processedBars` / `totalBars`  
✅ 可以看到预计剩余时间  
✅ 任务完成后，可以查看交易记录和统计指标  

---

## 📞 下一步

**等待用户创建测试任务并提供任务ID**

创建后，我会：
1. ✅ 监控任务执行全过程
2. ✅ 验证消息流是否正常
3. ✅ 确认前端显示是否正确
4. ✅ 检查最终结果是否生成

---

**准备就绪！请创建测试任务！** 🚀

