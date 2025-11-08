/**
 * MACD (Moving Average Convergence Divergence) - 指数平滑异同移动平均线
 * 
 * MACD 是一个趋势跟踪动量指标，由三部分组成：
 * 1. MACD Line = EMA(close, fast) - EMA(close, slow)
 * 2. Signal Line = EMA(MACD Line, signal)
 * 3. MACD Histogram = MACD Line - Signal Line
 * 
 * 使用方法：
 * - MACD Line 上穿 Signal Line: 买入信号
 * - MACD Line 下穿 Signal Line: 卖出信号
 * - Histogram > 0: 多头趋势
 * - Histogram < 0: 空头趋势
 */

import { Observable } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * MACD 状态
 */
interface MACDState {
  bar: BarEvent;
  fastEMA?: string;
  slowEMA?: string;
  signalEMA?: string;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  count: number;
}

/**
 * 计算 EMA 平滑因子
 */
function calculateAlpha(period: number): Big {
  return new Big(2).div(period + 1);
}

/**
 * MACD 特征定义
 */
export const MACDFeature: FeatureDefinition = {
  id: 'MACD',
  description: 'Moving Average Convergence Divergence - 指数平滑异同移动平均线',
  category: 'trend',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => {
    const fast = params?.fastPeriod || 12;
    const slow = params?.slowPeriod || 26;
    const signal = params?.signalPeriod || 9;
    return `MACD(${fast}, ${slow}, ${signal})`;
  },
  
  valueType: 'number',
  unit: 'price',
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    source: 'close',
  },
  
  paramSchema: {
    fastPeriod: {
      type: 'integer',
      required: false,
      min: 2,
      max: 100,
      default: 12,
      description: 'Fast EMA period',
    },
    slowPeriod: {
      type: 'integer',
      required: false,
      min: 2,
      max: 200,
      default: 26,
      description: 'Slow EMA period',
    },
    signalPeriod: {
      type: 'integer',
      required: false,
      min: 2,
      max: 50,
      default: 9,
      description: 'Signal line period',
    },
    source: {
      type: 'enum',
      enum: ['open', 'high', 'low', 'close'],
      default: 'close',
      description: 'Price field to use for calculation',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent> {
    const fastPeriod = (params?.fastPeriod as number) || 12;
    const slowPeriod = (params?.slowPeriod as number) || 26;
    const signalPeriod = (params?.signalPeriod as number) || 9;
    const source = (params?.source as string) || 'close';
    
    const fastAlpha = calculateAlpha(fastPeriod);
    const slowAlpha = calculateAlpha(slowPeriod);
    const signalAlpha = calculateAlpha(signalPeriod);
    
    return stream.pipe(
      scan<BarEvent, MACDState>(
        (state, bar) => {
          const priceValue = bar[source as keyof BarEvent];
          
          // 确保price是有效的string
          if (typeof priceValue !== 'string' || !priceValue) {
            return {
              bar,
              fastEMA: state.fastEMA,
              slowEMA: state.slowEMA,
              signalEMA: state.signalEMA,
              fastPeriod,
              slowPeriod,
              signalPeriod,
              count: state.count,
            };
          }
          
          const price = new Big(priceValue);
          
          // 第一个bar，初始化EMA
          if (state.count === 0) {
            return {
              bar,
              fastEMA: price.toFixed(8),
              slowEMA: price.toFixed(8),
              signalEMA: undefined,
              fastPeriod,
              slowPeriod,
              signalPeriod,
              count: 1,
            };
          }
          
          // 计算 Fast EMA
          const prevFastEMA = new Big(state.fastEMA!);
          const fastEMA = fastAlpha.times(price).plus(
            new Big(1).minus(fastAlpha).times(prevFastEMA)
          );
          
          // 计算 Slow EMA
          const prevSlowEMA = new Big(state.slowEMA!);
          const slowEMA = slowAlpha.times(price).plus(
            new Big(1).minus(slowAlpha).times(prevSlowEMA)
          );
          
          // 计算 MACD Line
          const macdLine = fastEMA.minus(slowEMA);
          
          // 计算 Signal Line
          let signalEMA: Big;
          if (!state.signalEMA) {
            // 第一个 MACD Line 值作为初始 Signal
            signalEMA = macdLine;
          } else {
            const prevSignalEMA = new Big(state.signalEMA);
            signalEMA = signalAlpha.times(macdLine).plus(
              new Big(1).minus(signalAlpha).times(prevSignalEMA)
            );
          }
          
          return {
            bar,
            fastEMA: fastEMA.toFixed(8),
            slowEMA: slowEMA.toFixed(8),
            signalEMA: signalEMA.toFixed(8),
            fastPeriod,
            slowPeriod,
            signalPeriod,
            count: state.count + 1,
          };
        },
        {
          bar: {} as BarEvent,
          fastEMA: undefined,
          slowEMA: undefined,
          signalEMA: undefined,
          fastPeriod,
          slowPeriod,
          signalPeriod,
          count: 0,
        }
      ),
      map((state) => {
        // 如果没有有效的EMA值，返回原始bar
        if (!state.fastEMA || !state.slowEMA || !state.signalEMA) {
          return state.bar;
        }
        
        // 计算所有 MACD 值
        const fastEMA = new Big(state.fastEMA);
        const slowEMA = new Big(state.slowEMA);
        const macdLine = fastEMA.minus(slowEMA);
        const signalLine = new Big(state.signalEMA);
        const histogram = macdLine.minus(signalLine);
        
        return {
          ...state.bar,
          features: {
            ...state.bar.features,
            MACD_Line: macdLine.toFixed(4),
            MACD_Signal: signalLine.toFixed(4),
            MACD_Histogram: histogram.toFixed(4),
            MACD: macdLine.toFixed(4), // 默认输出 MACD Line
          },
        };
      })
    );
  },
};

/**
 * 标准 MACD (12, 26, 9)
 */
export const MACD_12_26_9: FeatureDefinition = {
  ...MACDFeature,
  id: 'MACD_12_26_9',
  description: 'MACD with standard parameters (12, 26, 9)',
  displayName: 'MACD(12, 26, 9)',
};

/**
 * 创建自定义参数的 MACD 特征
 */
export function createMACDFeature(
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number
): FeatureDefinition {
  return {
    ...MACDFeature,
    id: `MACD_${fastPeriod}_${slowPeriod}_${signalPeriod}`,
    displayName: `MACD(${fastPeriod}, ${slowPeriod}, ${signalPeriod})`,
    defaultParams: {
      fastPeriod,
      slowPeriod,
      signalPeriod,
      source: 'close',
    },
  };
}

