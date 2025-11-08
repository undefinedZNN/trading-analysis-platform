/**
 * ATR (Average True Range) - 平均真实波动
 */

import { Observable } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * ATR 状态
 */
interface ATRState {
  bar: BarEvent;
  prevClose?: string;
  atr?: string;
  period: number;
  count: number;
  trSum: string;
}

/**
 * 计算 True Range
 */
function calculateTR(high: Big, low: Big, prevClose?: Big): Big {
  const hl = high.minus(low);
  
  if (!prevClose) {
    return hl;
  }
  
  const hc = high.minus(prevClose).abs();
  const lc = low.minus(prevClose).abs();
  
  // Big.js doesn't have max, so we do it manually
  let max = hl;
  if (hc.gt(max)) max = hc;
  if (lc.gt(max)) max = lc;
  
  return max;
}

/**
 * ATR 特征定义
 */
export const ATRFeature: FeatureDefinition = {
  id: 'ATR',
  description: 'Average True Range - 平均真实波动',
  category: 'volatility',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'high', type: 'field' },
    { ref: 'low', type: 'field' },
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => {
    const period = params?.period || 14;
    return `ATR(${period})`;
  },
  
  valueType: 'number',
  unit: 'price',
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    period: 14,
  },
  
  paramSchema: {
    period: {
      type: 'integer',
      required: false,
      min: 1,
      max: 100,
      default: 14,
      description: 'ATR period',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent> {
    const period = (params?.period as number) || 14;
    
    return stream.pipe(
      scan<BarEvent, ATRState>(
        (state, bar) => {
          const high = new Big(bar.high as string);
          const low = new Big(bar.low as string);
          const close = new Big(bar.close as string);
          const prevClose = state.prevClose ? new Big(state.prevClose) : undefined;
          
          // 计算 True Range
          const tr = calculateTR(high, low, prevClose);
          
          // 第一个bar，初始化
          if (state.count === 0) {
            return {
              bar,
              prevClose: close.toFixed(8),
              atr: undefined,
              period,
              count: 1,
              trSum: tr.toFixed(8),
            };
          }
          
          let newATR: string | undefined;
          let newTRSum: string;
          
          if (state.count < period) {
            // 累积 TR
            newTRSum = new Big(state.trSum).plus(tr).toFixed(8);
            newATR = undefined;
          } else if (state.count === period) {
            // 第一个完整周期，计算初始 ATR
            newTRSum = new Big(state.trSum).plus(tr).toFixed(8);
            newATR = new Big(newTRSum).div(period).toFixed(4);
          } else {
            // 后续使用 Wilder's smoothing
            const prevATR = new Big(state.atr!);
            newATR = prevATR.times(period - 1).plus(tr).div(period).toFixed(4);
            newTRSum = state.trSum; // 不再需要累加
          }
          
          return {
            bar,
            prevClose: close.toFixed(8),
            atr: newATR,
            period,
            count: state.count + 1,
            trSum: newTRSum,
          };
        },
        {
          bar: {} as BarEvent,
          prevClose: undefined,
          atr: undefined,
          period,
          count: 0,
          trSum: '0',
        }
      ),
      map((state) => {
        // 前 period 个bar没有足够数据
        if (!state.atr) {
          return state.bar;
        }
        
        return {
          ...state.bar,
          features: {
            ...state.bar.features,
            ATR: state.atr,
            [`ATR_${period}`]: state.atr,
          },
        };
      })
    );
  },
};
