# 回测脚本开发指南

> **版本**: v1.0  
> **更新日期**: 2025-11-29  
> **适用平台**: Trading Analysis Platform

## 📖 目录

- [1. 快速开始](#1-快速开始)
- [2. 核心概念](#2-核心概念)
- [3. 基础策略结构](#3-基础策略结构)
- [4. API 参考](#4-api-参考)
- [5. 指标库](#5-指标库)
- [6. 因子收集](#6-因子收集)
- [7. 订单管理](#7-订单管理)
- [8. 最佳实践](#8-最佳实践)
- [9. 完整示例](#9-完整示例)
- [10. 常见问题](#10-常见问题)

---

## 1. 快速开始

### 1.1 最简单的策略

```python
import backtrader as bt
from typing import Dict, Any
from .base_strategy import BaseStrategy


class MyFirstStrategy(BaseStrategy):
    """我的第一个策略 - 双均线交叉"""
    
    params = (
        ('fast_period', 10),  # 快速均线周期
        ('slow_period', 30),  # 慢速均线周期
    )
    
    def __init__(self):
        super().__init__()
        # 创建技术指标
        self.sma_fast = bt.indicators.SMA(self.data.close, period=self.p.fast_period)
        self.sma_slow = bt.indicators.SMA(self.data.close, period=self.p.slow_period)
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
    
    def next(self):
        """每根K线调用一次"""
        # 如果没有持仓，检查买入信号
        if not self.position:
            if self.crossover > 0:  # 金叉
                self.buy()
        # 如果有持仓，检查卖出信号
        else:
            if self.crossover < 0:  # 死叉
                self.sell()
    
    def get_entry_factors(self) -> Dict[str, Any]:
        """记录入场时的因子"""
        return {
            'sma_fast': self.sma_fast[0],
            'sma_slow': self.sma_slow[0],
            'close': self.data.close[0],
            'volume': self.data.volume[0],
        }
    
    def get_exit_factors(self) -> Dict[str, Any]:
        """记录出场时的因子"""
        return {
            'sma_fast': self.sma_fast[0],
            'sma_slow': self.sma_slow[0],
            'close': self.data.close[0],
        }


# ⭐ 导出策略类（必需！）
Strategy = MyFirstStrategy
```

⚠️ **重要**: 必须在文件末尾添加 `Strategy = MyFirstStrategy` 来导出策略类，否则平台无法识别你的策略。

### 1.2 在平台中运行

1. 将策略代码复制到平台的策略编辑器中
2. 设置策略参数（可选）：
   ```json
   {
     "fast_period": 10,
     "slow_period": 30
   }
   ```
3. 选择数据集、设置初始资金等配置
4. 点击"开始回测"

---

## 2. 核心概念

### 2.1 策略基类 (`BaseStrategy`)

所有策略必须继承自 `BaseStrategy`，它提供了：

- ✅ **自动因子收集**: 无需手动管理因子记录
- ✅ **统一订单管理**: 简化买卖操作
- ✅ **日志记录**: 内置日志功能
- ✅ **状态管理**: 自动处理订单状态

### 2.2 策略生命周期

```
start() → prenext() → next() → ... → next() → stop()
  ↓          ↓          ↓                ↓        ↓
初始化      预热       交易逻辑           ...     结束
```

### 2.3 数据访问

| 语法 | 说明 | 示例 |
|------|------|------|
| `self.data.close[0]` | 当前收盘价 | `3856.5` |
| `self.data.close[-1]` | 上一根K线收盘价 | `3850.0` |
| `self.data.high[0]` | 当前最高价 | `3860.0` |
| `self.data.low[0]` | 当前最低价 | `3850.0` |
| `self.data.open[0]` | 当前开盘价 | `3852.0` |
| `self.data.volume[0]` | 当前成交量 | `12500` |
| `self.data.datetime.datetime(0)` | 当前K线时间 | `2022-12-16 14:45:00` |
| `len(self.data)` | 当前K线索引（从1开始） | `150` |

⚠️ **注意**: 
- `[0]` 表示当前K线
- `[-1]` 表示上一根K线
- `[-2]` 表示上上根K线
- 不要访问未来数据（例如 `[1]`），这会导致未定义行为

---

## 3. 基础策略结构

### 3.1 完整结构模板

```python
import backtrader as bt
from typing import Dict, Any
from .base_strategy import BaseStrategy


class MyStrategy(BaseStrategy):
    """
    策略说明（必需）
    
    入场条件：
    - 条件1
    - 条件2
    
    出场条件：
    - 条件1
    - 条件2
    """
    
    # ========== 1. 参数定义 ==========
    params = (
        ('period', 14),           # 指标周期
        ('threshold', 0.5),       # 阈值
        ('stop_loss_pct', 0.02),  # 止损百分比
        ('take_profit_pct', 0.05),# 止盈百分比
    )
    
    # ========== 2. 初始化 ==========
    def __init__(self):
        super().__init__()
        
        # 技术指标
        self.indicator1 = bt.indicators.SMA(self.data.close, period=self.p.period)
        self.indicator2 = bt.indicators.RSI(self.data.close, period=self.p.period)
        
        # 状态变量
        self.entry_price = None
        self.stop_price = None
        self.take_profit = None
    
    # ========== 3. 交易逻辑 ==========
    def next(self):
        """每根K线调用一次（必需实现）"""
        # 确保指标数据充足
        if len(self.data) < self.p.period:
            return
        
        # 防止重复下单
        if self.order:
            return
        
        # 开仓逻辑
        if not self.position:
            if self._check_entry_signal():
                self._enter_position()
        # 持仓管理
        else:
            if self._check_exit_signal():
                self._exit_position()
    
    # ========== 4. 辅助方法 ==========
    def _check_entry_signal(self) -> bool:
        """检查入场信号"""
        # 实现你的入场逻辑
        return False
    
    def _check_exit_signal(self) -> bool:
        """检查出场信号"""
        # 实现你的出场逻辑
        return False
    
    def _enter_position(self):
        """开仓"""
        price = self.data.close[0]
        size = self._calculate_position_size()
        self.order = self.buy(size=size)
        self.entry_price = price
        self.stop_price = price * (1 - self.p.stop_loss_pct)
        self.take_profit = price * (1 + self.p.take_profit_pct)
    
    def _exit_position(self):
        """平仓"""
        self.order = self.sell(size=self.position.size)
        self.entry_price = None
        self.stop_price = None
        self.take_profit = None
    
    def _calculate_position_size(self) -> int:
        """计算仓位大小"""
        cash = self.broker.getcash()
        price = self.data.close[0]
        size = int(cash / price)
        return max(size, 0)
    
    # ========== 5. 因子收集（必需实现）==========
    def get_entry_factors(self) -> Dict[str, Any]:
        """记录入场因子（必需实现）"""
        return {
            'indicator1': self.indicator1[0],
            'indicator2': self.indicator2[0],
            'close': self.data.close[0],
            'volume': self.data.volume[0],
            'entry_price': self.entry_price,
        }
    
    def get_exit_factors(self) -> Dict[str, Any]:
        """记录出场因子（必需实现）"""
        return {
            'indicator1': self.indicator1[0],
            'indicator2': self.indicator2[0],
            'close': self.data.close[0],
            'exit_price': self.data.close[0],
        }


# ========== 6. 导出策略（必需！）==========
Strategy = MyStrategy
```

### 3.2 代码规范检查清单

在提交策略之前，请确保：

- ✅ **导入语句**: 包含 `import backtrader as bt`
- ✅ **策略类**: 继承自 `BaseStrategy` 或 `bt.Strategy`
- ✅ **策略导出**: 文件末尾包含 `Strategy = YourStrategyClass`
- ✅ **必需方法**: 实现 `next()`, `get_entry_factors()`, `get_exit_factors()`
- ✅ **参数定义**: 使用 `params` 元组定义可配置参数
- ✅ **初始化**: 在 `__init__()` 中创建所有指标
- ✅ **文档字符串**: 添加策略说明和参数说明

### 3.3 常见错误

#### ❌ 错误1: 缺少策略导出

```python
class MyStrategy(BaseStrategy):
    # ... 策略代码 ...
    pass

# ❌ 缺少这一行
```

**错误信息**: `未找到策略导出。必须包含 Strategy = MyStrategy 或 strategy = MyStrategy`

**修复**:
```python
# ✅ 在文件末尾添加
Strategy = MyStrategy
```

#### ❌ 错误2: 未实现必需方法

```python
class MyStrategy(BaseStrategy):
    def __init__(self):
        super().__init__()
    
    def next(self):
        pass
    
    # ❌ 缺少 get_entry_factors() 和 get_exit_factors()
```

**修复**:
```python
def get_entry_factors(self) -> Dict[str, Any]:
    return {'close': self.data.close[0]}

def get_exit_factors(self) -> Dict[str, Any]:
    return {'close': self.data.close[0]}
```

#### ❌ 错误3: 在 `next()` 中创建指标

```python
def next(self):
    # ❌ 每次都创建新指标，效率极低
    sma = bt.indicators.SMA(self.data.close, period=20)
```

**修复**:
```python
def __init__(self):
    super().__init__()
    # ✅ 只创建一次
    self.sma = bt.indicators.SMA(self.data.close, period=20)

def next(self):
    # ✅ 直接使用
    if self.sma[0] > self.data.close[0]:
        self.buy()
```

---

## 4. API 参考

### 4.1 策略基类方法

#### 4.1.1 交易方法

```python
# 买入（做多）
order = self.buy(
    size=100,                    # 数量（可选，默认为默认仓位大小）
    price=None,                  # 价格（可选，None表示市价）
    exectype=bt.Order.Market,    # 订单类型
    valid=None                   # 有效期
)

# 卖出（平多/做空）
order = self.sell(
    size=100,
    price=None,
    exectype=bt.Order.Market,
    valid=None
)

# 平仓（关闭当前持仓）
self.close()

# 取消订单
self.cancel(order)
```

#### 4.1.2 订单类型 (`exectype`)

| 类型 | 说明 | 用法 |
|------|------|------|
| `bt.Order.Market` | 市价单 | `self.buy(exectype=bt.Order.Market)` |
| `bt.Order.Limit` | 限价单 | `self.buy(price=3850, exectype=bt.Order.Limit)` |
| `bt.Order.Stop` | 止损单 | `self.sell(price=3800, exectype=bt.Order.Stop)` |
| `bt.Order.StopLimit` | 止损限价单 | `self.sell(price=3800, plimit=3795, exectype=bt.Order.StopLimit)` |

#### 4.1.3 持仓信息

```python
# 检查是否有持仓
if self.position:
    # 持仓数量（正数=多仓，负数=空仓）
    size = self.position.size
    
    # 持仓成本价
    price = self.position.price
    
    # 持仓市值
    value = self.position.size * self.data.close[0]

# 检查是否有挂单
if self.order:
    # 有未完成的订单
    pass
```

#### 4.1.4 账户信息

```python
# 获取当前现金
cash = self.broker.getcash()

# 获取账户总值（现金 + 持仓市值）
value = self.broker.getvalue()

# 获取可用资金（考虑保证金）
available = self.broker.get_cash()
```

#### 4.1.5 日志记录

```python
# 记录日志
self.log("这是一条日志", level='INFO')    # INFO级别
self.log("警告信息", level='WARNING')      # WARNING级别
self.log("错误信息", level='ERROR')        # ERROR级别
self.log("调试信息", level='DEBUG')        # DEBUG级别
```

### 4.2 回调方法

#### 4.2.1 `notify_order(order)`

订单状态变化时调用：

```python
def notify_order(self, order: bt.Order):
    """订单通知回调"""
    if order.status in [order.Submitted, order.Accepted]:
        # 订单已提交/已接受
        return
    
    if order.status == order.Completed:
        if order.isbuy():
            self.log(f'买入成交: {order.executed.price:.2f}')
        else:
            self.log(f'卖出成交: {order.executed.price:.2f}')
    
    elif order.status in [order.Canceled, order.Margin, order.Rejected]:
        self.log(f'订单失败: {order.getstatusname()}')
    
    # 清理订单引用
    self.order = None
```

#### 4.2.2 `notify_trade(trade)`

交易关闭时调用：

```python
def notify_trade(self, trade: bt.Trade):
    """交易通知回调"""
    if not trade.isclosed:
        return
    
    # 交易盈亏
    pnl = trade.pnl           # 毛利润
    pnl_net = trade.pnlcomm   # 净利润（扣除手续费）
    
    # 持仓时间（K线数）
    bars = trade.barlen
    
    self.log(f'交易关闭: 盈亏={pnl_net:.2f}, 持仓={bars}根K线')
```

---

## 5. 指标库

### 5.1 趋势指标

#### SMA - 简单移动平均线

```python
sma = bt.indicators.SMA(
    self.data.close,  # 数据源
    period=20         # 周期
)

# 访问值
current_sma = sma[0]      # 当前值
previous_sma = sma[-1]    # 上一个值
```

#### EMA - 指数移动平均线

```python
ema = bt.indicators.EMA(self.data.close, period=12)
```

#### MACD - 平滑异同移动平均线

```python
macd = bt.indicators.MACD(
    self.data.close,
    period_me1=12,    # 快线周期
    period_me2=26,    # 慢线周期
    period_signal=9   # 信号线周期
)

# 访问值
macd_line = macd.macd[0]      # MACD线
signal_line = macd.signal[0]  # 信号线
histogram = macd.histo[0]     # 柱状图
```

### 5.2 震荡指标

#### RSI - 相对强弱指标

```python
rsi = bt.indicators.RSI(
    self.data.close,
    period=14,        # 周期
    upperband=70,     # 超买线
    lowerband=30      # 超卖线
)

# 使用示例
if rsi[0] < 30:
    # 超卖，可能买入
    pass
elif rsi[0] > 70:
    # 超买，可能卖出
    pass
```

#### Stochastic - 随机指标

```python
stoch = bt.indicators.Stochastic(
    self.data,
    period=14,
    period_dfast=3,
    period_dslow=3
)

k_line = stoch.percK[0]
d_line = stoch.percD[0]
```

### 5.3 波动率指标

#### ATR - 平均真实波幅

```python
atr = bt.indicators.ATR(
    self.data,
    period=14
)

# 用于止损
stop_distance = atr[0] * 2
stop_price = self.data.close[0] - stop_distance
```

#### Bollinger Bands - 布林带

```python
bbands = bt.indicators.BollingerBands(
    self.data.close,
    period=20,
    devfactor=2.0  # 标准差倍数
)

# 访问值
upper_band = bbands.top[0]    # 上轨
middle_band = bbands.mid[0]   # 中轨
lower_band = bbands.bot[0]    # 下轨

# 使用示例
if self.data.close[0] < lower_band:
    # 价格触及下轨，可能买入
    pass
```

### 5.4 成交量指标

#### Volume - 成交量

```python
volume = self.data.volume[0]

# 成交量移动平均
volume_sma = bt.indicators.SMA(self.data.volume, period=20)

if volume[0] > volume_sma[0] * 1.5:
    # 放量
    pass
```

### 5.5 其他实用指标

#### CrossOver - 交叉检测

```python
# 检测均线交叉
cross = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)

if cross > 0:
    # 金叉（快线上穿慢线）
    self.buy()
elif cross < 0:
    # 死叉（快线下穿慢线）
    self.sell()
```

#### Highest / Lowest - 最高/最低值

```python
# N周期内的最高价
highest = bt.indicators.Highest(self.data.high, period=20)

# N周期内的最低价
lowest = bt.indicators.Lowest(self.data.low, period=20)

# 用于通道突破策略
if self.data.close[0] > highest[-1]:
    # 突破新高
    self.buy()
```

### 5.6 自定义指标

```python
class MyCustomIndicator(bt.Indicator):
    """自定义指标示例"""
    
    lines = ('signal',)  # 定义输出线
    
    params = (
        ('period', 14),
    )
    
    def __init__(self):
        # 指标计算逻辑
        self.addminperiod(self.p.period)
    
    def next(self):
        # 每根K线计算一次
        self.lines.signal[0] = self.data.close[0] / self.data.close[-self.p.period]

# 使用自定义指标
my_indicator = MyCustomIndicator(self.data, period=20)
```

---

## 6. 因子收集

### 6.1 为什么需要因子？

因子是影响交易决策的关键信息，记录因子可以：
- 📊 **分析策略有效性**: 哪些因子对盈利影响最大？
- 🔍 **发现改进方向**: 哪些交易表现不佳？
- 🎯 **优化参数**: 基于历史数据调整参数
- 📈 **机器学习**: 训练预测模型

### 6.2 必需实现的方法

#### 6.2.1 `get_entry_factors()` - 入场因子

```python
def get_entry_factors(self) -> Dict[str, Any]:
    """
    记录入场时的市场状态和指标值
    
    返回:
        因子字典，键名自定义，值必须是基本类型（int/float/str/bool）
    """
    return {
        # 技术指标
        'sma_fast': self.sma_fast[0],
        'sma_slow': self.sma_slow[0],
        'rsi': self.rsi[0],
        'atr': self.atr[0],
        
        # 价格数据
        'open': self.data.open[0],
        'high': self.data.high[0],
        'low': self.data.low[0],
        'close': self.data.close[0],
        'volume': self.data.volume[0],
        
        # 策略状态
        'entry_price': self.entry_price,
        'stop_price': self.stop_price,
        'take_profit': self.take_profit,
        
        # 自定义因子
        'trend_direction': 'up',  # 或 'down'
        'signal_strength': 0.85,
    }
```

#### 6.2.2 `get_exit_factors()` - 出场因子

```python
def get_exit_factors(self) -> Dict[str, Any]:
    """
    记录出场时的市场状态
    
    返回:
        因子字典
    """
    return {
        # 当前市场状态
        'close': self.data.close[0],
        'rsi': self.rsi[0],
        'atr': self.atr[0],
        
        # 出场原因
        'exit_reason': 'take_profit',  # 或 'stop_loss', 'signal'
        
        # 持仓信息
        'holding_bars': len(self.data) - self.entry_bar,
    }
```

### 6.3 因子命名规范

| 类型 | 命名建议 | 示例 |
|------|----------|------|
| 技术指标 | 指标名小写 | `sma`, `rsi`, `macd`, `atr` |
| 价格数据 | OHLCV | `open`, `high`, `low`, `close`, `volume` |
| 策略参数 | 描述性命名 | `entry_price`, `stop_price`, `position_size` |
| 自定义因子 | 下划线分隔 | `trend_direction`, `signal_strength` |

---

## 7. 订单管理

### 7.1 基本下单

```python
def next(self):
    # 防止重复下单
    if self.order:
        return
    
    if not self.position:
        # 没有持仓，尝试开仓
        if self.crossover > 0:
            size = self._calculate_size()
            self.order = self.buy(size=size)
    else:
        # 有持仓，尝试平仓
        if self.crossover < 0:
            self.order = self.sell(size=self.position.size)
```

### 7.2 止损止盈

#### 方法1: 在 `next()` 中检查

```python
def next(self):
    if not self.position:
        return
    
    current_price = self.data.close[0]
    
    # 止损
    if current_price <= self.stop_price:
        self.log(f'触发止损: {current_price:.2f}')
        self.order = self.sell(size=self.position.size)
    
    # 止盈
    elif current_price >= self.take_profit:
        self.log(f'触发止盈: {current_price:.2f}')
        self.order = self.sell(size=self.position.size)
```

#### 方法2: 使用止损单

```python
def notify_order(self, order: bt.Order):
    if order.status == order.Completed:
        if order.isbuy():
            # 买入成交后，立即设置止损单
            stop_price = order.executed.price * 0.98  # 2% 止损
            self.order = self.sell(
                price=stop_price,
                exectype=bt.Order.Stop
            )
```

### 7.3 仓位管理

#### 固定金额

```python
def _calculate_size(self) -> int:
    """每次使用固定金额建仓"""
    fixed_amount = 10000  # 每次投入10000元
    price = self.data.close[0]
    size = int(fixed_amount / price)
    return max(size, 1)
```

#### 固定百分比

```python
def _calculate_size(self) -> int:
    """使用账户可用资金的固定百分比"""
    cash = self.broker.getcash()
    pct = 0.95  # 95%的资金
    price = self.data.close[0]
    size = int(cash * pct / price)
    return max(size, 1)
```

#### 凯利公式（Kelly Criterion）

```python
def _calculate_size(self) -> int:
    """根据胜率和盈亏比动态调整仓位"""
    win_rate = 0.55  # 历史胜率55%
    win_loss_ratio = 1.5  # 平均盈亏比1.5:1
    
    # Kelly百分比 = (胜率 * 盈亏比 - 败率) / 盈亏比
    kelly = (win_rate * win_loss_ratio - (1 - win_rate)) / win_loss_ratio
    kelly = max(0.01, min(kelly, 0.25))  # 限制在1%-25%
    
    cash = self.broker.getcash()
    price = self.data.close[0]
    size = int(cash * kelly / price)
    return max(size, 1)
```

---

## 8. 最佳实践

### 8.1 性能优化

#### ✅ 使用指标而非循环计算

```python
# ❌ 不推荐 - 慢
def next(self):
    sum_close = sum([self.data.close[-i] for i in range(20)])
    sma = sum_close / 20

# ✅ 推荐 - 快
def __init__(self):
    self.sma = bt.indicators.SMA(self.data.close, period=20)
```

#### ✅ 避免在 `next()` 中创建对象

```python
# ❌ 不推荐
def next(self):
    rsi = bt.indicators.RSI(self.data.close, period=14)  # 每次都创建

# ✅ 推荐
def __init__(self):
    self.rsi = bt.indicators.RSI(self.data.close, period=14)  # 只创建一次
```

### 8.2 代码组织

```python
class WellOrganizedStrategy(BaseStrategy):
    """组织良好的策略结构"""
    
    # 1. 参数定义 - 集中在顶部
    params = (
        ('period', 14),
    )
    
    # 2. 初始化 - 创建所有指标
    def __init__(self):
        super().__init__()
        self._init_indicators()
        self._init_state()
    
    def _init_indicators(self):
        """初始化所有技术指标"""
        self.sma = bt.indicators.SMA(self.data.close, period=self.p.period)
        self.rsi = bt.indicators.RSI(self.data.close, period=self.p.period)
    
    def _init_state(self):
        """初始化状态变量"""
        self.entry_price = None
        self.entry_bar = None
    
    # 3. 主逻辑 - next()
    def next(self):
        if not self._is_data_ready():
            return
        
        if not self.position:
            self._handle_no_position()
        else:
            self._handle_position()
    
    # 4. 辅助方法 - 按功能分组
    def _is_data_ready(self) -> bool:
        """检查数据是否充足"""
        return len(self.data) >= self.p.period
    
    def _handle_no_position(self):
        """处理无持仓状态"""
        pass
    
    def _handle_position(self):
        """处理持仓状态"""
        pass
    
    # 5. 因子收集 - 放在最后
    def get_entry_factors(self) -> Dict[str, Any]:
        return {}
    
    def get_exit_factors(self) -> Dict[str, Any]:
        return {}
```

### 8.3 错误处理

```python
def next(self):
    try:
        # 确保数据充足
        if len(self.data) < self.p.period:
            return
        
        # 检查指标是否有效
        if self.rsi[0] is None or math.isnan(self.rsi[0]):
            self.log("RSI 值无效", level='WARNING')
            return
        
        # 防止除零错误
        atr_value = self.atr[0]
        if atr_value <= 0:
            self.log("ATR 值为0，跳过", level='WARNING')
            return
        
        # 交易逻辑...
        
    except Exception as e:
        self.log(f"策略执行错误: {e}", level='ERROR')
```

### 8.4 参数验证

```python
def __init__(self):
    super().__init__()
    
    # 验证参数合法性
    if self.p.period < 1:
        raise ValueError("period 必须大于0")
    
    if not (0 < self.p.stop_loss_pct < 1):
        raise ValueError("stop_loss_pct 必须在0-1之间")
    
    if self.p.take_profit_pct <= self.p.stop_loss_pct:
        raise ValueError("take_profit_pct 必须大于 stop_loss_pct")
```

---

## 9. 完整示例

### 9.1 RSI 均值回归策略

```python
import backtrader as bt
from typing import Dict, Any
from .base_strategy import BaseStrategy


class RSIMeanReversionStrategy(BaseStrategy):
    """
    RSI均值回归策略
    
    策略逻辑:
    - 入场: RSI < 30 (超卖) 且 价格 < 下轨
    - 出场: RSI > 50 或 价格 > 中轨
    """
    
    params = (
        ('rsi_period', 14),
        ('rsi_oversold', 30),
        ('rsi_exit', 50),
        ('bb_period', 20),
        ('bb_devfactor', 2.0),
        ('stop_loss_pct', 0.03),
        ('position_pct', 0.95),
    )
    
    def __init__(self):
        super().__init__()
        
        # 技术指标
        self.rsi = bt.indicators.RSI(
            self.data.close,
            period=self.p.rsi_period
        )
        
        self.bbands = bt.indicators.BollingerBands(
            self.data.close,
            period=self.p.bb_period,
            devfactor=self.p.bb_devfactor
        )
        
        # 状态变量
        self.entry_price = None
        self.stop_price = None
        self.entry_bar = None
    
    def next(self):
        # 确保数据充足
        min_period = max(self.p.rsi_period, self.p.bb_period)
        if len(self.data) < min_period:
            return
        
        # 防止重复下单
        if self.order:
            return
        
        # 开仓逻辑
        if not self.position:
            if self._check_entry_signal():
                self._enter_long()
        # 持仓管理
        else:
            if self._check_exit_signal():
                self._exit_long()
    
    def _check_entry_signal(self) -> bool:
        """检查入场信号"""
        # RSI 超卖
        if self.rsi[0] > self.p.rsi_oversold:
            return False
        
        # 价格低于布林带下轨
        if self.data.close[0] > self.bbands.bot[0]:
            return False
        
        return True
    
    def _check_exit_signal(self) -> bool:
        """检查出场信号"""
        current_price = self.data.close[0]
        
        # 止损
        if current_price <= self.stop_price:
            self.log(f'触发止损: {current_price:.2f}')
            return True
        
        # RSI 回归
        if self.rsi[0] >= self.p.rsi_exit:
            self.log(f'RSI回归: {self.rsi[0]:.2f}')
            return True
        
        # 价格回归中轨
        if current_price >= self.bbands.mid[0]:
            self.log(f'价格回归中轨: {current_price:.2f}')
            return True
        
        return False
    
    def _enter_long(self):
        """开多仓"""
        size = self._calculate_position_size()
        if size <= 0:
            return
        
        price = self.data.close[0]
        self.entry_price = price
        self.stop_price = price * (1 - self.p.stop_loss_pct)
        self.entry_bar = len(self.data)
        
        self.order = self.buy(size=size)
        
        self.log(
            f'买入信号: price={price:.2f}, '
            f'RSI={self.rsi[0]:.2f}, '
            f'BB_lower={self.bbands.bot[0]:.2f}'
        )
    
    def _exit_long(self):
        """平多仓"""
        if not self.position:
            return
        
        self.order = self.sell(size=self.position.size)
        
        self.log(
            f'卖出信号: price={self.data.close[0]:.2f}, '
            f'RSI={self.rsi[0]:.2f}'
        )
    
    def _calculate_position_size(self) -> int:
        """计算仓位"""
        cash = self.broker.getcash()
        price = self.data.close[0]
        size = int(cash * self.p.position_pct / price)
        return max(size, 1)
    
    def get_entry_factors(self) -> Dict[str, Any]:
        """入场因子"""
        return {
            'rsi': self.rsi[0],
            'bb_upper': self.bbands.top[0],
            'bb_mid': self.bbands.mid[0],
            'bb_lower': self.bbands.bot[0],
            'close': self.data.close[0],
            'volume': self.data.volume[0],
            'entry_price': self.entry_price,
            'stop_price': self.stop_price,
        }
    
    def get_exit_factors(self) -> Dict[str, Any]:
        """出场因子"""
        holding_bars = len(self.data) - self.entry_bar if self.entry_bar else 0
        
        return {
            'rsi': self.rsi[0],
            'close': self.data.close[0],
            'holding_bars': holding_bars,
            'exit_price': self.data.close[0],
        }
```

### 9.2 三线趋势策略（完整版）

参见平台内置的 `ThreeLineTrendAtrStrategy` 示例。

---

## 10. 常见问题

### Q1: 为什么我的策略没有交易？

**可能原因**:
1. 数据不足: 检查 `len(self.data) < period`
2. 信号条件太严格: 放宽入场条件测试
3. 资金不足: 检查 `self.broker.getcash()`
4. 重复下单保护: 检查 `if self.order: return`

**调试方法**:
```python
def next(self):
    # 添加调试日志
    self.log(f'当前K线: {len(self.data)}, RSI={self.rsi[0]:.2f}, 持仓={self.position.size}')
    
    if not self.position:
        signal = self._check_entry_signal()
        self.log(f'入场信号: {signal}')
```

### Q2: 如何访问历史K线？

```python
# 当前K线
current_close = self.data.close[0]

# 前5根K线的收盘价
closes = [self.data.close[-i] for i in range(5)]

# 检查是否有足够的历史数据
if len(self.data) < 5:
    return  # 数据不足
```

### Q3: 如何实现做空？

```python
# 开空仓
self.sell(size=100)

# 平空仓
self.buy(size=100)

# 检查持仓方向
if self.position.size > 0:
    # 多仓
    pass
elif self.position.size < 0:
    # 空仓
    pass
```

### Q4: 如何设置不同资产类型的佣金？

在平台UI中配置，不需要在策略代码中设置：

- **股票**: 百分比佣金 + 最低佣金 + 印花税
- **期货**: 固定佣金 + 合约乘数 + 保证金比例
- **加密货币**: Maker/Taker 费率

### Q5: 如何优化策略性能？

1. **减少循环**: 使用内置指标而非手动计算
2. **提前计算**: 在 `__init__()` 中创建所有指标
3. **避免重复计算**: 将计算结果缓存到变量
4. **减少日志**: 只在关键位置记录日志

```python
# ❌ 慢
def next(self):
    if sum([self.data.close[-i] for i in range(20)]) / 20 > self.data.close[0]:
        self.buy()

# ✅ 快
def __init__(self):
    self.sma = bt.indicators.SMA(self.data.close, period=20)

def next(self):
    if self.sma[0] > self.data.close[0]:
        self.buy()
```

### Q6: 如何处理不同周期的数据？

平台目前支持单一周期回测。如需多周期分析，可以在策略中手动聚合：

```python
def __init__(self):
    # 使用更长周期的指标
    self.sma_daily = bt.indicators.SMA(self.data.close, period=20)  # 假设是小时线，相当于日线
    self.sma_weekly = bt.indicators.SMA(self.data.close, period=120)  # 5天*24小时
```

### Q7: 策略报错怎么办？

查看错误日志，常见错误：

| 错误信息 | 原因 | 解决方法 |
|----------|------|----------|
| `IndexError: list index out of range` | 访问了不存在的历史数据 | 增加 `len(self.data)` 检查 |
| `AttributeError: 'NoneType'` | 指标未初始化 | 检查 `__init__()` |
| `must implement get_entry_factors()` | 未实现必需方法 | 添加 `get_entry_factors()` 方法 |
| `Division by zero` | 除零错误 | 添加分母非零检查 |

---

## 📚 扩展阅读

- [Backtrader 官方文档](https://www.backtrader.com/docu/)
- [技术分析指标百科](https://www.investopedia.com/technical-analysis-4689657)
- [量化交易策略大全](https://www.quantstart.com/articles/)

---

## 🔄 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0 | 2025-11-29 | 初始版本 |

---

**需要帮助？** 请联系平台技术支持或查看平台内置的示例策略。

**Happy Trading! 📈**

