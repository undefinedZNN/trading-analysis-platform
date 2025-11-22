import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 添加 Checkpoint 相关字段到 backtest_tasks 表
 * 
 * 支持断点续传功能：
 * - checkpoint_enabled: 是否启用 checkpoint
 * - checkpoint_interval: checkpoint 间隔（K线数）
 * - last_checkpoint_bar: 最后一次 checkpoint 的K线位置
 * - checkpoint_file_path: checkpoint 文件路径
 * - can_resume: 是否可以恢复
 */
export class AddCheckpointFieldsToBacktestTasks1732550000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      ADD COLUMN IF NOT EXISTS checkpoint_enabled boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS checkpoint_interval integer DEFAULT 1000,
      ADD COLUMN IF NOT EXISTS last_checkpoint_bar integer,
      ADD COLUMN IF NOT EXISTS checkpoint_file_path varchar(500),
      ADD COLUMN IF NOT EXISTS can_resume boolean DEFAULT false
    `);

    // 添加注释
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.checkpoint_enabled IS '是否启用 Checkpoint（断点续传）';
      COMMENT ON COLUMN backtest_tasks.checkpoint_interval IS 'Checkpoint 间隔（K线数量），默认每1000根K线保存一次';
      COMMENT ON COLUMN backtest_tasks.last_checkpoint_bar IS '最后一次 Checkpoint 的K线位置';
      COMMENT ON COLUMN backtest_tasks.checkpoint_file_path IS 'Checkpoint 文件路径';
      COMMENT ON COLUMN backtest_tasks.can_resume IS '是否可以从断点恢复';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      DROP COLUMN IF EXISTS can_resume,
      DROP COLUMN IF EXISTS checkpoint_file_path,
      DROP COLUMN IF EXISTS last_checkpoint_bar,
      DROP COLUMN IF EXISTS checkpoint_interval,
      DROP COLUMN IF EXISTS checkpoint_enabled
    `);
  }
}

