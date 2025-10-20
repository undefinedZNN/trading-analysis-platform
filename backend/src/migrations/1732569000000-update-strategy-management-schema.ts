import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableUnique } from 'typeorm';

export class UpdateStrategyManagementSchema1732569000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tablesToDrop = [
      'strategy_parameter_instances',
      'strategy_parameter_templates',
    ];
    for (const table of tablesToDrop) {
      const exists = await queryRunner.hasTable(table);
      if (exists) {
        await queryRunner.dropTable(table, true);
      }
    }

    const oldVersionTableExists = await queryRunner.hasTable('strategy_versions');
    if (oldVersionTableExists) {
      await queryRunner.dropTable('strategy_versions', true);
    }

    const hasStatus = await queryRunner.hasColumn('strategies', 'status');
    if (hasStatus) {
      await queryRunner.query('ALTER TABLE strategies DROP COLUMN status');
    }
    const hasArchivedAt = await queryRunner.hasColumn('strategies', 'archived_at');
    if (hasArchivedAt) {
      await queryRunner.query('ALTER TABLE strategies DROP COLUMN archived_at');
    }

    const scriptTableExists = await queryRunner.hasTable('strategy_scripts');
    if (!scriptTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'strategy_scripts',
          columns: [
            {
              name: 'script_id',
              type: 'integer',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
              comment: '脚本版本主键 ID',
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
              comment: '脚本版本号',
            },
            {
              name: 'description',
              type: 'text',
              isNullable: true,
              comment: '版本描述',
            },
            {
              name: 'changelog',
              type: 'text',
              isNullable: true,
              comment: '版本变更记录',
            },
            {
              name: 'script_source',
              type: 'text',
              isNullable: false,
              comment: 'TypeScript 源码',
            },
            {
              name: 'manifest',
              type: 'jsonb',
              isNullable: true,
              comment: '脚本 manifest 元数据',
            },
            {
              name: 'is_primary',
              type: 'boolean',
              isNullable: false,
              default: false,
              comment: '是否主版本',
            },
            {
              name: 'created_by',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'updated_by',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamptz',
              isNullable: false,
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updated_at',
              type: 'timestamptz',
              isNullable: false,
              default: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
        true,
      );

      await queryRunner.createForeignKey(
        'strategy_scripts',
        new TableForeignKey({
          columnNames: ['strategy_id'],
          referencedColumnNames: ['strategy_id'],
          referencedTableName: 'strategies',
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createUniqueConstraint(
        'strategy_scripts',
        new TableUnique({
          name: 'uq_strategy_scripts_code',
          columnNames: ['strategy_id', 'version_code'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const scriptsExists = await queryRunner.hasTable('strategy_scripts');
    if (scriptsExists) {
      await queryRunner.dropTable('strategy_scripts', true);
    }

    const hasStatus = await queryRunner.hasColumn('strategies', 'status');
    if (!hasStatus) {
      await queryRunner.query("ALTER TABLE strategies ADD COLUMN status text DEFAULT 'draft'");
    }
    const hasArchivedAt = await queryRunner.hasColumn('strategies', 'archived_at');
    if (!hasArchivedAt) {
      await queryRunner.query('ALTER TABLE strategies ADD COLUMN archived_at timestamptz');
    }
  }
}
