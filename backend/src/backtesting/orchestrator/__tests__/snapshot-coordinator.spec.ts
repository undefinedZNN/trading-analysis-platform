/**
 * 快照协调器单元测试
 */

import { SnapshotCoordinator, createSnapshotCoordinator } from '../snapshot/snapshot-coordinator';
import { SnapshotManager, type ModuleStateCollector } from '../snapshot/snapshot-manager';
import { FileStorage } from '../snapshot/file-storage';
import { JsonSerializer } from '../snapshot/json-serializer';
import type { SessionSnapshot } from '../interfaces/snapshot';
import * as path from 'path';
import * as os from 'os';

const createTempDir = (prefix: string) =>
  path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
import * as fs from 'fs/promises';

describe('SnapshotCoordinator', () => {
  let coordinator: SnapshotCoordinator;
  let manager: SnapshotManager;
  let storage: FileStorage;
  let serializer: JsonSerializer;
  let testBaseDir: string;
  
  // 模拟事件总线控制器
  let eventBusController: {
    pause(): Promise<void>;
    resume(): Promise<void>;
    isPaused(): boolean;
  };
  
  let isPaused = false;
  
  beforeEach(async () => {
    testBaseDir = createTempDir('test-snapshots');
    
    serializer = new JsonSerializer();
    storage = new FileStorage(serializer, {
      baseDir: testBaseDir,
      autoCreateDir: true,
    });
    
    manager = new SnapshotManager({
      storage,
      version: '1.0.0',
      autoCleanup: false,
    });
    
    coordinator = new SnapshotCoordinator({
      snapshotManager: manager,
      timeout: 5000,
      rollbackOnFailure: true,
      validateSnapshot: true,
    });
    
    // 创建模拟的事件总线控制器
    isPaused = false;
    eventBusController = {
      pause: async () => {
        isPaused = true;
      },
      resume: async () => {
        isPaused = false;
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
  
  describe('Constructor', () => {
    it('should create with default config', () => {
      const c = new SnapshotCoordinator({ snapshotManager: manager });
      expect(c).toBeInstanceOf(SnapshotCoordinator);
    });
    
    it('should create with custom config', () => {
      const c = new SnapshotCoordinator({
        snapshotManager: manager,
        timeout: 10000,
        rollbackOnFailure: false,
        validateSnapshot: false,
      });
      expect(c).toBeInstanceOf(SnapshotCoordinator);
    });
    
    it('should create using factory', () => {
      const c = createSnapshotCoordinator({ snapshotManager: manager });
      expect(c).toBeInstanceOf(SnapshotCoordinator);
    });
  });
  
  describe('registerEventBusController', () => {
    it('should register event bus controller', () => {
      const newCoordinator = new SnapshotCoordinator({ snapshotManager: manager });
      
      expect(() => {
        newCoordinator.registerEventBusController(eventBusController);
      }).not.toThrow();
    });
  });
  
  describe('createCoordinatedSnapshot', () => {
    it('should create coordinated snapshot successfully', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      const result = await coordinator.createCoordinatedSnapshot(
        'session-1',
        'test-snapshot',
        {
          lastSequenceId: 'seq-100',
          processedCount: 100,
        }
      );
      
      expect(result.success).toBe(true);
      expect(result.checkpointId).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
      expect(result.steps.length).toBeGreaterThan(0);
    });
    
    it('should pause and resume event bus', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      expect(isPaused).toBe(false);
      
      const result = await coordinator.createCoordinatedSnapshot('session-1');
      
      // 快照创建后，事件总线应该恢复
      expect(isPaused).toBe(false);
      expect(result.success).toBe(true);
    });
    
    it('should include all steps in result', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      const result = await coordinator.createCoordinatedSnapshot('session-1');
      
      expect(result.steps).toBeDefined();
      expect(result.steps.length).toBeGreaterThanOrEqual(3); // Pause, Create, Resume
      
      const stepNames = result.steps.map(s => s.name);
      expect(stepNames).toContain('Pause EventBus');
      expect(stepNames).toContain('Create Snapshot');
      expect(stepNames).toContain('Resume EventBus');
    });
    
    it('should validate snapshot when enabled', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      const result = await coordinator.createCoordinatedSnapshot('session-1');
      
      const stepNames = result.steps.map(s => s.name);
      expect(stepNames).toContain('Validate Snapshot');
    });
  });
  
  describe('restoreCoordinatedSnapshot', () => {
    it('should restore coordinated snapshot successfully', async () => {
      let restoredState: any = null;
      
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test-data' }),
        restoreState: async (state) => {
          restoredState = state;
        },
      };
      
      manager.registerCollector(collector);
      
      // 创建快照
      const createResult = await coordinator.createCoordinatedSnapshot('session-1');
      expect(createResult.success).toBe(true);
      
      // 恢复快照
      const restoreResult = await coordinator.restoreCoordinatedSnapshot(
        'session-1',
        createResult.checkpointId!
      );
      
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.duration).toBeGreaterThan(0);
      expect(restoredState).toEqual({ data: 'test-data' });
    });
    
    it('should pause and resume event bus during restore', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
        restoreState: async (state) => {},
      };
      
      manager.registerCollector(collector);
      
      const createResult = await coordinator.createCoordinatedSnapshot('session-1');
      
      expect(isPaused).toBe(false);
      
      const restoreResult = await coordinator.restoreCoordinatedSnapshot(
        'session-1',
        createResult.checkpointId!
      );
      
      // 恢复后，事件总线应该恢复
      expect(isPaused).toBe(false);
      expect(restoreResult.success).toBe(true);
    });
    
    it('should include all restore steps', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
        restoreState: async (state) => {},
      };
      
      manager.registerCollector(collector);
      
      const createResult = await coordinator.createCoordinatedSnapshot('session-1');
      const restoreResult = await coordinator.restoreCoordinatedSnapshot(
        'session-1',
        createResult.checkpointId!
      );
      
      expect(restoreResult.steps).toBeDefined();
      expect(restoreResult.steps.length).toBeGreaterThanOrEqual(4);
      
      const stepNames = restoreResult.steps.map(s => s.name);
      expect(stepNames).toContain('Validate Snapshot Exists');
      expect(stepNames).toContain('Pause EventBus');
      expect(stepNames).toContain('Restore Snapshot');
      expect(stepNames).toContain('Resume EventBus');
    });
    
    it('should fail for non-existent snapshot', async () => {
      const result = await coordinator.restoreCoordinatedSnapshot(
        'session-1',
        'non-existent'
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('listSnapshots', () => {
    it('should list all snapshots', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      await coordinator.createCoordinatedSnapshot('session-1');
      await coordinator.createCoordinatedSnapshot('session-1');
      
      const snapshots = await coordinator.listSnapshots('session-1');
      
      expect(snapshots.length).toBe(2);
    });
  });
  
  describe('deleteSnapshot', () => {
    it('should delete snapshot', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      const result = await coordinator.createCoordinatedSnapshot('session-1');
      
      await coordinator.deleteSnapshot('session-1', result.checkpointId!);
      
      const isValid = await coordinator.validateSnapshot('session-1', result.checkpointId!);
      expect(isValid).toBe(false);
    });
  });
  
  describe('validateSnapshot', () => {
    it('should validate existing snapshot', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      const result = await coordinator.createCoordinatedSnapshot('session-1');
      
      const isValid = await coordinator.validateSnapshot('session-1', result.checkpointId!);
      expect(isValid).toBe(true);
    });
    
    it('should return false for non-existent snapshot', async () => {
      const isValid = await coordinator.validateSnapshot('session-1', 'non-existent');
      expect(isValid).toBe(false);
    });
  });
  
  describe('getSnapshotDetails', () => {
    it('should get snapshot details', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      const result = await coordinator.createCoordinatedSnapshot('session-1');
      
      const details = await coordinator.getSnapshotDetails('session-1', result.checkpointId!);
      
      expect(details.meta).toBeDefined();
      expect(details.modules).toContain('test-module');
      expect(details.isValid).toBe(true);
    });
  });
  
  describe('compareSnapshots', () => {
    it('should compare two snapshots', async () => {
      let counter = 0;
      
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: counter++ }),
      };
      
      manager.registerCollector(collector);
      
      const result1 = await coordinator.createCoordinatedSnapshot('session-1');
      await new Promise(resolve => setTimeout(resolve, 100));
      const result2 = await coordinator.createCoordinatedSnapshot('session-1');
      
      const comparison = await coordinator.compareSnapshots(
        'session-1',
        result1.checkpointId!,
        result2.checkpointId!
      );
      
      expect(comparison.addedModules).toEqual([]);
      expect(comparison.removedModules).toEqual([]);
      expect(comparison.modifiedModules).toContain('test-module');
      expect(comparison.timeDiff).toBeGreaterThan(0);
    });
    
    it('should detect added modules', async () => {
      const collector1: ModuleStateCollector = {
        moduleName: 'module-1',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector1);
      
      const result1 = await coordinator.createCoordinatedSnapshot('session-1');
      
      // 添加第二个模块
      const collector2: ModuleStateCollector = {
        moduleName: 'module-2',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector2);
      
      const result2 = await coordinator.createCoordinatedSnapshot('session-1');
      
      const comparison = await coordinator.compareSnapshots(
        'session-1',
        result1.checkpointId!,
        result2.checkpointId!
      );
      
      expect(comparison.addedModules).toContain('module-2');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle snapshot creation failure', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'failing-module',
        collectState: async () => {
          throw new Error('Collection failed');
        },
      };
      
      manager.registerCollector(collector);
      
      const result = await coordinator.createCoordinatedSnapshot('session-1');
      
      // 即使模块采集异常也不抛出，返回成功
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.checkpointId).toBeDefined();
    });
    
    it('should rollback on failure', async () => {
      const failingCoordinator = new SnapshotCoordinator({
        snapshotManager: manager,
        rollbackOnFailure: true,
      });
      
      failingCoordinator.registerEventBusController(eventBusController);
      
      const collector: ModuleStateCollector = {
        moduleName: 'failing-module',
        collectState: async () => {
          throw new Error('Collection failed');
        },
      };
      
      manager.registerCollector(collector);
      
      await failingCoordinator.createCoordinatedSnapshot('session-1');
      
      // 事件总线应该已恢复
      expect(isPaused).toBe(false);
    });
  });
  
  describe('Timeout Handling', () => {
    it('should timeout if operation takes too long', async () => {
      const slowCoordinator = new SnapshotCoordinator({
        snapshotManager: manager,
        timeout: 100, // 100ms超时
      });
      
      const collector: ModuleStateCollector = {
        moduleName: 'slow-module',
        collectState: async () => {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms
          return { data: 'test' };
        },
      };
      
      manager.registerCollector(collector);
      
      const result = await slowCoordinator.createCoordinatedSnapshot('session-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create snapshot');
    });
  });
  
  describe('Concurrent Operations', () => {
    it('should handle concurrent snapshot creations', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      
      const results = await Promise.all([
        coordinator.createCoordinatedSnapshot('session-1'),
        coordinator.createCoordinatedSnapshot('session-2'),
        coordinator.createCoordinatedSnapshot('session-3'),
      ]);
      
      expect(results.every(r => r.success)).toBe(true);
      expect(results.map(r => r.checkpointId)).toHaveLength(3);
    });
  });
});
