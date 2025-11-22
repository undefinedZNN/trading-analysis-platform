# 数据库表结构设计 - Backtrader 集成

**更新日期**: 2025-11-22  
**状态**: 待确认 ⏳

---

## 📋 现有表结构分析

### ✅ 已有表（保持不变）

#### 1. `strategies` - 策略表
```typescript
- strategy_id (UUID, PK)
- name (VARCHAR 60, UNIQUE)
- description (TEXT)
- tags (JSONB)
- created_by (VARCHAR 64)
- updated_by (VARCHAR 64)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
- default_script_version_id (UUID)
```

#### 2. `script_versions` - 脚本版本表
```typescript
- script_version_id (UUID, PK)
- strategy_id (UUID, FK -> strategies)
- version_name (VARCHAR 20)
- is_master (BOOLEAN)
- code (TEXT)
- compiled_code (TEXT)
- compiled_at (TIMESTAMPTZ)
- parameter_schema (JSONB)
- factor_schema (JSONB)
- remark (TEXT)
- created_by (VARCHAR 64)
- updated_by (VARCHAR 64)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
- last_referenced_at (TIMESTAMPTZ)
```

#### 3. `backtest_tasks` - 回测任务表（需调整）⚠️
```typescript
- task_id (UUID, PK)
- task_name (VARCHAR 100)
- task_description (TEXT)
- strategy_id (UUID)
- script_version_id (UUID)
- dataset_id (INTEGER)
- strategy_params (JSONB)
- execution_config (JSONB)
- data_config (JSONB)
- status (VARCHAR 20) [pending/running/completed/failed/cancelled]
- progress (INTEGER 0-100)
- created_at (TIMESTAMPTZ)
- started_at (TIMESTAMPTZ)
- completed_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
- result_summary (JSONB) ⚠️
- result_file_path (VARCHAR 500) ⚠️
- assigned_worker_id (VARCHAR 128)
- metrics_snapshot (JSONB)
- error_message (TEXT)
- error_stack (TEXT)
- created_by (VARCHAR 64)
- updated_by (VARCHAR 64)

索引:
- idx_backtest_tasks_status (status)
- idx_backtest_tasks_strategy (strategy_id)
- idx_backtest_tasks_version (script_version_id)
- idx_backtest_tasks_dataset (dataset_id)
- idx_backtest_tasks_created_at (created_at)
- idx_backtest_tasks_strategy_version_status (strategy_id, script_version_id, status)
```

#### 4. `task_logs` - 任务日志表
```typescript
- log_id (BIGINT, PK, AUTO_INCREMENT)
- task_id (UUID, FK)
- level (VARCHAR 10) [debug/info/warn/error]
- module (VARCHAR 50)
- message (TEXT)
- metadata (JSONB)
- logged_at (TIMESTAMPTZ)

索引:
- idx_task_logs_task_time (task_id, logged_at)
- idx_task_logs_task_level (task_id, level)
- idx_task_logs_logged_at (logged_at)
```

---

## 🆕 需要调整/新增的表

### 方案对比

#### 🎯 方案 A: 最小调整（推荐）⭐

**原则**: 
- 利用现有表结构
- 大数据存 Parquet，元数据存数据库
- 最小化改动

**需要的调整**:

#### 1. 调整 `backtest_tasks` 表 - 增加 Checkpoint 字段

```typescript
// 新增字段
@Column({ name: 'checkpoint_enabled', type: 'boolean', default: true })
checkpointEnabled!: boolean;

@Column({ name: 'checkpoint_interval', type: 'integer', default: 1000 })
checkpointInterval!: number; // K线数量间隔

@Column({ name: 'last_checkpoint_at', type: 'timestamptz', nullable: true })
lastCheckpointAt?: Date; // 最后一次checkpoint时间

@Column({ name: 'last_checkpoint_bar', type: 'integer', nullable: true })
lastCheckpointBar?: number; // 最后checkpoint的K线位置

@Column({ name: 'checkpoint_file_path', type: 'varchar', length: 500, nullable: true })
checkpointFilePath?: string; // checkpoint文件路径

@Column({ name: 'can_resume', type: 'boolean', default: false })
canResume!: boolean; // 是否可以恢复
```

#### 2. 新增 `backtest_results` 表 - 详细结果数据

**目的**: 将结果数据与任务分离，便于查询和管理

```typescript
@Entity({ name: 'backtest_results' })
export class BacktestResultEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'result_id' })
  resultId!: string;

  @Column({ name: 'task_id', type: 'uuid', unique: true })
  taskId!: string;

  // === 基础信息 ===
  @Column({ name: 'initial_cash', type: 'decimal', precision: 15, scale: 2 })
  initialCash!: number;

  @Column({ name: 'final_value', type: 'decimal', precision: 15, scale: 2 })
  finalValue!: number;

  @Column({ name: 'total_pnl', type: 'decimal', precision: 15, scale: 2 })
  totalPnl!: number;

  @Column({ name: 'total_return_pct', type: 'decimal', precision: 10, scale: 4 })
  totalReturnPct!: number;

  // === 交易统计 ===
  @Column({ name: 'total_trades', type: 'integer', default: 0 })
  totalTrades!: number;

  @Column({ name: 'winning_trades', type: 'integer', default: 0 })
  winningTrades!: number;

  @Column({ name: 'losing_trades', type: 'integer', default: 0 })
  losingTrades!: number;

  @Column({ name: 'win_rate', type: 'decimal', precision: 5, scale: 4 })
  winRate!: number;

  @Column({ name: 'avg_profit_per_trade', type: 'decimal', precision: 15, scale: 2 })
  avgProfitPerTrade!: number;

  @Column({ name: 'profit_factor', type: 'decimal', precision: 10, scale: 4, nullable: true })
  profitFactor?: number;

  @Column({ name: 'expectancy', type: 'decimal', precision: 15, scale: 2, nullable: true })
  expectancy?: number;

  // === 风险指标 ===
  @Column({ name: 'sharpe_ratio', type: 'decimal', precision: 10, scale: 4, nullable: true })
  sharpeRatio?: number;

  @Column({ name: 'sortino_ratio', type: 'decimal', precision: 10, scale: 4, nullable: true })
  sortinoRatio?: number;

  @Column({ name: 'calmar_ratio', type: 'decimal', precision: 10, scale: 4, nullable: true })
  calmarRatio?: number;

  @Column({ name: 'max_drawdown_pct', type: 'decimal', precision: 10, scale: 4, nullable: true })
  maxDrawdownPct?: number;

  @Column({ name: 'max_drawdown_value', type: 'decimal', precision: 15, scale: 2, nullable: true })
  maxDrawdownValue?: number;

  @Column({ name: 'annualized_return_pct', type: 'decimal', precision: 10, scale: 4, nullable: true })
  annualizedReturnPct?: number;

  @Column({ name: 'annualized_volatility_pct', type: 'decimal', precision: 10, scale: 4, nullable: true })
  annualizedVolatilityPct?: number;

  // === 持仓统计 ===
  @Column({ name: 'avg_holding_bars', type: 'integer', nullable: true })
  avgHoldingBars?: number;

  @Column({ name: 'max_holding_bars', type: 'integer', nullable: true })
  maxHoldingBars?: number;

  @Column({ name: 'min_holding_bars', type: 'integer', nullable: true })
  minHoldingBars?: number;

  // === 数据文件路径（Parquet） ===
  @Column({ name: 'trades_file_path', type: 'varchar', length: 500, nullable: true })
  tradesFilePath?: string; // 交易明细 Parquet 文件路径

  @Column({ name: 'equity_file_path', type: 'varchar', length: 500, nullable: true })
  equityFilePath?: string; // 权益曲线 Parquet 文件路径

  @Column({ name: 'factors_file_path', type: 'varchar', length: 500, nullable: true })
  factorsFilePath?: string; // 因子数据 Parquet 文件路径

  // === 扩展数据 ===
  @Column({ name: 'detailed_metrics', type: 'jsonb', nullable: true })
  detailedMetrics?: Record<string, any>; // 其他详细指标

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

索引:
- idx_backtest_results_task (task_id) UNIQUE
- idx_backtest_results_return (total_return_pct)
- idx_backtest_results_sharpe (sharpe_ratio)
- idx_backtest_results_created (created_at)
```

#### 3. 新增 `backtest_checkpoints` 表 - Checkpoint 管理

**目的**: 管理和跟踪 checkpoint 文件

```typescript
@Entity({ name: 'backtest_checkpoints' })
export class BacktestCheckpointEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'checkpoint_id' })
  checkpointId!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'checkpoint_name', type: 'varchar', length: 100 })
  checkpointName!: string; // 例如: checkpoint_bar_1000

  @Column({ name: 'bar_number', type: 'integer' })
  barNumber!: number; // K线位置

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath!: string; // checkpoint 文件路径

  @Column({ name: 'file_size_bytes', type: 'bigint' })
  fileSizeBytes!: number; // 文件大小

  @Column({ name: 'current_value', type: 'decimal', precision: 15, scale: 2, nullable: true })
  currentValue?: number; // 当前权益

  @Column({ name: 'trades_count', type: 'integer', default: 0 })
  tradesCount!: number; // 已完成交易数

  @Column({ name: 'is_valid', type: 'boolean', default: true })
  isValid!: boolean; // checkpoint是否有效

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // 额外元数据

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

索引:
- idx_checkpoints_task (task_id)
- idx_checkpoints_task_bar (task_id, bar_number)
- idx_checkpoints_created (created_at)
```

---

#### 🔄 方案 B: 完整数据库存储（备选）

**原则**: 
- 所有数据都存数据库
- 不依赖 Parquet 文件
- 便于复杂查询

**额外需要的表**:

#### 4. `backtest_trades` 表 - 交易明细

```typescript
@Entity({ name: 'backtest_trades' })
export class BacktestTradeEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'trade_id' })
  tradeId!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'order_ref', type: 'integer' })
  orderRef!: number;

  // 入场信息
  @Column({ name: 'entry_datetime', type: 'timestamptz' })
  entryDatetime!: Date;

  @Column({ name: 'entry_price', type: 'decimal', precision: 15, scale: 2 })
  entryPrice!: number;

  @Column({ name: 'entry_size', type: 'decimal', precision: 15, scale: 4 })
  entrySize!: number;

  @Column({ name: 'direction', type: 'varchar', length: 10 }) // long/short
  direction!: string;

  // 出场信息
  @Column({ name: 'exit_datetime', type: 'timestamptz', nullable: true })
  exitDatetime?: Date;

  @Column({ name: 'exit_price', type: 'decimal', precision: 15, scale: 2, nullable: true })
  exitPrice?: number;

  // 盈亏
  @Column({ name: 'pnl', type: 'decimal', precision: 15, scale: 2, nullable: true })
  pnl?: number;

  @Column({ name: 'pnl_percent', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pnlPercent?: number;

  @Column({ name: 'commission', type: 'decimal', precision: 15, scale: 2, default: 0 })
  commission!: number;

  // 持仓信息
  @Column({ name: 'holding_bars', type: 'integer', nullable: true })
  holdingBars?: number;

  // 因子数据（简化版，完整版在Parquet）
  @Column({ name: 'entry_factors', type: 'jsonb', nullable: true })
  entryFactors?: Record<string, any>;

  @Column({ name: 'exit_factors', type: 'jsonb', nullable: true })
  exitFactors?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

索引:
- idx_trades_task (task_id)
- idx_trades_entry_time (entry_datetime)
- idx_trades_pnl (pnl)
```

#### 5. `backtest_equity_curve` 表 - 权益曲线

```typescript
@Entity({ name: 'backtest_equity_curve' })
export class BacktestEquityCurveEntity {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'datetime', type: 'timestamptz' })
  datetime!: Date;

  @Column({ name: 'value', type: 'decimal', precision: 15, scale: 2 })
  value!: number;

  @Column({ name: 'cash', type: 'decimal', precision: 15, scale: 2, nullable: true })
  cash?: number;

  @Column({ name: 'position_value', type: 'decimal', precision: 15, scale: 2, nullable: true })
  positionValue?: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

索引:
- idx_equity_task_time (task_id, datetime)
```

---

## 📊 数据存储策略

### Parquet vs 数据库

| 数据类型 | 存储方式 | 理由 |
|---------|---------|------|
| **任务元数据** | 数据库 | 需要频繁查询和更新 |
| **结果摘要** | 数据库 | 关键指标，用于列表展示和筛选 |
| **交易明细** | Parquet（推荐）或数据库 | 数据量大，批量读取为主 |
| **权益曲线** | Parquet（推荐）或数据库 | 时序数据，按任务整体读取 |
| **因子数据** | Parquet（推荐） | 数据量大，分析用途 |
| **Checkpoint** | 文件系统 + 数据库元数据 | 大文件，元数据用于管理 |
| **日志** | 数据库 | 需要实时查询和筛选 |

---

## 🎯 推荐方案

### ⭐ 方案 A（最小调整 + Parquet）

**优点**:
- ✅ 利用现有表结构，改动最小
- ✅ Parquet 存储大数据，性能好
- ✅ 数据库存摘要，查询快
- ✅ 符合现有架构设计

**缺点**:
- ⚠️ 需要同时管理数据库和文件系统
- ⚠️ 复杂查询需要读取 Parquet

**适用场景**:
- MVP 快速上线
- 数据量较大（单任务>10万条交易）
- 已有 Parquet/DuckDB 技术栈

---

## ❓ 需要您确认的问题

### 1. 存储方式选择

**问题**: 交易明细和权益曲线数据存储在哪里？

- [ ] **选项 A**: Parquet 文件（推荐）
  - 优点: 性能好、存储成本低、适合大数据
  - 缺点: 查询灵活性较低
  
- [ ] **选项 B**: 数据库
  - 优点: 查询灵活、实时性好
  - 缺点: 数据量大时性能下降、存储成本高
  
- [ ] **选项 C**: 混合（元数据+摘要存数据库，详细数据存Parquet）
  - 优点: 兼顾性能和灵活性
  - 缺点: 架构复杂度增加

**我的建议**: 选项 C（混合）⭐

---

### 2. Checkpoint 表是否需要？

**问题**: 是否需要单独的 `backtest_checkpoints` 表？

- [ ] **需要** - 便于管理和查询 checkpoint 历史
- [ ] **不需要** - 直接在 `backtest_tasks` 表中记录最后一个 checkpoint 即可

**我的建议**: 需要 ⭐
- 理由: 便于清理旧 checkpoint、查看历史、诊断问题

---

### 3. `backtest_tasks.result_summary` 字段处理

**问题**: 现有的 `result_summary` 字段如何处理？

- [ ] **保留** - 继续使用，新增 `backtest_results` 表作为补充
- [ ] **废弃** - 所有结果数据迁移到 `backtest_results` 表
- [ ] **部分使用** - 只存最核心的几个指标

**我的建议**: 保留 ⭐
- 理由: 向后兼容，快速查询，`backtest_results` 存储更详细数据

---

### 4. 因子数据如何存储？

**问题**: 入场/持仓/出场因子数据如何存储？

- [ ] **Parquet 专用文件** - 单独的因子数据文件
- [ ] **合并在交易明细中** - 作为交易记录的一部分
- [ ] **数据库 JSONB** - 存在 trades 表的 JSONB 字段中

**我的建议**: 方案1 + 方案3 ⭐
- 完整因子数据存 Parquet
- 数据库只存关键因子（便于筛选）

---

### 5. 结果数据何时写入？

**问题**: `backtest_results` 表何时写入数据？

- [ ] **实时更新** - 回测过程中持续更新统计指标
- [ ] **完成后写入** - 回测完成后一次性写入
- [ ] **混合** - 基础字段实时更新，详细分析完成后写入

**我的建议**: 完成后写入 ⭐
- 理由: 简化逻辑、避免频繁写入、数据一致性好

---

## 📝 表关系图

```
strategies (1) ----< (N) script_versions
                            |
                            | (FK)
                            v
                     backtest_tasks (1) ----< (N) task_logs
                            |
                            | (1:1)
                            v
                     backtest_results
                            |
                            | (1:N)
                            v
                     backtest_checkpoints
```

---

## 🚀 下一步

### 确认后我将：

1. ✅ 创建新的 Entity 文件
2. ✅ 修改 `backtest_tasks` Entity
3. ✅ 生成 TypeORM Migration 文件
4. ✅ 创建 Repository 和 Service 层
5. ✅ 编写单元测试

---

**请您确认以上5个问题的选择，我将据此开始实现！** 🎯

