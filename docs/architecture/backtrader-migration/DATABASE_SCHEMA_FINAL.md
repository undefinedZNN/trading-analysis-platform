# 数据库表结构设计 - 最终确认版

**更新日期**: 2025-11-22  
**状态**: ✅ 最终确认

---

## 🎯 核心设计理念

### 一次回测，多个分析结果

```
┌─────────────────────────────────────────────────────────────┐
│  用户执行一次回测                                              │
│  backtest_task (task_id: xxx)                               │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
    ┌───────────────────────────────────────────┐
    │  生成原始数据（Parquet）                     │
    │  - trades_with_factors.parquet (10,000笔)  │
    │  - equity_curve.parquet                    │
    └───────────────┬───────────────────────────┘
                    ↓
    ┌───────────────┴───────────────────────────────────┐
    │                                                    │
    ↓                         ↓                         ↓
┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
│ Result #1   │      │ Result #2    │      │ Result #3        │
│ (主结果)     │      │ (因子过滤)    │      │ (时间段过滤)      │
├─────────────┤      ├──────────────┤      ├──────────────────┤
│ 全量数据     │      │ 只看RSI>70   │      │ 只看下午交易      │
│ 10,000笔    │      │ 的交易        │      │ 的结果            │
│             │      │ 2,500笔      │      │ 3,200笔          │
│ 胜率: 54%   │      │ 胜率: 62%    │      │ 胜率: 48%        │
│ 夏普: 1.25  │      │ 夏普: 1.58   │      │ 夏普: 0.95       │
└─────────────┘      └──────────────┘      └──────────────────┘
```

---

## 📋 用户确认的最终方案

### 1️⃣ 数据存储：混合方案 ✅
- 原始数据 → Parquet
- 分析结果 → 数据库（backtest_results）

### 2️⃣ Checkpoint：tasks 表中 ✅

### 3️⃣ result_summary：废弃 ✅
- **删除** `backtest_tasks.result_summary` 字段
- 所有结果存 `backtest_results` 表

### 4️⃣ 因子数据：Parquet 专用文件 ✅

### 5️⃣ 写入时机：完成后立即生成主结果 ✅
- 回测完成 → 保存 Parquet → 立即生成主结果（Result #1）
- 用户设置过滤 → 生成派生结果（Result #2, #3...）

---

## 📊 表结构设计

### 1. `backtest_tasks` 表（需调整）

```typescript
@Entity({ name: 'backtest_tasks' })
export class BacktestTaskEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'task_id' })
  taskId!: string;

  @Column({ name: 'task_name', type: 'varchar', length: 100 })
  taskName!: string;

  @Column({ name: 'task_description', type: 'text', nullable: true })
  taskDescription?: string;

  @Column({ name: 'strategy_id', type: 'uuid' })
  strategyId!: string;

  @Column({ name: 'script_version_id', type: 'uuid' })
  scriptVersionId!: string;

  @Column({ name: 'dataset_id', type: 'integer' })
  datasetId!: number;

  @Column({ name: 'strategy_params', type: 'jsonb', default: {} })
  strategyParams!: Record<string, any>;

  @Column({ name: 'execution_config', type: 'jsonb', default: {} })
  executionConfig!: Record<string, any>;

  @Column({ name: 'data_config', type: 'jsonb', default: {} })
  dataConfig!: Record<string, any>;

  @Column({ 
    name: 'status', 
    type: 'varchar', 
    length: 20, 
    default: 'pending' 
  })
  status!: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  @Column({ name: 'progress', type: 'integer', default: 0 })
  progress!: number;

  // === Checkpoint 相关字段（新增）===
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

  // === 数据文件路径 ===
  @Column({ name: 'trades_file_path', type: 'varchar', length: 500, nullable: true })
  tradesFilePath?: string;

  @Column({ name: 'equity_file_path', type: 'varchar', length: 500, nullable: true })
  equityFilePath?: string;

  // === 快照数据（执行中的临时统计）===
  @Column({ name: 'metrics_snapshot', type: 'jsonb', nullable: true })
  metricsSnapshot?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'assigned_worker_id', type: 'varchar', length: 128, nullable: true })
  assignedWorkerId?: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'error_stack', type: 'text', nullable: true })
  errorStack?: string;

  @Column({ name: 'created_by', type: 'varchar', length: 64, nullable: true })
  createdBy?: string;

  @Column({ name: 'updated_by', type: 'varchar', length: 64, nullable: true })
  updatedBy?: string;

  // === 废弃的字段（Migration中标记为废弃）===
  // result_summary - 废弃，迁移到 backtest_results
  // result_file_path - 废弃，使用 trades_file_path 和 equity_file_path
}

索引:
- idx_backtest_tasks_status (status)
- idx_backtest_tasks_strategy (strategy_id)
- idx_backtest_tasks_created_at (created_at)
```

---

### 2. `backtest_results` 表（核心表，支持多结果）⭐

```typescript
@Entity({ name: 'backtest_results' })
@Index('idx_backtest_results_task', ['taskId'])
@Index('idx_backtest_results_task_primary', ['taskId', 'isPrimary'])
@Index('idx_backtest_results_created', ['createdAt'])
@Index('idx_backtest_results_return', ['totalReturnPct'])
@Index('idx_backtest_results_sharpe', ['sharpeRatio'])
export class BacktestResultEntity {
  // ============================================
  // 基础标识信息
  // ============================================
  
  @PrimaryGeneratedColumn('uuid', { name: 'result_id' })
  resultId!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Column({ name: 'result_name', type: 'varchar', length: 100 })
  resultName!: string; // 例如: "全量数据", "RSI>70过滤", "下午交易"

  @Column({ name: 'result_description', type: 'text', nullable: true })
  resultDescription?: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean; // true = 首次生成的全量结果

  // ============================================
  // 过滤条件（支持后续因子筛选）
  // ============================================
  
  @Column({ name: 'filter_conditions', type: 'jsonb', nullable: true })
  filterConditions?: FilterConditions;
  
  /* filterConditions 示例:
  {
    "factors": {
      "entry_rsi": { "min": 70, "max": 100 },
      "exit_profit": { "min": 0.02 }
    },
    "time_range": {
      "start_hour": 14,
      "end_hour": 16
    },
    "trade_direction": "long",  // long/short/both
    "min_holding_bars": 10
  }
  */

  @Column({ name: 'trades_count_filtered', type: 'integer' })
  tradesCountFiltered!: number; // 应用过滤条件后的交易数

  @Column({ name: 'trades_count_total', type: 'integer' })
  tradesCountTotal!: number; // 原始总交易数（来自Parquet）

  // ============================================
  // 资金信息
  // ============================================
  
  @Column({ name: 'initial_cash', type: 'decimal', precision: 15, scale: 2 })
  initialCash!: number;

  @Column({ name: 'final_value', type: 'decimal', precision: 15, scale: 2 })
  finalValue!: number;

  @Column({ name: 'total_pnl', type: 'decimal', precision: 15, scale: 2 })
  totalPnl!: number;

  // ============================================
  // 收益指标
  // ============================================
  
  @Column({ name: 'total_return_pct', type: 'decimal', precision: 10, scale: 4 })
  totalReturnPct!: number;

  @Column({ name: 'annualized_return_pct', type: 'decimal', precision: 10, scale: 4, nullable: true })
  annualizedReturnPct?: number;

  // ============================================
  // 交易统计
  // ============================================
  
  @Column({ name: 'total_trades', type: 'integer' })
  totalTrades!: number;

  @Column({ name: 'winning_trades', type: 'integer' })
  winningTrades!: number;

  @Column({ name: 'losing_trades', type: 'integer' })
  losingTrades!: number;

  @Column({ name: 'win_rate', type: 'decimal', precision: 5, scale: 4 })
  winRate!: number;

  @Column({ name: 'avg_profit_per_trade', type: 'decimal', precision: 15, scale: 2 })
  avgProfitPerTrade!: number;

  @Column({ name: 'profit_factor', type: 'decimal', precision: 10, scale: 4, nullable: true })
  profitFactor?: number;

  @Column({ name: 'expectancy', type: 'decimal', precision: 15, scale: 2, nullable: true })
  expectancy?: number;

  // ============================================
  // 风险指标
  // ============================================
  
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

  @Column({ name: 'annualized_volatility_pct', type: 'decimal', precision: 10, scale: 4, nullable: true })
  annualizedVolatilityPct?: number;

  // ============================================
  // 持仓统计
  // ============================================
  
  @Column({ name: 'avg_holding_bars', type: 'integer', nullable: true })
  avgHoldingBars?: number;

  @Column({ name: 'max_holding_bars', type: 'integer', nullable: true })
  maxHoldingBars?: number;

  @Column({ name: 'min_holding_bars', type: 'integer', nullable: true })
  minHoldingBars?: number;

  // ============================================
  // 扩展数据
  // ============================================
  
  @Column({ name: 'detailed_metrics', type: 'jsonb', nullable: true })
  detailedMetrics?: DetailedMetrics;
  
  /* detailedMetrics 示例:
  {
    "monthly_returns": [0.05, 0.03, -0.02, ...],
    "best_trade": { "pnl": 500, "date": "2022-12-20" },
    "worst_trade": { "pnl": -200, "date": "2022-12-25" },
    "consecutive_wins": 8,
    "consecutive_losses": 5,
    "avg_win": 85.5,
    "avg_loss": -42.3,
    "factor_stats": {
      "rsi_distribution": {...},
      "entry_time_distribution": {...}
    }
  }
  */

  // ============================================
  // 计算元数据
  // ============================================
  
  @Column({ name: 'calculation_time_ms', type: 'integer', nullable: true })
  calculationTimeMs?: number; // 计算耗时

  @Column({ name: 'data_source', type: 'varchar', length: 50, default: 'parquet' })
  dataSource!: string; // parquet/cache/database

  // ============================================
  // 时间戳
  // ============================================
  
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'created_by', type: 'varchar', length: 64, nullable: true })
  createdBy?: string;
}

// TypeScript 接口定义
interface FilterConditions {
  factors?: {
    [factorName: string]: {
      min?: number;
      max?: number;
      equals?: any;
      in?: any[];
    };
  };
  time_range?: {
    start_hour?: number;
    end_hour?: number;
    weekdays?: number[];
  };
  trade_direction?: 'long' | 'short' | 'both';
  min_holding_bars?: number;
  max_holding_bars?: number;
  min_pnl?: number;
  max_pnl?: number;
}

interface DetailedMetrics {
  monthly_returns?: number[];
  best_trade?: { pnl: number; date: string; [key: string]: any };
  worst_trade?: { pnl: number; date: string; [key: string]: any };
  consecutive_wins?: number;
  consecutive_losses?: number;
  avg_win?: number;
  avg_loss?: number;
  factor_stats?: Record<string, any>;
  [key: string]: any;
}
```

---

## 🔄 完整业务流程

### 场景 1: 首次执行回测

```
Step 1: 用户创建回测任务
POST /api/backtest/tasks
{
  "task_name": "MA Cross 测试",
  "strategy_id": "uuid-xxx",
  "data_config": { ... }
}
↓
backtest_tasks (status: pending)

Step 2: Worker 执行回测
↓
- 执行策略逻辑
- 收集交易数据到内存
- 实时报告进度: progress = 50%
↓
backtest_tasks (status: running, progress: 50%)

Step 3: 回测完成
↓
a) 保存原始数据到 Parquet:
   ✅ trades_with_factors_{task_id}.parquet (10,000笔)
   ✅ equity_curve_{task_id}.parquet
   
b) 立即生成主结果:
   ✅ 从 Parquet 读取数据
   ✅ 计算统计指标
   ✅ 写入 backtest_results (is_primary=true)
   
c) 更新任务状态:
   ✅ backtest_tasks.status = 'completed'
   ✅ backtest_tasks.trades_file_path = "..."
   ✅ backtest_tasks.equity_file_path = "..."

注意: 回测完成时就已经有主结果了！
```

---

### 场景 2: 用户首次查看结果（主结果已存在）

```
Step 1: 前端请求结果
GET /api/backtest/results?taskId=xxx

Step 2: 后端查询主结果
↓
SELECT * FROM backtest_results
WHERE task_id = 'xxx' AND is_primary = true

Step 3: 直接返回已生成的主结果
{
  result_id: "yyy",
  result_name: "全量数据",
  is_primary: true,
  total_trades: 10000,
  win_rate: 54%,
  sharpe_ratio: 1.25,
  ...
}

注意: 主结果在回测完成时就已经生成，无需等待！
```

---

### 场景 3: 用户设置因子过滤（生成派生结果）

```
Step 1: 用户在前端设置过滤条件
UI: 
  ☑️ 只看 RSI > 70 的交易
  ☑️ 只看多单
  ☑️ 持仓时间 > 30根K线

Step 2: 前端发起请求
POST /api/backtest/results/filter
{
  task_id: "xxx",
  result_name: "RSI>70多单",
  filter_conditions: {
    factors: {
      entry_rsi: { min: 70 }
    },
    trade_direction: "long",
    min_holding_bars: 30
  }
}

Step 3: 后端处理
↓
a) 检查是否已存在相同过滤条件的结果
   → 如果存在，直接返回
   
b) 不存在 → 生成新结果:
   - 读取 Parquet
   - 应用过滤条件（DuckDB SQL 查询）
   - 重新计算统计指标
   - 写入新的 backtest_results 记录

c) 插入数据库:
   INSERT INTO backtest_results
   {
     task_id: "xxx",
     result_name: "RSI>70多单",
     is_primary: false,
     filter_conditions: { ... },
     trades_count_total: 10000,
     trades_count_filtered: 2500,  // 过滤后剩余
     total_trades: 2500,
     win_rate: 0.62,  // 重新计算
     sharpe_ratio: 1.58,  // 重新计算
     ...
   }

Step 4: 返回新结果
{
  result_id: "zzz",
  result_name: "RSI>70多单",
  total_trades: 2500,
  win_rate: 62%,
  sharpe_ratio: 1.58,
  ...
}
```

---

### 场景 4: 查看某任务的所有结果

```
GET /api/backtest/results?taskId=xxx

Response:
{
  task_id: "xxx",
  task_name: "MA Cross 测试",
  results: [
    {
      result_id: "yyy",
      result_name: "全量数据",
      is_primary: true,
      total_trades: 10000,
      win_rate: 54%,
      sharpe_ratio: 1.25,
      created_at: "2022-11-22 10:00:00"
    },
    {
      result_id: "zzz",
      result_name: "RSI>70多单",
      is_primary: false,
      total_trades: 2500,
      win_rate: 62%,
      sharpe_ratio: 1.58,
      created_at: "2022-11-22 10:15:00"
    },
    {
      result_id: "aaa",
      result_name: "下午交易",
      is_primary: false,
      total_trades: 3200,
      win_rate: 48%,
      sharpe_ratio: 0.95,
      created_at: "2022-11-22 10:30:00"
    }
  ]
}
```

---

## 📊 数据关系图

```
strategies (1) ────< (N) script_versions
                            │
                            │ (FK)
                            ↓
                    backtest_tasks (1) ────< (N) task_logs
                            │
                            │ (1:N) ← 核心变化！
                            ↓
                    backtest_results
                    ├─ Result #1 (is_primary=true, 全量)
                    ├─ Result #2 (is_primary=false, 因子过滤)
                    ├─ Result #3 (is_primary=false, 时间过滤)
                    └─ ...
```

---

## 🗑️ 废弃字段处理

### Migration 策略

```typescript
// Migration 1: 添加新字段
export class AddCheckpointFields1700000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 添加 checkpoint 字段
    await queryRunner.addColumn('backtest_tasks', 
      new TableColumn({
        name: 'checkpoint_enabled',
        type: 'boolean',
        default: true
      })
    );
    // ... 其他字段
  }
}

// Migration 2: 废弃旧字段（保留但标记）
export class DeprecateResultSummary1700000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 重命名字段（标记为废弃）
    await queryRunner.renameColumn(
      'backtest_tasks',
      'result_summary',
      'result_summary_deprecated'
    );
    
    await queryRunner.renameColumn(
      'backtest_tasks',
      'result_file_path',
      'result_file_path_deprecated'
    );
    
    // 添加注释
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.result_summary_deprecated 
      IS 'DEPRECATED: Use backtest_results table instead';
    `);
  }
}

// Migration 3: 创建 backtest_results 表
export class CreateBacktestResults1700000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'backtest_results',
        columns: [
          // ... 所有字段定义
        ]
      })
    );
    
    // 创建索引
    await queryRunner.createIndex(
      'backtest_results',
      new TableIndex({
        name: 'idx_backtest_results_task',
        columnNames: ['task_id']
      })
    );
    // ... 其他索引
  }
}
```

---

## 🎯 API 设计

### 1. 获取任务的所有结果

```typescript
GET /api/backtest/tasks/:taskId/results

Response:
{
  task: { ... },
  results: [
    {
      result_id: "xxx",
      result_name: "全量数据",
      is_primary: true,
      total_trades: 10000,
      win_rate: 0.54,
      sharpe_ratio: 1.25,
      created_at: "..."
    },
    { ... }
  ]
}
```

### 2. 获取主结果

```typescript
GET /api/backtest/tasks/:taskId/results/primary

逻辑:
1. 查询 is_primary=true 的结果
2. 直接返回（回测完成时已生成）

注意: 如果任务状态是 completed，主结果一定存在
```

### 3. 创建过滤结果

```typescript
POST /api/backtest/tasks/:taskId/results

Body:
{
  result_name: "RSI>70多单",
  filter_conditions: {
    factors: {
      entry_rsi: { min: 70 }
    },
    trade_direction: "long"
  }
}

Response:
{
  result_id: "yyy",
  result_name: "RSI>70多单",
  total_trades: 2500,
  ...
}
```

### 4. 删除结果

```typescript
DELETE /api/backtest/results/:resultId

注意: 
- 不能删除 is_primary=true 的结果
- 删除任务时，级联删除所有结果
```

---

## 💾 DuckDB 过滤查询示例

### 应用因子过滤

```sql
-- 原始数据
SELECT * FROM 'trades_with_factors_xxx.parquet'

-- 应用过滤条件
SELECT *
FROM 'trades_with_factors_xxx.parquet'
WHERE 
  -- 因子过滤
  json_extract(entry_factors, '$.rsi') > 70
  -- 方向过滤
  AND direction = 'long'
  -- 持仓时间过滤
  AND holding_bars >= 30
  -- 时间范围过滤
  AND EXTRACT(HOUR FROM entry_datetime) BETWEEN 14 AND 16
  
-- 计算统计指标
SELECT 
  COUNT(*) as total_trades,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
  AVG(pnl) as avg_profit,
  ...
FROM (
  -- 子查询应用过滤
)
```

---

## ✅ 最终确认清单

- [x] 1. backtest_results 支持 1:N 关系
- [x] 2. is_primary 标识主结果
- [x] 3. filter_conditions 存储过滤条件
- [x] 4. result_summary 字段废弃
- [x] 5. 支持多个分析结果
- [x] 6. 完成后一次性写入
- [x] 7. 懒加载生成主结果
- [x] 8. 因子过滤存 Parquet

---

## 🚀 实现计划

### Phase 1: 数据库层（2天）
1. ✅ 创建 BacktestResultEntity
2. ✅ 修改 BacktestTaskEntity
3. ✅ 生成 Migration 文件
4. ✅ 创建索引

### Phase 2: 服务层（2天）
1. ✅ BacktestResultRepository
2. ✅ BacktestResultService
3. ✅ ParquetStorageService
4. ✅ FilterService（DuckDB 查询）

### Phase 3: API 层（1天）
1. ✅ GET /tasks/:id/results
2. ✅ GET /tasks/:id/results/primary
3. ✅ POST /tasks/:id/results
4. ✅ DELETE /results/:id

### Phase 4: 测试（1天)
1. ✅ 单元测试
2. ✅ 集成测试
3. ✅ 端到端测试

**总计: 6天**

---

**准备好开始实现了吗？** 🚀

