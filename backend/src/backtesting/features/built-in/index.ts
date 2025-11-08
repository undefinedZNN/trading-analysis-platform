/**
 * 内置特征导出
 */

export { MAFeature, createMAFeature } from './ma.feature';
export { 
  EMAFeature, 
  EMA10Feature, 
  EMA20Feature, 
  createEMAFeature 
} from './ema.feature';
export { RSIFeature } from './rsi.feature';
export { ATRFeature } from './atr.feature';
export { IBSFeature } from './ibs.feature';
export { ADXFeature } from './adx.feature';
export { DMIFeature } from './dmi.feature';
export { OverlapFeature } from './overlap.feature';
export { MACDFeature, MACD_12_26_9, createMACDFeature } from './macd.feature';
export { BollingerBandsFeature, BB_20_2, createBollingerBandsFeature } from './bollinger.feature';
export { StochasticFeature, Stochastic_14_3_3, FastStochastic, createStochasticFeature } from './stochastic.feature';

// 所有内置特征的集合
import { MAFeature } from './ma.feature';
import { EMAFeature, EMA10Feature, EMA20Feature } from './ema.feature';
import { RSIFeature } from './rsi.feature';
import { ATRFeature } from './atr.feature';
import { IBSFeature } from './ibs.feature';
import { ADXFeature } from './adx.feature';
import { DMIFeature } from './dmi.feature';
import { OverlapFeature } from './overlap.feature';
import { MACDFeature } from './macd.feature';
import { BollingerBandsFeature } from './bollinger.feature';
import { StochasticFeature } from './stochastic.feature';
import { FeatureDefinition } from '../interfaces';

/**
 * 所有内置特征列表
 */
export const BUILT_IN_FEATURES: FeatureDefinition[] = [
  MAFeature,
  EMAFeature,
  EMA10Feature,
  EMA20Feature,
  RSIFeature,
  ATRFeature,
  IBSFeature,
  ADXFeature,
  DMIFeature,
  OverlapFeature,
  MACDFeature,
  BollingerBandsFeature,
  StochasticFeature,
];

/**
 * 内置特征 ID 列表
 */
export const BUILT_IN_FEATURE_IDS = BUILT_IN_FEATURES.map(f => f.id);

