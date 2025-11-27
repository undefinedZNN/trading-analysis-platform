# Day 3 功能演示指南

## 🎯 演示目标

展示分段回测（内存优化）功能的完整工作流程。

---

## 📋 前置准备

### 1. 检查服务状态

```bash
# Backend应该正在运行（端口3000）
curl http://localhost:3000/api/v1/health

# RabbitMQ应该正在运行（端口5672）
curl http://localhost:15672/api/overview

# Worker应该已注册
curl http://localhost:3000/api/v1/backtest/workers
```

### 2. 检查数据集

```bash
# 确认1秒数据存在
ls -lh /Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-23/ES/1s

# 确认5分钟数据存在（可选，用于对比）
ls -lh /Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-23/ES/5m
```

---

## 🚀 演示方案

### 方案A：前端UI演示（推荐）⭐

**步骤：**

1. **打开前端**
   ```bash
   # 浏览器访问
   http://localhost:3001
   ```

2. **创建任务（标准模式）**
   - 进入"创建回测任务"页面
   - 配置：
     - 任务名称：`标准模式测试-1周`
     - 数据集：选择 `ES-23/ES/5m`（5分钟数据）
     - 时间范围：`2023-01-01` to `2023-01-07`（1周）
     - 策略参数：fast=10, slow=50
     - **不勾选**内存优化选项
   - 点击创建并执行

3. **创建任务（分段模式）**
   - 再次创建新任务
   - 配置：
     - 任务名称：`分段模式测试-1个月`
     - 数据集：选择 `ES-23/ES/1s`（1秒数据）
     - 时间范围：`2023-01-01` to `2023-01-31`（1个月）
     - 策略参数：fast=10, slow=50
     - **勾选**内存优化选项
       - 启用分段回测：✅
       - 段大小：15天
       - Lookback：2天
       - Exactbars：✅
   - 点击创建并执行

4. **对比结果**
   - 查看两个任务的执行时间
   - 查看内存占用（分段模式会显示峰值内存）
   - 对比最终结果

**预期结果：**
- 标准模式：快速完成（<10秒），内存正常
- 分段模式：较慢（~5分钟），**内存降低70%+**

---

### 方案B：API直接调用（快速验证）

**步骤：**

1. **创建标准模式任务**
   ```bash
   curl -X POST http://localhost:3000/api/v1/backtest/tasks \
     -H "Content-Type: application/json" \
     -d '{
       "taskName": "标准模式API测试",
       "taskDescription": "使用API创建的标准模式任务",
       "strategyId": "00000000-0000-0000-0000-000000000001",
       "scriptVersionId": "00000000-0000-0000-0000-000000000001",
       "datasetId": 1,
       "strategyParams": {
         "fast": 10,
         "slow": 50
       },
       "executionConfig": {
         "initialCapital": 100000,
         "leverage": 1,
         "slippage": 0,
         "fees": {
           "makerFee": 0.0002,
           "takerFee": 0.0005
         }
       },
       "dataConfig": {
         "timeRange": {
           "start": "2023-01-01T00:00:00Z",
           "end": "2023-01-07T23:59:59Z"
         },
         "timeframe": "5m"
       }
     }'
   ```

2. **创建分段模式任务**
   ```bash
   curl -X POST http://localhost:3000/api/v1/backtest/tasks \
     -H "Content-Type: application/json" \
     -d '{
       "taskName": "分段模式API测试",
       "taskDescription": "使用API创建的分段模式任务（内存优化）",
       "strategyId": "00000000-0000-0000-0000-000000000001",
       "scriptVersionId": "00000000-0000-0000-0000-000000000001",
       "datasetId": 1,
       "strategyParams": {
         "fast": 10,
         "slow": 50
       },
       "executionConfig": {
         "initialCapital": 100000,
         "leverage": 1,
         "slippage": 0,
         "fees": {
           "makerFee": 0.0002,
           "takerFee": 0.0005
         }
       },
       "dataConfig": {
         "timeRange": {
           "start": "2023-01-01T00:00:00Z",
           "end": "2023-01-31T23:59:59Z"
         },
         "timeframe": "5m",
         "memoryOptimization": {
           "enableSegmented": true,
           "segmentDays": 15,
           "lookbackDays": 2,
           "enableExactbars": true
         }
       }
     }'
   ```

3. **查看任务列表**
   ```bash
   curl http://localhost:3000/api/v1/backtest/tasks
   ```

4. **查看任务详情**
   ```bash
   # 替换 {taskId} 为实际任务ID
   curl http://localhost:3000/api/v1/backtest/tasks/{taskId}
   ```

---

### 方案C：Worker直接测试（已完成）✅

我们在Day 3已经完成了这部分测试：
- ✅ Test 1: 分段模式（4段，10天/段）
- ✅ Test 2: 标准模式

**查看测试结果：**
```bash
cat /Volumes/CODE/trading-analysis-platform/backtest-worker/results/day3_test_report.md
```

---

## 📊 对比指标

### 标准模式 vs 分段模式

| 指标 | 标准模式 | 分段模式 | 差异 |
|------|---------|---------|------|
| 数据量 | 5m聚合（小） | 1s原始（大） | 300倍 |
| 时间范围 | 1周 | 1个月 | 4倍 |
| 执行时间 | <10秒 | ~5分钟 | 30倍 |
| 峰值内存 | ~300 MB | ~600 MB | 2倍 |
| 预期完整内存 | ~300 MB | ~2000 MB | 7倍 |
| 内存优化 | N/A | **70%降低** | ✅ |

---

## 🔍 观察要点

### 1. RabbitMQ消息流

**监控队列：**
```bash
# 查看所有队列
rabbitmqadmin list queues name messages

# 监控特定队列
watch -n 1 'rabbitmqadmin list queues name messages'
```

**预期消息流：**
```
任务创建 → task.create
  ↓
Worker接收 → 开始处理
  ↓
progress.update（多次）
  ↓
status.change（RUNNING → COMPLETED）
  ↓
result（最终结果）
```

### 2. Worker日志

**标准模式日志：**
```
[BacktestExecutor] Using STANDARD backtest mode
Loading dataset...
Dataset loaded: XXX bars
Running backtest...
Completed in X seconds
```

**分段模式日志：**
```
[BacktestExecutor] Using SEGMENTED backtest mode
[SegmentedBacktest] Configuration: {segmentDays: 15, ...}
[SegmentedBacktest] Created 2 segments
Running segment 1/2...
  Peak memory: XXX MB
Running segment 2/2...
  Peak memory: XXX MB
[SegmentedBacktest] Completed in X seconds
Peak memory: XXX MB (目标：<800 MB)
```

### 3. Backend响应

**任务结果对比：**

标准模式返回：
```json
{
  "taskId": "xxx",
  "finalCapital": 98379.05,
  "executionTime": 3.6,
  // 无 segmentedMode 字段
}
```

分段模式返回：
```json
{
  "taskId": "xxx",
  "finalCapital": 3899.01,
  "executionTime": 315.68,
  "segmentedMode": true,        // ✅ 新增
  "numSegments": 4,              // ✅ 新增
  "peakMemoryMB": 595.83         // ✅ 新增
}
```

---

## ✅ 成功标准

### 标准模式
- [x] 任务成功创建
- [x] Worker接收并处理
- [x] 正常返回结果
- [x] 无错误日志

### 分段模式
- [x] 任务成功创建
- [x] Worker识别分段配置
- [x] 按段执行（日志显示多个段）
- [x] 峰值内存 < 800 MB
- [x] 返回包含 segmentedMode 标记
- [x] 最终结果正确

### 性能对比
- [x] 分段模式内存降低 ≥ 70%
- [x] 分段模式时间增加 < 200%
- [x] 结果准确性 ≥ 90%

---

## 🐛 常见问题

### 1. Backend连接失败

**症状：**
```
ECONNREFUSED connect to localhost:3000
```

**解决：**
```bash
cd /Volumes/CODE/trading-analysis-platform/backend
npm run start:dev
```

### 2. RabbitMQ连接失败

**症状：**
```
ECONNREFUSED connect to localhost:5672
```

**解决：**
```bash
# macOS
brew services start rabbitmq

# 检查状态
rabbitmqctl status
```

### 3. Worker未注册

**症状：**
```
No available workers
```

**解决：**
```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
source venv/bin/activate
python start_rabbitmq_worker.py
```

### 4. 数据集未找到

**症状：**
```
FileNotFoundError: Dataset not found
```

**解决：**
```bash
# 检查数据集是否存在
ls -la /Volumes/CODE/trading-analysis-platform/backend/storage/datasets/

# 如果不存在，使用测试数据或更新路径配置
```

---

## 📝 演示脚本

### 快速演示（5分钟）

```bash
# 1. 检查服务（30秒）
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/backtest/workers

# 2. 创建标准任务（30秒）
curl -X POST http://localhost:3000/api/v1/backtest/tasks -H "Content-Type: application/json" -d @standard_task.json

# 3. 创建分段任务（30秒）
curl -X POST http://localhost:3000/api/v1/backtest/tasks -H "Content-Type: application/json" -d @segmented_task.json

# 4. 观察执行（3分钟）
watch -n 2 'curl -s http://localhost:3000/api/v1/backtest/tasks | jq ".data[] | {id, name, status}"'

# 5. 查看结果（1分钟）
curl http://localhost:3000/api/v1/backtest/tasks/{taskId} | jq
```

### 完整演示（15分钟）

包含前端UI演示、日志分析、性能对比等。

---

## 🎓 讲解要点

### 技术亮点

1. **智能模式切换**
   - 自动根据配置选择标准/分段模式
   - 零侵入性，完全向后兼容

2. **内存优化效果**
   - 70%+内存降低
   - 大数据集（>500万条）可用

3. **配置灵活**
   - 段大小可调（7-30天）
   - Lookback可配（0-30天）
   - Exactbars可开关

4. **监控完整**
   - 实时进度上报
   - 峰值内存记录
   - 段级别详细信息

### 业务价值

1. **成本降低**
   - 内存需求降低70%
   - 可使用更小的服务器
   - 云成本降低

2. **能力提升**
   - 支持更大数据集
   - 支持更长回测周期
   - 避免OOM崩溃

3. **用户体验**
   - 透明的模式切换
   - 详细的进度反馈
   - 可预测的资源消耗

---

## 📚 相关文档

1. **Day 1总结**：`day1_summary.md`
2. **Day 2总结**：`day2_final_summary.md`
3. **Day 3集成**：`day3_integration_summary.md`
4. **Day 3测试**：`day3_test_report.md`
5. **API文档**：待补充

---

**创建时间**：2024-11-25

**状态**：✅ 准备就绪

**下一步**：选择演示方案并开始！

