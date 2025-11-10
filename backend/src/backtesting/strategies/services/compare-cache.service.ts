/**
 * 版本对比缓存服务
 * 
 * 使用内存缓存存储对比结果,提升重复对比的性能
 * 
 * @module strategies/services/compare-cache
 */

import { Injectable, Logger } from '@nestjs/common';
import { CompareVersionsResponseDto, CompareMode } from '../dto/version-compare.dto';

/**
 * 缓存条目
 */
interface CacheEntry {
  /** 缓存的数据 */
  data: CompareVersionsResponseDto;
  /** 创建时间 */
  createdAt: number;
  /** 过期时间 */
  expiresAt: number;
  /** 访问次数 */
  hitCount: number;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  /** 总请求数 */
  totalRequests: number;
  /** 缓存命中数 */
  hits: number;
  /** 缓存未命中数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
  /** 当前缓存条目数 */
  entryCount: number;
  /** 总缓存大小(估算,字节) */
  estimatedSize: number;
}

/**
 * 版本对比缓存服务
 */
@Injectable()
export class CompareCacheService {
  private readonly logger = new Logger(CompareCacheService.name);
  
  /** 缓存存储 */
  private readonly cache = new Map<string, CacheEntry>();
  
  /** 缓存配置 */
  private readonly config = {
    /** 默认TTL: 1小时 */
    defaultTTL: 60 * 60 * 1000,
    /** 最大缓存条目数 */
    maxEntries: 1000,
    /** 清理间隔: 5分钟 */
    cleanupInterval: 5 * 60 * 1000,
  };
  
  /** 统计信息 */
  private stats = {
    totalRequests: 0,
    hits: 0,
    misses: 0,
  };
  
  /** 清理定时器 */
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    // 启动定期清理
    this.startCleanup();
  }

  /**
   * 生成缓存键
   * 
   * @param strategyId 策略ID
   * @param sourceVersionId 源版本ID
   * @param targetVersionId 目标版本ID
   * @param mode 对比模式
   * @returns 缓存键
   */
  private generateKey(
    strategyId: string,
    sourceVersionId: string,
    targetVersionId: string,
    mode: CompareMode,
  ): string {
    return `compare:${strategyId}:${sourceVersionId}:${targetVersionId}:${mode}`;
  }

  /**
   * 获取缓存
   * 
   * @param strategyId 策略ID
   * @param sourceVersionId 源版本ID
   * @param targetVersionId 目标版本ID
   * @param mode 对比模式
   * @returns 缓存的对比结果,如果不存在或已过期则返回null
   */
  get(
    strategyId: string,
    sourceVersionId: string,
    targetVersionId: string,
    mode: CompareMode,
  ): CompareVersionsResponseDto | null {
    this.stats.totalRequests++;

    const key = this.generateKey(strategyId, sourceVersionId, targetVersionId, mode);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.logger.debug(`Cache expired: ${key}`);
      return null;
    }

    // 命中
    entry.hitCount++;
    this.stats.hits++;
    this.logger.debug(`Cache hit: ${key} (hits: ${entry.hitCount})`);
    
    return entry.data;
  }

  /**
   * 设置缓存
   * 
   * @param strategyId 策略ID
   * @param sourceVersionId 源版本ID
   * @param targetVersionId 目标版本ID
   * @param mode 对比模式
   * @param data 对比结果
   * @param ttl 过期时间(毫秒),默认1小时
   */
  set(
    strategyId: string,
    sourceVersionId: string,
    targetVersionId: string,
    mode: CompareMode,
    data: CompareVersionsResponseDto,
    ttl: number = this.config.defaultTTL,
  ): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const key = this.generateKey(strategyId, sourceVersionId, targetVersionId, mode);
    const now = Date.now();

    const entry: CacheEntry = {
      data,
      createdAt: now,
      expiresAt: now + ttl,
      hitCount: 0,
    };

    this.cache.set(key, entry);
    this.logger.debug(`Cache set: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * 删除指定策略的所有缓存
   * 
   * @param strategyId 策略ID
   * @returns 删除的条目数
   */
  invalidateStrategy(strategyId: string): number {
    let count = 0;
    const prefix = `compare:${strategyId}:`;

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.log(`Invalidated ${count} cache entries for strategy: ${strategyId}`);
    }

    return count;
  }

  /**
   * 删除指定版本的所有缓存
   * 
   * @param strategyId 策略ID
   * @param versionId 版本ID
   * @returns 删除的条目数
   */
  invalidateVersion(strategyId: string, versionId: string): number {
    let count = 0;
    const prefix = `compare:${strategyId}:`;

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix) && key.includes(`:${versionId}:`)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.log(
        `Invalidated ${count} cache entries for version: ${strategyId}/${versionId}`,
      );
    }

    return count;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.log(`Cleared ${size} cache entries`);
  }

  /**
   * 获取缓存统计信息
   * 
   * @returns 统计信息
   */
  getStats(): CacheStats {
    const hitRate = this.stats.totalRequests > 0
      ? (this.stats.hits / this.stats.totalRequests) * 100
      : 0;

    // 估算缓存大小
    let estimatedSize = 0;
    for (const entry of this.cache.values()) {
      // 粗略估算: JSON字符串长度
      estimatedSize += JSON.stringify(entry.data).length;
    }

    return {
      totalRequests: this.stats.totalRequests,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      entryCount: this.cache.size,
      estimatedSize,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      hits: 0,
      misses: 0,
    };
    this.logger.log('Cache stats reset');
  }

  /**
   * 驱逐最旧的缓存条目
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug(`Evicted oldest cache entry: ${oldestKey}`);
    }
  }

  /**
   * 清理过期的缓存条目
   */
  private cleanup(): void {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.debug(`Cleaned up ${count} expired cache entries`);
    }
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);

    this.logger.log(
      `Cache cleanup started (interval: ${this.config.cleanupInterval}ms)`,
    );
  }

  /**
   * 停止定期清理
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      this.logger.log('Cache cleanup stopped');
    }
  }

  /**
   * 清理资源
   */
  onModuleDestroy(): void {
    this.stopCleanup();
    this.clear();
  }
}

