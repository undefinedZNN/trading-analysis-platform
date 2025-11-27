# 多周期数据回测设计

## 问题背景

### 核心问题
1. **策略周期 vs 数据周期**：策略基于5分钟K线，但应该用1秒数据回测
2. **Bar内成交误差**：5分钟K线无法反映Bar内价格波动顺序，导致止损/止盈模拟不准确

### 错误示例
```python
# ❌ 错误：直接用5分钟数据
data_5m = load_5min_data()
cerebro.adddata(data_5m)
```

**问题**：
- 无法知道5分钟Bar内的价格波动顺序
- 一根K线同时触发止损和止盈时，无法确定哪个先发生
- 回测结果过于乐观（Always assume best execution）

---

## 解决方案

### 方案1：Backtrader多周期数据（Recommended）

使用1秒数据作为主数据，5分钟作为辅助数据。

```python
import backtrader as bt

class MultiTimeframeStrategy(bt.Strategy):
    def __init__(self):
        # 主数据：1秒（用于精确成交）
        self.data_1s = self.datas[0]
        
        # 辅助数据：5分钟（用于策略信号）
        self.data_5m = self.datas[1]
        
        # 基于5分钟数据计算指标
        self.sma_fast_5m = bt.indicators.SMA(self.data_5m.close, period=10)
        self.sma_slow_5m = bt.indicators.SMA(self.data_5m.close, period=20)
        
    def next(self):
        # 每1秒调用一次
        
        # 检查是否5分钟Bar收盘（新Bar生成）
        if len(self.data_5m) > len(self.data_5m(-1)):
            # 5分钟信号检查
            if self.sma_fast_5m[0] > self.sma_slow_5m[0]:
                self.buy()  # 使用1秒数据的当前价格成交
        
        # 止损/止盈检查（每1秒）
        if self.position:
            if self.data_1s.close[0] <= self.stop_loss:
                self.close()  # 使用1秒数据精确止损
            elif self.data_1s.close[0] >= self.take_profit:
                self.close()  # 使用1秒数据精确止盈
```

**实现步骤**：
```python
# 1. 加载1秒数据（主数据）
data_1s = bt.feeds.PandasData(dataname=df_1s)
cerebro.adddata(data_1s, name='1s')

# 2. 重采样为5分钟数据
cerebro.resampledata(
    data_1s,
    timeframe=bt.TimeFrame.Minutes,
    compression=5,
    name='5m'
)

# 3. 策略可以同时访问两个数据
cerebro.addstrategy(MultiTimeframeStrategy)
```

---

### 方案2：Bar Replay（最精确）

使用1秒数据，但在策略中聚合为5分钟。

```python
import backtrader as bt

class BarAggregatorStrategy(bt.Strategy):
    def __init__(self):
        # 1秒数据
        self.data_1s = self.datas[0]
        
        # 手动聚合5分钟K线
        self.bar_5m = {
            'open': None,
            'high': -float('inf'),
            'low': float('inf'),
            'close': None,
            'volume': 0,
            'count': 0,
        }
        
    def next(self):
        current_time = self.data_1s.datetime.datetime(0)
        
        # 检查是否新5分钟开始
        if current_time.minute % 5 == 0 and current_time.second == 0:
            if self.bar_5m['count'] > 0:
                # 5分钟Bar完成，计算信号
                self._process_5min_bar()
            
            # 重置5分钟Bar
            self.bar_5m = {
                'open': self.data_1s.open[0],
                'high': self.data_1s.high[0],
                'low': self.data_1s.low[0],
                'close': self.data_1s.close[0],
                'volume': self.data_1s.volume[0],
                'count': 1,
            }
        else:
            # 更新5分钟Bar
            self.bar_5m['high'] = max(self.bar_5m['high'], self.data_1s.high[0])
            self.bar_5m['low'] = min(self.bar_5m['low'], self.data_1s.low[0])
            self.bar_5m['close'] = self.data_1s.close[0]
            self.bar_5m['volume'] += self.data_1s.volume[0]
            self.bar_5m['count'] += 1
        
        # 每1秒检查止损/止盈
        self._check_exit_conditions()
```

---

### 方案3：使用CheatOnClose（不推荐）

Backtrader的`cheat_on_close`模式：

```python
cerebro = bt.Cerebro(cheat_on_close=True)
```

**问题**：
- 假设可以在Bar收盘价成交
- 现实中不可能（look-ahead bias）
- 不适合生产级回测

---

## 推荐实现

### 数据流设计

```
原始数据：1秒Parquet文件
    ↓
Backtrader加载：
    - 主数据流：1秒 (data[0])
    - Resample：5分钟 (data[1])
    ↓
策略执行：
    - 信号计算：基于5分钟数据
    - 成交模拟：使用1秒数据当前价格
    - 止损/止盈：每1秒检查
    ↓
结果：
    - 精确的成交价格
    - 真实的滑点模拟
    - 准确的回测统计
```

---

## 系统修改计划

### 1. 修改BacktestExecutor

```python
def _load_data(self, dataset_path: str, data_config: dict):
    """加载数据并设置多周期"""
    # 始终加载1秒数据
    df = self._load_1s_data(dataset_path)
    
    # 创建主数据（1秒）
    data_1s = bt.feeds.PandasData(dataname=df)
    
    return data_1s

def execute_backtest(self, task_message: dict):
    # ...
    
    # 加载1秒数据
    data_1s = self._load_data(dataset_path, data_config)
    cerebro.adddata(data_1s, name='1s')
    
    # 重采样为策略周期（如5分钟）
    strategy_timeframe = data_config.get('timeframe', '5m')
    if strategy_timeframe != '1s':
        cerebro.resampledata(
            data_1s,
            timeframe=bt.TimeFrame.Minutes,
            compression=5,  # 根据timeframe动态计算
            name=strategy_timeframe
        )
    
    # ...
```

### 2. 修改策略基类

```python
class MultiTimeframeStrategy(bt.Strategy):
    params = (
        ('signal_timeframe', '5m'),  # 信号周期
        ('execution_timeframe', '1s'),  # 成交周期
    )
    
    def __init__(self):
        # 根据参数选择数据
        if len(self.datas) > 1:
            self.signal_data = self.datas[1]  # 5分钟
            self.execution_data = self.datas[0]  # 1秒
        else:
            self.signal_data = self.datas[0]
            self.execution_data = self.datas[0]
```

### 3. Frontend配置

在任务创建页面添加配置：

```typescript
interface BacktestTaskConfig {
  dataConfig: {
    datasetPath: string;  // 始终使用1秒数据路径
    signalTimeframe: '1m' | '5m' | '15m' | '1h';  // 策略信号周期
    executionTimeframe: '1s' | '1m';  // 成交模拟周期
  };
}
```

---

## 性能考虑

### 数据量对比

| 周期 | 2023年ES数据量 | 回测耗时（估算） |
|------|---------------|-----------------|
| 1秒  | 530万条       | 10-15分钟       |
| 5分钟| 17,742条      | 2-3秒           |

### 优化策略

1. **分段回测**：
   - 开发阶段：用5分钟数据快速验证逻辑（明确标注为"低精度模式"）
   - 验证阶段：用1秒数据精确回测

2. **缓存机制**：
   - 1秒数据加载后缓存
   - 后续回测复用缓存

3. **并行处理**：
   - 多个任务并行时，共享1秒数据加载

---

## 实施优先级

### Phase 1（当前）：
- ✅ 支持5分钟数据快速回测
- ⚠️ 明确标注："开发模式，存在Bar内误差"

### Phase 2（推荐立即实施）：
- [ ] 实现多周期数据支持
- [ ] 修改BacktestExecutor使用1秒+resample
- [ ] Frontend添加精度模式选择

### Phase 3（优化）：
- [ ] 添加数据缓存
- [ ] 实现分段回测
- [ ] 性能优化

---

## 总结

### ✅ 正确做法
- 策略信号基于5分钟K线
- 成交模拟使用1秒数据
- 止损/止盈每1秒检查

### ❌ 错误做法
- 直接用5分钟数据回测
- 假设Bar内价格可预测
- 忽略滑点和延迟

### 📊 精度对比

| 方法 | 精度 | 速度 | 适用场景 |
|------|------|------|----------|
| 5分钟直接回测 | ⭐⭐ | ⚡⚡⚡ | 快速验证逻辑 |
| 1秒+5分钟信号 | ⭐⭐⭐⭐⭐ | ⚡ | 生产级回测 |
| Tick级别 | ⭐⭐⭐⭐⭐ | ⚡ | 高频策略 |

---

## 参考资料

- [Backtrader Multi-Timeframe Documentation](https://www.backtrader.com/docu/data-multitimeframe/)
- [回测中的Look-Ahead Bias](https://www.quantstart.com/articles/Backtesting-Pitfalls-Look-Ahead-Bias/)


