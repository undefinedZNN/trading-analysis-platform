/**
 * Execution Engine - 执行撮合引擎模块
 * 
 * 提供：
 * - 订单生命周期管理
 * - 撮合逻辑（市价、限价、止损）
 * - 滑点和手续费模拟
 * - TIF 支持（GTC/IOC/FOK）
 * - 仓位管理
 * - 快照恢复
 * 
 * @module execution
 */

// ============================================================================
// 核心接口
// ============================================================================

export type {
  // 订单相关
  OrderStatus,
  OrderType,
  OrderSide,
  TimeInForce,
  LiquidityType,
  OrderEntry,
  ExecutionFill,
  FeeAmount,
  
  // 执行引擎
  ExecutionEngine,
  ExecutionStats,
  ExecutionSnapshot,
  ExecutionEngineConfig,
  
  // 撮合引擎
  MatchResult,
  MatchingEngine,
  
  // 滑点模型
  SlippageInput,
  SlippageModel,
  
  // 手续费模型
  FeeInput,
  FeeModel,
  
  // 仓位管理
  PositionSnapshot,
  PortfolioSnapshot,
  PortfolioStore,
  
  // 事件 Payload
  OrderIntentPayload,
  ExecutionReportPayload,
  BarEvent,
  PortfolioUpdatePayload,
  
  // 编排器
  ExecutionEngineOrchestrator,
  OrchestratorStats,
} from './interfaces';

// ============================================================================
// 核心实现
// ============================================================================

export { ExecutionEngineImpl, createExecutionEngine } from './engine';
export { SimplePortfolioStore } from './portfolio-store';
export { ExecutionEngineOrchestratorImpl, createExecutionOrchestrator } from './orchestrator';

// ============================================================================
// 撮合器
// ============================================================================

export {
  MarketOrderMatcher,
  type MarketFillPolicy,
  LimitOrderMatcher,
  StopOrderMatcher,
} from './matchers';

// ============================================================================
// 滑点和手续费模型
// ============================================================================

export {
  ZeroSlippageModel,
  FixedSpreadSlippage,
  ProportionalSlippage,
  MarketImpactSlippage,
  ZeroFeeModel,
  FixedRateFeeModel,
  TieredFeeModel,
} from './models';

