# 数据库表结构设计 - 已确认方案

**更新日期**: 2025-11-22  
**状态**: ✅ 已确认

---

## 📋 用户确认的方案

### 1️⃣ 数据存储方式：混合方案 ✅

**数据库存储**（快速查询）:
- 任务元数据 → `backtest_tasks`
- 结果统计指标 → `backtest_results`
- 任务日志 → `task_logs`

**Parquet 存储**（大数据高性能）:
- 交易明细 + 因子数据 → `trades_with_factors_{task_id}.parquet`
- 权益曲线 → `equity_curve_{task_id}.parquet`

---

### 2️⃣ Checkpoint 管理：在 tasks 表中 ✅

**不创建单独的 `backtest_checkpoints` 表**

在 `backtest_tasks` 表中新增字段：
```typescript
@Column({ name: 'checkpoint_enabled', type: 'boolean', default: true })
checkpointEnabled!: boolean;

@Column({ name: 'checkpoint_interval', type: 'integer', default: 1000 })
checkpointInterval!: number;

@Column({ name: 'last_checkpoint_bar', type: 'integer', nullable: true })
lastCheckpointBar?: number;

@Column({ name: 'checkpoint_file_path', type: 'varchar', length: 500, nullable: true })
checkpointFilePath?: string;

@Column({ name: 'can_resume', type: 'boolean', default: false })
canResume!: boolean;
```

---

### 3️⃣ result_summary 字段：保留 ✅

**保留现有的 `backtest_tasks.result_summary` 字段**

用途分工：
- `result_summary` (JSONB) → 核心指标（5-10个），用于列表展示和快速筛选
- `backtest_results` (表) → 完整指标（30+个），用于详情页展示

---

### 4️⃣ 因子数据：Parquet 专用文件 ✅

**存储方式**：
```
交易明细 + 因子数据合并在一个 Parquet 文件中

文件名: trades_with_factors_{task_id}.parquet

字段结构:
- trade_id
- order_ref
- entry_datetime
- entry_price
- entry_size
- exit_datetime
- exit_price
- pnl
- pnl_percent
- holding_bars
- direction
- commission
- entry_factors (JSON/STRUCT)
  - entry_factor_1
  - entry_factor_2
  - ...
- holding_factors (JSON/STRUCT)
  - holding_factor_1
  - ...
- exit_factors (JSON/STRUCT)
  - exit_factor_1
  - ...
```

---

### 5️⃣ backtest_results 表：存储什么数据？

## 📊 `backtest_results` 表的定位

### 核心定位
`backtest_results` 表存储的是**回测统计分析结果**，不是原始数据。

### 数据来源
```
原始数据（Parquet）→ 分析计算 → 统计指标（backtest_results）
```

```
交易明细 Parquet:
- 第1笔交易: 盈利 $100
- 第2笔交易: 亏损 -$50
- 第3笔交易: 盈利 $200
- ...
       ↓
    统计分析
       ↓
backtest_results:
- 总交易数: 3笔
- 盈利交易: 2笔
- 胜率: 66.67%
- 平均盈利: $83.33
- 夏普比率: 1.25
- 最大回撤: 15.2%
- ...
```

---

## 📋 `backtest_results` 表详细字段说明

### 基础信息（4个字段）
```typescript
result_id          // UUID，主键
task_id            // UUID，关联任务（唯一）
initial_cash       // 初始资金 $100,000
final_value        // 最终权益 $115,230
```

### 收益指标（3个字段）
```typescript
total_pnl          // 总盈亏 $15,230
total_return_pct   // 总收益率 15.23%
annualized_return_pct  // 年化收益率 45.2%
```

### 交易统计（7个字段）
```typescript
total_trades       // 总交易数 1,250笔
winning_trades     // 盈利交易 680笔
losing_trades      // 亏损交易 570笔
win_rate           // 胜率 54.4%
avg_profit_per_trade   // 平均每笔 $12.18
profit_factor      // 盈亏比 1.35
expectancy         // 期望值 $15.50
```

### 风险指标（6个字段）
```typescript
sharpe_ratio       // 夏普比率 1.25
sortino_ratio      // 索提诺比率 1.68
calmar_ratio       // 卡玛比率 0.85
max_drawdown_pct   // 最大回撤% 18.5%
max_drawdown_value // 最大回撤金额 $18,500
annualized_volatility_pct  // 年化波动率 25.3%
```

### 持仓统计（3个字段）
```typescript
avg_holding_bars   // 平均持仓K线数 45
max_holding_bars   // 最大持仓K线数 320
min_holding_bars   // 最小持仓K线数 5
```

### 文件路径（3个字段）
```typescript
trades_file_path   // Parquet文件路径
                  // "/storage/results/task_xxx/trades_with_factors.parquet"

equity_file_path   // Parquet文件路径
                  // "/storage/results/task_xxx/equity_curve.parquet"

factors_file_path  // (可选) 如果有单独的因子分析文件
                  // 根据用户选择，这个字段可能为空
```

### 扩展数据（1个字段）
```typescript
detailed_metrics   // JSONB，存储其他分析指标
                  // 例如：
{
  "monthly_returns": [...],
  "factor_distribution": {...},
  "best_trade": {...},
  "worst_trade": {...},
  "consecutive_wins": 5,
  "consecutive_losses": 3
}
```

### 时间戳（2个字段）
```typescript
created_at         // 记录创建时间
updated_at         // 记录更新时间
```

---

## 🔄 数据流转过程

### 完整的数据流程

```
1. 用户创建回测任务
   ↓
   backtest_tasks (status: pending)
   
2. Worker 开始执行
   ↓
   backtest_tasks (status: running, progress: 0-100)
   
3. 回测执行中
   ↓
   - 每笔交易数据暂存内存
   - 定期保存 checkpoint (如果启用)
   - 通过 RabbitMQ 报告进度
   
4. 回测完成
   ↓
   a) 保存原始数据到 Parquet:
      - trades_with_factors_{task_id}.parquet
      - equity_curve_{task_id}.parquet
   
   b) 计算统计指标
   
   c) 写入数据库:
      - backtest_results (完整指标)
      - backtest_tasks.result_summary (核心指标摘要)
      - backtest_tasks (status: completed)
```

---

## 💾 Parquet 文件结构详解

### 文件 1: `trades_with_factors_{task_id}.parquet`

```python
# 表结构示例
trades_df = pd.DataFrame({
    'trade_id': [1, 2, 3, ...],
    'order_ref': [1001, 1002, 1003, ...],
    'direction': ['long', 'short', 'long', ...],
    
    # 入场信息
    'entry_datetime': ['2022-12-15 09:30:00', ...],
    'entry_price': [4050.25, 4055.50, ...],
    'entry_size': [1.0, 1.0, ...],
    
    # 出场信息
    'exit_datetime': ['2022-12-15 10:45:00', ...],
    'exit_price': [4065.75, 4050.25, ...],
    
    # 盈亏
    'pnl': [155.0, -52.5, ...],
    'pnl_percent': [0.0038, -0.0013, ...],
    'commission': [8.1, 8.1, ...],
    'holding_bars': [45, 28, ...],
    
    # 因子数据（JSON格式）
    'entry_factors': [
        '{"sma_fast": 4048.2, "sma_slow": 4042.1, "rsi": 65.3}',
        '{"sma_fast": 4056.8, "sma_slow": 4045.2, "rsi": 72.1}',
        ...
    ],
    'holding_factors': [
        '{"max_profit": 185.5, "max_loss": -12.3, "duration": 45}',
        ...
    ],
    'exit_factors': [
        '{"exit_reason": "signal", "profit_at_exit": 155.0}',
        ...
    ]
})

# 或者使用嵌套结构（Parquet支持）
trades_df = pd.DataFrame({
    # ... 基础字段 ...
    'entry_factors': [
        {'sma_fast': 4048.2, 'sma_slow': 4042.1, 'rsi': 65.3},
        {'sma_fast': 4056.8, 'sma_slow': 4045.2, 'rsi': 72.1},
        ...
    ]
})
```

### 文件 2: `equity_curve_{task_id}.parquet`

```python
equity_df = pd.DataFrame({
    'datetime': ['2022-12-15 09:30:00', '2022-12-15 09:31:00', ...],
    'value': [100000.0, 100155.0, 100102.5, ...],
    'cash': [95000.0, 95000.0, 99155.0, ...],
    'position_value': [5000.0, 5155.0, 0.0, ...]
})
```

---

## 🎯 backtest_results 写入时机

### 推荐方案：完成后一次性写入 ⭐

**流程**:
```
1. 回测执行中:
   - 数据暂存内存
   - backtest_tasks.progress 实时更新
   - backtest_tasks.metrics_snapshot 存当前快照（可选）

2. 回测完成:
   - 保存 Parquet 文件
   - 从 Parquet 读取数据计算统计指标
   - 一次性写入 backtest_results 表
   - 更新 backtest_tasks.result_summary
   - 更新 backtest_tasks.status = 'completed'
```

**优点**:
- ✅ 逻辑简单，容易维护
- ✅ 数据一致性好（原子操作）
- ✅ 避免频繁数据库写入
- ✅ 性能开销小

**缺点**:
- ⚠️ 过程中看不到统计指标（但可以看进度）

---

### 备选方案：实时更新（如果需要）

**流程**:
```
1. 回测开始:
   - 创建 backtest_results 记录（初始值）

2. 回测执行中:
   - 每完成 100 笔交易，更新一次统计指标
   - 或每 5 分钟更新一次

3. 回测完成:
   - 最后一次完整更新
   - 保存 Parquet 文件
```

**优点**:
- ✅ 实时可见统计数据
- ✅ 用户体验更好

**缺点**:
- ⚠️ 频繁数据库写入，性能开销
- ⚠️ 逻辑复杂，需要增量计算
- ⚠️ 可能出现部分数据不一致

---

## 🤔 需要您确认

### 关于 `backtest_results` 写入时机

**问题**: 您希望何时写入 `backtest_results` 表？

**选项 A: 完成后一次性写入**（推荐⭐）
```
✅ 简单、高效、一致性好
⚠️ 过程中看不到详细统计（但有进度）

适合: MVP 快速上线
```

**选项 B: 实时更新**
```
✅ 用户体验好，实时可见
⚠️ 复杂、性能开销大

适合: 后期优化
```

---

## 📊 数据量估算

### 单个回测任务的数据量

**假设**: 
- 回测时间: 90天
- 1分钟K线
- 平均每天 1000 笔交易

**原始数据（Parquet）**:
```
交易明细: 90,000 笔 × 200 bytes ≈ 18 MB
权益曲线: 129,600 点 × 50 bytes ≈ 6.5 MB
总计: ~25 MB/任务
```

**统计数据（数据库）**:
```
backtest_results: 1 行 × ~2 KB ≈ 2 KB
backtest_tasks.result_summary: ~500 bytes
总计: ~3 KB/任务
```

**数据库 vs Parquet 比例**: 1 : 8,000

→ 证明混合方案是正确的选择！

---

## ✅ 确认后的实现计划

### 1. 创建 Entity 文件
- `backtest-result.entity.ts`
- 修改 `backtest-task.entity.ts`（新增 checkpoint 字段）

### 2. 创建 Migration
- `xxx-add-backtest-results-table.ts`
- `xxx-add-checkpoint-fields-to-tasks.ts`

### 3. 创建 Repository
- `BacktestResultRepository`

### 4. 创建 Service
- `BacktestResultService`（计算统计指标）
- `ParquetStorageService`（保存/读取 Parquet）

### 5. 测试
- 单元测试
- 集成测试

---

## 🚀 准备好了吗？

**请确认 `backtest_results` 的写入时机**:
- [ ] 选项 A: 完成后一次性写入（推荐）
- [ ] 选项 B: 实时更新

确认后我将立即开始实现！

