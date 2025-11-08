/**
 * RSI (Relative Strength Index) - 相对强弱指标
 */

import { Observable } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * RSI 状态
 */
interface RSIState {
  bar: BarEvent;
  prevClose?: string;
  avgGain: string;
  avgLoss: string;
  period: number;
  count: number;
}

/**
 * RSI 特征定义
 */
export const RSIFeature: FeatureDefinition = {
  id: 'RSI',
  description: 'Relative Strength Index - 相对强弱指标',
  category: 'momentum',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => {
    const period = params?.period || 14;
    return `RSI(${period})`;
  },
  
  valueType: 'number',
  unit: 'index',
  range: { min: 0, max: 100 },
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    period: 14,
    source: 'close',
  },
  
  paramSchema: {
    period: {
      type: 'integer',
      required: false,
      min: 2,
      max: 100,
      default: 14,
      description: 'RSI period',
    },
    source: {
      type: 'enum',
      enum: ['open', 'high', 'low', 'close'],
      default: 'close',
      description: 'Price field to use for calculation',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent> {
    const period = (params?.period as number) || 14;
    const source = (params?.source as string) || 'close';
    
    return stream.pipe(
      scan<BarEvent, RSIState>(
        (state, bar) => {
          const close = new Big(bar[source as keyof BarEvent] as string);
          
          // 第一个bar，初始化
          if (state.count === 0) {
            return {
              bar,
              prevClose: close.toFixed(8),
              avgGain: '0',
              avgLoss: '0',
              period,
              count: 1,
            };
          }
          
          // 计算变化
          const prevClose = new Big(state.prevClose!);
          const change = close.minus(prevClose);
          const gain = change.gt(0) ? change : new Big(0);
          const loss = change.lt(0) ? change.abs() : new Big(0);
          
          let newAvgGain: Big;
          let newAvgLoss: Big;
          
          if (state.count < period) {
            // 累积初始周期
            newAvgGain = new Big(state.avgGain).plus(gain);
            newAvgLoss = new Big(state.avgLoss).plus(loss);
          } else if (state.count === period) {
            // 第一个完整周期，计算平均
            newAvgGain = new Big(state.avgGain).plus(gain).div(period);
            newAvgLoss = new Big(state.avgLoss).plus(loss).div(period);
          } else {
            // 后续使用 Wilder's smoothing
            newAvgGain = new Big(state.avgGain).times(period - 1).plus(gain).div(period);
            newAvgLoss = new Big(state.avgLoss).times(period - 1).plus(loss).div(period);
          }
          
          return {
            bar,
            prevClose: close.toFixed(8),
            avgGain: newAvgGain.toFixed(8),
            avgLoss: newAvgLoss.toFixed(8),
            period,
            count: state.count + 1,
          };
        },
        {
          bar: {} as BarEvent,
          prevClose: undefined,
          avgGain: '0',
          avgLoss: '0',
          period,
          count: 0,
        }
      ),
      map((state) => {
        // 前 period 个bar没有足够数据
        if (state.count <= period) {
          return state.bar;
        }
        
        // 计算 RSI
        const avgLoss = new Big(state.avgLoss);
        let rsi: string;
        
        if (avgLoss.eq(0)) {
          rsi = '100.00';
        } else {
          const avgGain = new Big(state.avgGain);
          const rs = avgGain.div(avgLoss);
          const rsiValue = new Big(100).minus(new Big(100).div(rs.plus(1)));
          rsi = rsiValue.toFixed(2);
        }
        
        return {
          ...state.bar,
          features: {
            ...state.bar.features,
            RSI: rsi,
            [`RSI_${period}`]: rsi,
          },
        };
      })
    );
  },
};
