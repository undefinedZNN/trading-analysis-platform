/**
 * 编排器实现
 * 
 * 负责管理所有回测会话的生命周期
 * 
 * @module orchestrator/orchestrator/orchestrator
 */

import { nanoid } from 'nanoid';
import type {
  Orchestrator,
  SessionSnapshot,
  SessionResults,
  CheckpointMeta,
  ModuleCoordinator,
} from '../interfaces/orchestrator';
import type {
  SnapshotMeta,
  ModuleSnapshot as SnapshotModuleSnapshot,
  EventStoreCheckpoint,
} from '../interfaces/snapshot';
import {
  SessionNotFoundError,
  SessionAlreadyExistsError,
  SnapshotNotFoundError,
  OrchestratorError,
} from '../interfaces/orchestrator';
import type { Session } from '../interfaces/session';
import { SessionEventType, SessionState } from '../interfaces/session';
import type { BacktestSessionConfig } from '../interfaces/config';
import type { ServiceContainer } from '../interfaces/container';
import { createSession } from '../session';
import { mergeConfig } from '../config/merger';
import { validateConfigOrThrow } from '../config/validator';

/**
 * 编排器实现
 */
export class OrchestratorImpl implements Orchestrator {
  /** 会话映射 */
  private sessions: Map<string, Session> = new Map();
  
  /** 快照存储 */
  private snapshots: Map<string, SessionSnapshot> = new Map();
  
  /** 模块协调器 */
  private moduleCoordinator: ModuleCoordinator;
  
  /**
   * 构造函数
   */
  constructor(moduleCoordinator: ModuleCoordinator) {
    this.moduleCoordinator = moduleCoordinator;
  }
  
  /**
   * 创建会话
   */
  async createSession(config: BacktestSessionConfig): Promise<Session> {
    // 合并配置
    const mergedConfig = mergeConfig(config);
    
    // 验证配置
    validateConfigOrThrow(mergedConfig);
    
    // 检查会话是否已存在
    if (this.sessions.has(mergedConfig.sessionId)) {
      throw new SessionAlreadyExistsError(mergedConfig.sessionId);
    }
    
    // 创建服务容器
    const container = this.createServiceContainer(mergedConfig);
    
    // 初始化模块
    await this.moduleCoordinator.initializeModules(container, mergedConfig);
    
    // 创建会话
    const session = createSession(mergedConfig, container);
    
    // 监听会话销毁事件，自动移除会话
    session.on(SessionEventType.Destroyed, () => {
      this.sessions.delete(mergedConfig.sessionId);
    });
    
    // 保存会话
    this.sessions.set(mergedConfig.sessionId, session);
    
    return session;
  }
  
  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * 列出所有会话
   */
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }
  
  /**
   * 启动会话
   */
  async start(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.start();
  }
  
  /**
   * 暂停会话
   */
  async pause(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.pause();
  }
  
  /**
   * 恢复会话
   */
  async resume(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.resume();
  }
  
  /**
   * 定位到指定序列号
   */
  async seek(sessionId: string, sequenceId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    
    // 获取 EventBus 并执行 seek 操作
    const container = (session as any).container as ServiceContainer;
    const eventBus = container.tryResolve('EventBus');
    
    if (eventBus && typeof eventBus === 'object' && 'seek' in eventBus) {
      await (eventBus as any).seek(sequenceId);
    } else {
      throw new OrchestratorError('EventBus does not support seek operation');
    }
  }
  
  /**
   * 停止会话
   */
  async stop(sessionId: string, reason?: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.stop();
  }
  
  /**
   * 创建快照
   */
  async createSnapshot(sessionId: string, reason?: string): Promise<string> {
    const session = this.getSessionOrThrow(sessionId);
    const container = (session as any).container as ServiceContainer;
    
    // 创建快照ID
    const checkpointId = nanoid();
    
    const stats = session.getStats();
    const moduleStates = this.moduleCoordinator.getModuleStates(container);
    const modules = this.buildModuleSnapshots(moduleStates);
    
    const meta: SnapshotMeta = {
      sessionId,
      checkpointId,
      createdAt: Date.now(),
      status: session.state,
      version: '1.0.0',
      compressed: false,
      reason,
      metadata: {
        state: session.state,
      },
    };
    
    const eventStoreCheckpoint: EventStoreCheckpoint = {
      lastSequenceId: 'unknown',
      processedCount: stats.processedEvents,
    };
    
    const snapshot: SessionSnapshot = {
      meta,
      modules,
      eventStoreCheckpoint,
    };
    
    // 保存快照
    const snapshotKey = `${sessionId}:${checkpointId}`;
    this.snapshots.set(snapshotKey, snapshot);
    
    return checkpointId;
  }
  
  /**
   * 列出快照
   */
  async listSnapshots(sessionId: string): Promise<CheckpointMeta[]> {
    const snapshots: CheckpointMeta[] = [];
    
    for (const [key, snapshot] of this.snapshots) {
      if (key.startsWith(`${sessionId}:`)) {
        snapshots.push({
          checkpointId: snapshot.meta.checkpointId,
          sessionId: snapshot.meta.sessionId,
          createdAt: snapshot.meta.createdAt,
          sequenceId: snapshot.meta.sequenceId,
          reason: snapshot.meta.reason,
          size: snapshot.meta.size,
          metadata: snapshot.meta.metadata,
        });
      }
    }
    
    // 按创建时间降序排列
    snapshots.sort((a, b) => b.createdAt - a.createdAt);
    
    return snapshots;
  }
  
  /**
   * 恢复快照
   */
  async restoreSnapshot(sessionId: string, checkpointId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const container = (session as any).container as ServiceContainer;
    
    // 获取快照
    const snapshotKey = `${sessionId}:${checkpointId}`;
    const snapshot = this.snapshots.get(snapshotKey);
    
    if (!snapshot) {
      throw new SnapshotNotFoundError(sessionId, checkpointId);
    }
    
    // 恢复模块状态
    const moduleStateMap = this.extractModuleStates(snapshot.modules);
    
    await this.moduleCoordinator.restoreModuleStates(
      container,
      moduleStateMap
    );
  }
  
  /**
   * 获取结果
   */
  async getResults(sessionId: string): Promise<SessionResults> {
    const session = this.getSessionOrThrow(sessionId);
    const stats = session.getStats();
    const state = session.state;
    const metadata = session.metadata;
    const container = (session as any).container as ServiceContainer;
    
    // 获取 LedgerService 的交易记录
    const ledgerService = container.tryResolve('LedgerService');
    let trades: unknown[] | undefined;
    
    if (ledgerService && typeof ledgerService === 'object' && 'getTrades' in ledgerService) {
      trades = (ledgerService as any).getTrades?.();
    }
    
    // 确定状态
    const status = this.mapStateToResultStatus(state);
    const startTime = metadata.startedAt ?? metadata.createdAt;
    const endTime = metadata.completedAt ?? Date.now();
    const duration =
      metadata.duration ??
      (metadata.startedAt ? endTime - metadata.startedAt : 0);
    
    // 构建结果
    const results: SessionResults = {
      sessionId,
      status,
      startTime,
      endTime,
      duration,
      stats: {
        processedEvents: stats.processedEvents,
        errorCount: stats.errorCount,
      },
      trades,
    };
    
    return results;
  }
  
  /**
   * 销毁会话
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    
    // 销毁会话
    await session.destroy();
    
    // 删除会话快照
    for (const key of this.snapshots.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.snapshots.delete(key);
      }
    }
    
    // 从映射中移除（session.destroy() 会触发 Destroyed 事件，自动移除）
  }
  
  /**
   * 销毁所有会话
   */
  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    
    for (const sessionId of sessionIds) {
      await this.destroySession(sessionId);
    }
    
    // 清空快照
    this.snapshots.clear();
  }
  
  /**
   * 获取会话或抛出异常
   */
  private getSessionOrThrow(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }
  
  private buildModuleSnapshots(
    states: Record<string, unknown>
  ): Record<string, SnapshotModuleSnapshot> {
    const modules: Record<string, SnapshotModuleSnapshot> = {};
    const timestamp = Date.now();
    
    Object.entries(states).forEach(([key, state]) => {
      modules[key] = {
        state,
        timestamp,
      };
    });
    
    return modules;
  }
  
  private extractModuleStates(
    modules: Record<string, SnapshotModuleSnapshot>
  ): Record<string, unknown> {
    const states: Record<string, unknown> = {};
    Object.entries(modules).forEach(([key, snapshot]) => {
      states[key] = snapshot.state;
    });
    return states;
  }
  
  private mapStateToResultStatus(
    state: SessionState
  ): 'completed' | 'failed' | 'stopped' {
    if (state === SessionState.Failed) {
      return 'failed';
    }
    if (
      state === SessionState.Stopped ||
      state === SessionState.Paused ||
      state === SessionState.Idle
    ) {
      return 'stopped';
    }
    return 'completed';
  }
  
  /**
   * 创建服务容器
   * 
   * 在实际应用中，这里会注册所有必要的服务
   * 现在返回一个空容器，具体实现在集成测试中
   */
  private createServiceContainer(config: BacktestSessionConfig): ServiceContainer {
    // 这里应该创建并配置 ServiceContainer
    // 注册所有必要的服务：DataProvider, EventBus, 等等
    // 为了简化，我们返回一个基本的容器实现
    
    // 导入 ServiceContainerImpl
    const { ServiceContainerImpl } = require('../container/service-container');
    const container = new ServiceContainerImpl();
    
    // 注册配置
    container.registerInstance('Config', config);
    
    return container;
  }
}

/**
 * 创建编排器
 */
export function createOrchestrator(moduleCoordinator: ModuleCoordinator): Orchestrator {
  return new OrchestratorImpl(moduleCoordinator);
}
