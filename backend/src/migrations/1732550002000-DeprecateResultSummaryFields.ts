import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 废弃 backtest_tasks 表中的旧字段
 * 
 * 废弃字段（重命名为 _deprecated 后缀）：
 * - result_summary → result_summary_deprecated
 * - result_file_path → result_file_path_deprecated
 * 
 * 原因：
 * - result_summary: 使用新的 backtest_results 表替代
 * - result_file_path: 使用 trades_file_path 和 equity_file_path 替代
 * 
 * 注意：不删除字段，只是重命名，保留历史数据
 */
export class DeprecateResultSummaryFields1732550002000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 重命名字段（标记为废弃）
    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      RENAME COLUMN result_summary TO result_summary_deprecated
    `);

    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      RENAME COLUMN result_file_path TO result_file_path_deprecated
    `);

    // 添加注释说明字段已废弃
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.result_summary_deprecated 
      IS 'DEPRECATED: 此字段已废弃，请使用 backtest_results 表代替。保留用于历史数据兼容。';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.result_file_path_deprecated 
      IS 'DEPRECATED: 此字段已废弃，请使用 trades_file_path 和 equity_file_path 代替。保留用于历史数据兼容。';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 恢复字段名称
    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      RENAME COLUMN result_file_path_deprecated TO result_file_path
    `);

    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      RENAME COLUMN result_summary_deprecated TO result_summary
    `);

    // 恢复原注释
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.result_summary 
      IS '回测结果摘要 (JSONB)，完成后填充，包含总收益率、最大回撤等关键指标';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.result_file_path 
      IS '回测结果详细数据文件路径，指向DuckDB或Parquet文件';
    `);
  }
}

