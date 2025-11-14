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
import { DefaultServiceContainer } from '../container/service-container';
import { ServiceTokens } from '../container/tokens';
import { ServiceLifetime } from '../interfaces/container';
import { createSession } from '../session';
import { mergeConfig } from '../config/merger';
import { validateConfigOrThrow } from '../config/validator';
import { createParquetDuckDBProvider } from '../../data/providers';
import { SimpleEventStore } from '../../events/simple-bus';
import { SimpleEventBus } from '../../events/simple-bus';
import { resolveDatasetPath } from '../../../config/storage.config';
import { dirname, resolve } from 'path';

/**
 * 编排器实现
 */
export class OrchestratorImpl implements Orchestrator {
  /** 会话映射 */
  private sessions: Map<string, Session> = new Map();
  
  /** 快照存储 */
  private snapshots: Map<string, SessionSnapshot> = new Map();
  
  /** 快照序列号（用于排序稳定性） */
  private snapshotSequence = 0;
  
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
    const createdAt = Date.now();
    const sequence = ++this.snapshotSequence;
    const sequenceId = sequence.toString().padStart(12, '0');
    
    const stats = session.getStats();
    const moduleStates = this.moduleCoordinator.getModuleStates(container);
    const modules = this.buildModuleSnapshots(moduleStates);
    
    const meta: SnapshotMeta = {
      sessionId,
      checkpointId,
      createdAt,
      status: session.state,
      version: '1.0.0',
      compressed: false,
      reason,
      sequenceId,
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
    
    // 按创建时间降序排列；如果时间相同，再按照序列号降序排列
    snapshots.sort((a, b) => {
      if (b.createdAt !== a.createdAt) {
        return b.createdAt - a.createdAt;
      }
      const seqA = a.sequenceId ? Number(a.sequenceId) : 0;
      const seqB = b.sequenceId ? Number(b.sequenceId) : 0;
      return seqB - seqA;
    });
    
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
   * 注册所有必要的服务：DataProvider, EventBus, EventStore 等
   */
  private createServiceContainer(config: BacktestSessionConfig): ServiceContainer {
    const container = new DefaultServiceContainer();
    
    // 注册配置
    container.registerInstance('Config', config);
    container.registerInstance(ServiceTokens.SessionConfig, config);
    container.registerInstance(ServiceTokens.DataConfig, config.data);
    container.registerInstance(ServiceTokens.StrategyConfig, config.strategy);
    container.registerInstance(ServiceTokens.ExecutionConfig, config.execution);
    container.registerInstance(ServiceTokens.RiskConfig, config.risk);
    
    // 注册 EventStore（单例）
    container.registerFactory(
      ServiceTokens.EventStore,
      () => new SimpleEventStore(),
      ServiceLifetime.Singleton
    );
    
    // 注册 EventBus（单例，依赖 EventStore）
    container.registerFactory(
      ServiceTokens.EventBus,
      (c) => {
        const store = c.resolve(ServiceTokens.EventStore) as SimpleEventStore;
        return new SimpleEventBus(store);
      },
      ServiceLifetime.Singleton,
      [ServiceTokens.EventStore]
    );
    
    // 注册 DataProvider（单例）
    container.registerFactory(
      ServiceTokens.DataProvider,
      (c) => {
        const dataConfig = c.resolve(ServiceTokens.DataConfig) as any;
        
        // 从配置中提取 storageBasePath（必须是绝对路径，因为 DuckDB 需要绝对路径）
        // dataConfig.source.path 是绝对路径，例如：
        // /Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-最新/ES/1s
        // 数据集路径格式：ES-最新/ES/1s（第一级是数据集名称，第二级是symbol，第三级是timeframe）
        // buildParquetPath 构建：${storageBasePath}/${symbol}/${timeframe}/*.parquet
        // 所以 storageBasePath 应该是：/Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-最新
        
        let storageBasePath: string;
        
        if (dataConfig?.source?.path) {
          const fullPath = dataConfig.source.path;
          
          // 如果已经是绝对路径（从 resolveDatasetPath 返回的）
          if (fullPath.startsWith('/')) {
            const parts = fullPath.split('/');
            const datasetsIndex = parts.indexOf('datasets');
            
            if (datasetsIndex >= 0) {
              // 提取到 datasets 目录及其下一级（数据集名称）
              // 例如：/Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-最新/ES/1s
              // 提取为：/Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-最新
              const baseParts = parts.slice(0, datasetsIndex + 2); // datasets + 下一级
              storageBasePath = baseParts.join('/');
            } else {
              // 没找到 datasets，使用默认值（转换为绝对路径）
              storageBasePath = resolve(process.cwd(), 'storage/datasets');
            }
          } else {
            // 相对路径，假设是相对于 storage/datasets
            // 格式：ES-最新/ES/1s，提取第一级作为数据集名称
            const pathParts = fullPath.split('/');
            if (pathParts.length >= 1) {
              storageBasePath = resolve(process.cwd(), 'storage/datasets', pathParts[0]);
            } else {
              storageBasePath = resolve(process.cwd(), 'storage/datasets');
            }
          }
        } else {
          // 使用默认值（转换为绝对路径）
          storageBasePath = resolve(process.cwd(), 'storage/datasets');
        }
        
        console.log(`[Orchestrator] DataProvider storageBasePath: ${storageBasePath}`);
        
        return createParquetDuckDBProvider({
          storageBasePath,
          defaultBatchSize: 10000,
          defaultGapPolicy: 'fill',
          defaultFillMethod: 'forwardFill',
        });
      },
      ServiceLifetime.Singleton,
      [ServiceTokens.DataConfig]
    );
    
    // TODO: 注册其他服务（TimeframeAdapter, FeatureRegistry, StrategySandbox, RiskEngine, ExecutionEngine, LedgerService）
    // 这些服务需要根据实际实现来注册
    
    return container;
  }
}

/**
 * 创建编排器
 */
export function createOrchestrator(moduleCoordinator: ModuleCoordinator): Orchestrator {
  return new OrchestratorImpl(moduleCoordinator);
}
