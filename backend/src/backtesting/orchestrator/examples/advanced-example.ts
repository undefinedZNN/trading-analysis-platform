/**
 * Orchestrator 高级示例
 * 
 * 演示高级功能：多会话管理、快照恢复、错误处理等
 */

import {
  createOrchestrator,
  createModuleCoordinator,
  type BacktestSessionConfig,
  SessionEventType,
  SessionState,
} from '../index';

/**
 * 示例1: 多会话并行运行
 */
async function example1_MultipleSessions() {
  console.log('\n📋 示例1: 多会话并行运行\n');
  
  const orchestrator = createOrchestrator(createModuleCoordinator());
  
  // 创建多个策略配置
  const strategies = [
    { id: 'ma-crossover', name: 'MA Crossover' },
    { id: 'rsi-strategy', name: 'RSI Strategy' },
    { id: 'bollinger-bands', name: 'Bollinger Bands' },
  ];
  
  try {
    // 创建多个会话
    console.log('创建多个会话...');
    for (const strategy of strategies) {
      const config: BacktestSessionConfig = {
        sessionId: `session-${strategy.id}`,
        data: {
          source: 'parquet',
          basePath: '/data/crypto',
          symbol: 'BTCUSDT',
          startTime: '2024-01-01',
          endTime: '2024-01-31',
        },
        strategy: {
          strategyId: strategy.id,
          version: '1.0.0',
          name: strategy.name,
          description: `${strategy.name} strategy`,
          scriptPath: `./strategies/${strategy.id}.js`,
        },
        execution: {
          initialCapital: 10000,
          leverage: 1,
          slippageModel: { type: 'fixed', value: 0.001 },
          feeModel: {
            type: 'percentage',
            makerFee: 0.001,
            takerFee: 0.002,
          },
        },
      };
      
      await orchestrator.createSession(config);
      console.log(`  ✅ 创建会话: ${config.sessionId}`);
    }
    
    // 列出所有会话
    const sessions = orchestrator.listSessions();
    console.log(`\n📊 总共 ${sessions.length} 个会话`);
    
    // 并行启动所有会话
    console.log('\n启动所有会话...');
    await Promise.all(
      strategies.map(s => orchestrator.start(`session-${s.id}`))
    );
    
    // 监控所有会话
    console.log('\n📊 会话状态:');
    for (const strategy of strategies) {
      const session = orchestrator.getSession(`session-${strategy.id}`);
      console.log(`  - ${strategy.name}: ${session?.getState()}`);
    }
    
    // 清理
    await orchestrator.destroyAll();
    console.log('\n✅ 所有会话已清理');
    
  } catch (error) {
    console.error('❌ 错误:', error);
  }
}

/**
 * 示例2: 快照管理和恢复
 */
async function example2_SnapshotManagement() {
  console.log('\n📋 示例2: 快照管理和恢复\n');
  
  const orchestrator = createOrchestrator(createModuleCoordinator());
  
  const config: BacktestSessionConfig = {
    sessionId: 'snapshot-demo',
    data: {
      source: 'parquet',
      basePath: '/data/crypto',
      symbol: 'BTCUSDT',
      startTime: '2024-01-01',
      endTime: '2024-12-31',
    },
    strategy: {
      strategyId: 'test-strategy',
      version: '1.0.0',
      name: 'Test Strategy',
      description: 'Test strategy for snapshot demo',
      scriptPath: './strategies/test.js',
    },
    execution: {
      initialCapital: 10000,
      leverage: 1,
      slippageModel: { type: 'fixed', value: 0.001 },
      feeModel: {
        type: 'percentage',
        makerFee: 0.001,
        takerFee: 0.002,
      },
    },
  };
  
  try {
    // 创建并启动会话
    await orchestrator.createSession(config);
    await orchestrator.start('snapshot-demo');
    
    // 定期创建快照
    console.log('创建定期快照...');
    const checkpoints: string[] = [];
    
    for (let i = 1; i <= 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      const checkpointId = await orchestrator.createSnapshot(
        'snapshot-demo',
        `checkpoint-${i} (after ${i * 10}% progress)`
      );
      checkpoints.push(checkpointId);
      console.log(`  ✅ 快照 ${i}: ${checkpointId}`);
    }
    
    // 列出所有快照
    console.log('\n📊 所有快照:');
    const snapshots = await orchestrator.listSnapshots('snapshot-demo');
    snapshots.forEach((snapshot, i) => {
      const date = new Date(snapshot.createdAt).toISOString();
      console.log(`  ${i + 1}. ${snapshot.checkpointId}`);
      console.log(`     原因: ${snapshot.reason}`);
      console.log(`     时间: ${date}`);
    });
    
    // 恢复到某个快照
    console.log('\n🔄 恢复到快照 3...');
    await orchestrator.restoreSnapshot('snapshot-demo', checkpoints[2]);
    console.log('  ✅ 快照恢复成功');
    
    // 清理
    await orchestrator.destroySession('snapshot-demo');
    console.log('\n✅ 会话已清理');
    
  } catch (error) {
    console.error('❌ 错误:', error);
  }
}

/**
 * 示例3: 事件监听和处理
 */
async function example3_EventHandling() {
  console.log('\n📋 示例3: 事件监听和处理\n');
  
  const orchestrator = createOrchestrator(createModuleCoordinator());
  
  const config: BacktestSessionConfig = {
    sessionId: 'event-demo',
    data: {
      source: 'parquet',
      basePath: '/data/crypto',
      symbol: 'BTCUSDT',
      startTime: '2024-01-01',
      endTime: '2024-01-31',
    },
    strategy: {
      strategyId: 'test-strategy',
      version: '1.0.0',
      name: 'Test Strategy',
      description: 'Test strategy for event demo',
      scriptPath: './strategies/test.js',
    },
    execution: {
      initialCapital: 10000,
      leverage: 1,
      slippageModel: { type: 'fixed', value: 0.001 },
      feeModel: {
        type: 'percentage',
        makerFee: 0.001,
        takerFee: 0.002,
      },
    },
  };
  
  try {
    const session = await orchestrator.createSession(config);
    
    // 设置事件监听器
    console.log('设置事件监听器...');
    
    session.on(SessionEventType.StateChanged, (event) => {
      console.log(`  📊 状态变化: ${event.oldState} -> ${event.newState}`);
    });
    
    session.on(SessionEventType.Started, () => {
      console.log('  🚀 会话已启动');
    });
    
    session.on(SessionEventType.Paused, () => {
      console.log('  ⏸️  会话已暂停');
    });
    
    session.on(SessionEventType.Resumed, () => {
      console.log('  ▶️  会话已恢复');
    });
    
    session.on(SessionEventType.Stopped, () => {
      console.log('  🛑 会话已停止');
    });
    
    session.on(SessionEventType.Error, (event) => {
      console.error(`  ❌ 错误: ${event.error}`);
    });
    
    session.on(SessionEventType.Progress, (event) => {
      console.log(`  📈 进度: ${event.progress}%`);
    });
    
    // 执行生命周期操作
    console.log('\n执行生命周期操作...\n');
    
    await orchestrator.start('event-demo');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await orchestrator.pause('event-demo');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await orchestrator.resume('event-demo');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await orchestrator.stop('event-demo');
    
    // 清理
    await orchestrator.destroySession('event-demo');
    console.log('\n✅ 会话已清理');
    
  } catch (error) {
    console.error('❌ 错误:', error);
  }
}

/**
 * 示例4: 错误处理和恢复
 */
async function example4_ErrorHandling() {
  console.log('\n📋 示例4: 错误处理和恢复\n');
  
  const orchestrator = createOrchestrator(createModuleCoordinator());
  
  const config: BacktestSessionConfig = {
    sessionId: 'error-demo',
    data: {
      source: 'parquet',
      basePath: '/data/crypto',
      symbol: 'BTCUSDT',
      startTime: '2024-01-01',
      endTime: '2024-01-31',
    },
    strategy: {
      strategyId: 'test-strategy',
      version: '1.0.0',
      name: 'Test Strategy',
      description: 'Test strategy',
      scriptPath: './strategies/test.js',
    },
    execution: {
      initialCapital: 10000,
      leverage: 1,
      slippageModel: { type: 'fixed', value: 0.001 },
      feeModel: {
        type: 'percentage',
        makerFee: 0.001,
        takerFee: 0.002,
      },
    },
  };
  
  try {
    // 1. 正常流程
    console.log('1. 正常创建会话...');
    await orchestrator.createSession(config);
    console.log('  ✅ 会话创建成功');
    
    // 2. 尝试创建重复的会话
    console.log('\n2. 尝试创建重复的会话...');
    try {
      await orchestrator.createSession(config);
      console.log('  ❌ 应该抛出异常');
    } catch (error: any) {
      console.log(`  ✅ 正确捕获异常: ${error.message}`);
    }
    
    // 3. 尝试操作不存在的会话
    console.log('\n3. 尝试操作不存在的会话...');
    try {
      await orchestrator.start('non-existent-session');
      console.log('  ❌ 应该抛出异常');
    } catch (error: any) {
      console.log(`  ✅ 正确捕获异常: ${error.message}`);
    }
    
    // 4. 尝试无效的状态转换
    console.log('\n4. 尝试无效的状态转换...');
    try {
      await orchestrator.resume('error-demo'); // 未启动就尝试恢复
      console.log('  ❌ 应该抛出异常');
    } catch (error: any) {
      console.log(`  ✅ 正确捕获异常: ${error.message}`);
    }
    
    // 5. 尝试恢复不存在的快照
    console.log('\n5. 尝试恢复不存在的快照...');
    try {
      await orchestrator.restoreSnapshot('error-demo', 'non-existent-checkpoint');
      console.log('  ❌ 应该抛出异常');
    } catch (error: any) {
      console.log(`  ✅ 正确捕获异常: ${error.message}`);
    }
    
    // 清理
    await orchestrator.destroySession('error-demo');
    console.log('\n✅ 会话已清理');
    
  } catch (error) {
    console.error('❌ 意外错误:', error);
  }
}

/**
 * 运行所有示例
 */
async function main() {
  console.log('🚀 Orchestrator 高级示例\n');
  console.log('=' .repeat(60));
  
  await example1_MultipleSessions();
  await example2_SnapshotManagement();
  await example3_EventHandling();
  await example4_ErrorHandling();
  
  console.log('\n' + '='.repeat(60));
  console.log('\n🎉 所有示例完成！');
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

export {
  example1_MultipleSessions,
  example2_SnapshotManagement,
  example3_EventHandling,
  example4_ErrorHandling,
};

