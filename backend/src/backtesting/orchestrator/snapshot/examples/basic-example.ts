/**
 * 基础快照使用示例
 * 
 * 演示快照系统的基本用法
 */

import {
  SnapshotCoordinator,
  SnapshotManager,
  FileStorage,
  JsonSerializer,
  type ModuleStateCollector,
} from '../index';

async function basicSnapshotExample() {
  console.log('=== 基础快照示例 ===\n');
  
  // 1. 创建序列化器
  console.log('1. 创建序列化器...');
  const serializer = new JsonSerializer({
    pretty: false,
    compression: true,
    compressionLevel: 6,
  });
  
  // 2. 创建存储引擎
  console.log('2. 创建存储引擎...');
  const storage = new FileStorage(serializer, {
    baseDir: './snapshots',
    autoCreateDir: true,
  });
  
  // 3. 创建快照管理器
  console.log('3. 创建快照管理器...');
  const manager = new SnapshotManager({
    storage,
    version: '1.0.0',
    autoCleanup: true,
    versionConfig: {
      maxSnapshots: 10,
    },
  });
  
  // 4. 创建快照协调器
  console.log('4. 创建快照协调器...');
  const coordinator = new SnapshotCoordinator({
    snapshotManager: manager,
    timeout: 30000,
    rollbackOnFailure: true,
    validateSnapshot: true,
  });
  
  // 5. 注册模块状态收集器
  console.log('5. 注册模块状态收集器...\n');
  
  // 策略模块
  let strategyState = {
    position: 'long',
    entry: 100,
    stopLoss: 95,
    takeProfit: 110,
  };
  
  manager.registerCollector({
    moduleName: 'strategy',
    collectState: async () => {
      console.log('  - 收集策略状态:', strategyState);
      return { ...strategyState };
    },
    restoreState: async (state) => {
      console.log('  - 恢复策略状态:', state);
      Object.assign(strategyState, state);
    },
  });
  
  // 执行模块
  let executionState = {
    orders: ['order-1', 'order-2'],
    fills: [],
  };
  
  manager.registerCollector({
    moduleName: 'execution',
    collectState: async () => {
      console.log('  - 收集执行状态:', executionState);
      return { ...executionState };
    },
    restoreState: async (state) => {
      console.log('  - 恢复执行状态:', state);
      Object.assign(executionState, state);
    },
  });
  
  // 6. 注册事件总线控制器（模拟）
  console.log('6. 注册事件总线控制器...\n');
  let eventBusPaused = false;
  
  coordinator.registerEventBusController({
    pause: async () => {
      console.log('  - 暂停事件总线');
      eventBusPaused = true;
    },
    resume: async () => {
      console.log('  - 恢复事件总线');
      eventBusPaused = false;
    },
    isPaused: () => eventBusPaused,
  });
  
  // 7. 创建快照
  console.log('\n7. 创建快照...');
  const createResult = await coordinator.createCoordinatedSnapshot(
    'demo-session',
    'initial-checkpoint',
    {
      lastSequenceId: 'seq-1000',
      processedCount: 1000,
    }
  );
  
  if (createResult.success) {
    console.log('  ✓ 快照创建成功！');
    console.log('  - 检查点ID:', createResult.checkpointId);
    console.log('  - 耗时:', createResult.duration, 'ms');
    console.log('  - 步骤:');
    createResult.steps.forEach(step => {
      console.log(`    ${step.success ? '✓' : '✗'} ${step.name} (${step.duration}ms)`);
    });
  } else {
    console.error('  ✗ 快照创建失败:', createResult.error);
  }
  
  // 8. 修改状态
  console.log('\n8. 修改状态...');
  strategyState.position = 'short';
  strategyState.entry = 105;
  executionState.orders.push('order-3');
  console.log('  - 新策略状态:', strategyState);
  console.log('  - 新执行状态:', executionState);
  
  // 9. 恢复快照
  console.log('\n9. 恢复快照...');
  const restoreResult = await coordinator.restoreCoordinatedSnapshot(
    'demo-session',
    createResult.checkpointId!
  );
  
  if (restoreResult.success) {
    console.log('  ✓ 快照恢复成功！');
    console.log('  - 耗时:', restoreResult.duration, 'ms');
    console.log('  - 恢复后的策略状态:', strategyState);
    console.log('  - 恢复后的执行状态:', executionState);
  } else {
    console.error('  ✗ 快照恢复失败:', restoreResult.error);
  }
  
  // 10. 列出所有快照
  console.log('\n10. 列出所有快照...');
  const snapshots = await coordinator.listSnapshots('demo-session');
  console.log(`  - 找到 ${snapshots.length} 个快照`);
  snapshots.forEach(snapshot => {
    console.log(`    - ${snapshot.checkpointId} (${new Date(snapshot.createdAt).toISOString()})`);
  });
  
  // 11. 获取快照详情
  console.log('\n11. 获取快照详情...');
  const details = await coordinator.getSnapshotDetails(
    'demo-session',
    createResult.checkpointId!
  );
  console.log('  - 会话ID:', details.meta.sessionId);
  console.log('  - 检查点ID:', details.meta.checkpointId);
  console.log('  - 创建时间:', new Date(details.meta.createdAt).toISOString());
  console.log('  - 模块:', details.modules.join(', '));
  console.log('  - 大小:', (details.size / 1024).toFixed(2), 'KB');
  console.log('  - 有效:', details.isValid ? '是' : '否');
  
  console.log('\n=== 示例完成 ===');
}

// 运行示例
if (require.main === module) {
  basicSnapshotExample()
    .then(() => {
      console.log('\n成功！');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n错误:', error);
      process.exit(1);
    });
}

export { basicSnapshotExample };

