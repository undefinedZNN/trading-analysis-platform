/**
 * OHLCV 聚合器单元测试
 */

import { StandardOHLCVAggregator, VolumeWeightedOHLCVAggregator, LastValueFeatureStrategy, AverageFeatureStrategy } from '../aggregator';
import { BarEvent } from '../interfaces';

describe('OHLCVAggregator', () => {
  const createMockBar = (
    timestamp: string,
    open: string,
    high: string,
    low: string,
    close: string,
    volume: string
  ): BarEvent => ({
    sequenceId: `seq-${timestamp}`,
    timestamp,
    symbol: 'BTC-USDT',
    timeframe: '1m',
    open,
    high,
    low,
    close,
    volume,
    source: 'test',
  });

  describe('StandardOHLCVAggregator', () => {
    let aggregator: StandardOHLCVAggregator;

    beforeEach(() => {
      aggregator = new StandardOHLCVAggregator();
    });

    it('应该抛出错误当 bars 数组为空', () => {
      expect(() => aggregator.aggregate([])).toThrow('Cannot aggregate empty bars array');
    });

    it('应该正确处理单个 bar', () => {
      const bar = createMockBar('2024-01-01T00:00:00.000Z', '100', '110', '95', '105', '1000');
      const result = aggregator.aggregate([bar]);

      expect(result.open).toBe('100');
      expect(result.high).toBe('110');
      expect(result.low).toBe('95');
      expect(result.close).toBe('105');
      expect(result.volume).toBe('1000');
      expect(result.barCount).toBe(1);
    });

    it('应该正确聚合多个 bars', () => {
      const bars = [
        createMockBar('2024-01-01T00:00:00.000Z', '100', '110', '95', '105', '1000'),
        createMockBar('2024-01-01T00:01:00.000Z', '105', '115', '100', '108', '1200'),
        createMockBar('2024-01-01T00:02:00.000Z', '108', '120', '105', '112', '1500'),
      ];

      const result = aggregator.aggregate(bars);

      // Open: 第一根的 open
      expect(result.open).toBe('100');
      
      // High: 所有 bars 中的最高价
      expect(result.high).toBe('120');
      
      // Low: 所有 bars 中的最低价
      expect(result.low).toBe('95');
      
      // Close: 最后一根的 close
      expect(result.close).toBe('112');
      
      // Volume: 累计
      expect(result.volume).toBe('3700');
      
      expect(result.barCount).toBe(3);
    });

    it('应该正确累计 trades 和 notional', () => {
      const bars = [
        {
          ...createMockBar('2024-01-01T00:00:00.000Z', '100', '110', '95', '105', '1000'),
          trades: 10,
          notional: '100000',
        },
        {
          ...createMockBar('2024-01-01T00:01:00.000Z', '105', '115', '100', '108', '1200'),
          trades: 15,
          notional: '120000',
        },
      ];

      const result = aggregator.aggregate(bars);

      expect(result.trades).toBe(25);
      expect(result.notional).toBe('220000');
    });
  });

  describe('VolumeWeightedOHLCVAggregator', () => {
    let aggregator: VolumeWeightedOHLCVAggregator;

    beforeEach(() => {
      aggregator = new VolumeWeightedOHLCVAggregator();
    });

    it('应该使用VWAP作为close价格', () => {
      const bars = [
        createMockBar('2024-01-01T00:00:00.000Z', '100', '110', '95', '100', '1000'),
        createMockBar('2024-01-01T00:01:00.000Z', '105', '115', '100', '200', '500'),
      ];

      const result = aggregator.aggregate(bars);

      // VWAP = (100 * 1000 + 200 * 500) / (1000 + 500)
      //      = (100000 + 100000) / 1500
      //      = 200000 / 1500
      //      = 133.33...
      
      expect(parseFloat(result.close)).toBeCloseTo(133.33, 2);
    });

    it('应该处理零成交量情况', () => {
      const bars = [
        createMockBar('2024-01-01T00:00:00.000Z', '100', '110', '95', '105', '0'),
      ];

      const result = aggregator.aggregate(bars);

      // 零成交量时应该保持原来的 close
      expect(result.close).toBe('105');
    });
  });

  describe('FeatureAggregationStrategy', () => {
    describe('LastValueFeatureStrategy', () => {
      it('应该返回最后一个值', () => {
        const strategy = new LastValueFeatureStrategy();
        expect(strategy.aggregate([1, 2, 3])).toBe(3);
        expect(strategy.aggregate(['a', 'b', 'c'])).toBe('c');
      });
    });

    describe('AverageFeatureStrategy', () => {
      it('应该计算数值的平均值', () => {
        const strategy = new AverageFeatureStrategy();
        expect(strategy.aggregate([10, 20, 30])).toBe(20);
        expect(strategy.aggregate([100])).toBe(100);
      });

      it('如果包含字符串，应该返回最后一个值', () => {
        const strategy = new AverageFeatureStrategy();
        expect(strategy.aggregate(['a', 'b', 'c'])).toBe('c');
        expect(strategy.aggregate([1, 'a', 3])).toBe(3);
      });
    });
  });
});

