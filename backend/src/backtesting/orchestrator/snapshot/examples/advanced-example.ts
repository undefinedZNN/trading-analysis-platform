/**
 * 高级快照使用示例
 * 
 * 演示快照系统的高级特性
 */

import {
  SnapshotCoordinator,
  SnapshotManager,
  FileStorage,
  JsonSerializer,
  type ModuleStateCollector,
} from '../index';

async function advancedSnapshotExample() {
  console.log('=== 高级快照示例 ===\n');
  
  // 创建快照栈
  const serializer = new JsonSerializer({ compression: true });
  const storage = new FileStorage(serializer, {
    baseDir: './snapshots-advanced',
    autoCreateDir: true,
  });
  const manager = new SnapshotManager({
    storage,
    version: '1.0.0',
    autoCleanup: true,
    incrementalSnapshot: true, // 启用增量快照
    versionConfig: {
      maxSnapshots: 20,
      minSnapshots: 5,
      cleanupStrategy: 'oldest',
    },
  });
  const coordinator = new SnapshotCoordinator({
    snapshotManager: manager,
    timeout: 30000,
  });
  
  // ========== 1. 多模块复杂状态 ==========
  console.log('1. 多模块复杂状态...\n');
  
  const modules = {
    strategy: {
      positions: [
        { symbol: 'BTCUSDT', size: 1.5, entry: 50000, stopLoss: 48000 },
        { symbol: 'ETHUSDT', size: 10, entry: 3000, stopLoss: 2900 },
      ],
      signals: ['buy', 'sell', 'hold'],
      parameters: { riskLevel: 'medium', leverage: 2 },
    },
    execution: {
      orders: Array(10).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'filled',
        price: 50000 + i * 100,
      })),
      fills: [],
    },
    risk: {
      exposure: 100000,
      maxDrawdown: 0.15,
      metrics: { sharpe: 1.8, sortino: 2.1 },
    },
    ledger: {
      balance: 50000,
      equity: 55000,
      pnl: 5000,
      trades: 150,
    },
  };
  
  // 注册所有模块
  Object.entries(modules).forEach(([name, state]) => {
    manager.registerCollector({
      moduleName: name,
      collectState: async () => {
        console.log(`  - 收集 ${name} 状态`);
        return JSON.parse(JSON.stringify(state));
      },
      restoreState: async (newState) => {
        console.log(`  - 恢复 ${name} 状态`);
        Object.assign(state, newState);
      },
    });
  });
  
  // ========== 2. 创建多个快照 ==========
  console.log('\n2. 创建多个快照...\n');
  
  const checkpoints: string[] = [];
  
  for (let i = 0; i < 5; i++) {
    // 修改状态
    modules.strategy.positions[0].entry += 100;
    modules.ledger.balance += 1000;
    modules.ledger.pnl += 500;
    
    const result = await coordinator.createCoordinatedSnapshot(
      'advanced-session',
      `checkpoint-${i}`,
      {
        lastSequenceId: `seq-${1000 + i * 100}`,
        processedCount: 1000 + i * 100,
      }
    );
    
    if (result.success) {
      console.log(`  ✓ 快照 ${i + 1} 创建成功 (${result.duration}ms)`);
      checkpoints.push(result.checkpointId!);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // ========== 3. 快照对比 ==========
  console.log('\n3. 快照对比...\n');
  
  const comparison = await coordinator.compareSnapshots(
    'advanced-session',
    checkpoints[0],
    checkpoints[4]
  );
  
  console.log('  对比结果:');
  console.log('  - 新增模块:', comparison.addedModules);
  console.log('  - 删除模块:', comparison.removedModules);
  console.log('  - 修改模块:', comparison.modifiedModules);
  console.log('  - 时间差:', comparison.timeDiff, 'ms');
  
  // ========== 4. 批量操作 ==========
  console.log('\n4. 批量操作...\n');
  
  const allSnapshots = await coordinator.listSnapshots('advanced-session');
  console.log(`  - 总共 ${allSnapshots.length} 个快照`);
  
  // 获取所有快照的详情
  for (const snapshot of allSnapshots) {
    const details = await coordinator.getSnapshotDetails(
      'advanced-session',
      snapshot.checkpointId
    );
    console.log(`    ${snapshot.checkpointId}:`);
    console.log(`      - 大小: ${(details.size / 1024).toFixed(2)} KB`);
    console.log(`      - 模块: ${details.modules.length}`);
    console.log(`      - 有效: ${details.isValid ? '是' : '否'}`);
  }
  
  // ========== 5. 性能监控 ==========
  console.log('\n5. 性能监控...\n');
  
  const stats = await manager.getStats('advanced-session');
  console.log('  统计信息:');
  console.log('  - 快照数量:', stats.count);
  console.log('  - 总大小:', (stats.totalSize / 1024 / 1024).toFixed(2), 'MB');
  console.log('  - 最旧快照:', stats.oldestSnapshot?.checkpointId);
  console.log('  - 最新快照:', stats.newestSnapshot?.checkpointId);
  
  // ========== 6. 时间旅行 ==========
  console.log('\n6. 时间旅行（回退到不同时间点）...\n');
  
  // 保存当前状态
  const currentPnl = modules.ledger.pnl;
  console.log('  - 当前PnL:', currentPnl);
  
  // 回退到第2个快照
  await coordinator.restoreCoordinatedSnapshot('advanced-session', checkpoints[1]);
  console.log('  - 回退到快照2后的PnL:', modules.ledger.pnl);
  
  // 回退到第4个快照
  await coordinator.restoreCoordinatedSnapshot('advanced-session', checkpoints[3]);
  console.log('  - 回退到快照4后的PnL:', modules.ledger.pnl);
  
  // 回退到第1个快照
  await coordinator.restoreCoordinatedSnapshot('advanced-session', checkpoints[0]);
  console.log('  - 回退到快照1后的PnL:', modules.ledger.pnl);
  
  // ========== 7. 错误恢复 ==========
  console.log('\n7. 错误恢复...\n');
  
  // 创建一个会失败的收集器
  manager.registerCollector({
    moduleName: 'faulty-module',
    collectState: async () => {
      throw new Error('Simulated error');
    },
  });
  
  const faultyResult = await coordinator.createCoordinatedSnapshot(
    'advanced-session',
    'faulty-checkpoint'
  );
  
  if (!faultyResult.success) {
    console.log('  ✗ 预期的失败:', faultyResult.error);
    console.log('  - 失败的步骤:');
    faultyResult.steps.filter(s => !s.success).forEach(step => {
      console.log(`    ${step.name}: ${step.error}`);
    });
  }
  
  // 注销故障模块
  manager.unregisterCollector('faulty-module');
  
  // ========== 8. 清理 ==========
  console.log('\n8. 清理...\n');
  
  // 删除最旧的快照
  if (allSnapshots.length > 0) {
    const oldestCheckpoint = allSnapshots[allSnapshots.length - 1].checkpointId;
    await coordinator.deleteSnapshot('advanced-session', oldestCheckpoint);
    console.log(`  ✓ 删除了最旧的快照: ${oldestCheckpoint}`);
  }
  
  const remainingSnapshots = await coordinator.listSnapshots('advanced-session');
  console.log(`  - 剩余快照: ${remainingSnapshots.length}`);
  
  console.log('\n=== 高级示例完成 ===');
}

// 运行示例
if (require.main === module) {
  advancedSnapshotExample()
    .then(() => {
      console.log('\n成功！');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n错误:', error);
      process.exit(1);
    });
}

export { advancedSnapshotExample };

