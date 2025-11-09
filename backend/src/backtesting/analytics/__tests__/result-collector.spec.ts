/**
 * 结果收集器单元测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createResultCollector, ResultCollectorImpl } from '../result-collector';
import type { DataSources, CollectionOptions } from '../result-collector';
import { createPerformanceCalculator } from '../performance-calculator';
import { createEquityCurveGenerator } from '../equity-curve-generator';
import type { TradeRecord, TradeStats, LedgerService } from '../../ledger/interfaces';

// Mock fs module
jest.mock('fs/promises');

describe('ResultCollector', () => {
  let collector: ResultCollectorImpl;
  let mockLedger: jest.Mocked<LedgerService>;
  let mockEventStore: jest.Mocked<DataSources['eventStore']>;
  let mockFeatureRegistry: jest.Mocked<DataSources['featureRegistry']>;
  let mockTrades: TradeRecord[];
  let mockTradeStats: TradeStats;

  beforeEach(() => {
    // 清除mock
    jest.clearAllMocks();

    // Mock文件系统操作
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.rm as jest.Mock).mockResolvedValue(undefined);

    // 创建performance calculator
    const perfCalculator = createPerformanceCalculator({
      riskFreeRate: 0.02,
      tradingDaysPerYear: 252,
    });

    // 创建equity curve generator
    const equityGenerator = createEquityCurveGenerator({
      initialCapital: '10000',
      granularity: 'day',
    });

    // 创建collector
    collector = createResultCollector({
      outputDir: '/tmp/results',
      performanceCalculator: perfCalculator,
      equityCurveGenerator: equityGenerator,
      autoCreateDir: true,
    }) as ResultCollectorImpl;

    // 创建mock交易数据
    mockTrades = [
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
        realizedPnl: '1000',
        unrealizedPnl: '0',
        fees: '25',
        feeCurrency: 'USDT',
        liquidity: 'taker',
        timestamp: '2024-01-01T00:00:00Z',
        sequenceId: 'seq1',
      },
      {
        tradeId: 't2',
        sessionId: 's1',
        strategyId: 'strategy1',
        symbol: 'BTCUSDT',
        intentId: 'i2',
        orderId: 'o2',
        fillId: 'f2',
        side: 'sell',
        type: 'close',
        quantity: '1',
        price: '51000',
        realizedPnl: '500',
        unrealizedPnl: '0',
        fees: '25.5',
        feeCurrency: 'USDT',
        liquidity: 'taker',
        timestamp: '2024-01-02T00:00:00Z',
        sequenceId: 'seq2',
      },
    ];

    // Mock trade stats
    mockTradeStats = {
      totalTrades: 2,
      totalPnl: '1500',
      totalFees: '50.5',
      winningTrades: 2,
      losingTrades: 0,
      winRate: 1.0,
      avgPnl: '750',
      avgWin: '750',
      avgLoss: '0',
      profitFactor: Infinity,
      maxWin: '1000',
      maxLoss: '0',
      maxDrawdown: '0',
    };

    // Mock Ledger service
    mockLedger = {
      getTrades: jest.fn().mockResolvedValue(mockTrades),
      getStats: jest.fn().mockResolvedValue(mockTradeStats),
    } as any;

    // Mock EventStore
    mockEventStore = {
      getLogs: jest.fn().mockResolvedValue([
        { timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'Test log 1' },
        { timestamp: '2024-01-02T00:00:00Z', level: 'info', message: 'Test log 2' },
      ]),
      getEventCount: jest.fn().mockResolvedValue(100),
    };

    // Mock FeatureRegistry
    mockFeatureRegistry = {
      generateCatalog: jest.fn().mockReturnValue({
        features: ['MA', 'EMA', 'RSI'],
        count: 3,
      }),
    };
  });

  describe('collectResults', () => {
    it('should collect basic results', async () => {
      const results = await collector.collectResults('test-session');

      expect(results).toBeDefined();
      expect(results.sessionId).toBe('test-session');
      expect(results.status).toBe('completed');
      expect(results).toHaveProperty('config');
      expect(results).toHaveProperty('metrics');
      expect(results).toHaveProperty('equityCurve');
      expect(results).toHaveProperty('files');
    });

    it('should create output directory if autoCreateDir is true', async () => {
      await collector.collectResults('test-session');

      expect(fs.mkdir).toHaveBeenCalled();
    });

    it('should have proper result structure', async () => {
      const results = await collector.collectResults('test-session');

      expect(results.config).toHaveProperty('sessionId');
      expect(results.config).toHaveProperty('strategyId');
      expect(results.config).toHaveProperty('symbols');
      expect(results.metrics).toHaveProperty('trading');
      expect(results.metrics).toHaveProperty('risk');
      expect(results.metrics).toHaveProperty('returns');
      expect(results.metrics).toHaveProperty('drawdown');
    });
  });

  describe('collectResultsWithSources', () => {
    it('should collect results from all data sources', async () => {
      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        strategyName: 'Test Strategy',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      const dataSources: DataSources = {
        ledger: mockLedger,
        eventStore: mockEventStore,
        featureRegistry: mockFeatureRegistry,
      };

      const options: CollectionOptions = {
        includeLogs: true,
        includeFeatureCatalog: true,
        saveToFile: true,
      };

      const results = await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        dataSources,
        options
      );

      expect(results.sessionId).toBe('test-session');
      expect(results.config).toEqual(configSummary);
      expect(results.status).toBe('completed');
      expect(mockLedger.getTrades).toHaveBeenCalled();
      expect(mockLedger.getStats).toHaveBeenCalled();
    });

    it('should calculate metrics from trade data', async () => {
      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      const results = await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        { ledger: mockLedger },
        { saveToFile: false }
      );

      expect(results.metrics.trading.totalTrades).toBe(2);
      expect(results.metrics.trading.winRate).toBe(1.0);
      expect(results.equityCurve.timestamps.length).toBeGreaterThan(0);
    });

    it('should handle missing ledger service', async () => {
      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      const results = await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        {}, // No data sources
        { saveToFile: false }
      );

      expect(results.status).toBe('partial');
      expect(results.error).toContain('Ledger service not provided');
    });

    it('should collect logs when includeLogs is true', async () => {
      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        { eventStore: mockEventStore },
        { includeLogs: true, saveToFile: true }
      );

      expect(mockEventStore.getLogs).toHaveBeenCalledWith('test-session');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should collect feature catalog when includeFeatureCatalog is true', async () => {
      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        { featureRegistry: mockFeatureRegistry },
        { includeFeatureCatalog: true, saveToFile: true }
      );

      expect(mockFeatureRegistry.generateCatalog).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should save files when saveToFile is true', async () => {
      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        { ledger: mockLedger },
        { saveToFile: true }
      );

      // Should save ledger data and full results
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures gracefully', async () => {
      // Mock ledger to throw error
      mockLedger.getTrades.mockRejectedValue(new Error('Database error'));

      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      const results = await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        { ledger: mockLedger },
        { saveToFile: false }
      );

      expect(results.status).toBe('partial');
      expect(results.error).toContain('Failed to collect ledger data');
    });
  });

  describe('exportResults', () => {
    it('should export to JSON format', async () => {
      await collector.exportResults('test-session', 'json', '/tmp/export.json');

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should throw error for unsupported formats', async () => {
      await expect(
        collector.exportResults('test-session', 'parquet' as any, '/tmp/export.parquet')
      ).rejects.toThrow('not yet implemented');
    });

    it('should create output directory if it does not exist', async () => {
      await collector.exportResults('test-session', 'json', '/tmp/new/export.json');

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/new'),
        expect.objectContaining({ recursive: true })
      );
    });
  });

  describe('session management', () => {
    it('should get session output directory', () => {
      const dir = collector.getSessionOutputDir('test-session');

      expect(dir).toContain('test-session');
      expect(dir).toContain('/tmp/results');
    });

    it('should cleanup session files', async () => {
      await collector.cleanupSession('test-session');

      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('test-session'),
        expect.objectContaining({ recursive: true, force: true })
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      (fs.rm as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await expect(
        collector.cleanupSession('test-session')
      ).rejects.toThrow('Failed to cleanup session');
    });
  });

  describe('error handling', () => {
    it('should handle file system errors', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await expect(
        collector.collectResults('test-session')
      ).rejects.toThrow();
    });

    it('should provide detailed error messages', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Disk full'));

      try {
        await collector.collectResults('test-session');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Failed to collect results');
        expect(error.message).toContain('test-session');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty trade list', async () => {
      mockLedger.getTrades.mockResolvedValue([]);
      mockLedger.getStats.mockResolvedValue({
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
      });

      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      const results = await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        { ledger: mockLedger },
        { saveToFile: false }
      );

      expect(results.metrics.trading.totalTrades).toBe(0);
      expect(results.equityCurve.timestamps).toHaveLength(0);
    });

    it('should handle null/undefined data sources', async () => {
      const configSummary = {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      };

      const results = await collector.collectResultsWithSources(
        'test-session',
        configSummary,
        { ledger: undefined, eventStore: undefined, featureRegistry: undefined },
        { saveToFile: false }
      );

      expect(results.status).toBe('partial');
    });
  });
});

