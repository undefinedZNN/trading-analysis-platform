# 因子系统设计方案

**版本**: v1.0  
**创建时间**: 2025-11-20  
**状态**: 需求调研阶段

---

## 📋 核心问题

1. **如何存储交易因子，在什么时机获取交易因子信息？**
2. **自定义因子和内置因子如何渲染表单筛选？**
3. **因子数据的固化时机（一笔交易持续多个K线，因子会变化）？**
4. **自定义因子在脚本中如何设置？**

---

## 🎯 因子的定义

### 什么是因子？

**因子（Factor）** = 影响交易决策的指标数据

例如：
- 技术指标：RSI、MACD、布林带
- 市场数据：成交量、波动率、涨跌幅
- 自定义指标：止损价、目标价、持仓时长

### 因子的作用

1. **回测分析**：分析因子与交易结果的关系
2. **因子筛选**：根据因子值筛选交易记录
3. **策略优化**：找出最优的因子组合

---

## 📊 因子分类

### 1. 内置因子（系统提供）

**定义**：由系统自动计算和记录的因子

**类型**：

#### A. 交易基础因子
```typescript
{
  "trade_id": "trade-001",
  "entry_time": "2023-01-01 10:00:00",      // 入场时间
  "exit_time": "2023-01-05 15:30:00",       // 出场时间
  "entry_price": 100.5,                     // 入场价格
  "exit_price": 105.2,                      // 出场价格
  "quantity": 100,                          // 数量
  "side": "long",                           // 方向（long/short）
  "duration": 4320,                         // 持仓时长（分钟）
  "pnl": 470,                               // 盈亏（绝对值）
  "pnl_percent": 0.0468,                    // 盈亏率
  "commission": 0.5,                        // 手续费
  "return": 469.5                           // 净收益
}
```

#### B. 市场环境因子（入场时）
```typescript
{
  "market_volume": 1000000,                 // 成交量
  "market_volatility": 0.025,               // 波动率
  "atr": 2.5,                               // ATR（平均真实波幅）
  "open": 100.0,                            // 开盘价
  "high": 101.5,                            // 最高价
  "low": 99.5,                              // 最低价
  "close": 100.5                            // 收盘价
}
```

**特点**：
- ✅ 无需配置，自动记录
- ✅ 标准化，所有策略统一
- ✅ 系统保证数据准确性

---

### 2. 自定义因子（用户定义）

**定义**：用户在策略代码中自己计算和记录的因子

**示例**：

```python
class MACrossStrategy(bt.Strategy):
    def __init__(self):
        self.sma_fast = bt.indicators.SMA(period=10)
        self.sma_slow = bt.indicators.SMA(period=20)
        self.rsi = bt.indicators.RSI(period=14)
        
        # 因子收集器（系统提供）
        self.factor_collector = FactorCollector()
    
    def next(self):
        # 计算自定义因子
        ma_distance = (self.sma_fast[0] - self.sma_slow[0]) / self.sma_slow[0]
        
        if not self.position:
            if self.sma_fast[0] > self.sma_slow[0]:
                # 记录入场时的自定义因子
                self.factor_collector.record({
                    'sma_fast': self.sma_fast[0],           # 快速均线值
                    'sma_slow': self.sma_slow[0],           # 慢速均线值
                    'ma_distance': ma_distance,             # 均线距离
                    'rsi': self.rsi[0],                     # RSI值
                    'signal_strength': abs(ma_distance),    # 信号强度
                })
                
                self.buy()
```

**特点**：
- ✅ 灵活，用户自定义
- ✅ 可以记录任何指标
- ⚠️ 需要用户在代码中手动记录

---

## 💾 因子存储方案

### 数据库设计

#### 1. script_versions 表（策略配置）

```sql
-- 已有字段
CREATE TABLE script_versions (
  script_version_id UUID PRIMARY KEY,
  strategy_id UUID,
  code TEXT,
  parameter_schema JSONB,
  factor_schema JSONB,  -- ⭐ 因子配置
  ...
);
```

**factor_schema 字段结构（扩展版）**：

```typescript
// 过滤器类型
type FilterType = 'range_slider' | 'multi_select' | 'input' | 'switch';

// 过滤器配置
interface FilterConfig {
  type: FilterType;
  
  // 范围滑块配置
  min?: number;
  max?: number;
  step?: number;
  defaultRange?: [number, number];
  
  // 多选框配置
  options?: Array<{
    label: string;
    value: string | number;
  }>;
  
  // 预设值配置
  presets?: Array<{
    label: string;
    range: [number, number];
  }>;
}

// 因子配置类型
interface FactorDefinition {
  // 基本信息
  name: string;                           // 因子名称
  type: 'built_in' | 'custom';            // 因子类型
  stage: 'entry' | 'exit' | 'dynamic';    // 记录阶段 ⭐
  dataType: 'int' | 'float' | 'str' | 'bool';
  description?: string;
  category?: string;                      // 分类（技术指标、市场环境等）
  
  // 显示配置
  unit?: string;                          // 单位（如 %、元）
  displayFormat?: string;                 // 显示格式（如保留几位小数）
  
  // 过滤器配置 ⭐
  filterConfig?: FilterConfig;
}

type FactorSchema = FactorDefinition[];
```

**示例（完整配置）**：

```json
// script_versions.factor_schema
[
  {
    "name": "entry_sma_fast",
    "type": "custom",
    "stage": "entry",
    "dataType": "float",
    "description": "入场时的快速均线值",
    "category": "技术指标",
    "unit": "",
    "displayFormat": "0.00",
    "filterConfig": {
      "type": "range_slider",
      "min": 0,
      "max": 200,
      "step": 0.1,
      "defaultRange": [90, 110]
    }
  },
  {
    "name": "entry_rsi",
    "type": "custom",
    "stage": "entry",
    "dataType": "float",
    "description": "入场时的RSI指标",
    "category": "技术指标",
    "displayFormat": "0.00",
    "filterConfig": {
      "type": "range_slider",
      "min": 0,
      "max": 100,
      "step": 1,
      "defaultRange": [30, 70],
      "presets": [
        {
          "label": "超卖区",
          "range": [0, 30]
        },
        {
          "label": "超买区",
          "range": [70, 100]
        }
      ]
    }
  },
  {
    "name": "max_profit_during_hold",
    "type": "custom",
    "stage": "dynamic",
    "dataType": "float",
    "description": "持仓期间的最大盈利",
    "category": "自定义指标",
    "unit": "%",
    "displayFormat": "0.00",
    "filterConfig": {
      "type": "range_slider",
      "min": -1.0,
      "max": 1.0,
      "step": 0.01,
      "defaultRange": [0, 0.5]
    }
  },
  {
    "name": "exit_sma_fast",
    "type": "custom",
    "stage": "exit",
    "dataType": "float",
    "description": "出场时的快速均线值",
    "category": "技术指标",
    "displayFormat": "0.00",
    "filterConfig": {
      "type": "range_slider",
      "min": 0,
      "max": 200,
      "step": 0.1,
      "defaultRange": [80, 120]
    }
  },
  {
    "name": "signal_type",
    "type": "custom",
    "stage": "entry",
    "dataType": "str",
    "description": "信号类型",
    "category": "自定义指标",
    "filterConfig": {
      "type": "multi_select",
      "options": [
        {"label": "金叉", "value": "golden_cross"},
        {"label": "死叉", "value": "death_cross"},
        {"label": "突破", "value": "breakout"}
      ]
    }
  }
]
```

---

#### 2. 交易记录 Parquet 文件（因子数据）

**文件路径**：`/data/backtests/{task_id}/trades.parquet`

**字段结构**：

```
交易ID | 入场时间 | 出场时间 | 入场价 | 出场价 | 盈亏 | 盈亏率 | sma_fast | sma_slow | rsi | signal_strength
--------|---------|---------|--------|--------|------|--------|----------|----------|-----|----------------
trade-1 | 2023... | 2023... | 100.5  | 105.2  | 470  | 4.68%  | 102.3    | 98.5     | 65  | 0.038
trade-2 | 2023... | 2023... | 105.0  | 103.8  | -120 | -1.14% | 103.5    | 99.2     | 72  | 0.043
```

**Parquet Schema（分阶段因子）**：

```python
# ===== 内置因子（固定字段）=====

# 交易基础信息
trade_id: string
side: string  # 'long' or 'short'
quantity: float

# 入场阶段（自动记录）
entry_time: timestamp
entry_price: float
entry_bar_index: int  # 入场K线索引

# 入场市场环境（自动记录）
entry_volume: float
entry_volatility: float
entry_atr: float
entry_open: float
entry_high: float
entry_low: float
entry_close: float

# 出场阶段（自动记录）
exit_time: timestamp
exit_price: float
exit_bar_index: int  # 出场K线索引
duration_bars: int  # ⭐ 持续K线数量
duration_minutes: float  # 持续时间（分钟）

# 出场市场环境（自动记录）
exit_volume: float
exit_atr: float

# 盈亏信息（自动记录）
pnl: float
pnl_percent: float
commission: float
net_return: float

# ===== 自定义因子（动态字段，根据 factor_schema）=====

# 入场时自定义因子（用户在 record_entry_factors 中记录）
entry_sma_fast: float
entry_sma_slow: float
entry_ma_distance: float
entry_rsi: float

# 持仓期间动态因子（用户在 update_factor 中更新，取最终值）
max_profit: float  # 持仓期间最大盈利
max_drawdown: float  # 持仓期间最大回撤
avg_rsi_during_hold: float  # 持仓期间平均RSI

# 出场时自定义因子（用户在 record_exit_factors 中记录）
exit_sma_fast: float
exit_sma_slow: float
exit_rsi: float
max_profit_during_hold: float

# ... 更多自定义因子
```

**因子命名约定**：
- `entry_*`: 入场时的因子
- `exit_*`: 出场时的因子
- 无前缀：持仓期间的动态因子（取最终值）

---

## ⏰ 因子获取和固化时机

### 关键问题：一笔交易持续多个K线，因子会变化

**场景示例**：

```
交易生命周期：

T0: 入场（买入）
    价格: 100
    RSI: 65
    sma_fast: 102.3
    
T1: 持仓中（第1根K线）
    价格: 101
    RSI: 68  ⬆️ 变化了
    sma_fast: 102.5  ⬆️ 变化了
    
T2: 持仓中（第2根K线）
    价格: 103
    RSI: 72  ⬆️ 继续变化
    sma_fast: 103.1  ⬆️ 继续变化
    
T3: 出场（卖出）
    价格: 105
    RSI: 75  ⬆️ 又变化了
    sma_fast: 103.8  ⬆️ 又变化了
```

**问题**：记录哪个时刻的因子值？

---

### 方案对比

#### 方案 A: 只记录入场时的因子 ⭐ 推荐

**记录时机**：开仓时（买入/卖出开仓）

**记录内容**：
```json
{
  "trade_id": "trade-001",
  "entry_time": "T0",
  "entry_price": 100,
  
  // ⭐ 只记录入场时的因子
  "entry_rsi": 65,
  "entry_sma_fast": 102.3,
  "entry_sma_slow": 98.5,
  "entry_signal_strength": 0.038
}
```

**优点**：
- ✅ 简单直观
- ✅ 符合"交易决策"的逻辑（基于入场时的因子做决策）
- ✅ 数据量小
- ✅ 便于分析"什么因子组合会产生好的交易"

**缺点**：
- ⚠️ 无法分析持仓期间的因子变化

**适用场景**：
- 分析交易信号质量
- 优化入场条件
- 因子筛选

---

#### 方案 B: 记录入场和出场时的因子

**记录时机**：开仓时 + 平仓时

**记录内容**：
```json
{
  "trade_id": "trade-001",
  "entry_time": "T0",
  "exit_time": "T3",
  
  // 入场时的因子
  "entry_rsi": 65,
  "entry_sma_fast": 102.3,
  
  // 出场时的因子
  "exit_rsi": 75,
  "exit_sma_fast": 103.8,
  
  // 因子变化
  "rsi_change": 10,
  "sma_fast_change": 1.5
}
```

**优点**：
- ✅ 可以分析因子在持仓期间的变化
- ✅ 可以研究"出场时机"

**缺点**：
- ⚠️ 数据量增加（字段翻倍）
- ⚠️ 实现复杂度增加

**适用场景**：
- 优化出场条件
- 研究因子动态变化

---

#### 方案 C: 记录完整的因子时间序列

**记录时机**：持仓期间每根K线

**记录内容**：
```json
{
  "trade_id": "trade-001",
  "entry_time": "T0",
  "exit_time": "T3",
  
  // 因子时间序列（数组）
  "factor_series": [
    {"time": "T0", "rsi": 65, "sma_fast": 102.3},
    {"time": "T1", "rsi": 68, "sma_fast": 102.5},
    {"time": "T2", "rsi": 72, "sma_fast": 103.1},
    {"time": "T3", "rsi": 75, "sma_fast": 103.8}
  ]
}
```

**优点**：
- ✅ 数据最完整
- ✅ 可以做深度分析

**缺点**：
- ❌ 数据量巨大
- ❌ 实现复杂
- ❌ 查询和分析困难

**适用场景**：
- 深度研究（一般不需要）

---

### 最终方案：分阶段固化 + 动态更新 ⭐

**核心特性**：
- ✅ 入场时：固化内置因子
- ✅ 持仓期间：随时更新自定义因子
- ✅ 出场时：自动固化内置因子 + 用户记录自定义因子

**架构设计**：

```python
class FactorCollector(bt.Observer):
    def __init__(self):
        self.trade_factors = {}  # {trade_id: TradeFactors}
        self.current_trade_id = None
    
    # 入场：记录内置因子
    def on_trade_open(self, trade):
        self.current_trade_id = trade.ref
        self.trade_factors[trade.ref] = {
            # 内置因子（自动）
            'entry_time': self.strategy.datetime.datetime(),
            'entry_price': trade.price,
            'entry_volume': self.strategy.data.volume[0],
            'entry_atr': self.strategy.atr[0] if hasattr(self.strategy, 'atr') else None,
            # ... 更多内置因子
            
            # 自定义因子（用户可记录）
            'custom_factors': {},
            
            # 持仓期间动态更新的因子
            'dynamic_factors': {},
        }
    
    # 持仓期间：更新自定义因子
    def update_factor(self, factor_name: str, value: any):
        """在持仓期间随时更新因子"""
        if self.current_trade_id:
            self.trade_factors[self.current_trade_id]['dynamic_factors'][factor_name] = value
    
    # 入场时：记录自定义因子
    def record_entry_factors(self, factors: dict):
        """入场时记录自定义因子"""
        if self.current_trade_id:
            self.trade_factors[self.current_trade_id]['custom_factors'].update(factors)
    
    # 出场时：记录自定义因子
    def record_exit_factors(self, factors: dict):
        """出场时记录自定义因子"""
        if self.current_trade_id:
            if 'exit_custom_factors' not in self.trade_factors[self.current_trade_id]:
                self.trade_factors[self.current_trade_id]['exit_custom_factors'] = {}
            self.trade_factors[self.current_trade_id]['exit_custom_factors'].update(factors)
    
    # 出场：自动固化内置因子
    def on_trade_close(self, trade):
        if trade.ref in self.trade_factors:
            # 自动固化内置因子
            self.trade_factors[trade.ref].update({
                'exit_time': self.strategy.datetime.datetime(),
                'exit_price': trade.price,
                'pnl': trade.pnl,
                'pnl_percent': trade.pnlcomm / (trade.price * trade.size),
                'duration_bars': len(self.strategy),  # 持续K线数量 ⭐
                'duration_minutes': (self.strategy.datetime.datetime() - self.trade_factors[trade.ref]['entry_time']).total_seconds() / 60,
                # ... 更多出场内置因子
            })
            
            self.current_trade_id = None
```

**用户策略示例**：

```python
class MACrossStrategy(bt.Strategy):
    def __init__(self):
        self.sma_fast = bt.indicators.SMA(period=10)
        self.sma_slow = bt.indicators.SMA(period=20)
        self.rsi = bt.indicators.RSI(period=14)
        self.atr = bt.indicators.ATR(period=14)
        
        self.factor_collector = FactorCollector()
        self.entry_bar = None  # 记录入场K线索引
    
    def next(self):
        # 入场逻辑
        if not self.position:
            if self.sma_fast[0] > self.sma_slow[0]:
                # ⭐ 入场时记录自定义因子
                self.factor_collector.record_entry_factors({
                    'sma_fast': float(self.sma_fast[0]),
                    'sma_slow': float(self.sma_slow[0]),
                    'ma_distance': float((self.sma_fast[0] - self.sma_slow[0]) / self.sma_slow[0]),
                    'rsi': float(self.rsi[0]),
                })
                
                self.buy()
                self.entry_bar = len(self)
        
        # 持仓期间：动态更新因子
        elif self.position:
            # ⭐ 持仓期间可以随时更新因子
            current_pnl_percent = (self.data.close[0] - self.position.price) / self.position.price
            max_profit = max(getattr(self, 'max_profit', 0), current_pnl_percent)
            
            self.factor_collector.update_factor('unrealized_pnl_percent', float(current_pnl_percent))
            self.factor_collector.update_factor('max_profit', float(max_profit))
            self.factor_collector.update_factor('current_rsi', float(self.rsi[0]))
            self.max_profit = max_profit
            
            # 出场逻辑
            if self.sma_fast[0] < self.sma_slow[0]:
                # ⭐ 出场时记录自定义因子
                self.factor_collector.record_exit_factors({
                    'exit_sma_fast': float(self.sma_fast[0]),
                    'exit_sma_slow': float(self.sma_slow[0]),
                    'exit_rsi': float(self.rsi[0]),
                    'max_profit_during_hold': float(self.max_profit),
                })
                
                self.close()
                self.max_profit = 0
```

---

## 🔧 内置因子扩展架构

### 设计原则

**要求**：方便扩展，后续可以轻松添加新的内置因子

### 架构设计

```python
# ===== built_in_factors.py =====

class BuiltInFactorRegistry:
    """内置因子注册表"""
    
    def __init__(self):
        self._entry_factors = {}   # 入场因子
        self._exit_factors = {}    # 出场因子
        self._dynamic_factors = {}  # 动态因子
    
    def register_entry_factor(self, name: str, calculator: Callable):
        """注册入场因子"""
        self._entry_factors[name] = calculator
    
    def register_exit_factor(self, name: str, calculator: Callable):
        """注册出场因子"""
        self._exit_factors[name] = calculator
    
    def register_dynamic_factor(self, name: str, calculator: Callable):
        """注册动态因子（持仓期间每根K线计算）"""
        self._dynamic_factors[name] = calculator
    
    def get_entry_factors(self, strategy, trade) -> dict:
        """获取所有入场因子"""
        factors = {}
        for name, calculator in self._entry_factors.items():
            try:
                factors[name] = calculator(strategy, trade)
            except Exception as e:
                logger.warning(f"Failed to calculate entry factor {name}: {e}")
        return factors
    
    def get_exit_factors(self, strategy, trade) -> dict:
        """获取所有出场因子"""
        factors = {}
        for name, calculator in self._exit_factors.items():
            try:
                factors[name] = calculator(strategy, trade)
            except Exception as e:
                logger.warning(f"Failed to calculate exit factor {name}: {e}")
        return factors


# ===== 全局注册表 =====
built_in_factors = BuiltInFactorRegistry()


# ===== 注册内置因子 =====

# 入场因子
@built_in_factors.register_entry_factor('entry_time')
def entry_time(strategy, trade):
    return strategy.datetime.datetime()

@built_in_factors.register_entry_factor('entry_price')
def entry_price(strategy, trade):
    return trade.price

@built_in_factors.register_entry_factor('entry_volume')
def entry_volume(strategy, trade):
    return strategy.data.volume[0]

@built_in_factors.register_entry_factor('entry_atr')
def entry_atr(strategy, trade):
    if hasattr(strategy, 'atr'):
        return strategy.atr[0]
    return None

# ⭐ 后续扩展：只需添加新的注册即可
@built_in_factors.register_entry_factor('entry_bid_ask_spread')
def entry_bid_ask_spread(strategy, trade):
    """后续扩展：买卖价差"""
    if hasattr(strategy.data, 'bid') and hasattr(strategy.data, 'ask'):
        return strategy.data.ask[0] - strategy.data.bid[0]
    return None


# 出场因子
@built_in_factors.register_exit_factor('exit_time')
def exit_time(strategy, trade):
    return strategy.datetime.datetime()

@built_in_factors.register_exit_factor('exit_price')
def exit_price(strategy, trade):
    return trade.price

@built_in_factors.register_exit_factor('duration_bars')
def duration_bars(strategy, trade):
    """持续K线数量"""
    return trade.barlen

@built_in_factors.register_exit_factor('pnl')
def pnl(strategy, trade):
    return trade.pnl

@built_in_factors.register_exit_factor('pnl_percent')
def pnl_percent(strategy, trade):
    return trade.pnlcomm / (trade.price * trade.size)

# ⭐ 后续扩展：只需添加新的注册即可
@built_in_factors.register_exit_factor('sharpe_ratio')
def sharpe_ratio(strategy, trade):
    """后续扩展：单笔交易的夏普比率"""
    # 实现逻辑...
    return 0.0
```

**使用示例**：

```python
class FactorCollector(bt.Observer):
    def on_trade_open(self, trade):
        # ✅ 自动获取所有注册的入场因子
        entry_factors = built_in_factors.get_entry_factors(self.strategy, trade)
        self.trade_factors[trade.ref] = entry_factors
    
    def on_trade_close(self, trade):
        # ✅ 自动获取所有注册的出场因子
        exit_factors = built_in_factors.get_exit_factors(self.strategy, trade)
        self.trade_factors[trade.ref].update(exit_factors)
```

**扩展示例**：

```python
# ⭐ 后续添加新的内置因子，只需在 built_in_factors.py 中注册即可

@built_in_factors.register_entry_factor('entry_market_cap')
def entry_market_cap(strategy, trade):
    """市值（如果有数据）"""
    if hasattr(strategy.data, 'market_cap'):
        return strategy.data.market_cap[0]
    return None

@built_in_factors.register_exit_factor('max_favorable_excursion')
def max_favorable_excursion(strategy, trade):
    """最大有利偏移（MFE）"""
    # 实现逻辑...
    return 0.0
```

**优点**：
- ✅ 集中管理所有内置因子
- ✅ 扩展简单，只需添加新的注册
- ✅ 容错处理，单个因子失败不影响其他
- ✅ 自动化，FactorCollector 无需修改

---

## 🎨 因子配置界面设计

### 前端：策略版本编辑页面

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 策略版本编辑                                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ 【策略代码】                                                             │
│  [Python 代码编辑器...]                                                  │
│                                                                         │
│ 【参数配置】                                                             │
│  [参数配置表单...]                                                       │
│                                                                         │
│ 【因子配置】                                        [+ 添加因子]         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 内置因子（自动记录，无需配置）                                  │   │
│  │ ☑ 交易基础因子（入场价、出场价、盈亏等）                         │   │
│  │ ☑ 市场环境因子（成交量、波动率、ATR等）                         │   │
│  │ ☑ 时间因子（持续K线数量、持仓时长等）                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 自定义因子 1                                        [删除]       │   │
│  │ ┌───────────────────────────────────────────────────────────┐   │   │
│  │ │ 【基本信息】                                              │   │   │
│  │ │ 因子名称: entry_sma_fast                                  │   │   │
│  │ │ 记录阶段: [入场 ▼]  (入场/出场/持仓期间)                  │   │   │
│  │ │ 数据类型: [浮点数 ▼]                                      │   │   │
│  │ │ 描述: 入场时的快速均线值                                  │   │   │
│  │ │ 分类: [技术指标 ▼]                                        │   │   │
│  │ │                                                           │   │   │
│  │ │ 【显示配置】                                              │   │   │
│  │ │ 显示格式: 保留 [2] 位小数                                 │   │   │
│  │ │ 单位: (留空或填写，如 %, 元)                              │   │   │
│  │ │                                                           │   │   │
│  │ │ 【过滤器配置】⭐                                          │   │   │
│  │ │ 过滤器类型: [范围滑块 ▼]                                  │   │   │
│  │ │   (范围滑块/多选框/输入框/开关)                           │   │   │
│  │ │                                                           │   │   │
│  │ │ ┌─────────────────────────────────────────────────────┐ │   │   │
│  │ │ │ 范围滑块配置:                                       │ │   │   │
│  │ │ │ 最小值: [0]     最大值: [200]                       │ │   │   │
│  │ │ │ 步长: [0.1]                                        │ │   │   │
│  │ │ │ 默认范围: [90] - [110]                             │ │   │   │
│  │ │ └─────────────────────────────────────────────────────┘ │   │   │
│  │ └───────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 自定义因子 2                                        [删除]       │   │
│  │ ┌───────────────────────────────────────────────────────────┐   │   │
│  │ │ 【基本信息】                                              │   │   │
│  │ │ 因子名称: entry_rsi                                       │   │   │
│  │ │ 记录阶段: [入场 ▼]                                        │   │   │
│  │ │ 数据类型: [浮点数 ▼]                                      │   │   │
│  │ │ 描述: 入场时的RSI指标                                     │   │   │
│  │ │ 分类: [技术指标 ▼]                                        │   │   │
│  │ │                                                           │   │   │
│  │ │ 【显示配置】                                              │   │   │
│  │ │ 显示格式: 保留 [2] 位小数                                 │   │   │
│  │ │ 单位: (留空)                                              │   │   │
│  │ │                                                           │   │   │
│  │ │ 【过滤器配置】⭐                                          │   │   │
│  │ │ 过滤器类型: [范围滑块 ▼]                                  │   │   │
│  │ │                                                           │   │   │
│  │ │ ┌─────────────────────────────────────────────────────┐ │   │   │
│  │ │ │ 范围滑块配置:                                       │ │   │   │
│  │ │ │ 最小值: [0]     最大值: [100]                       │ │   │   │
│  │ │ │ 步长: [1]                                          │ │   │   │
│  │ │ │ 默认范围: [30] - [70]                              │ │   │   │
│  │ │ │ 预设值: ☑ 超买(70-100)  ☑ 超卖(0-30)              │ │   │   │
│  │ │ └─────────────────────────────────────────────────────┘ │   │   │
│  │ └───────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 自定义因子 3                                        [删除]       │   │
│  │ ┌───────────────────────────────────────────────────────────┐   │   │
│  │ │ 因子名称: max_profit_during_hold                          │   │   │
│  │ │ 记录阶段: [持仓期间 ▼]                                    │   │   │
│  │ │ 数据类型: [浮点数 ▼]                                      │   │   │
│  │ │ 描述: 持仓期间的最大盈利                                  │   │   │
│  │ │                                                           │   │   │
│  │ │ 【过滤器配置】⭐                                          │   │   │
│  │ │ 过滤器类型: [范围滑块 ▼]                                  │   │   │
│  │ │ 最小值: [-1.0]  最大值: [1.0]                             │   │   │
│  │ │ 默认范围: [0] - [0.5]                                     │   │   │
│  │ └───────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [保存版本]                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**新增功能**：
- ✅ 记录阶段选择（入场/出场/持仓期间）
- ✅ 过滤器类型配置（范围滑块/多选框/输入框/开关）⭐
- ✅ 过滤器参数配置（最小值、最大值、步长、默认值）⭐
- ✅ 预设值配置（如RSI的超买超卖区间）⭐

---

## 🔍 因子筛选界面设计

### 回测结果分析页面

```
┌───────────────────────────────────────────────────────────────────────┐
│ 回测结果分析                                                           │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ 【因子筛选】                                       [展开全部] [收起]   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ ▼ 内置因子（前端固定代码）                                      │ │
│  │ ┌───────────────────────────────────────────────────────────┐   │ │
│  │ │ 盈亏率 (%)                                                │   │ │
│  │ │ [-100] ━━━━━━●━━━━━━━━━━━━━━━━━━●━━━━━━ [100]            │   │ │
│  │ │         -50                          50                  │   │ │
│  │ │                                                           │   │ │
│  │ │ 持续K线数量                                               │   │ │
│  │ │ [0] ━━━━━●━━━━━━━━━━━━━━━━━━━━━━━●━━━━ [500]             │   │ │
│  │ │       10                          100                    │   │ │
│  │ │                                                           │   │ │
│  │ │ 入场时间                                                  │   │ │
│  │ │ [2023-01-01] 至 [2023-12-31]                             │   │ │
│  │ └───────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ ▼ 入场因子（根据 filterConfig 渲染）⭐                          │ │
│  │ ┌───────────────────────────────────────────────────────────┐   │ │
│  │ │ entry_sma_fast (入场时的快速均线值)                       │   │ │
│  │ │ [0] ━━━━━━━━━━●━━━━━━━━━━━━━━●━━━━━━━━━━ [200]          │   │ │
│  │ │              90                  110                     │   │ │
│  │ │                                                           │   │ │
│  │ │ entry_rsi (入场时的RSI指标)                               │   │ │
│  │ │ [0] ━━━━━━●━━━━━━━━━━━━━━━━━━━━●━━━━━━━━ [100]          │   │ │
│  │ │         30                      70                       │   │ │
│  │ │ 快捷选择: [超卖区 0-30] [正常 30-70] [超买区 70-100]      │   │ │
│  │ │                                                           │   │ │
│  │ │ signal_type (信号类型)                                    │   │ │
│  │ │ ☑ 金叉  ☑ 死叉  ☐ 突破                                    │   │ │
│  │ └───────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ ▼ 持仓期间因子（根据 filterConfig 渲染）⭐                      │ │
│  │ ┌───────────────────────────────────────────────────────────┐   │ │
│  │ │ max_profit_during_hold (持仓期间最大盈利 %)               │   │ │
│  │ │ [-100] ━━━━━━━●━━━━━━━━━━━━━●━━━━━━━━━━━ [100]          │   │ │
│  │ │             0              50                            │   │ │
│  │ └───────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ ▼ 出场因子（根据 filterConfig 渲染）⭐                          │ │
│  │ ┌───────────────────────────────────────────────────────────┐   │ │
│  │ │ exit_sma_fast (出场时的快速均线值)                        │   │ │
│  │ │ [0] ━━━━━━━━━━●━━━━━━━━━━━━━━━●━━━━━━━━━ [200]          │   │ │
│  │ │             80                 120                       │   │ │
│  │ └───────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  [应用筛选] [重置] [保存筛选方案]                                     │
│                                                                       │
│ 【筛选结果】                                                           │
│  符合条件的交易: 42 笔 (共 120 笔)                                     │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ ID   | 入场时间    | 盈亏率 | 持续K线 | entry_rsi | max_profit │ │
│  │ -----|------------|--------|---------|-----------|------------|  │
│  │ #001 | 2023-01-01 | 4.68%  | 32      | 65        | 6.5%       │ │
│  │ #003 | 2023-01-05 | 3.25%  | 18      | 58        | 4.2%       │ │
│  │ ...                                                             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  [导出筛选结果]                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**新增功能**：
- ✅ 因子按阶段分组（入场/持仓期间/出场）
- ✅ 根据 `filterConfig` 自动渲染过滤器
- ✅ 支持预设值快捷选择
- ✅ 可保存筛选方案
- ✅ 可展开/收起分组

---

## 🎨 表单渲染逻辑

### 根据 filterConfig 渲染筛选组件 ⭐

```tsx
/**
 * 根据因子的 filterConfig 渲染筛选组件
 */
function renderFactorFilter(factor: FactorDefinition) {
  const { filterConfig } = factor;
  
  // 如果没有配置 filterConfig，使用默认渲染
  if (!filterConfig) {
    return renderDefaultFilter(factor);
  }
  
  switch (filterConfig.type) {
    case 'range_slider':
      return renderRangeSlider(factor, filterConfig);
    
    case 'multi_select':
      return renderMultiSelect(factor, filterConfig);
    
    case 'input':
      return renderInput(factor, filterConfig);
    
    case 'switch':
      return renderSwitch(factor, filterConfig);
    
    default:
      return renderDefaultFilter(factor);
  }
}

/**
 * 渲染范围滑块
 */
function renderRangeSlider(
  factor: FactorDefinition, 
  config: FilterConfig
) {
  const [range, setRange] = useState<[number, number]>(
    config.defaultRange || [config.min || 0, config.max || 100]
  );
  
  return (
    <div className="factor-filter">
      <div className="filter-header">
        <label>{factor.description || factor.name}</label>
        {factor.unit && <span className="unit">({factor.unit})</span>}
      </div>
      
      <Slider
        range
        min={config.min || 0}
        max={config.max || 100}
        step={config.step || 1}
        value={range}
        marks={{
          [config.min || 0]: config.min || 0,
          [config.max || 100]: config.max || 100,
        }}
        onChange={(value) => {
          setRange(value as [number, number]);
          onFilterChange(factor.name, value);
        }}
      />
      
      <div className="range-inputs">
        <InputNumber
          value={range[0]}
          min={config.min}
          max={range[1]}
          onChange={(val) => {
            const newRange: [number, number] = [val || config.min || 0, range[1]];
            setRange(newRange);
            onFilterChange(factor.name, newRange);
          }}
        />
        <span>至</span>
        <InputNumber
          value={range[1]}
          min={range[0]}
          max={config.max}
          onChange={(val) => {
            const newRange: [number, number] = [range[0], val || config.max || 100];
            setRange(newRange);
            onFilterChange(factor.name, newRange);
          }}
        />
      </div>
      
      {/* 预设值快捷选择 */}
      {config.presets && config.presets.length > 0 && (
        <div className="presets">
          <span>快捷选择:</span>
          {config.presets.map((preset) => (
            <Button
              key={preset.label}
              size="small"
              onClick={() => {
                setRange(preset.range);
                onFilterChange(factor.name, preset.range);
              }}
            >
              {preset.label} {preset.range[0]}-{preset.range[1]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 渲染多选框
 */
function renderMultiSelect(
  factor: FactorDefinition, 
  config: FilterConfig
) {
  return (
    <div className="factor-filter">
      <label>{factor.description || factor.name}</label>
      <Select
        mode="multiple"
        placeholder={`选择 ${factor.description || factor.name}`}
        options={config.options}
        onChange={(values) => onFilterChange(factor.name, values)}
        style={{ width: '100%' }}
      />
    </div>
  );
}

/**
 * 渲染输入框
 */
function renderInput(
  factor: FactorDefinition, 
  config: FilterConfig
) {
  return (
    <div className="factor-filter">
      <label>{factor.description || factor.name}</label>
      <Input
        placeholder={`筛选 ${factor.description || factor.name}`}
        onChange={(e) => onFilterChange(factor.name, e.target.value)}
      />
    </div>
  );
}

/**
 * 渲染开关
 */
function renderSwitch(
  factor: FactorDefinition, 
  config: FilterConfig
) {
  return (
    <div className="factor-filter">
      <label>{factor.description || factor.name}</label>
      <Switch
        checkedChildren="是"
        unCheckedChildren="否"
        onChange={(checked) => onFilterChange(factor.name, checked)}
      />
    </div>
  );
}

/**
 * 默认渲染（根据 dataType）
 */
function renderDefaultFilter(factor: FactorDefinition) {
  switch (factor.dataType) {
    case 'int':
    case 'float':
      return (
        <div className="factor-filter">
          <label>{factor.description || factor.name}</label>
          <Slider
            range
            min={0}
            max={100}
            onChange={(range) => onFilterChange(factor.name, range)}
          />
        </div>
      );
    
    case 'str':
      return (
        <div className="factor-filter">
          <label>{factor.description || factor.name}</label>
          <Input
            placeholder={`筛选 ${factor.description || factor.name}`}
            onChange={(e) => onFilterChange(factor.name, e.target.value)}
          />
        </div>
      );
    
    case 'bool':
      return (
        <div className="factor-filter">
          <label>{factor.description || factor.name}</label>
          <Switch
            onChange={(checked) => onFilterChange(factor.name, checked)}
          />
        </div>
      );
    
    default:
      return null;
  }
}

/**
 * 主渲染函数：按阶段分组渲染
 */
function FactorFilterPanel({ factorSchema }: { factorSchema: FactorSchema }) {
  // 按阶段分组
  const entryFactors = factorSchema.filter(f => f.stage === 'entry');
  const dynamicFactors = factorSchema.filter(f => f.stage === 'dynamic');
  const exitFactors = factorSchema.filter(f => f.stage === 'exit');
  
  return (
    <div className="factor-filter-panel">
      {/* 内置因子 */}
      <Collapse defaultActiveKey={['built-in']}>
        <Panel header="内置因子" key="built-in">
          {renderBuiltInFactors()}
        </Panel>
      </Collapse>
      
      {/* 入场因子 */}
      {entryFactors.length > 0 && (
        <Collapse defaultActiveKey={['entry']}>
          <Panel header={`入场因子 (${entryFactors.length})`} key="entry">
            {entryFactors.map(factor => (
              <div key={factor.name}>
                {renderFactorFilter(factor)}
              </div>
            ))}
          </Panel>
        </Collapse>
      )}
      
      {/* 持仓期间因子 */}
      {dynamicFactors.length > 0 && (
        <Collapse defaultActiveKey={['dynamic']}>
          <Panel header={`持仓期间因子 (${dynamicFactors.length})`} key="dynamic">
            {dynamicFactors.map(factor => (
              <div key={factor.name}>
                {renderFactorFilter(factor)}
              </div>
            ))}
          </Panel>
        </Collapse>
      )}
      
      {/* 出场因子 */}
      {exitFactors.length > 0 && (
        <Collapse defaultActiveKey={['exit']}>
          <Panel header={`出场因子 (${exitFactors.length})`} key="exit">
            {exitFactors.map(factor => (
              <div key={factor.name}>
                {renderFactorFilter(factor)}
              </div>
            ))}
          </Panel>
        </Collapse>
      )}
    </div>
  );
}
```

**核心特性**：
- ✅ 根据 `filterConfig.type` 渲染不同组件
- ✅ 支持预设值快捷选择
- ✅ 支持输入框手动输入范围
- ✅ 按阶段分组（入场/持仓期间/出场）
- ✅ 自动降级到默认渲染（如果没有 filterConfig）

---

## 💻 策略中如何设置自定义因子

### Worker 端：因子收集器实现

```python
# Backtrader Observer 实现
class FactorCollector(bt.Observer):
    """
    因子收集器
    在策略中使用：self.factor_collector.record(factors)
    """
    
    lines = ('factors',)  # Backtrader 要求
    
    def __init__(self):
        self.trade_factors = {}  # {trade_id: factors}
        self.current_trade_id = None
    
    def record(self, factors: dict, event='entry'):
        """
        记录因子
        
        Args:
            factors: 因子字典，如 {'sma_fast': 102.3, 'rsi': 65}
            event: 'entry' 或 'exit'
        """
        if event == 'entry':
            # 生成交易ID
            self.current_trade_id = f"trade-{len(self.trade_factors) + 1}"
            self.trade_factors[self.current_trade_id] = {
                'entry_factors': factors.copy(),
                'entry_time': self.strategy.datetime.datetime(),
                'entry_price': self.strategy.data.close[0],
            }
        elif event == 'exit' and self.current_trade_id:
            # 记录出场因子（可选）
            self.trade_factors[self.current_trade_id]['exit_factors'] = factors.copy()
            self.trade_factors[self.current_trade_id]['exit_time'] = self.strategy.datetime.datetime()
            self.trade_factors[self.current_trade_id]['exit_price'] = self.strategy.data.close[0]
    
    def get_all_factors(self):
        """获取所有记录的因子"""
        return self.trade_factors
```

---

### 用户策略示例

```python
import backtrader as bt

class MACrossStrategy(bt.Strategy):
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
    )
    
    def __init__(self):
        # 技术指标
        self.sma_fast = bt.indicators.SMA(period=self.params.fast_period)
        self.sma_slow = bt.indicators.SMA(period=self.params.slow_period)
        self.rsi = bt.indicators.RSI(period=14)
        self.atr = bt.indicators.ATR(period=14)
        
        # ⭐ 因子收集器（系统提供）
        self.factor_collector = FactorCollector()
    
    def next(self):
        # 计算自定义因子
        ma_distance = (self.sma_fast[0] - self.sma_slow[0]) / self.sma_slow[0]
        signal_strength = abs(ma_distance)
        
        # 入场逻辑
        if not self.position:
            if self.sma_fast[0] > self.sma_slow[0] and self.rsi[0] < 70:
                # ⭐ 记录入场时的因子
                self.factor_collector.record({
                    'sma_fast': float(self.sma_fast[0]),
                    'sma_slow': float(self.sma_slow[0]),
                    'ma_distance': float(ma_distance),
                    'rsi': float(self.rsi[0]),
                    'atr': float(self.atr[0]),
                    'signal_strength': float(signal_strength),
                    'volume': float(self.data.volume[0]),
                }, event='entry')
                
                self.buy()
        
        # 出场逻辑
        elif self.position:
            if self.sma_fast[0] < self.sma_slow[0]:
                # ⭐ 可选：记录出场时的因子
                self.factor_collector.record({
                    'sma_fast': float(self.sma_fast[0]),
                    'sma_slow': float(self.sma_slow[0]),
                    'rsi': float(self.rsi[0]),
                }, event='exit')
                
                self.close()
```

---

## 📤 因子数据导出

### Worker 完成回测后

```python
class BacktestExecutor:
    def execute_task(self, task):
        # 1. 运行回测
        cerebro = bt.Cerebro()
        cerebro.addstrategy(StrategyClass, **params)
        cerebro.addobserver(FactorCollector)
        results = cerebro.run()
        
        # 2. 获取因子数据
        strategy = results[0]
        factor_collector = strategy.observers[0]  # FactorCollector
        all_factors = factor_collector.get_all_factors()
        
        # 3. 获取交易记录（Backtrader 提供）
        trades = self.get_trades_from_cerebro(cerebro)
        
        # 4. 合并交易记录和因子数据
        trades_with_factors = []
        for trade in trades:
            trade_data = {
                # 内置因子（从 trade 对象获取）
                'trade_id': trade.ref,
                'entry_time': trade.open_datetime,
                'exit_time': trade.close_datetime,
                'entry_price': trade.open_price,
                'exit_price': trade.close_price,
                'quantity': trade.size,
                'pnl': trade.pnl,
                'pnl_percent': trade.pnlcomm / (trade.open_price * trade.size),
                'commission': trade.commission,
                
                # 自定义因子（从 factor_collector 获取）
                **all_factors.get(trade.ref, {}).get('entry_factors', {})
            }
            trades_with_factors.append(trade_data)
        
        # 5. 保存到 Parquet
        df = pd.DataFrame(trades_with_factors)
        parquet_path = f'/data/backtests/{task_id}/trades.parquet'
        df.to_parquet(parquet_path)
        
        return {
            'trades_file': parquet_path,
            'total_trades': len(trades_with_factors)
        }
```

---

## 📊 数据查询示例

### Backend 查询因子数据

```typescript
@Get(':taskId/trades')
async getTradesWithFactors(
  @Param('taskId') taskId: string,
  @Query() filters: FactorFilters
) {
  // 1. 获取回测任务和策略版本
  const task = await this.backtestRepo.findOne(taskId);
  const version = await this.scriptVersionRepo.findOne(task.scriptVersionId);
  
  // 2. 读取 Parquet 文件
  const parquetPath = `/data/backtests/${taskId}/trades.parquet`;
  const conn = await duckdb.connect();
  
  // 3. 构建查询（根据因子筛选）
  let sql = `SELECT * FROM read_parquet('${parquetPath}') WHERE 1=1`;
  
  // 添加筛选条件
  if (filters.pnl_percent_min) {
    sql += ` AND pnl_percent >= ${filters.pnl_percent_min}`;
  }
  if (filters.pnl_percent_max) {
    sql += ` AND pnl_percent <= ${filters.pnl_percent_max}`;
  }
  
  // 自定义因子筛选
  for (const [factorName, range] of Object.entries(filters.customFactors || {})) {
    if (range.min !== undefined) {
      sql += ` AND ${factorName} >= ${range.min}`;
    }
    if (range.max !== undefined) {
      sql += ` AND ${factorName} <= ${range.max}`;
    }
  }
  
  // 4. 执行查询
  const trades = await conn.all(sql);
  
  // 5. 返回结果（包含因子配置，用于前端渲染）
  return {
    factorSchema: version.factorSchema,  // 因子配置
    trades: trades,                       // 交易记录（含因子）
    total: trades.length
  };
}
```

---

## 📈 完整数据流程

```
┌────────────────────────────────────────────────────────────────────┐
│ 1. 策略配置阶段（Frontend）                                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  用户编辑策略版本                                                   │
│    ↓                                                               │
│  配置自定义因子（名称、类型、stage、filterConfig）                  │
│    ↓                                                               │
│  保存到 script_versions.factor_schema (JSONB)                      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────────────┐
│ 2. 回测执行阶段（Worker）                                           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  加载策略代码 + factor_schema                                       │
│    ↓                                                               │
│  初始化 FactorCollector                                            │
│    ↓                                                               │
│  【入场时】                                                         │
│    - 自动记录内置因子（built_in_factors.get_entry_factors）        │
│    - 用户记录自定义因子（factor_collector.record_entry_factors）   │
│    ↓                                                               │
│  【持仓期间】                                                       │
│    - 用户随时更新因子（factor_collector.update_factor）            │
│    ↓                                                               │
│  【出场时】                                                         │
│    - 自动记录内置因子（built_in_factors.get_exit_factors）         │
│    - 用户记录自定义因子（factor_collector.record_exit_factors）    │
│    ↓                                                               │
│  合并所有因子数据 + 交易记录                                        │
│    ↓                                                               │
│  导出 Parquet 文件 → /data/backtests/{task_id}/trades.parquet     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────────────┐
│ 3. 结果分析阶段（Frontend）                                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  加载 factor_schema（从 script_versions）                          │
│    ↓                                                               │
│  根据 filterConfig 渲染筛选表单                                     │
│    - 内置因子：前端固定代码                                         │
│    - 自定义因子：动态渲染（按 stage 分组）                          │
│    ↓                                                               │
│  用户设置筛选条件                                                   │
│    ↓                                                               │
│  Backend 读取 Parquet 文件（DuckDB）                               │
│    ↓                                                               │
│  应用筛选条件（SQL WHERE 子句）                                     │
│    ↓                                                               │
│  返回筛选结果（交易列表 + 因子数据）                                │
│    ↓                                                               │
│  展示交易列表、统计图表、因子分布                                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 方案总结

### 1. 因子存储

| 位置 | 内容 | 格式 | 作用 |
|------|------|------|------|
| `script_versions.factor_schema` | 因子配置（元数据 + filterConfig） | JSONB | 前端渲染筛选表单 |
| `/data/backtests/{task_id}/trades.parquet` | 交易记录 + 因子数据 | Parquet | 存储实际因子值 |

---

### 2. 因子获取和固化时机 ⭐

| 阶段 | 内置因子 | 自定义因子 | API |
|------|---------|-----------|-----|
| **入场时** | ✅ 自动记录（价格、市场环境等） | ✅ 用户记录 | `record_entry_factors(dict)` |
| **持仓期间** | ❌ 不记录 | ✅ 随时更新 | `update_factor(name, value)` |
| **出场时** | ✅ 自动记录（K线数量、盈亏等） | ✅ 用户记录 | `record_exit_factors(dict)` |

---

### 3. 表单渲染

**内置因子**：
- ✅ 前端根据 worker 服务版本固定写死代码

**自定义因子**：
- ✅ 根据 `filterConfig.type` 自动渲染
- ✅ 支持类型：`range_slider`、`multi_select`、`input`、`switch`
- ✅ 按 `stage` 分组（入场/持仓期间/出场）

---

### 4. 策略中设置因子

```python
class MyStrategy(bt.Strategy):
    def __init__(self):
        self.factor_collector = FactorCollector()
    
    def next(self):
        if not self.position:
            # 入场时记录
            self.factor_collector.record_entry_factors({
                'entry_sma_fast': float(self.sma_fast[0]),
                'entry_rsi': float(self.rsi[0]),
            })
            self.buy()
        
        elif self.position:
            # 持仓期间随时更新
            self.factor_collector.update_factor(
                'max_profit', 
                float(max(self.max_profit, current_profit))
            )
            
            if should_exit:
                # 出场时记录
                self.factor_collector.record_exit_factors({
                    'exit_rsi': float(self.rsi[0]),
                })
                self.close()
```

---

### 5. 扩展性

**内置因子扩展**：
```python
# 只需在 built_in_factors.py 中注册
@built_in_factors.register_entry_factor('entry_new_factor')
def entry_new_factor(strategy, trade):
    return strategy.data.new_field[0]
```

**自定义因子扩展**：
- ✅ 无限制数量
- ✅ 用户可视化配置 filterConfig
- ✅ 前端自动渲染

---

## ✅ 已确认的决策

### 1. 出场因子记录

**决策**：✅ **需要，用户可选择**

用户可以在策略中选择是否记录出场因子。

---

### 2. 内置因子范围

**决策**：✅ **都需要，后续继续扩展**

**当前包括**：
- ✅ 交易基础：入场价、出场价、盈亏、盈亏率、手续费
- ✅ 时间信息：入场时间、出场时间、持仓时长、持续K线数量
- ✅ 市场环境：成交量、波动率、ATR
- ✅ K线数据：开高低收

**设计原则**：✅ 方便扩展，采用可扩展架构

---

### 3. 因子分类

**决策**：✅ **需要分类**

分类包括：技术指标、市场环境、自定义等

---

### 4. 因子数量限制

**决策**：✅ **不限制**

---

### 5. 因子固化时机 ⭐ 重要

**决策**：✅ **分阶段固化，支持动态更新**

#### 入场阶段
- ✅ 固化内置因子（入场价、入场时间、市场环境等）

#### 持仓阶段
- ✅ 脚本可以随时更新自定义因子数据

#### 出场阶段
- ✅ 自动固化内置因子（持续K线数量、出场价、盈亏等）
- ✅ 用户可以记录自定义因子（如出场时的技术指标）

---

### 6. 因子过滤表单渲染

**决策**：

- **内置因子**：✅ 前端根据 worker 服务版本固定写死代码
- **自定义因子**：✅ 需要在脚本保存阶段可视化配置因子表单过滤器

