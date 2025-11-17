/**
 * RiskEngine 风险控制引擎接口定义
 * 
 * 提供可插拔的风控规则框架，支持：
 * - 订单规模限制
 * - 杠杆率控制
 * - 盈亏限制
 * - 止损止盈
 * 
 * @module risk/interfaces
 */

import Big from 'big.js';
import { Observable } from 'rxjs';
import { ExecutionFill } from '../execution/interfaces';

// ============================================================================
// 核心类型定义
// ============================================================================

/**
 * 风控决策类型
 */
export type RiskDecisionType = 
  | 'approve'   // 批准订单
  | 'reject'    // 拒绝订单
  | 'modify'    // 修改订单参数
  | 'halt';     // 暂停策略

/**
 * 严重程度
 */
export type RiskSeverity = 'info' | 'warning' | 'critical';

/**
 * 后续动作类型
 */
export type FollowUpActionType = 
  | 'force-close'      // 强制平仓
  | 'cancel-order'     // 取消订单
  | 'notify'           // 发送通知
  | 'halt-strategy';   // 暂停策略

// ============================================================================
// 风控决策
// ============================================================================

/**
 * 风控决策结果
 */
export interface RiskDecisionResult {
  /** 决策类型 */
  decision: RiskDecisionType;
  
  /** 修改后的订单参数（仅当 decision='modify' 时有效） */
  modifiedIntent?: Partial<OrderIntentPayload>;
  
  /** 拒绝/修改原因 */
  reason?: RiskReason;
  
  /** 后续动作（如强制平仓） */
  followUp?: FollowUpAction[];
  
  /** 触发规则ID */
  ruleId?: string;
  
  /** 严重程度 */
  severity?: RiskSeverity;
}

/**
 * 风控原因
 */
export interface RiskReason {
  /** 错误代码 */
  code: string;
  
  /** 错误消息 */
  message: string;
  
  /** 额外信息 */
  details?: Record<string, unknown>;
}

/**
 * 后续动作
 */
export interface FollowUpAction {
  /** 动作类型 */
  type: FollowUpActionType;
  
  /** 动作参数 */
  payload?: Record<string, unknown>;
}

// ============================================================================
// 风控规则
// ============================================================================

/**
 * 风控规则接口
 */
export interface RiskRule {
  /** 规则唯一ID */
  readonly id: string;
  
  /** 规则名称 */
  readonly name: string;
  
  /** 规则优先级（数字越小优先级越高） */
  readonly priority: number;
  
  /** 是否启用 */
  enabled: boolean;
  
  /**
   * 评估订单指令
   * @param ctx 规则上下文
   * @returns 决策结果，null 表示规则通过
   */
  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null;
}

/**
 * 规则评估上下文
 */
export interface RiskRuleContext {
  /** 当前组合快照 */
  portfolio: PortfolioSnapshot;
  
  /** 当前订单指令 */
  currentIntent: OrderIntentPayload;
  
  /** 历史统计数据 */
  historicalStats: HistoricalStats;
  
  /** 市场快照（可选） */
  marketSnapshot?: MarketBarEvent;
  
  /** 运行时配置 */
  runtimeConfig: RiskRuntimeConfig;
}

/**
 * 运行时配置
 */
export interface RiskRuntimeConfig {
  /** 会话ID */
  sessionId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 当前时间 */
  currentTime: string;
  
  /** 是否为模拟模式 */
  simulationMode: boolean;
  
  /** 额外配置 */
  [key: string]: unknown;
}

// ============================================================================
// 组合与仓位
// ============================================================================

/**
 * 组合快照
 */
export interface PortfolioSnapshot {
  /** 现金余额 */
  balances: Record<string, string>;  // currency -> amount
  
  /** 持仓信息 */
  positions: Record<string, PositionSnapshot>;  // symbol -> position
  
  /** 总权益 */
  equity: string;
  
  /** 保证金使用 */
  marginUsage: string;
  
  /** 快照时间 */
  timestamp?: string;
}

/**
 * 仓位快照
 */
export interface PositionSnapshot {
  /** 交易对 */
  symbol: string;
  
  /** 方向 */
  side: 'long' | 'short';
  
  /** 持仓数量 */
  quantity: string;
  
  /** 平均入场价 */
  avgEntryPrice: string;
  
  /** 未实现盈亏 */
  unrealizedPnl: string;
  
  /** 已实现盈亏 */
  realizedPnl: string;
  
  /** 当前市价（可选） */
  currentPrice?: string;
}

// ============================================================================
// 历史统计
// ============================================================================

/**
 * 历史统计数据
 */
export interface HistoricalStats {
  /** 今日订单数 */
  ordersToday: number;
  
  /** 今日成交数 */
  filledToday: number;
  
  /** 今日盈亏 */
  pnlToday: string;
  
  /** 累计盈亏 */
  cumulativePnl: string;
  
  /** 最大回撤 */
  maxDrawdown: string;
  
  /** 最后重置时间 */
  lastResetAt: string;
  
  /** 连续亏损次数 */
  consecutiveLosses?: number;
  
  /** 连续盈利次数 */
  consecutiveWins?: number;
}

// ============================================================================
// 风控引擎
// ============================================================================

/**
 * 风控引擎接口
 */
export interface RiskEngine {
  /**
   * 评估策略指令
   * @param intent 订单指令
   * @returns 风控决策结果
   */
  evaluate(intent: OrderIntentPayload): Promise<RiskDecisionResult>;
  
  /**
   * 更新组合状态
   * @param update 组合更新
   */
  updatePortfolio(update: PortfolioUpdatePayload): void;
  
  /**
   * 更新执行状态
   * @param report 执行回报
   */
  updateExecution(report: ExecutionReportPayload): void;
  
  /**
   * 注册风控规则
   * @param rule 风控规则
   */
  registerRule(rule: RiskRule): void;
  
  /**
   * 启用规则
   * @param ruleId 规则ID
   */
  enableRule(ruleId: string): void;
  
  /**
   * 禁用规则
   * @param ruleId 规则ID
   */
  disableRule(ruleId: string): void;
  
  /**
   * 获取所有规则
   */
  getRules(): RiskRule[];
  
  /**
   * 获取当前状态
   */
  getState(): RiskState;
  
  /**
   * 创建快照
   */
  createSnapshot(): RiskSnapshot;
  
  /**
   * 恢复快照
   * @param snapshot 快照数据
   */
  restoreSnapshot(snapshot: RiskSnapshot): void;
  
  /**
   * 重置统计数据
   */
  resetStats(): void;
}

/**
 * 风控引擎状态
 */
export interface RiskState {
  /** 组合快照 */
  portfolio: PortfolioSnapshot;
  
  /** 历史统计 */
  stats: HistoricalStats;
  
  /** 活跃的规则列表 */
  activeRules: string[];
  
  /** 创建时间 */
  createdAt: string;
  
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 风控快照
 */
export interface RiskSnapshot {
  /** 快照ID */
  snapshotId: string;
  
  /** 会话ID */
  sessionId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 风控状态 */
  state: RiskState;
  
  /** 快照时间 */
  timestamp: string;
}

// ============================================================================
// 事件 Payload 定义（引用自其他模块）
// ============================================================================

/**
 * 订单指令 Payload
 */
export interface OrderIntentPayload {
  intentId: string;
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: string;
  price?: string;
  orderType: 'market' | 'limit' | 'stop' | 'stop-limit';
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  metadata?: Record<string, unknown>;
}

/**
 * 组合更新 Payload
 */
export interface PortfolioUpdatePayload {
  strategyId: string;
  balances: Record<string, string>;
  positions: Array<{
    symbol: string;
    side: 'long' | 'short';
    quantity: string;
    avgEntryPrice: string;
    unrealizedPnl: string;
    realizedPnl: string;
  }>;
  equity: string;
  marginUsage?: string;
  timestamp: string;
}

/**
 * 执行回报 Payload
 */
export interface ExecutionReportPayload {
  orderId: string;
  intentId: string;
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  status: 'pending' | 'filled' | 'partially-filled' | 'cancelled' | 'rejected';
  quantity: string;
  remaining: string;
  filledQty: string;
  avgFillPrice: string;
  lastFill?: ExecutionFill;
  totalFee: string;
  feeCurrency: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * 市场行情事件
 */
export interface MarketBarEvent {
  symbol: string;
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

/**
 * 风控决策 Payload
 */
export interface RiskDecisionPayload {
  strategyId: string;
  intentId: string;
  decision: RiskDecisionType;
  modifications?: Partial<OrderIntentPayload>;
  reasons: RiskReason[];
  followUp?: FollowUpAction[];
  ruleId?: string;
  severity?: RiskSeverity;
}

// ============================================================================
// 风控编排器
// ============================================================================

/**
 * 风控编排器接口
 */
export interface RiskEngineOrchestrator {
  /**
   * 启动风控引擎
   * @param eventBus 事件总线
   * @param riskEngine 风控引擎
   */
  start(eventBus: any, riskEngine: RiskEngine): void;
  
  /**
   * 停止风控引擎
   */
  stop(): void;
  
  /**
   * 获取统计信息
   */
  getStats(): OrchestratorStats;
}

/**
 * 编排器统计
 */
export interface OrchestratorStats {
  totalEvaluations: number;
  approvedCount: number;
  rejectedCount: number;
  modifiedCount: number;
  haltedCount: number;
  averageLatencyMs: number;
}

// ============================================================================
// 工具类型
// ============================================================================

/**
 * 规则配置基类
 */
export interface RiskRuleConfig {
  /** 规则ID */
  id?: string;
  
  /** 规则名称 */
  name?: string;
  
  /** 优先级 */
  priority?: number;
  
  /** 是否启用 */
  enabled?: boolean;
}
