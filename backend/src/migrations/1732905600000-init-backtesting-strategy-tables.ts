import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class InitBacktestingStrategyTables1732905600000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await queryRunner.createTable(
      new Table({
        name: 'strategies',
        columns: [
          {
            name: 'strategy_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
            comment: '策略唯一标识',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '60',
            isNullable: false,
            isUnique: true,
            comment: '策略名称',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: '策略描述',
          },
          {
            name: 'tags',
            type: 'jsonb',
            isNullable: false,
            default: "'[]'::jsonb",
            comment: '标签数组，最多 6 个',
          },
          {
            name: 'created_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
            comment: '创建人标识',
          },
          {
            name: 'updated_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
            comment: '最近更新人标识',
          },
          {
            name: 'default_script_version_id',
            type: 'uuid',
            isNullable: true,
            comment: '默认 master 脚本版本 ID',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
            comment: '记录创建时间',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
            comment: '记录最近更新时间',
          },
        ],
        comment: '策略主表，存储策略元信息',
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'script_versions',
        columns: [
          {
            name: 'script_version_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
            comment: '脚本版本唯一标识',
          },
          {
            name: 'strategy_id',
            type: 'uuid',
            isNullable: false,
            comment: '所属策略 ID',
          },
          {
            name: 'version_name',
            type: 'varchar',
            length: '20',
            isNullable: false,
            comment: '脚本版本号',
          },
          {
            name: 'is_master',
            type: 'boolean',
            isNullable: false,
            default: false,
            comment: '是否 master 版本',
          },
          {
            name: 'code',
            type: 'text',
            isNullable: false,
            comment: '策略脚本源码',
          },
          {
            name: 'parameter_schema',
            type: 'jsonb',
            isNullable: false,
            default: "'[]'::jsonb",
            comment: '参数 Schema JSON',
          },
          {
            name: 'factor_schema',
            type: 'jsonb',
            isNullable: false,
            default: "'[]'::jsonb",
            comment: '因子 Schema JSON',
          },
          {
            name: 'remark',
            type: 'text',
            isNullable: true,
            comment: '版本备注',
          },
          {
            name: 'created_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
            comment: '版本创建人',
          },
          {
            name: 'updated_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
            comment: '版本更新人',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
            comment: '记录创建时间',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
            comment: '记录最近更新时间',
          },
          {
            name: 'last_referenced_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '最近被回测任务引用时间',
          },
        ],
        comment: '策略脚本版本表，占位结构用于后续扩展脚本元信息',
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'script_versions',
      new TableForeignKey({
        name: 'fk_script_versions_strategy',
        columnNames: ['strategy_id'],
        referencedTableName: 'strategies',
        referencedColumnNames: ['strategy_id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.query(
      `CREATE INDEX idx_script_versions_strategy ON script_versions (strategy_id);`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_script_versions_strategy_version ON script_versions (strategy_id, version_name);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_script_versions_strategy_version;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_script_versions_strategy;`,
    );
    await queryRunner.dropForeignKey(
      'script_versions',
      'fk_script_versions_strategy',
    );
    await queryRunner.dropTable('script_versions');
    await queryRunner.dropTable('strategies');
  }
}
