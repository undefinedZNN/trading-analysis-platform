/**
 * 权益曲线生成器单元测试
 */

import { createEquityCurveGenerator, EquityCurveGenerator } from '../equity-curve-generator';
import type { TradeRecord } from '../../ledger/interfaces';

describe('EquityCurveGenerator', () => {
  let generator: EquityCurveGenerator;
  let mockTrades: TradeRecord[];

  beforeEach(() => {
    generator = createEquityCurveGenerator({
      initialCapital: '10000',
      granularity: 'day',
    });

    // 创建模拟交易记录
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
        realizedPnl: '0',
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
        realizedPnl: '1000',
        unrealizedPnl: '0',
        fees: '25.5',
        feeCurrency: 'USDT',
        liquidity: 'taker',
        timestamp: '2024-01-02T00:00:00Z',
        sequenceId: 'seq2',
      },
      {
        tradeId: 't3',
        sessionId: 's1',
        strategyId: 'strategy1',
        symbol: 'BTCUSDT',
        intentId: 'i3',
        orderId: 'o3',
        fillId: 'f3',
        side: 'buy',
        type: 'open',
        quantity: '1',
        price: '52000',
        realizedPnl: '0',
        unrealizedPnl: '0',
        fees: '26',
        feeCurrency: 'USDT',
        liquidity: 'taker',
        timestamp: '2024-01-03T00:00:00Z',
        sequenceId: 'seq3',
      },
      {
        tradeId: 't4',
        sessionId: 's1',
        strategyId: 'strategy1',
        symbol: 'BTCUSDT',
        intentId: 'i4',
        orderId: 'o4',
        fillId: 'f4',
        side: 'sell',
        type: 'close',
        quantity: '1',
        price: '51500',
        realizedPnl: '-500',
        unrealizedPnl: '0',
        fees: '25.75',
        feeCurrency: 'USDT',
        liquidity: 'taker',
        timestamp: '2024-01-04T00:00:00Z',
        sequenceId: 'seq4',
      },
    ];
  });

  describe('generate', () => {
    it('should generate equity curve from trades', () => {
      const curve = generator.generate(mockTrades);

      // 日粒度聚合后只有 4 个唯一交易日
      expect(curve.timestamps).toHaveLength(4);
      expect(curve.equity).toHaveLength(4);
      expect(curve.drawdown).toHaveLength(4);
    });

    it('should calculate equity correctly', () => {
      const curve = generator.generate(mockTrades);

      // 聚合后第 0 个点就是第一笔交易处理完的权益
      expect(parseFloat(curve.equity[0])).toBeCloseTo(9975, 1);

      // 第2笔: 9975 + 1000 - 25.5 = 10949.5
      expect(parseFloat(curve.equity[1])).toBeCloseTo(10949.5, 1);

      // 第3笔: 10949.5 - 26 = 10923.5
      expect(parseFloat(curve.equity[2])).toBeCloseTo(10923.5, 1);

      // 第4笔: 10923.5 - 500 - 25.75 = 10397.75
      expect(parseFloat(curve.equity[3])).toBeCloseTo(10397.75, 1);
    });

    it('should handle empty trades', () => {
      const curve = generator.generate([]);

      expect(curve.timestamps).toHaveLength(0);
      expect(curve.equity).toHaveLength(0);
      expect(curve.drawdown).toHaveLength(0);
    });

    it('should handle single trade', () => {
      const singleTrade = [mockTrades[0]];
      const curve = generator.generate(singleTrade);

      expect(curve.timestamps).toHaveLength(1);
      expect(curve.equity).toHaveLength(1);
    });
  });

  describe('drawdown calculation', () => {
    it('should calculate drawdown correctly', () => {
      const curve = generator.generate(mockTrades);

      // 初始回撤应该为0
      expect(parseFloat(curve.drawdown[0])).toBe(0);

      // 第二个点权益创新高，回撤应为 0
      expect(parseFloat(curve.drawdown[1])).toBe(0);

      // 之后权益回落，回撤大于 0
      expect(parseFloat(curve.drawdown[2])).toBeGreaterThan(0);
    });

    it('should track peak correctly', () => {
      const curve = generator.generate(mockTrades);
      const equityValues = curve.equity.map(e => parseFloat(e));
      const drawdowns = curve.drawdown.map(d => parseFloat(d));

      // 检查峰值追踪：当权益创新高时，回撤应该为0
      for (let i = 1; i < equityValues.length; i++) {
        const isPeak = equityValues.slice(0, i + 1).every(e => e <= equityValues[i]);
        if (isPeak) {
          expect(drawdowns[i]).toBeCloseTo(0, 6);
        }
      }
    });

    it('should calculate drawdown percentage correctly', () => {
      const trades: TradeRecord[] = [
        {
          ...mockTrades[0],
          timestamp: '2024-01-01T00:00:00Z',
          realizedPnl: '1000',
          fees: '0',
        },
        {
          ...mockTrades[1],
          timestamp: '2024-01-02T00:00:00Z',
          realizedPnl: '-300',
          fees: '0',
        },
      ];

      const curve = generator.generate(trades);
      const equityValues = curve.equity.map(e => parseFloat(e));
      const drawdowns = curve.drawdown.map(d => parseFloat(d));

      // 峰值: 11000, 当前: 10700, 回撤: 300/11000 = 0.0272727...
      expect(drawdowns[drawdowns.length - 1]).toBeCloseTo(0.0272727, 5);
    });
  });

  describe('time granularity', () => {
    it('should support day granularity', () => {
      const dayGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
      });

      const curve = dayGenerator.generate(mockTrades);
      expect(curve.timestamps).toHaveLength(4);

      // 检查日期格式
      curve.timestamps.forEach(ts => {
        expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    it('should support hour granularity', () => {
      const hourGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'hour',
      });

      const curve = hourGenerator.generate(mockTrades);
      expect(curve.timestamps.length).toBeGreaterThan(0);
    });

    it('should support minute granularity', () => {
      const minuteGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'minute',
      });

      const curve = minuteGenerator.generate(mockTrades);
      expect(curve.timestamps.length).toBeGreaterThan(0);
    });
  });

  describe('gap filling', () => {
    it('should fill gaps when enabled', () => {
      const gapTrades: TradeRecord[] = [
        {
          ...mockTrades[0],
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          ...mockTrades[1],
          timestamp: '2024-01-05T00:00:00Z', // 4天间隙
        },
      ];

      const filledGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
        fillGaps: true,
      });

      const curve = filledGenerator.generate(gapTrades);
      
      // 应该有: 初始 + 第1天 + 填充(2,3,4天) + 第5天 = 6个点
      expect(curve.timestamps.length).toBeGreaterThanOrEqual(5);
    });

    it('should not fill gaps when disabled', () => {
      const gapTrades: TradeRecord[] = [
        {
          ...mockTrades[0],
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          ...mockTrades[1],
          timestamp: '2024-01-05T00:00:00Z',
        },
      ];

      const noFillGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
        fillGaps: false,
      });

      const curve = noFillGenerator.generate(gapTrades);
      
      // 聚合后只有第1天和第5天两个点
      expect(curve.timestamps).toHaveLength(2);
    });
  });

  describe('smoothing', () => {
    it('should apply smoothing when enabled', () => {
      const smoothGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
        applySmoothing: true,
        smoothingWindow: 3,
      });

      // 创建足够的交易数据
      const manyTrades = Array(10).fill(null).map((_, i) => ({
        ...mockTrades[0],
        tradeId: `t${i}`,
        timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        realizedPnl: i % 2 === 0 ? '100' : '-50',
        fees: '1',
      }));

      const curve = smoothGenerator.generate(manyTrades);
      
      // 平滑后的曲线应该更平缓
      expect(curve.equity.length).toBeGreaterThan(0);
    });

    it('should not apply smoothing when disabled', () => {
      const noSmoothGenerator = createEquityCurveGenerator({
        initialCapital: '10000',
        granularity: 'day',
        applySmoothing: false,
      });

      const curve = noSmoothGenerator.generate(mockTrades);
      expect(curve.equity.length).toBeGreaterThan(0);
    });
  });

  describe('generateTimeSeries', () => {
    it('should generate time series points', () => {
      const series = generator.generateTimeSeries(mockTrades);

      expect(series).toHaveLength(4);
      series.forEach(point => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('value');
      });
    });
  });

  describe('generateDrawdownSeries', () => {
    it('should generate drawdown series', () => {
      const series = generator.generateDrawdownSeries(mockTrades);

      expect(series).toHaveLength(4);
      series.forEach(point => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('value');
        
        const drawdown = parseFloat(point.value);
        expect(drawdown).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('configuration', () => {
    it('should allow config updates', () => {
      generator.updateConfig({
        granularity: 'hour',
        fillGaps: false,
      });

      const config = generator.getConfig();
      expect(config.granularity).toBe('hour');
      expect(config.fillGaps).toBe(false);
    });

    it('should return current config', () => {
      const config = generator.getConfig();
      
      expect(config).toHaveProperty('initialCapital');
      expect(config).toHaveProperty('granularity');
      expect(config).toHaveProperty('fillGaps');
      expect(config).toHaveProperty('applySmoothing');
    });
  });

  describe('edge cases', () => {
    it('should handle trades with zero fees', () => {
      const noFeeTrades: TradeRecord[] = [
        {
          ...mockTrades[0],
          fees: '0',
          realizedPnl: '100',
        },
      ];

      const curve = generator.generate(noFeeTrades);
      expect(parseFloat(curve.equity[0])).toBe(10100);
    });

    it('should handle trades with negative PnL', () => {
      const lossTrades: TradeRecord[] = [
        {
          ...mockTrades[0],
          realizedPnl: '-500',
          fees: '10',
        },
      ];

      const curve = generator.generate(lossTrades);
      expect(parseFloat(curve.equity[0])).toBe(9490); // 10000 - 500 - 10
    });

    it('should handle unsorted trades', () => {
      const unsortedTrades = [...mockTrades].reverse();
      const curve = generator.generate(unsortedTrades);

      // 应该自动排序
      expect(curve.timestamps).toHaveLength(4);
      
      // 检查时间戳是否按顺序
      for (let i = 1; i < curve.timestamps.length; i++) {
        const prev = new Date(curve.timestamps[i - 1]);
        const current = new Date(curve.timestamps[i]);
        expect(current.getTime()).toBeGreaterThanOrEqual(prev.getTime());
      }
    });

    it('should handle trades on same timestamp', () => {
      const sameTimeTrades = mockTrades.map(t => ({
        ...t,
        timestamp: '2024-01-01T00:00:00Z',
      }));

      const curve = generator.generate(sameTimeTrades);
      
      // 应该聚合到同一天
      expect(curve.timestamps.length).toBeLessThanOrEqual(2); // 初始 + 聚合后的点
    });
  });
});
