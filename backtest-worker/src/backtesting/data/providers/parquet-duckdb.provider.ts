/**
 * ParquetDuckDBProvider - Parquet+DuckDB 数据提供者
 * 
 * 使用 DuckDB 查询 Parquet 文件，支持分片加载、缺口处理、流式输出
 */

import { Observable, from, mergeMap, map, tap, scan, concatMap } from 'rxjs';
import * as duckdb from 'duckdb';
import Big from 'big.js';
import { formatISO, parseISO } from 'date-fns';
import { BarEvent, Timeframe } from '../timeframe/interfaces';
import { 
  DataProvider, 
  FetchRequest, 
  DataMetadata, 
  ParquetRow,
  DataSourceConfig,
  BatchQuery,
} from './interfaces';
import { DefaultDuckDBQueryBuilder } from './query-builder';
import { DefaultGapDetector } from './gap-detector';
import { DefaultGapFiller } from './gap-filler';
import { timeframeToMs } from '../timeframe/time-alignment';
import { DataSizeChecker } from './data-size-checker';

/**
 * Parquet+DuckDB 数据提供者实现
 */
export class ParquetDuckDBProvider implements DataProvider {
  readonly id = 'parquet-duckdb';

  private db: duckdb.Database | null = null;
  private connection: duckdb.Connection | null = null;
  private queryBuilder: DefaultDuckDBQueryBuilder;
  private gapDetector: DefaultGapDetector;
  private gapFiller: DefaultGapFiller;
  private dataSizeChecker: DataSizeChecker;
  private config: DataSourceConfig;

  constructor(config: Partial<DataSourceConfig> = {}) {
    // 合并默认配置
    this.config = {
      storageBasePath: config.storageBasePath || 'storage/datasets',
      defaultBatchSize: config.defaultBatchSize || 10000,
      defaultOverlapSize: config.defaultOverlapSize || 0,
      defaultMaxConcurrent: config.defaultMaxConcurrent || 3,
      defaultGapPolicy: config.defaultGapPolicy || 'skip',
      defaultFillMethod: config.defaultFillMethod || 'forwardFill',
      enableQueryCache: config.enableQueryCache ?? false,
      cacheSize: config.cacheSize || 100,
      connectionPoolSize: config.connectionPoolSize || 1,
    };

    this.queryBuilder = new DefaultDuckDBQueryBuilder(this.config.storageBasePath);
    this.gapDetector = new DefaultGapDetector();
    this.gapFiller = new DefaultGapFiller();
    this.dataSizeChecker = new DataSizeChecker({
      warnThresholdMB: 2048,  // 2GB 警告
      blockThresholdMB: 10240, // 10GB 阻断
    });
  }

  /**
   * 初始化数据库连接
   */
  private async initConnection(): Promise<void> {
    if (this.connection) {
      return;
    }

    return new Promise((resolve, reject) => {
      // 使用内存数据库，只用于查询 Parquet
      this.db = new duckdb.Database(':memory:', (err) => {
        if (err) {
          reject(new Error(`Failed to create DuckDB database: ${err.message}`));
          return;
        }

        this.connection = this.db!.connect();
        if (!this.connection) {
          reject(new Error('Failed to create DuckDB connection'));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * 检查是否支持给定的请求
   */
  supports(request: FetchRequest): boolean {
    // 检查必需字段
    if (!request.symbol || !request.start || !request.end || !request.baseTimeframe) {
      return false;
    }

    // 可以添加更多检查，例如检查文件是否存在
    return true;
  }

  /**
   * 提取数据
   */
  fetch(request: FetchRequest): Observable<BarEvent> {
    // 预检数据规模
    const sizeEstimate = this.dataSizeChecker.estimate({
      symbol: request.symbol,
      start: request.start,
      end: request.end,
      baseTimeframe: request.baseTimeframe,
    });
    
    // 打印估算信息
    console.log(`[DataProvider] ${sizeEstimate.message}`);
    
    // 如果数据集过大，抛出错误
    if (sizeEstimate.shouldBlock) {
      return new Observable(observer => {
        observer.error(new Error(
          `Data set too large (estimated ${sizeEstimate.estimatedMemoryMB} MB). ` +
          `Please reduce time range or use a larger timeframe. ` +
          `Current: ${request.start} to ${request.end} at ${request.baseTimeframe}`
        ));
      });
    }
    
    // 应用默认配置，如果有警告则使用推荐配置
    const finalRequest: FetchRequest = {
      ...request,
      batchSize: sizeEstimate.shouldWarn 
        ? (request.batchSize || sizeEstimate.recommendedBatchSize)
        : (request.batchSize || this.config.defaultBatchSize),
      overlapSize: request.overlapSize || this.config.defaultOverlapSize,
      maxConcurrent: sizeEstimate.shouldWarn
        ? (request.maxConcurrent || sizeEstimate.recommendedMaxConcurrent)
        : (request.maxConcurrent || this.config.defaultMaxConcurrent),
      gapPolicy: request.gapPolicy || this.config.defaultGapPolicy,
      fillMethod: request.fillMethod || this.config.defaultFillMethod,
    };
    
    if (sizeEstimate.shouldWarn) {
      console.log(`[DataProvider] Using optimized config: batchSize=${finalRequest.batchSize}, maxConcurrent=${finalRequest.maxConcurrent}`);
    }

    return new Observable(observer => {
      this.initConnection()
        .then(() => this.fetchInternal(finalRequest).subscribe(observer))
        .catch(err => observer.error(err));
    });
  }

  /**
   * 内部提取实现
   */
  private fetchInternal(request: FetchRequest): Observable<BarEvent> {
    // 先获取总记录数
    return from(this.getRecordCount(request)).pipe(
      mergeMap(totalRecords => {
        if (totalRecords === 0) {
          return from([]);
        }

        // 构建批次
        const batches = this.queryBuilder.buildBatches(request, totalRecords);

        // 流式处理批次
        return from(batches).pipe(
          // 并发执行查询
          mergeMap(
            batch => this.fetchBatch(request, batch),
            request.maxConcurrent || 3
          ),
          // 处理批次重叠（如果需要）
          scan(
            (acc, events) => {
              if (request.overlapSize && request.overlapSize > 0 && acc.prevBatch.length > 0) {
                // 合并重叠部分
                const overlap = acc.prevBatch.slice(-request.overlapSize);
                return {
                  prevBatch: events,
                  output: [...overlap, ...events],
                };
              }
              return {
                prevBatch: events,
                output: events,
              };
            },
            { prevBatch: [] as BarEvent[], output: [] as BarEvent[] }
          ),
          mergeMap(result => from(result.output)),
          // 处理缺口
          this.applyGapPolicy(request)
        );
      })
    );
  }

  /**
   * 获取记录总数
   */
  private async getRecordCount(request: FetchRequest): Promise<number> {
    const sql = this.queryBuilder.buildCountQuery(request);
    
    return new Promise((resolve, reject) => {
      this.connection!.all(sql, (err, rows: any[]) => {
        if (err) {
          reject(new Error(`Failed to count records: ${err.message}`));
          return;
        }
        
        const count = rows[0]?.count || 0;
        resolve(Number(count));
      });
    });
  }

  /**
   * 获取单个批次的数据
   */
  private fetchBatch(request: FetchRequest, batch: BatchQuery): Observable<BarEvent[]> {
    const sql = this.queryBuilder.buildRangeQuery(request, batch);

    return new Observable<BarEvent[]>(observer => {
      this.connection!.all(sql, (err, rows: ParquetRow[]) => {
        if (err) {
          observer.error(new Error(`Failed to fetch batch ${batch.batchIndex}: ${err.message}`));
          return;
        }

        try {
          const events = rows.map((row, index) => 
            this.convertRowToBarEvent(row, request, batch.batchIndex, index)
          );
          observer.next(events);
          observer.complete();
        } catch (convertErr) {
          observer.error(convertErr);
        }
      });
    });
  }

  /**
   * 将 Parquet 行转换为 BarEvent
   */
  private convertRowToBarEvent(
    row: ParquetRow,
    request: FetchRequest,
    batchIndex: number,
    rowIndex: number
  ): BarEvent {
    // 解析时间戳
    const timestamp = typeof row.timestamp === 'string' 
      ? row.timestamp 
      : formatISO(new Date(Number(row.timestamp)));

    // 使用 big.js 确保精度
    const open = new Big(row.open).toFixed(8);
    const high = new Big(row.high).toFixed(8);
    const low = new Big(row.low).toFixed(8);
    const close = new Big(row.close).toFixed(8);
    const volume = new Big(row.volume).toFixed(8);
    const notional = row.notional ? new Big(row.notional).toFixed(8) : undefined;

    return {
      sequenceId: `${request.symbol}-${request.baseTimeframe}-${timestamp}-${batchIndex}-${rowIndex}`,
      timestamp,
      symbol: request.symbol,
      market: request.market,
      timeframe: request.baseTimeframe,
      open,
      high,
      low,
      close,
      volume,
      trades: row.trades,
      notional,
      features: this.extractFeatures(row, request.featureSet),
      source: `parquet:${this.id}`,
      context: {
        qualityFlag: 'original',
        batchIndex,
        rowIndex,
      },
    };
  }

  /**
   * 提取特征字段
   */
  private extractFeatures(
    row: ParquetRow,
    featureSet?: string[]
  ): Record<string, string | number> | undefined {
    if (!featureSet || featureSet.length === 0) {
      return undefined;
    }

    const features: Record<string, string | number> = {};
    
    featureSet.forEach(featureId => {
      if (featureId in row) {
        features[featureId] = row[featureId];
      }
    });

    return Object.keys(features).length > 0 ? features : undefined;
  }

  /**
   * 应用缺口策略
   */
  private applyGapPolicy(request: FetchRequest) {
    return (source: Observable<BarEvent>) => {
      if (request.gapPolicy === 'skip') {
        // 跳过缺口，直接返回原始数据
        return source;
      }

      // 'fill' 策略：收集所有数据后处理缺口
      return source.pipe(
        scan((acc, event) => [...acc, event], [] as BarEvent[]),
        concatMap(events => {
          if (events.length < 2) {
            return from(events);
          }

          // 检测缺口
          const intervalMs = timeframeToMs(request.baseTimeframe);
          const gaps = this.gapDetector.detectGaps(events, intervalMs, request.baseTimeframe);

          if (gaps.length === 0) {
            return from(events);
          }

          // 填充缺口
          const filled = this.gapFiller.mergeWithFilled(
            events,
            gaps,
            request.fillMethod || 'forwardFill',
            request.baseTimeframe
          );

          return from(filled);
        })
      );
    };
  }

  /**
   * 获取元数据
   */
  async getMetadata(symbol: string, timeframe: Timeframe = '1m'): Promise<DataMetadata> {
    await this.initConnection();

    const sql = this.queryBuilder.buildMetadataQuery(symbol, timeframe);

    return new Promise((resolve, reject) => {
      this.connection!.all(sql, (err, rows: any[]) => {
        if (err) {
          reject(new Error(`Failed to get metadata: ${err.message}`));
          return;
        }

        if (rows.length === 0) {
          reject(new Error(`No data found for symbol: ${symbol}`));
          return;
        }

        const row = rows[0];
        
        resolve({
          symbol,
          availableTimeframes: [timeframe], // 简化实现
          startTime: row.start_time,
          endTime: row.end_time,
          totalRecords: Number(row.total_records),
          quality: {
            completeness: 100, // 需要实际计算
            knownGaps: [],
          },
        });
      });
    });
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.close((err) => {
          if (err) {
            reject(new Error(`Failed to close connection: ${err.message}`));
            return;
          }
          this.connection = null;
          
          if (this.db) {
            this.db.close((dbErr) => {
              if (dbErr) {
                reject(new Error(`Failed to close database: ${dbErr.message}`));
                return;
              }
              this.db = null;
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * 创建 ParquetDuckDBProvider 实例
 */
export function createParquetDuckDBProvider(
  config?: Partial<DataSourceConfig>
): DataProvider {
  return new ParquetDuckDBProvider(config);
}

