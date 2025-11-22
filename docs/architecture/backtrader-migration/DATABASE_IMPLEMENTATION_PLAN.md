# 数据库集成 - 实施计划

**更新日期**: 2025-11-22  
**状态**: ✅ 需求已确认，准备实施

---

## ✅ 最终确认的需求

### 核心设计

```
1 次回测 → 1 个任务 → N 个分析结果

backtest_task
    ↓
    ├─ 原始数据 (Parquet)
    │   ├─ trades_with_factors.parquet
    │   └─ equity_curve.parquet
    │
    └─ 分析结果 (Database)
        ├─ Result #1 (is_primary=true)  ← 回测完成时立即生成
        ├─ Result #2 (is_primary=false) ← 用户设置因子过滤后生成
        ├─ Result #3 (is_primary=false) ← 用户设置时间过滤后生成
        └─ ...
```

---

## 🔄 完整业务流程

### Step 1: 回测执行

```
用户创建任务
    ↓
Worker 执行回测
    ↓
    - 策略逻辑执行
    - 交易数据暂存内存
    - 实时报告进度
    ↓
回测完成
```

### Step 2: 回测完成后的处理（关键！）

```
回测完成后，Worker 自动执行:

1️⃣ 保存原始数据到 Parquet
   ✅ trades_with_factors_{task_id}.parquet
      - 包含所有交易明细
      - 包含入场/持仓/出场因子
   ✅ equity_curve_{task_id}.parquet
      - 每根K线的权益曲线

2️⃣ 立即生成主结果（is_primary=true）
   ✅ 从 Parquet 读取全量数据
   ✅ 计算所有统计指标
   ✅ 写入 backtest_results 表
   
3️⃣ 更新任务状态
   ✅ backtest_tasks.status = 'completed'
   ✅ backtest_tasks.trades_file_path = "..."
   ✅ backtest_tasks.equity_file_path = "..."
   ✅ backtest_tasks.completed_at = NOW()

完成！用户可以立即查看结果！
```

### Step 3: 用户查看结果

```
用户打开结果页
    ↓
GET /api/backtest/tasks/{task_id}/results
    ↓
返回:
[
  {
    result_id: "xxx",
    result_name: "全量数据",
    is_primary: true,
    total_trades: 10000,
    win_rate: 0.54,
    sharpe_ratio: 1.25,
    ...
  }
]

无需等待，数据已准备好！
```

### Step 4: 用户设置因子过滤

```
用户在 UI 设置过滤条件:
☑️ 只看 RSI > 70 的交易
☑️ 只看多单
☑️ 持仓时间 > 30根K线
    ↓
POST /api/backtest/tasks/{task_id}/results
{
  result_name: "RSI>70多单",
  filter_conditions: {
    factors: { entry_rsi: { min: 70 } },
    trade_direction: "long",
    min_holding_bars: 30
  }
}
    ↓
后端处理:
1. 读取 Parquet 文件
2. 应用过滤条件 (DuckDB SQL)
3. 重新计算统计指标
4. 写入新的 backtest_results 记录
    ↓
返回新结果:
{
  result_id: "yyy",
  result_name: "RSI>70多单",
  is_primary: false,
  total_trades: 2500,
  win_rate: 0.62,
  sharpe_ratio: 1.58,
  ...
}
```

---

## 📊 表结构总结

### 1. `backtest_tasks` 表（需调整）

**新增字段**:
```typescript
checkpoint_enabled: boolean          // Checkpoint 开关
checkpoint_interval: number          // Checkpoint 间隔（K线数）
last_checkpoint_bar: number          // 最后 checkpoint 位置
checkpoint_file_path: string         // Checkpoint 文件路径
can_resume: boolean                  // 是否可恢复
trades_file_path: string             // 交易数据 Parquet 路径
equity_file_path: string             // 权益曲线 Parquet 路径
```

**废弃字段**（重命名）:
```typescript
result_summary → result_summary_deprecated
result_file_path → result_file_path_deprecated
```

---

### 2. `backtest_results` 表（新建）

**关键字段**:
```typescript
// 标识信息
result_id: UUID                      // 主键
task_id: UUID                        // 关联任务
result_name: string                  // "全量数据", "RSI>70多单"
is_primary: boolean                  // true=主结果, false=派生结果

// 过滤条件
filter_conditions: JSONB             // 过滤条件
trades_count_total: number           // 原始总交易数
trades_count_filtered: number        // 过滤后交易数

// 收益指标
initial_cash: decimal
final_value: decimal
total_pnl: decimal
total_return_pct: decimal
annualized_return_pct: decimal

// 交易统计
total_trades: number
winning_trades: number
losing_trades: number
win_rate: decimal
avg_profit_per_trade: decimal
profit_factor: decimal
expectancy: decimal

// 风险指标
sharpe_ratio: decimal
sortino_ratio: decimal
calmar_ratio: decimal
max_drawdown_pct: decimal
max_drawdown_value: decimal
annualized_volatility_pct: decimal

// 持仓统计
avg_holding_bars: number
max_holding_bars: number
min_holding_bars: number

// 扩展数据
detailed_metrics: JSONB
calculation_time_ms: number
```

**索引**:
```sql
idx_backtest_results_task (task_id)
idx_backtest_results_task_primary (task_id, is_primary)
idx_backtest_results_return (total_return_pct)
idx_backtest_results_sharpe (sharpe_ratio)
idx_backtest_results_created (created_at)
```

---

## 🎯 实施任务清单

### Day 1: 数据库层（Entity + Migration）

#### Task 1.1: 创建 BacktestResultEntity
- [ ] 创建 `backtest-result.entity.ts`
- [ ] 定义所有字段（30+个）
- [ ] 定义索引
- [ ] 定义接口（FilterConditions, DetailedMetrics）

#### Task 1.2: 修改 BacktestTaskEntity
- [ ] 添加 checkpoint 相关字段（6个）
- [ ] 添加文件路径字段（2个）
- [ ] 在 Entity 中标记废弃字段

#### Task 1.3: 创建 Migration 文件
- [ ] Migration 1: 添加 checkpoint 字段到 backtest_tasks
- [ ] Migration 2: 重命名废弃字段
- [ ] Migration 3: 创建 backtest_results 表
- [ ] Migration 4: 创建索引

---

### Day 2: Repository 层

#### Task 2.1: BacktestResultRepository
- [ ] `create(data)` - 创建结果
- [ ] `findByTaskId(taskId)` - 查询任务的所有结果
- [ ] `findPrimaryByTaskId(taskId)` - 查询主结果
- [ ] `findById(resultId)` - 查询单个结果
- [ ] `delete(resultId)` - 删除结果
- [ ] `count(taskId)` - 统计结果数量

#### Task 2.2: 修改 BacktestTaskRepository
- [ ] 添加 checkpoint 字段的查询/更新方法
- [ ] 添加文件路径字段的查询/更新方法

---

### Day 3: 服务层（核心逻辑）

#### Task 3.1: ParquetStorageService
```typescript
class ParquetStorageService {
  // 保存交易数据到 Parquet
  async saveTradesWithFactors(taskId, trades): Promise<string>
  
  // 保存权益曲线到 Parquet
  async saveEquityCurve(taskId, equityCurve): Promise<string>
  
  // 读取交易数据
  async loadTradesWithFactors(taskId, filterConditions?): Promise<Trade[]>
  
  // 读取权益曲线
  async loadEquityCurve(taskId): Promise<EquityPoint[]>
}
```

#### Task 3.2: BacktestAnalysisService
```typescript
class BacktestAnalysisService {
  // 从 Parquet 计算统计指标
  async calculateMetrics(taskId, filterConditions?): Promise<Metrics>
  
  // 生成主结果
  async generatePrimaryResult(taskId): Promise<BacktestResultEntity>
  
  // 生成过滤结果
  async generateFilteredResult(
    taskId, 
    resultName, 
    filterConditions
  ): Promise<BacktestResultEntity>
}
```

#### Task 3.3: BacktestResultService
```typescript
class BacktestResultService {
  // 获取任务的所有结果
  async getResultsByTaskId(taskId): Promise<BacktestResultEntity[]>
  
  // 获取主结果
  async getPrimaryResult(taskId): Promise<BacktestResultEntity>
  
  // 创建过滤结果
  async createFilteredResult(
    taskId,
    resultName,
    filterConditions,
    userId
  ): Promise<BacktestResultEntity>
  
  // 删除结果
  async deleteResult(resultId, userId): Promise<void>
}
```

---

### Day 4: Worker 集成

#### Task 4.1: 修改回测完成逻辑
```typescript
// backtest-worker/src/backtrader_integration/main.py

async def on_backtest_completed(task_id, strategy, cerebro):
    """回测完成后的处理"""
    
    # 1. 收集数据
    trades = strategy.factor_collector.trades
    equity_curve = extract_equity_curve(strategy)
    
    # 2. 保存到 Parquet
    trades_file_path = await save_trades_parquet(task_id, trades)
    equity_file_path = await save_equity_parquet(task_id, equity_curve)
    
    # 3. 更新任务文件路径
    await update_task_file_paths(task_id, trades_file_path, equity_file_path)
    
    # 4. 通知 Backend 生成主结果
    await notify_backend_to_generate_primary_result(task_id)
    
    # 5. 更新任务状态为完成
    await update_task_status(task_id, 'completed')
```

#### Task 4.2: Backend 监听消息
```typescript
// backend/src/backtesting/tasks/tasks.consumer.ts

@RabbitSubscribe({
  exchange: 'backtest',
  routingKey: 'result.primary.generate',
})
async handleGeneratePrimaryResult(msg: { taskId: string }) {
  // 生成主结果
  await this.backtestAnalysisService.generatePrimaryResult(msg.taskId);
}
```

---

### Day 5: API 层

#### Task 5.1: BacktestResultsController
```typescript
@Controller('backtest/tasks/:taskId/results')
export class BacktestResultsController {
  
  // 获取任务的所有结果
  @Get()
  async getResults(@Param('taskId') taskId: string) {
    return this.resultService.getResultsByTaskId(taskId);
  }
  
  // 获取主结果
  @Get('primary')
  async getPrimaryResult(@Param('taskId') taskId: string) {
    return this.resultService.getPrimaryResult(taskId);
  }
  
  // 创建过滤结果
  @Post()
  async createFilteredResult(
    @Param('taskId') taskId: string,
    @Body() dto: CreateFilteredResultDto
  ) {
    return this.resultService.createFilteredResult(
      taskId,
      dto.resultName,
      dto.filterConditions,
      this.currentUser.id
    );
  }
}

@Controller('backtest/results')
export class BacktestResultsManagementController {
  
  // 删除结果
  @Delete(':resultId')
  async deleteResult(@Param('resultId') resultId: string) {
    return this.resultService.deleteResult(resultId, this.currentUser.id);
  }
  
  // 获取单个结果详情
  @Get(':resultId')
  async getResultDetail(@Param('resultId') resultId: string) {
    return this.resultService.getResultById(resultId);
  }
}
```

#### Task 5.2: DTO 定义
```typescript
// create-filtered-result.dto.ts
export class CreateFilteredResultDto {
  @IsString()
  @Length(1, 100)
  resultName: string;
  
  @IsOptional()
  @IsString()
  resultDescription?: string;
  
  @IsObject()
  filterConditions: FilterConditions;
}
```

---

### Day 6: 测试

#### Task 6.1: 单元测试
- [ ] BacktestResultRepository 测试
- [ ] ParquetStorageService 测试
- [ ] BacktestAnalysisService 测试
- [ ] BacktestResultService 测试

#### Task 6.2: 集成测试
- [ ] 完整回测流程测试（含主结果生成）
- [ ] 因子过滤测试
- [ ] 多结果并发创建测试
- [ ] 删除结果测试

#### Task 6.3: 端到端测试
- [ ] 创建任务 → 执行 → 查看主结果
- [ ] 设置过滤 → 生成派生结果
- [ ] 对比多个结果

---

## 📝 关键代码示例

### 生成主结果的逻辑

```typescript
// BacktestAnalysisService
async generatePrimaryResult(taskId: string): Promise<BacktestResultEntity> {
  // 1. 检查是否已存在主结果
  const existing = await this.resultRepo.findPrimaryByTaskId(taskId);
  if (existing) {
    return existing; // 已存在，直接返回
  }
  
  // 2. 读取 Parquet 数据
  const trades = await this.parquetService.loadTradesWithFactors(taskId);
  const equityCurve = await this.parquetService.loadEquityCurve(taskId);
  
  // 3. 计算统计指标
  const metrics = this.calculateMetrics(trades, equityCurve);
  
  // 4. 创建主结果记录
  const result = await this.resultRepo.create({
    taskId,
    resultName: '全量数据',
    isPrimary: true,
    filterConditions: null,
    tradesCountTotal: trades.length,
    tradesCountFiltered: trades.length,
    ...metrics,
  });
  
  return result;
}
```

### 应用因子过滤

```typescript
// ParquetStorageService
async loadTradesWithFactors(
  taskId: string,
  filterConditions?: FilterConditions
): Promise<Trade[]> {
  
  const filePath = `${this.storageDir}/trades_with_factors_${taskId}.parquet`;
  
  // 构建 DuckDB SQL 查询
  let sql = `SELECT * FROM '${filePath}'`;
  
  if (filterConditions) {
    const whereClauses = [];
    
    // 因子过滤
    if (filterConditions.factors) {
      for (const [factorName, condition] of Object.entries(filterConditions.factors)) {
        if (condition.min !== undefined) {
          whereClauses.push(
            `json_extract(entry_factors, '$.${factorName}') >= ${condition.min}`
          );
        }
        if (condition.max !== undefined) {
          whereClauses.push(
            `json_extract(entry_factors, '$.${factorName}') <= ${condition.max}`
          );
        }
      }
    }
    
    // 方向过滤
    if (filterConditions.trade_direction && filterConditions.trade_direction !== 'both') {
      whereClauses.push(`direction = '${filterConditions.trade_direction}'`);
    }
    
    // 持仓时间过滤
    if (filterConditions.min_holding_bars) {
      whereClauses.push(`holding_bars >= ${filterConditions.min_holding_bars}`);
    }
    
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }
  }
  
  // 执行查询
  const connection = await duckdb.connect();
  const result = await connection.query(sql);
  
  return result.toArray();
}
```

---

## ✅ 验收标准

### 功能验收

- [ ] 回测完成后，主结果自动生成
- [ ] 用户可以立即查看主结果（无等待）
- [ ] 用户可以设置因子过滤，生成新结果
- [ ] 用户可以查看一个任务的所有结果
- [ ] 用户可以删除派生结果（不能删除主结果）
- [ ] 因子过滤计算正确
- [ ] 统计指标计算准确

### 性能验收

- [ ] 主结果生成时间 < 5秒（10万笔交易）
- [ ] 因子过滤计算时间 < 3秒（10万笔交易）
- [ ] 查询结果列表 < 100ms
- [ ] 数据库查询优化（索引使用）

### 数据验收

- [ ] result_summary 字段已废弃并重命名
- [ ] 所有历史数据可正常访问
- [ ] Parquet 文件正确保存
- [ ] 数据一致性检查通过

---

## 🚀 开始实施

**确认无误后，我将按照以下顺序开始实施**:

1. Day 1: Entity + Migration（数据库层）
2. Day 2: Repository（数据访问层）
3. Day 3: Service（业务逻辑层）
4. Day 4: Worker 集成（回测完成处理）
5. Day 5: API（接口层）
6. Day 6: 测试（质量保证）

**预计完成时间**: 6个工作日

---

**准备好开始了吗？** 🚀

