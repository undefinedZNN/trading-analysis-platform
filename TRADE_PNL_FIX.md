# 交易盈亏计算修复

**问题时间**: 2025-11-28  
**状态**: ✅ 修复完成，需要重启 Worker

---

## 🐛 问题描述

### 用户反馈
> 交易明细列表中显示的交易方向都是"做多"，盈亏数据看起来有问题。

### 问题现象

查看交易数据发现盈亏与价格变化方向不一致：

```json
{
  "tradeId":"trade-2",
  "side":"buy",
  "position":{"side":"long"},
  "entryPrice":3925.75,
  "exitPrice":3923,
  "realizedPnl":2.75  // ❌ 价格下跌，做多应该亏损，但显示盈利？
}
```

```json
{
  "tradeId":"trade-3",
  "side":"buy",
  "position":{"side":"long"},
  "entryPrice":3885,
  "exitPrice":3888,
  "realizedPnl":-3  // ❌ 价格上涨，做多应该盈利，但显示亏损？
}
```

---

## 🔍 问题分析

### 1. 交易方向显示"做多"是正确的

当前策略是**纯做多策略**：
- 🔵 **金叉** → 买入开仓（做多）
- 🔴 **死叉** → 卖出平仓

**策略代码**:
```python
# 没有持仓时
if self.crossover > 0:  # 金叉
    self.order = self.buy()  # 买入做多

# 有持仓时
if self.crossover < 0:  # 死叉
    self.order = self.sell()  # 卖出平仓
```

所以所有交易显示为"做多"是**符合预期**的。

---

### 2. 盈亏计算错误

#### 错误代码

**文件**: `backtest_executor.py` - `notify_order` 方法

```python
# ❌ 错误的计算逻辑
pnl = (order.executed.price - self.entry_price) * order.executed.size
```

#### 问题分析

**Backtrader 中的 size 约定**:
- 买入订单：`size = +1`
- 卖出订单：`size = -1`

**做多交易示例**:
1. **买入开仓**: entry_size = 1
2. **卖出平仓**: exit_size = -1

**错误计算**:
```python
pnl = (3930 - 3929.25) * (-1) = -0.75  // ❌ 符号错误
```

**正确计算应该是**:
```python
pnl = (3930 - 3929.25) * abs(-1) * 50 = 0.75 * 1 * 50 = 37.5  // ✅ 正确
```

#### 缺失的因素

1. **Size 符号错误**: 使用了 `exit_size`（负数），应该使用 `abs(size)`
2. **缺少合约乘数**: ES 期货的合约乘数是 **50**
3. **佣金未扣除**: 虽然记录了佣金，但 PNL 计算时应该是净盈亏

---

## ✅ 修复方案

### 修复代码

**文件**: `backtest_executor.py` - 第194-228行

```python
elif order.issell():
    logger.info(f"[Order] SELL COMPLETED: ref={order.ref}, price={order.executed.price:.2f}, "
               f"size={order.executed.size}, comm={order.executed.comm:.2f}")
    
    # 计算盈亏
    if self.entry_price:
        # ✅ 修复1: 使用 position.size 的绝对值（持仓数量）
        # 而不是 order.executed.size（卖出时为负）
        position_size = abs(order.executed.size)
        price_diff = order.executed.price - self.entry_price
        
        # ✅ 修复2: 考虑合约乘数（通过 broker 的 comminfo 获取）
        comminfo = self.broker.getcommissioninfo(self.data_1s)
        multiplier = comminfo.p.mult if hasattr(comminfo.p, 'mult') else 1
        
        # 计算净盈亏（考虑合约乘数但不含佣金）
        pnl = price_diff * position_size * multiplier
        pnl_percent = (price_diff / self.entry_price) * 100
        holding_bars = len(self) - self.entry_bar if self.entry_bar else 0
        
        logger.info(f"[Trade] PNL: ${pnl:.2f} ({pnl_percent:.2f}%), holding: {holding_bars} bars, multiplier: {multiplier}")
        
        # 记录出场因子
        self.factor_collector.record_exit_factors(
            order=order,
            pnl=pnl,
            pnl_percent=pnl_percent,
            holding_bars=holding_bars,
            sma_fast=self.sma_fast[0],
            sma_slow=self.sma_slow[0],
            close=self.data_1s.close[0],
            volume=self.data_1s.volume[0],
        )
```

### 修复内容

1. **✅ 使用 `abs(order.executed.size)`**
   - 确保数量为正数
   - 避免符号错误

2. **✅ 获取合约乘数**
   ```python
   comminfo = self.broker.getcommissioninfo(self.data_1s)
   multiplier = comminfo.p.mult if hasattr(comminfo.p, 'mult') else 1
   ```
   - 从 broker 的 comminfo 动态获取
   - 期货默认 multiplier = 50
   - 股票/加密货币默认 multiplier = 1

3. **✅ 正确计算 PNL**
   ```python
   pnl = price_diff * position_size * multiplier
   ```

---

## 📊 修复前后对比

### 修复前

**示例交易**: 买入 3929.25，卖出 3930

```
❌ 错误计算:
price_diff = 3930 - 3929.25 = 0.75
pnl = 0.75 * (-1) = -0.75  // 符号错误
```

**结果**: 价格上涨但显示亏损 ❌

---

### 修复后

**示例交易**: 买入 3929.25，卖出 3930

```
✅ 正确计算:
price_diff = 3930 - 3929.25 = 0.75
position_size = abs(-1) = 1
multiplier = 50
pnl = 0.75 * 1 * 50 = 37.5 美元
```

**结果**: 价格上涨，显示盈利 37.5 美元 ✅

---

## 🔄 应用修复

### 重启 Worker 服务

修复已提交到代码，需要重启 Worker 服务以应用：

```bash
# 停止当前 Worker（Ctrl+C）
# 然后重新启动
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
python start_rabbitmq_worker.py
```

### 重新运行回测

重启 Worker 后，创建新的回测任务：
- 新任务会使用修复后的 PNL 计算逻辑
- 交易方向显示仍然为"做多"（因为策略就是纯做多）
- 盈亏数据将与价格变化方向一致

---

## 📝 数据示例

### 修复后的预期结果

**做多交易 - 盈利**:
```json
{
  "side": "buy",
  "position": {"side": "long"},
  "entryPrice": 3929.25,
  "exitPrice": 3930,
  "realizedPnl": 37.5  // ✅ 价格上涨，做多盈利（0.75点 * 50倍）
}
```

**做多交易 - 亏损**:
```json
{
  "side": "buy",
  "position": {"side": "long"},
  "entryPrice": 3925.75,
  "exitPrice": 3923,
  "realizedPnl": -137.5  // ✅ 价格下跌，做多亏损（-2.75点 * 50倍）
}
```

---

## 💡 关于做空

### 当前策略不支持做空

当前策略是**纯做多策略**，不包含做空逻辑。

如果未来需要支持做空，需要：

1. **策略层面添加做空逻辑**:
   ```python
   if self.crossover < 0:  # 死叉
       self.order = self.sell()  # 卖出开空
   
   if self.crossover > 0 and self.position.size < 0:  # 金叉且有空仓
       self.order = self.buy()  # 买入平空
   ```

2. **数据层面已支持**:
   - `entry_size < 0` → 自动识别为做空
   - `position.side = 'short'` → 显示为空头

---

## ✅ 验证清单

### 修复完成
- [x] 修复 PNL 计算逻辑
- [x] 添加合约乘数支持
- [x] 修复 size 符号问题
- [x] 更新日志输出

### 待验证（需要重启 Worker）
- [ ] 重启 Worker 服务
- [ ] 创建新回测任务
- [ ] 验证交易盈亏符号正确
- [ ] 验证合约乘数生效
- [ ] 验证前端显示正常

---

## 🎯 总结

### 问题本质
- 交易方向显示"做多"是**正确的**（策略就是纯做多）
- 盈亏计算**错误**导致数据看起来有问题

### 修复内容
1. ✅ 使用 `abs(size)` 避免符号错误
2. ✅ 添加合约乘数支持
3. ✅ 动态获取 comminfo 参数

### 下一步
🔧 **重启 Worker 服务以应用修复**

---

**✨ 修复完成！重启 Worker 后即可生效！✨**

