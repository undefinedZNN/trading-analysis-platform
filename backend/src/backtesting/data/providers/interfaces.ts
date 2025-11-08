/**
 * DataProvider 核心接口定义
 * 
 * 本模块定义了数据提供者的统一接口，支持 Parquet+DuckDB 等多种数据源，
 * 提供分片加载、缺口处理、特征注入等功能。
 */

import { Observable } from 'rxjs';
import { BarEvent, Timeframe } from '../timeframe/interfaces';

/**
 * 缺口处理策略
 */
export type GapPolicy = 'skip' | 'fill';

/**
 * 缺口填充方法
 */
export type FillMethod = 'forwardFill' | 'linear';

/**
 * 数据质量标志
 */
export type QualityFlag = 'original' | 'synthetic' | 'interpolated' | 'adjusted';

/**
 * 数据提取请求
 */
export interface FetchRequest {
  /** 标的代码 */
  symbol: string;
  
  /** 可选市场或交易所标识 */
  market?: string;
  
  /** 开始时间（ISO8601 或 epoch 毫秒） */
  start: string;
  
  /** 结束时间（ISO8601 或 epoch 毫秒） */
  end: string;
  
  /** 基础时间框架（最细粒度） */
  baseTimeframe: Timeframe;
  
  /** 需要提取的字段 */
  fields?: Array<'open' | 'high' | 'low' | 'close' | 'volume' | 'trades' | 'notional' | string>;
  
  /** 每批次返回条目数，默认 10000 */
  batchSize?: number;
  
  /** 批次之间的重叠窗口，用于滚动指标，默认 0 */
  overlapSize?: number;
  
  /** 缺口处理策略，默认 'skip' */
  gapPolicy?: GapPolicy;
  
  /** 填充方法，当 gapPolicy === 'fill' 时生效 */
  fillMethod?: FillMethod;
  
  /** 需要启用的内置特征 ID 列表 */
  featureSet?: string[];
  
  /** 最大并发查询数，默认 3 */
  maxConcurrent?: number;
  
  /** 是否验证数据完整性，默认 false */
  validateIntegrity?: boolean;
}

/**
 * 批次配置
 */
export interface BatchConfig {
  /** 每批查询的行数 */
  batchSize: number;
  
  /** 批次重叠行数 */
  overlapSize: number;
  
  /** 最大并发查询数 */
  maxConcurrent: number;
}

/**
 * 批次查询信息
 */
export interface BatchQuery {
  /** 批次序号 */
  batchIndex: number;
  
  /** 批次开始时间 */
  startTime: string;
  
  /** 批次结束时间 */
  endTime: string;
  
  /** 预期返回的行数 */
  expectedRows: number;
  
  /** 偏移量 */
  offset: number;
  
  /** 限制数量 */
  limit: number;
}

/**
 * 缺口信息
 */
export interface Gap {
  /** 缺口开始时间戳 */
  startTimestamp: string;
  
  /** 缺口结束时间戳 */
  endTimestamp: string;
  
  /** 预期应该有的 bar 数量 */
  expectedBars: number;
  
  /** 缺口前的最后一个有效 bar */
  lastValidBar?: BarEvent;
  
  /** 缺口后的第一个有效 bar */
  nextValidBar?: BarEvent;
}

/**
 * 数据提供者接口
 */
export interface DataProvider {
  /** 提供者唯一标识 */
  id: string;
  
  /**
   * 检查是否支持给定的请求
   * @param request 数据提取请求
   * @returns 是否支持
   */
  supports(request: FetchRequest): boolean;
  
  /**
   * 提取数据
   * @param request 数据提取请求
   * @returns BarEvent 流
   */
  fetch(request: FetchRequest): Observable<BarEvent>;
  
  /**
   * 关闭连接，释放资源
   */
  close?(): Promise<void>;
  
  /**
   * 获取元数据信息（可选）
   * @param symbol 标的代码
   * @returns 元数据
   */
  getMetadata?(symbol: string): Promise<DataMetadata>;
}

/**
 * 数据元数据
 */
export interface DataMetadata {
  /** 标的代码 */
  symbol: string;
  
  /** 市场 */
  market?: string;
  
  /** 可用的时间框架 */
  availableTimeframes: Timeframe[];
  
  /** 数据起始时间 */
  startTime: string;
  
  /** 数据结束时间 */
  endTime: string;
  
  /** 总条目数 */
  totalRecords: number;
  
  /** 数据质量信息 */
  quality?: {
    completeness: number;      // 完整性百分比
    knownGaps: Gap[];          // 已知缺口
  };
}

/**
 * 缺口检测器接口
 */
export interface GapDetector {
  /**
   * 检测时间序列中的缺口
   * @param events BarEvent 数组
   * @param expectedInterval 预期的时间间隔（毫秒）
   * @param timeframe 时间框架
   * @returns 检测到的缺口数组
   */
  detectGaps(
    events: BarEvent[],
    expectedInterval: number,
    timeframe: Timeframe
  ): Gap[];
  
  /**
   * 验证时间序列的完整性
   * @param events BarEvent 数组
   * @param expectedInterval 预期的时间间隔（毫秒）
   * @returns 完整性报告
   */
  validateIntegrity(
    events: BarEvent[],
    expectedInterval: number
  ): IntegrityReport;
}

/**
 * 完整性报告
 */
export interface IntegrityReport {
  /** 总条目数 */
  totalRecords: number;
  
  /** 预期条目数 */
  expectedRecords: number;
  
  /** 缺口数量 */
  gapCount: number;
  
  /** 缺失的条目数 */
  missingRecords: number;
  
  /** 完整性百分比 */
  completeness: number;
  
  /** 检测到的缺口 */
  gaps: Gap[];
  
  /** 是否通过验证 */
  isValid: boolean;
}

/**
 * 缺口填充器接口
 */
export interface GapFiller {
  /**
   * 填充缺口
   * @param gap 缺口信息
   * @param method 填充方法
   * @param timeframe 时间框架
   * @returns 生成的合成 BarEvent 数组
   */
  fillGap(
    gap: Gap,
    method: FillMethod,
    timeframe: Timeframe
  ): BarEvent[];
  
  /**
   * 前向填充
   * @param gap 缺口信息
   * @param timeframe 时间框架
   * @returns 生成的合成 BarEvent 数组
   */
  forwardFill(gap: Gap, timeframe: Timeframe): BarEvent[];
  
  /**
   * 线性插值填充
   * @param gap 缺口信息
   * @param timeframe 时间框架
   * @returns 生成的合成 BarEvent 数组
   */
  linearFill(gap: Gap, timeframe: Timeframe): BarEvent[];
}

/**
 * DuckDB 查询构建器接口
 */
export interface DuckDBQueryBuilder {
  /**
   * 构建范围查询 SQL
   * @param request 数据提取请求
   * @param batch 批次查询信息
   * @returns SQL 查询字符串
   */
  buildRangeQuery(request: FetchRequest, batch: BatchQuery): string;
  
  /**
   * 构建缺口检测查询 SQL
   * @param request 数据提取请求
   * @returns SQL 查询字符串
   */
  buildGapDetectionQuery(request: FetchRequest): string;
  
  /**
   * 构建元数据查询 SQL
   * @param symbol 标的代码
   * @param timeframe 时间框架
   * @returns SQL 查询字符串
   */
  buildMetadataQuery(symbol: string, timeframe: Timeframe): string;
}

/**
 * 数据源配置
 */
export interface DataSourceConfig {
  /** 数据存储根路径 */
  storageBasePath: string;
  
  /** 默认批次大小 */
  defaultBatchSize: number;
  
  /** 默认重叠大小 */
  defaultOverlapSize: number;
  
  /** 默认最大并发数 */
  defaultMaxConcurrent: number;
  
  /** 默认缺口策略 */
  defaultGapPolicy: GapPolicy;
  
  /** 默认填充方法 */
  defaultFillMethod: FillMethod;
  
  /** 是否启用查询缓存 */
  enableQueryCache?: boolean;
  
  /** 缓存大小（MB） */
  cacheSize?: number;
  
  /** 连接池大小 */
  connectionPoolSize?: number;
}

/**
 * Parquet 数据行（从文件读取的原始数据）
 */
export interface ParquetRow {
  timestamp: string | number;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
  trades?: number;
  notional?: number | string;
  [key: string]: any;
}

