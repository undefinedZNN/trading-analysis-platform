/**
 * ExecutionEngine Orchestrator - 执行引擎编排器
 * 
 * 负责：
 * - 订阅风控决策事件
 * - 订阅行情事件
 * - 发布执行回报
 * - 发布组合更新
 * 
 * @module execution/orchestrator
 */

import { Subscription } from 'rxjs';
import {
  ExecutionEngine,
  ExecutionEngineOrchestrator,
  OrchestratorStats,
  ExecutionReportPayload,
  PortfolioUpdatePayload,
} from './interfaces';

/**
 * 简化的 EventBus 接口
 */
interface IEventBus {
  subscribe(eventType: string, handler: (event: any) => void | Promise<void>): Subscription;
  publish(event: any): void;
}

/**
 * 执行引擎编排器实现
 */
export class ExecutionEngineOrchestratorImpl implements ExecutionEngineOrchestrator {
  private subscriptions: Subscription[] = [];
  private stats: OrchestratorStats = {
    processedOrders: 0,
    processedBars: 0,
    averageLatencyMs: 0,
  };
  private latencies: number[] = [];
  private isRunning: boolean = false;
  private intentCache = new Map<string, any>(); // 缓存intent用于重建订单

  constructor(
    private sessionId: string,
    private logger?: (level: string, message: string, meta?: Record<string, unknown>) => void
  ) {}

  /**
   * 启动编排器
   */
  start(eventBus: IEventBus, executionEngine: ExecutionEngine): void {
    if (this.isRunning) {
      this.log('warn', 'Orchestrator already running');
      return;
    }

    this.log('info', 'Starting ExecutionEngine orchestrator');

    // 设置事件回调
    if ('setEventCallbacks' in executionEngine) {
      (executionEngine as any).setEventCallbacks({
        onExecutionReport: (report: ExecutionReportPayload) => {
          this.publishExecutionReport(eventBus, report);
        },
        onPortfolioUpdate: (update: PortfolioUpdatePayload) => {
          this.publishPortfolioUpdate(eventBus, update);
        },
      });
    }

    // 1. 订阅策略意图（用于缓存）
    const intentSub = eventBus.subscribe('strategy.intent', (event: any) => {
      // 缓存intent，风控决策时需要
      this.intentCache.set(event.eventId, event.payload);
    });
    this.subscriptions.push(intentSub);

    // 2. 订阅风控决策
    const decisionSub = eventBus.subscribe('risk.decision', async (event: any) => {
      await this.handleRiskDecision(event, eventBus, executionEngine);
    });
    this.subscriptions.push(decisionSub);

    // 3. 订阅行情事件
    const barSub = eventBus.subscribe('market.bar', async (event: any) => {
      await this.handleMarketBar(event, executionEngine);
    });
    this.subscriptions.push(barSub);

    this.isRunning = true;
    this.log('info', 'Orchestrator started with 3 subscriptions');
  }

  /**
   * 停止编排器
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.log('info', 'Stopping orchestrator');

    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this.intentCache.clear();

    this.isRunning = false;
    this.log('info', 'Orchestrator stopped');
  }

  /**
   * 获取统计信息
   */
  getStats(): OrchestratorStats {
    return { ...this.stats };
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 处理风控决策
   */
  private async handleRiskDecision(
    event: any,
    eventBus: IEventBus,
    executionEngine: ExecutionEngine
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const decision = event.payload.decision;
      const intentId = event.payload.intentId;

      // 从缓存获取原始intent
      const originalIntent = this.intentCache.get(intentId);
      if (!originalIntent) {
        this.log('warn', `Intent not found in cache: ${intentId}`);
        return;
      }

      if (decision === 'approve') {
        // 批准：直接提交订单
        await executionEngine.submit({
          ...originalIntent,
          intentId,
        });
        this.stats.processedOrders++;
        
        this.log('info', `Order submitted for approved intent: ${intentId}`);
        
      } else if (decision === 'modify') {
        // 修改：应用修改后提交
        const modifiedIntent = {
          ...originalIntent,
          ...event.payload.modifications,
          intentId,
        };
        await executionEngine.submit(modifiedIntent);
        this.stats.processedOrders++;
        
        this.log('info', `Order submitted for modified intent: ${intentId}`);
        
      } else {
        // reject/halt：不提交订单
        this.log('info', `Intent ${intentId} not submitted (decision: ${decision})`);
      }

      // 更新延迟统计
      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      if (this.latencies.length > 100) {
        this.latencies.shift();
      }
      this.stats.averageLatencyMs =
        this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
        
    } catch (error: any) {
      this.log('error', `Error handling risk decision: ${error.message}`, { error });
    }
  }

  /**
   * 处理行情事件
   */
  private async handleMarketBar(
    event: any,
    executionEngine: ExecutionEngine
  ): Promise<void> {
    try {
      const bar = event.payload;
      await executionEngine.processBars([bar]);
      this.stats.processedBars++;
      
      this.log('debug', `Processed bar for ${bar.symbol}`);
      
    } catch (error: any) {
      this.log('error', `Error processing bar: ${error.message}`, { error });
    }
  }

  /**
   * 发布执行回报
   */
  private publishExecutionReport(eventBus: IEventBus, report: ExecutionReportPayload): void {
    const event = {
      eventId: require('nanoid').nanoid(),
      eventType: 'execution.report',
      sessionId: this.sessionId,
      sequenceId: '',
      timestamp: new Date().toISOString(),
      source: 'execution-engine',
      payload: report,
    };

    eventBus.publish(event);
    this.log('debug', `Published execution report for order ${report.orderId}`);
  }

  /**
   * 发布组合更新
   */
  private publishPortfolioUpdate(eventBus: IEventBus, update: PortfolioUpdatePayload): void {
    const event = {
      eventId: require('nanoid').nanoid(),
      eventType: 'portfolio.update',
      sessionId: this.sessionId,
      sequenceId: '',
      timestamp: new Date().toISOString(),
      source: 'execution-engine',
      payload: update,
    };

    eventBus.publish(event);
    this.log('debug', `Published portfolio update for strategy ${update.strategyId}`);
  }

  /**
   * 日志记录
   */
  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    if (this.logger) {
      this.logger(level, message, meta);
    } else {
      const prefix = `[ExecutionOrchestrator:${this.sessionId}]`;
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`${prefix} [${level.toUpperCase()}] ${message}${metaStr}`);
    }
  }
}

/**
 * 创建执行引擎编排器
 */
export function createExecutionOrchestrator(
  sessionId: string,
  logger?: (level: string, message: string, meta?: Record<string, unknown>) => void
): ExecutionEngineOrchestrator {
  return new ExecutionEngineOrchestratorImpl(sessionId, logger);
}

