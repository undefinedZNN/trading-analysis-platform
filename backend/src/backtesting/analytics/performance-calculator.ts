/**
 * 性能指标计算器
 * 
 * 计算回测结果的各项性能指标
 * 
 * @module analytics/performance-calculator
 */

import Big from 'big.js';
import type {
  PerformanceCalculator,
  PerformanceCalculatorConfig,
  PerformanceMetrics,
  ReturnStats,
  DrawdownStats,
  RiskMetrics,
  TradingMetrics,
  EquityCurve,
  TimeSeriesPoint,
} from './interfaces';
import type { TradeStats } from '../ledger/interfaces';
import {
  mean,
  stdDev,
  downsideDeviation,
  percentile,
  cumulativeReturn as calcCumulativeReturn,
  annualizedReturn as calcAnnualizedReturn,
  annualizedVolatility,
  sharpeRatio as calcSharpeRatio,
  sortinoRatio as calcSortinoRatio,
  maxDrawdown as calcMaxDrawdown,
  calmarRatio as calcCalmarRatio,
  valueAtRisk,
  conditionalValueAtRisk,
  drawdownSeries as calcDrawdownSeries,
  calculateReturns,
  countPositiveNegativeDays,
} from './metrics-helpers';
import { MetricsCalculationError } from './interfaces';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<PerformanceCalculatorConfig> = {
  riskFreeRate: 0.02, // 2%年化无风险收益率
  targetReturn: 0,
  tradingDaysPerYear: 252,
  includeDrawdownSeries: false,
};

/**
 * 性能指标计算器实现
 */
export class PerformanceCalculatorImpl implements PerformanceCalculator {
  private config: Required<PerformanceCalculatorConfig>;

  constructor(config?: PerformanceCalculatorConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * 计算完整性能指标
   */
  calculate(
    equityCurve: EquityCurve,
    tradeStats: TradeStats,
    config?: PerformanceCalculatorConfig
  ): PerformanceMetrics {
    const calcConfig = { ...this.config, ...config };

    try {
      // 转换权益曲线为数值数组
      const equityValues = equityCurve.equity.map(v => parseFloat(v));

      // 计算收益率统计
      const returnStats = this.calculateReturnStats(equityCurve);

      // 计算回撤统计
      const drawdownStats = this.calculateMaxDrawdown(equityCurve);

      // 计算风险指标
      const riskMetrics = this.calculateRiskMetrics(
        returnStats.dailyReturns,
        drawdownStats.maxDrawdown,
        returnStats.annualizedReturn,
        calcConfig
      );

      // 组装交易指标
      const tradingMetrics: TradingMetrics = {
        totalTrades: tradeStats.totalTrades,
        winningTrades: tradeStats.winningTrades,
        losingTrades: tradeStats.losingTrades,
        winRate: tradeStats.winRate,
        totalPnl: tradeStats.totalPnl,
        avgPnl: tradeStats.avgPnl,
        avgWin: tradeStats.avgWin,
        avgLoss: tradeStats.avgLoss,
        profitFactor: tradeStats.profitFactor,
        maxWin: tradeStats.maxWin,
        maxLoss: tradeStats.maxLoss,
        totalFees: tradeStats.totalFees,
      };

      return {
        trading: tradingMetrics,
        risk: riskMetrics,
        returns: returnStats,
        drawdown: drawdownStats,
      };
    } catch (error) {
      throw new MetricsCalculationError(
        `Failed to calculate performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 计算Sharpe Ratio
   */
  calculateSharpeRatio(returns: number[], riskFreeRate?: number): number {
    try {
      const rate = riskFreeRate ?? this.config.riskFreeRate;
      return calcSharpeRatio(returns, rate, this.config.tradingDaysPerYear);
    } catch (error) {
      throw new MetricsCalculationError(
        `Failed to calculate Sharpe Ratio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 计算Sortino Ratio
   */
  calculateSortinoRatio(returns: number[], targetReturn?: number): number {
    try {
      const target = targetReturn ?? this.config.targetReturn;
      return calcSortinoRatio(returns, target, this.config.tradingDaysPerYear);
    } catch (error) {
      throw new MetricsCalculationError(
        `Failed to calculate Sortino Ratio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 计算最大回撤
   */
  calculateMaxDrawdown(equityCurve: EquityCurve): DrawdownStats {
    try {
      const equityValues = equityCurve.equity.map(v => parseFloat(v));
      const timestamps = equityCurve.timestamps;

      const result = calcMaxDrawdown(equityValues);

      const stats: DrawdownStats = {
        maxDrawdown: result.maxDrawdownPercent,
        maxDrawdownStart: result.startIndex >= 0 ? timestamps[result.startIndex] : '',
        maxDrawdownEnd: result.endIndex >= 0 ? timestamps[result.endIndex] : '',
        maxDrawdownDuration: result.duration,
        currentDrawdown: this.calculateCurrentDrawdown(equityValues),
      };

      // 可选：包含回撤序列
      if (this.config.includeDrawdownSeries) {
        const drawdowns = calcDrawdownSeries(equityValues);
        stats.drawdownSeries = drawdowns.map((dd, i) => ({
          timestamp: timestamps[i] || '',
          value: dd.toString(),
        }));
      }

      return stats;
    } catch (error) {
      throw new MetricsCalculationError(
        `Failed to calculate max drawdown: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 计算收益率统计
   */
  calculateReturnStats(equityCurve: EquityCurve): ReturnStats {
    try {
      const equityValues = equityCurve.equity.map(v => parseFloat(v));

      if (equityValues.length < 2) {
        return {
          dailyReturns: [],
          cumulativeReturn: 0,
          annualizedReturn: 0,
          meanDailyReturn: 0,
          stdDevReturns: 0,
          positiveDays: 0,
          negativeDays: 0,
        };
      }

      // 计算日收益率
      const dailyReturns = calculateReturns(equityValues);

      // 累计收益率
      const cumReturn = calcCumulativeReturn(dailyReturns);

      // 年化收益率
      const annReturn = calcAnnualizedReturn(
        cumReturn,
        dailyReturns.length,
        this.config.tradingDaysPerYear
      );

      // 平均日收益率
      const meanReturn = mean(dailyReturns);

      // 收益率标准差
      const stdDevReturn = stdDev(dailyReturns);

      // 统计正负天数
      const { positive, negative } = countPositiveNegativeDays(dailyReturns);

      return {
        dailyReturns,
        cumulativeReturn: cumReturn,
        annualizedReturn: annReturn,
        meanDailyReturn: meanReturn,
        stdDevReturns: stdDevReturn,
        positiveDays: positive,
        negativeDays: negative,
      };
    } catch (error) {
      throw new MetricsCalculationError(
        `Failed to calculate return stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 计算风险指标
   */
  private calculateRiskMetrics(
    returns: number[],
    maxDrawdownPercent: number,
    annualizedReturnValue: number,
    config: Required<PerformanceCalculatorConfig>
  ): RiskMetrics {
    try {
      // Sharpe Ratio
      const sharpe = calcSharpeRatio(returns, config.riskFreeRate, config.tradingDaysPerYear);

      // Sortino Ratio
      const sortino = calcSortinoRatio(returns, config.targetReturn, config.tradingDaysPerYear);

      // Calmar Ratio
      const calmar = calcCalmarRatio(annualizedReturnValue, maxDrawdownPercent);

      // 下行波动率
      const downDev = downsideDeviation(returns, config.targetReturn);
      const annualizedDownDev = downDev * Math.sqrt(config.tradingDaysPerYear);

      // VaR和CVaR
      const var95 = valueAtRisk(returns, 0.95);
      const cvar95 = conditionalValueAtRisk(returns, 0.95);

      // 波动率（年化）
      const volatility = annualizedVolatility(returns, config.tradingDaysPerYear);

      return {
        sharpeRatio: sharpe,
        sortinoRatio: sortino,
        calmarRatio: calmar,
        downsideDeviation: annualizedDownDev,
        var95,
        cvar95,
        maxDrawdown: maxDrawdownPercent,
        volatility,
      };
    } catch (error) {
      throw new MetricsCalculationError(
        `Failed to calculate risk metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 计算当前回撤
   */
  private calculateCurrentDrawdown(equityValues: number[]): number {
    if (equityValues.length === 0) return 0;

    // 找到历史最高点
    const peak = Math.max(...equityValues);
    const current = equityValues[equityValues.length - 1];

    if (peak === 0) return 0;

    return (peak - current) / peak;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PerformanceCalculatorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<PerformanceCalculatorConfig> {
    return { ...this.config };
  }
}

/**
 * 创建性能计算器实例
 */
export function createPerformanceCalculator(
  config?: PerformanceCalculatorConfig
): PerformanceCalculator {
  return new PerformanceCalculatorImpl(config);
}

