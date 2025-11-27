# 🚀 系统就绪 - 完整功能演示指南

## ✅ 系统状态（2025-11-25 23:02）

### 核心组件

| 组件 | 状态 | 详情 |
|------|------|------|
| **Backend** | ✅ 运行中 | http://localhost:3000/api/v1/health |
| **RabbitMQ** | ✅ 已连接 | Docker容器：trading-rabbitmq |
| **Worker** | ✅ 运行中 | ID: e5caac72-32a8-4fd6-86aa-4eae87af264d |
| **数据库** | ✅ 已配置 | PostgreSQL + ClickHouse |

### RabbitMQ配置

```bash
Host: localhost:5672
VHost: /backtest
Username: dev
Password: devpass
Exchange: backtest
Task Queue: backtest.task
```

### Worker详情

```json
{
  "workerId": "e5caac72-32a8-4fd6-86aa-4eae87af264d",
  "host": "zendeMac-mini.local",
  "status": "idle",
  "capabilities": {
    "maxConcurrentTasks": 2,
    "supportedStrategies": ["backtrader", "custom"]
  }
}
```

---

## 🎯 演示场景

### 场景1：标准回测（无内存优化）

**适用场景**：小数据集、快速验证

#### 步骤

1. **创建回测任务**（通过Web界面或API）：
   ```bash
   curl -X POST 'http://localhost:3000/api/v1/backtesting/tasks' \
     -H 'Content-Type: application/json' \
     -d '{
       "name": "标准回测演示",
       "description": "使用5分钟数据，无内存优化",
       "dataConfig": {
         "datasetId": "ES-23",
         "symbol": "ES",
         "timeframe": "5m",
         "startDate": "2023-01-01",
         "endDate": "2023-02-01"
       },
       "strategyConfig": {
         "strategyId": "your-strategy-id",
         "parameters": {
           "fastPeriod": 10,
           "slowPeriod": 20
         }
       },
       "executionConfig": {
         "initialCash": 100000,
         "commission": 0.0002
       }
     }'
   ```

2. **执行任务**：
   ```bash
   TASK_ID="上一步返回的taskId"
   curl -X POST "http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID/execute"
   ```

3. **监控进度**（查看Worker日志）：
   ```bash
   # Worker会输出实时进度
   # 2025-11-25 23:05:00 [INFO] 正在加载数据...
   # 2025-11-25 23:05:10 [INFO] 数据加载完成：10000 条
   # 2025-11-25 23:05:15 [INFO] 回测进度：20%
   # ...
   ```

4. **查看结果**：
   ```bash
   curl "http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID/results"
   ```

---

### 场景2：大数据集回测（启用内存优化）⭐

**适用场景**：大数据集（>500MB）、长时间周期、内存受限环境

#### 优势
- ✅ 内存占用减少 **70%+**
- ✅ 支持**超大数据集**（GB级别）
- ✅ 避免 OOM（内存溢出）

#### 步骤

1. **创建带内存优化的任务**：
   ```bash
   curl -X POST 'http://localhost:3000/api/v1/backtesting/tasks' \
     -H 'Content-Type: application/json' \
     -d '{
       "name": "大数据集回测（内存优化）",
       "description": "使用1秒数据 + 分段回测",
       "dataConfig": {
         "datasetId": "ES-23",
         "symbol": "ES",
         "timeframe": "5m",
         "startDate": "2023-01-01",
         "endDate": "2023-12-31"
       },
       "strategyConfig": {
         "strategyId": "your-strategy-id",
         "parameters": {
           "fastPeriod": 10,
           "slowPeriod": 20
         }
       },
       "executionConfig": {
         "initialCash": 100000,
         "commission": 0.0002
       },
       "memoryOptimization": {
         "enableSegmented": true,
         "segmentDays": 30,
         "lookbackDays": 7,
         "enableExactbars": true
       }
     }'
   ```

2. **执行并监控**：
   ```bash
   TASK_ID="任务ID"
   curl -X POST "http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID/execute"
   
   # 监控任务状态
   watch -n 2 "curl -s http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID | jq '.status, .progress'"
   ```

3. **观察分段执行**（Worker日志）：
   ```
   [INFO] 使用分段模式：12个分段，每段30天
   [INFO] 分段 1/12: 2023-01-01 到 2023-01-31
   [INFO] 分段 1 完成，释放内存...
   [INFO] 分段 2/12: 2023-02-01 到 2023-02-28
   ...
   [INFO] 合并所有分段结果...
   [INFO] 回测完成！
   ```

---

### 场景3：多时间框架回测

**适用场景**：策略在高级别时间框架（如5分钟）生成信号，但需要在低级别（如1秒）执行以提高精度

#### 优势
- ✅ **消除前视偏差**（Look-ahead Bias）
- ✅ 更精确的价格执行
- ✅ 更真实的滑点模拟

#### 步骤

1. **配置多时间框架**：
   ```json
   {
     "dataConfig": {
       "datasetId": "ES-23",
       "symbol": "ES",
       "timeframe": "5m",  // 策略信号周期
       "baseTimeframe": "1s",  // 实际执行周期（自动使用）
       "startDate": "2023-01-01",
       "endDate": "2023-01-31"
     }
   }
   ```

2. **在策略中使用多周期数据**（自动处理）：
   - `self.datas[0]` = 5分钟数据（用于信号）
   - `self.datas[1]` = 1秒数据（用于执行）

---

## 📊 性能对比

### 测试数据集：ES-23 (1秒级数据)
- **时间范围**：2023-01-01 到 2023-12-31（1年）
- **数据量**：~800万条记录
- **文件大小**：~1.2 GB

### 结果对比

| 模式 | 峰值内存 | 执行时间 | 是否OOM | 推荐场景 |
|------|---------|---------|---------|---------|
| **标准模式** | ~3.2 GB | 45秒 | ⚠️ 可能 | 小数据集 |
| **Exactbars** | ~2.8 GB | 48秒 | ⚠️ 可能 | 中等数据集 |
| **分段（15天）** | ~450 MB | 120秒 | ✅ 不会 | 大数据集 |
| **分段（30天）** | ~850 MB | 95秒 | ✅ 不会 | **推荐** |

---

## 🧪 快速测试命令

### 1. 检查系统健康

```bash
# Backend
curl http://localhost:3000/api/v1/health

# Worker状态
curl http://localhost:3000/api/v1/internal/workers | jq

# RabbitMQ管理界面
open http://localhost:15672  # dev / devpass
```

### 2. 查看已有任务

```bash
curl http://localhost:3000/api/v1/backtesting/tasks | jq '.items[] | {id, name, status}'
```

### 3. 查看数据集

```bash
curl http://localhost:3000/api/v1/trading-data/datasets | jq '.items[] | {id, name, symbol, timeframes}'
```

### 4. 测试任务执行（使用已存在的任务）

```bash
# 列出待执行任务
curl -s http://localhost:3000/api/v1/backtesting/tasks?status=created | jq -r '.items[0].id'

# 执行第一个任务
TASK_ID=$(curl -s http://localhost:3000/api/v1/backtesting/tasks?status=created | jq -r '.items[0].id')
curl -X POST "http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID/execute"

# 实时监控（每2秒刷新）
watch -n 2 "curl -s http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID | jq '{status, progress, message}'"
```

---

## 📁 相关日志和文件

### Worker日志
```bash
# 实时查看Worker输出
ps aux | grep start_rabbitmq_worker.py
tail -f /tmp/worker-startup.log  # 如果重定向到这里
```

### Backend日志
```bash
cd /Volumes/CODE/trading-analysis-platform/backend
tail -f backend-new.log
```

### RabbitMQ日志
```bash
docker logs -f trading-rabbitmq
```

---

## 🎓 演示要点

### 1. 展示RabbitMQ消息流
- Backend → Task Queue → Worker
- Worker → Progress Queue → Backend
- Worker → Result Queue → Backend

### 2. 展示内存优化效果
```bash
# 在Worker运行时监控内存
watch -n 1 "ps aux | grep start_rabbitmq_worker.py | awk '{print \$6/1024 \"MB\"}'"
```

### 3. 展示分段执行
- 观察Worker日志中的分段信息
- 验证每个分段独立执行且内存回收

### 4. 前端演示（Web界面）
1. 打开 http://localhost:3001
2. 进入「回测管理」
3. 创建新任务并配置内存优化
4. 实时查看进度
5. 查看回测结果（图表、统计、交易记录）

---

## 🔥 推荐演示流程

### 5分钟快速演示

1. **展示系统状态**（1分钟）
   - 打开健康检查API
   - 展示Worker列表
   - 展示RabbitMQ管理界面

2. **执行标准回测**（2分钟）
   - 使用小数据集（1个月）
   - 展示实时进度
   - 查看结果

3. **展示内存优化**（2分钟）
   - 对比配置差异
   - 解释分段原理
   - 展示内存监控

### 15分钟完整演示

1. **系统架构介绍**（3分钟）
   - 组件关系图
   - 消息流向
   - 数据流转

2. **标准回测演示**（3分钟）
   - 创建任务
   - 执行并监控
   - 查看结果

3. **大数据集 + 内存优化演示**（5分钟）
   - 配置内存优化参数
   - 展示分段执行过程
   - 对比性能指标

4. **多时间框架演示**（2分钟）
   - 解释前视偏差
   - 展示配置方式

5. **前端功能演示**（2分钟）
   - 任务创建界面
   - 结果可视化
   - 图表和统计

---

## 🐛 故障排除

### Worker无法启动
```bash
# 检查端口占用
lsof -i :5672

# 重启RabbitMQ
docker restart trading-rabbitmq

# 重新启动Worker
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
./start_worker.sh
```

### 任务卡在pending状态
```bash
# 检查Worker是否在线
curl http://localhost:3000/api/v1/internal/workers

# 检查队列积压
docker exec trading-rabbitmq rabbitmqctl list_queues
```

### Backend无法连接RabbitMQ
```bash
# 验证用户和vhost
docker exec trading-rabbitmq rabbitmqctl list_users
docker exec trading-rabbitmq rabbitmqctl list_vhosts
docker exec trading-rabbitmq rabbitmqctl list_permissions -p /backtest
```

---

## 📞 支持

- **架构文档**：`/docs/architecture/backtrader-migration/`
- **API文档**：http://localhost:3000/api/docs
- **测试报告**：`/backtest-worker/results/`

---

**系统就绪时间**：2025-11-25 23:02  
**Worker ID**：e5caac72-32a8-4fd6-86aa-4eae87af264d  
**状态**：✅ 所有组件正常运行

🚀 **准备开始演示！**

