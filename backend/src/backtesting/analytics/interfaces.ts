/**
 * Analytics模块接口定义
 * 
 * 提供回测结果的性能指标计算、结果收集和查询功能
 * 
 * @module analytics/interfaces
 */

import Big from 'big.js';
import type { TradeStats } from '../ledger/interfaces';

// ============================================================================
// 性能指标类型
// ============================================================================

/**
 * 时间序列数据点
 */
export interface TimeSeriesPoint {
  timestamp: string;
  value: string;
}

/**
 * 权益曲线
 */
export interface EquityCurve {
  timestamps: string[];
  equity: string[];
  drawdown: string[];
}

/**
 * 回报率统计
 */
export interface ReturnStats {
  /** 日收益率数组 */
  dailyReturns: number[];
  /** 累计收益率 */
  cumulativeReturn: number;
  /** 年化收益率 */
  annualizedReturn: number;
  /** 平均日收益率 */
  meanDailyReturn: number;
  /** 收益率标准差 */
  stdDevReturns: number;
  /** 正收益天数 */
  positiveDays: number;
  /** 负收益天数 */
  negativeDays: number;
}

/**
 * 回撤统计
 */
export interface DrawdownStats {
  /** 最大回撤 (百分比) */
  maxDrawdown: number;
  /** 最大回撤开始时间 */
  maxDrawdownStart: string;
  /** 最大回撤结束时间 */
  maxDrawdownEnd: string;
  /** 最大回撤持续天数 */
  maxDrawdownDuration: number;
  /** 当前回撤 */
  currentDrawdown: number;
  /** 回撤序列 */
  drawdownSeries?: TimeSeriesPoint[];
}

/**
 * 风险指标
 */
export interface RiskMetrics {
  /** Sharpe Ratio (夏普比率) */
  sharpeRatio: number;
  /** Sortino Ratio (索提诺比率) */
  sortinoRatio: number;
  /** Calmar Ratio (卡尔马比率) */
  calmarRatio: number;
  /** 下行波动率 */
  downsideDeviation: number;
  /** VaR (Value at Risk) 95% */
  var95: number;
  /** CVaR (Conditional VaR) 95% */
  cvar95: number;
  /** 最大回撤 */
  maxDrawdown: number;
  /** 波动率 (年化) */
  volatility: number;
}

/**
 * 交易指标
 */
export interface TradingMetrics {
  /** 总交易数 */
  totalTrades: number;
  /** 获胜交易数 */
  winningTrades: number;
  /** 亏损交易数 */
  losingTrades: number;
  /** 胜率 (%) */
  winRate: number;
  /** 总盈亏 */
  totalPnl: string;
  /** 平均盈亏 */
  avgPnl: string;
  /** 平均盈利 */
  avgWin: string;
  /** 平均亏损 */
  avgLoss: string;
  /** 盈亏比 */
  profitFactor: number;
  /** 最大单笔盈利 */
  maxWin: string;
  /** 最大单笔亏损 */
  maxLoss: string;
  /** 总手续费 */
  totalFees: string;
  /** 平均持仓时间 (分钟) */
  avgHoldingTime?: number;
}

/**
 * 完整性能指标
 */
export interface PerformanceMetrics {
  /** 交易指标 */
  trading: TradingMetrics;
  /** 风险指标 */
  risk: RiskMetrics;
  /** 回报率统计 */
  returns: ReturnStats;
  /** 回撤统计 */
  drawdown: DrawdownStats;
}

// ============================================================================
// 会话结果
// ============================================================================

/**
 * 会话配置概要
 */
export interface SessionConfigSummary {
  sessionId: string;
  strategyId: string;
  strategyName?: string;
  symbols: string[];
  timeframe: string;
  startTime: string;
  endTime: string;
  initialCapital: string;
}

/**
 * 会话结果
 */
export interface SessionResults {
  /** 会话ID */
  sessionId: string;
  
  /** 配置概要 */
  config: SessionConfigSummary;
  
  /** 性能指标 */
  metrics: PerformanceMetrics;
  
  /** 权益曲线 */
  equityCurve: EquityCurve;
  
  /** 文件路径 */
  files: {
    /** 账簿文件路径 (Parquet) */
    ledger: string;
    /** 特征目录文件路径 (JSON) */
    featureCatalog: string;
    /** 日志文件路径 */
    logs: string;
    /** 完整结果文件路径 (JSON) */
    fullResults: string;
  };
  
  /** 创建时间 */
  createdAt: string;
  
  /** 完成时间 */
  completedAt: string;
  
  /** 状态 */
  status: 'completed' | 'failed' | 'partial';
  
  /** 错误信息 (如果有) */
  error?: string;
}

// ============================================================================
// 服务接口
// ============================================================================

/**
 * 性能指标计算器接口
 */
export interface PerformanceCalculator {
  /**
   * 计算完整性能指标
   * @param equityCurve 权益曲线
   * @param tradeStats 交易统计
   * @param config 计算配置
   */
  calculate(
    equityCurve: EquityCurve,
    tradeStats: TradeStats,
    config?: PerformanceCalculatorConfig
  ): PerformanceMetrics;
  
  /**
   * 计算Sharpe Ratio
   * @param returns 收益率序列
   * @param riskFreeRate 无风险收益率 (年化)
   */
  calculateSharpeRatio(returns: number[], riskFreeRate?: number): number;
  
  /**
   * 计算Sortino Ratio
   * @param returns 收益率序列
   * @param targetReturn 目标收益率
   */
  calculateSortinoRatio(returns: number[], targetReturn?: number): number;
  
  /**
   * 计算最大回撤
   * @param equityCurve 权益曲线
   */
  calculateMaxDrawdown(equityCurve: EquityCurve): DrawdownStats;
  
  /**
   * 计算收益率统计
   * @param equityCurve 权益曲线
   */
  calculateReturnStats(equityCurve: EquityCurve): ReturnStats;
}

/**
 * 性能计算器配置
 */
export interface PerformanceCalculatorConfig {
  /** 无风险收益率 (年化) */
  riskFreeRate?: number;
  /** 目标收益率 (用于Sortino) */
  targetReturn?: number;
  /** 交易日数 (默认252) */
  tradingDaysPerYear?: number;
  /** 是否计算详细回撤序列 */
  includeDrawdownSeries?: boolean;
}

/**
 * 结果收集器接口
 */
export interface ResultCollector {
  /**
   * 收集会话结果
   * @param sessionId 会话ID
   */
  collectResults(sessionId: string): Promise<SessionResults>;
  
  /**
   * 导出结果到文件
   * @param sessionId 会话ID
   * @param format 导出格式
   * @param outputPath 输出路径
   */
  exportResults(
    sessionId: string,
    format: 'json' | 'parquet' | 'csv',
    outputPath: string
  ): Promise<void>;
}

/**
 * 结果管理器接口
 */
export interface ResultsManager {
  /**
   * 获取会话结果
   * @param sessionId 会话ID
   */
  getSessionResults(sessionId: string): Promise<SessionResults | null>;
  
  /**
   * 列出所有会话结果
   */
  listSessionResults(): Promise<SessionResults[]>;
  
  /**
   * 删除会话结果
   * @param sessionId 会话ID
   */
  deleteSessionResults(sessionId: string): Promise<boolean>;
  
  /**
   * 获取会话指标
   * @param sessionId 会话ID
   */
  getSessionMetrics(sessionId: string): Promise<PerformanceMetrics | null>;
  
  /**
   * 获取权益曲线
   * @param sessionId 会话ID
   */
  getEquityCurve(sessionId: string): Promise<EquityCurve | null>;
}

// ============================================================================
// 错误类型
// ============================================================================

/**
 * Analytics错误基类
 */
export class AnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

/**
 * 会话结果未找到错误
 */
export class SessionResultsNotFoundError extends AnalyticsError {
  constructor(sessionId: string) {
    super(`Session results not found: ${sessionId}`);
    this.name = 'SessionResultsNotFoundError';
  }
}

/**
 * 指标计算错误
 */
export class MetricsCalculationError extends AnalyticsError {
  constructor(message: string, cause?: Error) {
    super(`Metrics calculation error: ${message}`);
    this.name = 'MetricsCalculationError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * 结果导出错误
 */
export class ResultExportError extends AnalyticsError {
  constructor(message: string, cause?: Error) {
    super(`Result export error: ${message}`);
    this.name = 'ResultExportError';
    if (cause) {
      this.cause = cause;
    }
  }
}

