/**
 * 死信队列
 * 
 * 职责：
 * 1. 存储处理失败的事件
 * 2. 支持重试机制
 * 3. 提供查询和统计接口
 * 4. 支持持久化
 * 
 * @module DeadLetterQueue
 */

import { Subject, Observable } from 'rxjs';
import type { SimpleEvent } from './simple-bus';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 死信事件
 */
export interface DeadLetterEvent {
  /** 原始事件 */
  originalEvent: SimpleEvent;
  
  /** 错误信息 */
  error: string;
  
  /** 错误堆栈 */
  stack?: string;
  
  /** 失败时间戳 */
  failedAt: number;
  
  /** 重试次数 */
  retryCount: number;
  
  /** 最后重试时间 */
  lastRetryAt?: number;
  
  /** 订阅者名称 */
  subscription?: string;
  
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 重试策略
 */
export interface RetryStrategy {
  /** 最大重试次数 */
  maxRetries: number;
  
  /** 初始延迟（毫秒） */
  initialDelayMs: number;
  
  /** 最大延迟（毫秒） */
  maxDelayMs: number;
  
  /** 退避因子 */
  backoffFactor: number;
  
  /** 可重试的错误类型（正则表达式） */
  retryableErrors?: RegExp[];
}

/**
 * 死信队列配置
 */
export interface DeadLetterQueueConfig {
  /** 最大队列大小 */
  maxSize?: number;
  
  /** 是否启用持久化 */
  enablePersistence?: boolean;
  
  /** 存储目录 */
  storageDir?: string;
  
  /** 默认重试策略 */
  defaultRetryStrategy?: RetryStrategy;
  
  /** 是否自动重试 */
  autoRetry?: boolean;
  
  /** 自动重试间隔（毫秒） */
  autoRetryIntervalMs?: number;
}

/**
 * 死信队列
 */
export class DeadLetterQueue {
  private readonly config: Required<DeadLetterQueueConfig>;
  private readonly queue: DeadLetterEvent[];
  private readonly eventSubject: Subject<DeadLetterEvent>;
  private retryTimer: NodeJS.Timeout | null;
  
  public readonly event$: Observable<DeadLetterEvent>;

  constructor(config: DeadLetterQueueConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 10000,
      enablePersistence: config.enablePersistence ?? true,
      storageDir: config.storageDir ?? './data/dead-letter',
      defaultRetryStrategy: config.defaultRetryStrategy ?? {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        backoffFactor: 2,
        retryableErrors: [/timeout/i, /network/i, /temporary/i],
      },
      autoRetry: config.autoRetry ?? false,
      autoRetryIntervalMs: config.autoRetryIntervalMs ?? 60000,
    };

    this.queue = [];
    this.eventSubject = new Subject<DeadLetterEvent>();
    this.event$ = this.eventSubject.asObservable();
    this.retryTimer = null;

    // 确保存储目录存在
    if (this.config.enablePersistence) {
      this.ensureStorageDir();
      this.loadFromDisk();
    }

    // 启动自动重试
    if (this.config.autoRetry) {
      this.startAutoRetry();
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
   * 从磁盘加载死信事件
   */
  private loadFromDisk(): void {
    try {
      const filepath = path.join(this.config.storageDir, 'dead-letter-queue.json');
      if (fs.existsSync(filepath)) {
        const data = fs.readFileSync(filepath, 'utf-8');
        const events = JSON.parse(data) as DeadLetterEvent[];
        this.queue.push(...events);
        console.log(`[DeadLetterQueue] Loaded ${events.length} events from disk`);
      }
    } catch (error) {
      console.error('[DeadLetterQueue] Failed to load from disk:', error);
    }
  }

  /**
   * 保存到磁盘
   */
  private saveToDisk(): void {
    if (!this.config.enablePersistence) {
      return;
    }

    try {
      const filepath = path.join(this.config.storageDir, 'dead-letter-queue.json');
      const data = JSON.stringify(this.queue, null, 2);
      fs.writeFileSync(filepath, data, 'utf-8');
    } catch (error) {
      console.error('[DeadLetterQueue] Failed to save to disk:', error);
    }
  }

  /**
   * 添加死信事件
   */
  add(
    originalEvent: SimpleEvent,
    error: Error | string,
    subscription?: string,
    metadata?: Record<string, any>
  ): void {
    const deadLetterEvent: DeadLetterEvent = {
      originalEvent,
      error: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      failedAt: Date.now(),
      retryCount: 0,
      subscription,
      metadata,
    };

    // 检查队列大小
    if (this.queue.length >= this.config.maxSize) {
      // 移除最旧的事件
      this.queue.shift();
      console.warn('[DeadLetterQueue] Queue is full, removing oldest event');
    }

    // 添加到队列
    this.queue.push(deadLetterEvent);

    // 发出事件
    this.eventSubject.next(deadLetterEvent);

    // 持久化
    this.saveToDisk();

    console.log(
      `[DeadLetterQueue] Added event to dead letter queue: ${originalEvent.type} (${deadLetterEvent.error})`
    );
  }

  /**
   * 判断错误是否可重试
   */
  isRetryable(error: string, strategy: RetryStrategy = this.config.defaultRetryStrategy): boolean {
    if (!strategy.retryableErrors || strategy.retryableErrors.length === 0) {
      return true; // 默认所有错误都可重试
    }

    return strategy.retryableErrors.some((pattern) => pattern.test(error));
  }

  /**
   * 计算重试延迟
   */
  calculateRetryDelay(
    retryCount: number,
    strategy: RetryStrategy = this.config.defaultRetryStrategy
  ): number {
    const delay = strategy.initialDelayMs * Math.pow(strategy.backoffFactor, retryCount);
    return Math.min(delay, strategy.maxDelayMs);
  }

  /**
   * 重试单个事件
   */
  async retry(
    event: DeadLetterEvent,
    handler: (event: SimpleEvent) => Promise<void>,
    strategy: RetryStrategy = this.config.defaultRetryStrategy
  ): Promise<boolean> {
    // 检查重试次数
    if (event.retryCount >= strategy.maxRetries) {
      console.log(`[DeadLetterQueue] Max retries reached for event: ${event.originalEvent.type}`);
      return false;
    }

    // 检查是否可重试
    if (!this.isRetryable(event.error, strategy)) {
      console.log(`[DeadLetterQueue] Error is not retryable: ${event.error}`);
      return false;
    }

    // 计算延迟
    const delay = this.calculateRetryDelay(event.retryCount, strategy);
    console.log(
      `[DeadLetterQueue] Retrying event ${event.originalEvent.type} after ${delay}ms (attempt ${event.retryCount + 1}/${strategy.maxRetries})`
    );

    // 等待延迟
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // 重试处理
      await handler(event.originalEvent);

      // 成功：从队列中移除
      const index = this.queue.indexOf(event);
      if (index !== -1) {
        this.queue.splice(index, 1);
        this.saveToDisk();
      }

      console.log(`[DeadLetterQueue] Retry successful for event: ${event.originalEvent.type}`);
      return true;
    } catch (error: any) {
      // 失败：更新重试次数
      event.retryCount++;
      event.lastRetryAt = Date.now();
      event.error = error.message || String(error);
      this.saveToDisk();

      console.log(
        `[DeadLetterQueue] Retry failed for event: ${event.originalEvent.type} (${error.message})`
      );
      return false;
    }
  }

  /**
   * 重试所有可重试的事件
   */
  async retryAll(
    handler: (event: SimpleEvent) => Promise<void>,
    strategy: RetryStrategy = this.config.defaultRetryStrategy
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // 复制队列以避免修改问题
    const eventsToRetry = [...this.queue];

    for (const event of eventsToRetry) {
      const result = await this.retry(event, handler, strategy);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 启动自动重试
   */
  private startAutoRetry(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }

    this.retryTimer = setInterval(() => {
      if (this.queue.length > 0) {
        console.log(`[DeadLetterQueue] Auto retry triggered (${this.queue.length} events in queue)`);
        // 注意：这里需要外部提供 handler，所以实际的自动重试需要在 EventBus 层实现
      }
    }, this.config.autoRetryIntervalMs);
  }

  /**
   * 停止自动重试
   */
  private stopAutoRetry(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * 获取队列中的所有事件
   */
  getAll(): DeadLetterEvent[] {
    return [...this.queue];
  }

  /**
   * 获取队列大小
   */
  getSize(): number {
    return this.queue.length;
  }

  /**
   * 按订阅者筛选
   */
  getBySubscription(subscription: string): DeadLetterEvent[] {
    return this.queue.filter((e) => e.subscription === subscription);
  }

  /**
   * 按时间范围筛选
   */
  getByTimeRange(startTime: number, endTime: number): DeadLetterEvent[] {
    return this.queue.filter((e) => e.failedAt >= startTime && e.failedAt <= endTime);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEvents: number;
    bySubscription: Record<string, number>;
    byErrorType: Record<string, number>;
    averageRetryCount: number;
  } {
    const bySubscription: Record<string, number> = {};
    const byErrorType: Record<string, number> = {};
    let totalRetries = 0;

    for (const event of this.queue) {
      // 按订阅者统计
      const sub = event.subscription || 'unknown';
      bySubscription[sub] = (bySubscription[sub] || 0) + 1;

      // 按错误类型统计
      const errorType = event.error.split(':')[0] || 'unknown';
      byErrorType[errorType] = (byErrorType[errorType] || 0) + 1;

      // 重试次数
      totalRetries += event.retryCount;
    }

    return {
      totalEvents: this.queue.length,
      bySubscription,
      byErrorType,
      averageRetryCount: this.queue.length > 0 ? totalRetries / this.queue.length : 0,
    };
  }

  /**
   * 移除单个事件
   */
  remove(event: DeadLetterEvent): boolean {
    const index = this.queue.indexOf(event);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveToDisk();
      return true;
    }
    return false;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.length = 0;
    this.saveToDisk();
    console.log('[DeadLetterQueue] Queue cleared');
  }

  /**
   * 销毁死信队列
   */
  destroy(): void {
    console.log('[DeadLetterQueue] Destroying...');

    // 停止自动重试
    this.stopAutoRetry();

    // 保存到磁盘
    if (this.config.enablePersistence && this.queue.length > 0) {
      this.saveToDisk();
    }

    // 清空队列
    this.queue.length = 0;

    // 完成 Subject
    this.eventSubject.complete();

    console.log('[DeadLetterQueue] Destroyed');
  }
}

