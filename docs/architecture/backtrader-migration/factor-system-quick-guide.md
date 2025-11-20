# 因子系统快速指南

**版本**: v1.0  
**更新时间**: 2025-11-20

> 完整设计文档：[factor-system-design.md](./factor-system-design.md)

---

## 📊 因子分类

### 内置因子（自动记录）

```python
# 入场时自动记录
entry_time, entry_price, entry_volume, entry_atr, ...

# 出场时自动记录
exit_time, exit_price, duration_bars, pnl, pnl_percent, ...
```

### 自定义因子（用户记录）

```python
# 入场时记录
entry_sma_fast, entry_rsi, entry_ma_distance, ...

# 持仓期间更新
max_profit, max_drawdown, avg_rsi_during_hold, ...

# 出场时记录
exit_sma_fast, exit_rsi, max_profit_during_hold, ...
```

---

## 💻 策略中使用因子

### 完整示例

```python
import backtrader as bt

class MACrossStrategy(bt.Strategy):
    def __init__(self):
        # 技术指标
        self.sma_fast = bt.indicators.SMA(period=10)
        self.sma_slow = bt.indicators.SMA(period=20)
        self.rsi = bt.indicators.RSI(period=14)
        
        # 因子收集器（系统提供）
        self.factor_collector = FactorCollector()
        self.max_profit = 0
    
    def next(self):
        # 入场逻辑
        if not self.position:
            if self.sma_fast[0] > self.sma_slow[0]:
                # ⭐ 入场时记录自定义因子
                self.factor_collector.record_entry_factors({
                    'entry_sma_fast': float(self.sma_fast[0]),
                    'entry_sma_slow': float(self.sma_slow[0]),
                    'entry_rsi': float(self.rsi[0]),
                    'entry_ma_distance': float(
                        (self.sma_fast[0] - self.sma_slow[0]) / self.sma_slow[0]
                    ),
                })
                
                self.buy()
        
        # 持仓期间
        elif self.position:
            # ⭐ 持仓期间随时更新因子
            current_pnl_percent = (
                (self.data.close[0] - self.position.price) / self.position.price
            )
            self.max_profit = max(self.max_profit, current_pnl_percent)
            
            self.factor_collector.update_factor(
                'unrealized_pnl_percent', 
                float(current_pnl_percent)
            )
            self.factor_collector.update_factor(
                'max_profit', 
                float(self.max_profit)
            )
            
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

## 🎨 前端配置因子

### factor_schema 配置示例

```json
[
  {
    "name": "entry_sma_fast",
    "type": "custom",
    "stage": "entry",
    "dataType": "float",
    "description": "入场时的快速均线值",
    "category": "技术指标",
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
    "filterConfig": {
      "type": "range_slider",
      "min": 0,
      "max": 100,
      "step": 1,
      "defaultRange": [30, 70],
      "presets": [
        {"label": "超卖区", "range": [0, 30]},
        {"label": "超买区", "range": [70, 100]}
      ]
    }
  },
  {
    "name": "max_profit_during_hold",
    "type": "custom",
    "stage": "dynamic",
    "dataType": "float",
    "description": "持仓期间最大盈利",
    "category": "自定义指标",
    "unit": "%",
    "filterConfig": {
      "type": "range_slider",
      "min": -1.0,
      "max": 1.0,
      "step": 0.01,
      "defaultRange": [0, 0.5]
    }
  }
]
```

---

## 🔧 因子收集器 API

### 入场时记录

```python
self.factor_collector.record_entry_factors({
    'factor_name': value,
    # ... 更多因子
})
```

### 持仓期间更新

```python
self.factor_collector.update_factor('factor_name', value)
```

### 出场时记录

```python
self.factor_collector.record_exit_factors({
    'factor_name': value,
    # ... 更多因子
})
```

---

## 📊 因子数据结构

### Parquet 文件字段

```
# 内置因子（自动）
trade_id, entry_time, exit_time, entry_price, exit_price
duration_bars, pnl, pnl_percent, ...

# 自定义因子（用户配置）
entry_sma_fast, entry_rsi, max_profit, exit_rsi, ...
```

---

## 🎯 关键决策

| 决策点 | 方案 |
|--------|------|
| **出场因子记录** | 用户可选择 |
| **内置因子范围** | 当前已有 + 后续扩展 |
| **因子分类** | 需要分类 |
| **因子数量限制** | 不限制 |
| **因子固化时机** | 入场（内置） + 持仓期间（自定义更新） + 出场（内置+自定义） |
| **内置因子渲染** | 前端固定代码 |
| **自定义因子渲染** | 根据 filterConfig 动态渲染 |

---

## 📚 相关文档

- [完整设计文档](./factor-system-design.md)
- [Backtrader 迁移方案](./backtrader-final-solution.md)
- [Worker 通信设计](./worker-communication-design.md)
- [策略参数设计](./strategy-parameters-design.md)

