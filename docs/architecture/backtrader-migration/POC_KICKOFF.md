# Backtrader POC 启动指南

**创建时间**: 2025-11-21  
**状态**: ✅ 前置任务已完成，可以启动 POC  
**预计耗时**: 2-3 周

---

## ✅ 前置任务完成确认

### 代码修改已完成 ✅

**文件**: `backend/src/backtesting/strategies/strategies.service.ts`  
**修改内容**: `updateScriptVersion` 方法  
**变更说明**:
- ✅ 每次编辑策略代码时，自动创建新版本（不再 UPDATE 现有版本）
- ✅ 强制要求填写版本说明（remark 字段）
- ✅ 仅修改元数据（remark、versionName）时，仍然使用 UPDATE 逻辑
- ✅ 新版本名自动生成

---

## 🎯 POC 目标（已根据决策更新）

### 核心验证目标

1. ✅ **Backtrader 引擎集成**
   - 验证 Backtrader 能正确读取 Parquet 数据
   - 验证策略执行逻辑正确

2. ✅ **内存缓存方案** 🆕
   - 实现 LRU 缓存（2GB 容量）
   - 验证参数优化场景缓存命中率 > 95%
   - 验证性能提升 > 20 倍

3. ✅ **断点续跑方案** 🆕
   - 实现 Checkpoint 保存/恢复（每 1000 根 K 线）
   - 验证 Worker 崩溃后能从 Checkpoint 恢复
   - 验证 Checkpoint 开销 < 5%

4. ✅ **RabbitMQ 通信**
   - 验证 6 个队列的消息流转
   - 验证进度上报机制
   - 验证心跳检测（60秒超时）

5. ✅ **性能基准测试**
   - 单次回测性能 ≥ 70% 原引擎
   - 参数优化性能提升 > 20 倍（缓存后）

6. ✅ **结果准确性验证**
   - 与原引擎对比，误差 < 1%

7. ✅ **因子收集方案**
   - 验证内置因子自动固化
   - 验证自定义因子动态更新

8. ✅ **K 线图交易点位标注** 🆕
   - 验证多次加仓/减仓的清晰标注
   - 验证前端因子过滤器

---

## 📅 POC 详细计划（3 周）

### Week 1 - 基础功能（Day 1-5）

#### Day 1: 环境搭建
- [ ] 安装 Python 3.11+
- [ ] 安装 Backtrader: `pip install backtrader`
- [ ] 安装 PyArrow: `pip install pyarrow pandas`
- [ ] 安装 RabbitMQ 客户端: `pip install pika`
- [ ] 确认 RabbitMQ 服务运行正常
- [ ] 准备测试数据（ES 1分钟数据，1年）

#### Day 2: Parquet DataFeed + 内存缓存 🆕
- [ ] 实现 `ParquetDataFeed` 类（使用 DuckDB 读取）
- [ ] **实现 LRU 内存缓存**（2GB 容量限制）
- [ ] 测试缓存命中率
- [ ] 测试缓存淘汰策略

**代码骨架**：
```python
class LRUCache:
    def __init__(self, capacity_mb=2048):
        self.capacity_mb = capacity_mb
        self.cache = OrderedDict()
        self.current_size_mb = 0
    
    def get(self, key):
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)
        return self.cache[key]['data']
    
    def put(self, key, value):
        # 计算大小、淘汰逻辑
        pass

class CachedParquetDataFeed(bt.DataBase):
    _cache = LRUCache(capacity_mb=2048)
    
    def start(self):
        cache_key = f"{self.symbol}_{self.start_date}_{self.end_date}"
        
        # 从缓存获取
        cached_data = self._cache.get(cache_key)
        if cached_data is not None:
            self.data = cached_data
            print(f"🎯 Cache hit: {cache_key}")
        else:
            # 读取数据
            self.data = self._load_from_parquet()
            # 写入缓存
            self._cache.put(cache_key, self.data)
            print(f"✅ Cached: {cache_key}")
```

#### Day 3: 简单策略实现 + 因子收集
- [ ] 实现简单的 MA 双均线策略
- [ ] 实现因子收集插件（Observer）
- [ ] 测试因子固化逻辑
- [ ] 验证 Parquet 结果文件

#### Day 4: 完整回测脚本
- [ ] 实现完整的回测执行流程
- [ ] 实现进度计算和上报
- [ ] 生成统计指标（总收益、夏普、最大回撤等）
- [ ] 导出 trades.parquet 和 result.json

#### Day 5: 断点续跑实现 🆕
- [ ] **实现 Checkpoint 保存逻辑**（每 1000 根 K 线）
- [ ] **实现 Checkpoint 恢复逻辑**
- [ ] 测试断点续跑功能
- [ ] 测试 Checkpoint 性能开销

**代码骨架**：
```python
def run_backtest_with_checkpointing(task):
    checkpoint_dir = f'/data/backtests/{task_id}/checkpoints'
    
    # 检查是否有 Checkpoint
    checkpoint = load_checkpoint(checkpoint_dir)
    
    if checkpoint:
        print(f"🔄 Resuming from checkpoint: {checkpoint['datetime']}")
        cerebro = restore_cerebro_state(checkpoint)
        start_idx = checkpoint['data_index']
    else:
        print(f"🚀 Starting new backtest")
        cerebro = init_cerebro(task)
        start_idx = 0
    
    # 执行回测，定期保存 Checkpoint
    for idx in range(start_idx, total_bars):
        cerebro.next()
        
        if idx % 1000 == 0:  # 每 1000 根 K 线
            save_checkpoint(checkpoint_dir, {
                'datetime': cerebro.datetime.datetime(),
                'data_index': idx,
                'account_value': cerebro.broker.getvalue(),
                'positions': cerebro.broker.positions,
                'trades': cerebro.trades,
            })
```

---

### Week 2 - 集成和测试（Day 6-10）

#### Day 6: RabbitMQ Consumer
- [ ] 实现 RabbitMQ 任务消费
- [ ] 实现 6 个队列的消息发送
- [ ] 实现心跳机制（30秒一次）
- [ ] 测试消息流转

#### Day 7: 端到端集成测试
- [ ] Backend 提交任务
- [ ] Worker 消费任务并执行
- [ ] 进度实时上报（每 1%）
- [ ] 结果返回到 Backend
- [ ] 前端展示结果

#### Day 8: 参数优化测试（验证缓存效果） 🆕
- [ ] 实现参数优化功能（50 组参数）
- [ ] **测试缓存命中率**（预期 > 95%）
- [ ] **测试性能提升**（预期 > 20 倍）
- [ ] 记录缓存统计数据

**测试场景**：
```python
# 参数优化测试
params_grid = [
    {'fast_ma': 5, 'slow_ma': 20},
    {'fast_ma': 10, 'slow_ma': 20},
    {'fast_ma': 15, 'slow_ma': 30},
    # ... 共 50 组参数
]

# 预期结果：
# - 第 1 次：读取数据 + 缓存（3 秒）
# - 第 2-50 次：从缓存读取（0.05 秒/次）
# - 总耗时：约 5.5 秒（vs 无缓存 150 秒）
```

#### Day 9: 性能基准测试 + 准确性验证
- [ ] 单次回测性能测试（小/中/大数据集）
- [ ] 与原引擎性能对比（≥ 70%）
- [ ] 与原引擎结果对比（误差 < 1%）
- [ ] 记录性能数据

#### Day 10: Worker 崩溃测试（验证断点续跑） 🆕
- [ ] **模拟 Worker 崩溃**（回测进行到 50% 时强制终止）
- [ ] **重启 Worker，验证从 Checkpoint 恢复**
- [ ] **验证恢复后结果的一致性**
- [ ] 测试 Checkpoint 性能开销（< 5%）

**测试场景**：
```bash
# 1. 启动回测任务（100 万根 K 线）
# 2. 进度到 50% 时，强制 kill Worker 进程
# 3. 重启 Worker
# 4. 验证任务从最近的 Checkpoint 恢复（约 50% 位置）
# 5. 对比完整运行的结果，验证一致性
```

---

### Week 3 - 可视化和收尾（Day 11-15）

#### Day 11-12: K 线图交易点位标注 🆕
- [ ] **实现 K 线图数据导出**（OHLCV + 交易点位）
- [ ] **前端 ECharts 实现**：
  - K 线图
  - 成交量柱状图
  - 多次加仓/减仓标注（不同颜色和大小）
- [ ] 测试多次加仓/减仓场景

**数据格式**：
```json
{
  "ohlcv": [
    ["2023-01-01", 100, 105, 99, 103, 1000000],
    ["2023-01-02", 103, 108, 102, 107, 1200000]
  ],
  "trades": [
    {"datetime": "2023-01-01 10:00", "type": "buy", "size": 100, "price": 103},
    {"datetime": "2023-01-01 14:00", "type": "buy", "size": 50, "price": 105},  // 加仓
    {"datetime": "2023-01-02 11:00", "type": "sell", "size": 80, "price": 110}, // 部分止盈
    {"datetime": "2023-01-02 15:00", "type": "sell", "size": 70, "price": 108}  // 剩余止盈
  ]
}
```

#### Day 13: 前端因子过滤器集成
- [ ] 实现因子过滤器组件
- [ ] 实时筛选交易记录
- [ ] 动态更新统计指标
- [ ] 测试过滤功能

#### Day 14: 完整端到端测试
- [ ] 完整流程测试（创建策略 → 回测 → 查看结果 → 因子筛选）
- [ ] 测试异常场景（Worker 崩溃、超时、网络中断等）
- [ ] 测试边界情况
- [ ] 记录所有问题

#### Day 15: 编写 POC 报告
- [ ] 总结测试结果
- [ ] 性能数据汇总
- [ ] 准确性验证报告
- [ ] 问题和风险清单
- [ ] Go/No-Go 决策建议

---

## 📊 POC 成功标准

### 必须达标（Go 的前提）

| 指标 | 目标 | 测试方法 |
|------|------|---------|
| **Parquet 读取** | 正常工作 | 读取测试数据并验证 |
| **结果准确性** | 误差 < 1% | 与原引擎对比 |
| **单次回测性能** | ≥ 70% 原引擎 | 性能基准测试 |
| **RabbitMQ 通信** | 正常流转 | 端到端测试 |
| **因子收集** | 正常工作 | 验证 trades.parquet |

### 新增功能验证 🆕

| 指标 | 目标 | 测试方法 |
|------|------|---------|
| **缓存命中率** | > 95% | 参数优化测试 |
| **缓存性能提升** | > 20 倍 | 参数优化性能对比 |
| **断点续跑** | 正常工作 | Worker 崩溃测试 |
| **Checkpoint 开销** | < 5% | 性能对比测试 |
| **K 线图标注** | 清晰可用 | 手工验证 |

### 整体评估

- ✅ 无重大技术阻碍
- ✅ 性能可接受
- ✅ 功能完整可用

---

## 🗂️ 测试数据准备

### 小数据集（Day 1-5）
- **品种**: ES (E-mini S&P 500)
- **周期**: 1 分钟
- **时间范围**: 1 个月
- **K 线数**: ~9,000 根
- **文件大小**: ~2 MB
- **用途**: 快速功能验证

### 中数据集（Day 6-10）
- **品种**: ES
- **周期**: 1 分钟
- **时间范围**: 1 年
- **K 线数**: ~100,000 根
- **文件大小**: ~20 MB
- **用途**: 性能测试、缓存测试

### 大数据集（Day 11-15）
- **品种**: BTC
- **周期**: 1 分钟
- **时间范围**: 3 年
- **K 线数**: ~1,500,000 根
- **文件大小**: ~300 MB
- **用途**: 压力测试、断点续跑测试

---

## 📝 POC 报告模板

### 1. 执行摘要
- POC 目标
- 测试结果概述
- Go/No-Go 建议

### 2. 功能验证
- Backtrader 引擎集成 ✅ / ❌
- 内存缓存方案 ✅ / ❌ 🆕
- 断点续跑方案 ✅ / ❌ 🆕
- RabbitMQ 通信 ✅ / ❌
- 因子收集方案 ✅ / ❌
- K 线图标注 ✅ / ❌ 🆕

### 3. 性能测试结果

| 场景 | 原引擎 | Backtrader | 性能比 | 是否达标 |
|------|--------|-----------|--------|---------|
| 单次回测（小） | 1s | ?s | ?% | ? |
| 单次回测（中） | 10s | ?s | ?% | ? |
| 单次回测（大） | 100s | ?s | ?% | ? |
| 参数优化（无缓存） | 150s | ?s | ?% | ? |
| **参数优化（有缓存）** 🆕 | 150s | ?s | ?% | ? |

### 4. 准确性验证

| 指标 | 原引擎 | Backtrader | 误差 | 是否达标 |
|------|--------|-----------|------|---------|
| 总收益 | 15.5% | ?% | ?% | ? |
| 夏普比率 | 1.5 | ? | ?% | ? |
| 最大回撤 | -8.0% | ?% | ?% | ? |
| 交易次数 | 50 | ? | ? | ? |

### 5. 新增功能验证 🆕

#### 5.1 缓存性能测试
- 缓存命中率：?%（目标 > 95%）
- 性能提升：?倍（目标 > 20 倍）
- 内存使用：? MB / 2048 MB

#### 5.2 断点续跑测试
- 崩溃恢复：✅ / ❌
- 结果一致性：误差 ?%
- Checkpoint 开销：?%（目标 < 5%）

#### 5.3 K 线图标注
- 多次加仓标注：✅ / ❌
- 多次减仓标注：✅ / ❌
- 标注清晰度：优 / 良 / 中 / 差

### 6. 问题清单
- [ ] 问题 1：描述 + 严重程度 + 解决方案
- [ ] 问题 2：描述 + 严重程度 + 解决方案

### 7. 风险评估
- 技术风险：低 / 中 / 高
- 性能风险：低 / 中 / 高
- 时间风险：低 / 中 / 高

### 8. Go/No-Go 建议
- [ ] **Go** - 进入正式开发（推荐条件：所有必须达标项全部通过）
- [ ] **No-Go** - 重新评估方案（条件：存在重大技术阻碍）

---

## 🚀 立即开始

### Step 1: 创建 POC 工作区

```bash
# 创建目录
mkdir -p /Volumes/work/zen/trading-analysis-platform/poc/backtrader-poc
cd /Volumes/work/zen/trading-analysis-platform/poc/backtrader-poc

# 创建虚拟环境
python3.11 -m venv venv
source venv/bin/activate

# 安装依赖
pip install backtrader pyarrow pandas duckdb pika
```

### Step 2: 准备测试数据

```bash
# 复制测试数据
cp /Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/ES/ES_1min.parquet ./test_data/
```

### Step 3: 开始 Day 1 任务

参考上面的详细计划，按天执行任务。

---

## 📞 支持和联系

**POC 执行人**: [待填写]  
**技术支持**: [待填写]  
**日报接收人**: [待填写]

**每日站会**: 每天 10:00 AM（15 分钟）  
**问题上报**: 遇到阻碍立即上报，不要拖延

---

**POC 状态**: ✅ 可以立即启动  
**预计完成时间**: 3 周后  
**下一个里程碑**: POC 报告和 Go/No-Go 决策会议

---

**祝 POC 顺利！** 🚀

