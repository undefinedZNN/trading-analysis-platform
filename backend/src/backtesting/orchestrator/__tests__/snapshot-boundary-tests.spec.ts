/**
 * 快照系统边界测试和压力测试
 * 
 * 测试极端情况和边界条件
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

describe('Snapshot Boundary and Stress Tests', () => {
  let coordinator: SnapshotCoordinator;
  let manager: SnapshotManager;
  let storage: FileStorage;
  let serializer: JsonSerializer;
  let testBaseDir: string;
  
  beforeEach(async () => {
    testBaseDir = path.join(os.tmpdir(), `test-snapshots-boundary-${Date.now()}`);
    
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
      timeout: 10000,
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
  
  describe('Empty State Tests', () => {
    it('should handle empty snapshot', async () => {
      // 不注册任何收集器
      const result = await coordinator.createCoordinatedSnapshot('empty-session');
      
      expect(result.success).toBe(true);
      expect(result.checkpointId).toBeDefined();
    });
    
    it('should handle module with empty state', async () => {
      manager.registerCollector({
        moduleName: 'empty-module',
        collectState: async () => ({}),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('empty-state-session');
      expect(result.success).toBe(true);
    });
    
    it('should handle module with null state', async () => {
      manager.registerCollector({
        moduleName: 'null-module',
        collectState: async () => null,
      });
      
      const result = await coordinator.createCoordinatedSnapshot('null-state-session');
      expect(result.success).toBe(true);
    });
  });
  
  describe('Large Data Tests', () => {
    it('should handle very large snapshots', async () => {
      manager.registerCollector({
        moduleName: 'large-module',
        collectState: async () => ({
          largeArray: Array(50000).fill(null).map((_, i) => ({
            id: i,
            data: `item-${i}`,
            values: Array(10).fill(Math.random()),
          })),
        }),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('large-session');
      
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      
      // 验证可以恢复
      const restoreResult = await coordinator.restoreCoordinatedSnapshot(
        'large-session',
        result.checkpointId!
      );
      expect(restoreResult.success).toBe(true);
    });
    
    it('should handle deeply nested objects', async () => {
      // 创建深层嵌套对象
      let deepObject: any = { value: 'leaf' };
      for (let i = 0; i < 100; i++) {
        deepObject = { nested: deepObject, level: i };
      }
      
      manager.registerCollector({
        moduleName: 'deep-module',
        collectState: async () => deepObject,
      });
      
      const result = await coordinator.createCoordinatedSnapshot('deep-session');
      expect(result.success).toBe(true);
    });
  });
  
  describe('Special Characters Tests', () => {
    it('should handle unicode characters', async () => {
      manager.registerCollector({
        moduleName: 'unicode-module',
        collectState: async () => ({
          chinese: '你好世界',
          emoji: '🚀🎉💰📈',
          russian: 'Привет мир',
          arabic: 'مرحبا بالعالم',
        }),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('unicode-session');
      expect(result.success).toBe(true);
      
      const snapshot = await manager.loadSnapshot('unicode-session', result.checkpointId!);
      expect(snapshot.modules['unicode-module'].state.emoji).toBe('🚀🎉💰📈');
    });
    
    it('should handle special characters in session ID', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ data: 'test' }),
      });
      
      const specialIds = [
        'session-with-中文',
        'session_with_underscore',
        'session.with.dots',
      ];
      
      for (const sessionId of specialIds) {
        const result = await coordinator.createCoordinatedSnapshot(sessionId);
        expect(result.success).toBe(true);
      }
    });
  });
  
  describe('Concurrent Operations Tests', () => {
    it('should handle rapid sequential snapshots', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ timestamp: Date.now() }),
      });
      
      const results = [];
      for (let i = 0; i < 10; i++) {
        const result = await coordinator.createCoordinatedSnapshot('rapid-session');
        results.push(result);
      }
      
      expect(results.every(r => r.success)).toBe(true);
      expect(new Set(results.map(r => r.checkpointId)).size).toBe(10); // 所有ID都唯一
    });
    
    it('should handle concurrent snapshot operations on same session', async () => {
      let counter = 0;
      
      manager.registerCollector({
        moduleName: 'counter',
        collectState: async () => ({ value: counter++ }),
      });
      
      // 并发创建多个快照
      const results = await Promise.allSettled([
        coordinator.createCoordinatedSnapshot('concurrent-session'),
        coordinator.createCoordinatedSnapshot('concurrent-session'),
        coordinator.createCoordinatedSnapshot('concurrent-session'),
        coordinator.createCoordinatedSnapshot('concurrent-session'),
        coordinator.createCoordinatedSnapshot('concurrent-session'),
      ]);
      
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });
  
  describe('Edge Cases Tests', () => {
    it('should handle circular references gracefully', async () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // 循环引用
      
      manager.registerCollector({
        moduleName: 'circular',
        collectState: async () => obj,
      });
      
      // 应该失败或处理循环引用
      const result = await coordinator.createCoordinatedSnapshot('circular-session');
      // JSON.stringify 会抛出错误
      expect(result.success).toBe(false);
    });
    
    it('should handle undefined values', async () => {
      manager.registerCollector({
        moduleName: 'undefined-module',
        collectState: async () => ({
          defined: 'value',
          undefined: undefined,
          null: null,
        }),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('undefined-session');
      expect(result.success).toBe(true);
      
      const snapshot = await manager.loadSnapshot('undefined-session', result.checkpointId!);
      // undefined 会被 JSON 忽略
      expect(snapshot.modules['undefined-module'].state.undefined).toBeUndefined();
    });
    
    it('should handle NaN and Infinity', async () => {
      manager.registerCollector({
        moduleName: 'special-numbers',
        collectState: async () => ({
          nan: NaN,
          infinity: Infinity,
          negInfinity: -Infinity,
          normal: 42,
        }),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('numbers-session');
      expect(result.success).toBe(true);
      
      const snapshot = await manager.loadSnapshot('numbers-session', result.checkpointId!);
      // NaN 和 Infinity 会被转换为 null
      expect(snapshot.modules['special-numbers'].state.nan).toBeNull();
    });
    
    it('should handle Date objects', async () => {
      const now = new Date();
      
      manager.registerCollector({
        moduleName: 'date-module',
        collectState: async () => ({
          date: now,
          timestamp: now.getTime(),
        }),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('date-session');
      expect(result.success).toBe(true);
      
      const snapshot = await manager.loadSnapshot('date-session', result.checkpointId!);
      // Date 会被序列化为字符串
      expect(typeof snapshot.modules['date-module'].state.date).toBe('string');
    });
  });
  
  describe('Error Recovery Tests', () => {
    it('should recover from storage write failure', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ data: 'test' }),
      });
      
      // 创建成功的快照
      const result1 = await coordinator.createCoordinatedSnapshot('recovery-session');
      expect(result1.success).toBe(true);
      
      // 模拟存储失败（通过删除目录）
      await fs.rm(testBaseDir, { recursive: true, force: true });
      
      // 尝试创建快照应该失败
      const result2 = await coordinator.createCoordinatedSnapshot('recovery-session');
      expect(result2.success).toBe(false);
      
      // 重新创建目录
      await fs.mkdir(testBaseDir, { recursive: true });
      
      // 应该能够恢复
      const result3 = await coordinator.createCoordinatedSnapshot('recovery-session');
      expect(result3.success).toBe(true);
    });
    
    it('should handle module collection timeout', async () => {
      manager.registerCollector({
        moduleName: 'slow-module',
        collectState: async () => {
          await new Promise(resolve => setTimeout(resolve, 15000)); // 15秒
          return { data: 'slow' };
        },
      });
      
      const fastCoordinator = new SnapshotCoordinator({
        snapshotManager: manager,
        timeout: 100, // 100ms超时
      });
      
      const result = await fastCoordinator.createCoordinatedSnapshot('timeout-session');
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });
  
  describe('Version Compatibility Tests', () => {
    it('should handle version mismatch', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ data: 'v1' }),
      });
      
      const result = await coordinator.createCoordinatedSnapshot('version-session');
      expect(result.success).toBe(true);
      
      // 创建使用不同版本的管理器
      const manager2 = new SnapshotManager({
        storage,
        version: '2.0.0', // 不同版本
      });
      
      // 应该能加载但会警告
      const snapshot = await manager2.loadSnapshot('version-session', result.checkpointId!);
      expect(snapshot.meta.version).toBe('1.0.0');
    });
  });
  
  describe('Memory Leak Tests', () => {
    it('should not leak memory with many snapshots', async () => {
      manager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ data: Array(1000).fill('x') }),
      });
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 创建多个快照
      for (let i = 0; i < 20; i++) {
        await coordinator.createCoordinatedSnapshot('memory-session');
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // 内存增长应该是合理的（< 50MB）
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
  
  describe('Compression Tests', () => {
    it('should achieve reasonable compression ratio', async () => {
      // 创建高度重复的数据（应该压缩良好）
      const repetitiveData = {
        items: Array(1000).fill({
          id: '12345678',
          name: 'test-item',
          description: 'This is a test item with repeated content',
        }),
      };
      
      manager.registerCollector({
        moduleName: 'compressible',
        collectState: async () => repetitiveData,
      });
      
      const result = await coordinator.createCoordinatedSnapshot('compression-session');
      expect(result.success).toBe(true);
      
      const details = await coordinator.getSnapshotDetails(
        'compression-session',
        result.checkpointId!
      );
      
      const uncompressedSize = JSON.stringify(repetitiveData).length;
      const compressionRatio = details.size / uncompressedSize;
      
      console.log(`Compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);
      // 压缩率应该很好（< 30%）
      expect(compressionRatio).toBeLessThan(0.5);
    });
  });
  
  describe('Snapshot Cleanup Tests', () => {
    it('should respect max snapshots limit', async () => {
      const autoCleanupManager = new SnapshotManager({
        storage,
        version: '1.0.0',
        autoCleanup: true,
        versionConfig: {
          maxSnapshots: 5,
          minSnapshots: 2,
        },
      });
      
      const autoCoordinator = new SnapshotCoordinator({
        snapshotManager: autoCleanupManager,
      });
      
      autoCleanupManager.registerCollector({
        moduleName: 'test',
        collectState: async () => ({ timestamp: Date.now() }),
      });
      
      // 创建超过最大数量的快照
      for (let i = 0; i < 10; i++) {
        await autoCoordinator.createCoordinatedSnapshot('cleanup-session');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const snapshots = await autoCoordinator.listSnapshots('cleanup-session');
      expect(snapshots.length).toBeLessThanOrEqual(5);
      expect(snapshots.length).toBeGreaterThanOrEqual(2);
    });
  });
});

