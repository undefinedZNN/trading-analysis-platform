/**
 * ExecutionEngine 执行撮合引擎接口定义
 * 
 * 提供：
 * - 订单生命周期管理
 * - 撮合逻辑（市价、限价、止损）
 * - 滑点和手续费模拟
 * - TIF 支持（GTC/IOC/FOK）
 * - 快照恢复
 * 
 * @module execution/interfaces
 */

import Big from 'big.js';
import { Observable } from 'rxjs';

// ============================================================================
// 核心类型定义
// ============================================================================

/**
 * 订单状态
 */
export type OrderStatus =
  | 'pending'           // 待处理
  | 'new'               // 新建
  | 'partially_filled'  // 部分成交
  | 'filled'            // 完全成交
  | 'cancelled'         // 已取消
  | 'rejected'          // 已拒绝
  | 'expired';          // 已过期

/**
 * 订单类型
 */
export type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit';

/**
 * 订单方向
 */
export type OrderSide = 'buy' | 'sell';

/**
 * 时间有效性
 */
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';
// GTC: Good-Til-Cancelled 一直有效直到取消
// IOC: Immediate-Or-Cancel 立即成交否则取消
// FOK: Fill-Or-Kill 全部成交否则取消

/**
 * 流动性类型
 */
export type LiquidityType = 'maker' | 'taker';

// ============================================================================
// 订单相关
// ============================================================================

/**
 * 订单条目
 */
export interface OrderEntry {
  /** 订单ID */
  orderId: string;
  
  /** 意图ID（来自策略） */
  intentId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 交易对 */
  symbol: string;
  
  /** 方向 */
  side: OrderSide;
  
  /** 订单类型 */
  type: OrderType;
  
  /** 时间有效性 */
  tif: TimeInForce;
  
  /** 限价（限价单/止损限价单） */
  limitPrice?: string;
  
  /** 止损价（止损单/止损限价单） */
  stopPrice?: string;
  
  /** 订单数量 */
  quantity: string;
  
  /** 剩余数量 */
  remaining: string;
  
  /** 创建时间 */
  createdAt: string;
  
  /** 更新时间 */
  updatedAt?: string;
  
  /** 订单状态 */
  status: OrderStatus;
  
  /** 成交记录 */
  fills: ExecutionFill[];
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 成交记录
 */
export interface ExecutionFill {
  /** 成交ID */
  fillId: string;
  
  /** 成交数量 */
  quantity: string;
  
  /** 成交价格 */
  price: string;
  
  /** 手续费 */
  fee?: FeeAmount;
  
  /** 流动性类型 */
  liquidity: LiquidityType;
  
  /** 成交时间 */
  timestamp: string;
}

/**
 * 手续费金额
 */
export interface FeeAmount {
  /** 手续费金额 */
  amount: string;
  
  /** 手续费币种 */
  asset: string;
}

// ============================================================================
// 执行引擎
// ============================================================================

/**
 * 执行引擎接口
 */
export interface ExecutionEngine {
  /**
   * 提交订单
   * @param intent 订单意图
   * @returns 订单ID
   */
  submit(intent: OrderIntentPayload): Promise<string>;
  
  /**
   * 取消订单
   * @param orderId 订单ID
   * @param reason 取消原因
   */
  cancel(orderId: string, reason?: string): Promise<void>;
  
  /**
   * 处理行情（触发撮合）
   * @param bars 行情数据
   */
  processBars(bars: BarEvent[]): Promise<void>;
  
  /**
   * 查询订单
   * @param orderId 订单ID
   */
  getOrder(orderId: string): OrderEntry | undefined;
  
  /**
   * 获取活跃订单
   */
  getActiveOrders(): OrderEntry[];
  
  /**
   * 获取所有订单
   */
  getAllOrders(): OrderEntry[];
  
  /**
   * 获取统计信息
   */
  getStats(): ExecutionStats;
  
  /**
   * 创建快照
   */
  createSnapshot(): ExecutionSnapshot;
  
  /**
   * 恢复快照
   * @param snapshot 快照数据
   */
  restoreSnapshot(snapshot: ExecutionSnapshot): void;
  
  /**
   * 重置
   */
  reset(): void;
}

/**
 * 执行引擎统计
 */
export interface ExecutionStats {
  /** 总订单数 */
  totalOrders: number;
  
  /** 已成交订单数 */
  filledOrders: number;
  
  /** 已取消订单数 */
  cancelledOrders: number;
  
  /** 总成交量 */
  totalVolume: string;
  
  /** 总手续费 */
  totalFees: string;
  
  /** 平均滑点（基点） */
  avgSlippageBps: number;
}

/**
 * 执行引擎快照
 */
export interface ExecutionSnapshot {
  /** 快照ID */
  snapshotId: string;
  
  /** 会话ID */
  sessionId: string;
  
  /** 所有订单 */
  orders: OrderEntry[];
  
  /** 活跃订单ID */
  activeOrderIds: string[];
  
  /** 统计信息 */
  stats: ExecutionStats;
  
  /** 快照时间 */
  timestamp: string;
}

// ============================================================================
// 撮合引擎
// ============================================================================

/**
 * 撮合结果
 */
export interface MatchResult {
  /** 成交数量 */
  fillQuantity: string;
  
  /** 成交价格 */
  fillPrice: string;
  
  /** 流动性类型 */
  liquidity: LiquidityType;
  
  /** 成交时间 */
  timestamp: string;
}

/**
 * 撮合引擎接口
 */
export interface MatchingEngine {
  /**
   * 尝试撮合
   * @param order 订单
   * @param bar 行情
   * @returns 撮合结果，null 表示未触及
   */
  match(order: OrderEntry, bar: BarEvent): MatchResult | null;
}

// ============================================================================
// 滑点模型
// ============================================================================

/**
 * 滑点输入
 */
export interface SlippageInput {
  /** 基础价格 */
  basePrice: string;
  
  /** 订单方向 */
  side: OrderSide;
  
  /** 订单数量 */
  quantity: string;
  
  /** 流动性类型 */
  liquidity: LiquidityType;
  
  /** 市场深度（可选） */
  marketDepth?: string;
}

/**
 * 滑点模型接口
 */
export interface SlippageModel {
  /**
   * 应用滑点
   * @param input 滑点输入
   * @returns 调整后的价格
   */
  apply(input: SlippageInput): string;
  
  /**
   * 获取模型名称
   */
  getName(): string;
}

// ============================================================================
// 手续费模型
// ============================================================================

/**
 * 手续费输入
 */
export interface FeeInput {
  /** 价格 */
  price: string;
  
  /** 数量 */
  quantity: string;
  
  /** 订单方向 */
  side: OrderSide;
  
  /** 流动性类型 */
  liquidity: LiquidityType;
  
  /** 交易对（可选） */
  symbol?: string;
}

/**
 * 手续费模型接口
 */
export interface FeeModel {
  /**
   * 计算手续费
   * @param input 手续费输入
   * @returns 手续费金额
   */
  compute(input: FeeInput): FeeAmount;
  
  /**
   * 获取模型名称
   */
  getName(): string;
}

// ============================================================================
// 仓位管理
// ============================================================================

/**
 * 仓位快照
 */
export interface PositionSnapshot {
  /** 交易对 */
  symbol: string;
  
  /** 方向 */
  side: 'long' | 'short' | 'flat';
  
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

/**
 * 组合快照
 */
export interface PortfolioSnapshot {
  /** 策略ID */
  strategyId: string;
  
  /** 现金余额 */
  balances: Record<string, string>;
  
  /** 持仓信息 */
  positions: Record<string, PositionSnapshot>;
  
  /** 总权益 */
  equity: string;
  
  /** 保证金使用 */
  marginUsage: string;
  
  /** 快照时间 */
  timestamp: string;
}

/**
 * 仓位存储接口
 */
export interface PortfolioStore {
  /**
   * 获取仓位
   */
  getPosition(strategyId: string, symbol: string): PositionSnapshot | undefined;
  
  /**
   * 更新仓位
   */
  updatePosition(strategyId: string, position: PositionSnapshot): void;
  
  /**
   * 获取组合快照
   */
  getPortfolio(strategyId: string): PortfolioSnapshot | undefined;
  
  /**
   * 获取所有仓位
   */
  getAllPositions(strategyId: string): PositionSnapshot[];
}

// ============================================================================
// 事件 Payload 定义
// ============================================================================

/**
 * 订单意图 Payload（来自风控决策）
 */
export interface OrderIntentPayload {
  /** 客户端订单ID */
  clientOrderId?: string;
  
  /** 意图ID */
  intentId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 交易对 */
  symbol: string;
  
  /** 方向 */
  side: OrderSide;
  
  /** 订单类型 */
  type: OrderType;
  
  /** 数量 */
  quantity: string;
  
  /** 价格（限价单/止损限价单） */
  price?: string;
  
  /** 止损价（止损单/止损限价单） */
  stopPrice?: string;
  
  /** 时间有效性 */
  tif?: TimeInForce;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 执行回报 Payload
 */
export interface ExecutionReportPayload {
  /** 订单ID */
  orderId: string;
  
  /** 意图ID */
  intentId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 交易对 */
  symbol: string;
  
  /** 方向 */
  side: OrderSide;
  
  /** 订单状态 */
  status: OrderStatus;
  
  /** 订单数量 */
  quantity: string;
  
  /** 剩余数量 */
  remaining: string;
  
  /** 已成交数量 */
  filledQty: string;
  
  /** 平均成交价 */
  avgFillPrice: string;
  
  /** 最后成交（如果有） */
  lastFill?: ExecutionFill;
  
  /** 手续费总计 */
  totalFee: string;
  
  /** 手续费币种 */
  feeCurrency: string;
  
  /** 时间戳 */
  timestamp: string;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 行情事件
 */
export interface BarEvent {
  /** 交易对 */
  symbol: string;
  
  /** 时间戳 */
  timestamp: string;
  
  /** 开盘价 */
  open: string;
  
  /** 最高价 */
  high: string;
  
  /** 最低价 */
  low: string;
  
  /** 收盘价 */
  close: string;
  
  /** 成交量 */
  volume: string;
}

/**
 * 组合更新 Payload
 */
export interface PortfolioUpdatePayload {
  /** 策略ID */
  strategyId: string;
  
  /** 现金余额 */
  balances: Record<string, string>;
  
  /** 持仓列表 */
  positions: Array<{
    symbol: string;
    side: 'long' | 'short' | 'flat';
    quantity: string;
    avgEntryPrice: string;
    unrealizedPnl: string;
    realizedPnl: string;
  }>;
  
  /** 总权益 */
  equity: string;
  
  /** 保证金使用 */
  marginUsage?: string;
  
  /** 时间戳 */
  timestamp: string;
}

// ============================================================================
// 执行引擎编排器
// ============================================================================

/**
 * 执行引擎编排器接口
 */
export interface ExecutionEngineOrchestrator {
  /**
   * 启动编排器
   * @param eventBus 事件总线
   * @param executionEngine 执行引擎
   */
  start(eventBus: any, executionEngine: ExecutionEngine): void;
  
  /**
   * 停止编排器
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
  /** 处理的订单数 */
  processedOrders: number;
  
  /** 处理的行情数 */
  processedBars: number;
  
  /** 平均延迟（毫秒） */
  averageLatencyMs: number;
}

// ============================================================================
// 配置
// ============================================================================

/**
 * 执行引擎配置
 */
export interface ExecutionEngineConfig {
  /** 会话ID */
  sessionId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 滑点模型 */
  slippageModel?: SlippageModel;
  
  /** 手续费模型 */
  feeModel?: FeeModel;
  
  /** 市价单成交策略 */
  marketFillPolicy?: 'open' | 'close' | 'mid';
  
  /** 是否启用仓位追踪 */
  trackPositions?: boolean;
  
  /** 日志回调 */
  logger?: (level: string, message: string, meta?: Record<string, unknown>) => void;
}

