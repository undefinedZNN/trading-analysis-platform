/**
 * 重采样集成测试
 * 
 * 测试完整的重采样流程，从 1s 到 5m
 */

import { of } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { TimeframeAdapterImpl } from '../../adapter';
import { BarEvent } from '../../interfaces';

describe('Resampling Integration', () => {
  let adapter: TimeframeAdapterImpl;

  beforeEach(() => {
    adapter = new TimeframeAdapterImpl();
  });

  const createBars = (): BarEvent[] => {
    const bars: BarEvent[] = [];
    const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();

    // 创建 5 分钟的 1s bars（300 个）
    for (let i = 0; i < 300; i++) {
      const timestamp = new Date(baseTime + i * 1000).toISOString();
      const price = 100 + Math.sin(i / 10) * 10; // 模拟价格波动

      bars.push({
        sequenceId: `seq-${i}`,
        timestamp,
        symbol: 'BTC-USDT',
        timeframe: '1s',
        open: price.toFixed(2),
        high: (price + 1).toFixed(2),
        low: (price - 1).toFixed(2),
        close: price.toFixed(2),
        volume: '100',
        source: 'test',
      });
    }

    return bars;
  };

  it('应该将 1s bars 正确聚合为 5m bars', async () => {
    const sourceBars = createBars();
    const source$ = of(...sourceBars);

    const resampled$ = adapter.resample(source$, '5m', {
      alignmentMode: 'close',
      dropIncomplete: false,
    });

    const result = await resampled$.pipe(toArray()).toPromise();

    // 300 个 1s bars 应该产生 1 个 5m bar
    expect(result).toHaveLength(1);

    const bar = result[0];
    expect(bar.timeframe).toBe('5m');
    expect(bar.symbol).toBe('BTC-USDT');
    
    // 验证 OHLCV 聚合
    expect(bar.open).toBe(sourceBars[0].open);
    expect(bar.close).toBe(sourceBars[sourceBars.length - 1].close);
    
    // Volume 应该是所有 bar 的总和
    expect(parseFloat(bar.volume)).toBe(300 * 100);
    
    // 时间戳应该对齐到 5m 边界
    expect(bar.timestamp).toBe('2024-01-01T00:05:00.000Z');
  });

  it('应该正确处理多个 5m 窗口', async () => {
    // 创建 10 分钟的数据
    const bars: BarEvent[] = [];
    const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();

    for (let i = 0; i < 600; i++) { // 600 秒 = 10 分钟
      const timestamp = new Date(baseTime + i * 1000).toISOString();
      bars.push({
        sequenceId: `seq-${i}`,
        timestamp,
        symbol: 'BTC-USDT',
        timeframe: '1s',
        open: '100',
        high: '101',
        low: '99',
        close: '100',
        volume: '10',
        source: 'test',
      });
    }

    const source$ = of(...bars);
    const resampled$ = adapter.resample(source$, '5m');

    const result = await resampled$.pipe(toArray()).toPromise();

    // 应该产生 2 个 5m bars
    expect(result).toHaveLength(2);

    expect(result[0].timestamp).toBe('2024-01-01T00:05:00.000Z');
    expect(result[1].timestamp).toBe('2024-01-01T00:10:00.000Z');
  });

  it('应该保留并聚合特征字段', async () => {
    const bars: BarEvent[] = [];
    const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();

    for (let i = 0; i < 300; i++) {
      bars.push({
        sequenceId: `seq-${i}`,
        timestamp: new Date(baseTime + i * 1000).toISOString(),
        symbol: 'BTC-USDT',
        timeframe: '1s',
        open: '100',
        high: '101',
        low: '99',
        close: '100',
        volume: '10',
        source: 'test',
        features: {
          rsi: 50 + i / 10, // 递增的 RSI
          volume_ma: 100,
        },
      });
    }

    const source$ = of(...bars);
    const resampled$ = adapter.resample(source$, '5m', {
      preserveFeatures: true,
    });

    const result = await resampled$.pipe(toArray()).toPromise();

    expect(result).toHaveLength(1);
    expect(result[0].features).toBeDefined();
    // 特征应该被聚合（默认取最后一个值）
    expect(result[0].features?.rsi).toBeDefined();
  });
});

