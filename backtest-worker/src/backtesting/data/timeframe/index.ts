/**
 * TimeframeAdapter 模块入口
 * 
 * 导出所有公共接口和实现
 */

// 接口
export * from './interfaces';

// 实现
export { TimeframeAdapterImpl, timeframeAdapter } from './adapter';
export { 
  StandardOHLCVAggregator,
  VolumeWeightedOHLCVAggregator,
  LastValueFeatureStrategy,
  AverageFeatureStrategy,
  createAggregator,
} from './aggregator';
export { TimeAlignmentImpl, timeAlignment } from './time-alignment';
export { 
  synchronizeStreams,
  syncByTimeWindow,
  TimeWindowSynchronizer,
  createSynchronizer,
} from './sync';

