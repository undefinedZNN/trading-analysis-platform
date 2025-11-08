/**
 * Overlap - K线重叠度
 */

import { Observable } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * Overlap 状态
 */
interface OverlapState {
  bar: BarEvent;
  prevHigh?: string;
  prevLow?: string;
}

/**
 * Overlap 特征定义
 */
export const OverlapFeature: FeatureDefinition = {
  id: 'Overlap',
  description: 'K线重叠度 - 衡量当前K线与前一根K线的重叠程度',
  category: 'price_pattern',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'high', type: 'field' },
    { ref: 'low', type: 'field' },
  ],
  
  displayName: 'Overlap',
  
  valueType: 'number',
  unit: 'ratio',
  range: { min: 0, max: 2 }, // 可以大于1（当前K线包含前一根）
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    method: 'relative',
    precision: 4,
  },
  
  paramSchema: {
    method: {
      type: 'enum',
      enum: ['relative', 'absolute', 'both'],
      default: 'relative',
      description: 'Calculation method: relative (to previous bar), absolute (overlap range), both',
    },
    precision: {
      type: 'integer',
      required: false,
      min: 2,
      max: 8,
      default: 4,
      description: 'Output precision (decimal places)',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent> {
    const method = (params?.method as string) || 'relative';
    const precision = (params?.precision as number) || 4;
    
    return stream.pipe(
      scan<BarEvent, OverlapState>(
        (state, bar) => {
          // 第一个bar，没有前一根，直接保存当前bar的值
          if (!state.prevHigh || !state.prevLow) {
            return {
              bar,
              prevHigh: bar.high as string,
              prevLow: bar.low as string,
            };
          }
          
          // 有前一根bar，计算overlap
          const currHigh = new Big(bar.high as string);
          const currLow = new Big(bar.low as string);
          const prevHigh = new Big(state.prevHigh);
          const prevLow = new Big(state.prevLow);
          
          // 计算重叠区间
          // Big.js doesn't have min/max, so we do it manually
          const overlapHigh = currHigh.lt(prevHigh) ? currHigh : prevHigh;
          const overlapLow = currLow.gt(prevLow) ? currLow : prevLow;
          
          // 重叠范围（可能为负，表示不重叠）
          let overlapRange = overlapHigh.minus(overlapLow);
          if (overlapRange.lt(0)) {
            overlapRange = new Big(0);
          }
          
          const features: Record<string, string | number> = { ...bar.features };
          
          if (method === 'absolute' || method === 'both') {
            features['Overlap_Abs'] = overlapRange.toFixed(precision);
          }
          
          if (method === 'relative' || method === 'both') {
            const prevRange = prevHigh.minus(prevLow);
            
            if (prevRange.eq(0)) {
              // 前一根K线没有波动，返回1（完全重叠）
              features['Overlap'] = '1.0000';
            } else {
              const overlapRatio = overlapRange.div(prevRange);
              features['Overlap'] = overlapRatio.toFixed(precision);
            }
          }
          
          const resultBar = {
            ...bar,
            features,
          };
          
          // 更新state，保存当前bar供下一次使用
          return {
            bar: resultBar,
            prevHigh: bar.high as string,
            prevLow: bar.low as string,
          };
        },
        {
          bar: {} as BarEvent,
          prevHigh: undefined,
          prevLow: undefined,
        }
      ),
      map((state) => state.bar)
    );
  },
};
