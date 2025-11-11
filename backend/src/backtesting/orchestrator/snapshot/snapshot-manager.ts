/**
 * 快照管理器
 * 
 * 负责快照的创建、管理和版本控制
 * 
 * @module orchestrator/snapshot/snapshot-manager
 */

import { nanoid } from 'nanoid';
import type {
  SessionSnapshot,
  SnapshotMeta,
  ModuleSnapshot,
  SnapshotManagerConfig,
} from '../interfaces/snapshot';
import {
  SnapshotError,
  SnapshotNotFoundError,
  SnapshotAlreadyExistsError,
} from '../interfaces/snapshot';
import type { SnapshotStorage } from '../interfaces/snapshot';
import { VersionManager, type VersionManagerConfig } from './version-manager';

/**
 * 模块状态收集器
 */
export interface ModuleStateCollector {
  /** 模块名称 */
  moduleName: string;
  
  /** 收集状态 */
  collectState(): Promise<any>;
  
  /** 恢复状态 */
  restoreState?(state: any): Promise<void>;
}

/**
 * 快照管理器
 * 
 * 提供快照的创建、管理、版本控制和清理功能
 */
export class SnapshotManager {
  private storage: SnapshotStorage;
  private versionManager: VersionManager;
  private config: Required<Omit<SnapshotManagerConfig, 'storage' | 'versionConfig'>>;
  private collectors: Map<string, ModuleStateCollector> = new Map();
  private lastSnapshot: SessionSnapshot | null = null;
  
  /**
   * 构造函数
   * 
   * @param config 配置
   */
  constructor(config: SnapshotManagerConfig) {
    this.storage = config.storage;
    this.versionManager = new VersionManager(config.versionConfig);
    this.config = {
      version: config.version ?? '1.0.0',
      autoCleanup: config.autoCleanup ?? true,
      incrementalSnapshot: config.incrementalSnapshot ?? false,
    };
  }
  
  /**
   * 注册模块状态收集器
   * 
   * @param collector 状态收集器
   */
  registerCollector(collector: ModuleStateCollector): void {
    this.collectors.set(collector.moduleName, collector);
  }
  
  /**
   * 注销模块状态收集器
   * 
   * @param moduleName 模块名称
   */
  unregisterCollector(moduleName: string): void {
    this.collectors.delete(moduleName);
  }
  
  /**
   * 创建快照
   * 
   * @param sessionId 会话ID
   * @param reason 创建原因
   * @param eventStoreCheckpoint 事件存储检查点
   * @returns 检查点ID
   */
  async createSnapshot(
    sessionId: string,
    reason?: string,
    eventStoreCheckpoint?: {
      lastSequenceId: string;
      lastTimestamp?: number;
      processedCount: number;
    }
  ): Promise<string> {
    try {
      // 生成检查点ID
      const checkpointId = this.generateCheckpointId(sessionId);
      
      // 检查快照是否已存在
      const exists = await this.storage.exists(sessionId, checkpointId);
      if (exists) {
        throw new SnapshotAlreadyExistsError(sessionId, checkpointId);
      }
      
      // 收集所有模块状态
      const modules = await this.collectAllModuleStates();
      
      // 如果启用增量快照，计算差异
      let finalModules = modules;
      if (this.config.incrementalSnapshot && this.lastSnapshot) {
        finalModules = this.calculateIncremental(modules, this.lastSnapshot.modules);
      }
      
      // 创建快照
      const snapshot: SessionSnapshot = {
        meta: {
          sessionId,
          checkpointId,
          createdAt: Date.now(),
          status: 'active',
          version: this.config.version,
          compressed: true,
          reason,
          sequenceId: eventStoreCheckpoint?.lastSequenceId,
        },
        modules: finalModules,
        eventStoreCheckpoint: eventStoreCheckpoint || {
          lastSequenceId: 'none',
          processedCount: 0,
        },
      };
      
      // 保存快照
      await this.storage.save(snapshot);
      
      // 记录最后一个快照
      this.lastSnapshot = snapshot;
      
      // 自动清理
      if (this.config.autoCleanup) {
        await this.autoCleanup(sessionId);
      }
      
      return checkpointId;
    } catch (error) {
      if (error instanceof SnapshotError) {
        throw error;
      }
      throw new SnapshotError(`Failed to create snapshot: ${error}`);
    }
  }
  
  /**
   * 加载快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 快照数据
   */
  async loadSnapshot(sessionId: string, checkpointId: string): Promise<SessionSnapshot> {
    try {
      // 检查快照是否存在
      const exists = await this.storage.exists(sessionId, checkpointId);
      if (!exists) {
        throw new SnapshotNotFoundError(sessionId, checkpointId);
      }
      
      // 加载快照
      const snapshot = await this.storage.load(sessionId, checkpointId);
      
      // 验证版本
      if (!this.versionManager.validateVersion(snapshot.meta, this.config.version)) {
        console.warn(
          `Snapshot version mismatch: expected ${this.config.version}, got ${snapshot.meta.version}`
        );
      }
      
      return snapshot;
    } catch (error) {
      if (error instanceof SnapshotError) {
        throw error;
      }
      throw new SnapshotError(`Failed to load snapshot: ${error}`);
    }
  }
  
  /**
   * 恢复快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   */
  async restoreSnapshot(sessionId: string, checkpointId: string): Promise<void> {
    try {
      // 加载快照
      const snapshot = await this.loadSnapshot(sessionId, checkpointId);
      
      // 恢复所有模块状态
      await this.restoreAllModuleStates(snapshot.modules);
      
      // 记录最后一个快照
      this.lastSnapshot = snapshot;
    } catch (error) {
      if (error instanceof SnapshotError) {
        throw error;
      }
      throw new SnapshotError(`Failed to restore snapshot: ${error}`);
    }
  }
  
  /**
   * 列出快照
   * 
   * @param sessionId 会话ID
   * @returns 快照元数据列表
   */
  async listSnapshots(sessionId: string): Promise<SnapshotMeta[]> {
    try {
      return await this.storage.list(sessionId, {
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    } catch (error) {
      throw new SnapshotError(`Failed to list snapshots: ${error}`);
    }
  }
  
  /**
   * 删除快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   */
  async deleteSnapshot(sessionId: string, checkpointId: string): Promise<void> {
    try {
      await this.storage.delete(sessionId, checkpointId);
    } catch (error) {
      throw new SnapshotError(`Failed to delete snapshot: ${error}`);
    }
  }
  
  /**
   * 验证快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 是否有效
   */
  async validateSnapshot(sessionId: string, checkpointId: string): Promise<boolean> {
    try {
      // 检查是否存在
      const exists = await this.storage.exists(sessionId, checkpointId);
      if (!exists) {
        return false;
      }
      
      // 加载并验证
      const snapshot = await this.storage.load(sessionId, checkpointId);
      
      // 验证版本
      if (!this.versionManager.validateVersion(snapshot.meta)) {
        return false;
      }
      
      // 验证必需字段
      if (!snapshot.meta.sessionId || !snapshot.meta.checkpointId) {
        return false;
      }
      
      if (!snapshot.modules || typeof snapshot.modules !== 'object') {
        return false;
      }
      
      if (!snapshot.eventStoreCheckpoint) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 清理会话的所有快照
   * 
   * @param sessionId 会话ID
   */
  async cleanup(sessionId: string): Promise<void> {
    try {
      await this.storage.cleanup(sessionId);
    } catch (error) {
      throw new SnapshotError(`Failed to cleanup snapshots: ${error}`);
    }
  }
  
  /**
   * 获取统计信息
   * 
   * @param sessionId 会话ID
   * @returns 统计信息
   */
  async getStats(sessionId: string): Promise<{
    count: number;
    totalSize: number;
    oldestSnapshot?: SnapshotMeta;
    newestSnapshot?: SnapshotMeta;
  }> {
    try {
      return await this.storage.getStats(sessionId);
    } catch (error) {
      throw new SnapshotError(`Failed to get stats: ${error}`);
    }
  }
  
  // ========== 私有方法 ==========
  
  /**
   * 收集所有模块状态
   */
  private async collectAllModuleStates(): Promise<Record<string, ModuleSnapshot>> {
    const modules: Record<string, ModuleSnapshot> = {};
    
    for (const [name, collector] of this.collectors) {
      try {
        const state = await collector.collectState();
        modules[name] = {
          state,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error(`Failed to collect state from module ${name}:`, error);
        // 继续收集其他模块
      }
    }
    
    return modules;
  }
  
  /**
   * 恢复所有模块状态
   */
  private async restoreAllModuleStates(modules: Record<string, ModuleSnapshot>): Promise<void> {
    for (const [name, moduleSnapshot] of Object.entries(modules)) {
      const collector = this.collectors.get(name);
      if (!collector) {
        console.warn(`No collector registered for module ${name}`);
        continue;
      }
      
      if (!collector.restoreState) {
        console.warn(`Module ${name} does not support state restoration`);
        continue;
      }
      
      try {
        await collector.restoreState(moduleSnapshot.state);
      } catch (error) {
        console.error(`Failed to restore state for module ${name}:`, error);
        // 继续恢复其他模块
      }
    }
  }
  
  /**
   * 计算增量快照
   */
  private calculateIncremental(
    current: Record<string, ModuleSnapshot>,
    previous: Record<string, ModuleSnapshot>
  ): Record<string, ModuleSnapshot> {
    const incremental: Record<string, ModuleSnapshot> = {};
    
    for (const [name, snapshot] of Object.entries(current)) {
      const prevSnapshot = previous[name];
      
      if (!prevSnapshot) {
        // 新模块，完整保存
        incremental[name] = snapshot;
      } else {
        // 比较状态
        const hasChanged = JSON.stringify(snapshot.state) !== JSON.stringify(prevSnapshot.state);
        
        if (hasChanged) {
          // 状态已变化，保存新状态
          incremental[name] = snapshot;
        }
        // 未变化的模块不保存
      }
    }
    
    return incremental;
  }
  
  /**
   * 自动清理
   */
  private async autoCleanup(sessionId: string): Promise<void> {
    try {
      const snapshots = await this.listSnapshots(sessionId);
      
      if (!this.versionManager.shouldCleanup(snapshots)) {
        return;
      }
      
      const decision = this.versionManager.decideCleanup(snapshots);
      
      for (const snapshot of decision.toDelete) {
        await this.deleteSnapshot(sessionId, snapshot.checkpointId);
      }
      
      if (decision.toDelete.length > 0) {
        console.log(
          `Auto cleanup: deleted ${decision.toDelete.length} snapshots. Reason: ${decision.reason}`
        );
      }
    } catch (error) {
      console.error('Auto cleanup failed:', error);
      // 不抛出错误，避免影响快照创建
    }
  }
  
  /**
   * 生成检查点ID
   */
  private generateCheckpointId(sessionId: string): string {
    const timestamp = Date.now();
    const random = nanoid(8);
    return `${sessionId}-${timestamp}-${random}`;
  }
}

/**
 * 创建快照管理器
 * 
 * @param config 配置
 * @returns 快照管理器实例
 */
export function createSnapshotManager(config: SnapshotManagerConfig): SnapshotManager {
  return new SnapshotManager(config);
}
