import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateDatasetsAndImports1731350400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'datasets',
        columns: [
          {
            name: 'dataset_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            comment: '自增主键，标识数据集唯一 ID',
          },
          {
            name: 'source',
            type: 'text',
            isNullable: true,
            comment: '数据来源渠道，可为空表示未知',
          },
          {
            name: 'trading_pair',
            type: 'text',
            isNullable: false,
            comment: '交易对或标的符号，例如 BTC/USDT、AAPL',
          },
          {
            name: 'granularity',
            type: 'text',
            isNullable: false,
            comment: '时间粒度，如 1m、5m、1d',
          },
          {
            name: 'path',
            type: 'text',
            isNullable: false,
            comment: '清洗后 Parquet 文件的相对存储路径',
          },
          {
            name: 'time_start',
            type: 'timestamptz',
            isNullable: false,
            comment: '数据集中最早一条记录的时间（UTC）',
          },
          {
            name: 'time_end',
            type: 'timestamptz',
            isNullable: false,
            comment: '数据集中最新一条记录的时间（UTC）',
          },
          {
            name: 'row_count',
            type: 'bigint',
            isNullable: false,
            comment: '数据集中包含的记录条数',
          },
          {
            name: 'checksum',
            type: 'text',
            isNullable: false,
            comment: '清洗结果文件的校验值（如 MD5）',
          },
          {
            name: 'labels',
            type: 'jsonb',
            isNullable: false,
            comment: '自定义标签集合，入库前需去重与裁剪',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: '数据集描述或备注信息',
          },
          {
            name: 'created_by',
            type: 'text',
            isNullable: true,
            comment: '数据集创建人标识（预留）',
          },
          {
            name: 'updated_by',
            type: 'text',
            isNullable: true,
            comment: '最后编辑人标识（预留）',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: () => 'CURRENT_TIMESTAMP',
            isNullable: false,
            comment: '记录创建时间',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: () => 'CURRENT_TIMESTAMP',
            isNullable: false,
            comment: '记录最近更新时间',
          },
          {
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '软删除标记时间，NULL 表示有效',
          },
        ],
        comment: '交易数据集元信息表，用于存储清洗后的数据集描述',
      }),
      true,
    );

    await queryRunner.query(
      `ALTER TABLE datasets ALTER COLUMN labels SET DEFAULT '[]'::jsonb;`,
    );

    await queryRunner.query(`
      CREATE INDEX idx_datasets_lookup
      ON datasets (COALESCE(source, 'unknown'), trading_pair, granularity, time_start)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.createTable(
      new Table({
        name: 'imports',
        columns: [
          {
            name: 'import_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            comment: '自增主键，标识导入任务唯一 ID',
          },
          {
            name: 'dataset_id',
            type: 'integer',
            isNullable: true,
            comment: '关联成功生成的数据集 ID',
          },
          {
            name: 'source_file',
            type: 'text',
            isNullable: false,
            comment: '用户上传的原始文件名',
          },
          {
            name: 'stored_file_path',
            type: 'text',
            isNullable: false,
            comment: '原始文件在 raw_uploads 目录中的相对路径',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            comment: '导入任务提交时的附加元数据（来源、交易对等）',
          },
          {
            name: 'plugin_name',
            type: 'text',
            isNullable: false,
            comment: '处理该任务的清洗插件名称',
          },
          {
            name: 'plugin_version',
            type: 'text',
            isNullable: false,
            comment: '清洗插件版本号',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            isNullable: false,
            comment:
              '导入任务状态：pending/uploading/processing/completed/failed',
          },
          {
            name: 'progress',
            type: 'numeric',
            precision: 5,
            scale: 2,
            default: 0,
            isNullable: false,
            comment: '导入任务完成进度百分比（0-100）',
          },
          {
            name: 'stage',
            type: 'varchar',
            length: '64',
            isNullable: true,
            comment: '当前阶段标识，例如 uploading、cleaning、storing',
          },
          {
            name: 'message',
            type: 'text',
            isNullable: true,
            comment: '状态摘要或错误信息',
          },
          {
            name: 'error_log',
            type: 'text',
            isNullable: true,
            comment: '完整错误日志内容，失败时记录',
          },
          {
            name: 'created_by',
            type: 'text',
            isNullable: true,
            comment: '导入任务创建人标识（预留）',
          },
          {
            name: 'updated_by',
            type: 'text',
            isNullable: true,
            comment: '导入任务最后编辑人标识（预留）',
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            default: () => 'CURRENT_TIMESTAMP',
            isNullable: false,
            comment: '任务开始时间',
          },
          {
            name: 'finished_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '任务结束时间（成功或失败）',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: () => 'CURRENT_TIMESTAMP',
            isNullable: false,
            comment: '记录创建时间',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: () => 'CURRENT_TIMESTAMP',
            isNullable: false,
            comment: '记录最近更新时间',
          },
        ],
        comment: '导入任务表，用于跟踪上传、清洗进度及错误信息',
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'imports',
      new TableForeignKey({
        columnNames: ['dataset_id'],
        referencedTableName: 'datasets',
        referencedColumnNames: ['dataset_id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        name: 'fk_imports_dataset',
      }),
    );

    await queryRunner.query(`
      CREATE INDEX idx_imports_status ON imports (status);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_imports_dataset ON imports (dataset_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_imports_dataset;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_imports_status;`);
    await queryRunner.dropForeignKey('imports', 'fk_imports_dataset');
    await queryRunner.dropTable('imports');
    await queryRunner.query(`DROP INDEX IF EXISTS idx_datasets_lookup;`);
    await queryRunner.dropTable('datasets');
  }
}
