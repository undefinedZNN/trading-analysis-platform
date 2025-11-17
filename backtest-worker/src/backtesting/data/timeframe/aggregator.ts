/**
 * OHLCV 聚合器实现
 * 
 * 负责将多个 bar 聚合成一个，正确计算 OHLCV 值
 */

import Big from 'big.js';
import { BarEvent, AggregatedBar, OHLCVAggregator, FeatureAggregationStrategy } from './interfaces';

/**
 * 标准 OHLCV 聚合器
 */
export class StandardOHLCVAggregator implements OHLCVAggregator {
  constructor(
    private featureStrategy?: FeatureAggregationStrategy
  ) {}

  /**
   * 聚合多个 bars
   */
  aggregate(bars: BarEvent[]): AggregatedBar {
    if (bars.length === 0) {
      throw new Error('Cannot aggregate empty bars array');
    }

    // 单个 bar 直接返回
    if (bars.length === 1) {
      const bar = bars[0];
      return {
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        trades: bar.trades,
        notional: bar.notional,
        barCount: 1,
      };
    }

    // 多个 bars 聚合
    const firstBar = bars[0];
    const lastBar = bars[bars.length - 1];

    // Open: 第一根 bar 的 open
    const open = firstBar.open;

    // Close: 最后一根 bar 的 close
    const close = lastBar.close;

    // High: 所有 bar 中的最高价
    const high = bars.reduce((max, bar) => {
      return new Big(bar.high).gt(max) ? new Big(bar.high) : max;
    }, new Big(firstBar.high)).toFixed();

    // Low: 所有 bar 中的最低价
    const low = bars.reduce((min, bar) => {
      return new Big(bar.low).lt(min) ? new Big(bar.low) : min;
    }, new Big(firstBar.low)).toFixed();

    // Volume: 累计 volume
    const volume = bars.reduce((sum, bar) => {
      return sum.plus(bar.volume);
    }, new Big(0)).toFixed();

    // Trades: 累计 trades（如果有）
    let trades: number | undefined;
    if (bars.every(bar => bar.trades !== undefined)) {
      trades = bars.reduce((sum, bar) => sum + (bar.trades || 0), 0);
    }

    // Notional: 累计 notional（如果有）
    let notional: string | undefined;
    if (bars.every(bar => bar.notional !== undefined)) {
      notional = bars.reduce((sum, bar) => {
        return sum.plus(bar.notional || '0');
      }, new Big(0)).toFixed();
    }

    return {
      open,
      high,
      low,
      close,
      volume,
      trades,
      notional,
      barCount: bars.length,
    };
  }

  /**
   * 聚合特征字段
   */
  aggregateFeatures(bars: BarEvent[]): Record<string, string | number> {
    if (bars.length === 0 || !this.featureStrategy) {
      return {};
    }

    // 收集所有特征键
    const featureKeys = new Set<string>();
    bars.forEach(bar => {
      if (bar.features) {
        Object.keys(bar.features).forEach(key => featureKeys.add(key));
      }
    });

    // 聚合每个特征
    const aggregated: Record<string, string | number> = {};
    featureKeys.forEach(key => {
      const values = bars
        .map(bar => bar.features?.[key])
        .filter(v => v !== undefined) as Array<string | number>;

      if (values.length > 0) {
        aggregated[key] = this.featureStrategy!.aggregate(values);
      }
    });

    return aggregated;
  }
}

/**
 * 成交量加权 OHLCV 聚合器
 * VWAP (Volume Weighted Average Price) 计算
 */
export class VolumeWeightedOHLCVAggregator extends StandardOHLCVAggregator {
  aggregate(bars: BarEvent[]): AggregatedBar {
    // 先使用标准聚合获取基础数据
    const basic = super.aggregate(bars);

    // 如果只有一个 bar 或没有 volume，直接返回
    if (bars.length === 1 || bars.every(bar => new Big(bar.volume).eq(0))) {
      return basic;
    }

    // 计算 VWAP 作为 close 价格
    let totalVolumePrice = new Big(0);
    let totalVolume = new Big(0);

    bars.forEach(bar => {
      const volume = new Big(bar.volume);
      const close = new Big(bar.close);
      totalVolumePrice = totalVolumePrice.plus(volume.times(close));
      totalVolume = totalVolume.plus(volume);
    });

    // 避免除以零
    if (totalVolume.gt(0)) {
      basic.close = totalVolumePrice.div(totalVolume).toFixed();
    }

    return basic;
  }
}

/**
 * 默认特征聚合策略：取最后一个值
 */
export class LastValueFeatureStrategy implements FeatureAggregationStrategy {
  aggregate(values: Array<string | number>): string | number {
    return values[values.length - 1];
  }
}

/**
 * 平均值特征聚合策略（仅用于数值）
 */
export class AverageFeatureStrategy implements FeatureAggregationStrategy {
  aggregate(values: Array<string | number>): string | number {
    // 如果包含字符串，返回最后一个值
    if (values.some(v => typeof v === 'string')) {
      return values[values.length - 1];
    }

    // 计算平均值
    const sum = (values as number[]).reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  }
}

/**
 * 创建聚合器工厂函数
 */
export function createAggregator(
  method: 'standard' | 'volume-weighted' = 'standard',
  featureStrategy?: FeatureAggregationStrategy
): OHLCVAggregator {
  const strategy = featureStrategy || new LastValueFeatureStrategy();

  if (method === 'volume-weighted') {
    return new VolumeWeightedOHLCVAggregator(strategy);
  }

  return new StandardOHLCVAggregator(strategy);
}

