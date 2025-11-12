import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBacktestTasks1733107200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 启用 uuid-ossp 扩展（如果尚未启用）
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // =====================================================
    // 1. 创建 backtest_tasks 表（回测任务主表）
    // =====================================================
    await queryRunner.query(`
      CREATE TABLE backtest_tasks (
        -- ============ 主键 ============
        task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        
        -- ============ 任务基本信息 ============
        task_name VARCHAR(100) NOT NULL,
        task_description TEXT,
        
        -- ============ 关联ID（无强外键约束） ============
        strategy_id UUID NOT NULL,
        script_version_id UUID NOT NULL,
        dataset_id INTEGER NOT NULL,
        
        -- ============ 配置信息（JSONB格式） ============
        strategy_params JSONB NOT NULL DEFAULT '{}'::jsonb,
        execution_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        data_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        
        -- ============ 状态与进度 ============
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        
        -- ============ 时间戳 ============
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        -- ============ 结果数据 ============
        result_summary JSONB,
        result_file_path VARCHAR(500),
        
        -- ============ 错误信息 ============
        error_message TEXT,
        error_stack TEXT,
        
        -- ============ 审计字段 ============
        created_by VARCHAR(64),
        updated_by VARCHAR(64),
        
        -- ============ 约束 ============
        CONSTRAINT chk_backtest_tasks_status 
          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        CONSTRAINT chk_backtest_tasks_progress 
          CHECK (progress >= 0 AND progress <= 100)
      );
    `);

    // =====================================================
    // 2. 添加 backtest_tasks 表注释
    // =====================================================
    await queryRunner.query(`
      COMMENT ON TABLE backtest_tasks IS '回测任务主表 - 存储回测任务的元数据、配置和执行状态';
    `);

    // 字段注释 - 主键
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.task_id IS '任务唯一标识 (UUID)';
    `);

    // 字段注释 - 任务基本信息
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.task_name IS '任务名称，用户自定义，用于识别任务，最大长度100字符';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.task_description IS '任务描述，可选，用于记录任务的详细说明或备注';
    `);

    // 字段注释 - 关联ID
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.strategy_id IS '关联的策略ID (UUID)，指向 strategies 表，无强外键约束';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.script_version_id IS '使用的脚本版本ID (UUID)，指向 script_versions 表，无强外键约束';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.dataset_id IS '使用的数据集ID (INTEGER)，指向 datasets 表，无强外键约束';
    `);

    // 字段注释 - 配置信息
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.strategy_params IS '策略参数配置 (JSONB)，存储用户输入的策略自定义参数，如 {"fastPeriod": 10, "slowPeriod": 30}';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.execution_config IS '执行配置 (JSONB)，包含初始资金、手续费、杠杆等交易执行参数，如 {"initialCapital": 10000, "fees": {"makerFee": 0.0002}}';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.data_config IS '数据配置 (JSONB)，包含回测时间范围和时间周期，如 {"timeRange": {"start": "2024-01-01T00:00:00Z", "end": "2024-12-31T23:59:59Z"}, "timeframe": "1h"}';
    `);

    // 字段注释 - 状态与进度
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.status IS '任务状态，枚举值：pending(待执行)、running(执行中)、completed(已完成)、failed(失败)、cancelled(已取消)';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.progress IS '任务执行进度百分比，范围 0-100，运行中时更新，用于前端进度条展示';
    `);

    // 字段注释 - 时间戳
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.created_at IS '任务创建时间 (UTC时区)，记录任务首次创建的时间戳';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.started_at IS '任务开始执行时间 (UTC时区)，任务从pending变为running时记录';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.completed_at IS '任务完成时间 (UTC时区)，任务进入completed/failed/cancelled状态时记录';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.updated_at IS '任务最后更新时间 (UTC时区)，任何字段更新时自动更新此时间戳';
    `);

    // 字段注释 - 结果数据
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.result_summary IS '回测结果摘要 (JSONB)，完成后填充，包含总收益率、最大回撤、夏普比率、交易次数等关键指标，如 {"totalReturn": 0.235, "maxDrawdown": -0.123, "sharpeRatio": 1.85}';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.result_file_path IS '回测结果详细数据文件路径，指向DuckDB或Parquet文件，存储完整的交易明细和因子数据';
    `);

    // 字段注释 - 错误信息
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.error_message IS '错误信息，任务失败时记录简要错误描述，用于前端展示';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.error_stack IS '错误堆栈，任务失败时记录完整的错误堆栈信息，用于调试和排查问题';
    `);

    // 字段注释 - 审计字段
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.created_by IS '任务创建者，记录创建任务的用户ID或用户名';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_tasks.updated_by IS '任务最后更新者，记录最后一次更新任务的用户ID或用户名';
    `);

    // =====================================================
    // 3. 创建 backtest_tasks 索引
    // =====================================================
    
    // 状态索引 - 用于筛选特定状态的任务（running/failed等）
    await queryRunner.query(`
      CREATE INDEX idx_backtest_tasks_status 
        ON backtest_tasks(status);
    `);

    // 策略索引 - 用于按策略筛选任务
    await queryRunner.query(`
      CREATE INDEX idx_backtest_tasks_strategy 
        ON backtest_tasks(strategy_id);
    `);

    // 版本索引 - 用于按脚本版本筛选任务
    await queryRunner.query(`
      CREATE INDEX idx_backtest_tasks_version 
        ON backtest_tasks(script_version_id);
    `);

    // 数据集索引 - 用于按数据集筛选任务
    await queryRunner.query(`
      CREATE INDEX idx_backtest_tasks_dataset 
        ON backtest_tasks(dataset_id);
    `);

    // 创建时间索引 - 用于按时间排序和范围查询
    await queryRunner.query(`
      CREATE INDEX idx_backtest_tasks_created_at 
        ON backtest_tasks(created_at DESC);
    `);

    // 组合索引 - 用于常见的组合查询（策略+版本+状态）
    await queryRunner.query(`
      CREATE INDEX idx_backtest_tasks_strategy_version_status 
        ON backtest_tasks(strategy_id, script_version_id, status);
    `);

    // =====================================================
    // 4. 创建 task_logs 表（任务日志表）
    // =====================================================
    await queryRunner.query(`
      CREATE TABLE task_logs (
        -- ============ 主键 ============
        log_id BIGSERIAL PRIMARY KEY,
        
        -- ============ 关联任务 ============
        task_id UUID NOT NULL,
        
        -- ============ 日志内容 ============
        level VARCHAR(10) NOT NULL,
        module VARCHAR(50),
        message TEXT NOT NULL,
        metadata JSONB,
        
        -- ============ 时间戳 ============
        logged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        -- ============ 约束 ============
        CONSTRAINT chk_task_logs_level 
          CHECK (level IN ('debug', 'info', 'warn', 'error'))
      );
    `);

    // =====================================================
    // 5. 添加 task_logs 表注释
    // =====================================================
    await queryRunner.query(`
      COMMENT ON TABLE task_logs IS '任务执行日志表 - 记录回测任务执行过程中的日志信息，用于监控和调试';
    `);

    // 字段注释 - 主键
    await queryRunner.query(`
      COMMENT ON COLUMN task_logs.log_id IS '日志记录唯一标识 (自增BIGINT)，作为日志的主键';
    `);

    // 字段注释 - 关联任务
    await queryRunner.query(`
      COMMENT ON COLUMN task_logs.task_id IS '关联的任务ID (UUID)，指向 backtest_tasks 表，用于查询特定任务的日志';
    `);

    // 字段注释 - 日志内容
    await queryRunner.query(`
      COMMENT ON COLUMN task_logs.level IS '日志级别，枚举值：debug(调试)、info(信息)、warn(警告)、error(错误)';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN task_logs.module IS '日志来源模块名称，如 Orchestrator、StrategySandbox、RiskEngine 等，用于定位日志来源';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN task_logs.message IS '日志消息内容，记录日志的文本描述';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN task_logs.metadata IS '日志元数据 (JSONB)，可选，存储结构化的额外信息，如事件ID、价格、交易ID等，格式如 {"eventType": "BAR", "price": 50000}';
    `);

    // 字段注释 - 时间戳
    await queryRunner.query(`
      COMMENT ON COLUMN task_logs.logged_at IS '日志记录时间 (UTC时区)，记录日志生成的精确时间戳';
    `);

    // =====================================================
    // 6. 创建 task_logs 索引
    // =====================================================
    
    // 任务ID + 时间戳组合索引 - 用于按任务ID和时间查询日志（下拉加载）
    await queryRunner.query(`
      CREATE INDEX idx_task_logs_task_time 
        ON task_logs(task_id, logged_at DESC);
    `);

    // 任务ID + 日志级别组合索引 - 用于按任务ID和级别筛选日志
    await queryRunner.query(`
      CREATE INDEX idx_task_logs_task_level 
        ON task_logs(task_id, level);
    `);

    // 日志时间索引 - 用于日志归档和清理
    await queryRunner.query(`
      CREATE INDEX idx_task_logs_logged_at 
        ON task_logs(logged_at DESC);
    `);

    // =====================================================
    // 7. 创建更新时间触发器函数
    // =====================================================
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // =====================================================
    // 8. 为 backtest_tasks 创建更新时间触发器
    // =====================================================
    await queryRunner.query(`
      CREATE TRIGGER trg_backtest_tasks_updated_at
      BEFORE UPDATE ON backtest_tasks
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除触发器
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_backtest_tasks_updated_at ON backtest_tasks;`);
    
    // 删除触发器函数
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column();`);
    
    // 删除索引（PostgreSQL会在删除表时自动删除索引，但显式删除更清晰）
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_logs_logged_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_logs_task_level;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_logs_task_time;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_backtest_tasks_strategy_version_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_backtest_tasks_created_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_backtest_tasks_dataset;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_backtest_tasks_version;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_backtest_tasks_strategy;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_backtest_tasks_status;`);
    
    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS task_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS backtest_tasks;`);
  }
}

