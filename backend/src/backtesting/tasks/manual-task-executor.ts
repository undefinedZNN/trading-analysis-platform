/**
 * 临时任务执行器
 * 
 * 用途：在TaskExecutor正式实现之前，手动执行回测任务
 * 使用方法：npx tsx src/backtesting/tasks/manual-task-executor.ts <taskId>
 */

import { DataSource } from 'typeorm';
import { BacktestTaskEntity, BacktestTaskStatus } from './entities';

async function executeTask(taskId: string) {
  console.log(`\n📋 准备执行任务: ${taskId}\n`);

  // 1. 连接数据库
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'trading_platform',
    entities: [BacktestTaskEntity],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('✅ 数据库连接成功');

  try {
    // 2. 获取任务
    const taskRepo = dataSource.getRepository(BacktestTaskEntity);
    const task = await taskRepo.findOne({ where: { taskId } });

    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    console.log(`\n📊 任务信息:`);
    console.log(`  - 名称: ${task.taskName}`);
    console.log(`  - 策略: ${task.strategyId}`);
    console.log(`  - 版本: ${task.scriptVersionId}`);
    console.log(`  - 数据集: ${task.datasetId}`);
    console.log(`  - 当前状态: ${task.status}\n`);

    // 3. 检查状态
    if (task.status !== BacktestTaskStatus.PENDING) {
      console.log(`⚠️  任务状态为 ${task.status}，无法执行`);
      return;
    }

    // 4. 更新状态为running
    task.status = BacktestTaskStatus.RUNNING;
    task.startedAt = new Date();
    task.progress = 0;
    await taskRepo.save(task);
    console.log('✅ 任务状态已更新为 RUNNING');

    // 5. TODO: 这里应该调用Orchestrator执行回测
    console.log('\n❌ TaskExecutor尚未实现');
    console.log('📝 需要实现以下步骤:');
    console.log('   1. 加载策略脚本');
    console.log('   2. 加载数据集');
    console.log('   3. 创建Orchestrator会话');
    console.log('   4. 监听进度事件并更新数据库');
    console.log('   5. 保存回测结果\n');

    // 模拟执行（临时）
    console.log('🔄 模拟执行中...');
    for (let i = 0; i <= 100; i += 20) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      task.progress = i;
      await taskRepo.save(task);
      console.log(`   进度: ${i}%`);
    }

    // 6. 完成
    task.status = BacktestTaskStatus.COMPLETED;
    task.completedAt = new Date();
    task.progress = 100;
    task.resultSummary = {
      totalReturn: 0.15,
      annualizedReturn: 0.18,
      maxDrawdown: -0.08,
      sharpeRatio: 1.5,
      winRate: 0.55,
      profitLossRatio: 1.8,
      totalTrades: 50,
      finalCapital: 11500,
      processedBars: 1000,
      executionTime: 5,
    };
    await taskRepo.save(task);
    console.log('\n✅ 任务执行完成（模拟）');

  } catch (error) {
    console.error('\n❌ 执行失败:', error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

// 主函数
async function main() {
  const taskId = process.argv[2];
  
  if (!taskId) {
    console.error('❌ 请提供任务ID');
    console.log('\n使用方法:');
    console.log('  npx tsx src/backtesting/tasks/manual-task-executor.ts <taskId>\n');
    console.log('示例:');
    console.log('  npx tsx src/backtesting/tasks/manual-task-executor.ts bd88d24d-ea10-4b75-a92a-3f5de7ed2fd6\n');
    process.exit(1);
  }

  try {
    await executeTask(taskId);
    console.log('\n✨ 完成\n');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 执行失败\n');
    process.exit(1);
  }
}

main();

