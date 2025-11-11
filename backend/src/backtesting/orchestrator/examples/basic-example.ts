/**
 * Orchestrator 基础示例
 * 
 * 演示如何使用 Orchestrator 创建和管理回测会话
 */

import {
  createOrchestrator,
  createModuleCoordinator,
  type BacktestSessionConfig,
  SessionEventType,
  type StateChangedEventData,
} from '../index';

const DEFAULT_SYMBOL = 'BTCUSDT';

function createDataConfig(): BacktestSessionConfig['data'] {
  return {
    source: {
      provider: 'parquet-duckdb',
      path: '/data/crypto',
      symbols: [DEFAULT_SYMBOL],
      timeRange: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T23:59:59Z',
      },
      gapPolicy: 'forward-fill',
    },
    timeframe: {
      primary: '1h',
    },
  };
}

function createStrategyConfig(): BacktestSessionConfig['strategy'] {
  return {
    strategyId: 'ma-crossover',
    name: 'MA Crossover Strategy',
    scriptContent: '// demo strategy script placeholder',
    manifest: {
      strategyId: 'ma-crossover',
      name: 'MA Crossover Strategy',
      version: '1.0.0',
      description: 'Simple moving average crossover strategy',
      author: 'Demo User',
      requiredTimeframe: '1h',
      featureDeps: [],
      dataDeps: [{ symbol: DEFAULT_SYMBOL }],
      defaultParameters: { fast: 10, slow: 30 },
    },
    parameters: { fast: 10, slow: 30 },
  };
}

function createExecutionConfig(): BacktestSessionConfig['execution'] {
  return {
    initialCapital: '10000',
    matching: {
      marketFillPolicy: 'mid',
      limitFillPolicy: 'limit-price',
    },
    slippage: {
      model: 'fixed-spread',
      params: { spread: 0.0005 },
    },
    fee: {
      model: 'fixed-rate',
      params: { maker: 0.001, taker: 0.002 },
    },
  };
}

function createRiskConfig(): BacktestSessionConfig['risk'] {
  return {
    rules: [
      {
        ruleId: 'max-drawdown',
        type: 'max-drawdown',
        enabled: true,
        priority: 1,
        params: { threshold: 0.2 },
      },
    ],
  };
}

async function main() {
  // 1. 创建编排器
  console.log('1️⃣  创建编排器...');
  const moduleCoordinator = createModuleCoordinator();
  const orchestrator = createOrchestrator(moduleCoordinator);
  
  // 2. 定义会话配置
  console.log('2️⃣  定义会话配置...');
  const config: BacktestSessionConfig = {
    sessionId: 'my-first-backtest',
    data: createDataConfig(),
    strategy: createStrategyConfig(),
    execution: createExecutionConfig(),
    risk: createRiskConfig(),
  };
  
  try {
    // 3. 创建会话
    console.log('3️⃣  创建会话...');
    const session = await orchestrator.createSession(config);
    console.log(`✅ 会话创建成功: ${session.state}`);
    
    // 4. 启动回测
    console.log('4️⃣  启动回测...');
    await orchestrator.start('my-first-backtest');
    console.log(`✅ 会话状态: ${session.state}`);
    
    // 5. 监听会话事件
    session.on(SessionEventType.StateChanged, (event) => {
      const data = event.data as StateChangedEventData | undefined;
      const from = data?.previousState ?? 'unknown';
      const to = data?.currentState ?? session.state;
      console.log(`📊 状态变化: ${from} -> ${to}`);
    });
    
    session.on(SessionEventType.Failed, (event) => {
      console.error(`❌ 错误: ${JSON.stringify(event.data)}`);
    });
    
    // 6. 等待一段时间（模拟回测运行）
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 7. 暂停会话
    console.log('5️⃣  暂停会话...');
    await orchestrator.pause('my-first-backtest');
    console.log(`✅ 会话状态: ${session.state}`);
    
    // 8. 创建快照
    console.log('6️⃣  创建快照...');
    const checkpointId = await orchestrator.createSnapshot(
      'my-first-backtest',
      'manual'
    );
    console.log(`✅ 快照创建成功: ${checkpointId}`);
    
    // 9. 恢复会话
    console.log('7️⃣  恢复会话...');
    await orchestrator.resume('my-first-backtest');
    console.log(`✅ 会话状态: ${session.state}`);
    
    // 10. 等待一段时间
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 11. 停止会话
    console.log('8️⃣  停止会话...');
    await orchestrator.stop('my-first-backtest');
    console.log(`✅ 会话状态: ${session.state}`);
    
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
