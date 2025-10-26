import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateBacktestTasks1732600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'backtest_tasks',
        columns: [
          {
            name: 'task_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            comment: '回测任务主键 ID',
          },
          {
            name: 'name',
            type: 'text',
            isNullable: false,
            comment: '任务名称',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: '任务描述',
          },
          {
            name: 'strategy_id',
            type: 'integer',
            isNullable: false,
            comment: '关联的策略 ID',
          },
          {
            name: 'script_id',
            type: 'integer',
            isNullable: false,
            comment: '关联的脚本版本 ID',
          },
          {
            name: 'dataset_id',
            type: 'integer',
            isNullable: false,
            comment: '关联的数据集 ID',
          },
          {
            name: 'backtest_start_date',
            type: 'timestamptz',
            isNullable: false,
            comment: '回测开始日期',
          },
          {
            name: 'backtest_end_date',
            type: 'timestamptz',
            isNullable: false,
            comment: '回测结束日期',
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: false,
            comment: '回测配置参数（JSON）',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['submitted', 'queued', 'running', 'finished', 'failed', 'cancelled'],
            default: "'submitted'",
            isNullable: false,
            comment: '任务状态',
          },
          {
            name: 'progress',
            type: 'integer',
            isNullable: true,
            default: 0,
            comment: '执行进度 (0-100)',
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
            comment: '错误信息（失败时记录）',
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '任务开始执行时间',
          },
          {
            name: 'finished_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '任务完成时间',
          },
          {
            name: 'result_summary',
            type: 'jsonb',
            isNullable: true,
            comment: '结果摘要（JSON）',
          },
          {
            name: 'result_storage_path',
            type: 'text',
            isNullable: true,
            comment: '结果存储路径',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
            comment: '创建时间',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
            comment: '更新时间',
          },
          {
            name: 'created_by',
            type: 'text',
            isNullable: true,
            comment: '创建人',
          },
          {
            name: 'updated_by',
            type: 'text',
            isNullable: true,
            comment: '更新人',
          },
          {
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '软删除标记时间',
          },
        ],
      }),
      true,
    );

    // 添加外键约束
    await queryRunner.createForeignKey(
      'backtest_tasks',
      new TableForeignKey({
        columnNames: ['strategy_id'],
        referencedColumnNames: ['strategy_id'],
        referencedTableName: 'strategies',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'backtest_tasks',
      new TableForeignKey({
        columnNames: ['script_id'],
        referencedColumnNames: ['script_id'],
        referencedTableName: 'strategy_scripts',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'backtest_tasks',
      new TableForeignKey({
        columnNames: ['dataset_id'],
        referencedColumnNames: ['dataset_id'],
        referencedTableName: 'datasets',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    );

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX idx_backtest_tasks_strategy_id ON backtest_tasks(strategy_id);
      CREATE INDEX idx_backtest_tasks_status ON backtest_tasks(status);
      CREATE INDEX idx_backtest_tasks_created_at ON backtest_tasks(created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_backtest_tasks_created_at;
      DROP INDEX IF EXISTS idx_backtest_tasks_status;
      DROP INDEX IF EXISTS idx_backtest_tasks_strategy_id;
    `);

    // 删除表（外键会自动删除）
    await queryRunner.dropTable('backtest_tasks', true);
  }
}

