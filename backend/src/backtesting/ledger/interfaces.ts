/**
 * LedgerService 交易账簿服务接口定义
 * 
 * 提供：
 * - 交易记录
 * - PnL 计算
 * - 特征关联
 * - 结构化输出（Parquet/JSON）
 * 
 * @module ledger/interfaces
 */

// ============================================================================
// 核心类型定义
// ============================================================================

/**
 * 交易方向
 */
export type TradeSide = 'buy' | 'sell';

/**
 * 交易类型
 */
export type TradeType = 'open' | 'close' | 'adjust';

// ============================================================================
// 交易记录
// ============================================================================

/**
 * 交易记录
 */
export interface TradeRecord {
  /** 交易ID */
  tradeId: string;
  
  /** 会话ID */
  sessionId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 交易对 */
  symbol: string;
  
  /** 意图ID */
  intentId: string;
  
  /** 订单ID */
  orderId: string;
  
  /** 成交ID */
  fillId: string;
  
  /** 交易方向 */
  side: TradeSide;
  
  /** 交易类型 */
  type: TradeType;
  
  /** 成交数量 */
  quantity: string;
  
  /** 成交价格 */
  price: string;
  
  /** 已实现盈亏 */
  realizedPnl: string;
  
  /** 未实现盈亏 */
  unrealizedPnl: string;
  
  /** 手续费 */
  fees: string;
  
  /** 手续费币种 */
  feeCurrency: string;
  
  /** 流动性类型 */
  liquidity: 'maker' | 'taker';
  
  /** 时间戳 */
  timestamp: string;
  
  /** 序列号 */
  sequenceId: string;
  
  /** 仓位信息 */
  position?: {
    /** 持仓数量 */
    quantity: string;
    /** 平均入场价 */
    avgEntryPrice: string;
    /** 方向 */
    side: 'long' | 'short' | 'flat';
  };
  
  /** 特征快照 */
  features?: Record<string, number | string>;
  
  /** 额外上下文 */
  context?: Record<string, unknown>;
}

// ============================================================================
// 账簿服务
// ============================================================================

/**
 * 账簿服务接口
 */
export interface LedgerService {
  /**
   * 记录交易
   * @param trade 交易记录
   */
  recordTrade(trade: TradeRecord): Promise<void>;
  
  /**
   * 刷新缓冲区
   */
  flush(): Promise<void>;
  
  /**
   * 查询交易
   * @param filter 过滤条件
   */
  getTrades(filter?: TradeFilter): Promise<TradeRecord[]>;
  
  /**
   * 获取交易统计
   */
  getStats(): TradeStats;
  
  /**
   * 导出为 Parquet
   * @param outputPath 输出路径
   */
  exportToParquet(outputPath: string): Promise<void>;
  
  /**
   * 导出为 JSON
   * @param outputPath 输出路径
   */
  exportToJSON(outputPath: string): Promise<void>;
  
  /**
   * 导出为 CSV
   * @param outputPath 输出路径
   */
  exportToCSV(outputPath: string): Promise<void>;
  
  /**
   * 重置
   */
  reset(): void;
}

/**
 * 交易过滤器
 */
export interface TradeFilter {
  /** 策略ID */
  strategyId?: string;
  
  /** 交易对 */
  symbol?: string;
  
  /** 交易方向 */
  side?: TradeSide;
  
  /** 开始时间 */
  startTime?: string;
  
  /** 结束时间 */
  endTime?: string;
  
  /** 最小盈亏 */
  minPnl?: string;
  
  /** 最大盈亏 */
  maxPnl?: string;
}

/**
 * 交易统计
 */
export interface TradeStats {
  /** 总交易数 */
  totalTrades: number;
  
  /** 总盈亏 */
  totalPnl: string;
  
  /** 总手续费 */
  totalFees: string;
  
  /** 盈利交易数 */
  winningTrades: number;
  
  /** 亏损交易数 */
  losingTrades: number;
  
  /** 胜率 */
  winRate: number;
  
  /** 平均盈亏 */
  avgPnl: string;
  
  /** 平均盈利 */
  avgWin: string;
  
  /** 平均亏损 */
  avgLoss: string;
  
  /** 盈亏比 */
  profitFactor: number;
  
  /** 最大盈利 */
  maxWin: string;
  
  /** 最大亏损 */
  maxLoss: string;
  
  /** 最大回撤 */
  maxDrawdown: string;
  
  /** 夏普比率 */
  sharpeRatio?: number;
}

// ============================================================================
// PnL 计算引擎
// ============================================================================

/**
 * PnL 计算引擎接口
 */
export interface PnLCalculator {
  /**
   * 计算交易的 PnL
   * @param trade 交易信息
   * @param position 当前仓位
   * @returns PnL 信息
   */
  calculate(
    trade: {
      side: TradeSide;
      quantity: string;
      price: string;
      fees: string;
    },
    position?: {
      quantity: string;
      avgEntryPrice: string;
      side: 'long' | 'short' | 'flat';
    }
  ): PnLResult;
}

/**
 * PnL 计算结果
 */
export interface PnLResult {
  /** 已实现盈亏 */
  realizedPnl: string;
  
  /** 未实现盈亏 */
  unrealizedPnl: string;
  
  /** 新仓位 */
  newPosition: {
    quantity: string;
    avgEntryPrice: string;
    side: 'long' | 'short' | 'flat';
  };
}

// ============================================================================
// 账簿编排器
// ============================================================================

/**
 * 账簿服务编排器接口
 */
export interface LedgerServiceOrchestrator {
  /**
   * 启动编排器
   * @param eventBus 事件总线
   * @param ledgerService 账簿服务
   */
  start(eventBus: any, ledgerService: LedgerService): void;
  
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
  /** 处理的交易数 */
  processedTrades: number;
  
  /** 平均延迟（毫秒） */
  averageLatencyMs: number;
}

// ============================================================================
// 配置
// ============================================================================

/**
 * 账簿服务配置
 */
export interface LedgerServiceConfig {
  /** 会话ID */
  sessionId: string;
  
  /** 策略ID */
  strategyId: string;
  
  /** 输出目录 */
  outputDir?: string;
  
  /** 缓冲区大小 */
  bufferSize?: number;
  
  /** 是否自动刷新 */
  autoFlush?: boolean;
  
  /** PnL 计算器 */
  pnlCalculator?: PnLCalculator;
  
  /** 日志回调 */
  logger?: (level: string, message: string, meta?: Record<string, unknown>) => void;
}

// ============================================================================
// Parquet Schema
// ============================================================================

/**
 * Parquet Schema 定义
 */
export interface ParquetSchema {
  [key: string]: {
    type: string;
    optional?: boolean;
    repeated?: boolean;
  };
}

/**
 * 账簿 Parquet Schema
 */
export const LEDGER_PARQUET_SCHEMA: ParquetSchema = {
  trade_id: { type: 'UTF8' },
  session_id: { type: 'UTF8' },
  strategy_id: { type: 'UTF8' },
  symbol: { type: 'UTF8' },
  intent_id: { type: 'UTF8' },
  order_id: { type: 'UTF8' },
  fill_id: { type: 'UTF8' },
  side: { type: 'UTF8' },
  type: { type: 'UTF8' },
  quantity: { type: 'UTF8' },
  price: { type: 'UTF8' },
  realized_pnl: { type: 'UTF8' },
  unrealized_pnl: { type: 'UTF8' },
  fees: { type: 'UTF8' },
  fee_currency: { type: 'UTF8' },
  liquidity: { type: 'UTF8' },
  timestamp: { type: 'TIMESTAMP_MILLIS' },
  sequence_id: { type: 'UTF8' },
  
  // 仓位信息
  position_quantity: { type: 'UTF8', optional: true },
  position_avg_entry_price: { type: 'UTF8', optional: true },
  position_side: { type: 'UTF8', optional: true },
};

