import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 添加 Parquet 文件路径字段到 backtest_tasks 表
 * 
 * 新增字段：
 * - trades_file_path: 交易明细数据文件路径（Parquet）
 * - equity_file_path: 权益曲线数据文件路径（Parquet）
 * 
 * 这两个字段将替代原有的 result_file_path
 */
export class AddFilePathFieldsToBacktestTasks1732550001000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      ADD COLUMN IF NOT EXISTS trades_file_path varchar(500),
      ADD COLUMN IF NOT EXISTS equity_file_path varchar(500)
    `);

    // 添加注释
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.trades_file_path IS '交易明细数据文件路径（Parquet），包含所有交易记录和因子数据';
      COMMENT ON COLUMN backtest_tasks.equity_file_path IS '权益曲线数据文件路径（Parquet），包含每根K线的权益数据';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      DROP COLUMN IF EXISTS equity_file_path,
      DROP COLUMN IF EXISTS trades_file_path
    `);
  }
}

