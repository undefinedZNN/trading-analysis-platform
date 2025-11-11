/**
 * 版本管理器
 * 
 * 负责快照版本的管理和清理策略
 * 
 * @module orchestrator/snapshot/version-manager
 */

import type { SnapshotMeta } from '../interfaces/snapshot';

/**
 * 版本管理器配置
 */
export interface VersionManagerConfig {
  /** 最大快照数量 */
  maxSnapshots?: number;
  
  /** 最小保留数量 */
  minSnapshots?: number;
  
  /** 快照过期时间（毫秒） */
  expirationMs?: number;
  
  /** 自动清理策略 */
  cleanupStrategy?: 'oldest' | 'least-used' | 'size-based';
}

/**
 * 清理决策结果
 */
export interface CleanupDecision {
  /** 应该清理的快照 */
  toDelete: SnapshotMeta[];
  
  /** 应该保留的快照 */
  toKeep: SnapshotMeta[];
  
  /** 清理原因 */
  reason: string;
}

/**
 * 版本管理器
 * 
 * 提供快照版本管理和清理策略
 */
export class VersionManager {
  private config: Required<VersionManagerConfig>;
  private lastTimestamp = 0;
  private collisionCounter = 0;
  
  /**
   * 构造函数
   * 
   * @param config 配置
   */
  constructor(config: VersionManagerConfig = {}) {
    this.config = {
      maxSnapshots: config.maxSnapshots ?? 10,
      minSnapshots: config.minSnapshots ?? 3,
      expirationMs: config.expirationMs ?? 7 * 24 * 60 * 60 * 1000, // 7天
      cleanupStrategy: config.cleanupStrategy ?? 'oldest',
    };
    
    // 验证配置
    if (this.config.minSnapshots > this.config.maxSnapshots) {
      throw new Error('minSnapshots cannot be greater than maxSnapshots');
    }
  }
  
  /**
   * 判断是否需要清理
   * 
   * @param snapshots 快照列表
   * @returns 是否需要清理
   */
  shouldCleanup(snapshots: SnapshotMeta[]): boolean {
    return snapshots.length > this.config.maxSnapshots;
  }
  
  /**
   * 决定清理哪些快照
   * 
   * @param snapshots 快照列表
   * @returns 清理决策
   */
  decideCleanup(snapshots: SnapshotMeta[]): CleanupDecision {
    if (snapshots.length <= this.config.minSnapshots) {
      return {
        toDelete: [],
        toKeep: snapshots,
        reason: 'Below minimum snapshot count',
      };
    }
    
    const sortedSnapshots = [...snapshots];
    
    switch (this.config.cleanupStrategy) {
      case 'oldest':
        return this.cleanupOldest(sortedSnapshots);
      
      case 'size-based':
        return this.cleanupBySize(sortedSnapshots);
      
      case 'least-used':
      default:
        return this.cleanupOldest(sortedSnapshots);
    }
  }
  
  /**
   * 清理最旧的快照
   */
  private cleanupOldest(snapshots: SnapshotMeta[]): CleanupDecision {
    // 按创建时间排序（从旧到新）
    snapshots.sort((a, b) => a.createdAt - b.createdAt);
    
    const toKeep = snapshots.slice(-this.config.maxSnapshots);
    const toDelete = snapshots.slice(0, -this.config.maxSnapshots);
    
    return {
      toDelete,
      toKeep,
      reason: `Keeping ${this.config.maxSnapshots} newest snapshots`,
    };
  }
  
  /**
   * 基于大小清理
   */
  private cleanupBySize(snapshots: SnapshotMeta[]): CleanupDecision {
    // 按大小排序（从大到小）
    snapshots.sort((a, b) => (b.size || 0) - (a.size || 0));
    
    // 优先删除大文件
    const toDelete: SnapshotMeta[] = [];
    const toKeep: SnapshotMeta[] = [];
    
    for (const snapshot of snapshots) {
      if (toKeep.length < this.config.maxSnapshots) {
        toKeep.push(snapshot);
      } else {
        toDelete.push(snapshot);
      }
    }
    
    return {
      toDelete,
      toKeep,
      reason: `Keeping ${this.config.maxSnapshots} smallest snapshots`,
    };
  }
  
  /**
   * 获取过期的快照
   * 
   * @param snapshots 快照列表
   * @returns 过期的快照
   */
  getExpiredSnapshots(snapshots: SnapshotMeta[]): SnapshotMeta[] {
    const now = Date.now();
    return snapshots.filter(
      snapshot => now - snapshot.createdAt > this.config.expirationMs
    );
  }
  
  /**
   * 验证快照版本
   * 
   * @param snapshot 快照元数据
   * @param expectedVersion 期望的版本
   * @returns 是否有效
   */
  validateVersion(snapshot: SnapshotMeta, expectedVersion?: string): boolean {
    if (!snapshot.version) {
      return false;
    }
    
    if (expectedVersion) {
      return snapshot.version === expectedVersion;
    }
    
    // 简单的版本格式验证
    return /^\d+\.\d+\.\d+$/.test(snapshot.version);
  }
  
  /**
   * 比较版本号
   * 
   * @param v1 版本1
   * @param v2 版本2
   * @returns -1: v1 < v2, 0: v1 === v2, 1: v1 > v2
   */
  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    
    return 0;
  }
  
  /**
   * 生成新的检查点ID
   * 
   * @param sessionId 会话ID
   * @param sequence 序列号
   * @returns 检查点ID
   */
  generateCheckpointId(sessionId: string, sequence?: number): string {
    const timestamp = Date.now();
    if (timestamp === this.lastTimestamp) {
      this.collisionCounter += 1;
    } else {
      this.lastTimestamp = timestamp;
      this.collisionCounter = 0;
    }

    const effectiveSequence =
      sequence !== undefined
        ? sequence
        : this.collisionCounter > 0
          ? this.collisionCounter
          : undefined;

    const seqPart =
      effectiveSequence !== undefined
        ? `-${effectiveSequence.toString().padStart(4, '0')}`
        : '';

    return `${sessionId}-${timestamp}${seqPart}`;
  }
}

/**
 * 创建版本管理器
 * 
 * @param config 配置
 * @returns 版本管理器实例
 */
export function createVersionManager(config?: VersionManagerConfig): VersionManager {
  return new VersionManager(config);
}
