# 数据聚合功能实施清单

## 📋 Milestone 1: 基础预聚合（2-3周）

### 1.1 数据库迁移

**文件**：`backend/src/migrations/{timestamp}-create-aggregation-tables.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateAggregationTables1234567890000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 dataset_aggregations 表
    await queryRunner.createTable(
      new Table({
        name: 'dataset_aggregations',
        columns: [
          {
            name: 'aggregation_id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'dataset_id',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'source_granularity',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'target_granularity',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'path',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'time_start',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'time_end',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'row_count',
            type: 'bigint',
            isNullable: false,
            default: 0,
          },
          {
            name: 'checksum',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'status',
            type: 'text',
            isNullable: false,
            default: "'pending'",
          },
          {
            name: 'progress',
            type: 'numeric(5,2)',
            isNullable: false,
            default: 0,
          },
          {
            name: 'error_log',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // 唯一约束
    await queryRunner.createIndex(
      'dataset_aggregations',
      new TableIndex({
        name: 'idx_aggregations_dataset_granularity_unique',
        columnNames: ['dataset_id', 'target_granularity'],
        isUnique: true,
      }),
    );

    // 索引
    await queryRunner.createIndex(
      'dataset_aggregations',
      new TableIndex({
        name: 'idx_aggregations_dataset',
        columnNames: ['dataset_id'],
      }),
    );

    await queryRunner.createIndex(
      'dataset_aggregations',
      new TableIndex({
        name: 'idx_aggregations_status',
        columnNames: ['status'],
      }),
    );

    // 外键
    await queryRunner.createForeignKey(
      'dataset_aggregations',
      new TableForeignKey({
        columnNames: ['dataset_id'],
        referencedColumnNames: ['dataset_id'],
        referencedTableName: 'datasets',
        onDelete: 'CASCADE',
      }),
    );

    // 创建 aggregation_tasks 表
    await queryRunner.createTable(
      new Table({
        name: 'aggregation_tasks',
        columns: [
          {
            name: 'task_id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'aggregation_id',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'dataset_id',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'target_granularity',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'trigger_type',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'triggered_by',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'text',
            isNullable: false,
            default: "'pending'",
          },
          {
            name: 'progress',
            type: 'numeric(5,2)',
            isNullable: false,
            default: 0,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'error_log',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'finished_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // 索引
    await queryRunner.createIndex(
      'aggregation_tasks',
      new TableIndex({
        name: 'idx_aggregation_tasks_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'aggregation_tasks',
      new TableIndex({
        name: 'idx_aggregation_tasks_dataset',
        columnNames: ['dataset_id'],
      }),
    );

    // 外键
    await queryRunner.createForeignKey(
      'aggregation_tasks',
      new TableForeignKey({
        columnNames: ['aggregation_id'],
        referencedColumnNames: ['aggregation_id'],
        referencedTableName: 'dataset_aggregations',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'aggregation_tasks',
      new TableForeignKey({
        columnNames: ['dataset_id'],
        referencedColumnNames: ['dataset_id'],
        referencedTableName: 'datasets',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('aggregation_tasks');
    await queryRunner.dropTable('dataset_aggregations');
  }
}
```

**检查项**：
- [ ] 运行迁移：`npm run migration:run`
- [ ] 验证表已创建：`\dt dataset_aggregations aggregation_tasks`
- [ ] 验证索引和外键

---

### 1.2 Entity 定义

#### 文件：`backend/src/trading-data/entities/dataset-aggregation.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DatasetEntity } from './dataset.entity';

export enum AggregationStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

@Entity({ name: 'dataset_aggregations' })
export class DatasetAggregationEntity {
  @PrimaryGeneratedColumn({ name: 'aggregation_id' })
  aggregationId!: number;

  @Column({ name: 'dataset_id', type: 'integer' })
  datasetId!: number;

  @ManyToOne(() => DatasetEntity, (dataset) => dataset.aggregations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dataset_id' })
  dataset!: DatasetEntity;

  @Column({ name: 'source_granularity', type: 'text' })
  sourceGranularity!: string;

  @Column({ name: 'target_granularity', type: 'text' })
  targetGranularity!: string;

  @Column({ type: 'text' })
  path!: string;

  @Column({ name: 'time_start', type: 'timestamptz' })
  timeStart!: Date;

  @Column({ name: 'time_end', type: 'timestamptz' })
  timeEnd!: Date;

  @Column({ name: 'row_count', type: 'bigint', transformer: bigIntTransformer })
  rowCount!: number;

  @Column({ type: 'text' })
  checksum!: string;

  @Column({
    type: 'text',
    enum: AggregationStatus,
    default: AggregationStatus.Pending,
  })
  status!: AggregationStatus;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  progress!: number;

  @Column({ name: 'error_log', type: 'text', nullable: true })
  errorLog?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

const bigIntTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | number | null): number | null =>
    value === null ? null : Number(value),
};
```

#### 文件：`backend/src/trading-data/entities/aggregation-task.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DatasetEntity } from './dataset.entity';
import { DatasetAggregationEntity } from './dataset-aggregation.entity';

export enum AggregationTaskStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum TriggerType {
  Auto = 'auto',
  Manual = 'manual',
  Retry = 'retry',
}

@Entity({ name: 'aggregation_tasks' })
export class AggregationTaskEntity {
  @PrimaryGeneratedColumn({ name: 'task_id' })
  taskId!: number;

  @Column({ name: 'aggregation_id', type: 'integer', nullable: true })
  aggregationId?: number | null;

  @ManyToOne(() => DatasetAggregationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'aggregation_id' })
  aggregation?: DatasetAggregationEntity;

  @Column({ name: 'dataset_id', type: 'integer' })
  datasetId!: number;

  @ManyToOne(() => DatasetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dataset_id' })
  dataset!: DatasetEntity;

  @Column({ name: 'target_granularity', type: 'text' })
  targetGranularity!: string;

  @Column({ name: 'trigger_type', type: 'text', enum: TriggerType })
  triggerType!: TriggerType;

  @Column({ name: 'triggered_by', type: 'text', nullable: true })
  triggeredBy?: string | null;

  @Column({
    type: 'text',
    enum: AggregationTaskStatus,
    default: AggregationTaskStatus.Pending,
  })
  status!: AggregationTaskStatus;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  progress!: number;

  @Column({ type: 'text', nullable: true })
  message?: string | null;

  @Column({ name: 'error_log', type: 'text', nullable: true })
  errorLog?: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
```

**检查项**：
- [ ] Entity 文件创建完成
- [ ] 在 `DatasetEntity` 中添加 `aggregations` 关系
- [ ] TypeScript 编译无错误

---

### 1.3 聚合服务核心逻辑

#### 文件：`backend/src/trading-data/services/data-aggregation.service.ts`

```typescript
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { mkdir, createReadStream } from 'fs';
import { dirname } from 'path';
import { promisify } from 'util';
import { createHash } from 'crypto';
import * as duckdb from 'duckdb';
import { DatasetEntity } from '../entities/dataset.entity';
import {
  DatasetAggregationEntity,
  AggregationStatus,
} from '../entities/dataset-aggregation.entity';
import {
  AggregationTaskEntity,
  AggregationTaskStatus,
  TriggerType,
} from '../entities/aggregation-task.entity';
import { resolveDatasetPath } from '../../config/storage.config';

const mkdirAsync = promisify(mkdir);

interface AggregationConfig {
  sourceGranularity: string;
  targetGranularity: string;
  sourcePaths: string[];
  outputPath: string;
  timeStart: Date;
  timeEnd: Date;
}

@Injectable()
export class DataAggregationService {
  private readonly logger = new Logger(DataAggregationService.name);

  // 默认预聚合粒度
  private readonly DEFAULT_GRANULARITIES = ['5m', '1h'];

  constructor(
    @InjectRepository(DatasetEntity)
    private datasetRepo: Repository<DatasetEntity>,
    @InjectRepository(DatasetAggregationEntity)
    private aggregationRepo: Repository<DatasetAggregationEntity>,
    @InjectRepository(AggregationTaskEntity)
    private taskRepo: Repository<AggregationTaskEntity>,
  ) {}

  /**
   * 为数据集创建聚合任务
   */
  async createAggregationTasks(
    datasetId: number,
    targetGranularities?: string[],
    triggerType: TriggerType = TriggerType.Auto,
    triggeredBy?: string,
  ): Promise<AggregationTaskEntity[]> {
    const dataset = await this.datasetRepo.findOne({
      where: { datasetId },
      relations: ['batches'],
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    const granularities = targetGranularities || this.DEFAULT_GRANULARITIES;
    const tasks: AggregationTaskEntity[] = [];

    for (const targetGranularity of granularities) {
      // 验证聚合粒度合法性
      if (!this.canAggregate(dataset.granularity, targetGranularity)) {
        this.logger.warn(
          `Cannot aggregate from ${dataset.granularity} to ${targetGranularity}, skipping`,
        );
        continue;
      }

      // 检查是否已存在聚合记录
      let aggregation = await this.aggregationRepo.findOne({
        where: { datasetId, targetGranularity },
      });

      if (!aggregation) {
        aggregation = this.aggregationRepo.create({
          datasetId,
          sourceGranularity: dataset.granularity,
          targetGranularity,
          path: this.buildAggregationPath(dataset, targetGranularity),
          timeStart: dataset.timeStart,
          timeEnd: dataset.timeEnd,
          rowCount: 0,
          checksum: '',
          status: AggregationStatus.Pending,
        });
        await this.aggregationRepo.save(aggregation);
      }

      // 创建任务
      const task = this.taskRepo.create({
        aggregationId: aggregation.aggregationId,
        datasetId,
        targetGranularity,
        triggerType,
        triggeredBy,
        status: AggregationTaskStatus.Pending,
      });

      tasks.push(await this.taskRepo.save(task));
    }

    // 异步执行聚合
    setImmediate(() => {
      tasks.forEach((task) => this.executeAggregation(task.taskId));
    });

    return tasks;
  }

  /**
   * 执行聚合任务
   */
  private async executeAggregation(taskId: number): Promise<void> {
    const task = await this.taskRepo.findOne({
      where: { taskId },
      relations: ['dataset', 'aggregation'],
    });

    if (!task) {
      this.logger.error(`Task ${taskId} not found`);
      return;
    }

    const logger = new Logger(`AggregationTask-${taskId}`);

    try {
      logger.log(`开始执行聚合任务 ${taskId}`);

      // 更新任务状态
      await this.taskRepo.update(taskId, {
        status: AggregationTaskStatus.Running,
        startedAt: new Date(),
      });

      const dataset = task.dataset;
      const aggregation = task.aggregation!;

      // 收集源文件路径
      const batches = await this.datasetRepo
        .createQueryBuilder('dataset')
        .leftJoinAndSelect('dataset.batches', 'batch')
        .where('dataset.datasetId = :datasetId', { datasetId: dataset.datasetId })
        .getOne();

      const sourcePaths = (batches?.batches || []).map((b) =>
        resolveDatasetPath(b.path),
      );

      if (!sourcePaths.length) {
        throw new Error('No source files found for aggregation');
      }

      // 构建输出路径
      const outputPath = resolveDatasetPath(aggregation.path);
      await mkdirAsync(dirname(outputPath), { recursive: true });

      // 执行聚合
      const config: AggregationConfig = {
        sourceGranularity: dataset.granularity,
        targetGranularity: task.targetGranularity,
        sourcePaths,
        outputPath,
        timeStart: dataset.timeStart,
        timeEnd: dataset.timeEnd,
      };

      const stats = await this.performAggregation(config);

      // 计算校验和
      const checksum = await this.computeFileChecksum(outputPath);

      // 更新聚合记录
      await this.aggregationRepo.update(aggregation.aggregationId, {
        rowCount: stats.rowCount,
        checksum,
        status: AggregationStatus.Completed,
        timeStart: stats.timeStart,
        timeEnd: stats.timeEnd,
        progress: 100,
      });

      // 更新任务状态
      await this.taskRepo.update(taskId, {
        status: AggregationTaskStatus.Completed,
        progress: 100,
        finishedAt: new Date(),
        message: `成功聚合 ${stats.rowCount} 条记录`,
      });

      logger.log(
        `聚合任务 ${taskId} 完成，生成 ${stats.rowCount} 条记录`,
      );
    } catch (error: any) {
      logger.error(`聚合任务 ${taskId} 失败: ${error.message}`);

      await this.taskRepo.update(taskId, {
        status: AggregationTaskStatus.Failed,
        message: error.message,
        errorLog: error.stack,
        finishedAt: new Date(),
      });

      if (task.aggregationId) {
        await this.aggregationRepo.update(task.aggregationId, {
          status: AggregationStatus.Failed,
        });
      }
    }
  }

  /**
   * 执行DuckDB聚合计算并导出Parquet
   */
  private async performAggregation(
    config: AggregationConfig,
  ): Promise<{ rowCount: number; timeStart: Date; timeEnd: Date }> {
    const intervalSeconds = this.parseGranularityToSeconds(
      config.targetGranularity,
    );

    const escapedPaths = config.sourcePaths
      .map((p) => `'${this.escapeSql(p)}'`)
      .join(', ');

    const sql = `
      WITH source_data AS (
        SELECT 
          timestamp,
          open,
          high,
          low,
          close,
          volume,
          trades,
          notional
        FROM read_parquet([${escapedPaths}])
        WHERE timestamp >= TIMESTAMP '${config.timeStart.toISOString()}'
          AND timestamp < TIMESTAMP '${config.timeEnd.toISOString()}'
      ),
      bucketed AS (
        SELECT 
          *,
          CAST(
            FLOOR(epoch(timestamp) / ${intervalSeconds}) * ${intervalSeconds}
          AS BIGINT) AS bucket
        FROM source_data
      )
      SELECT
        to_timestamp(bucket) AS timestamp,
        arg_min(open, timestamp) AS open,
        max(high) AS high,
        min(low) AS low,
        arg_max(close, timestamp) AS close,
        sum(volume) AS volume,
        sum(COALESCE(trades, 0)) AS trades,
        sum(COALESCE(notional, 0)) AS notional
      FROM bucketed
      GROUP BY bucket
      ORDER BY bucket
    `;

    // 导出到Parquet
    const exportSQL = `
      COPY (${sql})
      TO '${this.escapeSql(config.outputPath)}'
      (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
    `;

    const db = new duckdb.Database(':memory:');
    const connection = db.connect();

    try {
      await this.execDuckDB(connection, exportSQL);

      // 获取统计信息
      const stats = await this.getAggregationStats(connection, sql);

      return stats;
    } finally {
      connection.close();
      db.close();
    }
  }

  /**
   * 获取聚合统计信息
   */
  private async getAggregationStats(
    connection: duckdb.Connection,
    sql: string,
  ): Promise<{ rowCount: number; timeStart: Date; timeEnd: Date }> {
    const statsSql = `
      SELECT 
        COUNT(*) AS row_count,
        MIN(timestamp) AS time_start,
        MAX(timestamp) AS time_end
      FROM (${sql})
    `;

    return new Promise((resolve, reject) => {
      connection.all(statsSql, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const row = rows[0];
        resolve({
          rowCount: Number(row.row_count),
          timeStart: new Date(row.time_start),
          timeEnd: new Date(row.time_end),
        });
      });
    });
  }

  /**
   * 执行DuckDB SQL
   */
  private execDuckDB(
    connection: duckdb.Connection,
    sql: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 验证聚合粒度合法性
   */
  private canAggregate(source: string, target: string): boolean {
    const sourceMs = this.parseGranularityToMs(source);
    const targetMs = this.parseGranularityToMs(target);

    // 目标粒度必须大于等于源粒度
    if (targetMs < sourceMs) {
      return false;
    }

    // 目标粒度必须是源粒度的整数倍
    return targetMs % sourceMs === 0;
  }

  /**
   * 解析粒度到毫秒
   */
  private parseGranularityToMs(granularity: string): number {
    return this.parseGranularityToSeconds(granularity) * 1000;
  }

  /**
   * 解析粒度到秒
   */
  private parseGranularityToSeconds(granularity: string): number {
    const match = granularity.match(/^(\d+)([smhdwM])$/);
    if (!match) {
      throw new BadRequestException(
        `Invalid granularity format: ${granularity}`,
      );
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const unitMap: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800,
      M: 2592000, // 30天近似
    };

    return value * unitMap[unit];
  }

  /**
   * 构建聚合结果存储路径
   */
  private buildAggregationPath(
    dataset: DatasetEntity,
    targetGranularity: string,
  ): string {
    const source = dataset.source || 'unknown';
    const pair = dataset.tradingPair.replace('/', '_');
    return `${source}/${pair}/${targetGranularity}/agg_${targetGranularity}_from_${dataset.granularity}.parquet`;
  }

  /**
   * 计算文件校验和
   */
  private async computeFileChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5');
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * SQL转义
   */
  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
```

**检查项**：
- [ ] 服务文件创建完成
- [ ] 在 `TradingDataModule` 中注册服务
- [ ] 注入依赖的 Repository
- [ ] TypeScript 编译无错误

---

### 1.4 API Controller

#### 文件：`backend/src/trading-data/controllers/aggregations.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DataAggregationService } from '../services/data-aggregation.service';
import { TriggerType } from '../entities/aggregation-task.entity';

class CreateAggregationDto {
  granularities?: string[];
  triggeredBy?: string;
}

class ListAggregationsQuery {
  status?: string;
}

@ApiTags('aggregations')
@Controller('trading-data/datasets/:datasetId/aggregations')
export class AggregationsController {
  constructor(
    private readonly aggregationService: DataAggregationService,
  ) {}

  @Post()
  @ApiOperation({ summary: '手动触发数据集聚合' })
  @ApiResponse({ status: 201, description: '聚合任务创建成功' })
  async createAggregation(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Body() dto: CreateAggregationDto,
  ) {
    const tasks = await this.aggregationService.createAggregationTasks(
      datasetId,
      dto.granularities,
      TriggerType.Manual,
      dto.triggeredBy,
    );

    return {
      message: `创建了 ${tasks.length} 个聚合任务`,
      tasks,
    };
  }

  @Get()
  @ApiOperation({ summary: '查询数据集的聚合列表' })
  async listAggregations(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Query() query: ListAggregationsQuery,
  ) {
    // TODO: 实现查询逻辑
    return {
      aggregations: [],
    };
  }

  @Get('tasks')
  @ApiOperation({ summary: '查询数据集的聚合任务列表' })
  async listAggregationTasks(
    @Param('datasetId', ParseIntPipe) datasetId: number,
  ) {
    // TODO: 实现查询逻辑
    return {
      tasks: [],
    };
  }
}
```

**检查项**：
- [ ] Controller 文件创建完成
- [ ] 在 `TradingDataModule` 中注册 Controller
- [ ] 路由可访问：`POST /trading-data/datasets/:datasetId/aggregations`

---

### 1.5 修改导入流程（自动触发聚合）

#### 文件：`backend/src/trading-data/services/import-processing.service.ts`

在导入完成后自动触发聚合：

```typescript
// 在 handleInitialImport 方法末尾添加
private async handleInitialImport(
  importTask: ImportTaskEntity,
  summary: ProcessSummary,
  metadata?: ImportMetadataPayload,
): Promise<void> {
  // ... 现有代码 ...

  // ✅ 新增：自动触发聚合
  if (this.shouldAutoAggregate()) {
    await this.aggregationService.createAggregationTasks(
      dataset.datasetId,
      undefined, // 使用默认粒度
      TriggerType.Auto,
      importTask.createdBy,
    );
  }
}

// ✅ 新增：判断是否应自动聚合
private shouldAutoAggregate(): boolean {
  // 可从配置读取，暂时硬编码为 true
  return true;
}
```

**检查项**：
- [ ] 注入 `DataAggregationService`
- [ ] 导入完成后自动创建聚合任务
- [ ] 不阻塞导入完成响应

---

### 1.6 修改查询逻辑（优先使用预聚合）

#### 文件：`backend/src/trading-data/trading-data.service.ts`

修改 `getDatasetCandles` 方法：

```typescript
async getDatasetCandles(
  datasetId: number,
  query: DatasetCandlesQueryDto,
): Promise<CandlesResponse> {
  const dataset = await this.datasetsRepository.findOne({
    where: { datasetId },
    relations: ['batches', 'aggregations'], // ✅ 加载聚合关系
  });

  if (!dataset) {
    throw new NotFoundException(`Dataset ${datasetId} not found`);
  }

  const resolution = query.resolution ?? dataset.granularity;

  // ✅ 检查是否有可用的预聚合数据
  const aggregation = dataset.aggregations?.find(
    (agg) =>
      agg.targetGranularity === resolution &&
      agg.status === AggregationStatus.Completed,
  );

  if (aggregation) {
    // ✅ 使用预聚合数据
    return this.queryCandlesFromAggregation(aggregation, query);
  } else {
    // 降级到实时聚合
    return this.queryCandlesWithRealTimeAggregation(dataset, query);
  }
}

// ✅ 新增：从预聚合数据查询
private async queryCandlesFromAggregation(
  aggregation: DatasetAggregationEntity,
  query: DatasetCandlesQueryDto,
): Promise<CandlesResponse> {
  const aggregationPath = resolveDatasetPath(aggregation.path);

  // 构建查询SQL（无需聚合，直接读取）
  const sql = `
    SELECT
      FLOOR(epoch(timestamp)) AS time,
      open,
      high,
      low,
      close,
      volume
    FROM read_parquet('${this.escapeLiteral(aggregationPath)}')
    WHERE timestamp >= TIMESTAMP '${query.from.toISOString()}'
      AND timestamp <= TIMESTAMP '${query.to.toISOString()}'
    ORDER BY timestamp
    LIMIT ${query.limit}
  `;

  const rows = await this.executeDuckDbQuery(sql);

  return {
    datasetId: aggregation.datasetId,
    symbol: aggregation.dataset.tradingPair,
    granularity: aggregation.sourceGranularity,
    resolution: aggregation.targetGranularity,
    from: Math.floor(query.from.getTime() / 1000),
    to: Math.floor(query.to.getTime() / 1000),
    limit: query.limit,
    hasMore: false, // TODO: 计算是否有更多数据
    candles: rows.map((row: any) => ({
      time: Number(row.time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    })),
  };
}

// ✅ 重命名现有方法
private async queryCandlesWithRealTimeAggregation(
  dataset: DatasetEntity,
  query: DatasetCandlesQueryDto,
): Promise<CandlesResponse> {
  // 现有的实时聚合逻辑
  // ...
}
```

**检查项**：
- [ ] 在 `DatasetEntity` 中添加 `aggregations` 关系
- [ ] 查询逻辑优先使用预聚合
- [ ] 测试预聚合数据查询

---

### 1.7 前端集成

#### 数据集详情页显示聚合状态

**文件**：`frontend/src/modules/trading-data/DatasetDetailPage.tsx`

```typescript
// 获取聚合列表
const { data: aggregations } = useQuery({
  queryKey: ['dataset', datasetId, 'aggregations'],
  queryFn: () => api.get(`/trading-data/datasets/${datasetId}/aggregations`),
});

// 渲染聚合状态
<Card title="数据聚合">
  <Table
    dataSource={aggregations}
    columns={[
      { title: '目标粒度', dataIndex: 'targetGranularity', key: 'targetGranularity' },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        render: (status) => (
          <Badge
            status={status === 'completed' ? 'success' : 'processing'}
            text={status}
          />
        ),
      },
      { title: '记录数', dataIndex: 'rowCount', key: 'rowCount' },
      { title: '进度', dataIndex: 'progress', key: 'progress', render: (p) => `${p}%` },
      { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
    ]}
  />
  <Button onClick={handleTriggerAggregation}>生成聚合</Button>
</Card>
```

**检查项**：
- [ ] 详情页显示聚合列表
- [ ] 显示聚合状态和进度
- [ ] 提供"生成聚合"按钮

---

## 📋 Milestone 2: 增量聚合（1-2周）

### 2.1 追加写入时更新聚合

修改 `ImportProcessingService.handleAppendImport()` 方法，在追加完成后更新聚合：

```typescript
private async handleAppendImport(
  importTask: ImportTaskEntity,
  summary: ProcessSummary,
  metadata: ImportMetadataPayload | undefined,
  dataset: DatasetEntity,
  direction: 'left' | 'right',
): Promise<void> {
  // ... 现有追加逻辑 ...

  // ✅ 新增：增量更新聚合
  await this.aggregationService.updateAggregationsForAppend(
    dataset.datasetId,
    newBatch,
  );
}
```

### 2.2 实现增量聚合方法

在 `DataAggregationService` 中添加：

```typescript
/**
 * 追加写入时更新聚合
 */
async updateAggregationsForAppend(
  datasetId: number,
  newBatch: DatasetBatchEntity,
): Promise<void> {
  const aggregations = await this.aggregationRepo.find({
    where: { datasetId, status: AggregationStatus.Completed },
  });

  for (const aggregation of aggregations) {
    await this.appendAggregation(aggregation, newBatch);
  }
}

/**
 * 追加单个聚合
 */
private async appendAggregation(
  aggregation: DatasetAggregationEntity,
  newBatch: DatasetBatchEntity,
): Promise<void> {
  // 1. 聚合新增批次
  const tempPath = `${aggregation.path}.append.parquet`;
  await this.aggregateSingleBatch(newBatch, aggregation.targetGranularity, tempPath);

  // 2. 合并到现有聚合文件
  await this.mergeParquetFiles(aggregation.path, tempPath);

  // 3. 更新聚合元数据
  const stats = await this.getParquetStats(aggregation.path);
  await this.aggregationRepo.update(aggregation.aggregationId, {
    timeEnd: newBatch.timeEnd,
    rowCount: stats.rowCount,
    checksum: await this.computeFileChecksum(resolveDatasetPath(aggregation.path)),
  });
}
```

---

## 📋 Milestone 3: 查询缓存与监控（1-2周）

### 3.1 查询日志表

```sql
CREATE TABLE query_logs (
  log_id SERIAL PRIMARY KEY,
  dataset_id INTEGER NOT NULL,
  target_granularity TEXT NOT NULL,
  time_start TIMESTAMPTZ NOT NULL,
  time_end TIMESTAMPTZ NOT NULL,
  query_duration_ms INTEGER,
  used_aggregation BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_query_logs_dataset ON query_logs(dataset_id);
CREATE INDEX idx_query_logs_created ON query_logs(created_at);
```

### 3.2 智能推荐任务

```typescript
@Cron('0 0 * * 0') // 每周日凌晨
async analyzeAndRecommendAggregations(): Promise<void> {
  // 分析查询日志，推荐常用粒度
}
```

---

## ✅ 验收测试清单

### 功能测试
- [ ] 导入数据后，自动创建聚合任务
- [ ] 聚合任务状态正确流转（pending → running → completed）
- [ ] 手动触发聚合，任务正常执行
- [ ] 查询预聚合数据，响应速度快
- [ ] 追加数据后，聚合自动更新
- [ ] 聚合失败时，可重试

### 性能测试
- [ ] 1年1分钟数据聚合到1d，耗时<10秒
- [ ] 查询1年日线数据（预聚合），<100ms
- [ ] 查询1年日线数据（实时聚合），2-5秒
- [ ] 预聚合数据查询比实时聚合快20倍以上

### 稳定性测试
- [ ] 并发10个聚合任务不崩溃
- [ ] 聚合失败不影响原始数据
- [ ] 聚合过程中可查询（使用实时聚合降级）

---

**文档版本**：v1.0  
**最后更新**：2025-11-14

