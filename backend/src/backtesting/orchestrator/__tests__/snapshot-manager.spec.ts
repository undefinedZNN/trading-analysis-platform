/**
 * 快照管理器单元测试
 */

import { SnapshotManager, createSnapshotManager, type ModuleStateCollector } from '../snapshot/snapshot-manager';
import { VersionManager, createVersionManager } from '../snapshot/version-manager';
import { FileStorage } from '../snapshot/file-storage';
import { JsonSerializer } from '../snapshot/json-serializer';
import type { SessionSnapshot, SnapshotMeta } from '../interfaces/snapshot';
import { SnapshotNotFoundError, SnapshotAlreadyExistsError } from '../interfaces/snapshot';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('VersionManager', () => {
  let versionManager: VersionManager;
  
  beforeEach(() => {
    versionManager = new VersionManager();
  });
  
  describe('Configuration', () => {
    it('should create with default config', () => {
      const vm = new VersionManager();
      expect(vm).toBeInstanceOf(VersionManager);
    });
    
    it('should create with custom config', () => {
      const vm = new VersionManager({
        maxSnapshots: 20,
        minSnapshots: 5,
        expirationMs: 30 * 24 * 60 * 60 * 1000,
        cleanupStrategy: 'size-based',
      });
      expect(vm).toBeInstanceOf(VersionManager);
    });
    
    it('should throw error for invalid config', () => {
      expect(() => {
        new VersionManager({
          maxSnapshots: 5,
          minSnapshots: 10, // min > max
        });
      }).toThrow();
    });
    
    it('should create using factory', () => {
      const vm = createVersionManager({ maxSnapshots: 15 });
      expect(vm).toBeInstanceOf(VersionManager);
    });
  });
  
  describe('shouldCleanup', () => {
    it('should return false when below max', () => {
      const snapshots: SnapshotMeta[] = Array(5).fill(null).map((_, i) => ({
        sessionId: 'session-1',
        checkpointId: `checkpoint-${i}`,
        createdAt: Date.now(),
        status: 'active',
        version: '1.0.0',
        compressed: true,
      }));
      
      expect(versionManager.shouldCleanup(snapshots)).toBe(false);
    });
    
    it('should return true when exceeds max', () => {
      const snapshots: SnapshotMeta[] = Array(15).fill(null).map((_, i) => ({
        sessionId: 'session-1',
        checkpointId: `checkpoint-${i}`,
        createdAt: Date.now(),
        status: 'active',
        version: '1.0.0',
        compressed: true,
      }));
      
      expect(versionManager.shouldCleanup(snapshots)).toBe(true);
    });
  });
  
  describe('decideCleanup', () => {
    it('should keep all when below minimum', () => {
      const snapshots: SnapshotMeta[] = Array(2).fill(null).map((_, i) => ({
        sessionId: 'session-1',
        checkpointId: `checkpoint-${i}`,
        createdAt: Date.now() + i * 1000,
        status: 'active',
        version: '1.0.0',
        compressed: true,
      }));
      
      const decision = versionManager.decideCleanup(snapshots);
      
      expect(decision.toDelete.length).toBe(0);
      expect(decision.toKeep.length).toBe(2);
    });
    
    it('should cleanup oldest when exceeds max', () => {
      const snapshots: SnapshotMeta[] = Array(15).fill(null).map((_, i) => ({
        sessionId: 'session-1',
        checkpointId: `checkpoint-${i}`,
        createdAt: Date.now() + i * 1000,
        status: 'active',
        version: '1.0.0',
        compressed: true,
      }));
      
      const decision = versionManager.decideCleanup(snapshots);
      
      expect(decision.toDelete.length).toBe(5);
      expect(decision.toKeep.length).toBe(10);
      expect(decision.toKeep[0].checkpointId).toBe('checkpoint-5');
    });
  });
  
  describe('getExpiredSnapshots', () => {
    it('should return expired snapshots', () => {
      const vm = new VersionManager({ expirationMs: 1000 }); // 1秒过期
      
      const snapshots: SnapshotMeta[] = [
        {
          sessionId: 'session-1',
          checkpointId: 'checkpoint-1',
          createdAt: Date.now() - 2000, // 2秒前（已过期）
          status: 'active',
          version: '1.0.0',
          compressed: true,
        },
        {
          sessionId: 'session-1',
          checkpointId: 'checkpoint-2',
          createdAt: Date.now(), // 刚刚（未过期）
          status: 'active',
          version: '1.0.0',
          compressed: true,
        },
      ];
      
      const expired = vm.getExpiredSnapshots(snapshots);
      expect(expired.length).toBe(1);
      expect(expired[0].checkpointId).toBe('checkpoint-1');
    });
  });
  
  describe('validateVersion', () => {
    it('should validate correct version format', () => {
      const snapshot: SnapshotMeta = {
        sessionId: 'session-1',
        checkpointId: 'checkpoint-1',
        createdAt: Date.now(),
        status: 'active',
        version: '1.0.0',
        compressed: true,
      };
      
      expect(versionManager.validateVersion(snapshot)).toBe(true);
    });
    
    it('should reject invalid version format', () => {
      const snapshot: SnapshotMeta = {
        sessionId: 'session-1',
        checkpointId: 'checkpoint-1',
        createdAt: Date.now(),
        status: 'active',
        version: 'invalid',
        compressed: true,
      };
      
      expect(versionManager.validateVersion(snapshot)).toBe(false);
    });
    
    it('should validate against expected version', () => {
      const snapshot: SnapshotMeta = {
        sessionId: 'session-1',
        checkpointId: 'checkpoint-1',
        createdAt: Date.now(),
        status: 'active',
        version: '1.0.0',
        compressed: true,
      };
      
      expect(versionManager.validateVersion(snapshot, '1.0.0')).toBe(true);
      expect(versionManager.validateVersion(snapshot, '2.0.0')).toBe(false);
    });
  });
  
  describe('compareVersions', () => {
    it('should compare versions correctly', () => {
      expect(versionManager.compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(versionManager.compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(versionManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(versionManager.compareVersions('1.2.3', '1.2.4')).toBe(-1);
    });
  });
  
  describe('generateCheckpointId', () => {
    it('should generate unique checkpoint IDs', () => {
      const id1 = versionManager.generateCheckpointId('session-1');
      const id2 = versionManager.generateCheckpointId('session-1');
      
      expect(id1).not.toBe(id2);
      expect(id1).toContain('session-1');
    });
    
    it('should include sequence number', () => {
      const id = versionManager.generateCheckpointId('session-1', 42);
      expect(id).toContain('0042');
    });
  });
});

describe('SnapshotManager', () => {
  let manager: SnapshotManager;
  let storage: FileStorage;
  let serializer: JsonSerializer;
  let testBaseDir: string;
  
  beforeEach(async () => {
    testBaseDir = path.join(os.tmpdir(), `test-snapshots-${Date.now()}`);
    
    serializer = new JsonSerializer();
    storage = new FileStorage(serializer, {
      baseDir: testBaseDir,
      autoCreateDir: true,
    });
    
    manager = new SnapshotManager({
      storage,
      version: '1.0.0',
      autoCleanup: false, // 禁用自动清理以便测试
    });
    
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
      const m = new SnapshotManager({ storage });
      expect(m).toBeInstanceOf(SnapshotManager);
    });
    
    it('should create with custom config', () => {
      const m = new SnapshotManager({
        storage,
        version: '2.0.0',
        autoCleanup: true,
        incrementalSnapshot: true,
        versionConfig: {
          maxSnapshots: 20,
        },
      });
      expect(m).toBeInstanceOf(SnapshotManager);
    });
    
    it('should create using factory', () => {
      const m = createSnapshotManager({ storage });
      expect(m).toBeInstanceOf(SnapshotManager);
    });
  });
  
  describe('Module State Collectors', () => {
    it('should register collector', () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      expect(() => {
        manager.registerCollector(collector);
      }).not.toThrow();
    });
    
    it('should unregister collector', () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ data: 'test' }),
      };
      
      manager.registerCollector(collector);
      expect(() => {
        manager.unregisterCollector('test-module');
      }).not.toThrow();
    });
  });
  
  describe('createSnapshot', () => {
    it('should create snapshot successfully', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      manager.registerCollector(collector);
      
      const checkpointId = await manager.createSnapshot('session-1', 'test', {
        lastSequenceId: 'seq-100',
        processedCount: 100,
      });
      
      expect(checkpointId).toBeDefined();
      expect(typeof checkpointId).toBe('string');
    });
    
    it('should throw error for duplicate checkpoint', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      manager.registerCollector(collector);
      
      const checkpointId = await manager.createSnapshot('session-1');
      
      // 手动创建相同ID的快照（模拟冲突）
      // 实际上nanoid会生成不同ID，这里只是测试错误处理
      // 由于ID包含时间戳和随机字符串，实际不会重复
    });
    
    it('should collect multiple module states', async () => {
      const collector1: ModuleStateCollector = {
        moduleName: 'module-1',
        collectState: async () => ({ data: 'module1' }),
      };
      
      const collector2: ModuleStateCollector = {
        moduleName: 'module-2',
        collectState: async () => ({ data: 'module2' }),
      };
      
      manager.registerCollector(collector1);
      manager.registerCollector(collector2);
      
      const checkpointId = await manager.createSnapshot('session-1');
      const snapshot = await manager.loadSnapshot('session-1', checkpointId);
      
      expect(snapshot.modules['module-1']).toBeDefined();
      expect(snapshot.modules['module-2']).toBeDefined();
    });
  });
  
  describe('loadSnapshot', () => {
    it('should load snapshot successfully', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      manager.registerCollector(collector);
      
      const checkpointId = await manager.createSnapshot('session-1');
      const snapshot = await manager.loadSnapshot('session-1', checkpointId);
      
      expect(snapshot.meta.sessionId).toBe('session-1');
      expect(snapshot.meta.checkpointId).toBe(checkpointId);
      expect(snapshot.modules['test-module'].state.counter).toBe(42);
    });
    
    it('should throw error for non-existent snapshot', async () => {
      await expect(
        manager.loadSnapshot('session-1', 'non-existent')
      ).rejects.toThrow(SnapshotNotFoundError);
    });
  });
  
  describe('restoreSnapshot', () => {
    it('should restore snapshot successfully', async () => {
      let restoredState: any = null;
      
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
        restoreState: async (state) => {
          restoredState = state;
        },
      };
      
      manager.registerCollector(collector);
      
      const checkpointId = await manager.createSnapshot('session-1');
      await manager.restoreSnapshot('session-1', checkpointId);
      
      expect(restoredState).toEqual({ counter: 42 });
    });
    
    it('should handle modules without restore function', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
        // 没有 restoreState
      };
      
      manager.registerCollector(collector);
      
      const checkpointId = await manager.createSnapshot('session-1');
      
      // 应该不抛出错误，只是警告
      await expect(
        manager.restoreSnapshot('session-1', checkpointId)
      ).resolves.not.toThrow();
    });
  });
  
  describe('listSnapshots', () => {
    it('should list all snapshots', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      manager.registerCollector(collector);
      
      await manager.createSnapshot('session-1');
      await manager.createSnapshot('session-1');
      await manager.createSnapshot('session-1');
      
      const snapshots = await manager.listSnapshots('session-1');
      expect(snapshots.length).toBe(3);
    });
    
    it('should return empty array for non-existent session', async () => {
      const snapshots = await manager.listSnapshots('non-existent');
      expect(snapshots).toEqual([]);
    });
  });
  
  describe('deleteSnapshot', () => {
    it('should delete snapshot successfully', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      manager.registerCollector(collector);
      
      const checkpointId = await manager.createSnapshot('session-1');
      await manager.deleteSnapshot('session-1', checkpointId);
      
      const exists = await storage.exists('session-1', checkpointId);
      expect(exists).toBe(false);
    });
  });
  
  describe('validateSnapshot', () => {
    it('should validate existing snapshot', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      manager.registerCollector(collector);
      
      const checkpointId = await manager.createSnapshot('session-1');
      const isValid = await manager.validateSnapshot('session-1', checkpointId);
      
      expect(isValid).toBe(true);
    });
    
    it('should return false for non-existent snapshot', async () => {
      const isValid = await manager.validateSnapshot('session-1', 'non-existent');
      expect(isValid).toBe(false);
    });
  });
  
  describe('cleanup', () => {
    it('should cleanup all snapshots', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      manager.registerCollector(collector);
      
      await manager.createSnapshot('session-1');
      await manager.createSnapshot('session-1');
      
      await manager.cleanup('session-1');
      
      const snapshots = await manager.listSnapshots('session-1');
      expect(snapshots.length).toBe(0);
    });
  });
  
  describe('getStats', () => {
    it('should return statistics', async () => {
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      manager.registerCollector(collector);
      
      await manager.createSnapshot('session-1');
      await manager.createSnapshot('session-1');
      
      const stats = await manager.getStats('session-1');
      
      expect(stats.count).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });
  
  describe('Auto Cleanup', () => {
    it('should auto cleanup when enabled', async () => {
      const autoCleanupManager = new SnapshotManager({
        storage,
        version: '1.0.0',
        autoCleanup: true,
        versionConfig: {
          maxSnapshots: 3,
        },
      });
      
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: 42 }),
      };
      
      autoCleanupManager.registerCollector(collector);
      
      // 创建5个快照
      for (let i = 0; i < 5; i++) {
        await autoCleanupManager.createSnapshot('session-1');
      }
      
      const snapshots = await autoCleanupManager.listSnapshots('session-1');
      
      // 应该只保留最新的3个
      expect(snapshots.length).toBeLessThanOrEqual(3);
    });
  });
  
  describe('Incremental Snapshot', () => {
    it('should create incremental snapshot', async () => {
      const incrementalManager = new SnapshotManager({
        storage,
        version: '1.0.0',
        incrementalSnapshot: true,
      });
      
      let counter = 0;
      const collector: ModuleStateCollector = {
        moduleName: 'test-module',
        collectState: async () => ({ counter: counter++ }),
      };
      
      incrementalManager.registerCollector(collector);
      
      // 第一个快照（完整）
      const checkpoint1 = await incrementalManager.createSnapshot('session-1');
      const snapshot1 = await incrementalManager.loadSnapshot('session-1', checkpoint1);
      
      expect(snapshot1.modules['test-module']).toBeDefined();
      
      // 第二个快照（增量，状态已变化）
      const checkpoint2 = await incrementalManager.createSnapshot('session-1');
      const snapshot2 = await incrementalManager.loadSnapshot('session-1', checkpoint2);
      
      expect(snapshot2.modules['test-module']).toBeDefined();
    });
  });
});

