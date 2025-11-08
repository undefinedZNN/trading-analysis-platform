/**
 * RiskEngine Orchestrator - 风控引擎编排器
 * 
 * 负责：
 * - 订阅相关事件
 * - 调用风控引擎评估
 * - 发布风控决策
 * - 处理后续动作
 * 
 * @module risk/orchestrator
 */

import { nanoid } from 'nanoid';
import { Subscription } from 'rxjs';
import { 
  RiskEngine, 
  RiskEngineOrchestrator, 
  OrchestratorStats,
  RiskDecisionPayload,
  FollowUpAction,
} from './interfaces';

/**
 * 简化的 EventBus 接口
 */
interface IEventBus {
  subscribe(eventType: string, handler: (event: any) => void | Promise<void>): Subscription;
  publish(event: any): void;
}

/**
 * 基础事件结构
 */
interface BaseEvent<T = any> {
  eventId: string;
  eventType: string;
  sessionId: string;
  sequenceId: string;
  timestamp: string;
  source: string;
  payload: T;
}

/**
 * 风控编排器实现
 */
export class RiskEngineOrchestratorImpl implements RiskEngineOrchestrator {
  private subscriptions: Subscription[] = [];
  private stats: OrchestratorStats = {
    totalEvaluations: 0,
    approvedCount: 0,
    rejectedCount: 0,
    modifiedCount: 0,
    haltedCount: 0,
    averageLatencyMs: 0,
  };
  private latencies: number[] = [];
  private isRunning: boolean = false;

  constructor(
    private sessionId: string,
    private logger?: (level: string, message: string, meta?: Record<string, unknown>) => void
  ) {}

  /**
   * 启动编排器
   */
  start(eventBus: IEventBus, riskEngine: RiskEngine): void {
    if (this.isRunning) {
      this.log('warn', 'Orchestrator already running');
      return;
    }

    this.log('info', 'Starting RiskEngine orchestrator');

    // 1. 订阅策略指令事件
    const intentSub = eventBus.subscribe('strategy.intent', async (event: BaseEvent) => {
      await this.handleIntent(event, eventBus, riskEngine);
    });
    this.subscriptions.push(intentSub);

    // 2. 订阅组合更新事件
    const portfolioSub = eventBus.subscribe('portfolio.update', (event: BaseEvent) => {
      this.handlePortfolioUpdate(event, riskEngine);
    });
    this.subscriptions.push(portfolioSub);

    // 3. 订阅执行回报事件
    const executionSub = eventBus.subscribe('execution.report', (event: BaseEvent) => {
      this.handleExecutionReport(event, riskEngine);
    });
    this.subscriptions.push(executionSub);

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

    // 取消所有订阅
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];

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
   * 处理策略指令
   */
  private async handleIntent(
    event: BaseEvent,
    eventBus: IEventBus,
    riskEngine: RiskEngine
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.log('debug', `Processing intent ${event.eventId}`, {
        eventId: event.eventId,
        symbol: event.payload.symbol,
      });

      // 1. 调用风控引擎评估
      const result = await riskEngine.evaluate(event.payload);
      
      // 2. 更新统计
      this.stats.totalEvaluations++;
      this.updateDecisionStats(result.decision);
      
      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      if (this.latencies.length > 100) {
        this.latencies.shift(); // 只保留最近100次
      }
      this.stats.averageLatencyMs = 
        this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;

      // 3. 发布风控决策事件
      const decision: BaseEvent<RiskDecisionPayload> = {
        eventId: nanoid(),
        eventType: 'risk.decision',
        sessionId: event.sessionId,
        sequenceId: '', // 由 EventBus 填充
        timestamp: new Date().toISOString(),
        source: 'risk-engine',
        payload: {
          strategyId: event.payload.strategyId,
          intentId: event.eventId,
          decision: result.decision,
          modifications: result.modifiedIntent,
          reasons: result.reason ? [result.reason] : [],
          followUp: result.followUp,
          ruleId: result.ruleId,
          severity: result.severity,
        },
      };

      eventBus.publish(decision);

      this.log('info', `Risk decision: ${result.decision}`, {
        intentId: event.eventId,
        decision: result.decision,
        ruleId: result.ruleId,
        latencyMs: latency,
      });

      // 4. 处理后续动作
      if (result.followUp && result.followUp.length > 0) {
        this.handleFollowUp(result.followUp, eventBus, event.sessionId);
      }

    } catch (error: any) {
      this.log('error', `Error processing intent: ${error.message}`, { error });
      
      // 出错时发布拒绝决策
      const errorDecision: BaseEvent<RiskDecisionPayload> = {
        eventId: nanoid(),
        eventType: 'risk.decision',
        sessionId: event.sessionId,
        sequenceId: '',
        timestamp: new Date().toISOString(),
        source: 'risk-engine',
        payload: {
          strategyId: event.payload.strategyId,
          intentId: event.eventId,
          decision: 'reject',
          reasons: [{
            code: 'ORCHESTRATOR_ERROR',
            message: `风控处理异常: ${error.message}`,
          }],
          severity: 'critical',
        },
      };
      
      eventBus.publish(errorDecision);
    }
  }

  /**
   * 处理组合更新
   */
  private handlePortfolioUpdate(event: BaseEvent, riskEngine: RiskEngine): void {
    try {
      riskEngine.updatePortfolio(event.payload);
      this.log('debug', 'Portfolio updated', { eventId: event.eventId });
    } catch (error: any) {
      this.log('error', `Error updating portfolio: ${error.message}`, { error });
    }
  }

  /**
   * 处理执行回报
   */
  private handleExecutionReport(event: BaseEvent, riskEngine: RiskEngine): void {
    try {
      riskEngine.updateExecution(event.payload);
      this.log('debug', 'Execution report processed', { eventId: event.eventId });
    } catch (error: any) {
      this.log('error', `Error processing execution: ${error.message}`, { error });
    }
  }

  /**
   * 处理后续动作
   */
  private handleFollowUp(
    actions: FollowUpAction[],
    eventBus: IEventBus,
    sessionId: string
  ): void {
    for (const action of actions) {
      this.log('info', `Executing follow-up action: ${action.type}`, {
        actionType: action.type,
        payload: action.payload,
      });

      // 发布后续动作事件
      const actionEvent: BaseEvent = {
        eventId: nanoid(),
        eventType: `risk.followup.${action.type.replace('-', '_')}`,
        sessionId,
        sequenceId: '',
        timestamp: new Date().toISOString(),
        source: 'risk-engine',
        payload: action.payload || {},
      };

      eventBus.publish(actionEvent);
    }
  }

  /**
   * 更新决策统计
   */
  private updateDecisionStats(decision: string): void {
    switch (decision) {
      case 'approve':
        this.stats.approvedCount++;
        break;
      case 'reject':
        this.stats.rejectedCount++;
        break;
      case 'modify':
        this.stats.modifiedCount++;
        break;
      case 'halt':
        this.stats.haltedCount++;
        break;
    }
  }

  /**
   * 日志记录
   */
  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    if (this.logger) {
      this.logger(level, message, meta);
    } else {
      const prefix = `[RiskOrchestrator:${this.sessionId}]`;
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`${prefix} [${level.toUpperCase()}] ${message}${metaStr}`);
    }
  }
}

/**
 * 创建风控编排器
 */
export function createRiskOrchestrator(
  sessionId: string,
  logger?: (level: string, message: string, meta?: Record<string, unknown>) => void
): RiskEngineOrchestrator {
  return new RiskEngineOrchestratorImpl(sessionId, logger);
}

