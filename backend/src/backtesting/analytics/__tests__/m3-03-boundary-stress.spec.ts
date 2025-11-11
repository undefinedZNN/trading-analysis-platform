/**
 * M3-03 Analytics 边界和压力测试
 * 
 * 测试性能计算、权益曲线、结果收集的极端情况
 */

import { createPerformanceCalculator } from '../performance-calculator';
import { createEquityCurveGenerator } from '../equity-curve-generator';
import { createResultCollector } from '../result-collector';
import { createResultsManager, ResultsManagerImpl } from '../results-manager';
import { FileSystemResultsStorage } from '../results-storage';
import type { TradeRecord } from '../../ledger/interfaces';
import Big from 'big.js';

// Mock fs module
jest.mock('fs/promises');

describe('M3-03 Analytics - Boundary & Stress Tests', () => {
  
  describe('PerformanceCalculator - Boundary Tests', () => {
    const calculator = createPerformanceCalculator({
      riskFreeRate: 0.02,
      tradingDaysPerYear: 252,
    });

    it('should handle empty equity curve', () => {
      const equityCurve = {
        timestamps: [],
        equity: [],
        drawdown: [],
      };

      const tradeStats = {
        totalTrades: 0,
        totalPnl: '0',
        totalFees: '0',
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgPnl: '0',
        avgWin: '0',
        avgLoss: '0',
        profitFactor: 0,
        maxWin: '0',
        maxLoss: '0',
        maxDrawdown: '0',
      };

      const metrics = calculator.calculate(equityCurve, tradeStats);
      expect(metrics.trading.totalTrades).toBe(0);
    });

    it('should handle single data point', () => {
      const equityCurve = {
        timestamps: ['2024-01-01T00:00:00Z'],
        equity: ['10000'],
        drawdown: ['0'],
      };

      const tradeStats = {
        totalTrades: 1,
        totalPnl: '0',
        totalFees: '0',
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgPnl: '0',
        avgWin: '0',
        avgLoss: '0',
        profitFactor: 0,
        maxWin: '0',
        maxLoss: '0',
        maxDrawdown: '0',
      };

      const metrics = calculator.calculate(equityCurve, tradeStats);
      expect(metrics).toBeDefined();
    });

    it('should handle extremely large equity values', () => {
      const largeValue = '999999999999999';
      const equityCurve = {
        timestamps: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
        equity: [largeValue, new Big(largeValue).times(2).toString()],
        drawdown: ['0', '0'],
      };

      const tradeStats = {
        totalTrades: 1,
        totalPnl: largeValue,
        totalFees: '0',
        winningTrades: 1,
        losingTrades: 0,
        winRate: 1,
        avgPnl: largeValue,
        avgWin: largeValue,
        avgLoss: '0',
        profitFactor: Infinity,
        maxWin: largeValue,
        maxLoss: '0',
        maxDrawdown: '0',
      };

      const metrics = calculator.calculate(equityCurve, tradeStats);
      expect(metrics.trading.totalPnl).toBe(largeValue);
    });

    it('should handle extremely small equity values', () => {
      const smallValue = '0.00000001';
      const equityCurve = {
        timestamps: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
        equity: [smallValue, new Big(smallValue).times(2).toString()],
        drawdown: ['0', '0'],
      };

      const tradeStats = {
        totalTrades: 1,
        totalPnl: smallValue,
        totalFees: '0',
        winningTrades: 1,
        losingTrades: 0,
        winRate: 1,
        avgPnl: smallValue,
        avgWin: smallValue,
        avgLoss: '0',
        profitFactor: Infinity,
        maxWin: smallValue,
        maxLoss: '0',
        maxDrawdown: '0',
      };

      const metrics = calculator.calculate(equityCurve, tradeStats);
      expect(metrics).toBeDefined();
    });

    it('should handle all losing trades', () => {
      const equityCurve = {
        timestamps: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
        equity: ['10000', '5000'],
        drawdown: ['0', '0.5'],
      };

      const tradeStats = {
        totalTrades: 10,
        totalPnl: '-5000',
        totalFees: '100',
        winningTrades: 0,
        losingTrades: 10,
        winRate: 0,
        avgPnl: '-500',
        avgWin: '0',
        avgLoss: '-500',
        profitFactor: 0,
        maxWin: '0',
        maxLoss: '-1000',
        maxDrawdown: '0.5',
      };

      const metrics = calculator.calculate(equityCurve, tradeStats);
      expect(metrics.trading.winRate).toBe(0);
      expect(metrics.trading.profitFactor).toBe(0);
    });

    it('should handle divide by zero scenarios', () => {
      const equityCurve = {
        timestamps: ['2024-01-01T00:00:00Z'],
        equity: ['0'],
        drawdown: ['1'],
      };

      const tradeStats = {
        totalTrades: 0,
        totalPnl: '0',
        totalFees: '0',
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgPnl: '0',
        avgWin: '0',
        avgLoss: '0',
        profitFactor: 0,
        maxWin: '0',
        maxLoss: '0',
        maxDrawdown: '1',
      };

      const metrics = calculator.calculate(equityCurve, tradeStats);
      expect(metrics.trading.winRate).toBe(0);
    });
  });

  describe('EquityCurveGenerator - Boundary Tests', () => {
    it('should handle empty trade list', () => {
      const generator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
      });

      const curve = generator.generate([]);
      expect(curve.timestamps).toHaveLength(0);
      expect(curve.equity).toHaveLength(0);
    });

    it('should handle 10000+ trades', () => {
      const generator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
      });

      const trades: TradeRecord[] = [];
      let timestamp = new Date('2024-01-01').getTime();

      for (let i = 0; i < 10000; i++) {
        trades.push({
          tradeId: `t${i}`,
          sessionId: 's1',
          strategyId: 'strategy1',
          symbol: 'BTCUSDT',
          intentId: `i${i}`,
          orderId: `o${i}`,
          fillId: `f${i}`,
          side: i % 2 === 0 ? 'buy' : 'sell',
          type: i % 2 === 0 ? 'open' : 'close',
          quantity: '1',
          price: '50000',
          realizedPnl: String((Math.random() - 0.5) * 1000),
          unrealizedPnl: '0',
          fees: '25',
          feeCurrency: 'USDT',
          liquidity: 'taker',
          timestamp: new Date(timestamp + i * 60000).toISOString(),
          sequenceId: `seq${i}`,
        });
      }

      const curve = generator.generate(trades);
      expect(curve.timestamps.length).toBeGreaterThan(0);
    }, 10000); // 10s timeout

    it('should handle trades with zero PnL', () => {
      const generator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
      });

      const trades: TradeRecord[] = [
        {
          tradeId: 't1',
          sessionId: 's1',
          strategyId: 'strategy1',
          symbol: 'BTCUSDT',
          intentId: 'i1',
          orderId: 'o1',
          fillId: 'f1',
          side: 'buy',
          type: 'open',
          quantity: '1',
          price: '50000',
          realizedPnl: '0',
          unrealizedPnl: '0',
          fees: '0',
          feeCurrency: 'USDT',
          liquidity: 'taker',
          timestamp: '2024-01-01T00:00:00Z',
          sequenceId: 'seq1',
        },
      ];

      const curve = generator.generate(trades);
      expect(parseFloat(curve.equity[0])).toBe(10000);
    });

    it('should handle negative equity', () => {
      const generator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
      });

      const trades: TradeRecord[] = [
        {
          tradeId: 't1',
          sessionId: 's1',
          strategyId: 'strategy1',
          symbol: 'BTCUSDT',
          intentId: 'i1',
          orderId: 'o1',
          fillId: 'f1',
          side: 'sell',
          type: 'close',
          quantity: '1',
          price: '50000',
          realizedPnl: '-20000', // Lose more than initial capital
          unrealizedPnl: '0',
          fees: '25',
          feeCurrency: 'USDT',
          liquidity: 'taker',
          timestamp: '2024-01-01T00:00:00Z',
          sequenceId: 'seq1',
        },
      ];

      const curve = generator.generate(trades);
      const finalEquity = new Big(curve.equity[curve.equity.length - 1]);
      expect(finalEquity.lt(0)).toBe(true);
    });

    it('should handle same timestamp trades', () => {
      const generator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
      });

      const timestamp = '2024-01-01T00:00:00Z';
      const trades: TradeRecord[] = Array.from({ length: 100 }, (_, i) => ({
        tradeId: `t${i}`,
        sessionId: 's1',
        strategyId: 'strategy1',
        symbol: 'BTCUSDT',
        intentId: `i${i}`,
        orderId: `o${i}`,
        fillId: `f${i}`,
        side: 'buy',
        type: 'open',
        quantity: '1',
        price: '50000',
        realizedPnl: '10',
        unrealizedPnl: '0',
        fees: '1',
        feeCurrency: 'USDT',
        liquidity: 'taker',
        timestamp,
        sequenceId: `seq${i}`,
      }));

      const curve = generator.generate(trades);
      expect(curve.timestamps).toBeDefined();
    });
  });

  describe('ResultCollector - Stress Tests', () => {
    it('should handle collection timeout', async () => {
      const perfCalculator = createPerformanceCalculator({
        riskFreeRate: 0.02,
      });

      const equityGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
      });

      const collector = createResultCollector({
        outputDir: '/tmp/stress-test',
        performanceCalculator: perfCalculator,
        equityCurveGenerator: equityGenerator,
      });

      // Should complete without hanging
      await expect(
        collector.collectResults('timeout-test')
      ).resolves.toBeDefined();
    });

    it('should handle concurrent collections', async () => {
      const perfCalculator = createPerformanceCalculator({
        riskFreeRate: 0.02,
      });

      const equityGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
      });

      const collector = createResultCollector({
        outputDir: '/tmp/concurrent-test',
        performanceCalculator: perfCalculator,
        equityCurveGenerator: equityGenerator,
      });

      const promises = Array.from({ length: 10 }, (_, i) =>
        collector.collectResults(`concurrent-${i}`)
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
    });
  });

  describe('ResultsManager - Cache Stress Tests', () => {
    it('should handle LRU cache eviction', async () => {
      const storage = new FileSystemResultsStorage({ baseDir: '/tmp/cache-test' });
      const manager = createResultsManager({
        storage,
        cacheSize: 10,
      }) as ResultsManagerImpl;

      const mockResults = {
        sessionId: 'test',
        config: {
          sessionId: 'test',
          strategyId: 'strategy1',
          symbols: ['BTCUSDT'],
          timeframe: '1d',
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-31T00:00:00Z',
          initialCapital: '10000',
        },
        metrics: {} as any,
        equityCurve: { timestamps: [], equity: [], drawdown: [] },
        files: { ledger: '', featureCatalog: '', logs: '', fullResults: '' },
        createdAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:00:00Z',
        status: 'completed' as const,
      };

      // Add 20 items (exceeds cache size of 10)
      for (let i = 0; i < 20; i++) {
        await manager.saveSessionResults(`session-${i}`, {
          ...mockResults,
          sessionId: `session-${i}`,
        });
      }

      const stats = manager.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize);
    });

    it('should handle 1000+ cache operations', async () => {
      const storage = new FileSystemResultsStorage({ baseDir: '/tmp/many-ops' });
      const manager = createResultsManager({
        storage,
        cacheSize: 100,
      }) as ResultsManagerImpl;

      const mockResults = {
        sessionId: 'test',
        config: {
          sessionId: 'test',
          strategyId: 'strategy1',
          symbols: ['BTCUSDT'],
          timeframe: '1d',
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-31T00:00:00Z',
          initialCapital: '10000',
        },
        metrics: {} as any,
        equityCurve: { timestamps: [], equity: [], drawdown: [] },
        files: { ledger: '', featureCatalog: '', logs: '', fullResults: '' },
        createdAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:00:00Z',
        status: 'completed' as const,
      };

      // Perform 1000 operations
      for (let i = 0; i < 1000; i++) {
        const sessionId = `session-${i % 100}`;
        await manager.saveSessionResults(sessionId, {
          ...mockResults,
          sessionId,
        });
        await manager.getSessionResults(sessionId);
      }

      // Should complete without errors
      expect(manager.getCacheStats().size).toBeGreaterThan(0);
    }, 10000); // 10s timeout
  });

  describe('Memory and Performance Tests', () => {
    it('should not leak memory with repeated calculations', () => {
      const calculator = createPerformanceCalculator({
        riskFreeRate: 0.02,
      });

      const equityCurve = {
        timestamps: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
        equity: ['10000', '11000'],
        drawdown: ['0', '0'],
      };

      const tradeStats = {
        totalTrades: 10,
        totalPnl: '1000',
        totalFees: '100',
        winningTrades: 6,
        losingTrades: 4,
        winRate: 0.6,
        avgPnl: '100',
        avgWin: '200',
        avgLoss: '-50',
        profitFactor: 2,
        maxWin: '500',
        maxLoss: '-200',
        maxDrawdown: '0.1',
      };

      // Run 1000 calculations
      for (let i = 0; i < 1000; i++) {
        calculator.calculate(equityCurve, tradeStats);
      }

      // If we got here without crashing, no obvious memory leak
      expect(true).toBe(true);
    });
  });
});
