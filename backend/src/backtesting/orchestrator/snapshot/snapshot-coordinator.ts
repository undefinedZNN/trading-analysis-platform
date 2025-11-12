/**
 * 快照协调器
 * 
 * 负责跨模块的快照创建和恢复协调，确保状态一致性
 * 
 * @module orchestrator/snapshot/snapshot-coordinator
 */

import { nanoid } from 'nanoid';
import type {
  SessionSnapshot,
  SnapshotMeta,
} from '../interfaces/snapshot';
import {
  SnapshotError,
  SnapshotNotFoundError,
} from '../interfaces/snapshot';
import type { SnapshotManager, ModuleStateCollector } from './snapshot-manager';

/**
 * 模块优先级
 */
export const MODULE_PRIORITIES = {
  eventStore: 1,
  dataProvider: 2,
  featureRegistry: 3,
  strategy: 4,
  risk: 5,
  execution: 6,
  ledger: 7,
} as const;

/**
 * 协调器配置
 */
export interface CoordinatorConfig {
  /** 快照管理器 */
  snapshotManager: SnapshotManager;
  
  /** 超时时间（毫秒） */
  timeout?: number;
  
  /** 失败时是否回滚 */
  rollbackOnFailure?: boolean;
  
  /** 是否验证快照 */
  validateSnapshot?: boolean;
}

/**
 * 协调操作结果
 */
export interface CoordinationResult {
  /** 是否成功 */
  success: boolean;
  
  /** 检查点ID */
  checkpointId?: string;
  
  /** 执行时间（毫秒） */
  duration: number;
  
  /** 错误信息 */
  error?: string;
  
  /** 详细步骤 */
  steps: {
    name: string;
    success: boolean;
    duration: number;
    error?: string;
  }[];
}

/**
 * 快照协调器
 * 
 * 协调多个模块的快照创建和恢复，确保顺序和一致性
 */
export class SnapshotCoordinator {
  private snapshotManager: SnapshotManager;
  private config: Required<Omit<CoordinatorConfig, 'snapshotManager'>>;
  private eventBusController?: {
    pause(): Promise<void>;
    resume(): Promise<void>;
    isPaused(): boolean;
  };
  
  /**
   * 构造函数
   * 
   * @param config 配置
   */
  constructor(config: CoordinatorConfig) {
    this.snapshotManager = config.snapshotManager;
    this.config = {
      timeout: config.timeout ?? 30000, // 30秒
      rollbackOnFailure: config.rollbackOnFailure ?? true,
      validateSnapshot: config.validateSnapshot ?? true,
    };
  }
  
  /**
   * 注册事件总线控制器
   * 
   * @param controller 事件总线控制器
   */
  registerEventBusController(controller: {
    pause(): Promise<void>;
    resume(): Promise<void>;
    isPaused(): boolean;
  }): void {
    this.eventBusController = controller;
  }
  
  /**
   * 创建协调的快照
   * 
   * 按照预定顺序暂停事件总线、收集状态、保存快照、恢复事件总线
   * 
   * @param sessionId 会话ID
   * @param reason 创建原因
   * @param eventStoreCheckpoint 事件存储检查点
   * @returns 协调结果
   */
  async createCoordinatedSnapshot(
    sessionId: string,
    reason?: string,
    eventStoreCheckpoint?: {
      lastSequenceId: string;
      lastTimestamp?: number;
      processedCount: number;
    }
  ): Promise<CoordinationResult> {
    const startTime = Date.now();
    const steps: CoordinationResult['steps'] = [];
    
    try {
      // Step 1: 暂停事件总线
      const pauseStep = await this.executeStep(
        'Pause EventBus',
        async () => {
          if (this.eventBusController) {
            await this.eventBusController.pause();
          }
        }
      );
      steps.push(pauseStep);
      
      if (!pauseStep.success) {
        throw new SnapshotError('Failed to pause EventBus');
      }
      
      // Step 2: 创建快照
      let checkpointId: string | undefined;
      const createStep = await this.executeStep(
        'Create Snapshot',
        async () => {
          checkpointId = await this.snapshotManager.createSnapshot(
            sessionId,
            reason,
            eventStoreCheckpoint
          );
        }
      );
      steps.push(createStep);
      
      if (!createStep.success) {
        throw new SnapshotError('Failed to create snapshot');
      }
      
      // Step 3: 验证快照（可选）
      if (this.config.validateSnapshot && checkpointId) {
        const validateStep = await this.executeStep(
          'Validate Snapshot',
          async () => {
            const isValid = await this.snapshotManager.validateSnapshot(
              sessionId,
              checkpointId!
            );
            if (!isValid) {
              throw new SnapshotError('Snapshot validation failed');
            }
          }
        );
        steps.push(validateStep);
        
        if (!validateStep.success) {
          throw new SnapshotError('Snapshot validation failed');
        }
      }
      
      // Step 4: 恢复事件总线
      const resumeStep = await this.executeStep(
        'Resume EventBus',
        async () => {
          if (this.eventBusController) {
            await this.eventBusController.resume();
          }
        }
      );
      steps.push(resumeStep);
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        checkpointId,
        duration,
        steps,
      };
    } catch (error) {
      // 失败回滚
      if (this.config.rollbackOnFailure) {
        await this.rollback();
      }
      
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
        steps,
      };
    }
  }
  
  /**
   * 恢复协调的快照
   * 
   * 按照预定顺序验证快照、暂停事件总线、恢复状态、恢复事件总线
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 协调结果
   */
  async restoreCoordinatedSnapshot(
    sessionId: string,
    checkpointId: string
  ): Promise<CoordinationResult> {
    const startTime = Date.now();
    const steps: CoordinationResult['steps'] = [];
    
    try {
      // Step 1: 验证快照存在性
      const validateStep = await this.executeStep(
        'Validate Snapshot Exists',
        async () => {
          const exists = await this.snapshotManager.validateSnapshot(
            sessionId,
            checkpointId
          );
          if (!exists) {
            throw new SnapshotNotFoundError(sessionId, checkpointId);
          }
        }
      );
      steps.push(validateStep);
      
      if (!validateStep.success) {
        throw new SnapshotError('Snapshot validation failed');
      }
      
      // Step 2: 暂停事件总线
      const pauseStep = await this.executeStep(
        'Pause EventBus',
        async () => {
          if (this.eventBusController) {
            await this.eventBusController.pause();
          }
        }
      );
      steps.push(pauseStep);
      
      if (!pauseStep.success) {
        throw new SnapshotError('Failed to pause EventBus');
      }
      
      // Step 3: 恢复快照
      const restoreStep = await this.executeStep(
        'Restore Snapshot',
        async () => {
          await this.snapshotManager.restoreSnapshot(sessionId, checkpointId);
        }
      );
      steps.push(restoreStep);
      
      if (!restoreStep.success) {
        throw new SnapshotError('Failed to restore snapshot');
      }
      
      // Step 4: 恢复事件总线
      const resumeStep = await this.executeStep(
        'Resume EventBus',
        async () => {
          if (this.eventBusController) {
            await this.eventBusController.resume();
          }
        }
      );
      steps.push(resumeStep);
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        checkpointId,
        duration,
        steps,
      };
    } catch (error) {
      // 失败回滚
      if (this.config.rollbackOnFailure) {
        await this.rollback();
      }
      
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
        steps,
      };
    }
  }
  
  /**
   * 列出快照
   * 
   * @param sessionId 会话ID
   * @returns 快照列表
   */
  async listSnapshots(sessionId: string): Promise<SnapshotMeta[]> {
    return this.snapshotManager.listSnapshots(sessionId);
  }
  
  /**
   * 删除快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   */
  async deleteSnapshot(sessionId: string, checkpointId: string): Promise<void> {
    await this.snapshotManager.deleteSnapshot(sessionId, checkpointId);
  }
  
  /**
   * 验证快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 是否有效
   */
  async validateSnapshot(sessionId: string, checkpointId: string): Promise<boolean> {
    return this.snapshotManager.validateSnapshot(sessionId, checkpointId);
  }
  
  /**
   * 获取快照详情
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 快照详情
   */
  async getSnapshotDetails(
    sessionId: string,
    checkpointId: string
  ): Promise<{
    meta: SnapshotMeta;
    modules: string[];
    size: number;
    isValid: boolean;
  }> {
    const snapshot = await this.snapshotManager.loadSnapshot(sessionId, checkpointId);
    const isValid = await this.snapshotManager.validateSnapshot(sessionId, checkpointId);
    const stats = await this.snapshotManager.getStats(sessionId);
    
    // 从统计信息中找到对应快照的大小
    const snapshotMeta = (await this.listSnapshots(sessionId)).find(
      m => m.checkpointId === checkpointId
    );
    
    return {
      meta: snapshot.meta,
      modules: Object.keys(snapshot.modules),
      size: snapshotMeta?.size || 0,
      isValid,
    };
  }
  
  /**
   * 比较两个快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId1 第一个检查点ID
   * @param checkpointId2 第二个检查点ID
   * @returns 差异信息
   */
  async compareSnapshots(
    sessionId: string,
    checkpointId1: string,
    checkpointId2: string
  ): Promise<{
    addedModules: string[];
    removedModules: string[];
    modifiedModules: string[];
    timeDiff: number;
  }> {
    const snapshot1 = await this.snapshotManager.loadSnapshot(sessionId, checkpointId1);
    const snapshot2 = await this.snapshotManager.loadSnapshot(sessionId, checkpointId2);
    
    const modules1 = new Set(Object.keys(snapshot1.modules));
    const modules2 = new Set(Object.keys(snapshot2.modules));
    
    const addedModules = Array.from(modules2).filter(m => !modules1.has(m));
    const removedModules = Array.from(modules1).filter(m => !modules2.has(m));
    const modifiedModules: string[] = [];
    
    for (const moduleName of modules1) {
      if (modules2.has(moduleName)) {
        const state1 = JSON.stringify(snapshot1.modules[moduleName].state);
        const state2 = JSON.stringify(snapshot2.modules[moduleName].state);
        if (state1 !== state2) {
          modifiedModules.push(moduleName);
        }
      }
    }
    
    const timeDiff = snapshot2.meta.createdAt - snapshot1.meta.createdAt;
    
    return {
      addedModules,
      removedModules,
      modifiedModules,
      timeDiff,
    };
  }
  
  // ========== 私有方法 ==========
  
  /**
   * 执行步骤
   */
  private async executeStep(
    name: string,
    action: () => Promise<void>
  ): Promise<{ name: string; success: boolean; duration: number; error?: string }> {
    const startTime = Date.now();
    const timeout = this.createTimeoutPromise();
    
    try {
      // 设置超时
      await Promise.race([
        action(),
        timeout.promise,
      ]);
      timeout.cancel();
      
      return {
        name,
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      timeout.cancel();
      return {
        name,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 超时控制
   */
  private createTimeoutPromise(): { promise: Promise<never>; cancel: () => void } {
    let timer: NodeJS.Timeout | null = null;
    const promise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });

    const cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    return { promise, cancel };
  }
  
  /**
   * 回滚操作
   */
  private async rollback(): Promise<void> {
    try {
      // 尝试恢复事件总线
      if (this.eventBusController && this.eventBusController.isPaused()) {
        await this.eventBusController.resume();
      }
    } catch (error) {
      console.error('Rollback failed:', error);
    }
  }
}

/**
 * 创建快照协调器
 * 
 * @param config 配置
 * @returns 快照协调器实例
 */
export function createSnapshotCoordinator(config: CoordinatorConfig): SnapshotCoordinator {
  return new SnapshotCoordinator(config);
}
