# Backtest Worker - Backtrader 集成

**版本**: 2.0.0  
**状态**: 开发中（Phase 1）  
**引擎**: Backtrader  
**语言**: Python 3.11+

---

## 📖 简介

Backtest Worker 是一个基于 **Backtrader** 的回测执行服务，负责：
- 接收来自 Backend 的回测任务（通过 RabbitMQ）
- 使用 Backtrader 执行回测
- 收集交易因子和统计指标
- 上报进度和结果

**与旧版本的区别**:
- ✅ 使用 Backtrader 替代自研引擎
- ✅ Python 实现（替代 TypeScript）
- ✅ 性能提升 13x
- ✅ 更强大的策略支持

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────┐
│                     Backend (NestJS)                     │
│                  任务管理 & 状态跟踪                       │
└──────────────────────┬──────────────────────────────────┘
                       │ RabbitMQ
                       │ (6 个队列)
┌──────────────────────┴──────────────────────────────────┐
│              Backtest Worker (Python + Backtrader)       │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Backtrader Integration                            │ │
│  │  ├─ Data Loading (DuckDB + Parquet + LRU Cache)  │ │
│  │  ├─ Strategy Execution                            │ │
│  │  ├─ Factor Collection                             │ │
│  │  ├─ Messaging (RabbitMQ)                          │ │
│  │  ├─ Checkpoint (断点续跑)                          │ │
│  │  └─ Analytics (统计分析)                           │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
              共享存储 (Parquet 文件)
```

---

## 📁 目录结构

```
backtest-worker/
├── src/
│   ├── backtrader_integration/    # Backtrader 集成模块
│   │   ├── data/                  # ✅ 数据加载（完成）
│   │   │   ├── __init__.py
│   │   │   └── cached_datafeed.py
│   │   ├── factors/               # ✅ 因子收集（完成）
│   │   │   ├── __init__.py
│   │   │   └── factor_collector.py
│   │   ├── strategy/              # ✅ 策略执行（完成）
│   │   │   ├── __init__.py
│   │   │   ├── base_strategy.py
│   │   │   └── ma_cross_strategy.py
│   │   ├── messaging/             # ✅ 消息通信（完成）
│   │   │   ├── __init__.py
│   │   │   ├── rabbitmq_client.py
│   │   │   └── progress_tracker.py
│   │   ├── checkpoint/            # ⏳ Checkpoint（待开发）
│   │   ├── analytics/             # ⏳ 统计分析（待开发）
│   │   ├── utils/                 # ⏳ 工具（待开发）
│   │   └── README.md
│   └── config/                    # 配置文件
│       └── worker.config.ts
├── scripts/                       # 启动脚本
│   ├── start-workers.sh
│   └── stop-workers.sh
├── tests/                         # 单元测试
│   └── test_integration.py        # ✅ 集成测试
├── package.json
├── tsconfig.json
├── CHANGELOG.md                   # 更新日志
├── CLEANUP_REPORT.md              # 清理报告
└── README.md                      # 本文件
```

---

## 🚀 快速开始

### 环境要求

- Python 3.11+
- pip or conda
- PostgreSQL 14+
- RabbitMQ 3.11+

### 安装依赖

```bash
# 创建 Python 虚拟环境
python3.11 -m venv venv

# 激活虚拟环境
source venv/bin/activate  # macOS/Linux
# 或
venv\Scripts\activate  # Windows

# 安装依赖
pip install backtrader pandas pyarrow duckdb pika
```

### 配置

1. **配置 RabbitMQ**
   ```bash
   # 确保 RabbitMQ 运行在 localhost:5672
   # vhost: /backtest
   # user: dev / password: devpass
   ```

2. **配置数据路径**
   ```python
   # src/config/backtrader_config.py
   DATA_BASE_PATH = '/path/to/datasets'
   ```

### 运行

```bash
# 开发环境
python src/main.py

# 生产环境（使用 PM2）
pm2 start pm2.config.js
```

---

## 📊 已完成模块

### 1. 数据加载模块 ✅

**文件**: `src/backtrader_integration/data/cached_datafeed.py`

**功能**:
- DuckDB + Parquet 数据读取
- LRU 缓存（2GB 容量）
- 数据聚合（1秒 → 1分钟/5分钟/1小时/1天）
- 按天分区读取

**使用示例**:
```python
from backtrader_integration.data import CachedParquetDataFeed

data = CachedParquetDataFeed(
    symbol='ES',
    start_date='2023-01-01',
    end_date='2023-12-31',
    aggregate_timeframe='1min',
)
cerebro.adddata(data)
```

### 2. 因子收集模块 ✅

**文件**: `src/backtrader_integration/factors/factor_collector.py`

**功能**:
- 入场因子收集
- 持仓因子收集
- 出场因子收集
- 支持自定义因子
- 导出到 Parquet

**使用示例**:
```python
from backtrader_integration.factors import FactorCollector

cerebro.addobserver(FactorCollector)

# 在策略中
self.factor_collector = self.getobserver(FactorCollector)
self.factor_collector.record_entry_factors(
    order=order,
    price=price,
    size=size,
    commission=commission,
    # 自定义因子
    sma_fast=self.sma_fast[0],
    sma_slow=self.sma_slow[0],
)
```

### 3. 策略执行模块 ✅

**文件**: `src/backtrader_integration/strategy/base_strategy.py`

**功能**:
- BaseStrategy 策略基类
- StrategyFactory 策略工厂
- StrategyValidator 策略验证器
- 统一的因子收集接口
- 统一的订单管理

**使用示例**:
```python
from backtrader_integration.strategy import StrategyFactory

# 列出所有策略
strategies = StrategyFactory.list_strategies()

# 创建策略
strategy_class, params = StrategyFactory.create(
    'ma_cross',
    sma_fast_period=10,
    sma_slow_period=30,
)

# 添加到 Cerebro
cerebro.addstrategy(strategy_class, **params)

# 或者使用便捷方法
StrategyFactory.add_to_cerebro(
    cerebro,
    'ma_cross',
    sma_fast_period=10,
    sma_slow_period=30,
)
```

### 4. 消息通信模块 ✅

**文件**: `src/backtrader_integration/messaging/rabbitmq_client.py`

**功能**:
- RabbitMQClient 消息客户端
- MessageConsumer 消息消费者
- ProgressTracker 进度追踪器
- HeartbeatSender 心跳发送器
- 6 种消息类型支持

**使用示例**:
```python
from backtrader_integration.messaging import (
    RabbitMQClient,
    RabbitMQConfig,
    ProgressTracker,
)

# 创建客户端
config = RabbitMQConfig(host='localhost', port=5672)
client = RabbitMQClient(config)

# 发送进度
client.send_progress(
    task_id='task_123',
    progress=50.0,
    message='Processing...',
)

# 添加进度追踪器
progress_tracker = cerebro.addobserver(
    ProgressTracker,
    report_interval=100,
    task_id='task_123',
)
progress_tracker.set_message_client(client)
```

---

## 🧪 测试

### 运行测试

```bash
# 待创建
pytest tests/
```

### 测试覆盖率

目标: > 80%

---

## 📚 文档

### 项目文档

- **[模块 README](./src/backtrader-integration/README.md)** - 模块详细说明
- **[CHANGELOG](./CHANGELOG.md)** - 更新日志
- **[CLEANUP_REPORT](./CLEANUP_REPORT.md)** - 旧代码清理报告

### 迁移文档

- **[POC 最终报告](../docs/architecture/backtrader-migration/POC_FINAL_REPORT.md)**
- **[开发任务拆分](../docs/architecture/backtrader-migration/DEVELOPMENT_TASK_BREAKDOWN.md)**
- **[开发启动指南](../docs/architecture/backtrader-migration/DEVELOPMENT_KICKOFF.md)**

---

## 🔧 开发

### 开发环境

```bash
# 激活虚拟环境
source venv/bin/activate

# 安装开发依赖
pip install pytest pytest-cov black flake8

# 代码格式化
black src/

# 代码检查
flake8 src/
```

### 代码规范

- **格式化**: Black
- **检查**: Flake8
- **类型检查**: mypy（可选）
- **文档**: Google Style Docstrings

---

## 📈 性能

### POC 测试结果

- **回测速度**: 13,198 bars/秒（13.2x 目标）
- **缓存加速**: 10.2x
- **消息延迟**: 0.14ms

详见: [POC 最终报告](../docs/architecture/backtrader-migration/POC_FINAL_REPORT.md)

---

## 🚨 重要变更

### v2.0.0 (2025-11-21)

**破坏性变更**: 完全替换为 Backtrader

- ✅ 移除所有旧的自研引擎代码
- ✅ 使用 Backtrader 替代
- ✅ Python 替代 TypeScript
- ✅ 性能提升 13x

详见: [CHANGELOG](./CHANGELOG.md)

---

## 👥 团队

- **Backend Team** - 开发和维护
- **QA Team** - 测试
- **DevOps Team** - 部署和运维

---

## 📞 联系方式

- **项目经理**: 待定
- **技术负责人**: 待定
- **问题反馈**: 项目群 / GitHub Issues

---

## 📄 许可证

内部项目 - 所有权归公司所有

---

**最后更新**: 2025-11-21  
**版本**: 2.0.0-dev  
**状态**: 开发中

