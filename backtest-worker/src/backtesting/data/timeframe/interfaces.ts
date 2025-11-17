/**
 * TimeframeAdapter 核心接口定义
 * 
 * 本模块负责将原始粒度的行情数据重采样到目标时间框架，
 * 并支持多时间框架的同步输出。
 */

import { Observable } from 'rxjs';

/**
 * 时间框架类型
 * 支持秒、分钟、小时等常见时间粒度
 */
export type Timeframe = '1s' | '5s' | '10s' | '15s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | string;

/**
 * Bar 事件结构
 * 标准化的 OHLCV 数据格式
 */
export interface BarEvent {
  sequenceId: string;
  timestamp: string;          // ISO8601 格式
  symbol: string;
  market?: string;
  timeframe: Timeframe;
  open: string;               // big.js 字符串格式
  high: string;
  low: string;
  close: string;
  volume: string;
  trades?: number;
  notional?: string;
  features?: Record<string, string | number>;
  source: string;
  auxStreams?: string[];
  context?: Record<string, unknown>;
}

/**
 * 重采样配置
 */
export interface ResampleConfig {
  /** 聚合方法：标准或成交量加权 */
  aggregationMethod?: 'standard' | 'volume-weighted';
  
  /** 对齐模式：bar 以关闭时间还是开始时间标记 */
  alignmentMode?: 'close' | 'open';
  
  /** 是否丢弃不完整的最后一根 bar */
  dropIncomplete?: boolean;
  
  /** 是否保留原始特征 */
  preserveFeatures?: boolean;
}

/**
 * 多时间框架配置
 */
export interface MultiFrameConfig {
  /** 主时间框架 */
  primary: Timeframe;
  
  /** 辅助时间框架列表 */
  auxiliary?: Timeframe[];
  
  /** 同步模式：等待所有流或主流驱动 */
  syncMode?: 'wait-all' | 'primary-driven';
}

/**
 * 多时间框架流
 */
export interface MultiFrameStream {
  /** 主流 */
  primary$: Observable<BarEvent>;
  
  /** 辅助流映射 */
  auxiliary$: Record<string, Observable<BarEvent>>;
  
  /** 同步后的事件组 */
  synchronized$: Observable<SyncedBars>;
}

/**
 * 同步后的 bars 组
 */
export interface SyncedBars {
  /** 主流的时间戳 */
  timestamp: string;
  
  /** 主流 bar */
  primary: BarEvent;
  
  /** 辅助流 bars（可能包含多个 bar） */
  auxiliary: Record<string, BarEvent[]>;
}

/**
 * 聚合后的 bar 数据
 */
export interface AggregatedBar {
  open: string;               // 第一根 bar 的 open
  high: string;               // 所有 bar 中的最高价
  low: string;                // 所有 bar 中的最低价
  close: string;              // 最后一根 bar 的 close
  volume: string;             // 累计 volume
  trades?: number;            // 累计 trades
  notional?: string;          // 累计 notional
  barCount: number;           // 聚合的 bar 数量
}

/**
 * OHLCV 聚合器接口
 */
export interface OHLCVAggregator {
  /**
   * 聚合多个 bars 为一个
   * @param bars 要聚合的 bar 数组
   * @returns 聚合后的 bar 数据
   */
  aggregate(bars: BarEvent[]): AggregatedBar;
}

/**
 * 时间框架适配器接口
 */
export interface TimeframeAdapter {
  /**
   * 重采样到目标时间框架
   * @param source 原始 bar 事件流
   * @param targetTimeframe 目标时间框架
   * @param config 重采样配置
   * @returns 重采样后的 bar 事件流
   */
  resample(
    source: Observable<BarEvent>,
    targetTimeframe: Timeframe,
    config?: ResampleConfig
  ): Observable<BarEvent>;

  /**
   * 创建多时间框架流
   * @param source 原始 bar 事件流
   * @param config 多时间框架配置
   * @returns 多时间框架流
   */
  createMultiFrameStream(
    source: Observable<BarEvent>,
    config: MultiFrameConfig
  ): MultiFrameStream;
}

/**
 * 特征聚合策略接口
 */
export interface FeatureAggregationStrategy {
  /**
   * 聚合特征值
   * @param values 特征值数组
   * @returns 聚合后的值
   */
  aggregate(values: Array<string | number>): string | number;
}

/**
 * 时间对齐工具接口
 */
export interface TimeAlignment {
  /**
   * 将时间戳对齐到时间框架边界
   * @param timestamp 原始时间戳（ISO8601）
   * @param timeframe 时间框架
   * @param mode 对齐模式（open/close）
   * @returns 对齐后的时间戳
   */
  alignToTimeframe(
    timestamp: string,
    timeframe: Timeframe,
    mode: 'open' | 'close'
  ): string;

  /**
   * 解析时间框架为毫秒数
   * @param timeframe 时间框架字符串
   * @returns 毫秒数
   */
  parseTimeframe(timeframe: Timeframe): number;

  /**
   * 检查时间戳是否在时间框架边界上
   * @param timestamp 时间戳
   * @param timeframe 时间框架
   * @returns 是否在边界上
   */
  isOnBoundary(timestamp: string, timeframe: Timeframe): boolean;
}

