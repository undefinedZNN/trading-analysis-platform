/**
 * GapDetector 单元测试
 */

import { DefaultGapDetector } from '../gap-detector';
import { BarEvent } from '../../timeframe/interfaces';
import { formatISO, addSeconds } from 'date-fns';

describe('GapDetector', () => {
  let detector: DefaultGapDetector;

  beforeEach(() => {
    detector = new DefaultGapDetector();
  });

  describe('detectGaps', () => {
    it('should detect no gaps in continuous data', () => {
      const events = createContinuousEvents(10, 60000); // 10 bars, 1 minute interval
      const gaps = detector.detectGaps(events, 60000, '1m');
      
      expect(gaps).toHaveLength(0);
    });

    it('should detect a single gap', () => {
      const events: BarEvent[] = [
        createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
        // Gap here: missing 00:02:00
        createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT'),
      ];

      const gaps = detector.detectGaps(events, 60000, '1m');
      
      expect(gaps).toHaveLength(1);
      expect(gaps[0].expectedBars).toBe(1);
      expect(gaps[0].lastValidBar?.timestamp).toBe('2024-01-01T00:01:00.000Z');
      expect(gaps[0].nextValidBar?.timestamp).toBe('2024-01-01T00:03:00.000Z');
    });

    it('should detect multiple gaps', () => {
      const events: BarEvent[] = [
        createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
        // Gap 1: missing 00:02:00
        createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:04:00.000Z', 'BTC-USDT'),
        // Gap 2: missing 00:05:00 and 00:06:00
        createBarEvent('2024-01-01T00:07:00.000Z', 'BTC-USDT'),
      ];

      const gaps = detector.detectGaps(events, 60000, '1m');
      
      expect(gaps).toHaveLength(2);
      expect(gaps[0].expectedBars).toBe(1);
      expect(gaps[1].expectedBars).toBe(2);
    });

    it('should handle large gaps correctly', () => {
      const events: BarEvent[] = [
        createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
        // Large gap: missing 10 bars
        createBarEvent('2024-01-01T00:12:00.000Z', 'BTC-USDT'),
      ];

      const gaps = detector.detectGaps(events, 60000, '1m');
      
      expect(gaps).toHaveLength(1);
      expect(gaps[0].expectedBars).toBe(10);
    });

    it('should return empty array for single event', () => {
      const events = [createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT')];
      const gaps = detector.detectGaps(events, 60000, '1m');
      
      expect(gaps).toHaveLength(0);
    });

    it('should return empty array for empty events', () => {
      const gaps = detector.detectGaps([], 60000, '1m');
      
      expect(gaps).toHaveLength(0);
    });
  });

  describe('validateIntegrity', () => {
    it('should validate complete data as 100% complete', () => {
      const events = createContinuousEvents(100, 60000);
      const report = detector.validateIntegrity(events, 60000);
      
      expect(report.totalRecords).toBe(100);
      expect(report.gapCount).toBe(0);
      expect(report.missingRecords).toBe(0);
      expect(report.completeness).toBeGreaterThanOrEqual(95);
      expect(report.isValid).toBe(true);
    });

    it('should detect incomplete data', () => {
      const events: BarEvent[] = [
        createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:04:00.000Z', 'BTC-USDT'),
      ];

      const report = detector.validateIntegrity(events, 60000);
      
      expect(report.totalRecords).toBe(4);
      expect(report.expectedRecords).toBe(5); // 00:00 to 00:04 = 5 bars
      expect(report.gapCount).toBe(1);
      expect(report.missingRecords).toBe(1);
      expect(report.completeness).toBe(80); // 4/5 = 80%
    });

    it('should mark data as valid if completeness >= 95%', () => {
      const events = createContinuousEvents(100, 60000);
      const report = detector.validateIntegrity(events, 60000);
      
      expect(report.isValid).toBe(true);
    });

    it('should handle empty data', () => {
      const report = detector.validateIntegrity([], 60000);
      
      expect(report.totalRecords).toBe(0);
      expect(report.expectedRecords).toBe(0);
      expect(report.completeness).toBe(100);
      expect(report.isValid).toBe(true);
    });

    it('should handle single record', () => {
      const events = [createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT')];
      const report = detector.validateIntegrity(events, 60000);
      
      expect(report.totalRecords).toBe(1);
      expect(report.isValid).toBe(true);
    });
  });

  describe('detectSingleGap', () => {
    it('should detect gap between two events', () => {
      const prev = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT');
      const next = createBarEvent('2024-01-01T00:02:00.000Z', 'BTC-USDT');
      
      const gap = detector.detectSingleGap(prev, next, 60000);
      
      expect(gap).not.toBeNull();
      expect(gap?.expectedBars).toBe(1);
      expect(gap?.lastValidBar).toBe(prev);
      expect(gap?.nextValidBar).toBe(next);
    });

    it('should return null for consecutive events', () => {
      const prev = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT');
      const next = createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT');
      
      const gap = detector.detectSingleGap(prev, next, 60000);
      
      expect(gap).toBeNull();
    });
  });

  describe('getGapStatistics', () => {
    it('should calculate gap statistics correctly', () => {
      const events: BarEvent[] = [
        createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT'), // Gap: 1 bar
        createBarEvent('2024-01-01T00:04:00.000Z', 'BTC-USDT'),
        createBarEvent('2024-01-01T00:08:00.000Z', 'BTC-USDT'), // Gap: 3 bars
      ];

      const gaps = detector.detectGaps(events, 60000, '1m');
      const stats = detector.getGapStatistics(gaps);
      
      expect(stats.totalGaps).toBe(2);
      expect(stats.totalMissingBars).toBe(4); // 1 + 3
      expect(stats.avgGapSize).toBe(2); // (1 + 3) / 2
      expect(stats.maxGapSize).toBe(3);
      expect(stats.minGapSize).toBe(1);
    });

    it('should handle empty gaps array', () => {
      const stats = detector.getGapStatistics([]);
      
      expect(stats.totalGaps).toBe(0);
      expect(stats.totalMissingBars).toBe(0);
      expect(stats.avgGapSize).toBe(0);
    });
  });
});

// Helper functions
function createBarEvent(timestamp: string, symbol: string): BarEvent {
  return {
    sequenceId: `test-${timestamp}`,
    timestamp,
    symbol,
    timeframe: '1m',
    open: '50000.00',
    high: '50100.00',
    low: '49900.00',
    close: '50050.00',
    volume: '100.00',
    source: 'test',
  };
}

function createContinuousEvents(count: number, intervalMs: number): BarEvent[] {
  const events: BarEvent[] = [];
  const baseTime = new Date('2024-01-01T00:00:00.000Z');
  
  for (let i = 0; i < count; i++) {
    const timestamp = formatISO(addSeconds(baseTime, (i * intervalMs) / 1000));
    events.push(createBarEvent(timestamp, 'BTC-USDT'));
  }
  
  return events;
}

