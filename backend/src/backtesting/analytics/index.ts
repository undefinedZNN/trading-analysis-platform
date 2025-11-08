/**
 * Analytics模块导出
 * 
 * 提供回测结果分析功能
 * 
 * @module analytics
 */

// 接口
export * from './interfaces';

// 性能计算器
export * from './performance-calculator';

// 权益曲线生成器
export * from './equity-curve-generator';

// 结果收集器
export * from './result-collector';

// 结果管理器
export * from './results-manager';
export * from './results-storage';

// 辅助函数
export * as MetricsHelpers from './metrics-helpers';

