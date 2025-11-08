/**
 * DMI (Directional Movement Index) - 趋向运动指标
 */

import { Observable } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import Big from 'big.js';
import { BarEvent } from '../../data/timeframe/interfaces';
import { FeatureDefinition } from '../interfaces';

/**
 * DMI 状态
 */
interface DMIState {
  bar: BarEvent;
  prevHigh?: string;
  prevLow?: string;
  prevClose?: string;
  plusDMSum: string;
  minusDMSum: string;
  trSum: string;
  plusDMSmooth?: string;
  minusDMSmooth?: string;
  trSmooth?: string;
  period: number;
  count: number;
}

/**
 * DMI 特征定义
 */
export const DMIFeature: FeatureDefinition = {
  id: 'DMI',
  description: 'Directional Movement Index - 趋向运动指标',
  category: 'trend',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'high', type: 'field' },
    { ref: 'low', type: 'field' },
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => {
    const period = params?.period || 14;
    return `DMI(${period})`;
  },
  
  valueType: 'number',
  unit: 'index',
  range: { min: 0, max: 100 },
  
  supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  
  defaultParams: {
    period: 14,
  },
  
  paramSchema: {
    period: {
      type: 'integer',
      required: false,
      min: 2,
      max: 100,
      default: 14,
      description: 'DMI period',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent> {
    const period = (params?.period as number) || 14;
    
    return stream.pipe(
      scan<BarEvent, DMIState>(
        (state, bar) => {
          const high = new Big(bar.high as string);
          const low = new Big(bar.low as string);
          const close = new Big(bar.close as string);
          
          // 第一个bar，初始化
          if (state.count === 0) {
            return {
              bar,
              prevHigh: high.toFixed(8),
              prevLow: low.toFixed(8),
              prevClose: close.toFixed(8),
              plusDMSum: '0',
              minusDMSum: '0',
              trSum: '0',
              plusDMSmooth: undefined,
              minusDMSmooth: undefined,
              trSmooth: undefined,
              period,
              count: 1,
            };
          }
          
          // 计算 +DM, -DM, TR
          const prevHigh = new Big(state.prevHigh!);
          const prevLow = new Big(state.prevLow!);
          const prevClose = new Big(state.prevClose!);
          
          const upMove = high.minus(prevHigh);
          const downMove = prevLow.minus(low);
          
          let plusDM = new Big(0);
          let minusDM = new Big(0);
          
          if (upMove.gt(downMove) && upMove.gt(0)) {
            plusDM = upMove;
          }
          if (downMove.gt(upMove) && downMove.gt(0)) {
            minusDM = downMove;
          }
          
          const hl = high.minus(low);
          const hc = high.minus(prevClose).abs();
          const lc = low.minus(prevClose).abs();
          
          // Big.js doesn't have max, so we do it manually
          let tr = hl;
          if (hc.gt(tr)) tr = hc;
          if (lc.gt(tr)) tr = lc;
          
          let newPlusDMSmooth: string | undefined;
          let newMinusDMSmooth: string | undefined;
          let newTRSmooth: string | undefined;
          let newPlusDMSum: string;
          let newMinusDMSum: string;
          let newTRSum: string;
          
          if (state.count < period) {
            // 累积初始周期
            newPlusDMSum = new Big(state.plusDMSum).plus(plusDM).toFixed(8);
            newMinusDMSum = new Big(state.minusDMSum).plus(minusDM).toFixed(8);
            newTRSum = new Big(state.trSum).plus(tr).toFixed(8);
            newPlusDMSmooth = undefined;
            newMinusDMSmooth = undefined;
            newTRSmooth = undefined;
          } else if (state.count === period) {
            // 第一个完整周期
            newPlusDMSum = new Big(state.plusDMSum).plus(plusDM).toFixed(8);
            newMinusDMSum = new Big(state.minusDMSum).plus(minusDM).toFixed(8);
            newTRSum = new Big(state.trSum).plus(tr).toFixed(8);
            newPlusDMSmooth = newPlusDMSum;
            newMinusDMSmooth = newMinusDMSum;
            newTRSmooth = newTRSum;
          } else {
            // 后续使用 Wilder's smoothing
            newPlusDMSmooth = new Big(state.plusDMSmooth!)
              .minus(new Big(state.plusDMSmooth!).div(period))
              .plus(plusDM)
              .toFixed(8);
            newMinusDMSmooth = new Big(state.minusDMSmooth!)
              .minus(new Big(state.minusDMSmooth!).div(period))
              .plus(minusDM)
              .toFixed(8);
            newTRSmooth = new Big(state.trSmooth!)
              .minus(new Big(state.trSmooth!).div(period))
              .plus(tr)
              .toFixed(8);
            newPlusDMSum = state.plusDMSum;
            newMinusDMSum = state.minusDMSum;
            newTRSum = state.trSum;
          }
          
          return {
            bar,
            prevHigh: high.toFixed(8),
            prevLow: low.toFixed(8),
            prevClose: close.toFixed(8),
            plusDMSum: newPlusDMSum,
            minusDMSum: newMinusDMSum,
            trSum: newTRSum,
            plusDMSmooth: newPlusDMSmooth,
            minusDMSmooth: newMinusDMSmooth,
            trSmooth: newTRSmooth,
            period,
            count: state.count + 1,
          };
        },
        {
          bar: {} as BarEvent,
          prevHigh: undefined,
          prevLow: undefined,
          prevClose: undefined,
          plusDMSum: '0',
          minusDMSum: '0',
          trSum: '0',
          plusDMSmooth: undefined,
          minusDMSmooth: undefined,
          trSmooth: undefined,
          period,
          count: 0,
        }
      ),
      map((state) => {
        // 前 period 个bar没有足够数据
        if (!state.plusDMSmooth || !state.minusDMSmooth || !state.trSmooth) {
          return state.bar;
        }
        
        // 计算 +DI 和 -DI
        const trSmooth = new Big(state.trSmooth);
        
        if (trSmooth.eq(0)) {
          return {
            ...state.bar,
            features: {
              ...state.bar.features,
              PLUS_DI: '0.00',
              MINUS_DI: '0.00',
              [`PLUS_DI_${period}`]: '0.00',
              [`MINUS_DI_${period}`]: '0.00',
            },
          };
        }
        
        const plusDI = new Big(state.plusDMSmooth).div(trSmooth).times(100).toFixed(2);
        const minusDI = new Big(state.minusDMSmooth).div(trSmooth).times(100).toFixed(2);
        
        return {
          ...state.bar,
          features: {
            ...state.bar.features,
            PLUS_DI: plusDI,
            MINUS_DI: minusDI,
            [`PLUS_DI_${period}`]: plusDI,
            [`MINUS_DI_${period}`]: minusDI,
          },
        };
      })
    );
  },
};
