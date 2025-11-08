/**
 * 性能指标计算辅助函数
 * 
 * 提供各种统计和数学计算工具
 * 
 * @module analytics/metrics-helpers
 */

/**
 * 计算平均值
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * 计算标准差
 */
export function stdDev(values: number[], isSample: boolean = true): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return 0;
  
  const avg = mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / 
    (isSample ? values.length - 1 : values.length);
  
  return Math.sqrt(variance);
}

/**
 * 计算下行标准差 (Downside Deviation)
 * 只计算低于目标收益率的收益的标准差
 */
export function downsideDeviation(returns: number[], targetReturn: number = 0): number {
  if (returns.length === 0) return 0;
  
  const downsideReturns = returns
    .map(r => Math.min(r - targetReturn, 0))
    .map(r => r * r);
  
  const avgSquaredDownside = downsideReturns.reduce((sum, val) => sum + val, 0) / returns.length;
  
  return Math.sqrt(avgSquaredDownside);
}

/**
 * 计算百分位数
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (p < 0 || p > 100) {
    throw new Error('Percentile must be between 0 and 100');
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  if (lower === upper) {
    return sorted[lower];
  }
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * 计算累计收益率
 * @param returns 收益率序列
 * @returns 累计收益率 (例如: 0.15 表示 15%)
 */
export function cumulativeReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  
  // 使用复利公式: (1+r1)*(1+r2)*...*(1+rn) - 1
  return returns.reduce((cumulative, r) => cumulative * (1 + r), 1) - 1;
}

/**
 * 年化收益率
 * @param cumulativeReturn 累计收益率
 * @param days 天数
 * @param tradingDaysPerYear 每年交易日数 (默认252)
 */
export function annualizedReturn(
  cumulativeReturn: number,
  days: number,
  tradingDaysPerYear: number = 252
): number {
  if (days === 0) return 0;
  
  const years = days / tradingDaysPerYear;
  return Math.pow(1 + cumulativeReturn, 1 / years) - 1;
}

/**
 * 年化波动率
 * @param returns 日收益率序列
 * @param tradingDaysPerYear 每年交易日数
 */
export function annualizedVolatility(
  returns: number[],
  tradingDaysPerYear: number = 252
): number {
  if (returns.length === 0) return 0;
  
  const dailyStdDev = stdDev(returns);
  return dailyStdDev * Math.sqrt(tradingDaysPerYear);
}

/**
 * Sharpe Ratio (夏普比率)
 * 衡量每单位风险的超额收益
 * 
 * @param returns 收益率序列
 * @param riskFreeRate 无风险收益率 (年化)
 * @param tradingDaysPerYear 每年交易日数
 */
export function sharpeRatio(
  returns: number[],
  riskFreeRate: number = 0,
  tradingDaysPerYear: number = 252
): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = mean(returns);
  const stdDeviation = stdDev(returns);
  
  if (stdDeviation === 0) return 0;
  
  // 日无风险收益率
  const dailyRiskFreeRate = Math.pow(1 + riskFreeRate, 1 / tradingDaysPerYear) - 1;
  
  // Sharpe = (平均收益 - 无风险收益) / 标准差 * sqrt(252)
  const excessReturn = avgReturn - dailyRiskFreeRate;
  return (excessReturn / stdDeviation) * Math.sqrt(tradingDaysPerYear);
}

/**
 * Sortino Ratio (索提诺比率)
 * 类似Sharpe，但只考虑下行风险
 * 
 * @param returns 收益率序列
 * @param targetReturn 目标收益率 (默认0)
 * @param tradingDaysPerYear 每年交易日数
 */
export function sortinoRatio(
  returns: number[],
  targetReturn: number = 0,
  tradingDaysPerYear: number = 252
): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = mean(returns);
  const downDev = downsideDeviation(returns, targetReturn);
  
  if (downDev === 0) return 0;
  
  // Sortino = (平均收益 - 目标收益) / 下行标准差 * sqrt(252)
  const excessReturn = avgReturn - targetReturn;
  return (excessReturn / downDev) * Math.sqrt(tradingDaysPerYear);
}

/**
 * 计算最大回撤
 * @param equityValues 权益值序列
 * @returns { maxDrawdown, start, end, duration }
 */
export function maxDrawdown(equityValues: number[]): {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  startIndex: number;
  endIndex: number;
  duration: number;
  peakValue: number;
  troughValue: number;
} {
  if (equityValues.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      startIndex: -1,
      endIndex: -1,
      duration: 0,
      peakValue: 0,
      troughValue: 0,
    };
  }
  
  let maxDD = 0;
  let maxDDPercent = 0;
  let peak = equityValues[0];
  let peakIndex = 0;
  let startIndex = -1;
  let endIndex = -1;
  let peakValue = 0;
  let troughValue = 0;
  
  for (let i = 0; i < equityValues.length; i++) {
    const value = equityValues[i];
    
    // 更新峰值
    if (value > peak) {
      peak = value;
      peakIndex = i;
    }
    
    // 计算当前回撤
    const drawdown = peak - value;
    const drawdownPercent = peak > 0 ? drawdown / peak : 0;
    
    // 更新最大回撤
    if (drawdownPercent > maxDDPercent) {
      maxDD = drawdown;
      maxDDPercent = drawdownPercent;
      startIndex = peakIndex;
      endIndex = i;
      peakValue = peak;
      troughValue = value;
    }
  }
  
  return {
    maxDrawdown: maxDD,
    maxDrawdownPercent: maxDDPercent,
    startIndex,
    endIndex,
    duration: startIndex >= 0 ? endIndex - startIndex : 0,
    peakValue,
    troughValue,
  };
}

/**
 * Calmar Ratio (卡尔马比率)
 * 年化收益率 / 最大回撤
 * 
 * @param annualizedReturn 年化收益率
 * @param maxDrawdownPercent 最大回撤百分比
 */
export function calmarRatio(
  annualizedReturn: number,
  maxDrawdownPercent: number
): number {
  if (maxDrawdownPercent === 0) return 0;
  return annualizedReturn / maxDrawdownPercent;
}

/**
 * VaR (Value at Risk) - 风险价值
 * 在给定置信水平下，预期的最大损失
 * 
 * @param returns 收益率序列
 * @param confidenceLevel 置信水平 (例如: 0.95)
 */
export function valueAtRisk(returns: number[], confidenceLevel: number = 0.95): number {
  if (returns.length === 0) return 0;
  
  const percentileLevel = (1 - confidenceLevel) * 100;
  return -percentile(returns, percentileLevel);
}

/**
 * CVaR (Conditional VaR) - 条件风险价值
 * 也称为Expected Shortfall，是VaR基础上的改进
 * 
 * @param returns 收益率序列
 * @param confidenceLevel 置信水平
 */
export function conditionalValueAtRisk(
  returns: number[],
  confidenceLevel: number = 0.95
): number {
  if (returns.length === 0) return 0;
  
  const var95 = valueAtRisk(returns, confidenceLevel);
  
  // CVaR是所有损失超过VaR的收益的平均值
  const tailLosses = returns.filter(r => r < -var95);
  
  if (tailLosses.length === 0) return var95;
  
  return -mean(tailLosses);
}

/**
 * 计算回撤序列
 * @param equityValues 权益值序列
 * @returns 回撤百分比序列
 */
export function drawdownSeries(equityValues: number[]): number[] {
  if (equityValues.length === 0) return [];
  
  const drawdowns: number[] = [];
  let peak = equityValues[0];
  
  for (const value of equityValues) {
    if (value > peak) {
      peak = value;
    }
    
    const drawdown = peak > 0 ? (peak - value) / peak : 0;
    drawdowns.push(drawdown);
  }
  
  return drawdowns;
}

/**
 * 计算收益率序列（从权益曲线）
 * @param equityValues 权益值序列
 * @returns 收益率序列
 */
export function calculateReturns(equityValues: number[]): number[] {
  if (equityValues.length < 2) return [];
  
  const returns: number[] = [];
  
  for (let i = 1; i < equityValues.length; i++) {
    const prevValue = equityValues[i - 1];
    const currentValue = equityValues[i];
    
    if (prevValue === 0) {
      returns.push(0);
    } else {
      returns.push((currentValue - prevValue) / prevValue);
    }
  }
  
  return returns;
}

/**
 * 计算盈亏比 (Profit Factor)
 * 总盈利 / 总亏损
 */
export function profitFactor(trades: Array<{ pnl: number }>): number {
  let totalProfit = 0;
  let totalLoss = 0;
  
  for (const trade of trades) {
    if (trade.pnl > 0) {
      totalProfit += trade.pnl;
    } else if (trade.pnl < 0) {
      totalLoss += Math.abs(trade.pnl);
    }
  }
  
  if (totalLoss === 0) {
    return totalProfit > 0 ? Infinity : 0;
  }
  
  return totalProfit / totalLoss;
}

/**
 * 计算胜率
 */
export function winRate(trades: Array<{ pnl: number }>): number {
  if (trades.length === 0) return 0;
  
  const winningTrades = trades.filter(t => t.pnl > 0).length;
  return winningTrades / trades.length;
}

/**
 * 统计正负天数
 */
export function countPositiveNegativeDays(returns: number[]): {
  positive: number;
  negative: number;
  neutral: number;
} {
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  
  for (const r of returns) {
    if (r > 0) positive++;
    else if (r < 0) negative++;
    else neutral++;
  }
  
  return { positive, negative, neutral };
}

