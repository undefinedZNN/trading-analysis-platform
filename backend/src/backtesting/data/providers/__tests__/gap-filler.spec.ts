/**
 * GapFiller 单元测试
 */

import { DefaultGapFiller } from '../gap-filler';
import { Gap } from '../interfaces';
import { BarEvent } from '../../timeframe/interfaces';
import Big from 'big.js';

describe('GapFiller', () => {
  let filler: DefaultGapFiller;

  beforeEach(() => {
    filler = new DefaultGapFiller();
  });

  describe('forwardFill', () => {
    it('should fill gap with forward fill method', () => {
      const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      const nextBar = createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT', '50200.00');
      
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:03:00.000Z',
        expectedBars: 2,
        lastValidBar: lastBar,
        nextValidBar: nextBar,
      };

      const filled = filler.forwardFill(gap, '1m');
      
      expect(filled).toHaveLength(2);
      expect(filled[0].timestamp).toBe('2024-01-01T00:01:00.000Z');
      expect(filled[1].timestamp).toBe('2024-01-01T00:02:00.000Z');
      
      // All OHLC should be the last bar's close
      filled.forEach(bar => {
        expect(bar.open).toBe('50000.00');
        expect(bar.high).toBe('50000.00');
        expect(bar.low).toBe('50000.00');
        expect(bar.close).toBe('50000.00');
        expect(bar.volume).toBe('0');
        expect(bar.context?.qualityFlag).toBe('synthetic');
        expect(bar.context?.fillMethod).toBe('forwardFill');
      });
    });

    it('should mark filled bars as synthetic', () => {
      const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:02:00.000Z',
        expectedBars: 1,
        lastValidBar: lastBar,
      };

      const filled = filler.forwardFill(gap, '1m');
      
      expect(filled[0].source).toContain('synthetic');
      expect(filled[0].source).toContain('forwardFill');
      expect(filled[0].context?.qualityFlag).toBe('synthetic');
    });

    it('should throw error if lastValidBar is missing', () => {
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:02:00.000Z',
        expectedBars: 1,
      };

      expect(() => filler.forwardFill(gap, '1m')).toThrow();
    });

    it('should handle large gaps', () => {
      const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:11:00.000Z',
        expectedBars: 10,
        lastValidBar: lastBar,
      };

      const filled = filler.forwardFill(gap, '1m');
      
      expect(filled).toHaveLength(10);
      filled.forEach((bar, index) => {
        const expectedMinute = index + 1;
        expect(bar.timestamp).toContain(`00:${expectedMinute.toString().padStart(2, '0')}:00`);
      });
    });
  });

  describe('linearFill', () => {
    it('should fill gap with linear interpolation', () => {
      const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      const nextBar = createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT', '50300.00');
      
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:03:00.000Z',
        expectedBars: 2,
        lastValidBar: lastBar,
        nextValidBar: nextBar,
      };

      const filled = filler.linearFill(gap, '1m');
      
      expect(filled).toHaveLength(2);
      
      // Check interpolated prices
      const price1 = new Big(filled[0].close);
      const price2 = new Big(filled[1].close);
      
      // Prices should be between lastBar.close and nextBar.open
      expect(price1.gte(50000)).toBe(true);
      expect(price1.lte(50300)).toBe(true);
      expect(price2.gte(50000)).toBe(true);
      expect(price2.lte(50300)).toBe(true);
      
      // Second price should be higher than first
      expect(price2.gt(price1)).toBe(true);
    });

    it('should mark filled bars as interpolated', () => {
      const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      const nextBar = createBarEvent('2024-01-01T00:02:00.000Z', 'BTC-USDT', '50200.00');
      
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:02:00.000Z',
        expectedBars: 1,
        lastValidBar: lastBar,
        nextValidBar: nextBar,
      };

      const filled = filler.linearFill(gap, '1m');
      
      expect(filled[0].source).toContain('synthetic');
      expect(filled[0].source).toContain('linear');
      expect(filled[0].context?.qualityFlag).toBe('interpolated');
    });

    it('should throw error if lastValidBar or nextValidBar is missing', () => {
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:02:00.000Z',
        expectedBars: 1,
        lastValidBar: createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00'),
      };

      expect(() => filler.linearFill(gap, '1m')).toThrow();
    });

    it('should interpolate correctly for decreasing prices', () => {
      const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      const nextBar = createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT', '49000.00');
      
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:03:00.000Z',
        expectedBars: 2,
        lastValidBar: lastBar,
        nextValidBar: nextBar,
      };

      const filled = filler.linearFill(gap, '1m');
      
      expect(filled).toHaveLength(2);
      
      const price1 = new Big(filled[0].close);
      const price2 = new Big(filled[1].close);
      
      // Prices should be between 49000 and 50000, decreasing
      expect(price1.lt(50000)).toBe(true);
      expect(price1.gt(49000)).toBe(true);
      expect(price2.lt(price1)).toBe(true);
      expect(price2.gt(49000)).toBe(true);
    });
  });

  describe('fillGap', () => {
    it('should use forwardFill method when specified', () => {
      const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:02:00.000Z',
        expectedBars: 1,
        lastValidBar: lastBar,
      };

      const filled = filler.fillGap(gap, 'forwardFill', '1m');
      
      expect(filled).toHaveLength(1);
      expect(filled[0].context?.fillMethod).toBe('forwardFill');
    });

    it('should use linear method when specified', () => {
      const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      const nextBar = createBarEvent('2024-01-01T00:02:00.000Z', 'BTC-USDT', '50200.00');
      
      const gap: Gap = {
        startTimestamp: '2024-01-01T00:01:00.000Z',
        endTimestamp: '2024-01-01T00:02:00.000Z',
        expectedBars: 1,
        lastValidBar: lastBar,
        nextValidBar: nextBar,
      };

      const filled = filler.fillGap(gap, 'linear', '1m');
      
      expect(filled).toHaveLength(1);
      expect(filled[0].context?.fillMethod).toBe('linear');
    });
  });

  describe('mergeWithFilled', () => {
    it('should merge original and filled data correctly', () => {
      const original: BarEvent[] = [
        createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00'),
        createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT', '50100.00'),
        createBarEvent('2024-01-01T00:04:00.000Z', 'BTC-USDT', '50400.00'),
      ];

      const gap: Gap = {
        startTimestamp: '2024-01-01T00:02:00.000Z',
        endTimestamp: '2024-01-01T00:04:00.000Z',
        expectedBars: 2,
        lastValidBar: original[1],
        nextValidBar: original[2],
      };

      const merged = filler.mergeWithFilled(original, [gap], 'forwardFill', '1m');
      
      expect(merged).toHaveLength(5); // 3 original + 2 filled
      
      // Check order
      for (let i = 0; i < merged.length - 1; i++) {
        const current = new Date(merged[i].timestamp);
        const next = new Date(merged[i + 1].timestamp);
        expect(next.getTime()).toBeGreaterThan(current.getTime());
      }
    });

    it('should return original data if no gaps', () => {
      const original = [
        createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00'),
        createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT', '50100.00'),
      ];

      const merged = filler.mergeWithFilled(original, [], 'forwardFill', '1m');
      
      expect(merged).toEqual(original);
    });
  });

  describe('isSynthetic', () => {
    it('should identify synthetic data', () => {
      const syntheticBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      syntheticBar.context = { qualityFlag: 'synthetic' };
      
      expect(filler.isSynthetic(syntheticBar)).toBe(true);
    });

    it('should identify interpolated data as synthetic', () => {
      const interpolatedBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      interpolatedBar.context = { qualityFlag: 'interpolated' };
      
      expect(filler.isSynthetic(interpolatedBar)).toBe(true);
    });

    it('should identify original data', () => {
      const originalBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      originalBar.source = 'parquet:provider';
      
      expect(filler.isSynthetic(originalBar)).toBe(false);
    });
  });

  describe('filterSynthetic', () => {
    it('should filter out synthetic data', () => {
      const original = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      const synthetic = createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT', '50100.00');
      synthetic.context = { qualityFlag: 'synthetic' };
      
      const events = [original, synthetic];
      const filtered = filler.filterSynthetic(events);
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(original);
    });
  });

  describe('getSyntheticStatistics', () => {
    it('should calculate synthetic statistics correctly', () => {
      const original1 = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
      const original2 = createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT', '50100.00');
      const synthetic1 = createBarEvent('2024-01-01T00:02:00.000Z', 'BTC-USDT', '50200.00');
      synthetic1.context = { qualityFlag: 'synthetic' };
      const synthetic2 = createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT', '50300.00');
      synthetic2.context = { qualityFlag: 'synthetic' };
      
      const events = [original1, original2, synthetic1, synthetic2];
      const stats = filler.getSyntheticStatistics(events);
      
      expect(stats.total).toBe(4);
      expect(stats.original).toBe(2);
      expect(stats.synthetic).toBe(2);
      expect(stats.syntheticPercentage).toBe(50);
    });

    it('should handle empty array', () => {
      const stats = filler.getSyntheticStatistics([]);
      
      expect(stats.total).toBe(0);
      expect(stats.syntheticPercentage).toBe(0);
    });
  });
});

// Helper function
function createBarEvent(timestamp: string, symbol: string, close: string): BarEvent {
  return {
    sequenceId: `test-${timestamp}`,
    timestamp,
    symbol,
    timeframe: '1m',
    open: close,
    high: close,
    low: close,
    close,
    volume: '100.00',
    source: 'test',
  };
}

