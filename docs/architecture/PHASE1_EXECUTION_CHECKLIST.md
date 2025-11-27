# Phase 1 执行清单 - Backtrader内存优化调研

## 🎯 目标

验证方案2（Backtrader内存优化模式）的可行性，确保：
- ✅ 内存降低 ≥ 80%
- ✅ 速度降低 ≤ 30%
- ✅ 结果准确性 = 100%

---

## ✅ Day 1: 基础测试（今天）

### 任务1：运行现有测试脚本

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 创建结果目录
mkdir -p results

# 运行测试
python test_data_loading_optimization.py | tee results/day1_baseline_test.txt
```

**预期输出：**
```
COMPARISON
================================================================
Memory peak (MB)         2543.21              298.45               -2244.76 MB
Memory reduction         -                    -                    88.3%
```

**检查清单：**
- [ ] 测试成功运行
- [ ] 内存降低 > 80%
- [ ] 最终资金一致（误差<$1）
- [ ] 交易次数一致
- [ ] 保存测试结果到 `results/day1_baseline_test.txt`

**如果测试失败：**
1. 检查数据集路径是否正确
2. 检查Python依赖是否安装（`pip install psutil`）
3. 查看错误日志
4. 记录问题到 `results/issues.md`

---

### 任务2：验证结果准确性

创建验证脚本：

```bash
# 文件：verify_accuracy.py
```

```python
"""验证优化模式的结果准确性"""

import backtrader as bt
import sys
from pathlib import Path
from datetime import datetime
import json

sys.path.insert(0, str(Path(__file__).parent / 'src'))

from backtrader_integration.data_loading_strategies import (
    DataLoadingConfig,
    DataLoadMode,
    DataLoadingStrategy,
    create_cerebro_with_config,
)


class TestStrategy(bt.Strategy):
    """测试策略：记录所有关键数据点"""
    
    def __init__(self):
        self.sma = bt.indicators.SMA(self.data.close, period=50)
        self.data_points = []
    
    def next(self):
        # 每100个bar记录一次
        if len(self) % 100 == 0:
            self.data_points.append({
                'datetime': self.data.datetime.datetime(0).isoformat(),
                'close': self.data.close[0],
                'sma': self.sma[0],
                'position_size': self.position.size,
            })
    
    def stop(self):
        # 保存数据点
        self.data_points_final = self.data_points


def run_and_compare():
    """运行两种模式并对比数据点"""
    
    dataset_path = "/Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-23/ES/1s"
    
    results = {}
    
    for mode in ['default', 'optimized']:
        print(f"\n{'='*60}")
        print(f"Running {mode} mode...")
        print('='*60)
        
        # 配置
        if mode == 'default':
            config = DataLoadingConfig(mode=DataLoadMode.DEFAULT)
        else:
            config = DataLoadingConfig(
                mode=DataLoadMode.OPTIMIZED,
                exactbars=True,
                preload=False,
                runonce=False,
            )
        
        # 加载数据
        data_strategy = DataLoadingStrategy(config)
        data = data_strategy.load_data(
            dataset_path=dataset_path,
            fromdate=datetime(2023, 1, 1),
            todate=datetime(2023, 1, 31),  # 只测试1月份，速度快
        )
        
        # 创建Cerebro
        cerebro = create_cerebro_with_config(config)
        cerebro.adddata(data)
        cerebro.addstrategy(TestStrategy)
        cerebro.broker.setcash(100000.0)
        
        # 运行
        strat_results = cerebro.run()
        strat = strat_results[0]
        
        # 保存结果
        results[mode] = {
            'final_value': cerebro.broker.getvalue(),
            'data_points': strat.data_points_final,
        }
        
        print(f"Final value: ${results[mode]['final_value']:,.2f}")
        print(f"Data points captured: {len(results[mode]['data_points'])}")
    
    # 对比
    print(f"\n{'='*60}")
    print("COMPARISON")
    print('='*60)
    
    # 对比最终资金
    value_diff = abs(results['default']['final_value'] - results['optimized']['final_value'])
    print(f"\nFinal Value Difference: ${value_diff:.2f}")
    
    if value_diff < 1.0:
        print("✅ Final values match (difference < $1)")
    else:
        print(f"❌ Final values differ by ${value_diff:.2f}")
    
    # 对比数据点
    default_points = results['default']['data_points']
    optimized_points = results['optimized']['data_points']
    
    if len(default_points) != len(optimized_points):
        print(f"❌ Number of data points differ: {len(default_points)} vs {len(optimized_points)}")
    else:
        print(f"✅ Number of data points match: {len(default_points)}")
    
    # 对比前10个数据点
    print("\nFirst 10 data points comparison:")
    mismatches = 0
    for i in range(min(10, len(default_points))):
        dp_default = default_points[i]
        dp_optimized = optimized_points[i]
        
        # 对比close价格
        close_diff = abs(dp_default['close'] - dp_optimized['close'])
        sma_diff = abs(dp_default['sma'] - dp_optimized['sma'])
        
        if close_diff > 0.01 or sma_diff > 0.01:
            print(f"  Point {i}: ❌ Mismatch")
            print(f"    Close: {dp_default['close']} vs {dp_optimized['close']}")
            print(f"    SMA: {dp_default['sma']} vs {dp_optimized['sma']}")
            mismatches += 1
        else:
            print(f"  Point {i}: ✅ Match")
    
    # 总结
    print(f"\n{'='*60}")
    print("SUMMARY")
    print('='*60)
    
    if value_diff < 1.0 and mismatches == 0:
        print("✅ PASS: Results are identical!")
        print("   Optimized mode is safe to use.")
        return True
    else:
        print("❌ FAIL: Results differ!")
        print("   Further investigation needed.")
        return False


if __name__ == '__main__':
    success = run_and_compare()
    sys.exit(0 if success else 1)
```

**运行验证：**
```bash
python verify_accuracy.py | tee results/day1_accuracy_test.txt
```

**检查清单：**
- [ ] 最终资金差异 < $1
- [ ] 所有抽样数据点匹配
- [ ] 持仓一致
- [ ] 保存结果

---

### 任务3：记录Day 1结果

创建结果文档：

```bash
# 文件：results/day1_summary.md
```

**模板：**
```markdown
# Day 1 测试结果

## 测试日期
2024-11-25

## 环境信息
- Python版本：
- Backtrader版本：
- 系统：macOS
- 内存：16GB

## 测试1：基础性能测试

### 默认模式
- 内存占用：____ MB
- 加载时间：____ 秒
- 回测时间：____ 秒
- 最终资金：$______

### 优化模式
- 内存占用：____ MB
- 加载时间：____ 秒
- 回测时间：____ 秒
- 最终资金：$______

### 对比
- 内存降低：____%
- 时间增加：____%
- 资金差异：$____

## 测试2：准确性验证

### 数据点对比
- 总数据点：____
- 匹配数量：____
- 不匹配数量：____

### 关键指标
- 最终资金一致：✅/❌
- 交易次数一致：✅/❌
- 指标值一致：✅/❌

## 结论

□ 通过 - 继续Day 2测试
□ 失败 - 需要进一步调查

## 问题和备注
（记录遇到的任何问题）
```

---

## ✅ Day 2: 策略兼容性测试

### 任务1：创建多策略测试脚本

```python
# 文件：test_strategy_compatibility.py

"""测试不同策略的兼容性"""

import backtrader as bt
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent / 'src'))

from backtrader_integration.data_loading_strategies import (
    DataLoadingConfig,
    DataLoadMode,
    DataLoadingStrategy,
    create_cerebro_with_config,
)


# 策略1：简单MA
class SimpleMAStrategy(bt.Strategy):
    params = (('fast', 10), ('slow', 50))
    
    def __init__(self):
        self.fast_ma = bt.indicators.SMA(period=self.p.fast)
        self.slow_ma = bt.indicators.SMA(period=self.p.slow)
        self.crossover = bt.indicators.CrossOver(self.fast_ma, self.slow_ma)
    
    def next(self):
        if self.crossover > 0 and not self.position:
            self.buy()
        elif self.crossover < 0 and self.position:
            self.sell()


# 策略2：多指标
class MultiIndicatorStrategy(bt.Strategy):
    def __init__(self):
        self.sma = bt.indicators.SMA(period=20)
        self.rsi = bt.indicators.RSI(period=14)
        self.macd = bt.indicators.MACD()
        self.atr = bt.indicators.ATR(period=14)
    
    def next(self):
        if self.rsi < 30 and self.data.close > self.sma:
            if not self.position:
                self.buy()
        elif self.rsi > 70:
            if self.position:
                self.sell()


# 策略3：长周期
class LongPeriodStrategy(bt.Strategy):
    def __init__(self):
        self.sma200 = bt.indicators.SMA(period=200)
        self.ema100 = bt.indicators.EMA(period=100)
    
    def next(self):
        if self.data.close > self.sma200 and not self.position:
            self.buy()
        elif self.data.close < self.sma200 and self.position:
            self.sell()


def test_strategy(strategy_class, strategy_name):
    """测试单个策略"""
    print(f"\n{'='*60}")
    print(f"Testing: {strategy_name}")
    print('='*60)
    
    dataset_path = "/Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-23/ES/1s"
    
    results = {}
    
    for mode in ['default', 'optimized']:
        print(f"\n  Running {mode} mode...")
        
        try:
            # 配置
            if mode == 'default':
                config = DataLoadingConfig(mode=DataLoadMode.DEFAULT)
            else:
                config = DataLoadingConfig(
                    mode=DataLoadMode.OPTIMIZED,
                    exactbars=True,
                    preload=False,
                    runonce=False,
                )
            
            # 加载数据
            data_strategy = DataLoadingStrategy(config)
            data = data_strategy.load_data(
                dataset_path=dataset_path,
                fromdate=datetime(2023, 1, 1),
                todate=datetime(2023, 1, 31),
            )
            
            # 创建Cerebro
            cerebro = create_cerebro_with_config(config)
            cerebro.adddata(data)
            cerebro.addstrategy(strategy_class)
            cerebro.broker.setcash(100000.0)
            
            # 添加分析器
            cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name='trades')
            
            # 运行
            strat_results = cerebro.run()
            strat = strat_results[0]
            
            # 提取结果
            final_value = cerebro.broker.getvalue()
            trades_analysis = strat.analyzers.trades.get_analysis()
            total_trades = trades_analysis.get('total', {}).get('total', 0)
            
            results[mode] = {
                'success': True,
                'final_value': final_value,
                'total_trades': total_trades,
                'error': None,
            }
            
            print(f"    Final value: ${final_value:,.2f}")
            print(f"    Total trades: {total_trades}")
            
        except Exception as e:
            print(f"    ❌ ERROR: {e}")
            results[mode] = {
                'success': False,
                'error': str(e),
            }
    
    # 对比结果
    if results['default']['success'] and results['optimized']['success']:
        value_diff = abs(results['default']['final_value'] - results['optimized']['final_value'])
        trades_match = results['default']['total_trades'] == results['optimized']['total_trades']
        
        print(f"\n  Comparison:")
        print(f"    Value diff: ${value_diff:.2f}")
        print(f"    Trades match: {'✅' if trades_match else '❌'}")
        
        compatible = value_diff < 1.0 and trades_match
        
        if compatible:
            print(f"  ✅ {strategy_name} is COMPATIBLE")
        else:
            print(f"  ❌ {strategy_name} is INCOMPATIBLE")
        
        return {
            'strategy': strategy_name,
            'compatible': compatible,
            'value_diff': value_diff,
            'trades_match': trades_match,
        }
    else:
        print(f"  ❌ {strategy_name} FAILED to run")
        return {
            'strategy': strategy_name,
            'compatible': False,
            'error': results.get('optimized', {}).get('error', 'Unknown error'),
        }


def main():
    """运行所有策略测试"""
    print("="*60)
    print("STRATEGY COMPATIBILITY TEST")
    print("="*60)
    
    strategies = [
        (SimpleMAStrategy, "Simple MA Strategy"),
        (MultiIndicatorStrategy, "Multi Indicator Strategy"),
        (LongPeriodStrategy, "Long Period Strategy"),
    ]
    
    test_results = []
    
    for strategy_class, strategy_name in strategies:
        result = test_strategy(strategy_class, strategy_name)
        test_results.append(result)
    
    # 总结
    print(f"\n{'='*60}")
    print("SUMMARY")
    print('='*60)
    
    compatible_count = sum(1 for r in test_results if r.get('compatible', False))
    total_count = len(test_results)
    
    print(f"\nCompatible strategies: {compatible_count}/{total_count}")
    
    for result in test_results:
        status = "✅" if result.get('compatible', False) else "❌"
        print(f"  {status} {result['strategy']}")
        if not result.get('compatible', False) and 'error' in result:
            print(f"      Error: {result['error']}")
    
    # 返回是否所有策略都兼容
    return compatible_count == total_count


if __name__ == '__main__':
    all_compatible = main()
    sys.exit(0 if all_compatible else 1)
```

**运行测试：**
```bash
python test_strategy_compatibility.py | tee results/day2_compatibility_test.txt
```

**检查清单：**
- [ ] 所有策略测试完成
- [ ] 兼容性 ≥ 90%
- [ ] 记录不兼容的策略（如果有）
- [ ] 保存测试结果

---

### 任务2：分析不兼容情况（如果有）

如果发现不兼容的策略：

1. **详细分析错误**
   ```bash
   # 单独运行失败的策略，获取详细日志
   python -u test_single_strategy.py FailedStrategy --verbose
   ```

2. **识别问题模式**
   - 是否访问了过多历史数据？
   - 是否动态创建指标？
   - 是否有特殊的数据访问模式？

3. **提出解决方案**
   - 修改策略代码
   - 调整lookback配置
   - 或标记为"不兼容"

---

## ✅ Day 3: 性能基准测试

### 任务1：不同数据量测试

```python
# 文件：benchmark_different_sizes.py

"""测试不同数据量下的性能"""

import time
import psutil
import os
from datetime import datetime, timedelta

def benchmark_dataset_size(num_days):
    """测试指定天数的数据"""
    
    end_date = datetime(2023, 1, 31)
    start_date = end_date - timedelta(days=num_days)
    
    print(f"\nTesting {num_days} days of data ({start_date.date()} to {end_date.date()})")
    
    results = {}
    
    for mode in ['default', 'optimized']:
        # ... 运行回测 ...
        # 记录内存和时间
        pass
    
    return results


# 测试矩阵
test_cases = [
    {'days': 5, 'expected_rows': 200000},
    {'days': 10, 'expected_rows': 400000},
    {'days': 20, 'expected_rows': 800000},
    {'days': 31, 'expected_rows': 1200000},
]

for case in test_cases:
    result = benchmark_dataset_size(case['days'])
    # 记录结果
```

---

## 📋 完整检查清单

### Day 1
- [ ] 运行基础测试
- [ ] 验证结果准确性
- [ ] 记录Day 1结果
- [ ] 内存降低 > 80%
- [ ] 结果100%一致

### Day 2
- [ ] 测试简单MA策略
- [ ] 测试多指标策略
- [ ] 测试长周期策略
- [ ] 兼容性 ≥ 90%
- [ ] 记录Day 2结果

### Day 3
- [ ] 测试不同数据量
- [ ] 生成性能图表
- [ ] 记录Day 3结果

### Day 4
- [ ] 边界情况测试
- [ ] 压力测试
- [ ] 错误恢复测试

### Day 5
- [ ] 完成调研报告
- [ ] 生成最佳实践文档
- [ ] 决定是否进入Phase 2

---

## 🚨 如果遇到问题

### 数据集路径错误
```bash
# 检查路径
ls -la /Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-23/ES/1s/

# 如果不存在，更新脚本中的路径
```

### 依赖缺失
```bash
pip install backtrader duckdb pandas psutil
```

### 内存不足
```bash
# 减少测试数据量
# 从全年改为1个月
```

---

## 📊 预期结果

### 成功标准
- ✅ 内存降低 80-90%
- ✅ 速度降低 20-30%
- ✅ 结果100%一致
- ✅ 90%+策略兼容

### 如果达标
→ 继续Phase 2实施

### 如果未达标
→ 分析原因，调整方案

---

## 📞 需要帮助？

- 查看：[完整实施计划](./MEMORY_OPTIMIZATION_PLAN.md)
- 查看：[完整方案文档](./DATA_LOADING_STRATEGIES.md)
- 记录问题：`results/issues.md`

---

**当前状态**：📍 准备开始 Day 1 测试

**下一步**：运行 `python test_data_loading_optimization.py`

