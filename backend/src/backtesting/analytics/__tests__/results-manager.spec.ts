/**
 * 结果管理器单元测试
 */

import { createResultsManager, ResultsManagerImpl } from '../results-manager';
import { FileSystemResultsStorage } from '../results-storage';
import type { SessionResults } from '../interfaces';

// Mock fs module
jest.mock('fs/promises');

describe('ResultsManager', () => {
  let manager: ResultsManagerImpl;
  let mockStorage: jest.Mocked<FileSystemResultsStorage>;
  let mockResults: SessionResults;

  beforeEach(() => {
    mockResults = {
      sessionId: 'test-session',
      config: {
        sessionId: 'test-session',
        strategyId: 'strategy1',
        symbols: ['BTCUSDT'],
        timeframe: '1d',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-31T00:00:00Z',
        initialCapital: '10000',
      },
      metrics: {
        trading: {
          totalTrades: 10,
          winningTrades: 6,
          losingTrades: 4,
          winRate: 0.6,
          totalPnl: '1000',
          avgPnl: '100',
          avgWin: '200',
          avgLoss: '-50',
          profitFactor: 2,
          maxWin: '500',
          maxLoss: '-200',
          totalFees: '100',
        },
        risk: {
          sharpeRatio: 1.5,
          sortinoRatio: 1.8,
          calmarRatio: 2.0,
          downsideDeviation: 0.05,
          var95: 0.03,
          cvar95: 0.04,
          maxDrawdown: 0.15,
          volatility: 0.2,
        },
        returns: {
          dailyReturns: [0.01, -0.005, 0.02],
          cumulativeReturn: 0.1,
          annualizedReturn: 0.15,
          meanDailyReturn: 0.001,
          stdDevReturns: 0.01,
          positiveDays: 2,
          negativeDays: 1,
        },
        drawdown: {
          maxDrawdown: 0.15,
          maxDrawdownStart: '2024-01-15T00:00:00Z',
          maxDrawdownEnd: '2024-01-20T00:00:00Z',
          maxDrawdownDuration: 5,
          currentDrawdown: 0.05,
        },
      },
      equityCurve: {
        timestamps: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
        equity: ['10000', '10100'],
        drawdown: ['0', '0'],
      },
      files: {
        ledger: '/path/ledger.json',
        featureCatalog: '/path/catalog.json',
        logs: '/path/logs.json',
        fullResults: '/path/results.json',
      },
      createdAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-31T23:59:59Z',
      status: 'completed',
    };

    mockStorage = {
      save: jest.fn().mockResolvedValue(undefined),
      load: jest.fn().mockResolvedValue(mockResults),
      exists: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue(['test-session', 'test-session-2']),
      getMetadata: jest.fn().mockResolvedValue({
        size: 1024,
        createdAt: new Date('2024-01-01'),
        modifiedAt: new Date('2024-01-01'),
      }),
    } as any;

    manager = createResultsManager({
      storage: mockStorage,
      cacheSize: 10,
    }) as ResultsManagerImpl;
  });

  describe('getSessionResults', () => {
    it('should get results from storage', async () => {
      const results = await manager.getSessionResults('test-session');
      
      expect(results).toEqual(mockResults);
      expect(mockStorage.load).toHaveBeenCalledWith('test-session');
    });

    it('should use cache for second access', async () => {
      await manager.getSessionResults('test-session');
      await manager.getSessionResults('test-session');

      // Only called once
      expect(mockStorage.load).toHaveBeenCalledTimes(1);
    });

    it('should return null for non-existent session', async () => {
      mockStorage.load.mockResolvedValue(null);
      
      const results = await manager.getSessionResults('non-existent');
      expect(results).toBeNull();
    });
  });

  describe('listSessionResults', () => {
    it('should list all sessions', async () => {
      const results = await manager.listSessionResults();
      
      expect(results).toHaveLength(2);
      expect(mockStorage.list).toHaveBeenCalled();
    });
  });

  describe('deleteSessionResults', () => {
    it('should delete from storage and cache', async () => {
      const deleted = await manager.deleteSessionResults('test-session');
      
      expect(deleted).toBe(true);
      expect(mockStorage.delete).toHaveBeenCalledWith('test-session');
    });
  });

  describe('getSessionMetrics', () => {
    it('should get only metrics', async () => {
      const metrics = await manager.getSessionMetrics('test-session');
      
      expect(metrics).toEqual(mockResults.metrics);
    });

    it('should return null for non-existent session', async () => {
      mockStorage.load.mockResolvedValue(null);
      
      const metrics = await manager.getSessionMetrics('non-existent');
      expect(metrics).toBeNull();
    });
  });

  describe('getEquityCurve', () => {
    it('should get only equity curve', async () => {
      const curve = await manager.getEquityCurve('test-session');
      
      expect(curve).toEqual(mockResults.equityCurve);
    });
  });

  describe('saveSessionResults', () => {
    it('should save to storage and cache', async () => {
      await manager.saveSessionResults('new-session', mockResults);
      
      expect(mockStorage.save).toHaveBeenCalledWith('new-session', mockResults);
    });
  });

  describe('hasSessionResults', () => {
    it('should check cache first', async () => {
      await manager.getSessionResults('test-session'); // Load into cache
      
      const exists = await manager.hasSessionResults('test-session');
      expect(exists).toBe(true);
      expect(mockStorage.exists).not.toHaveBeenCalled();
    });

    it('should check storage if not in cache', async () => {
      const exists = await manager.hasSessionResults('other-session');
      
      expect(mockStorage.exists).toHaveBeenCalledWith('other-session');
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      manager.clearCache();
      
      const stats = manager.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should provide cache stats', async () => {
      await manager.getSessionResults('test-session');
      
      const stats = manager.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.maxSize).toBeGreaterThan(0);
    });
  });
});

