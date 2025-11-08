/**
 * Orchestrator 基础示例
 * 
 * 演示如何使用 Orchestrator 创建和管理回测会话
 */

import {
  createOrchestrator,
  createModuleCoordinator,
  type BacktestSessionConfig,
} from '../index';

async function main() {
  // 1. 创建编排器
  console.log('1️⃣  创建编排器...');
  const moduleCoordinator = createModuleCoordinator();
  const orchestrator = createOrchestrator(moduleCoordinator);
  
  // 2. 定义会话配置
  console.log('2️⃣  定义会话配置...');
  const config: BacktestSessionConfig = {
    sessionId: 'my-first-backtest',
    
    // 数据配置
    data: {
      source: 'parquet',
      basePath: '/data/crypto',
      symbol: 'BTCUSDT',
      startTime: '2024-01-01',
      endTime: '2024-01-31',
    },
    
    // 策略配置
    strategy: {
      strategyId: 'ma-crossover',
      version: '1.0.0',
      name: 'MA Crossover Strategy',
      description: 'Simple moving average crossover strategy',
      scriptPath: './strategies/ma-crossover.js',
    },
    
    // 执行配置
    execution: {
      initialCapital: 10000,  // 初始资金
      leverage: 1,             // 杠杆
      slippageModel: {
        type: 'fixed',
        value: 0.001,          // 0.1% 滑点
      },
      feeModel: {
        type: 'percentage',
        makerFee: 0.001,       // 0.1% Maker 费用
        takerFee: 0.002,       // 0.2% Taker 费用
      },
    },
  };
  
  try {
    // 3. 创建会话
    console.log('3️⃣  创建会话...');
    const session = await orchestrator.createSession(config);
    console.log(`✅ 会话创建成功: ${session.getState()}`);
    
    // 4. 启动回测
    console.log('4️⃣  启动回测...');
    await orchestrator.start('my-first-backtest');
    console.log(`✅ 会话状态: ${session.getState()}`);
    
    // 5. 监听会话事件
    session.on('StateChanged', (event) => {
      console.log(`📊 状态变化: ${event.oldState} -> ${event.newState}`);
    });
    
    session.on('Error', (event) => {
      console.error(`❌ 错误: ${event.error}`);
    });
    
    // 6. 等待一段时间（模拟回测运行）
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 7. 暂停会话
    console.log('5️⃣  暂停会话...');
    await orchestrator.pause('my-first-backtest');
    console.log(`✅ 会话状态: ${session.getState()}`);
    
    // 8. 创建快照
    console.log('6️⃣  创建快照...');
    const checkpointId = await orchestrator.createSnapshot(
      'my-first-backtest',
      'mid-test checkpoint'
    );
    console.log(`✅ 快照创建成功: ${checkpointId}`);
    
    // 9. 恢复会话
    console.log('7️⃣  恢复会话...');
    await orchestrator.resume('my-first-backtest');
    console.log(`✅ 会话状态: ${session.getState()}`);
    
    // 10. 等待一段时间
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 11. 停止会话
    console.log('8️⃣  停止会话...');
    await orchestrator.stop('my-first-backtest');
    console.log(`✅ 会话状态: ${session.getState()}`);
    
    // 12. 获取结果
    console.log('9️⃣  获取结果...');
    const results = await orchestrator.getResults('my-first-backtest');
    console.log('✅ 回测结果:');
    console.log(`   - 会话ID: ${results.sessionId}`);
    console.log(`   - 状态: ${results.status}`);
    console.log(`   - 开始时间: ${new Date(results.startTime).toISOString()}`);
    console.log(`   - 结束时间: ${new Date(results.endTime).toISOString()}`);
    console.log(`   - 持续时间: ${results.duration}ms`);
    console.log(`   - 已处理事件: ${results.stats.processedEvents}`);
    console.log(`   - 错误数: ${results.stats.errorCount}`);
    
    // 13. 列出快照
    console.log('🔟  列出快照...');
    const snapshots = await orchestrator.listSnapshots('my-first-backtest');
    console.log(`✅ 找到 ${snapshots.length} 个快照:`);
    snapshots.forEach((snapshot, i) => {
      console.log(`   ${i + 1}. ${snapshot.checkpointId} - ${snapshot.reason}`);
    });
    
    // 14. 清理
    console.log('1️⃣1️⃣  清理会话...');
    await orchestrator.destroySession('my-first-backtest');
    console.log('✅ 会话已销毁');
    
    console.log('\n🎉 示例完成！');
    
  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

export { main };

