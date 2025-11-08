/**
 * 结果管理器
 * 
 * 提供结果的查询、管理和缓存功能
 * 
 * @module analytics/results-manager
 */

import type {
  ResultsManager,
  SessionResults,
  PerformanceMetrics,
  EquityCurve,
} from './interfaces';
import { SessionResultsNotFoundError } from './interfaces';
import type { ResultsStorage } from './results-storage';

/**
 * LRU缓存
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;

    // LRU: 移到最后
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 如果超过大小，删除最老的
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * 结果管理器配置
 */
export interface ResultsManagerConfig {
  storage: ResultsStorage;
  cacheSize?: number;
}

/**
 * 结果管理器实现
 */
export class ResultsManagerImpl implements ResultsManager {
  private storage: ResultsStorage;
  private cache: LRUCache<string, SessionResults>;

  constructor(config: ResultsManagerConfig) {
    this.storage = config.storage;
    this.cache = new LRUCache(config.cacheSize || 50);
  }

  /**
   * 获取会话结果
   */
  async getSessionResults(sessionId: string): Promise<SessionResults | null> {
    // 先查缓存
    if (this.cache.has(sessionId)) {
      return this.cache.get(sessionId)!;
    }

    // 从存储加载
    const results = await this.storage.load(sessionId);
    if (results) {
      this.cache.set(sessionId, results);
    }

    return results;
  }

  /**
   * 列出所有会话结果
   */
  async listSessionResults(): Promise<SessionResults[]> {
    const sessionIds = await this.storage.list();
    const results: SessionResults[] = [];

    for (const sessionId of sessionIds) {
      const result = await this.getSessionResults(sessionId);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 删除会话结果
   */
  async deleteSessionResults(sessionId: string): Promise<boolean> {
    // 从缓存删除
    this.cache.delete(sessionId);

    // 从存储删除
    return await this.storage.delete(sessionId);
  }

  /**
   * 获取会话指标
   */
  async getSessionMetrics(sessionId: string): Promise<PerformanceMetrics | null> {
    const results = await this.getSessionResults(sessionId);
    return results ? results.metrics : null;
  }

  /**
   * 获取权益曲线
   */
  async getEquityCurve(sessionId: string): Promise<EquityCurve | null> {
    const results = await this.getSessionResults(sessionId);
    return results ? results.equityCurve : null;
  }

  /**
   * 保存会话结果
   */
  async saveSessionResults(sessionId: string, results: SessionResults): Promise<void> {
    await this.storage.save(sessionId, results);
    this.cache.set(sessionId, results);
  }

  /**
   * 检查会话结果是否存在
   */
  async hasSessionResults(sessionId: string): Promise<boolean> {
    if (this.cache.has(sessionId)) {
      return true;
    }
    return await this.storage.exists(sessionId);
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: 50, // TODO: 从配置获取
    };
  }
}

/**
 * 创建结果管理器
 */
export function createResultsManager(config: ResultsManagerConfig): ResultsManager {
  return new ResultsManagerImpl(config);
}

