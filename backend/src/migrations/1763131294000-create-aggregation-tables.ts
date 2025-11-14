import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateAggregationTables1763131294000 implements MigrationInterface {
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
            comment: '聚合记录主键',
          },
          {
            name: 'dataset_id',
            type: 'integer',
            isNullable: false,
            comment: '所属数据集ID',
          },
          {
            name: 'source_granularity',
            type: 'text',
            isNullable: false,
            comment: '源数据粒度，如 1m',
          },
          {
            name: 'target_granularity',
            type: 'text',
            isNullable: false,
            comment: '目标聚合粒度，如 5m, 1h, 1d',
          },
          {
            name: 'path',
            type: 'text',
            isNullable: false,
            comment: '聚合结果Parquet文件相对路径',
          },
          {
            name: 'time_start',
            type: 'timestamptz',
            isNullable: false,
            comment: '聚合数据起始时间（UTC）',
          },
          {
            name: 'time_end',
            type: 'timestamptz',
            isNullable: false,
            comment: '聚合数据结束时间（UTC）',
          },
          {
            name: 'row_count',
            type: 'bigint',
            isNullable: false,
            default: 0,
            comment: '聚合结果记录条数',
          },
          {
            name: 'checksum',
            type: 'text',
            isNullable: false,
            default: "''",
            comment: '聚合文件校验和（MD5）',
          },
          {
            name: 'status',
            type: 'text',
            isNullable: false,
            default: "'pending'",
            comment: '聚合状态：pending/processing/completed/failed',
          },
          {
            name: 'progress',
            type: 'numeric(5,2)',
            isNullable: false,
            default: 0,
            comment: '聚合进度百分比（0-100）',
          },
          {
            name: 'error_log',
            type: 'text',
            isNullable: true,
            comment: '聚合失败时的错误日志',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            comment: '记录创建时间',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            comment: '记录更新时间',
          },
        ],
      }),
      true,
    );

    // 创建唯一索引：一个数据集的每个粒度只能有一条聚合记录
    await queryRunner.createIndex(
      'dataset_aggregations',
      new TableIndex({
        name: 'idx_aggregations_dataset_granularity_unique',
        columnNames: ['dataset_id', 'target_granularity'],
        isUnique: true,
      }),
    );

    // 创建普通索引
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

    // 创建外键
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
            comment: '聚合任务主键',
          },
          {
            name: 'aggregation_id',
            type: 'integer',
            isNullable: true,
            comment: '关联的聚合记录ID',
          },
          {
            name: 'dataset_id',
            type: 'integer',
            isNullable: false,
            comment: '所属数据集ID',
          },
          {
            name: 'target_granularity',
            type: 'text',
            isNullable: false,
            comment: '目标聚合粒度',
          },
          {
            name: 'trigger_type',
            type: 'text',
            isNullable: false,
            comment: '触发方式：auto（自动）/manual（手动）/retry（重试）',
          },
          {
            name: 'triggered_by',
            type: 'text',
            isNullable: true,
            comment: '触发人标识',
          },
          {
            name: 'status',
            type: 'text',
            isNullable: false,
            default: "'pending'",
            comment: '任务状态：pending/running/completed/failed/cancelled',
          },
          {
            name: 'progress',
            type: 'numeric(5,2)',
            isNullable: false,
            default: 0,
            comment: '任务进度百分比（0-100）',
          },
          {
            name: 'message',
            type: 'text',
            isNullable: true,
            comment: '任务消息（如成功提示、错误摘要）',
          },
          {
            name: 'error_log',
            type: 'text',
            isNullable: true,
            comment: '详细错误日志（堆栈跟踪）',
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '任务开始时间',
          },
          {
            name: 'finished_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '任务完成时间',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            comment: '记录创建时间',
          },
        ],
      }),
      true,
    );

    // 创建索引
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

    // 创建外键
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

