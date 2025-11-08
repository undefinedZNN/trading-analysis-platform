/**
 * 文件存储引擎单元测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStorage, createFileStorage } from '../snapshot/file-storage';
import { JsonSerializer } from '../snapshot/json-serializer';
import type { SessionSnapshot } from '../interfaces/snapshot';
import { SnapshotStorageError } from '../interfaces/snapshot';
import * as os from 'os';

describe('FileStorage', () => {
  let storage: FileStorage;
  let serializer: JsonSerializer;
  let testBaseDir: string;
  
  // 创建测试快照
  const createTestSnapshot = (sessionId: string, checkpointId: string): SessionSnapshot => ({
    meta: {
      sessionId,
      checkpointId,
      createdAt: Date.now(),
      status: 'running',
      version: '1.0.0',
      compressed: true,
    },
    modules: {
      strategy: {
        state: { position: 'long', entry: 100 },
        timestamp: Date.now(),
      },
      execution: {
        state: { orders: [] },
        timestamp: Date.now(),
      },
    },
    eventStoreCheckpoint: {
      lastSequenceId: 'seq-100',
      lastTimestamp: Date.now(),
      processedCount: 100,
    },
  });
  
  beforeEach(async () => {
    // 创建临时测试目录
    testBaseDir = path.join(os.tmpdir(), `test-snapshots-${Date.now()}`);
    
    serializer = new JsonSerializer();
    storage = new FileStorage(serializer, {
      baseDir: testBaseDir,
      autoCreateDir: true,
    });
    
    // 等待基础目录创建
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });
  
  describe('Constructor', () => {
    it('should create storage with default config', () => {
      const s = new FileStorage(serializer, { baseDir: testBaseDir });
      expect(s).toBeInstanceOf(FileStorage);
    });
    
    it('should create storage with custom config', () => {
      const s = new FileStorage(serializer, {
        baseDir: testBaseDir,
        autoCreateDir: false,
        retryCount: 5,
        retryDelay: 200,
        fileMode: 0o600,
        dirMode: 0o700,
        enableFileLock: false,
      });
      expect(s).toBeInstanceOf(FileStorage);
    });
    
    it('should create storage using factory', () => {
      const s = createFileStorage(serializer, { baseDir: testBaseDir });
      expect(s).toBeInstanceOf(FileStorage);
    });
  });
  
  describe('save', () => {
    it('should save snapshot successfully', async () => {
      const snapshot = createTestSnapshot('session-1', 'checkpoint-1');
      
      await expect(storage.save(snapshot)).resolves.not.toThrow();
      
      // 验证文件存在
      const snapshotPath = path.join(testBaseDir, 'session-1', 'checkpoint-1.snapshot.json.gz');
      const metaPath = path.join(testBaseDir, 'session-1', 'checkpoint-1.meta.json');
      
      const snapshotExists = await fs.access(snapshotPath).then(() => true).catch(() => false);
      const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
      
      expect(snapshotExists).toBe(true);
      expect(metaExists).toBe(true);
    });
    
    it('should create session directory automatically', async () => {
      const snapshot = createTestSnapshot('new-session', 'checkpoint-1');
      
      await storage.save(snapshot);
      
      const sessionDir = path.join(testBaseDir, 'new-session');
      const stats = await fs.stat(sessionDir);
      
      expect(stats.isDirectory()).toBe(true);
    });
    
    it('should save multiple snapshots in same session', async () => {
      const snapshot1 = createTestSnapshot('session-1', 'checkpoint-1');
      const snapshot2 = createTestSnapshot('session-1', 'checkpoint-2');
      const snapshot3 = createTestSnapshot('session-1', 'checkpoint-3');
      
      await storage.save(snapshot1);
      await storage.save(snapshot2);
      await storage.save(snapshot3);
      
      const metaList = await storage.list('session-1');
      expect(metaList.length).toBe(3);
    });
  });
  
  describe('load', () => {
    it('should load snapshot successfully', async () => {
      const snapshot = createTestSnapshot('session-1', 'checkpoint-1');
      
      await storage.save(snapshot);
      const loaded = await storage.load('session-1', 'checkpoint-1');
      
      expect(loaded.meta.sessionId).toBe(snapshot.meta.sessionId);
      expect(loaded.meta.checkpointId).toBe(snapshot.meta.checkpointId);
      expect(loaded.modules).toEqual(snapshot.modules);
    });
    
    it('should throw error for non-existent snapshot', async () => {
      await expect(
        storage.load('non-existent-session', 'checkpoint-1')
      ).rejects.toThrow(SnapshotStorageError);
    });
    
    it('should handle round-trip save and load', async () => {
      const snapshot = createTestSnapshot('session-1', 'checkpoint-1');
      
      await storage.save(snapshot);
      const loaded = await storage.load('session-1', 'checkpoint-1');
      
      // 验证数据完整性
      expect(JSON.stringify(loaded)).toBe(JSON.stringify(snapshot));
    });
  });
  
  describe('delete', () => {
    it('should delete snapshot successfully', async () => {
      const snapshot = createTestSnapshot('session-1', 'checkpoint-1');
      
      await storage.save(snapshot);
      await storage.delete('session-1', 'checkpoint-1');
      
      const exists = await storage.exists('session-1', 'checkpoint-1');
      expect(exists).toBe(false);
    });
    
    it('should not throw error for non-existent snapshot', async () => {
      await expect(
        storage.delete('non-existent-session', 'checkpoint-1')
      ).resolves.not.toThrow();
    });
  });
  
  describe('list', () => {
    it('should list all snapshots for session', async () => {
      const snapshot1 = createTestSnapshot('session-1', 'checkpoint-1');
      const snapshot2 = createTestSnapshot('session-1', 'checkpoint-2');
      
      await storage.save(snapshot1);
      await storage.save(snapshot2);
      
      const metaList = await storage.list('session-1');
      
      expect(metaList.length).toBe(2);
      expect(metaList.some(m => m.checkpointId === 'checkpoint-1')).toBe(true);
      expect(metaList.some(m => m.checkpointId === 'checkpoint-2')).toBe(true);
    });
    
    it('should return empty array for non-existent session', async () => {
      const metaList = await storage.list('non-existent-session');
      expect(metaList).toEqual([]);
    });
    
    it('should sort snapshots by createdAt desc', async () => {
      // 创建快照，确保时间戳不同
      const snapshot1 = createTestSnapshot('session-1', 'checkpoint-1');
      await storage.save(snapshot1);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const snapshot2 = createTestSnapshot('session-1', 'checkpoint-2');
      await storage.save(snapshot2);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const snapshot3 = createTestSnapshot('session-1', 'checkpoint-3');
      await storage.save(snapshot3);
      
      const metaList = await storage.list('session-1', {
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      
      expect(metaList[0].checkpointId).toBe('checkpoint-3');
      expect(metaList[2].checkpointId).toBe('checkpoint-1');
    });
    
    it('should limit returned results', async () => {
      const snapshot1 = createTestSnapshot('session-1', 'checkpoint-1');
      const snapshot2 = createTestSnapshot('session-1', 'checkpoint-2');
      const snapshot3 = createTestSnapshot('session-1', 'checkpoint-3');
      
      await storage.save(snapshot1);
      await storage.save(snapshot2);
      await storage.save(snapshot3);
      
      const metaList = await storage.list('session-1', { limit: 2 });
      expect(metaList.length).toBe(2);
    });
  });
  
  describe('exists', () => {
    it('should return true for existing snapshot', async () => {
      const snapshot = createTestSnapshot('session-1', 'checkpoint-1');
      
      await storage.save(snapshot);
      const exists = await storage.exists('session-1', 'checkpoint-1');
      
      expect(exists).toBe(true);
    });
    
    it('should return false for non-existent snapshot', async () => {
      const exists = await storage.exists('non-existent-session', 'checkpoint-1');
      expect(exists).toBe(false);
    });
  });
  
  describe('cleanup', () => {
    it('should cleanup all snapshots in session', async () => {
      const snapshot1 = createTestSnapshot('session-1', 'checkpoint-1');
      const snapshot2 = createTestSnapshot('session-1', 'checkpoint-2');
      
      await storage.save(snapshot1);
      await storage.save(snapshot2);
      
      await storage.cleanup('session-1');
      
      const metaList = await storage.list('session-1');
      expect(metaList.length).toBe(0);
    });
    
    it('should not throw error for non-existent session', async () => {
      await expect(
        storage.cleanup('non-existent-session')
      ).resolves.not.toThrow();
    });
  });
  
  describe('getStats', () => {
    it('should return statistics for session', async () => {
      const snapshot1 = createTestSnapshot('session-1', 'checkpoint-1');
      const snapshot2 = createTestSnapshot('session-1', 'checkpoint-2');
      
      await storage.save(snapshot1);
      await storage.save(snapshot2);
      
      const stats = await storage.getStats('session-1');
      
      expect(stats.count).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.oldestSnapshot).toBeDefined();
      expect(stats.newestSnapshot).toBeDefined();
    });
    
    it('should return zero stats for empty session', async () => {
      const stats = await storage.getStats('non-existent-session');
      
      expect(stats.count).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.oldestSnapshot).toBeUndefined();
      expect(stats.newestSnapshot).toBeUndefined();
    });
  });
  
  describe('Error Handling', () => {
    it('should handle file system errors', async () => {
      // 创建一个只读目录
      const readOnlyDir = path.join(os.tmpdir(), `test-readonly-${Date.now()}`);
      await fs.mkdir(readOnlyDir);
      await fs.chmod(readOnlyDir, 0o444);
      
      const readOnlyStorage = new FileStorage(serializer, {
        baseDir: readOnlyDir,
        autoCreateDir: false,
      });
      
      const snapshot = createTestSnapshot('session-1', 'checkpoint-1');
      
      // 应该抛出错误
      await expect(
        readOnlyStorage.save(snapshot)
      ).rejects.toThrow();
      
      // 清理
      await fs.chmod(readOnlyDir, 0o755);
      await fs.rm(readOnlyDir, { recursive: true });
    });
  });
  
  describe('Concurrency', () => {
    it('should handle concurrent saves to different sessions', async () => {
      const snapshot1 = createTestSnapshot('session-1', 'checkpoint-1');
      const snapshot2 = createTestSnapshot('session-2', 'checkpoint-1');
      const snapshot3 = createTestSnapshot('session-3', 'checkpoint-1');
      
      await Promise.all([
        storage.save(snapshot1),
        storage.save(snapshot2),
        storage.save(snapshot3),
      ]);
      
      const exists1 = await storage.exists('session-1', 'checkpoint-1');
      const exists2 = await storage.exists('session-2', 'checkpoint-1');
      const exists3 = await storage.exists('session-3', 'checkpoint-1');
      
      expect(exists1).toBe(true);
      expect(exists2).toBe(true);
      expect(exists3).toBe(true);
    });
    
    it('should handle concurrent operations on same snapshot', async () => {
      const snapshot = createTestSnapshot('session-1', 'checkpoint-1');
      
      await storage.save(snapshot);
      
      // 并发读取
      const results = await Promise.all([
        storage.load('session-1', 'checkpoint-1'),
        storage.load('session-1', 'checkpoint-1'),
        storage.load('session-1', 'checkpoint-1'),
      ]);
      
      expect(results.length).toBe(3);
      results.forEach(loaded => {
        expect(loaded.meta.sessionId).toBe('session-1');
        expect(loaded.meta.checkpointId).toBe('checkpoint-1');
      });
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle large snapshots', async () => {
      const largeSnapshot = createTestSnapshot('session-1', 'checkpoint-1');
      
      // 添加大量数据
      (largeSnapshot.modules as any).largeData = Array(10000).fill({
        id: 'item',
        data: 'x'.repeat(100),
      });
      
      await storage.save(largeSnapshot);
      const loaded = await storage.load('session-1', 'checkpoint-1');
      
      expect((loaded.modules as any).largeData.length).toBe(10000);
    });
    
    it('should handle special characters in IDs', async () => {
      const snapshot = createTestSnapshot('session-测试-1', 'checkpoint-测试-1');
      
      await storage.save(snapshot);
      const loaded = await storage.load('session-测试-1', 'checkpoint-测试-1');
      
      expect(loaded.meta.sessionId).toBe('session-测试-1');
      expect(loaded.meta.checkpointId).toBe('checkpoint-测试-1');
    });
  });
});

