-- ============================================
-- 数据清理脚本
-- 用于资产类型和合约规格迁移
-- ============================================
-- 执行时间: 2025-11-27
-- 用途: 清理历史数据以便进行破坏性更新
-- ============================================

-- 备份提示
-- 如果需要备份，请在执行前运行：
-- pg_dump -U postgres -d trading_platform > backup_before_cleanup_$(date +%Y%m%d_%H%M%S).sql

-- 1. 检查当前数据量
SELECT 
    '回测任务数量' as table_name, 
    COUNT(*) as count 
FROM backtest_tasks
UNION ALL
SELECT 
    '数据集数量' as table_name, 
    COUNT(*) as count 
FROM datasets
UNION ALL
SELECT 
    '导入任务数量' as table_name, 
    COUNT(*) as count 
FROM import_tasks;

-- 2. 清理回测任务相关表（使用 CASCADE 自动清理关联数据）
TRUNCATE TABLE backtest_tasks CASCADE;

-- 3. 清理数据集相关表
TRUNCATE TABLE datasets CASCADE;

-- 4. 清理导入任务表
TRUNCATE TABLE import_tasks CASCADE;

-- 5. 验证清理结果
SELECT 
    '回测任务数量（清理后）' as table_name, 
    COUNT(*) as count 
FROM backtest_tasks
UNION ALL
SELECT 
    '数据集数量（清理后）' as table_name, 
    COUNT(*) as count 
FROM datasets
UNION ALL
SELECT 
    '导入任务数量（清理后）' as table_name, 
    COUNT(*) as count 
FROM import_tasks;

-- 完成提示
SELECT '✅ 数据清理完成！现在可以运行数据库迁移了。' as message;

