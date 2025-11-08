/**
 * EventStore 单元测试
 */

import { EventStore } from '../store';
import type { BaseEvent } from '../interfaces';
import * as fs from 'fs';
import * as path from 'path';

describe('EventStore', () => {
  let store: EventStore;
  const testStorageDir = './test-data/events';

  beforeEach(() => {
    // 使用测试目录，禁用持久化以加快测试
    store = new EventStore({
      memoryBufferSize: 100,
      storageDir: testStorageDir,
      enablePersistence: false, // 禁用持久化以加快测试
    });
  });

  afterEach(() => {
    store.destroy();

    // 清理测试目录
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  describe('事件追加', () => {
    it('should append event to memory buffer', () => {
      const event: BaseEvent = {
        type: 'market.bar',
        timestamp: Date.now(),
        payload: { symbol: 'BTC/USDT', close: '50000' },
      };

      store.append(event);

      expect(store.getEventCount()).toBe(1);

      const events = store.getAll();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('market.bar');
      expect(events[0].eventId).toBe(0);
    });

    it('should append multiple events', () => {
      for (let i = 0; i < 10; i++) {
        const event: BaseEvent = {
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        };
        store.append(event);
      }

      expect(store.getEventCount()).toBe(10);

      const events = store.getAll();
      expect(events).toHaveLength(10);
      expect(events[0].eventId).toBe(0);
      expect(events[9].eventId).toBe(9);
    });

    it('should handle buffer overflow (ring buffer)', () => {
      const bufferSize = 100;

      // 追加超过缓冲区大小的事件
      for (let i = 0; i < bufferSize + 50; i++) {
        const event: BaseEvent = {
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        };
        store.append(event);
      }

      // 缓冲区应该只保留最近的 bufferSize 个事件
      expect(store.getEventCount()).toBe(bufferSize);
    });
  });

  describe('事件查询', () => {
    beforeEach(() => {
      // 追加10个事件
      for (let i = 0; i < 10; i++) {
        const event: BaseEvent = {
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        };
        store.append(event);
      }
    });

    it('should get events in range', () => {
      const events = store.getRange(2, 5);

      expect(events).toHaveLength(4);
      expect(events[0].eventId).toBe(2);
      expect(events[3].eventId).toBe(5);
    });

    it('should get events from specific ID', () => {
      const events = store.getFrom(7);

      expect(events).toHaveLength(3);
      expect(events[0].eventId).toBe(7);
      expect(events[2].eventId).toBe(9);
    });

    it('should get all events', () => {
      const events = store.getAll();

      expect(events).toHaveLength(10);
      expect(events[0].eventId).toBe(0);
      expect(events[9].eventId).toBe(9);
    });

    it('should return empty array for invalid range', () => {
      const events = store.getRange(100, 200);

      expect(events).toHaveLength(0);
    });
  });

  describe('检查点', () => {
    beforeEach(() => {
      // 追加一些事件
      for (let i = 0; i < 5; i++) {
        const event: BaseEvent = {
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        };
        store.append(event);
      }
    });

    it('should create checkpoint', () => {
      const meta = store.checkpoint('cp1');

      expect(meta.checkpointId).toBe('cp1');
      expect(meta.eventId).toBe(4); // 最后一个事件 ID
      expect(meta.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should list checkpoints', () => {
      store.checkpoint('cp1');
      store.checkpoint('cp2');

      const checkpoints = store.listCheckpoints();

      expect(checkpoints).toHaveLength(2);
      expect(checkpoints[0].checkpointId).toBe('cp1');
      expect(checkpoints[1].checkpointId).toBe('cp2');
    });

    it('should restore checkpoint', () => {
      store.checkpoint('cp1');

      const snapshot = store.restore('cp1');

      expect(snapshot.checkpointId).toBe('cp1');
      expect(snapshot.eventId).toBe(4);
      expect(snapshot.eventCount).toBe(5);
    });

    it('should throw error for non-existent checkpoint', () => {
      expect(() => store.restore('non-existent')).toThrow(
        /Checkpoint not found/
      );
    });
  });

  describe('清空', () => {
    beforeEach(() => {
      for (let i = 0; i < 5; i++) {
        const event: BaseEvent = {
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        };
        store.append(event);
      }
      store.checkpoint('cp1');
    });

    it('should clear all events', () => {
      expect(store.getEventCount()).toBe(5);

      store.clear();

      expect(store.getEventCount()).toBe(0);
      expect(store.getAll()).toHaveLength(0);
      expect(store.listCheckpoints()).toHaveLength(0);
    });
  });

  describe('持久化', () => {
    it('should enable persistence when configured', () => {
      const persistentStore = new EventStore({
        storageDir: testStorageDir,
        enablePersistence: true,
        flushBatchSize: 5,
      });

      // 追加5个事件触发自动刷盘
      for (let i = 0; i < 5; i++) {
        const event: BaseEvent = {
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        };
        persistentStore.append(event);
      }

      // 等待刷盘（同步刷盘，应该立即完成）
      // 检查文件是否创建
      const files = fs.existsSync(testStorageDir)
        ? fs.readdirSync(testStorageDir)
        : [];
      const eventFiles = files.filter((f) => f.startsWith('events_'));

      expect(eventFiles.length).toBeGreaterThan(0);

      persistentStore.destroy();
    });
  });
});

