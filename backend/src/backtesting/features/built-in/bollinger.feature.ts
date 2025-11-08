/**
 * Bollinger Bands - 布林带
 * 
 * 布林带由三条线组成：
 * 1. Middle Band = SMA(close, period)
 * 2. Upper Band = Middle Band + (stdDev * multiplier)
 * 3. Lower Band = Middle Band - (stdDev * multiplier)
 * 
 * 还包括两个派生指标：
 * - %B = (close - Lower Band) / (Upper Band - Lower Band)
 * - Bandwidth = (Upper Band - Lower Band) / Middle Band
 * 
 * 使用方法：
 * - 价格触及上轨: 超买信号
 * - 价格触及下轨: 超卖信号
 * - Bandwidth 收窄: 波动率降低，可能突破
 * - %B > 1: 价格在上轨之上
 * - %B < 0: 价格在下轨之下
 */

import { Observable } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * Bollinger Bands 状态
 */
interface BollingerState {
  bar: BarEvent;
  window: string[];
  period: number;
  multiplier: number;
}

/**
 * 计算标准差
 */
function calculateStdDev(values: string[], mean: Big): Big {
  if (values.length === 0) {
    return new Big(0);
  }
  
  // 计算方差
  let variance = new Big(0);
  for (const value of values) {
    const diff = new Big(value).minus(mean);
    variance = variance.plus(diff.times(diff));
  }
  
  variance = variance.div(values.length);
  
  // 标准差 = sqrt(方差)
  // big.js 没有 sqrt，我们使用牛顿迭代法
  return sqrt(variance);
}

/**
 * 牛顿迭代法计算平方根
 */
function sqrt(value: Big): Big {
  if (value.eq(0)) {
    return new Big(0);
  }
  
  if (value.lt(0)) {
    throw new Error('Cannot calculate square root of negative number');
  }
  
  // 初始猜测
  let x = value.div(2);
  let prev = new Big(0);
  
  // 迭代直到收敛
  let iterations = 0;
  const maxIterations = 100;
  const precision = new Big(0.00000001);
  
  while (iterations < maxIterations) {
    prev = x;
    // x = (x + value/x) / 2
    x = x.plus(value.div(x)).div(2);
    
    // 检查收敛
    if (x.minus(prev).abs().lt(precision)) {
      break;
    }
    
    iterations++;
  }
  
  return x;
}

/**
 * Bollinger Bands 特征定义
 */
export const BollingerBandsFeature: FeatureDefinition = {
  id: 'BollingerBands',
  description: 'Bollinger Bands - 布林带',
  category: 'volatility',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => {
    const period = params?.period || 20;
    const multiplier = params?.multiplier || 2;
    return `BB(${period}, ${multiplier})`;
  },
  
  valueType: 'number',
  unit: 'price',
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    period: 20,
    multiplier: 2,
    source: 'close',
  },
  
  paramSchema: {
    period: {
      type: 'integer',
      required: false,
      min: 2,
      max: 200,
      default: 20,
      description: 'Period for moving average',
    },
    multiplier: {
      type: 'number',
      required: false,
      min: 0.5,
      max: 5,
      default: 2,
      description: 'Standard deviation multiplier',
    },
    source: {
      type: 'enum',
      enum: ['open', 'high', 'low', 'close'],
      default: 'close',
      description: 'Price field to use for calculation',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent> {
    const period = (params?.period as number) || 20;
    const multiplier = (params?.multiplier as number) || 2;
    const source = (params?.source as string) || 'close';
    
    return stream.pipe(
      scan<BarEvent, BollingerState>(
        (state, bar) => {
          const price = bar[source as keyof BarEvent] as string;
          const window = [...state.window, price];
          
          // 保持窗口大小
          if (window.length > period) {
            window.shift();
          }
          
          return {
            bar,
            window,
            period,
            multiplier,
          };
        },
        {
          bar: {} as BarEvent,
          window: [],
          period,
          multiplier,
        }
      ),
      map((state) => {
        // 窗口未满，不输出
        if (state.window.length < period) {
          return state.bar;
        }
        
        // 计算 Middle Band (SMA)
        let sum = new Big(0);
        for (const value of state.window) {
          sum = sum.plus(new Big(value));
        }
        const middleBand = sum.div(period);
        
        // 计算标准差
        const stdDev = calculateStdDev(state.window, middleBand);
        
        // 计算 Upper 和 Lower Band
        const offset = stdDev.times(state.multiplier);
        const upperBand = middleBand.plus(offset);
        const lowerBand = middleBand.minus(offset);
        
        // 计算 %B
        const close = new Big(state.bar.close as string);
        const bandWidth = upperBand.minus(lowerBand);
        let percentB = new Big(0.5); // 默认中间位置
        
        if (!bandWidth.eq(0)) {
          percentB = close.minus(lowerBand).div(bandWidth);
        }
        
        // 计算 Bandwidth
        let bandwidth = new Big(0);
        if (!middleBand.eq(0)) {
          bandwidth = bandWidth.div(middleBand).times(100); // 百分比
        }
        
        return {
          ...state.bar,
          features: {
            ...state.bar.features,
            BB_Upper: upperBand.toFixed(4),
            BB_Middle: middleBand.toFixed(4),
            BB_Lower: lowerBand.toFixed(4),
            BB_PercentB: percentB.toFixed(4),
            BB_Bandwidth: bandwidth.toFixed(4),
          },
        };
      })
    );
  },
};

/**
 * 标准布林带 (20, 2)
 */
export const BB_20_2: FeatureDefinition = {
  ...BollingerBandsFeature,
  id: 'BB_20_2',
  description: 'Bollinger Bands with standard parameters (20, 2)',
  displayName: 'BB(20, 2)',
};

/**
 * 创建自定义参数的布林带特征
 */
export function createBollingerBandsFeature(
  period: number,
  multiplier: number
): FeatureDefinition {
  return {
    ...BollingerBandsFeature,
    id: `BB_${period}_${multiplier}`,
    displayName: `BB(${period}, ${multiplier})`,
    defaultParams: {
      period,
      multiplier,
      source: 'close',
    },
  };
}

