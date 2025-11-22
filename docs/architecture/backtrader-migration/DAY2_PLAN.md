# Day 2 工作计划 - Repository 层

**日期**: 2025-11-22  
**状态**: 🔜 准备开始  
**预计工时**: 0.5 天（4小时）

---

## 🎯 Day 2 主要工作

### 核心任务：创建数据访问层（Repository）

为新建的 `backtest_results` 表和修改后的 `backtest_tasks` 表创建 Repository 层，提供基础的 CRUD 操作。

---

## 📋 详细任务清单

### Task 2.1: BacktestResultRepository（主要工作）

创建 `BacktestResultRepository`，提供以下方法：

#### 基础 CRUD 方法

```typescript
class BacktestResultRepository {
  // 1. 创建结果
  async create(data: CreateBacktestResultDto): Promise<BacktestResultEntity>
  
  // 2. 查询某任务的所有结果
  async findByTaskId(taskId: string): Promise<BacktestResultEntity[]>
  
  // 3. 查询主结果（is_primary=true）
  async findPrimaryByTaskId(taskId: string): Promise<BacktestResultEntity | null>
  
  // 4. 查询单个结果
  async findById(resultId: string): Promise<BacktestResultEntity | null>
  
  // 5. 删除结果
  async delete(resultId: string): Promise<void>
  
  // 6. 统计某任务的结果数量
  async countByTaskId(taskId: string): Promise<number>
  
  // 7. 检查主结果是否存在
  async hasPrimaryResult(taskId: string): Promise<boolean>
  
  // 8. 查询结果列表（支持分页和排序）
  async findWithPagination(options: {
    taskId?: string;
    isPrimary?: boolean;
    orderBy?: 'created_at' | 'total_return_pct' | 'sharpe_ratio';
    order?: 'ASC' | 'DESC';
    page?: number;
    limit?: number;
  }): Promise<{ data: BacktestResultEntity[]; total: number }>
}
```

**工作量估算**: 2-3 小时

---

### Task 2.2: 修改 BacktestTaskRepository（次要工作）

为 `BacktestTaskRepository` 添加新字段的查询和更新方法：

#### Checkpoint 相关方法

```typescript
class BacktestTaskRepository {
  // 更新 checkpoint 状态
  async updateCheckpointStatus(taskId: string, data: {
    lastCheckpointBar?: number;
    checkpointFilePath?: string;
    canResume?: boolean;
  }): Promise<void>
  
  // 获取可恢复的任务列表
  async findResumableTasks(): Promise<BacktestTaskEntity[]>
}
```

#### 文件路径相关方法

```typescript
class BacktestTaskRepository {
  // 更新文件路径
  async updateFilePaths(taskId: string, data: {
    tradesFilePath?: string;
    equityFilePath?: string;
  }): Promise<void>
  
  // 查询有文件的任务
  async findTasksWithFiles(): Promise<BacktestTaskEntity[]>
}
```

**工作量估算**: 1 小时

---

## 📂 需要创建的文件

### 1. Repository 文件

```
backend/src/backtesting/tasks/repositories/
├── backtest-result.repository.ts    (新建) ← 主要工作
└── backtest-task.repository.ts      (已存在，需修改)
```

### 2. DTO 文件

```
backend/src/backtesting/tasks/dto/
├── create-backtest-result.dto.ts    (新建)
└── update-backtest-result.dto.ts    (新建)
```

---

## 📊 代码结构示例

### BacktestResultRepository 示例

```typescript
// backend/src/backtesting/tasks/repositories/backtest-result.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BacktestResultEntity } from '../entities/backtest-result.entity';
import { CreateBacktestResultDto } from '../dto/create-backtest-result.dto';

@Injectable()
export class BacktestResultRepository {
  constructor(
    @InjectRepository(BacktestResultEntity)
    private readonly repository: Repository<BacktestResultEntity>,
  ) {}

  /**
   * 创建回测结果
   */
  async create(data: CreateBacktestResultDto): Promise<BacktestResultEntity> {
    const result = this.repository.create(data);
    return await this.repository.save(result);
  }

  /**
   * 查询某任务的所有结果
   */
  async findByTaskId(taskId: string): Promise<BacktestResultEntity[]> {
    return await this.repository.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 查询主结果
   */
  async findPrimaryByTaskId(taskId: string): Promise<BacktestResultEntity | null> {
    return await this.repository.findOne({
      where: { taskId, isPrimary: true },
    });
  }

  // ... 其他方法
}
```

### CreateBacktestResultDto 示例

```typescript
// backend/src/backtesting/tasks/dto/create-backtest-result.dto.ts

import { FilterConditions, DetailedMetrics } from '../entities/backtest-result.entity';

export class CreateBacktestResultDto {
  taskId: string;
  resultName: string;
  resultDescription?: string;
  isPrimary: boolean;
  
  filterConditions?: FilterConditions;
  tradesCountFiltered: number;
  tradesCountTotal: number;
  
  initialCash: number;
  finalValue: number;
  totalPnl: number;
  totalReturnPct: number;
  annualizedReturnPct?: number;
  
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgProfitPerTrade: number;
  profitFactor?: number;
  expectancy?: number;
  
  sharpeRatio?: number;
  sortinoRatio?: number;
  calmarRatio?: number;
  maxDrawdownPct?: number;
  maxDrawdownValue?: number;
  annualizedVolatilityPct?: number;
  
  avgHoldingBars?: number;
  maxHoldingBars?: number;
  minHoldingBars?: number;
  
  detailedMetrics?: DetailedMetrics;
  calculationTimeMs?: number;
  dataSource?: string;
  
  createdBy?: string;
}
```

---

## 🔍 关键实现细节

### 1. 查询优化

使用 TypeORM 的查询构建器进行复杂查询：

```typescript
async findWithPagination(options: FindOptions) {
  const queryBuilder = this.repository.createQueryBuilder('result');
  
  // 条件过滤
  if (options.taskId) {
    queryBuilder.andWhere('result.taskId = :taskId', { taskId: options.taskId });
  }
  
  if (options.isPrimary !== undefined) {
    queryBuilder.andWhere('result.isPrimary = :isPrimary', { isPrimary: options.isPrimary });
  }
  
  // 排序
  const orderBy = options.orderBy || 'created_at';
  const order = options.order || 'DESC';
  queryBuilder.orderBy(`result.${orderBy}`, order);
  
  // 分页
  const page = options.page || 1;
  const limit = options.limit || 10;
  queryBuilder.skip((page - 1) * limit).take(limit);
  
  // 执行查询
  const [data, total] = await queryBuilder.getManyAndCount();
  
  return { data, total };
}
```

### 2. 事务支持

对于需要原子操作的场景，提供事务支持：

```typescript
async createWithTransaction(
  data: CreateBacktestResultDto,
  queryRunner: QueryRunner
): Promise<BacktestResultEntity> {
  const result = queryRunner.manager.create(BacktestResultEntity, data);
  return await queryRunner.manager.save(result);
}
```

### 3. 错误处理

```typescript
async delete(resultId: string): Promise<void> {
  // 不能删除主结果
  const result = await this.findById(resultId);
  if (!result) {
    throw new NotFoundException(`Result ${resultId} not found`);
  }
  
  if (result.isPrimary) {
    throw new BadRequestException('Cannot delete primary result');
  }
  
  await this.repository.delete(resultId);
}
```

---

## ✅ 验收标准

### 功能验收

- [ ] 所有 CRUD 方法正常工作
- [ ] 查询主结果方法正确
- [ ] 分页查询正确
- [ ] 删除非主结果成功
- [ ] 删除主结果抛出异常
- [ ] Checkpoint 字段更新成功
- [ ] 文件路径字段更新成功

### 代码质量

- [ ] 通过 TypeScript 类型检查
- [ ] 通过 ESLint 检查
- [ ] 所有方法都有注释
- [ ] 错误处理完善
- [ ] 遵循 NestJS 最佳实践

---

## 📝 与其他层的关系

```
Controller (Day 5)
    ↓ 调用
Service (Day 3)
    ↓ 调用
Repository (Day 2) ← 我们现在要做的
    ↓ 访问
Entity (Day 1) ← 已完成
    ↓ 映射
Database
```

**Repository 层的职责**:
- ✅ 封装数据库访问逻辑
- ✅ 提供类型安全的 CRUD 操作
- ✅ 处理复杂查询
- ❌ 不包含业务逻辑（由 Service 层处理）

---

## 🎯 工作流程

### Step 1: 创建 DTO（30分钟）
- `CreateBacktestResultDto`
- `UpdateBacktestResultDto`

### Step 2: 创建 BacktestResultRepository（2小时）
- 基础 CRUD 方法（8个）
- 查询优化
- 错误处理

### Step 3: 修改 BacktestTaskRepository（1小时）
- Checkpoint 方法（2个）
- 文件路径方法（2个）

### Step 4: 更新模块注册（30分钟）
- 在 `TasksModule` 中注册新的 Repository
- 导出供其他模块使用

---

## 📦 依赖关系

### 已完成（Day 1）
- ✅ `BacktestResultEntity`
- ✅ `BacktestTaskEntity` 修改

### Day 2 需要
- TypeORM
- NestJS @nestjs/typeorm
- class-validator (DTO 验证)
- class-transformer (DTO 转换)

### Day 2 为后续提供
- Repository 接口供 Service 层调用
- DTO 供 Controller 层使用

---

## 🚀 完成后的效果

Day 2 完成后，我们将拥有：

1. **完整的数据访问层**
   - BacktestResultRepository（8个方法）
   - BacktestTaskRepository（4个新方法）

2. **类型安全的 DTO**
   - CreateBacktestResultDto
   - UpdateBacktestResultDto

3. **为 Day 3 做好准备**
   - Service 层可以直接调用 Repository
   - 不需要直接操作 Entity

---

## ❓ 需要确认的问题

### 1. 是否需要软删除？

**选项 A**: 物理删除
```typescript
async delete(resultId: string) {
  await this.repository.delete(resultId);
}
```

**选项 B**: 软删除
```typescript
async delete(resultId: string) {
  await this.repository.softDelete(resultId);
}
```

**我的建议**: 物理删除 ⭐
- 派生结果可以随时重新生成
- 避免数据库膨胀

---

### 2. 是否需要批量操作？

**选项 A**: 只提供单个操作
```typescript
async delete(resultId: string)
```

**选项 B**: 提供批量操作
```typescript
async deleteMany(resultIds: string[])
async deleteDerivedResults(taskId: string)  // 删除某任务的所有派生结果
```

**我的建议**: 后续需要时再添加 ⭐
- MVP 阶段先实现基础功能
- 避免过度设计

---

### 3. 缓存策略？

**选项 A**: Repository 层不做缓存
- 缓存由 Service 层处理

**选项 B**: Repository 层添加缓存
- 使用 Redis 缓存常用查询

**我的建议**: Repository 不做缓存 ⭐
- 保持 Repository 简单
- 缓存逻辑放在 Service 层更合适

---

## 📊 预估工作量分解

| 任务 | 预估时间 | 优先级 |
|------|---------|--------|
| 创建 DTO | 30分钟 | P0 |
| BacktestResultRepository | 2小时 | P0 |
| 修改 BacktestTaskRepository | 1小时 | P0 |
| 模块注册和导出 | 30分钟 | P0 |
| **总计** | **4小时** | - |

---

## 🎯 总结

**Day 2 的核心目标**:
- ✅ 创建完整的 Repository 层
- ✅ 提供类型安全的数据访问接口
- ✅ 为 Day 3 Service 层做好准备

**交付物**:
- 2 个 DTO 文件
- 1 个新 Repository（BacktestResultRepository）
- 1 个修改的 Repository（BacktestTaskRepository）
- 模块配置更新

**准备好开始了吗？** 🚀

或者您对 Day 2 的工作内容有任何疑问或调整？
