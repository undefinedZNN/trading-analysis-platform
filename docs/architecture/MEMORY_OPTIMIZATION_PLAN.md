# Backtrader内存优化实施计划（方案2）

## 📋 概述

本文档详细说明**方案2：Backtrader内存优化模式**的调研和实施计划。

### 方案选择

- ✅ **Phase 1**：实施方案2（内存优化模式）
- 🔜 **Phase 2**：支持前端选择方案2和方案3（流式加载）

---

## 🎯 方案2详细说明

### 核心技术：Backtrader的exactbars模式

```python
cerebro = bt.Cerebro(
    exactbars=True,    # 核心优化：只保留必要的历史bar
    preload=False,     # 不预加载所有数据到内存
    runonce=False,     # 逐条处理，不使用向量化
)
```

### 工作原理

#### 默认模式（preload=True, runonce=True）

```
加载阶段：
数据文件 → 一次性加载全部到内存 → DataFrame(530万行)
         ↓
内存占用：2.5GB

运行阶段：
所有bar保留在内存中 [bar0, bar1, bar2, ..., bar5,300,000]
策略可以随时访问任意历史bar
向量化处理（快）
```

#### 优化模式（exactbars=True, preload=False, runonce=False）

```
加载阶段：
数据文件 → 懒加载，按需读取
         ↓
内存占用：<<100MB（仅元数据）

运行阶段：
内存中只保留滑动窗口 [bar(i-50), bar(i-49), ..., bar(i)]
                      ↑
                    lookback窗口大小 = max(所有指标的period)

旧的bar自动丢弃
逐条处理（稍慢）
```

### 内存计算

```python
# 假设策略最大指标period = 50（例如SMA(50)）

# 默认模式
memory = 5,300,000 bars × 500 bytes/bar = 2.5GB

# 优化模式
memory = 50 bars × 500 bytes/bar = 25KB (数据部分)
       + Cerebro开销 ≈ 300MB (总计)

# 节省
saving = (2500 - 300) / 2500 = 88%
```

---

## 🔬 调研任务

### 1. 兼容性验证

#### 1.1 策略兼容性

**需要验证的策略类型：**

- [x] 简单MA策略（SMA交叉）
- [ ] 多指标策略（MACD + RSI + Bollinger）
- [ ] 多时间框架策略（1s + 5min + 1h）
- [ ] 复杂技术指标（ATR, ADX, Stochastic）
- [ ] 自定义指标

**测试方法：**
```python
# 分别用默认模式和优化模式运行
# 对比：
# 1. 最终资金
# 2. 交易次数
# 3. 交易时间点
# 4. 指标值（抽样检查）

def test_strategy_compatibility(strategy_class):
    # 默认模式
    result_default = run_backtest(strategy_class, mode='default')
    
    # 优化模式
    result_optimized = run_backtest(strategy_class, mode='optimized')
    
    # 对比
    assert abs(result_default['final_value'] - result_optimized['final_value']) < 0.01
    assert result_default['total_trades'] == result_optimized['total_trades']
```

#### 1.2 指标兼容性

**需要验证的指标：**

| 指标类型 | 示例 | lookback | 验证状态 |
|---------|------|----------|---------|
| 简单移动平均 | SMA, EMA | period | ⏳ |
| 动量指标 | RSI, MACD | period×2 | ⏳ |
| 波动率指标 | ATR, BB | period | ⏳ |
| 成交量指标 | OBV, VWAP | period | ⏳ |
| 自定义指标 | Custom | variable | ⏳ |

**测试脚本：**
```python
# test_indicator_compatibility.py
def test_indicator(indicator_class, period):
    """测试单个指标的兼容性"""
    # 创建测试策略
    class TestStrategy(bt.Strategy):
        def __init__(self):
            self.indicator = indicator_class(self.data.close, period=period)
        
        def next(self):
            # 记录指标值
            self.indicator_values.append(self.indicator[0])
    
    # 对比两种模式的指标值
    values_default = run_with_mode('default')
    values_optimized = run_with_mode('optimized')
    
    # 验证一致性
    assert np.allclose(values_default, values_optimized, rtol=1e-5)
```

#### 1.3 多时间框架兼容性

**关键问题：**
- exactbars模式下，resampled data是否正常工作？
- lookback计算是否正确？

**测试：**
```python
# 测试多时间框架策略
def test_multi_timeframe():
    data0 = bt.feeds.PandasData(dataname=df_1s)  # 1秒
    data1 = bt.feeds.PandasData(dataname=df_5min)  # 5分钟
    
    cerebro = bt.Cerebro(exactbars=True, preload=False, runonce=False)
    cerebro.adddata(data0)
    cerebro.adddata(data1)
    cerebro.addstrategy(MultiTimeframeStrategy)
    
    # 验证两个时间框架的同步
    results = cerebro.run()
```

---

### 2. 性能测试

#### 2.1 内存测试

**测试矩阵：**

| 数据量 | 默认内存 | 优化内存 | 节省 |
|--------|---------|---------|------|
| 50万条 | 250MB | 150MB | 40% |
| 100万条 | 500MB | 180MB | 64% |
| 200万条 | 1GB | 220MB | 78% |
| 530万条 | 2.5GB | 300MB | 88% |
| 1000万条 | 5GB | 400MB | 92% |

**测试脚本：**
```python
import psutil
import os

def measure_memory(mode, dataset_size):
    process = psutil.Process(os.getpid())
    
    # 记录初始内存
    mem_start = process.memory_info().rss / 1024 / 1024
    
    # 运行回测
    if mode == 'default':
        cerebro = bt.Cerebro()
    else:
        cerebro = bt.Cerebro(exactbars=True, preload=False, runonce=False)
    
    # ... 加载数据和运行 ...
    
    # 记录峰值内存
    mem_peak = process.memory_info().rss / 1024 / 1024
    
    return {
        'mode': mode,
        'dataset_size': dataset_size,
        'memory_start_mb': mem_start,
        'memory_peak_mb': mem_peak,
        'memory_increase_mb': mem_peak - mem_start,
    }
```

#### 2.2 速度测试

**预期结果：**
- 加载时间：不变
- 运行时间：增加20-30%（可接受）

**测试代码：**
```python
import time

def benchmark_speed(mode, dataset_size):
    # 加载阶段
    load_start = time.time()
    data = load_data(dataset_size)
    load_time = time.time() - load_start
    
    # 回测阶段
    cerebro = create_cerebro(mode)
    cerebro.adddata(data)
    cerebro.addstrategy(BenchmarkStrategy)
    
    run_start = time.time()
    cerebro.run()
    run_time = time.time() - run_start
    
    return {
        'mode': mode,
        'load_time': load_time,
        'run_time': run_time,
        'total_time': load_time + run_time,
    }
```

#### 2.3 结果准确性测试

**测试方法：**
```python
def test_accuracy():
    """确保优化模式结果与默认模式完全一致"""
    
    # 运行两种模式
    result_default = run_backtest(mode='default', seed=42)
    result_optimized = run_backtest(mode='optimized', seed=42)
    
    # 对比关键指标
    checks = [
        ('final_value', 1e-2),  # 最终资金，容差0.01
        ('total_trades', 0),     # 交易次数，必须完全一致
        ('sharpe_ratio', 1e-4),  # 夏普比率
        ('max_drawdown', 1e-4),  # 最大回撤
    ]
    
    for metric, tolerance in checks:
        default_val = result_default[metric]
        optimized_val = result_optimized[metric]
        
        if tolerance == 0:
            assert default_val == optimized_val, f"{metric} mismatch"
        else:
            assert abs(default_val - optimized_val) < tolerance, f"{metric} mismatch"
    
    print("✅ All accuracy checks passed!")
```

---

### 3. 边界情况测试

#### 3.1 大lookback策略

```python
# 测试需要很长历史的策略
class LongLookbackStrategy(bt.Strategy):
    def __init__(self):
        self.sma200 = bt.indicators.SMA(period=200)  # 长周期
        self.sma500 = bt.indicators.SMA(period=500)  # 超长周期
    
    def next(self):
        # 策略逻辑
        pass

# 验证：
# 1. lookback自动计算正确（max(200, 500) = 500）
# 2. 内存占用仍然很小
# 3. 结果准确
```

#### 3.2 动态指标创建

```python
# 某些策略在运行时动态创建指标
class DynamicIndicatorStrategy(bt.Strategy):
    def next(self):
        if self.some_condition:
            # 动态创建新指标
            new_indicator = bt.indicators.SMA(period=20)
        # ...

# 验证：exactbars模式下是否支持
```

#### 3.3 空数据和缺失值

```python
# 测试数据质量问题
def test_edge_cases():
    # 1. 数据中有NaN
    # 2. 数据有大gap
    # 3. 数据量不足lookback
    # 4. 单个bar数据
    pass
```

---

## 📝 实施计划

### Phase 1: 调研和验证（预计3-5天）

#### Day 1: 基础测试

```bash
# 任务清单
□ 运行现有测试脚本 test_data_loading_optimization.py
□ 验证基本策略兼容性
□ 测量内存和速度
□ 记录初步结果
```

**执行命令：**
```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 基础测试
python test_data_loading_optimization.py

# 记录输出到文件
python test_data_loading_optimization.py > results/day1_baseline_test.txt 2>&1
```

**成功标准：**
- ✅ 内存降低 > 80%
- ✅ 速度降低 < 40%
- ✅ 结果准确性 100%

---

#### Day 2: 策略兼容性测试

**创建测试脚本：**
```bash
# 文件：test_strategy_compatibility.py
```

```python
"""
测试不同类型策略的兼容性
"""

strategies_to_test = [
    ('SimpleMA', SimpleMAStrategy),
    ('MultiIndicator', MultiIndicatorStrategy),
    ('MultiTimeframe', MultiTimeframeStrategy),
    ('ComplexTechnical', ComplexTechnicalStrategy),
]

results = []
for name, strategy_class in strategies_to_test:
    print(f"Testing {name}...")
    
    result = test_strategy_compatibility(strategy_class)
    results.append(result)
    
    if result['compatible']:
        print(f"✅ {name} compatible")
    else:
        print(f"❌ {name} INCOMPATIBLE: {result['error']}")

# 生成报告
generate_compatibility_report(results)
```

**成功标准：**
- ✅ 所有现有策略100%兼容
- ✅ 识别不兼容的策略模式（如果有）
- ✅ 提供解决方案或workaround

---

#### Day 3: 性能基准测试

**测试矩阵：**
```python
# 文件：benchmark_memory_optimization.py

test_matrix = [
    {'dataset_size': 500000, 'strategies': ['SimpleMA', 'MultiIndicator']},
    {'dataset_size': 1000000, 'strategies': ['SimpleMA', 'MultiIndicator']},
    {'dataset_size': 2000000, 'strategies': ['SimpleMA']},
    {'dataset_size': 5300000, 'strategies': ['SimpleMA']},
]

for test_case in test_matrix:
    for strategy in test_case['strategies']:
        # 测试默认模式
        result_default = benchmark(
            mode='default',
            dataset_size=test_case['dataset_size'],
            strategy=strategy,
        )
        
        # 测试优化模式
        result_optimized = benchmark(
            mode='optimized',
            dataset_size=test_case['dataset_size'],
            strategy=strategy,
        )
        
        # 记录结果
        save_benchmark_result(result_default, result_optimized)
```

**生成报告：**
```python
# 生成性能对比表格
# 生成内存占用图表
# 生成速度对比图表
```

---

#### Day 4: 边界情况和压力测试

**测试清单：**

```python
# 1. 极端lookback测试
test_extreme_lookback(period=1000)

# 2. 内存压力测试
test_memory_pressure(dataset_size=20000000)  # 2000万条

# 3. 长时间运行
test_long_running(days=365)  # 全年数据

# 4. 并发测试
test_concurrent_backtests(num_workers=4)

# 5. 错误恢复
test_error_recovery()
```

---

#### Day 5: 文档和总结

**输出文档：**

1. **调研报告** (`RESEARCH_REPORT_PHASE1.md`)
   - 测试结果总结
   - 兼容性分析
   - 性能数据
   - 风险评估

2. **最佳实践指南** (`BEST_PRACTICES.md`)
   - 何时使用优化模式
   - 注意事项
   - 常见问题
   - 故障排查

3. **测试报告** (`TEST_REPORT_PHASE1.md`)
   - 所有测试用例
   - 测试结果
   - 发现的问题
   - 解决方案

---

### Phase 2: 实施（预计5-7天）

#### Week 2, Day 1-2: Worker端实现

**文件修改清单：**

```bash
# 1. 添加配置支持
backtest-worker/src/backtrader_integration/config.py
  + DataLoadingConfig class
  + get_recommended_config()

# 2. 修改回测执行器
backtest-worker/src/backtrader_integration/backtest_executor.py
  + 读取配置
  + 应用到Cerebro

# 3. 添加配置传递
backtest-worker/src/rabbitmq_worker.py
  + 从任务消息中读取config
  + 传递给executor
```

**实现示例：**

```python
# backtest_executor.py

class BacktestExecutor:
    def __init__(self, config: Optional[DataLoadingConfig] = None):
        self.config = config or DataLoadingConfig.get_recommended()
    
    def run_backtest(self, task):
        # 创建Cerebro（应用配置）
        cerebro = bt.Cerebro(
            exactbars=self.config.exactbars,
            preload=self.config.preload,
            runonce=self.config.runonce,
        )
        
        # ... 其余代码不变 ...
        
        return results
```

---

#### Week 2, Day 3-4: Backend API实现

**API端点：**

```typescript
// 1. 创建回测任务（带配置）
POST /api/backtesting/tasks
{
  "strategyId": "xxx",
  "datasetId": "ES-23",
  "dataLoadingConfig": {
    "mode": "optimized",
    "exactbars": true,
    "preload": false,
    "runonce": false
  }
}

// 2. 获取推荐配置
GET /api/backtesting/data-loading/recommend/:datasetId
Response: {
  "recommendedConfig": {...},
  "estimate": {
    "memoryMB": 300,
    "speedPercentage": 75
  }
}

// 3. 查询任务配置
GET /api/backtesting/tasks/:taskId/config
```

**数据库Schema更新：**

```sql
-- 添加配置字段到backtest_tasks表
ALTER TABLE backtest_tasks ADD COLUMN data_loading_config JSONB;

-- 默认值
UPDATE backtest_tasks 
SET data_loading_config = '{"mode": "optimized", "exactbars": true, "preload": false, "runonce": false}'::jsonb
WHERE data_loading_config IS NULL;
```

---

#### Week 2, Day 5: 集成测试

**端到端测试：**

```bash
# 1. 通过API创建回测任务（使用优化配置）
curl -X POST http://localhost:3000/api/backtesting/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": "test-ma-strategy",
    "datasetId": "ES-23",
    "dataLoadingConfig": {
      "mode": "optimized",
      "exactbars": true,
      "preload": false,
      "runonce": false
    }
  }'

# 2. Worker接收任务

# 3. 执行回测（使用优化模式）

# 4. 返回结果

# 5. 验证内存占用和结果准确性
```

**监控指标：**
- Worker内存占用
- 任务执行时间
- 结果准确性
- 错误率

---

#### Week 2, Day 6-7: 文档和部署

**文档更新：**

1. **用户文档**
   - 如何使用优化模式
   - 性能提升说明
   - FAQ

2. **开发者文档**
   - 配置参数说明
   - API接口文档
   - 架构变更

3. **运维文档**
   - 部署步骤
   - 配置建议
   - 监控指标

**部署清单：**
```bash
# 1. 更新Worker代码
cd backtest-worker
git pull
pip install -r requirements.txt

# 2. 更新Backend代码
cd ../backend
git pull
npm install
npm run build

# 3. 数据库迁移
npm run migration:run

# 4. 重启服务
pm2 restart all

# 5. 验证
curl http://localhost:3000/health
```

---

### Phase 3: 优化和监控（持续）

#### 监控指标

**关键指标：**

| 指标 | 目标 | 报警阈值 |
|------|------|---------|
| Worker内存占用 | <500MB | >800MB |
| 回测完成时间 | <5min | >10min |
| 结果准确性 | 100% | <99.9% |
| 错误率 | <0.1% | >1% |

**监控实现：**

```python
# worker端上报指标
import prometheus_client as prom

memory_usage = prom.Gauge('backtest_memory_mb', 'Memory usage in MB')
execution_time = prom.Histogram('backtest_execution_seconds', 'Execution time')

def run_backtest_with_metrics():
    start_time = time.time()
    start_memory = get_memory_usage()
    
    try:
        result = run_backtest()
        
        # 上报指标
        memory_usage.set(get_memory_usage())
        execution_time.observe(time.time() - start_time)
        
        return result
    except Exception as e:
        # 上报错误
        errors_counter.inc()
        raise
```

---

## 📊 风险评估

### 高风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 策略不兼容 | 高 | 低 | 全面测试，提供fallback |
| 结果不一致 | 高 | 极低 | 严格验证，自动对比 |

### 中风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 性能降低过多 | 中 | 低 | 基准测试，用户可选 |
| 动态指标问题 | 中 | 低 | 测试覆盖，文档说明 |

### 低风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 内存节省不足 | 低 | 极低 | 已有测试数据支持 |
| 文档不完善 | 低 | 中 | 持续更新 |

---

## ✅ 成功标准

### Phase 1（调研）

- [x] 完成基础测试脚本
- [ ] 内存降低 ≥ 80%
- [ ] 速度降低 ≤ 30%
- [ ] 结果准确性 = 100%
- [ ] 策略兼容性 ≥ 95%
- [ ] 完成调研报告

### Phase 2（实施）

- [ ] Worker支持配置
- [ ] Backend API实现
- [ ] 数据库schema更新
- [ ] 端到端测试通过
- [ ] 文档完善

### Phase 3（上线）

- [ ] 生产环境部署
- [ ] 监控系统就绪
- [ ] 用户文档发布
- [ ] 性能指标达标

---

## 📅 时间表

```
Week 1: 调研和验证
├── Day 1: 基础测试 ✅
├── Day 2: 策略兼容性 ⏳
├── Day 3: 性能基准 ⏳
├── Day 4: 边界测试 ⏳
└── Day 5: 文档总结 ⏳

Week 2: 实施
├── Day 1-2: Worker实现
├── Day 3-4: Backend实现
├── Day 5: 集成测试
└── Day 6-7: 文档和部署

Week 3+: 持续优化
└── 监控、调优、迭代
```

---

## 🎯 下一步行动

### 立即开始（今天）

1. **运行基础测试**
   ```bash
   cd /Volumes/CODE/trading-analysis-platform/backtest-worker
   python test_data_loading_optimization.py
   ```

2. **记录结果**
   - 创建 `results/` 目录
   - 保存测试输出
   - 截图或记录关键数据

3. **评估结果**
   - 内存是否降低 > 80%？
   - 速度是否可接受？
   - 结果是否一致？

### 明天

1. **创建策略兼容性测试脚本**
   - 测试现有所有策略
   - 记录兼容性

2. **开始性能基准测试**
   - 不同数据量
   - 不同策略

### 本周完成

- [ ] 完成所有调研测试
- [ ] 生成调研报告
- [ ] 决定是否继续Phase 2

---

## 📚 参考资料

1. **Backtrader官方文档**
   - [Memory Savings](https://www.backtrader.com/docu/memory-savings/memory-savings/)
   - [Data Feeds](https://www.backtrader.com/docu/datafeed/)

2. **性能优化**
   - [Python内存优化](https://docs.python.org/3/library/gc.html)
   - [psutil文档](https://psutil.readthedocs.io/)

3. **项目文档**
   - [完整方案文档](./DATA_LOADING_STRATEGIES.md)
   - [快速开始](../QUICK_START_MEMORY_OPTIMIZATION.md)

---

## 💬 问题和讨论

如有问题，请记录在此：

1. ❓ 多时间框架策略的lookback计算是否正确？
2. ❓ 是否需要支持动态切换模式？
3. ❓ 如何处理历史任务的配置迁移？

---

## 📝 更新日志

- 2024-11-25: 创建初始实施计划
- 待续...

---

**当前状态**：📍 Phase 1 Day 1 - 准备运行基础测试

**责任人**：待定

**预计完成时间**：2-3周

**优先级**：🔥 高

