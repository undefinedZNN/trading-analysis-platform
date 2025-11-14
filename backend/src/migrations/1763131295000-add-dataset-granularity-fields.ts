import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDatasetGranularityFields1763131295000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'datasets',
      new TableColumn({
        name: 'path_template',
        type: 'text',
        isNullable: true,
        comment: '数据集中数据文件路径模板',
      }),
    );

    await queryRunner.addColumn(
      'datasets',
      new TableColumn({
        name: 'available_granularities',
        type: 'jsonb',
        isNullable: false,
        default: "'[]'::jsonb",
        comment: '当前可用的时间粒度列表',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('datasets', 'available_granularities');
    await queryRunner.dropColumn('datasets', 'path_template');
  }
}
