/**
 * RiskEngine 风控引擎核心实现
 * 
 * 提供：
 * - 规则注册与管理
 * - 订单评估
 * - 状态更新
 * - 快照恢复
 * 
 * @module risk/engine
 */

import { nanoid } from 'nanoid';
import {
  RiskEngine,
  RiskRule,
  RiskDecisionResult,
  RiskRuleContext,
  RiskState,
  RiskSnapshot,
  OrderIntentPayload,
  PortfolioUpdatePayload,
  ExecutionReportPayload,
  RiskRuntimeConfig,
} from './interfaces';
import { RiskStateManager, createInitialRiskState } from './state';

/**
 * 风控引擎配置
 */
export interface RiskEngineConfig {
  /** 会话ID */
  sessionId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 是否为模拟模式 */
  simulationMode?: boolean;
  
  /** 日志回调 */
  logger?: (level: string, message: string, meta?: Record<string, unknown>) => void;
}

/**
 * 风控引擎实现
 */
export class RiskEngineImpl implements RiskEngine {
  private rules: Map<string, RiskRule> = new Map();
  private stateManager: RiskStateManager;
  private config: RiskEngineConfig;
  private evaluationCount: number = 0;

  constructor(config: RiskEngineConfig) {
    this.config = config;
    this.stateManager = new RiskStateManager();
    this.log('info', 'RiskEngine initialized', { 
      sessionId: config.sessionId, 
      strategyId: config.strategyId 
    });
  }

  /**
   * 评估订单指令
   */
  async evaluate(intent: OrderIntentPayload): Promise<RiskDecisionResult> {
    this.evaluationCount++;
    
    try {
      // 1. 构建评估上下文
      const context = this.buildContext(intent);
      
      // 2. 获取排序后的活跃规则
      const sortedRules = this.getSortedActiveRules();
      
      this.log('debug', `Evaluating intent ${intent.intentId} with ${sortedRules.length} rules`, {
        intentId: intent.intentId,
        symbol: intent.symbol,
        side: intent.side,
        quantity: intent.quantity,
      });
      
      // 3. 依次评估规则
      for (const rule of sortedRules) {
        const result = rule.evaluate(context);
        
        // 如果规则返回非 null 决策，立即处理
        if (result && result.decision !== 'approve') {
          this.log('info', `Rule ${rule.id} returned decision: ${result.decision}`, {
            ruleId: rule.id,
            decision: result.decision,
            reason: result.reason,
          });
          
          // 记录风控决策
          this.logRiskDecision(intent, result);
          
          return result;
        }
      }
      
      // 4. 所有规则通过
      const approveResult: RiskDecisionResult = {
        decision: 'approve',
        ruleId: 'all-passed',
        severity: 'info',
      };
      
      this.log('debug', `Intent ${intent.intentId} approved by all rules`);
      this.logRiskDecision(intent, approveResult);
      
      return approveResult;
      
    } catch (error: any) {
      this.log('error', `Error evaluating intent: ${error.message}`, { error });
      
      // 出错时拒绝订单，保证安全
      return {
        decision: 'reject',
        reason: {
          code: 'EVALUATION_ERROR',
          message: `风控评估异常: ${error.message}`,
        },
        ruleId: 'error-handler',
        severity: 'critical',
      };
    }
  }

  /**
   * 更新组合状态
   */
  updatePortfolio(update: PortfolioUpdatePayload): void {
    this.stateManager.updatePortfolio(update);
    this.log('debug', 'Portfolio updated', { 
      equity: update.equity, 
      positionCount: update.positions.length 
    });
  }

  /**
   * 更新执行状态
   */
  updateExecution(report: ExecutionReportPayload): void {
    this.stateManager.updateExecution(report);
    this.log('debug', 'Execution report processed', { 
      orderId: report.orderId, 
      status: report.status 
    });
  }

  /**
   * 注册规则
   */
  registerRule(rule: RiskRule): void {
    if (this.rules.has(rule.id)) {
      this.log('warn', `Rule ${rule.id} already registered, replacing it`);
    }
    
    this.rules.set(rule.id, rule);
    
    if (rule.enabled) {
      this.stateManager.addActiveRule(rule.id);
    }
    
    this.log('info', `Rule registered: ${rule.id} (${rule.name})`, {
      ruleId: rule.id,
      priority: rule.priority,
      enabled: rule.enabled,
    });
  }

  /**
   * 启用规则
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      this.log('warn', `Rule ${ruleId} not found, cannot enable`);
      return;
    }
    
    rule.enabled = true;
    this.stateManager.addActiveRule(ruleId);
    this.log('info', `Rule enabled: ${ruleId}`);
  }

  /**
   * 禁用规则
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      this.log('warn', `Rule ${ruleId} not found, cannot disable`);
      return;
    }
    
    rule.enabled = false;
    this.stateManager.removeActiveRule(ruleId);
    this.log('info', `Rule disabled: ${ruleId}`);
  }

  /**
   * 获取所有规则
   */
  getRules(): RiskRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 获取当前状态
   */
  getState(): RiskState {
    return this.stateManager.getState();
  }

  /**
   * 创建快照
   */
  createSnapshot(): RiskSnapshot {
    return {
      snapshotId: nanoid(),
      sessionId: this.config.sessionId,
      strategyId: this.config.strategyId,
      state: this.stateManager.getState(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 恢复快照
   */
  restoreSnapshot(snapshot: RiskSnapshot): void {
    if (snapshot.sessionId !== this.config.sessionId) {
      this.log('warn', 'Snapshot sessionId mismatch', {
        expected: this.config.sessionId,
        actual: snapshot.sessionId,
      });
    }
    
    this.stateManager.restoreState(snapshot.state);
    this.log('info', 'Snapshot restored', { snapshotId: snapshot.snapshotId });
  }

  /**
   * 重置统计数据
   */
  resetStats(): void {
    this.stateManager.resetStats();
    this.log('info', 'Statistics reset');
  }

  /**
   * 获取评估统计
   */
  getEvaluationCount(): number {
    return this.evaluationCount;
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 构建规则评估上下文
   */
  private buildContext(intent: OrderIntentPayload): RiskRuleContext {
    const state = this.stateManager.getState();
    
    const runtimeConfig: RiskRuntimeConfig = {
      sessionId: this.config.sessionId,
      strategyId: this.config.strategyId,
      currentTime: new Date().toISOString(),
      simulationMode: this.config.simulationMode ?? true,
    };
    
    return {
      portfolio: state.portfolio,
      currentIntent: intent,
      historicalStats: state.stats,
      runtimeConfig,
      // marketSnapshot 可由外部传入，此处省略
    };
  }

  /**
   * 获取排序后的活跃规则
   */
  private getSortedActiveRules(): RiskRule[] {
    return Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * 记录风控决策
   */
  private logRiskDecision(intent: OrderIntentPayload, result: RiskDecisionResult): void {
    // 这里可以记录到数据库或文件
    // 当前仅记录日志
    this.log('info', 'Risk decision made', {
      intentId: intent.intentId,
      symbol: intent.symbol,
      decision: result.decision,
      ruleId: result.ruleId,
      reason: result.reason,
      severity: result.severity,
    });
  }

  /**
   * 日志记录
   */
  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    if (this.config.logger) {
      this.config.logger(level, message, meta);
    } else {
      // 默认控制台输出
      const prefix = `[RiskEngine:${this.config.strategyId}]`;
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`${prefix} [${level.toUpperCase()}] ${message}${metaStr}`);
    }
  }
}

/**
 * 创建风控引擎实例
 */
export function createRiskEngine(config: RiskEngineConfig): RiskEngine {
  return new RiskEngineImpl(config);
}

