/**
 * Stochastic Oscillator - 随机指标
 * 
 * 随机指标衡量收盘价在一定周期内高低价范围中的位置，包含两条线：
 * 1. %K (Fast Stochastic) = (close - lowest_low) / (highest_high - lowest_low) * 100
 * 2. %D (Slow Stochastic) = SMA(%K, smoothK)
 * 
 * 使用方法：
 * - %K > 80: 超买区域
 * - %K < 20: 超卖区域
 * - %K 上穿 %D: 买入信号
 * - %K 下穿 %D: 卖出信号
 */

import { Observable } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * Stochastic 状态
 */
interface StochasticState {
  bar: BarEvent;
  highWindow: string[];
  lowWindow: string[];
  kWindow: string[];
  kPeriod: number;
  dPeriod: number;
}

/**
 * Stochastic 特征定义
 */
export const StochasticFeature: FeatureDefinition = {
  id: 'Stochastic',
  description: 'Stochastic Oscillator - 随机指标',
  category: 'momentum',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'high', type: 'field' },
    { ref: 'low', type: 'field' },
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => {
    const kPeriod = params?.kPeriod || 14;
    const dPeriod = params?.dPeriod || 3;
    return `Stochastic(${kPeriod}, ${dPeriod})`;
  },
  
  valueType: 'number',
  unit: 'percent',
  range: { min: 0, max: 100 },
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    kPeriod: 14,
    dPeriod: 3,
    smoothK: 3,
  },
  
  paramSchema: {
    kPeriod: {
      type: 'integer',
      required: false,
      min: 2,
      max: 100,
      default: 14,
      description: '%K period',
    },
    dPeriod: {
      type: 'integer',
      required: false,
      min: 1,
      max: 50,
      default: 3,
      description: '%D smoothing period',
    },
    smoothK: {
      type: 'integer',
      required: false,
      min: 1,
      max: 10,
      default: 3,
      description: '%K smoothing period',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent> {
    const kPeriod = (params?.kPeriod as number) || 14;
    const dPeriod = (params?.dPeriod as number) || 3;
    const smoothK = (params?.smoothK as number) || 3;
    
    return stream.pipe(
      scan<BarEvent, StochasticState>(
        (state, bar) => {
          const high = bar.high as string;
          const low = bar.low as string;
          
          const highWindow = [...state.highWindow, high];
          const lowWindow = [...state.lowWindow, low];
          
          // 保持窗口大小
          if (highWindow.length > kPeriod) {
            highWindow.shift();
            lowWindow.shift();
          }
          
          return {
            bar,
            highWindow,
            lowWindow,
            kWindow: state.kWindow,
            kPeriod,
            dPeriod,
          };
        },
        {
          bar: {} as BarEvent,
          highWindow: [],
          lowWindow: [],
          kWindow: [],
          kPeriod,
          dPeriod,
        }
      ),
      map((state) => {
        // 窗口未满，不输出
        if (state.highWindow.length < kPeriod) {
          return state.bar;
        }
        
        // 找到最高价和最低价
        let highestHigh = new Big(state.highWindow[0]);
        let lowestLow = new Big(state.lowWindow[0]);
        
        for (let i = 1; i < state.highWindow.length; i++) {
          const high = new Big(state.highWindow[i]);
          const low = new Big(state.lowWindow[i]);
          
          if (high.gt(highestHigh)) {
            highestHigh = high;
          }
          if (low.lt(lowestLow)) {
            lowestLow = low;
          }
        }
        
        // 计算 %K (Fast Stochastic)
        const close = new Big(state.bar.close as string);
        const range = highestHigh.minus(lowestLow);
        
        let k = new Big(50); // 默认中间值
        if (!range.eq(0)) {
          k = close.minus(lowestLow).div(range).times(100);
        }
        
        // 平滑 %K (如果 smoothK > 1)
        const kWindow = [...state.kWindow, k.toFixed(4)];
        if (kWindow.length > smoothK) {
          kWindow.shift();
        }
        
        // 计算平滑后的 %K
        let smoothedK = k;
        if (kWindow.length === smoothK && smoothK > 1) {
          let sum = new Big(0);
          for (const value of kWindow) {
            sum = sum.plus(new Big(value));
          }
          smoothedK = sum.div(smoothK);
        }
        
        // 更新状态中的 kWindow
        (state as any).kWindow = kWindow;
        
        // 计算 %D (Slow Stochastic - smoothedK 的 SMA)
        let d: Big | undefined;
        if (kWindow.length >= dPeriod) {
          let sum = new Big(0);
          const startIndex = Math.max(0, kWindow.length - dPeriod);
          for (let i = startIndex; i < kWindow.length; i++) {
            sum = sum.plus(new Big(kWindow[i]));
          }
          d = sum.div(Math.min(kWindow.length, dPeriod));
        }
        
        const features: Record<string, string | number> = {
          ...state.bar.features,
          Stochastic_K: smoothedK.toFixed(2),
        };
        
        if (d) {
          features.Stochastic_D = d.toFixed(2);
        }
        
        return {
          ...state.bar,
          features,
        };
      })
    );
  },
};

/**
 * 标准随机指标 (14, 3, 3)
 */
export const Stochastic_14_3_3: FeatureDefinition = {
  ...StochasticFeature,
  id: 'Stochastic_14_3_3',
  description: 'Stochastic Oscillator with standard parameters (14, 3, 3)',
  displayName: 'Stochastic(14, 3, 3)',
};

/**
 * 快速随机指标 (14, 1, 1) - 无平滑
 */
export const FastStochastic: FeatureDefinition = {
  ...StochasticFeature,
  id: 'FastStochastic',
  description: 'Fast Stochastic Oscillator (14, 1, 1)',
  displayName: 'Fast Stochastic',
  defaultParams: {
    kPeriod: 14,
    dPeriod: 1,
    smoothK: 1,
  },
};

/**
 * 创建自定义参数的随机指标特征
 */
export function createStochasticFeature(
  kPeriod: number,
  dPeriod: number,
  smoothK: number = 3
): FeatureDefinition {
  return {
    ...StochasticFeature,
    id: `Stochastic_${kPeriod}_${dPeriod}_${smoothK}`,
    displayName: `Stochastic(${kPeriod}, ${dPeriod}, ${smoothK})`,
    defaultParams: {
      kPeriod,
      dPeriod,
      smoothK,
    },
  };
}

