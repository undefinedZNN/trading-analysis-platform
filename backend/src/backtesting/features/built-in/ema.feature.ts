/**
 * EMA (Exponential Moving Average) - 指数移动平均特征
 */

import { Observable } from 'rxjs';
import { map, scan } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * EMA 状态
 */
interface EMAState {
  bar: BarEvent;
  emaValue?: string;
  isInitialized: boolean;
}

/**
 * 计算 EMA 平滑因子
 */
function calculateAlpha(window: number): Big {
  return new Big(2).div(window + 1);
}

/**
 * EMA 特征定义
 */
export const EMAFeature: FeatureDefinition = {
  id: 'EMA',
  description: 'Exponential Moving Average - 指数移动平均',
  category: 'trend',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => {
    const window = params?.window || 20;
    const source = params?.source || 'close';
    return `EMA(${window}, ${source})`;
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
      description: 'Window size for exponential moving average',
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
    const alpha = calculateAlpha(window);
    
    return stream.pipe(
      // 使用 scan 维护 EMA 状态
      scan<BarEvent, EMAState>(
        (state, bar) => {
          // 获取源字段的值
          const value = new Big(bar[source as keyof BarEvent] as string);
          
          let newEmaValue: string;
          
          if (!state.isInitialized) {
            // 第一个值直接作为初始 EMA
            newEmaValue = value.toFixed(8);
          } else {
            // EMA = α * current + (1 - α) * previous_EMA
            const prevEma = new Big(state.emaValue!);
            const ema = alpha.times(value).plus(
              new Big(1).minus(alpha).times(prevEma)
            );
            newEmaValue = ema.toFixed(8);
          }
          
          return {
            bar,
            emaValue: newEmaValue,
            isInitialized: true,
          };
        },
        {
          bar: {} as BarEvent,
          emaValue: undefined,
          isInitialized: false,
        }
      ),
      // 添加 EMA 值到 features
      map((state) => ({
        ...state.bar,
        features: {
          ...state.bar.features,
          EMA: state.emaValue,
          [`EMA_${window}`]: state.emaValue,
        },
      }))
    );
  },
};

/**
 * EMA10 特征定义
 */
export const EMA10Feature: FeatureDefinition = {
  ...EMAFeature,
  id: 'EMA10',
  description: 'Exponential Moving Average (10-period) - 10周期指数移动平均',
  displayName: 'EMA(10)',
  defaultParams: {
    window: 10,
    source: 'close',
  },
};

/**
 * EMA20 特征定义
 */
export const EMA20Feature: FeatureDefinition = {
  ...EMAFeature,
  id: 'EMA20',
  description: 'Exponential Moving Average (20-period) - 20周期指数移动平均',
  displayName: 'EMA(20)',
  defaultParams: {
    window: 20,
    source: 'close',
  },
};

/**
 * 创建自定义窗口的 EMA 特征
 */
export function createEMAFeature(window: number, source: string = 'close'): FeatureDefinition {
  return {
    ...EMAFeature,
    id: `EMA${window}`,
    displayName: `EMA(${window}, ${source})`,
    defaultParams: {
      window,
      source,
    },
  };
}

