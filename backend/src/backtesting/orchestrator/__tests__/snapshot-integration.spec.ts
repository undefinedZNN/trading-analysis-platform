/**
 * 快照系统集成测试
 * 
 * 测试完整的快照创建、存储、恢复流程
 */

import {
  SnapshotCoordinator,
  SnapshotManager,
  FileStorage,
  JsonSerializer,
  type ModuleStateCollector,
} from '../snapshot';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('Snapshot System Integration Tests', () => {
  let coordinator: SnapshotCoordinator;
  let manager: SnapshotManager;
  let storage: FileStorage;
  let serializer: JsonSerializer;
  let testBaseDir: string;
  
  // 模拟事件总线
  let eventBusController: {
    pause(): Promise<void>;
    resume(): Promise<void>;
    isPaused(): boolean;
  };
  let isPaused = false;
  
  beforeEach(async () => {
    testBaseDir = path.join(os.tmpdir(), `test-snapshots-integration-${Date.now()}`);
    
    // 创建完整的快照栈
    serializer = new JsonSerializer({
      pretty: false,
      compression: true,
      compressionLevel: 6,
    });
    
    storage = new FileStorage(serializer, {
      baseDir: testBaseDir,
      autoCreateDir: true,
      retryCount: 3,
      enableFileLock: true,
    });
    
    manager = new SnapshotManager({
      storage,
      version: '1.0.0',
      autoCleanup: true,
      versionConfig: {
        maxSnapshots: 10,
        minSnapshots: 3,
      },
    });
    
    coordinator = new SnapshotCoordinator({
      snapshotManager: manager,
      timeout: 10000,
      rollbackOnFailure: true,
      validateSnapshot: true,
    });
    
    // 创建事件总线控制器
    isPaused = false;
    eventBusController = {
      pause: async () => {
        isPaused = true;
        await new Promise(resolve => setTimeout(resolve, 10));
      },
      resume: async () => {
        isPaused = false;
        await new Promise(resolve => setTimeout(resolve, 10));
      },
      isPaused: () => isPaused,
    };
    
    coordinator.registerEventBusController(eventBusController);
    
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterEach(async () => {
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });
  
  describe('End-to-End Snapshot Flow', () => {
    it('should complete full snapshot lifecycle', async () => {
      // 模拟多个模块
      const strategyState = { position: 'long', entry: 100, stopLoss: 95 };
      const executionState = { orders: ['order-1', 'order-2'], fills: [] };
      const riskState = { exposure: 10000, maxDrawdown: 0.05 };
      
      manager.registerCollector({
        moduleName: 'strategy',
        collectState: async () => strategyState,
        restoreState: async (state) => {
          Object.assign(strategyState, state);
        },
      });
      
      manager.registerCollector({
        moduleName: 'execution',
        collectState: async () => executionState,
        restoreState: async (state) => {
          Object.assign(executionState, state);
        },
      });
      
      manager.registerCollector({
        moduleName: 'risk',
        collectState: async () => riskState,
        restoreState: async (state) => {
          Object.assign(riskState, state);
        },
      });
      
      // 1. 创建快照
      const createResult = await coordinator.createCoordinatedSnapshot(
        'integration-session',
        'initial-checkpoint',
        {
          lastSequenceId: 'seq-1000',
          processedCount: 1000,
        }
      );
      
      expect(createResult.success).toBe(true);
      expect(createResult.checkpointId).toBeDefined();
      
      // 2. 验证快照存在
      const exists = await storage.exists('integration-session', createResult.checkpointId!);
      expect(exists).toBe(true);
      
      // 3. 修改状态
      strategyState.position = 'short';
      strategyState.entry = 110;
      executionState.orders.push('order-3');
      riskState.exposure = 15000;
      
      // 4. 恢复快照
      const restoreResult = await coordinator.restoreCoordinatedSnapshot(
        'integration-session',
        createResult.checkpointId!
      );
      
      expect(restoreResult.success).toBe(true);
      
      // 5. 验证状态已恢复
      expect(strategyState.position).toBe('long');
      expect(strategyState.entry).toBe(100);
      expect(executionState.orders).toHaveLength(2);
      expect(riskState.exposure).toBe(10000);
    });
    
    it('should handle multiple snapshots in sequence', async () => {
      let counter = 0;
      
      manager.registerCollector({
        moduleName: 'counter',
        collectState: async () => ({ value: counter }),
        restoreState: async (state) => {
          counter = state.value;
        },
      });
      
      const checkpoints: string[] = [];
      
      // 创建多个快照
      for (let i = 0; i < 5; i++) {
        counter = i * 10;
        const result = await coordinator.createCoordinatedSnapshot('multi-session');
        expect(result.success).toBe(true);
        checkpoints.push(result.checkpointId!);
      }
      
      // 验证可以恢复到任意快照
      await coordinator.restoreCoordinatedSnapshot('multi-session', checkpoints[2]);
      expect(counter).toBe(20);
      
      await coordinator.restoreCoordinatedSnapshot('multi-session', checkpoints[4]);
      expect(counter).toBe(40);
      
      await coordinator.restoreCoordinatedSnapshot('multi-session', checkpoints[0]);
      expect(counter).toBe(0);
    });
  });
  
  describe('Concurrent Sessions', () => {
    it('should handle multiple sessions concurrently', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ data: 'test' }),
      });
      
      // 并发创建多个会话的快照
      const results = await Promise.all([
        coordinator.createCoordinatedSnapshot('session-1'),
        coordinator.createCoordinatedSnapshot('session-2'),
        coordinator.createCoordinatedSnapshot('session-3'),
        coordinator.createCoordinatedSnapshot('session-4'),
        coordinator.createCoordinatedSnapshot('session-5'),
      ]);
      
      // 所有都应该成功
      expect(results.every(r => r.success)).toBe(true);
      
      // 每个会话都应该有快照
      for (let i = 1; i <= 5; i++) {
        const snapshots = await coordinator.listSnapshots(`session-${i}`);
        expect(snapshots.length).toBe(1);
      }
    });
  });
  
  describe('Error Recovery', () => {
    it('should recover from module collection failure', async () => {
      let shouldFail = true;
      
      manager.registerCollector({
        moduleName: 'good-module',
        collectState: async () => ({ data: 'good' }),
      });
      
      manager.registerCollector({
        moduleName: 'bad-module',
        collectState: async () => {
          if (shouldFail) {
            throw new Error('Collection failed');
          }
          return { data: 'bad' };
        },
      });
      
      // 第一次应该失败
      const result1 = await coordinator.createCoordinatedSnapshot('error-session');
      expect(result1.success).toBe(false);
      
      // 修复问题后应该成功
      shouldFail = false;
      const result2 = await coordinator.createCoordinatedSnapshot('error-session');
      expect(result2.success).toBe(true);
    });
    
    it('should handle event bus pause failure', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ data: 'test' }),
      });
      
      // 创建一个会失败的事件总线控制器
      const failingController = {
        pause: async () => {
          throw new Error('Pause failed');
        },
        resume: async () => {},
        isPaused: () => false,
      };
      
      const failingCoordinator = new SnapshotCoordinator({
        snapshotManager: manager,
      });
      
      failingCoordinator.registerEventBusController(failingController);
      
      const result = await failingCoordinator.createCoordinatedSnapshot('failing-session');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Pause failed');
    });
  });
  
  describe('Performance Tests', () => {
    it('should create snapshot within reasonable time', async () => {
      // 创建多个模块
      for (let i = 0; i < 10; i++) {
        manager.registerCollector({
          moduleName: `module-${i}`,
          collectState: async () => ({
            data: Array(100).fill({ id: i, value: Math.random() }),
          }),
        });
      }
      
      const startTime = Date.now();
      const result = await coordinator.createCoordinatedSnapshot('perf-session');
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // 应该在5秒内完成
      
      console.log(`Snapshot creation time: ${duration}ms`);
      console.log(`Steps:`, result.steps.map(s => `${s.name}: ${s.duration}ms`));
    });
    
    it('should handle large state efficiently', async () => {
      // 创建一个大状态的模块
      manager.registerCollector({
        moduleName: 'large-module',
        collectState: async () => ({
          largeArray: Array(10000).fill(null).map((_, i) => ({
            id: i,
            data: `item-${i}`,
            timestamp: Date.now(),
            values: Array(10).fill(Math.random()),
          })),
        }),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('large-session');
      
      expect(result.success).toBe(true);
      
      // 检查压缩率
      const details = await coordinator.getSnapshotDetails(
        'large-session',
        result.checkpointId!
      );
      
      console.log(`Large snapshot size: ${(details.size / 1024 / 1024).toFixed(2)} MB`);
    });
  });
  
  describe('Snapshot Comparison', () => {
    it('should accurately compare snapshots', async () => {
      let state = { counter: 0, items: ['a', 'b'] };
      
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ ...state }),
      });
      
      // 创建第一个快照
      const result1 = await coordinator.createCoordinatedSnapshot('compare-session');
      
      // 修改状态
      state.counter = 10;
      state.items.push('c');
      
      // 创建第二个快照
      const result2 = await coordinator.createCoordinatedSnapshot('compare-session');
      
      // 比较快照
      const comparison = await coordinator.compareSnapshots(
        'compare-session',
        result1.checkpointId!,
        result2.checkpointId!
      );
      
      expect(comparison.modifiedModules).toContain('test');
      expect(comparison.timeDiff).toBeGreaterThan(0);
    });
  });
  
  describe('Auto Cleanup', () => {
    it('should automatically cleanup old snapshots', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ data: Date.now() }),
      });
      
      // 创建超过最大数量的快照
      for (let i = 0; i < 15; i++) {
        await coordinator.createCoordinatedSnapshot('cleanup-session');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // 应该只保留最多10个
      const snapshots = await coordinator.listSnapshots('cleanup-session');
      expect(snapshots.length).toBeLessThanOrEqual(10);
    });
  });
  
  describe('Snapshot Validation', () => {
    it('should validate snapshot integrity', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ data: 'test' }),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('validate-session');
      
      // 验证快照
      const isValid = await coordinator.validateSnapshot(
        'validate-session',
        result.checkpointId!
      );
      
      expect(isValid).toBe(true);
      
      // 获取详情
      const details = await coordinator.getSnapshotDetails(
        'validate-session',
        result.checkpointId!
      );
      
      expect(details.isValid).toBe(true);
      expect(details.modules).toContain('test');
    });
  });
  
  describe('Complex Scenarios', () => {
    it('should handle snapshot creation during active trading', async () => {
      // 模拟活跃交易场景
      const tradingState = {
        positions: [
          { symbol: 'BTCUSDT', size: 1.5, entry: 50000 },
          { symbol: 'ETHUSDT', size: 10, entry: 3000 },
        ],
        orders: ['order-1', 'order-2', 'order-3'],
        pnl: 1500,
      };
      
      manager.registerCollector({
        moduleName: 'trading',
        collectState: async () => ({ ...tradingState }),
        restoreState: async (state) => {
          Object.assign(tradingState, state);
        },
      });
      
      // 创建快照
      const result = await coordinator.createCoordinatedSnapshot(
        'trading-session',
        'before-trade'
      );
      
      expect(result.success).toBe(true);
      
      // 模拟交易执行
      tradingState.positions[0].size = 2.0;
      tradingState.orders.push('order-4');
      tradingState.pnl = 2000;
      
      // 创建另一个快照
      const result2 = await coordinator.createCoordinatedSnapshot(
        'trading-session',
        'after-trade'
      );
      
      expect(result2.success).toBe(true);
      
      // 可以恢复到交易前
      await coordinator.restoreCoordinatedSnapshot(
        'trading-session',
        result.checkpointId!
      );
      
      expect(tradingState.positions[0].size).toBe(1.5);
      expect(tradingState.pnl).toBe(1500);
    });
  });
});

