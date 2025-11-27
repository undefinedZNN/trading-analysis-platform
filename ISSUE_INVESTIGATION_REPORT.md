# 🔍 问题调研报告

**任务ID**: `73956c32-ff25-4ee8-aad7-42acba026d76`  
**调研时间**: 2025-11-26 00:45  
**调研人员**: AI Assistant

---

## 📋 问题概述

用户报告了4个关键问题：

1. ❌ **任务完成，但总交易次数为0**
2. ❌ **收益率 -39.18% 不合理**（没有交易怎么会有亏损？）
3. ❌ **交易明细 parquet 文件为空**
4. ❌ **进度没有同步到前端界面**
5. ❓ **交易周期确认**：用户选择 5m，需要确认是否正确使用

---

## 🔎 详细调查结果

### 问题1: 交易次数为0 & Trades文件为空

#### 🔍 调查发现

1. **Worker日志显示**：
   ```
   ✅ 任务完成: 73956c32-ff25-4ee8-aad7-42acba026d76
      总交易次数: 0
      总收益率: -39.18%
      处理Bar数: 5296428
   ```

2. **订单执行记录**：
   ```bash
   grep -c "exit order" worker.log
   # 输出: 244
   ```
   说明：Worker 实际执行了 244 个退出订单

3. **所有订单都有警告**：
   ```
   [WARNING] Entry order for exit order 964 not found
   [WARNING] Entry order for exit order 966 not found
   [WARNING] Entry order for exit order 968 not found
   ...
   ```

4. **Trades文件检查**：
   ```bash
   文件: trades_1764088782383.parquet
   大小: 598 bytes
   记录数: 0
   ```

#### 💡 根本原因

**FactorCollector 无法配对入场和出场订单**

-StrategySembl 生成了订单，但 `FactorCollector` 无法找到对应的入场订单（entry order），导致：
1. 无法形成完整的交易记录
2. trades.parquet 为空
3. Backtrader 统计的交易数为 0

#### 🔧 可能的原因

1. **订单ID映射问题**：
   - 入场订单和出场订单使用不同的 ID
   - FactorCollector 的 `_entry_orders` 字典没有正确记录入场订单

2. **订单生命周期问题**：
   - 入场订单被记录，但在出场时已被清理
   - 时序问题导致出场订单先于入场订单被处理

3. **策略逻辑问题**：
   - 策略可能只记录了出场订单，没有记录入场订单
   - `notify_order()` 方法可能没有正确调用 FactorCollector

---

### 问题2: 收益率 -39.18% 不合理

#### 🔍 分析

如果没有任何交易（0笔），收益率应该是 0% 或接近 0%（只有手续费损耗）。

**-39.18% 的亏损可能来自**：
1. **初始资金错误**：Backtrader 认为初始资金和最终资金有差异
2. **手续费计算错误**：虽然没有完成的交易，但可能有未平仓的订单在扣手续费
3. **持仓损失**：可能有未平仓的持仓，按当前价格计算有浮动亏损

#### 💡 需要检查

```python
# 在 BacktestExecutor 中检查
final_value = cerebro.broker.getvalue()
initial_cash = execution_config.get('initialCapital', 100000)
print(f"初始资金: {initial_cash}")
print(f"最终价值: {final_value}")
print(f"未平仓订单: {strategy.positions}")
```

---

### 问题3: 进度没有同步到前端

#### 🔍 调查发现

1. **RabbitMQ 队列状态**：
   ```
   backtest.progress  0 条消息
   backtest.status    0 条消息
   backtest.result    3 条消息（❌ 未消费）
   ```

2. **Worker日志**：
   - ❌ **没有** "Progress:" 或 "send_progress" 相关输出
   - ❌ `ProgressTracker` 似乎没有被调用

3. **Backend日志**：
   ```
   [Nest] 66310 - 12:09:28 AM LOG [BacktestMessageConsumer] Received status: ... - RUNNING
   [Nest] 66310 - 12:22:52 AM LOG [BacktestMessageConsumer] Received status: ... - RUNNING
   [Nest] 66310 - 12:39:42 AM LOG [BacktestMessageConsumer] Received status: ... - COMPLETED
   ```
   - ✅ Backend 收到了 status 消息
   - ❌ Backend **没有** 收到或处理 progress 消息
   - ❌ Backend **没有** 处理 result 消息（队列中有3条）

#### 💡 根本原因

1. **Worker 端**：`ProgressTracker.update()` 没有被调用
   - 可能原因：Worker 使用的是旧版本代码（修复前）
   - 需要验证：检查 Worker 进程的启动时间和代码版本

2. **Backend 端**：result 队列没有被正确消费
   - Backend 的消费者可能有问题
   - 队列绑定可能不正确

---

### 问题4: Backend 未消费 Result 队列

#### 🔍 调查发现

**队列状态**：
```
backtest.result  3 条消息（❌ 堆积）
```

**Backend 日志**：
- ✅ 有 "Received status" 日志
- ❌ 没有 "Received result" 或 "Received progress" 日志

**队列绑定关系**（混乱）：
```
backtest.exchange  ->  backtest.result   (routing: result.*)
backtest.exchange  ->  backtest.results  (routing: result.*)
backtest           ->  backtest.result   (routing: result.complete)
```

#### 💡 可能的原因

1. **Exchange 不匹配**：
   - Worker 发送到 `backtest` exchange
   - Backend 监听 `backtest.exchange` exchange

2. **队列名称不一致**：
   - 有 `backtest.result`（单数）
   - 有 `backtest.results`（复数）
   - Backend 可能监听了错误的队列

3. **消费者未启动**：
   - Backend 的 result 消费者可能没有正确启动
   - 或者启动后遇到错误停止了

---

### 问题5: 交易周期确认

#### 🔍 检查要点

用户创建任务时选择的是 **5m 周期**，需要确认：

1. **Backend 发送的任务消息**：
   ```json
   {
     "dataConfig": {
       "timeframe": "5m",
       "tradingPair": "ES",
       ...
     }
   }
   ```

2. **Worker 实际使用的数据**：
   - ✅ 处理了 5,296,428 bars（约530万条）
   - 这是 **1秒级别** 的数据量（约61天的1s数据）
   - 如果是5m数据，应该只有 ~17,000 条

3. **策略信号生成**：
   - 策略应该使用 5m 重采样数据生成信号
   - 但实际执行应该在 1s 数据上
   - 需要确认 `RabbitMQStrategy` 是否正确使用了多周期

#### 💡 结论

**Worker 实际使用的是 1秒级别的数据**，不是 5m 数据。

这可能是：
1. ✅ **正确的行为**：多周期模式下，使用 1s 数据执行，5m 数据生成信号
2. ❌ **错误的行为**：Backend 传递了错误的数据集路径

---

## 🎯 问题优先级和解决方案

### 🔴 优先级1: 修复订单配对问题（交易数为0）

**问题**：FactorCollector 无法配对订单

**解决方案**：
1. 检查 `RabbitMQStrategy.notify_order()` 方法
2. 确认入场订单是否被正确记录到 `FactorCollector._entry_orders`
3. 检查订单 ID 是否一致
4. 添加详细日志输出

**验证**：
```bash
# 检查策略代码
grep -A 30 "def notify_order" backtest-worker/src/backtrader_integration/execution/backtest_executor.py

# 检查 FactorCollector
grep -A 20 "record_entry_factors" backtest-worker/src/backtrader_integration/factors/factor_collector.py
```

---

### 🟠 优先级2: 修复进度同步问题

**问题**：Worker 没有发送进度消息

**解决方案**：
1. **验证 Worker 版本**：
   ```bash
   # 检查 Worker 进程启动时间
   ps -p 18076 -o lstart,command
   
   # 检查代码最后修改时间
   stat -f "%Sm" backtest-worker/src/backtrader_integration/execution/backtest_executor.py
   ```

2. **重启 Worker**：
   ```bash
   cd /Volumes/CODE/trading-analysis-platform/backtest-worker
   ./manage_worker.sh restart
   ```

3. **添加调试日志**：
   在 `ProgressTracker.update()` 中添加：
   ```python
   logger.info(f"Progress: {current_bar}/{self.total_bars} = {progress:.1f}%")
   ```

---

### 🟡 优先级3: 修复 Backend Result 消费问题

**问题**：Backend 没有消费 result 队列

**解决方案**：

1. **统一 Exchange 名称**：
   - Worker: 使用 `backtest.exchange`
   - Backend: 监听 `backtest.exchange`

2. **统一队列名称**：
   - 删除重复的队列（`backtest.result` vs `backtest.results`）

3. **验证消费者**：
   ```bash
   # 检查 Backend 启动日志
   tail -100 /Users/zen/.cursor/projects/Volumes-CODE-trading-analysis-platform/terminals/3.txt | grep "consumer"
   ```

4. **清理并重新绑定队列**：
   ```bash
   # 删除旧队列
   docker exec trading-rabbitmq rabbitmqadmin -V /backtest delete queue name=backtest.result
   docker exec trading-rabbitmq rabbitmqadmin -V /backtest delete queue name=backtest.results
   
   # 重启 Backend（会自动重新创建和绑定）
   ```

---

### 🟢 优先级4: 确认交易周期配置

**问题**：用户选择 5m，但 Worker 处理了 530万条数据（1s级别）

**需要确认**：

1. **检查任务配置**：
   ```bash
   curl -s 'http://localhost:3000/api/v1/backtesting/tasks/73956c32-ff25-4ee8-aad7-42acba026d76' | \
     python3 -c "import sys, json; d=json.load(sys.stdin); print('Timeframe:', d['dataConfig']['timeframe']); print('Dataset:', d.get('datasetPath', 'N/A'))"
   ```

2. **检查数据集**：
   - 用户选择的数据集是否是 1s 数据
   - 还是 5m 聚合数据

3. **策略多周期确认**：
   - 策略应该同时加载 1s 数据和 5m 重采样数据
   - 5m 数据用于信号，1s 数据用于执行

---

## 📊 数据统计

| 指标 | 值 | 说明 |
|------|-----|------|
| 任务ID | 73956c32-ff25-4ee8-aad7-42acba026d76 | 已完成 |
| 处理Bars数 | 5,296,428 | ~1秒级别数据 |
| 退出订单数 | 244 | 日志中记录 |
| 配对成功交易数 | 0 | FactorCollector 统计 |
| Trades文件大小 | 598 bytes | 空文件（仅头部） |
| 收益率 | -39.18% | 不合理 |
| Worker进程 | PID 18076 | 运行中 |
| Backend进程 | PID 66310 | 运行中 |
| RabbitMQ未消费消息 | 3 条（result队列） | 需处理 |

---

## 🚀 下一步行动建议

### 立即执行

1. **检查并修复 FactorCollector**
   ```bash
   # 查看订单配对逻辑
   cd /Volumes/CODE/trading-analysis-platform/backtest-worker
   grep -A 30 "def record_entry_factors" src/backtrader_integration/factors/factor_collector.py
   grep -A 30 "def record_exit_factors" src/backtrader_integration/factors/factor_collector.py
   ```

2. **重启 Worker（使用最新代码）**
   ```bash
   ./manage_worker.sh kill
   sleep 2
   ./manage_worker.sh start
   ```

3. **清理 RabbitMQ 队列**
   ```bash
   cd /Volumes/CODE/trading-analysis-platform/backtest-worker
   python3 purge_all_queues.py
   ```

4. **创建测试任务**
   - 使用小数据集（如 1天的5m数据）
   - 观察订单配对和交易记录

### 后续优化

1. 统一 RabbitMQ 配置（Exchange 和 Queue 命名）
2. 增强 FactorCollector 的日志输出
3. 添加订单配对失败的详细错误信息
4. 实现进度实时推送（WebSocket）

---

**报告完成时间**: 2025-11-26 00:50  
**状态**: 待用户确认和讨论

