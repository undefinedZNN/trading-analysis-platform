/**
 * EventStore 实现
 * 
 * 混合存储策略：
 * 1. 内存缓冲区：快速访问最近的事件
 * 2. Parquet 文件：持久化历史事件
 * 3. 检查点机制：支持快速恢复
 * 4. 事件重放：支持时间旅行调试
 * 
 * @module EventStore
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  EventStore as IEventStore,
  BaseEvent,
  RecordedEvent,
  CheckpointSnapshot,
  CheckpointMeta,
} from './interfaces';

/**
 * EventStore 配置选项
 */
export interface EventStoreConfig {
  /**
   * 内存缓冲区大小（默认 10000）
   */
  memoryBufferSize?: number;

  /**
   * Parquet 文件存储目录（默认 './data/events'）
   */
  storageDir?: string;

  /**
   * 是否启用持久化（默认 true）
   */
  enablePersistence?: boolean;

  /**
   * 刷盘批次大小（默认 1000）
   */
  flushBatchSize?: number;

  /**
   * 自动刷盘间隔（毫秒，默认 5000）
   */
  autoFlushIntervalMs?: number;
}

/**
 * EventStore 实现
 * 
 * 采用混合存储策略：
 * - 内存：环形缓冲区，快速访问
 * - 文件：Parquet 格式，持久化存储
 */
export class EventStore {
  private readonly config: Required<EventStoreConfig>;

  // === 内存缓冲区 ===
  private memoryBuffer: RecordedEvent[];
  private bufferHead: number; // 环形缓冲区头指针
  private eventIdCounter: number;

  // === 检查点 ===
  private checkpoints: Map<string, CheckpointSnapshot>;

  // === 持久化 ===
  private pendingFlush: RecordedEvent[];
  private flushTimer: NodeJS.Timeout | null;

  // === 元数据 ===
  private firstEventTime: number | null;
  private lastEventTime: number | null;

  constructor(config: EventStoreConfig = {}) {
    this.config = {
      memoryBufferSize: config.memoryBufferSize ?? 10000,
      storageDir: config.storageDir ?? './data/events',
      enablePersistence: config.enablePersistence ?? true,
      flushBatchSize: config.flushBatchSize ?? 1000,
      autoFlushIntervalMs: config.autoFlushIntervalMs ?? 5000,
    };

    // 初始化缓冲区
    this.memoryBuffer = [];
    this.bufferHead = 0;
    this.eventIdCounter = 0;

    // 初始化检查点
    this.checkpoints = new Map();

    // 初始化持久化
    this.pendingFlush = [];
    this.flushTimer = null;

    // 初始化元数据
    this.firstEventTime = null;
    this.lastEventTime = null;

    // 确保存储目录存在
    if (this.config.enablePersistence) {
      this.ensureStorageDir();
      this.startAutoFlush();
    }
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
    }
  }

  /**
   * 启动自动刷盘定时器
   */
  private startAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.pendingFlush.length > 0) {
        this.flush();
      }
    }, this.config.autoFlushIntervalMs);
  }

  /**
   * 停止自动刷盘定时器
   */
  private stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * 追加事件
   */
  append(event: BaseEvent | RecordedEvent): void {
    const recordedEvent: RecordedEvent = {
      ...(event as any),
      eventId: this.eventIdCounter++,
      timestamp: typeof event.timestamp === 'string' ? event.timestamp : Date.now(),
      status: 'pending' as const,
    };

    // 添加到内存缓冲区（环形）
    if (this.memoryBuffer.length < this.config.memoryBufferSize) {
      this.memoryBuffer.push(recordedEvent);
    } else {
      // 环形缓冲区已满，覆盖最旧的事件
      this.memoryBuffer[this.bufferHead] = recordedEvent;
      this.bufferHead = (this.bufferHead + 1) % this.config.memoryBufferSize;
    }

    // 更新时间元数据
    const eventTime = typeof event.timestamp === 'string' ? new Date(event.timestamp).getTime() : Number(event.timestamp);
    if (this.firstEventTime === null) {
      this.firstEventTime = eventTime;
    }
    this.lastEventTime = eventTime;

    // 添加到待刷盘队列
    if (this.config.enablePersistence) {
      this.pendingFlush.push(recordedEvent);

      // 如果达到批次大小，立即刷盘
      if (this.pendingFlush.length >= this.config.flushBatchSize) {
        this.flush();
      }
    }
  }

  /**
   * 刷盘：将待刷盘事件写入 Parquet 文件
   * 
   * TODO: 实现 Parquet 写入（当前仅保存为 JSON）
   */
  private flush(): void {
    if (this.pendingFlush.length === 0) {
      return;
    }

    try {
      // 生成文件名：events_<timestamp>.json
      const timestamp = Date.now();
      const filename = `events_${timestamp}.json`;
      const filepath = path.join(this.config.storageDir, filename);

      // 写入 JSON 文件（TODO: 替换为 Parquet）
      const data = JSON.stringify(this.pendingFlush, null, 2);
      fs.writeFileSync(filepath, data, 'utf-8');

      console.log(
        `[EventStore] Flushed ${this.pendingFlush.length} events to ${filename}`
      );

      // 清空待刷盘队列
      this.pendingFlush = [];
    } catch (error) {
      console.error('[EventStore] Failed to flush events:', error);
    }
  }

  /**
   * 获取指定范围的事件
   */
  getRange(startId: number, endId: number): RecordedEvent[] {
    // 从内存缓冲区查询
    const result = this.memoryBuffer.filter(
      (event) => event.eventId >= startId && event.eventId <= endId
    );

    // TODO: 如果内存中没有，从持久化文件中加载

    return result;
  }

  /**
   * 获取从指定 ID 开始的所有事件
   */
  getFrom(startId: number): RecordedEvent[] {
    return this.memoryBuffer.filter((event) => event.eventId >= startId);
  }

  /**
   * 获取所有事件
   */
  getAll(): RecordedEvent[] {
    return [...this.memoryBuffer];
  }

  /**
   * 创建检查点
   */
  checkpoint(id: string): CheckpointMeta {
    const now = Date.now();
    const snapshot: CheckpointSnapshot = {
      checkpointId: id,
      timestamp: now,
      eventId: this.eventIdCounter - 1, // 最后一个事件的 ID
      meta: {
        checkpointId: id,
        sequenceId: String(this.eventIdCounter - 1),
        timestamp: now,
        createdAt: new Date().toISOString(),
        reason: 'manual',
      },
      busState: {} as any, // TODO: 添加状态快照
      moduleStates: {},
    };

    this.checkpoints.set(id, snapshot);

    // 持久化检查点
    if (this.config.enablePersistence) {
      this.saveCheckpoint(snapshot);
    }

    return {
      checkpointId: id,
      sequenceId: String(this.eventIdCounter - 1),
      timestamp: now,
      eventId: snapshot.eventId,
      createdAt: new Date().toISOString(),
      reason: 'manual',
    };
  }

  /**
   * 保存检查点到文件
   */
  private saveCheckpoint(snapshot: CheckpointSnapshot): void {
    try {
      const filename = `checkpoint_${snapshot.checkpointId}.json`;
      const filepath = path.join(this.config.storageDir, filename);

      const data = JSON.stringify(snapshot, null, 2);
      fs.writeFileSync(filepath, data, 'utf-8');

      console.log(`[EventStore] Checkpoint saved: ${snapshot.checkpointId}`);
    } catch (error) {
      console.error('[EventStore] Failed to save checkpoint:', error);
    }
  }

  /**
   * 恢复到检查点
   */
  restore(checkpointId: string): CheckpointSnapshot {
    // 从内存查找
    let snapshot = this.checkpoints.get(checkpointId);

    // 如果内存中没有，从文件加载
    if (!snapshot && this.config.enablePersistence) {
      snapshot = this.loadCheckpoint(checkpointId);
    }

    if (!snapshot) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // TODO: 恢复状态

    return snapshot;
  }

  /**
   * 从文件加载检查点
   */
  private loadCheckpoint(checkpointId: string): CheckpointSnapshot | null {
    try {
      const filename = `checkpoint_${checkpointId}.json`;
      const filepath = path.join(this.config.storageDir, filename);

      if (!fs.existsSync(filepath)) {
        return null;
      }

      const data = fs.readFileSync(filepath, 'utf-8');
      const snapshot = JSON.parse(data) as CheckpointSnapshot;

      // 缓存到内存
      this.checkpoints.set(checkpointId, snapshot);

      return snapshot;
    } catch (error) {
      console.error('[EventStore] Failed to load checkpoint:', error);
      return null;
    }
  }

  /**
   * 获取所有检查点元数据
   */
  listCheckpoints(): CheckpointMeta[] {
    return Array.from(this.checkpoints.values()).map((snapshot) => ({
      checkpointId: snapshot.checkpointId || '',
      sequenceId: snapshot.meta?.sequenceId || '0',
      timestamp: snapshot.timestamp || Date.now(),
      eventId: snapshot.eventId,
      createdAt: snapshot.meta?.createdAt || new Date().toISOString(),
      reason: snapshot.meta?.reason || 'manual',
    }));
  }

  /**
   * 清空所有事件
   */
  clear(): void {
    // 清空内存
    this.memoryBuffer = [];
    this.bufferHead = 0;
    this.eventIdCounter = 0;
    this.checkpoints.clear();
    this.pendingFlush = [];

    // 重置元数据
    this.firstEventTime = null;
    this.lastEventTime = null;

    console.log('[EventStore] Cleared all events');
  }

  /**
   * 获取事件总数
   */
  getEventCount(): number {
    return this.memoryBuffer.length;
  }

  /**
   * 销毁 EventStore
   */
  destroy(): void {
    console.log('[EventStore] Destroying...');

    // 停止自动刷盘
    this.stopAutoFlush();

    // 刷盘剩余事件
    if (this.pendingFlush.length > 0) {
      this.flush();
    }

    // 清空数据
    this.clear();

    console.log('[EventStore] Destroyed');
  }
}

