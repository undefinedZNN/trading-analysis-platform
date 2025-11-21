# Backtrader Integration Module

**创建日期**: 2025-11-21  
**状态**: 开发中（Phase 1）

---

## 📁 模块结构

```
backtrader-integration/
├── data/                    # 数据加载模块
│   ├── __init__.py
│   └── cached_datafeed.py  # ✅ 完成 - 带缓存的 Parquet DataFeed
├── factors/                 # 因子收集模块
│   ├── __init__.py
│   └── factor_collector.py # ✅ 完成 - 因子收集器
├── strategy/                # 策略执行模块
│   └── __init__.py         # 待开发
├── messaging/               # 消息通信模块
│   └── __init__.py         # 待开发
├── checkpoint/              # Checkpoint 模块
│   └── __init__.py         # 待开发
├── analytics/               # 统计分析模块
│   └── __init__.py         # 待开发
├── utils/                   # 工具模块
│   └── __init__.py         # 待开发
└── README.md               # 本文件
```

---

## ✅ 已完成模块

### 1. 数据加载模块 (`data/cached_datafeed.py`)

**功能**:
- ✅ 使用 DuckDB 读取 Parquet 文件
- ✅ LRU 缓存（2GB 容量，可配置）
- ✅ 支持数据聚合（1秒 → 1分钟/5分钟/1小时/1天）
- ✅ 支持按天分区的数据读取
- ✅ 完整的日志和错误处理

**核心类**:
- `LRUCache` - LRU 缓存实现
- `CachedParquetDataFeed` - Backtrader DataFeed

**重构自**: `poc/backtrader-poc/src/cached_datafeed.py`

**改进点**:
- ✅ 添加完整的类型注解
- ✅ 添加详细的日志
- ✅ 添加参数验证
- ✅ 优化错误处理
- ✅ 支持自定义数据路径

---

### 2. 因子收集模块 (`factors/factor_collector.py`)

**功能**:
- ✅ 收集入场因子
- ✅ 收集持仓因子（可选）
- ✅ 收集出场因子
- ✅ 支持自定义因子
- ✅ 导出到 Parquet
- ✅ 统计信息

**核心类**:
- `FactorCollector` - Backtrader Observer

**重构自**: `poc/backtrader-poc/src/03_strategy_with_factors.py`

**改进点**:
- ✅ 支持持仓因子记录
- ✅ 支持自定义因子
- ✅ 添加统计功能
- ✅ 添加导出功能
- ✅ 优化订单匹配逻辑

---

## 🚧 待开发模块

### 3. 策略执行模块 (`strategy/`)

**计划功能**:
- 策略工厂模式
- 策略验证
- 策略参数管理

**参考**: `poc/backtrader-poc/src/03_strategy_with_factors.py`

---

### 4. 消息通信模块 (`messaging/`)

**计划功能**:
- RabbitMQ 客户端封装
- 消息重试机制
- 连接池管理

**参考**: `poc/backtrader-poc/src/04_rabbitmq_communication.py`

---

### 5. Checkpoint 模块 (`checkpoint/`)

**计划功能**:
- Checkpoint 保存和加载
- 断点续跑
- 性能优化（msgpack, 压缩）

**参考**: `poc/backtrader-poc/src/06_checkpoint_resume.py`

---

### 6. 统计分析模块 (`analytics/`)

**计划功能**:
- 12个统计指标
- 夏普比率
- 最大回撤
- 自定义指标支持

**参考**: `poc/backtrader-poc/src/05_complete_backtest.py`

---

## 🧪 测试

### 单元测试

待创建：
- `tests/test_cached_datafeed.py`
- `tests/test_factor_collector.py`
- `tests/test_strategy.py`
- ...

目标覆盖率: > 80%

---

## 📝 使用示例

### 数据加载

```python
from backtrader_integration.data import CachedParquetDataFeed

# 创建 DataFeed
data = CachedParquetDataFeed(
    symbol='ES',
    start_date='2023-01-01',
    end_date='2023-12-31',
    aggregate_timeframe='1min',
    use_cache=True,
    cache_capacity_mb=2048,
)

# 添加到 Cerebro
cerebro.adddata(data)
```

### 因子收集

```python
from backtrader_integration.factors import FactorCollector

# 添加到 Cerebro
cerebro.addobserver(FactorCollector)

# 在策略中使用
class MyStrategy(bt.Strategy):
    def __init__(self):
        self.factor_collector = self.getobserver(FactorCollector)
        self.factor_collector.set_strategy(self)
    
    def notify_order(self, order):
        if order.isbuy() and order.status == order.Completed:
            self.factor_collector.record_entry_factors(
                order=order,
                price=order.executed.price,
                size=order.executed.size,
                commission=order.executed.comm,
                # 自定义因子
                sma_fast=self.sma_fast[0],
                sma_slow=self.sma_slow[0],
            )
```

---

## 📊 进度跟踪

| 模块 | 状态 | 完成日期 | 负责人 |
|------|------|---------|--------|
| 数据加载 | ✅ 完成 | 2025-11-21 | - |
| 因子收集 | ✅ 完成 | 2025-11-21 | - |
| 策略执行 | ⏳ 待开发 | - | - |
| 消息通信 | ⏳ 待开发 | - | - |
| Checkpoint | ⏳ 待开发 | - | - |
| 统计分析 | ⏳ 待开发 | - | - |

---

## 📚 参考文档

- [POC 最终报告](../../../../../docs/architecture/backtrader-migration/POC_FINAL_REPORT.md)
- [任务拆分文档](../../../../../docs/architecture/backtrader-migration/DEVELOPMENT_TASK_BREAKDOWN.md)
- [开发启动指南](../../../../../docs/architecture/backtrader-migration/DEVELOPMENT_KICKOFF.md)

---

**维护人**: Backend Team  
**最后更新**: 2025-11-21

