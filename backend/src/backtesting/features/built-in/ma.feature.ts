/**
 * MA (Moving Average) - 简单移动平均特征
 */

import { Observable } from 'rxjs';
import { map, scan } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * 滚动窗口缓冲区
 */
interface WindowBuffer {
  values: string[];
  maxSize: number;
}

/**
 * MA 特征定义
 */
export const MAFeature: FeatureDefinition = {
  id: 'MA',
  description: 'Simple Moving Average - 简单移动平均',
  category: 'trend',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => {
    const window = params?.window || 20;
    const source = params?.source || 'close';
    return `MA(${window}, ${source})`;
  },
  
  valueType: 'number',
  unit: 'price',
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    window: 20,
    source: 'close',
  },
  
  paramSchema: {
    window: {
      type: 'integer',
      required: true,
      min: 1,
      max: 1000,
      default: 20,
      description: 'Window size for moving average',
    },
    source: {
      type: 'enum',
      enum: ['open', 'high', 'low', 'close'],
      default: 'close',
      description: 'Price field to use for calculation',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent> {
    const window = (params?.window as number) || 20;
    const source = (params?.source as string) || 'close';
    
    return stream.pipe(
      // 使用 scan 维护滚动窗口
      scan<BarEvent, { bar: BarEvent; buffer: WindowBuffer }>(
        (acc, bar) => {
          // 获取源字段的值
          const value = bar[source as keyof BarEvent] as string;
          
          // 更新窗口缓冲区
          const newValues = [...acc.buffer.values, value];
          if (newValues.length > window) {
            newValues.shift(); // 移除最旧的值
          }
          
          return {
            bar,
            buffer: {
              values: newValues,
              maxSize: window,
            },
          };
        },
        {
          bar: {} as BarEvent,
          buffer: { values: [], maxSize: window },
        }
      ),
      // 计算 MA 并添加到 features
      map(({ bar, buffer }) => {
        let maValue: string | undefined;
        
        // 只有当窗口填满时才计算 MA
        if (buffer.values.length === window) {
          // 使用 big.js 计算平均值
          const sum = buffer.values.reduce(
            (acc, val) => acc.plus(new Big(val)),
            new Big(0)
          );
          const average = sum.div(window);
          maValue = average.toFixed(8);
        }
        
        // 添加 MA 值到 features
        return {
          ...bar,
          features: {
            ...bar.features,
            MA: maValue,
            [`MA_${window}`]: maValue,
          },
        };
      })
    );
  },
};

/**
 * 创建自定义窗口的 MA 特征
 */
export function createMAFeature(window: number, source: string = 'close'): FeatureDefinition {
  return {
    ...MAFeature,
    id: `MA${window}`,
    displayName: `MA(${window}, ${source})`,
    defaultParams: {
      window,
      source,
    },
  };
}

