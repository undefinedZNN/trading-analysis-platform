# 高级测试策略指南

**创建日期**: 2025-11-22  
**状态**: ✅ 已完成

---

## 📚 概览

为全面测试回测引擎的各项功能，我们新增了5个高级测试策略，涵盖不同的测试场景：

| 策略 | 用途 | 测试重点 |
|------|------|----------|
| ReversalPatternStrategy | 反转形态识别 | 形态识别、R倍数止损止盈、移动止损 |
| HighFrequencyStrategy | 压力测试 | 高频交易、按时间平仓、引擎性能 |
| PendingOrderStrategy | 挂单逻辑 | 限价挂单、价格触达、挂单生命周期 |
| PyramidStrategy | 多仓位管理 | 多次加仓、部分平仓、整体止损 |
| RandomStrategy | Monte Carlo测试 | 随机开平仓、引擎稳定性 |

---

## 1. 反转形态策略 (ReversalPatternStrategy)

### 策略文件
`backtest-worker/src/backtrader_integration/strategy/reversal_pattern_strategy.py`

### 策略目的
利用典型K线反转形态（Pin Bar、Engulfing）+ 简单趋势过滤，在趋势末端捕捉反转机会。

### 测试维度
- ✅ 形态识别能力
- ✅ 趋势判断逻辑
- ✅ 固定R倍数止损/止盈
- ✅ 移动止损（打平、追踪）

### 配置参数

```python
{
    'ma_len': 50,                    # 趋势判断均线长度
    'pin_long_wick_ratio': 0.66,     # Pin Bar主影线占比阈值
    'max_body_ratio': 0.3,           # Pin Bar实体最大占比
    'engulfing_ratio': 1.2,          # 吞没形态实体倍数
    'rr_tp': 2.0,                    # 止盈R倍数
    'rr_be': 1.0,                    # 打平R倍数
    'rr_trail': 1.5,                 # 追踪止损启动R倍数
    'buffer_pips': 0.0,              # 止损缓冲点数
}
```

### 形态定义

#### Pin Bar（看涨）
- 实体小（≤ 30%）
- 下影线长（≥ 66%）
- 上影线短（< 20%）
- 趋势向上（C > MA50）

#### Pin Bar（看跌）
- 实体小（≤ 30%）
- 上影线长（≥ 66%）
- 下影线短（< 20%）
- 趋势向下（C < MA50）

#### Engulfing（看涨吞没）
- 前一根阴线，当前阳线
- 当前实体完全包住前一根
- 当前实体 ≥ 1.2倍前一根
- 趋势向上

#### Engulfing（看跌吞没）
- 前一根阳线，当前阴线
- 当前实体完全包住前一根
- 当前实体 ≥ 1.2倍前一根
- 趋势向下

### 止损止盈逻辑

**做多**:
- 入场: 形态确认后的下一根K线开盘
- 止损: 形态K线低点 - buffer
- 1R = entry_price - stop_loss
- 止盈: entry_price + rr_tp * 1R
- 打平: 浮盈达1R时，止损移至入场价
- 追踪: 浮盈达1.5R后，止损跟随最高价下移1R

**做空**: 逻辑镜像

### 注册名称
```python
StrategyFactory.register('reversal_pattern', ReversalPatternStrategy)
```

---

## 2. 最高频策略 (HighFrequencyStrategy)

### 策略文件
`backtest-worker/src/backtrader_integration/strategy/high_frequency_strategy.py`

### 策略目的
几乎每根K线都交易，用于压测引擎性能和稳定性。

### 测试维度
- ✅ 极高频率交易处理
- ✅ 按时间平仓逻辑
- ✅ 多空切换性能
- ✅ 引擎吞吐量

### 配置参数

```python
{
    'mode': 'always_long',      # 交易模式
    'hold_bars': 1,              # 持仓K线数
    'use_sl_tp': False,          # 是否使用止损止盈
    'fixed_sl_pips': 10.0,       # 固定止损点数
    'fixed_tp_pips': 10.0,       # 固定止盈点数
}
```

### 交易模式

#### always_long（总是做多）
- 每根K线空仓时开多
- 持仓N根K线后平仓
- 适合测试单边高频

#### always_short（总是做空）
- 每根K线空仓时开空
- 持仓N根K线后平仓
- 适合测试空头逻辑

#### alt_long_short（多空交替）
- 空仓时根据`next_side`开仓
- 平仓后切换方向
- 适合测试多空切换

### 平仓规则
1. 时间平仓: 持仓达到`hold_bars`根K线
2. 止损止盈: 如果`use_sl_tp=True`，价格触及SL/TP

### 注册名称
```python
StrategyFactory.register('high_frequency', HighFrequencyStrategy)
```

---

## 3. 挂单策略 (PendingOrderStrategy)

### 策略文件
`backtest-worker/src/backtrader_integration/strategy/pending_order_strategy.py`

### 策略目的
通过限价挂单测试价格触达逻辑、挂单生命周期管理。

### 测试维度
- ✅ 限价挂单创建
- ✅ 挂单触发检测
- ✅ 挂单过期取消
- ✅ 突破回踩逻辑

### 配置参数

```python
{
    'breakout_lookback': 20,     # 突破检测回溯期
    'pullback_ratio': 0.5,       # 回踩比例
    'order_expire_bars': 5,      # 挂单过期K线数
    'rr_tp': 2.0,                # 止盈R倍数
    'rr_sl': 1.0,                # 止损R倍数
    'fixed_sl_pips': 20.0,       # 固定止损点数
}
```

### 交易流程

#### 1. 突破检测
- 计算最近N根K线的最高/最低价
- **向上突破**: 收盘价 > recent_high
- **向下突破**: 收盘价 < recent_low

#### 2. 挂单设置

**向上突破（买入限价单）**:
```
pullback_price = breakout_price - pullback_ratio * (breakout_price - swing_low)
```
- 在`pullback_price`挂买入限价单
- 等待价格回踩至该价位

**向下突破（卖出限价单）**:
```
pullback_price = breakout_price + pullback_ratio * (swing_high - breakout_price)
```
- 在`pullback_price`挂卖出限价单
- 等待价格反弹至该价位

#### 3. 挂单触发
- **买入限价单**: 当前K线最低价 ≤ pullback_price
- **卖出限价单**: 当前K线最高价 ≥ pullback_price

#### 4. 挂单过期
- 挂单创建后超过`order_expire_bars`根K线未触发
- 自动取消挂单

#### 5. 止损止盈
- **做多**: 
  - 止损 = min(swing_low, entry - fixed_sl_pips)
  - 止盈 = entry + rr_tp * 1R
- **做空**: 
  - 止损 = max(swing_high, entry + fixed_sl_pips)
  - 止盈 = entry - rr_tp * 1R

### 注册名称
```python
StrategyFactory.register('pending_order', PendingOrderStrategy)
```

---

## 4. 金字塔加仓策略 (PyramidStrategy)

### 策略文件
`backtest-worker/src/backtrader_integration/strategy/pyramid_strategy.py`

### 策略目的
测试同方向多次加仓、头寸平均价、总体止损管理、部分平仓。

### 测试维度
- ✅ 多次加仓逻辑
- ✅ 加权平均价计算
- ✅ 全局止损管理
- ✅ 部分止盈功能

### 配置参数

```python
{
    'trend_ma_len': 50,          # 趋势判断均线
    'breakout_lookback': 20,     # 突破检测回溯期
    'add_step_r': 1.0,           # 每移动多少R加一次仓
    'max_add_times': 3,          # 最多加仓次数
    'initial_rr_sl': 1.0,        # 初始止损R倍数
    'global_rr_tp': 3.0,         # 整体止盈R倍数
    'partial_tp_ratio': 0.5,     # 部分止盈比例
    'partial_tp_r': 2.0,         # 达到多少R时部分止盈
}
```

### 交易流程

#### 1. 初次入场
**做多条件**:
- 趋势向上（C > MA50）
- 突破最近N根K线高点

**做空条件**:
- 趋势向下（C < MA50）
- 突破最近N根K线低点

**仓位记录**:
```python
positions_info = [{'size': 1, 'entry': entry_price_1}]
```

#### 2. 加仓逻辑

**做多加仓**:
- 当前价格 ≥ entry_price_1 + (n+1) * add_step_r * 1R
- 加仓次数 < max_add_times
- 开多 unit_size

**做空加仓**:
- 当前价格 ≤ entry_price_1 - (n+1) * add_step_r * 1R
- 加仓次数 < max_add_times
- 开空 unit_size

#### 3. 部分止盈
- 浮盈达到 `partial_tp_r * 1R` 时触发
- 平掉 `partial_tp_ratio` 比例的仓位（默认50%）
- 保留剩余仓位继续持有

#### 4. 全局止损/止盈
- **止损**: 所有仓位统一以 `stop_loss_global` 为准
- **止盈**: 达到 `entry_price_1 + global_rr_tp * 1R`
- 触发时平掉所有剩余仓位

### 注册名称
```python
StrategyFactory.register('pyramid', PyramidStrategy)
```

---

## 5. 随机策略 (RandomStrategy)

### 策略文件
`backtest-worker/src/backtrader_integration/strategy/random_strategy.py`

### 策略目的
Monte Carlo风格压力测试，检查引擎在无逻辑约束、频繁开平仓下的稳定性。

### 测试维度
- ✅ 随机开仓/平仓
- ✅ 引擎鲁棒性
- ✅ 随机止损止盈
- ✅ 可重现性测试

### 配置参数

```python
{
    'entry_prob': 0.1,           # 空仓时开仓概率 (10%)
    'long_prob': 0.5,            # 开仓时做多概率 (50%)
    'close_prob': 0.1,           # 有仓时平仓概率 (10%)
    'max_hold_bars': 50,         # 单笔交易最多持仓K线数
    'use_sl_tp': True,           # 是否使用止损止盈
    'sl_min': 10.0,              # 最小止损点数
    'sl_max': 50.0,              # 最大止损点数
    'tp_min': 10.0,              # 最小止盈点数
    'tp_max': 50.0,              # 最大止盈点数
    'random_seed': None,         # 随机种子（可选）
}
```

### 交易流程

#### 1. 空仓时
每根K线:
```python
u = random()
if u < entry_prob:
    v = random()
    if v < long_prob:
        开多仓
    else:
        开空仓
```

#### 2. 有仓时
每根K线检查3个条件（满足任一即平仓）:

**随机平仓**:
```python
u = random()
if u < close_prob:
    平仓
```

**时间平仓**:
```python
if current_bar - entry_bar >= max_hold_bars:
    平仓
```

**止损止盈**:
- 开仓时随机生成SL/TP点数
- 价格触及则平仓

#### 3. 随机止损止盈生成
```python
sl_pips = random.uniform(sl_min, sl_max)
tp_pips = random.uniform(tp_min, tp_max)
```

#### 4. 可重现性
设置`random_seed`可确保测试可重现:
```python
{'random_seed': 42}  # 每次运行结果一致
```

### 注册名称
```python
StrategyFactory.register('random', RandomStrategy)
```

---

## 📊 策略对比表

| 特性 | 反转形态 | 高频 | 挂单 | 金字塔 | 随机 |
|------|---------|------|------|--------|------|
| **交易频率** | 低 | 极高 | 低 | 低 | 中 |
| **复杂度** | 中 | 低 | 中 | 高 | 低 |
| **止损逻辑** | R倍数+追踪 | 固定/时间 | R倍数 | 全局 | 随机 |
| **加仓** | 否 | 否 | 否 | 是 | 否 |
| **部分平仓** | 否 | 否 | 否 | 是 | 否 |
| **挂单** | 否 | 否 | 是 | 否 | 否 |
| **测试重点** | 形态识别 | 性能 | 挂单 | 多仓 | 稳定性 |

---

## 🧪 测试用例

### 1. 功能测试
```python
# test_advanced_strategies.py

# 测试1: 反转形态策略
test_01_reversal_pattern_strategy()

# 测试2: 高频策略 - 总是做多
test_02_high_frequency_strategy_always_long()

# 测试3: 高频策略 - 多空交替
test_03_high_frequency_strategy_alternating()

# 测试4: 挂单策略
test_04_pending_order_strategy()

# 测试5: 金字塔加仓策略
test_05_pyramid_strategy()

# 测试6: 随机策略
test_06_random_strategy()
```

### 2. 注册验证
```python
# 验证所有策略已正确注册
test_07_strategy_factory_registration()
```

### 3. 性能对比
```python
# 对比所有策略的收益率
test_08_all_strategies_comparison()
```

---

## 📝 使用示例

### 示例1: 使用StrategyFactory创建策略

```python
from backtrader_integration.strategy import StrategyFactory

# 创建反转形态策略
strategy = StrategyFactory.create(
    'reversal_pattern',
    ma_len=50,
    rr_tp=2.0,
    rr_be=1.0
)

# 获取策略信息
info = StrategyFactory.get_strategy_info('reversal_pattern')
print(info['description'])
print(info['params'])
```

### 示例2: 直接实例化策略

```python
from backtrader_integration.strategy import PyramidStrategy
import backtrader as bt

cerebro = bt.Cerebro()
cerebro.addstrategy(
    PyramidStrategy,
    trend_ma_len=50,
    max_add_times=3,
    global_rr_tp=3.0
)
```

### 示例3: 高频压测

```python
# 最大频率压测
cerebro.addstrategy(
    HighFrequencyStrategy,
    mode='always_long',
    hold_bars=1,
    use_sl_tp=False
)
```

### 示例4: Monte Carlo测试

```python
# 可重现的随机测试
for seed in range(100):
    cerebro.addstrategy(
        RandomStrategy,
        random_seed=seed,
        entry_prob=0.05,
        use_sl_tp=True
    )
    results = cerebro.run()
    # 收集统计数据
```

---

## 🎯 测试场景覆盖

### 已覆盖场景

✅ **形态识别**: Pin Bar, Engulfing  
✅ **趋势过滤**: 均线判断  
✅ **止损止盈**: 固定、R倍数、追踪  
✅ **打平逻辑**: 浮盈达标移动止损  
✅ **高频交易**: 每根K线交易  
✅ **时间管理**: 按持仓时间平仓  
✅ **挂单系统**: 限价单创建、触发、过期  
✅ **多仓位**: 多次加仓、平均价  
✅ **部分平仓**: 按比例减仓  
✅ **全局止损**: 统一管理多个仓位  
✅ **随机逻辑**: Monte Carlo压测  
✅ **可重现性**: 固定随机种子  

### 待扩展场景

⏳ 市价单滑点模拟  
⏳ 委托单队列管理  
⏳ 仓位风险控制  
⏳ 关联品种对冲  
⏳ 期权策略测试  

---

## 📈 性能基准

### 推荐测试配置

| 策略 | 数据量 | 预期交易次数 | 耗时估计 |
|------|--------|--------------|----------|
| 反转形态 | 90天1分钟 | ~10-50次 | < 1秒 |
| 高频 (hold_bars=1) | 90天1分钟 | ~130,000次 | 2-5秒 |
| 挂单 | 90天1分钟 | ~5-20次 | < 1秒 |
| 金字塔 | 90天1分钟 | ~3-15次 | < 1秒 |
| 随机 (entry_prob=0.05) | 90天1分钟 | ~3,000-7,000次 | 1-3秒 |

---

## 🔍 调试建议

### 1. 查看交易日志
```python
strategy.log_enabled = True  # 启用详细日志
```

### 2. 检查交易记录
```python
for trade in strategy.factor_collector.trades:
    print(f'{trade.entry_datetime} -> {trade.exit_datetime}: {trade.pnl}')
```

### 3. 验证参数
```python
info = StrategyFactory.get_strategy_info('strategy_name')
print(info['params'])  # 查看所有可用参数
```

---

## ✅ 总结

- ✅ **5个新策略**: 全面覆盖不同测试场景
- ✅ **8个策略总计**: 包含之前的MA、RSI、三线动量
- ✅ **策略工厂**: 统一注册和管理
- ✅ **完整文档**: 参数说明、使用示例
- ✅ **测试用例**: 功能测试、注册验证、性能对比

**下一步**:
1. 运行完整测试套件
2. 收集性能基准数据
3. 根据测试结果优化引擎
4. 扩展更多测试场景

---

**文档维护**: 如需更新策略或添加新场景，请同步更新本文档。

