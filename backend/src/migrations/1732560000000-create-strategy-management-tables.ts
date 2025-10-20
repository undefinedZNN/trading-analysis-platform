import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

export class CreateStrategyManagementTables1732560000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'strategies',
        columns: [
          {
            name: 'strategy_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            comment: '策略主键 ID',
          },
          {
            name: 'code',
            type: 'text',
            isNullable: false,
            isUnique: true,
            comment: '策略唯一编码',
          },
          {
            name: 'name',
            type: 'text',
            isNullable: false,
            comment: '策略名称',
          },
          {
            name: 'team',
            type: 'text',
            isNullable: true,
            comment: '归属团队或小组',
          },
          {
            name: 'markets',
            type: 'text',
            isArray: true,
            isNullable: false,
            comment: '适用市场或标的标签集合',
          },
          {
            name: 'frequency',
            type: 'text',
            isNullable: true,
            comment: '交易频率',
          },
          {
            name: 'tags',
            type: 'text',
            isArray: true,
            isNullable: false,
            comment: '策略标签集合',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: '策略说明文档或备注',
          },
          {
            name: 'status',
            type: 'text',
            isNullable: false,
            default: `'draft'`,
            comment: '策略状态：draft/active/archived',
          },
          {
            name: 'archived_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '策略归档时间',
          },
          {
            name: 'created_by',
            type: 'text',
            isNullable: true,
            comment: '记录创建人标识',
          },
          {
            name: 'updated_by',
            type: 'text',
            isNullable: true,
            comment: '记录最后编辑人标识',
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
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '软删除标记时间，NULL 表示有效',
          },
        ],
      }),
      true,
    );

    await queryRunner.query(
      `ALTER TABLE strategies ALTER COLUMN markets SET DEFAULT ARRAY[]::text[];`,
    );
    await queryRunner.query(
      `ALTER TABLE strategies ALTER COLUMN tags SET DEFAULT ARRAY[]::text[];`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_strategies_tags ON strategies USING gin (tags);`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_strategies_markets ON strategies USING gin (markets);`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'strategy_versions',
        columns: [
          {
            name: 'version_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            comment: '策略版本主键 ID',
          },
          {
            name: 'strategy_id',
            type: 'integer',
            isNullable: false,
            comment: '所属策略 ID',
          },
          {
            name: 'version_code',
            type: 'text',
            isNullable: false,
            comment: '策略版本编号',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: '版本描述或摘要',
          },
          {
            name: 'changelog',
            type: 'text',
            isNullable: true,
            comment: '版本变更记录',
          },
          {
            name: 'artifact_path',
            type: 'text',
            isNullable: false,
            comment: '策略脚本归档路径',
          },
          {
            name: 'artifact_checksum',
            type: 'text',
            isNullable: false,
            comment: '归档文件校验值',
          },
          {
            name: 'runtime_config',
            type: 'jsonb',
            isNullable: false,
            default: `'{}'::jsonb`,
            comment: '运行时配置',
          },
          {
            name: 'variables_schema',
            type: 'jsonb',
            isNullable: false,
            default: `'[]'::jsonb`,
            comment: '自定义变量 JSON Schema 列表',
          },
          {
            name: 'factors_schema',
            type: 'jsonb',
            isNullable: false,
            default: `'[]'::jsonb`,
            comment: '自定义因子 JSON Schema 列表',
          },
          {
            name: 'manifest',
            type: 'jsonb',
            isNullable: true,
            comment: '策略 manifest',
          },
          {
            name: 'is_primary',
            type: 'boolean',
            isNullable: false,
            default: false,
            comment: '是否为主版本',
          },
          {
            name: 'status',
            type: 'text',
            isNullable: false,
            default: `'draft'`,
            comment: '版本状态',
          },
          {
            name: 'released_at',
            type: 'timestamptz',
            isNullable: true,
            comment: '发布上线时间',
          },
          {
            name: 'created_by',
            type: 'text',
            isNullable: true,
            comment: '记录创建人标识',
          },
          {
            name: 'updated_by',
            type: 'text',
            isNullable: true,
            comment: '记录最后编辑人标识',
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
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'strategy_versions',
      new TableForeignKey({
        columnNames: ['strategy_id'],
        referencedColumnNames: ['strategy_id'],
        referencedTableName: 'strategies',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createUniqueConstraint(
      'strategy_versions',
      new TableUnique({
        name: 'uq_strategy_versions_code',
        columnNames: ['strategy_id', 'version_code'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'strategy_parameter_templates',
        columns: [
          {
            name: 'template_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            comment: '参数模板主键 ID',
          },
          {
            name: 'strategy_id',
            type: 'integer',
            isNullable: false,
            comment: '所属策略 ID',
          },
          {
            name: 'strategy_version_id',
            type: 'integer',
            isNullable: false,
            comment: '关联策略版本 ID',
          },
          {
            name: 'name',
            type: 'text',
            isNullable: false,
            comment: '模板名称',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: '模板描述',
          },
          {
            name: 'is_default',
            type: 'boolean',
            isNullable: false,
            default: false,
            comment: '是否为默认模板',
          },
          {
            name: 'parameter_values',
            type: 'jsonb',
            isNullable: false,
            default: `'{}'::jsonb`,
            comment: '参数取值 JSON',
          },
          {
            name: 'labels',
            type: 'text',
            isArray: true,
            isNullable: false,
            comment: '模板标签',
          },
          {
            name: 'schema_snapshot',
            type: 'jsonb',
            isNullable: false,
            default: `'{}'::jsonb`,
            comment: 'Schema 摘要',
          },
          {
            name: 'created_by',
            type: 'text',
            isNullable: true,
            comment: '记录创建人标识',
          },
          {
            name: 'updated_by',
            type: 'text',
            isNullable: true,
            comment: '记录最后编辑人标识',
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
      }),
      true,
    );

    await queryRunner.createForeignKeys('strategy_parameter_templates', [
      new TableForeignKey({
        columnNames: ['strategy_id'],
        referencedColumnNames: ['strategy_id'],
        referencedTableName: 'strategies',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['strategy_version_id'],
        referencedColumnNames: ['version_id'],
        referencedTableName: 'strategy_versions',
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createUniqueConstraint(
      'strategy_parameter_templates',
      new TableUnique({
        name: 'uq_strategy_template_name',
        columnNames: ['strategy_id', 'name'],
      }),
    );

    await queryRunner.query(
      `ALTER TABLE strategy_parameter_templates ALTER COLUMN labels SET DEFAULT ARRAY[]::text[];`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'strategy_parameter_instances',
        columns: [
          {
            name: 'instance_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            comment: '参数实例主键 ID',
          },
          {
            name: 'strategy_id',
            type: 'integer',
            isNullable: false,
            comment: '所属策略 ID',
          },
          {
            name: 'strategy_version_id',
            type: 'integer',
            isNullable: false,
            comment: '关联策略版本 ID',
          },
          {
            name: 'template_id',
            type: 'integer',
            isNullable: true,
            comment: '来源参数模板 ID',
          },
          {
            name: 'name',
            type: 'text',
            isNullable: false,
            comment: '实例名称',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: '实例描述',
          },
          {
            name: 'parameter_values',
            type: 'jsonb',
            isNullable: false,
            default: `'{}'::jsonb`,
            comment: '参数取值',
          },
          {
            name: 'source',
            type: 'text',
            isNullable: false,
            default: `'manual'`,
            comment: '实例来源：manual/template/import',
          },
          {
            name: 'locked',
            type: 'boolean',
            isNullable: false,
            default: false,
            comment: '是否锁定',
          },
          {
            name: 'labels',
            type: 'text',
            isArray: true,
            isNullable: false,
            comment: '实例标签',
          },
          {
            name: 'created_by',
            type: 'text',
            isNullable: true,
            comment: '记录创建人标识',
          },
          {
            name: 'updated_by',
            type: 'text',
            isNullable: true,
            comment: '记录最后编辑人标识',
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
      }),
      true,
    );

    await queryRunner.createForeignKeys('strategy_parameter_instances', [
      new TableForeignKey({
        columnNames: ['strategy_id'],
        referencedColumnNames: ['strategy_id'],
        referencedTableName: 'strategies',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['strategy_version_id'],
        referencedColumnNames: ['version_id'],
        referencedTableName: 'strategy_versions',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['template_id'],
        referencedColumnNames: ['template_id'],
        referencedTableName: 'strategy_parameter_templates',
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.query(
      `ALTER TABLE strategy_parameter_instances ALTER COLUMN labels SET DEFAULT ARRAY[]::text[];`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('strategy_parameter_instances');
    await queryRunner.dropTable('strategy_parameter_templates');

    await queryRunner.dropUniqueConstraint(
      'strategy_versions',
      'uq_strategy_versions_code',
    );
    await queryRunner.dropTable('strategy_versions');

    await queryRunner.query('DROP INDEX IF EXISTS idx_strategies_tags;');
    await queryRunner.query('DROP INDEX IF EXISTS idx_strategies_markets;');
    await queryRunner.dropTable('strategies');
  }
}
