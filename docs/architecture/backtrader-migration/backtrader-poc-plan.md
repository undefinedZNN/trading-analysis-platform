# Backtrader POC 计划

**状态**: 准备启动  
**时间**: 1-2 周  
**目标**: 验证技术可行性，为正式开发提供依据

---

## ✅ 已确认的技术决策

| 决策点 | 方案 | 状态 |
|--------|------|------|
| 动态策略 | 改用 Python | ✅ 已确认 |
| 通信方式 | RabbitMQ | ✅ 已确认 |
| 因子系统 | 统一插件 | ✅ 已确认 |
| 数据格式 | 继续 Parquet | ✅ 已确认 |
| 前端编辑器 | Monaco Editor | ✅ 已确认 |
| 部署方式 | 微服务架构 | ✅ 已确认 |

**决策确认时间**: 2025-11-20  
**可以开始 POC**: ✅ 是

---

## 🎯 POC 目标

### 必须验证的问题

1. **Backtrader 能否读取我们的 Parquet 数据？**
   - 验证数据格式兼容性
   - 验证数据完整性
   - 测试读取性能

2. **RabbitMQ 通信是否流畅？**
   - NestJS → RabbitMQ → Python
   - 消息序列化/反序列化
   - 错误处理

3. **性能是否可接受？**
   - 与现有 TypeScript 引擎对比
   - 回测速度
   - 内存占用

4. **因子收集方案是否可行？**
   - Backtrader Observer 机制
   - 因子数据记录
   - 结果序列化

5. **Python 策略编写体验如何？**
   - API 复杂度
   - 调试便利性
   - 文档完善度

### 成功标准

POC 成功的条件：

- ✅ 能成功读取 Parquet 数据
- ✅ Backtrader 能正常运行回测
- ✅ RabbitMQ 通信正常
- ✅ 回测结果正确（与原引擎对比误差 < 1%）
- ✅ 性能可接受（不低于原引擎 70%）
- ✅ 因子收集方案可行
- ✅ 无重大技术阻碍

### 失败标准

如果出现以下情况，POC 失败：

- ❌ Parquet 数据无法正确读取
- ❌ 回测结果误差太大（> 5%）
- ❌ 性能严重下降（< 50%）
- ❌ 存在无法解决的技术问题

---

## 📋 POC 任务清单

### Phase 1: 环境搭建 (1-2 天)

#### 任务 1.1: Python 开发环境
- [ ] 安装 Python 3.11
- [ ] 安装 Backtrader: `pip install backtrader`
- [ ] 安装 PyArrow: `pip install pyarrow`
- [ ] 安装 Pandas: `pip install pandas`
- [ ] 安装 RabbitMQ Client: `pip install pika`
- [ ] 验证环境正常

#### 任务 1.2: RabbitMQ 环境
- [ ] 确认现有 RabbitMQ 可用
- [ ] 创建测试队列
- [ ] 测试基本消息发送/接收

#### 任务 1.3: 测试数据准备
- [ ] 选择一个小数据集（如 1000 条 K 线）
- [ ] 验证数据格式
- [ ] 准备预期结果（使用现有引擎运行）

**交付**: 环境准备完毕，可以开始编码

---

### Phase 2: 核心功能验证 (3-4 天)

#### 任务 2.1: Parquet DataFeed 实现

**目标**: 验证 Backtrader 能读取 Parquet

```python
# poc/parquet_feed.py
import backtrader as bt
import pandas as pd
import pyarrow.parquet as pq

class ParquetDataFeed(bt.feeds.DataBase):
    """Parquet 数据源适配器"""
    
    params = (
        ('dataname', None),
        ('datetime_col', 'timestamp'),
        ('open_col', 'open'),
        ('high_col', 'high'),
        ('low_col', 'low'),
        ('close_col', 'close'),
        ('volume_col', 'volume'),
    )
    
    def __init__(self):
        super().__init__()
        # 读取 Parquet
        table = pq.read_table(self.p.dataname)
        self.df = table.to_pandas()
        self.df[self.p.datetime_col] = pd.to_datetime(self.df[self.p.datetime_col])
        self.df = self.df.sort_values(self.p.datetime_col).reset_index(drop=True)
        self._idx = 0
    
    def _load(self):
        if self._idx >= len(self.df):
            return False
        
        row = self.df.iloc[self._idx]
        self.lines.datetime[0] = bt.date2num(row[self.p.datetime_col])
        self.lines.open[0] = float(row[self.p.open_col])
        self.lines.high[0] = float(row[self.p.high_col])
        self.lines.low[0] = float(row[self.p.low_col])
        self.lines.close[0] = float(row[self.p.close_col])
        self.lines.volume[0] = float(row.get(self.p.volume_col, 0))
        self.lines.openinterest[0] = 0
        
        self._idx += 1
        return True
```

**验证步骤**:
- [ ] 读取测试 Parquet 文件
- [ ] 验证数据加载正确
- [ ] 打印前 10 条数据检查
- [ ] 测量读取耗时

**成功标准**: 数据正确加载，无报错

---

#### 任务 2.2: 简单策略实现

**目标**: 验证 Backtrader 基本功能

```python
# poc/simple_strategy.py
import backtrader as bt

class SimpleMACross(bt.Strategy):
    """简单的均线交叉策略"""
    
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
    )
    
    def __init__(self):
        self.sma_fast = bt.indicators.SMA(self.data.close, period=self.p.fast_period)
        self.sma_slow = bt.indicators.SMA(self.data.close, period=self.p.slow_period)
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
        self.trades = []
    
    def next(self):
        if not self.position:
            if self.crossover > 0:
                self.buy()
        elif self.crossover < 0:
            self.close()
    
    def notify_order(self, order):
        if order.status in [order.Completed]:
            self.trades.append({
                'date': self.data.datetime.date(0),
                'type': 'BUY' if order.isbuy() else 'SELL',
                'price': order.executed.price,
                'size': order.executed.size,
            })
```

**验证步骤**:
- [ ] 运行策略
- [ ] 检查交易记录
- [ ] 计算收益率
- [ ] 与原引擎结果对比

**成功标准**: 策略运行正常，结果合理

---

#### 任务 2.3: 完整回测脚本

```python
# poc/run_backtest.py
import backtrader as bt
from parquet_feed import ParquetDataFeed
from simple_strategy import SimpleMACross

def run_backtest(data_path, initial_cash=10000):
    # 创建 Cerebro
    cerebro = bt.Cerebro()
    
    # 加载数据
    data = ParquetDataFeed(dataname=data_path)
    cerebro.adddata(data)
    
    # 添加策略
    cerebro.addstrategy(SimpleMACross)
    
    # 设置资金
    cerebro.broker.setcash(initial_cash)
    
    # 设置手续费
    cerebro.broker.setcommission(commission=0.001)
    
    # 添加分析器
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name='trades')
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name='drawdown')
    cerebro.addanalyzer(bt.analyzers.Returns, _name='returns')
    
    # 运行
    print(f'Initial Portfolio Value: {cerebro.broker.getvalue():.2f}')
    results = cerebro.run()
    print(f'Final Portfolio Value: {cerebro.broker.getvalue():.2f}')
    
    # 打印结果
    strategy = results[0]
    trades = strategy.analyzers.trades.get_analysis()
    drawdown = strategy.analyzers.drawdown.get_analysis()
    returns = strategy.analyzers.returns.get_analysis()
    
    print('\n=== Backtest Results ===')
    print(f"Total Trades: {trades.total.total if hasattr(trades, 'total') else 0}")
    print(f"Max Drawdown: {drawdown.max.drawdown:.2f}%")
    print(f"Total Return: {returns.rtot:.2%}")
    
    return results

if __name__ == '__main__':
    # 测试数据路径
    data_path = '/path/to/test/data.parquet'
    run_backtest(data_path)
```

**验证步骤**:
- [ ] 使用真实 Parquet 数据运行
- [ ] 记录运行时间
- [ ] 记录内存占用
- [ ] 记录结果指标

---

#### 任务 2.4: 因子收集验证

```python
# poc/factor_collector.py
import backtrader as bt

class FactorCollector(bt.Observer):
    """因子收集器"""
    
    lines = ('factor_data',)
    
    def __init__(self):
        self.factors = []
    
    def next(self):
        # 收集因子（示例）
        factor_snapshot = {
            'datetime': self.data.datetime.datetime(0),
            'close': self.data.close[0],
            'sma_fast': self._parent.sma_fast[0] if hasattr(self._parent, 'sma_fast') else None,
            'sma_slow': self._parent.sma_slow[0] if hasattr(self._parent, 'sma_slow') else None,
        }
        self.factors.append(factor_snapshot)
    
    def get_factors(self):
        return self.factors
```

**验证步骤**:
- [ ] 在策略中添加 FactorCollector
- [ ] 运行回测
- [ ] 检查因子数据是否正确收集
- [ ] 验证数据完整性

---

### Phase 3: RabbitMQ 集成测试 (2 天)

#### 任务 3.1: Python Consumer

```python
# poc/rabbitmq_consumer.py
import pika
import json
from run_backtest import run_backtest

def callback(ch, method, properties, body):
    """处理回测任务"""
    try:
        task = json.loads(body)
        print(f"Received task: {task['task_id']}")
        
        # 运行回测
        results = run_backtest(
            data_path=task['data_path'],
            initial_cash=task['initial_cash']
        )
        
        # 发布结果（简化版）
        result = {
            'task_id': task['task_id'],
            'status': 'completed',
            'final_value': results[0].broker.getvalue()
        }
        
        ch.basic_publish(
            exchange='',
            routing_key='backtest.result',
            body=json.dumps(result)
        )
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
        print(f"Task {task['task_id']} completed")
        
    except Exception as e:
        print(f"Error: {e}")
        ch.basic_nack(delivery_tag=method.delivery_tag)

def main():
    # 连接 RabbitMQ
    connection = pika.BlockingConnection(
        pika.ConnectionParameters('localhost')
    )
    channel = connection.channel()
    
    # 声明队列
    channel.queue_declare(queue='backtest.task', durable=True)
    channel.queue_declare(queue='backtest.result', durable=True)
    
    # 开始消费
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(
        queue='backtest.task',
        on_message_callback=callback
    )
    
    print('Waiting for tasks...')
    channel.start_consuming()

if __name__ == '__main__':
    main()
```

**验证步骤**:
- [ ] 启动 Consumer
- [ ] 手动发送测试消息
- [ ] 验证消息正确处理
- [ ] 验证结果正确返回

---

#### 任务 3.2: NestJS Publisher (简化测试)

```typescript
// poc/test-publisher.ts
import * as amqp from 'amqplib';

async function publishTask() {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  
  await channel.assertQueue('backtest.task', { durable: true });
  await channel.assertQueue('backtest.result', { durable: true });
  
  const task = {
    task_id: 'test-001',
    data_path: '/path/to/test/data.parquet',
    initial_cash: 10000,
  };
  
  channel.sendToQueue(
    'backtest.task',
    Buffer.from(JSON.stringify(task)),
    { persistent: true }
  );
  
  console.log('Task sent:', task.task_id);
  
  // 监听结果
  channel.consume('backtest.result', (msg) => {
    if (msg) {
      const result = JSON.parse(msg.content.toString());
      console.log('Result received:', result);
      channel.ack(msg);
    }
  });
}

publishTask();
```

**验证步骤**:
- [ ] 从 NestJS 发送任务
- [ ] Python Worker 接收并处理
- [ ] NestJS 接收结果
- [ ] 验证端到端流程

---

### Phase 4: 性能测试与对比 (1-2 天)

#### 任务 4.1: 性能基准测试

**测试场景**:

| 场景 | 数据量 | 策略复杂度 |
|------|--------|-----------|
| 小数据集 | 1,000 条 | 简单 |
| 中数据集 | 10,000 条 | 中等 |
| 大数据集 | 100,000 条 | 复杂 |

**测试指标**:
- 回测总耗时
- 内存峰值
- CPU 占用
- 吞吐量（K 线/秒）

**对比测试**:
```bash
# 运行现有 TypeScript 引擎
npm run backtest -- --data test.parquet

# 运行 Backtrader POC
python poc/run_backtest.py test.parquet

# 对比结果
```

#### 任务 4.2: 结果准确性验证

**验证方法**:
- [ ] 使用相同数据和策略
- [ ] 对比交易次数
- [ ] 对比最终收益
- [ ] 对比最大回撤
- [ ] 误差分析

**可接受误差**:
- 交易次数: ±0（完全一致）
- 收益率: ±1%
- 最大回撤: ±1%

---

## 📊 POC 评估报告模板

### 执行摘要

- **POC 时间**: _________
- **执行人**: _________
- **总体结论**: ✅ 成功 / ❌ 失败 / ⚠️ 有条件成功

### 技术可行性

| 验证项 | 结果 | 说明 |
|--------|------|------|
| Parquet 读取 | ✅/❌ | |
| Backtrader 运行 | ✅/❌ | |
| RabbitMQ 通信 | ✅/❌ | |
| 因子收集 | ✅/❌ | |
| 结果准确性 | ✅/❌ | 误差: ___% |

### 性能对比

| 指标 | TypeScript 引擎 | Backtrader | 差异 |
|------|----------------|-----------|------|
| 小数据集耗时 | ___ ms | ___ ms | ___% |
| 中数据集耗时 | ___ s | ___ s | ___% |
| 大数据集耗时 | ___ s | ___ s | ___% |
| 内存占用 | ___ MB | ___ MB | ___% |

### 发现的问题

1. **严重问题** (阻碍性):
   - [ ] 问题 1: _________________
   - [ ] 问题 2: _________________

2. **中等问题** (需要解决):
   - [ ] 问题 1: _________________
   - [ ] 问题 2: _________________

3. **小问题** (可以接受):
   - [ ] 问题 1: _________________
   - [ ] 问题 2: _________________

### 风险评估

| 风险 | 等级 | 应对措施 |
|------|------|---------|
| 性能不达标 | 🔴/🟡/🟢 | |
| 准确性问题 | 🔴/🟡/🟢 | |
| 集成复杂 | 🔴/🟡/🟢 | |

### 建议

- [ ] **建议 1**: 继续正式开发
- [ ] **建议 2**: 调整方案后再试
- [ ] **建议 3**: 放弃 Backtrader 方案
- [ ] **其他建议**: _________________

### Go/No-Go 决策

- [ ] ✅ **GO** - 进入正式开发
- [ ] ❌ **NO-GO** - 重新评估方案
- [ ] ⚠️ **有条件 GO** - 需要满足条件: _________

**签字**: _________________  
**日期**: _________________

---

## 📅 POC 时间表

### Week 1

| 日期 | 任务 | 负责人 | 状态 |
|------|------|--------|------|
| Day 1 | 环境搭建 | | ⏳ |
| Day 2 | Parquet DataFeed | | ⏳ |
| Day 3 | 简单策略实现 | | ⏳ |
| Day 4 | 完整回测脚本 | | ⏳ |
| Day 5 | 因子收集验证 | | ⏳ |

### Week 2

| 日期 | 任务 | 负责人 | 状态 |
|------|------|--------|------|
| Day 1 | RabbitMQ Consumer | | ⏳ |
| Day 2 | 端到端测试 | | ⏳ |
| Day 3 | 性能测试 | | ⏳ |
| Day 4 | 准确性验证 | | ⏳ |
| Day 5 | 编写 POC 报告 | | ⏳ |

---

## ✅ POC 启动检查清单

在开始 POC 前，确认以下事项：

### 资源准备

- [ ] 开发人员已分配（1 人，全职 1-2 周）
- [ ] 开发环境已准备
- [ ] 测试数据已准备
- [ ] RabbitMQ 可用

### 目标明确

- [ ] POC 目标已清晰
- [ ] 成功/失败标准已定义
- [ ] 评估指标已确定

### 风险识别

- [ ] 已识别关键风险
- [ ] 已准备应对措施
- [ ] 有 Plan B

### 决策流程

- [ ] 知道 POC 后如何决策
- [ ] 明确 Go/No-Go 标准
- [ ] 决策人已确定

---

## 🚀 POC 启动命令

当所有准备就绪，执行以下命令启动 POC：

```bash
# 1. 创建 POC 目录
mkdir -p poc/backtrader-poc
cd poc/backtrader-poc

# 2. 创建 Python 虚拟环境
python3.11 -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows

# 3. 安装依赖
pip install backtrader pandas pyarrow pika

# 4. 创建文件结构
mkdir -p {data,results,logs}
touch {parquet_feed,simple_strategy,run_backtest,factor_collector,rabbitmq_consumer}.py

# 5. 开始编码！
```

---

## 📝 POC 日志模板

### 日期: ___________

**今日任务**:
- [ ] 任务 1
- [ ] 任务 2

**完成情况**:
- ✅ 已完成: _________
- ⏳ 进行中: _________
- ❌ 遇到问题: _________

**发现**:
- 发现 1: _________
- 发现 2: _________

**明日计划**:
- [ ] 任务 1
- [ ] 任务 2

---

**当前状态**: 准备就绪，等待启动  
**下一步**: POC 启动 (开发人员分配后)

