-- 添加 result_summary 列到 backtest_tasks 表
-- 这个列用于存储回测结果摘要（已弃用，但为了向后兼容保留）

DO $$ 
BEGIN
    -- 检查列是否已存在
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'backtest_tasks' 
        AND column_name = 'result_summary'
    ) THEN
        -- 添加列
        ALTER TABLE backtest_tasks 
        ADD COLUMN result_summary JSONB DEFAULT NULL;
        
        RAISE NOTICE 'Column result_summary added to backtest_tasks table';
    ELSE
        RAISE NOTICE 'Column result_summary already exists in backtest_tasks table';
    END IF;
END $$;

-- 添加注释
COMMENT ON COLUMN backtest_tasks.result_summary IS '回测结果摘要（已弃用，使用 backtest_results 表替代）';

