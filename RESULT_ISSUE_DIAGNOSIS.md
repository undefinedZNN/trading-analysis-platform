# 🔍 回测结果问题诊断报告

**时间**: 2025-11-26 12:00 PM  
**任务ID**: 22fc0e08-cc4b-4da1-b9d0-f08722f1ca9d

---

## 📊 问题现象

### 用户报告
1. ❌ 回测结果没有同步到Backend
2. ❌ Parquet没有存储交易明细
3. ⚠️ 总交易次数: 0
4. ⚠️ 总收益率: -39.18%
5. ✅ 处理Bar数: 5296428

---

## 🔍 调查过程

### 第1步：检查Worker日志

**Worker日志显示**:
```
2025-11-26 12:06:13,725 [INFO] Backtest completed in 951.47s
2025-11-26 12:06:13,726 [INFO] Extracted 0 trades (simplified version)
2025-11-26 12:06:13,726 [INFO] Generated equity curve: 101 points
2025-11-26 12:06:13,733 [INFO] Trades saved to: 22fc0e08.../trades_...parquet
2025-11-26 12:06:13,743 [INFO] Equity curve saved to: 22fc0e08.../equity_...parquet
2025-11-26 12:06:13,743 [INFO] Task 22fc0e08... completed successfully
2025-11-26 12:06:13,743 [INFO] 总交易次数: 0
2025-11-26 12:06:13,743 [INFO] 总收益率: -39.18%
2025-11-26 12:06:13,743 [INFO] 处理Bar数: 5296428
```

**关键发现**:
- ✅ Worker完成了回测
- ✅ 生成了equity curve（101点）
- ✅ 保存了parquet文件
- ⚠️ 提取了0笔交易
- ❌ 没有发送result消息到Backend的日志

---

### 第2步：检查Backend日志

**Backend日志显示**:
```
[LOG] Queue 'backtest.results' bound to exchange 'backtest.exchange' with routing key 'result'
[LOG] Result consumer started
```

**关键发现**:
- ✅ Result队列已创建并绑定
- ✅ Result consumer已启动
- ❌ 没有收到任何result消息

---

### 第3步：对比配置

#### Routing Key配置

**Backend** (`rabbitmq.config.ts`):
```typescript
RABBITMQ_ROUTING_KEYS.RESULT = 'result'

QUEUE_BINDINGS = [
  {
    queue: 'backtest.results',
    exchange: 'backtest.exchange',
    routingKey: 'result',  // ← 精确匹配
  },
]
```

**Worker** (`rabbitmq_client.py`):
```python
class MessageType(Enum):
    RESULT = 'result.complete'  // ← 不匹配！
```

**问题**: Routing key不匹配
- Worker发送到: `result.complete`
- Backend绑定到: `result` (精确匹配)
- 结果: 消息无法路由！

---

## 🎯 问题汇总

### 问题1: Result消息无法送达Backend ❌

**原因**: Routing Key不匹配

**影响**:
- Worker发送的结果消息被RabbitMQ丢弃
- Backend从未收到任务完成通知
- 前端无法显示回测结果

**严重性**: 严重（核心功能不可用）

---

### 问题2: 0笔交易 ⚠️

**原因**: 策略没有产生交易信号

**证据**:
- Worker日志: "Extracted 0 trades"
- 没有任何 "BUY SIGNAL" 或 "SELL SIGNAL" 日志
- 没有任何 "notify_order" 相关日志

**可能原因**:
1. **SMA指标不满足交易条件**
   - 数据: 5302427个1秒bars
   - 策略: 5分钟SMA crossover
   - 可能整个回测期间never产生交叉信号

2. **数据问题**
   - 5分钟resampled数据可能不足
   - Warmup period不足（fast=10, slow=20，需要至少20个5分钟bars）

3. **策略参数问题**
   - 快慢周期可能设置不合理
   - 初始资金不足？（虽然不太可能）

**严重性**: 中等（需要调查，但不影响系统功能）

---

### 问题3: 文件保存路径 ℹ️

**Worker配置**:
```python
# ParquetWriter
storage_base_path = project_root / 'backend' / 'storage' / 'backtest-results'
```

**实际情况**:
- Worker日志显示保存成功
- 但在 `/Volumes/CODE/.../backend/storage/results/` 找不到文件

**可能原因**:
- Worker保存到了 `backend/storage/backtest-results/`
- 而不是 `backend/storage/results/`
- 需要检查实际文件位置

**严重性**: 低（不影响功能，只是路径不一致）

---

## 🛠️ 修复方案

### 修复1: Result Routing Key（高优先级）

**方案A: 修改Backend使用通配符** ✅ 推荐
```typescript
// rabbitmq.config.ts
{
  queue: RABBITMQ_QUEUES.RESULT_QUEUE,
  exchange: RABBITMQ_EXCHANGES.BACKTEST,
  routingKey: 'result.*',  // 使用通配符
},
```

**优点**:
- 与其他队列保持一致（都用通配符）
- 更灵活，可接受 result.complete, result.error 等

**方案B: 修改Worker使用简单key**
```python
# rabbitmq_client.py
RESULT = 'result'  # 改为简单key
```

**缺点**:
- 与其他MessageType不一致
- 不够语义化

**推荐**: 方案A

**已修改**: ✅ `rabbitmq.config.ts` Line 119

---

### 修复2: 调查0笔交易（中优先级）

#### 步骤1: 添加调试日志

在 `RabbitMQStrategy.__init__()` 中添加:
```python
logger.info(f"Strategy initialized: fast_period={self.p.fast_period}, slow_period={self.p.slow_period}")
logger.info(f"Signal data: {len(self.signal_data)} bars")
```

在 `RabbitMQStrategy.next()` 中添加（每1000 bars打印一次）:
```python
if len(self) % 1000 == 0:
    logger.debug(f"SMA values: fast={self.sma_fast[0]:.2f}, slow={self.sma_slow[0]:.2f}, crossover={self.crossover[0]}")
```

#### 步骤2: 检查数据和指标

运行一个短期测试任务（1天数据），观察:
1. SMA值是否正常计算
2. 是否有交叉信号
3. 如果没有交叉，尝试调整参数（如fast=5, slow=10）

#### 步骤3: 验证FactorCollector

确认 `FactorCollector.set_strategy(self)` 已被调用
- 已在前面修复过这个问题
- 检查是否生效

---

### 修复3: 统一文件保存路径（低优先级）

#### 选项A: 修改Worker路径
```python
# ParquetWriter
storage_base_path = project_root / 'backend' / 'storage' / 'results'
```

#### 选项B: 修改Backend期望路径
```typescript
// 修改Backend读取results的路径配置
```

**建议**: 先确认实际文件保存在哪里，再决定修改哪一端

---

## ✅ 下一步行动

### 立即执行

1. **重启Backend** ✅ 必须
   - 使新的routing key配置生效
   - 验证result消息能否被接收

2. **创建新的测试任务**
   - 使用较小的数据集（1-2天）
   - 使用更敏感的策略参数（fast=5, slow=10）
   - 观察是否产生交易

3. **监控result消息**
   ```bash
   python3 /tmp/monitor_rabbitmq_messages.py backtest.results
   ```

### 后续调查

4. **分析0笔交易原因**
   - 添加调试日志
   - 检查SMA计算
   - 验证数据质量

5. **确认文件保存路径**
   - 查找实际文件位置
   - 统一路径配置

---

## 📊 对比：Progress vs Result

| 消息类型 | Worker Routing Key | Backend绑定 | 状态 |
|---------|-------------------|------------|------|
| Status | `status.change` | `status.*` | ✅ 工作正常 |
| Progress | `progress.update` | `progress.*` | ✅ 工作正常 |
| Result | `result.complete` | `result` ❌ | ❌ 不匹配 |
| Error | `error.report` | `error.*` | ⚠️ 未测试 |

**结论**: Result是唯一使用精确匹配的队列，其他都用通配符

---

## 🔧 验证步骤

### 1. 重启Backend后验证

```bash
# 检查Backend日志
tail -f /Users/zen/.cursor/projects/.../terminals/3.txt | grep -E "result|Result"

# 应该看到:
# Queue 'backtest.results' bound to exchange 'backtest.exchange' with routing key 'result.*'
```

### 2. 监控result消息

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
source venv/bin/activate
python3 /tmp/monitor_rabbitmq_messages.py backtest.results
```

### 3. 创建测试任务

- 数据集: ES-23/ES/5m（pre-aggregated）
- 时间范围: 1-2天
- 策略参数: fast=5, slow=10

### 4. 观察结果

- Worker日志: 是否有交易？
- Backend日志: 是否收到result消息？
- 前端: 是否显示结果？

---

## 📝 总结

### 根本原因

**主要问题**: Routing Key配置不一致
- 所有其他消息类型都使用通配符（`*.`）
- 只有result使用精确匹配
- 这导致Worker发送的`result.complete`无法路由到Backend

**次要问题**: 策略没有产生交易
- 可能是SMA参数不合适
- 可能是数据不满足交易条件
- 需要进一步调查

### 修复状态

| 问题 | 状态 | 说明 |
|-----|------|-----|
| Result消息路由 | ✅ 已修复 | Backend改用通配符 |
| 0笔交易 | 🔍 调查中 | 需要添加日志验证 |
| 文件路径 | ℹ️ 待确认 | 需要查找实际位置 |

---

**报告生成时间**: 2025-11-26 12:10 PM  
**状态**: 等待Backend重启验证

