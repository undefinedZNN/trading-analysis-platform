/**
 * 性能指标计算器单元测试
 */

import { createPerformanceCalculator } from '../performance-calculator';
import {
  mean,
  stdDev,
  downsideDeviation,
  percentile,
  cumulativeReturn,
  annualizedReturn,
  sharpeRatio,
  sortinoRatio,
  maxDrawdown,
  calmarRatio,
  valueAtRisk,
  conditionalValueAtRisk,
  calculateReturns,
  profitFactor,
  winRate,
} from '../metrics-helpers';
import type { EquityCurve, TradeStats } from '../interfaces';

describe('Metrics Helpers', () => {
  describe('mean', () => {
    it('should calculate mean correctly', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
      expect(mean([10, 20, 30])).toBe(20);
    });

    it('should handle empty array', () => {
      expect(mean([])).toBe(0);
    });

    it('should handle single value', () => {
      expect(mean([42])).toBe(42);
    });
  });

  describe('stdDev', () => {
    it('should calculate standard deviation correctly', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const result = stdDev(values);
      expect(result).toBeCloseTo(2, 0);
    });

    it('should handle empty array', () => {
      expect(stdDev([])).toBe(0);
    });

    it('should handle single value', () => {
      expect(stdDev([5])).toBe(0);
    });
  });

  describe('downsideDeviation', () => {
    it('should calculate downside deviation', () => {
      const returns = [0.05, -0.02, 0.03, -0.01, 0.04, -0.03];
      const result = downsideDeviation(returns, 0);
      expect(result).toBeGreaterThan(0);
    });

    it('should be zero when all returns above target', () => {
      const returns = [0.01, 0.02, 0.03, 0.04];
      const result = downsideDeviation(returns, 0);
      expect(result).toBeCloseTo(0, 5);
    });
  });

  describe('percentile', () => {
    it('should calculate percentile correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(percentile(values, 50)).toBe(5.5);
      expect(percentile(values, 25)).toBe(3.25);
      expect(percentile(values, 75)).toBe(7.75);
    });

    it('should handle edge percentiles', () => {
      const values = [1, 2, 3, 4, 5];
      expect(percentile(values, 0)).toBe(1);
      expect(percentile(values, 100)).toBe(5);
    });

    it('should throw on invalid percentile', () => {
      expect(() => percentile([1, 2, 3], -1)).toThrow();
      expect(() => percentile([1, 2, 3], 101)).toThrow();
    });
  });

  describe('cumulativeReturn', () => {
    it('should calculate cumulative return correctly', () => {
      const returns = [0.1, 0.05, -0.02];
      const result = cumulativeReturn(returns);
      // (1+0.1)*(1+0.05)*(1-0.02) - 1 = 0.1319
      expect(result).toBeCloseTo(0.1319, 4);
    });

    it('should handle empty array', () => {
      expect(cumulativeReturn([])).toBe(0);
    });

    it('should handle single return', () => {
      expect(cumulativeReturn([0.1])).toBeCloseTo(0.1, 10);
    });
  });

  describe('annualizedReturn', () => {
    it('should annualize returns correctly', () => {
      const cumReturn = 0.15; // 15%累计收益
      const days = 252; // 1年
      const result = annualizedReturn(cumReturn, days);
      expect(result).toBeCloseTo(0.15, 2);
    });

    it('should handle zero days', () => {
      expect(annualizedReturn(0.15, 0)).toBe(0);
    });

    it('should annualize for half year correctly', () => {
      const cumReturn = 0.1; // 10%半年收益
      const days = 126; // 半年
      const result = annualizedReturn(cumReturn, days);
      expect(result).toBeGreaterThan(0.1); // 年化应该更高
    });
  });

  describe('sharpeRatio', () => {
    it('should calculate Sharpe ratio correctly', () => {
      // 模拟日收益率，平均0.1%，标准差0.5%
      const returns = Array(252).fill(null).map(() => 0.001 + (Math.random() - 0.5) * 0.01);
      const result = sharpeRatio(returns, 0.02);
      expect(result).toBeGreaterThan(0);
    });

    it('should be zero for zero volatility', () => {
      const returns = [0.01, 0.01, 0.01, 0.01];
      const result = sharpeRatio(returns);
      expect(result).toBe(0);
    });

    it('should handle negative Sharpe', () => {
      const returns = [-0.01, -0.02, -0.01, -0.03];
      const result = sharpeRatio(returns, 0.02);
      expect(result).toBeLessThan(0);
    });
  });

  describe('sortinoRatio', () => {
    it('should calculate Sortino ratio correctly', () => {
      const returns = [0.02, -0.01, 0.03, -0.02, 0.01];
      const result = sortinoRatio(returns, 0);
      expect(result).toBeGreaterThan(0);
    });

    it('should be zero for zero downside deviation', () => {
      const returns = [0.01, 0.02, 0.03, 0.01];
      const result = sortinoRatio(returns, 0);
      expect(result).toBe(0);
    });
  });

  describe('maxDrawdown', () => {
    it('should calculate max drawdown correctly', () => {
      const equity = [100, 110, 105, 120, 100, 90, 110];
      const result = maxDrawdown(equity);
      
      expect(result.maxDrawdownPercent).toBeGreaterThan(0);
      expect(result.peakValue).toBe(120);
      expect(result.troughValue).toBe(90);
      expect(result.maxDrawdownPercent).toBeCloseTo(0.25, 2); // 25% drawdown
    });

    it('should handle increasing equity curve', () => {
      const equity = [100, 110, 120, 130, 140];
      const result = maxDrawdown(equity);
      expect(result.maxDrawdownPercent).toBe(0);
    });

    it('should handle empty array', () => {
      const result = maxDrawdown([]);
      expect(result.maxDrawdownPercent).toBe(0);
      expect(result.startIndex).toBe(-1);
    });
  });

  describe('calmarRatio', () => {
    it('should calculate Calmar ratio correctly', () => {
      const annReturn = 0.15; // 15%
      const maxDD = 0.10; // 10%
      const result = calmarRatio(annReturn, maxDD);
      expect(result).toBeCloseTo(1.5, 10);
    });

    it('should be zero for zero drawdown', () => {
      expect(calmarRatio(0.15, 0)).toBe(0);
    });

    it('should handle negative returns', () => {
      expect(calmarRatio(-0.05, 0.10)).toBe(-0.5);
    });
  });

  describe('valueAtRisk', () => {
    it('should calculate VaR correctly', () => {
      const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05];
      const result = valueAtRisk(returns, 0.95);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(0.05); // 不应超过最大损失
    });

    it('should handle empty array', () => {
      expect(valueAtRisk([], 0.95)).toBe(0);
    });
  });

  describe('conditionalValueAtRisk', () => {
    it('should calculate CVaR correctly', () => {
      const returns = [-0.10, -0.08, -0.05, -0.03, -0.01, 0.01, 0.02, 0.03];
      const cvar = conditionalValueAtRisk(returns, 0.95);
      const var95 = valueAtRisk(returns, 0.95);
      
      // CVaR应该大于或等于VaR
      expect(cvar).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('calculateReturns', () => {
    it('should calculate returns from equity curve', () => {
      const equity = [100, 105, 102, 110];
      const returns = calculateReturns(equity);
      
      expect(returns).toHaveLength(3);
      expect(returns[0]).toBeCloseTo(0.05, 4); // 5%
      expect(returns[1]).toBeCloseTo(-0.0286, 4); // -2.86%
      expect(returns[2]).toBeCloseTo(0.0784, 4); // 7.84%
    });

    it('should handle zero values', () => {
      const equity = [0, 100, 200];
      const returns = calculateReturns(equity);
      expect(returns[0]).toBe(0);
    });
  });

  describe('profitFactor', () => {
    it('should calculate profit factor correctly', () => {
      const trades = [
        { pnl: 100 },
        { pnl: -50 },
        { pnl: 200 },
        { pnl: -75 },
      ];
      const result = profitFactor(trades);
      expect(result).toBeCloseTo(2.4, 1); // (100+200)/(50+75) = 2.4
    });

    it('should be infinity for all winning trades', () => {
      const trades = [{ pnl: 100 }, { pnl: 200 }];
      expect(profitFactor(trades)).toBe(Infinity);
    });

    it('should be zero for all losing trades', () => {
      const trades = [{ pnl: -100 }, { pnl: -200 }];
      expect(profitFactor(trades)).toBe(0);
    });
  });

  describe('winRate', () => {
    it('should calculate win rate correctly', () => {
      const trades = [
        { pnl: 100 },
        { pnl: -50 },
        { pnl: 200 },
        { pnl: -75 },
        { pnl: 150 },
      ];
      const result = winRate(trades);
      expect(result).toBe(0.6); // 3/5 = 60%
    });

    it('should handle empty array', () => {
      expect(winRate([])).toBe(0);
    });
  });
});

describe('PerformanceCalculator', () => {
  let calculator: ReturnType<typeof createPerformanceCalculator>;
  let mockEquityCurve: EquityCurve;
  let mockTradeStats: TradeStats;

  beforeEach(() => {
    calculator = createPerformanceCalculator({
      riskFreeRate: 0.02,
      tradingDaysPerYear: 252,
    });

    // 创建模拟权益曲线
    const timestamps: string[] = [];
    const equity: string[] = [];
    const drawdown: string[] = [];
    
    let currentEquity = 10000;
    const startDate = new Date('2024-01-01');
    
    for (let i = 0; i < 252; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      timestamps.push(date.toISOString());
      
      // 模拟波动：平均每天0.1%收益，波动1%
      const dailyReturn = 0.001 + (Math.random() - 0.5) * 0.02;
      currentEquity *= (1 + dailyReturn);
      equity.push(currentEquity.toFixed(2));
      drawdown.push('0');
    }

    mockEquityCurve = { timestamps, equity, drawdown };

    mockTradeStats = {
      totalTrades: 100,
      totalPnl: '5000.00',
      totalFees: '500.00',
      winningTrades: 60,
      losingTrades: 40,
      winRate: 0.6,
      avgPnl: '50.00',
      avgWin: '150.00',
      avgLoss: '-75.00',
      profitFactor: 2.0,
      maxWin: '500.00',
      maxLoss: '-250.00',
      maxDrawdown: '0.15',
    };
  });

  describe('calculate', () => {
    it('should calculate complete performance metrics', () => {
      const metrics = calculator.calculate(mockEquityCurve, mockTradeStats);

      expect(metrics).toHaveProperty('trading');
      expect(metrics).toHaveProperty('risk');
      expect(metrics).toHaveProperty('returns');
      expect(metrics).toHaveProperty('drawdown');
    });

    it('should calculate trading metrics correctly', () => {
      const metrics = calculator.calculate(mockEquityCurve, mockTradeStats);

      expect(metrics.trading.totalTrades).toBe(100);
      expect(metrics.trading.winRate).toBe(0.6);
      expect(metrics.trading.profitFactor).toBe(2.0);
    });

    it('should calculate risk metrics', () => {
      const metrics = calculator.calculate(mockEquityCurve, mockTradeStats);

      expect(metrics.risk.sharpeRatio).toBeDefined();
      expect(metrics.risk.sortinoRatio).toBeDefined();
      expect(metrics.risk.calmarRatio).toBeDefined();
      expect(metrics.risk.volatility).toBeGreaterThan(0);
    });

    it('should calculate return stats', () => {
      const metrics = calculator.calculate(mockEquityCurve, mockTradeStats);

      expect(metrics.returns.dailyReturns.length).toBeGreaterThan(0);
      expect(metrics.returns.cumulativeReturn).toBeDefined();
      expect(metrics.returns.annualizedReturn).toBeDefined();
    });

    it('should calculate drawdown stats', () => {
      const metrics = calculator.calculate(mockEquityCurve, mockTradeStats);

      expect(metrics.drawdown.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(metrics.drawdown.currentDrawdown).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('should calculate Sharpe ratio with default risk-free rate', () => {
      const returns = [0.01, 0.02, -0.01, 0.03, 0.01];
      const sharpe = calculator.calculateSharpeRatio(returns);
      expect(typeof sharpe).toBe('number');
    });

    it('should accept custom risk-free rate', () => {
      const returns = [0.01, 0.02, -0.01, 0.03, 0.01];
      const sharpe = calculator.calculateSharpeRatio(returns, 0.05);
      expect(typeof sharpe).toBe('number');
    });
  });

  describe('calculateSortinoRatio', () => {
    it('should calculate Sortino ratio', () => {
      const returns = [0.01, 0.02, -0.01, 0.03, -0.02];
      const sortino = calculator.calculateSortinoRatio(returns);
      expect(typeof sortino).toBe('number');
    });

    it('should accept custom target return', () => {
      const returns = [0.01, 0.02, -0.01, 0.03, -0.02];
      const sortino = calculator.calculateSortinoRatio(returns, 0.005);
      expect(typeof sortino).toBe('number');
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should calculate max drawdown stats', () => {
      const stats = calculator.calculateMaxDrawdown(mockEquityCurve);

      expect(stats.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(stats.currentDrawdown).toBeGreaterThanOrEqual(0);
      expect(stats.maxDrawdownDuration).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamps for drawdown period', () => {
      const stats = calculator.calculateMaxDrawdown(mockEquityCurve);

      if (stats.maxDrawdown > 0) {
        expect(stats.maxDrawdownStart).toBeTruthy();
        expect(stats.maxDrawdownEnd).toBeTruthy();
      }
    });
  });

  describe('calculateReturnStats', () => {
    it('should calculate complete return statistics', () => {
      const stats = calculator.calculateReturnStats(mockEquityCurve);

      expect(stats.dailyReturns.length).toBeGreaterThan(0);
      expect(stats.cumulativeReturn).toBeDefined();
      expect(stats.annualizedReturn).toBeDefined();
      expect(stats.meanDailyReturn).toBeDefined();
      expect(stats.stdDevReturns).toBeGreaterThanOrEqual(0);
      expect(stats.positiveDays).toBeGreaterThanOrEqual(0);
      expect(stats.negativeDays).toBeGreaterThanOrEqual(0);
    });

    it('should handle short equity curve', () => {
      const shortCurve: EquityCurve = {
        timestamps: ['2024-01-01'],
        equity: ['10000'],
        drawdown: ['0'],
      };

      const stats = calculator.calculateReturnStats(shortCurve);
      expect(stats.dailyReturns).toHaveLength(0);
      expect(stats.cumulativeReturn).toBe(0);
    });
  });

  describe('config management', () => {
    it('should work with different configs', () => {
      // Test with custom config
      const customCalculator = createPerformanceCalculator({ 
        riskFreeRate: 0.03,
        tradingDaysPerYear: 252 
      });
      expect(customCalculator).toBeDefined();
    });

    it('should use default config', () => {
      const defaultCalculator = createPerformanceCalculator();
      expect(defaultCalculator).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty equity curve', () => {
      const emptyCurve: EquityCurve = {
        timestamps: [],
        equity: [],
        drawdown: [],
      };

      expect(() => {
        calculator.calculateReturnStats(emptyCurve);
      }).not.toThrow();
    });

    it('should handle flat equity curve', () => {
      const flatCurve: EquityCurve = {
        timestamps: ['2024-01-01', '2024-01-02', '2024-01-03'],
        equity: ['10000', '10000', '10000'],
        drawdown: ['0', '0', '0'],
      };

      const stats = calculator.calculateReturnStats(flatCurve);
      expect(stats.cumulativeReturn).toBe(0);
      expect(stats.stdDevReturns).toBe(0);
    });
  });
});
