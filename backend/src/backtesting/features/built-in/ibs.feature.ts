/**
 * IBS (Internal Bar Strength) - 内部柱强度
 */

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * IBS 特征定义
 */
export const IBSFeature: FeatureDefinition = {
  id: 'IBS',
  description: 'Internal Bar Strength - 内部柱强度',
  category: 'price_pattern',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'high', type: 'field' },
    { ref: 'low', type: 'field' },
    { ref: 'close', type: 'field' },
  ],
  
  displayName: 'IBS',
  
  valueType: 'number',
  unit: 'ratio',
  range: { min: 0, max: 1 },
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    precision: 4,
  },
  
  paramSchema: {
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
    const precision = (params?.precision as number) || 4;
    
    return stream.pipe(
      map((bar) => {
        const high = new Big(bar.high as string);
        const low = new Big(bar.low as string);
        const close = new Big(bar.close as string);
        
        const range = high.minus(low);
        
        // 如果高低相等（range = 0），返回 0.5（中性）
        let ibs: string;
        if (range.eq(0)) {
          ibs = '0.5000';
        } else {
          const ibsValue = close.minus(low).div(range);
          ibs = ibsValue.toFixed(precision);
        }
        
        return {
          ...bar,
          features: {
            ...bar.features,
            IBS: ibs,
          },
        };
      })
    );
  },
};
