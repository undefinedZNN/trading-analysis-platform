/**
 * Risk Engine - 风控引擎模块
 * 
 * 提供：
 * - 可插拔的风控规则框架
 * - 内置风控规则（订单规模、杠杆、盈亏限制、止损）
 * - 风控编排器（事件订阅与决策发布）
 * - 快照与恢复
 * 
 * @module risk
 */

// ============================================================================
// 核心接口
// ============================================================================

export type {
  // 决策类型
  RiskDecisionType,
  RiskSeverity,
  FollowUpActionType,
  
  // 风控决策
  RiskDecisionResult,
  RiskReason,
  FollowUpAction,
  
  // 风控规则
  RiskRule,
  RiskRuleContext,
  RiskRuntimeConfig,
  RiskRuleConfig,
  
  // 组合与仓位
  PortfolioSnapshot,
  PositionSnapshot,
  HistoricalStats,
  
  // 风控引擎
  RiskEngine,
  RiskState,
  RiskSnapshot,
  
  // 事件 Payload
  OrderIntentPayload,
  PortfolioUpdatePayload,
  ExecutionReportPayload,
  MarketBarEvent,
  RiskDecisionPayload,
  
  // 编排器
  RiskEngineOrchestrator,
  OrchestratorStats,
} from './interfaces';

// ============================================================================
// 核心实现
// ============================================================================

export { RiskEngineImpl, createRiskEngine, type RiskEngineConfig } from './engine';
export { RiskStateManager, createInitialRiskState, createEmptyPortfolio, createEmptyStats } from './state';
export { RiskEngineOrchestratorImpl, createRiskOrchestrator } from './orchestrator';

// ============================================================================
// 内置规则
// ============================================================================

export {
  MaxOrderSizeRule,
  type MaxOrderSizeParams,
  MaxLeverageRule,
  type MaxLeverageParams,
  PnLDailyLimitRule,
  type PnLDailyLimitParams,
  StopLossRule,
  type StopLossParams,
} from './rules';

