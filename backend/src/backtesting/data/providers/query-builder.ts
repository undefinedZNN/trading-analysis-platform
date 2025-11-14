/**
 * DuckDB 查询构建器
 * 
 * 负责构建 DuckDB SQL 查询语句，用于从 Parquet 文件中读取数据
 */

import { Timeframe } from '../timeframe/interfaces';
import { FetchRequest, BatchQuery, DuckDBQueryBuilder } from './interfaces';

/**
 * 默认 DuckDB 查询构建器实现
 */
export class DefaultDuckDBQueryBuilder implements DuckDBQueryBuilder {
  /**
   * 数据存储根路径
   */
  private readonly storageBasePath: string;

  constructor(storageBasePath: string = 'storage/datasets') {
    this.storageBasePath = storageBasePath;
  }

  /**
   * 构建范围查询 SQL
   * 
   * @param request 数据提取请求
   * @param batch 批次查询信息
   * @returns SQL 查询字符串
   */
  buildRangeQuery(request: FetchRequest, batch: BatchQuery): string {
    const { symbol, market, baseTimeframe, fields } = request;
    const { offset, limit } = batch;

    // 构建 Parquet 文件路径
    const parquetPath = this.buildParquetPath(symbol, market, baseTimeframe);

    // 构建字段列表
    const fieldList = this.buildFieldList(fields);

    // 构建查询 SQL
    const sql = `
      SELECT ${fieldList}
      FROM read_parquet('${parquetPath}')
      WHERE timestamp >= '${request.start}' 
        AND timestamp < '${request.end}'
      ORDER BY timestamp ASC
      LIMIT ${limit} OFFSET ${offset}
    `.trim();

    return sql;
  }

  /**
   * 构建缺口检测查询 SQL
   * 
   * @param request 数据提取请求
   * @returns SQL 查询字符串
   */
  buildGapDetectionQuery(request: FetchRequest): string {
    const { symbol, market, baseTimeframe } = request;
    const parquetPath = this.buildParquetPath(symbol, market, baseTimeframe);

    // 使用窗口函数计算时间间隔
    const sql = `
      WITH ordered_data AS (
        SELECT 
          timestamp,
          LAG(timestamp) OVER (ORDER BY timestamp) AS prev_timestamp
        FROM read_parquet('${parquetPath}')
        WHERE timestamp >= '${request.start}' 
          AND timestamp < '${request.end}'
      ),
      gaps AS (
        SELECT 
          prev_timestamp,
          timestamp,
          EXTRACT(EPOCH FROM (timestamp - prev_timestamp)) * 1000 AS interval_ms
        FROM ordered_data
        WHERE prev_timestamp IS NOT NULL
      )
      SELECT 
        prev_timestamp,
        timestamp,
        interval_ms
      FROM gaps
      WHERE interval_ms > ?
      ORDER BY prev_timestamp ASC
    `.trim();

    return sql;
  }

  /**
   * 构建元数据查询 SQL
   * 
   * @param symbol 标的代码
   * @param timeframe 时间框架
   * @returns SQL 查询字符串
   */
  buildMetadataQuery(symbol: string, timeframe: Timeframe): string {
    const parquetPath = this.buildParquetPath(symbol, undefined, timeframe);

    const sql = `
      SELECT 
        COUNT(*) AS total_records,
        MIN(timestamp) AS start_time,
        MAX(timestamp) AS end_time,
        MIN(open) AS min_price,
        MAX(high) AS max_price,
        SUM(volume) AS total_volume
      FROM read_parquet('${parquetPath}')
    `.trim();

    return sql;
  }

  /**
   * 构建计数查询 SQL
   * 
   * @param request 数据提取请求
   * @returns SQL 查询字符串
   */
  buildCountQuery(request: FetchRequest): string {
    const { symbol, market, baseTimeframe } = request;
    const parquetPath = this.buildParquetPath(symbol, market, baseTimeframe);

    const sql = `
      SELECT COUNT(*) AS count
      FROM read_parquet('${parquetPath}')
      WHERE timestamp >= '${request.start}' 
        AND timestamp < '${request.end}'
    `.trim();

    return sql;
  }

  /**
   * 构建时间范围查询 SQL（不带分页）
   * 
   * @param request 数据提取请求
   * @returns SQL 查询字符串
   */
  buildFullRangeQuery(request: FetchRequest): string {
    const { symbol, market, baseTimeframe, fields } = request;
    const parquetPath = this.buildParquetPath(symbol, market, baseTimeframe);
    const fieldList = this.buildFieldList(fields);

    const sql = `
      SELECT ${fieldList}
      FROM read_parquet('${parquetPath}')
      WHERE timestamp >= '${request.start}' 
        AND timestamp < '${request.end}'
      ORDER BY timestamp ASC
    `.trim();

    return sql;
  }

  /**
   * 构建 Parquet 文件路径
   * 
   * 路径格式: storage/datasets/{symbol}/{market}/{timeframe}/**\/\*.parquet
   * 如果没有 market，则为: storage/datasets/{symbol}/{timeframe}/**\/\*.parquet
   * 
   * 使用递归通配符来匹配子目录中的 Parquet 文件
   * （例如：dt=2022-12-15/hour=00/batch_15.parquet）
   * 
   * @param symbol 标的代码
   * @param market 市场（可选）
   * @param timeframe 时间框架
   * @returns Parquet 文件路径（递归通配符）
   */
  private buildParquetPath(
    symbol: string,
    market: string | undefined,
    timeframe: Timeframe
  ): string {
    if (market) {
      return `${this.storageBasePath}/${symbol}/${market}/${timeframe}/**/*.parquet`;
    }
    return `${this.storageBasePath}/${symbol}/${timeframe}/**/*.parquet`;
  }

  /**
   * 构建字段列表
   * 
   * @param fields 字段数组
   * @returns SQL 字段列表字符串
   */
  private buildFieldList(
    fields: Array<'open' | 'high' | 'low' | 'close' | 'volume' | 'trades' | 'notional' | string> | undefined
  ): string {
    // 默认字段
    const defaultFields = [
      'timestamp',
      'open',
      'high',
      'low',
      'close',
      'volume',
      'trades',
      'notional',
    ];

    if (!fields || fields.length === 0) {
      return defaultFields.join(', ');
    }

    // 确保 timestamp 总是包含在内
    const fieldSet = new Set(['timestamp', ...fields]);
    return Array.from(fieldSet).join(', ');
  }

  /**
   * 转义 SQL 字符串
   * 
   * @param value 需要转义的值
   * @returns 转义后的字符串
   */
  private escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * 构建批次数组
   * 
   * @param request 数据提取请求
   * @param totalRecords 总记录数
   * @returns 批次查询数组
   */
  buildBatches(request: FetchRequest, totalRecords: number): BatchQuery[] {
    const batchSize = request.batchSize || 10000;
    const overlapSize = request.overlapSize || 0;

    const batches: BatchQuery[] = [];
    let offset = 0;
    let batchIndex = 0;

    // 如果重叠大于等于批次大小，避免无限循环
    if (overlapSize >= batchSize) {
      throw new Error('overlapSize must be less than batchSize');
    }

    while (offset < totalRecords) {
      const limit = Math.min(batchSize, totalRecords - offset);
      
      batches.push({
        batchIndex,
        startTime: '', // 需要根据实际数据计算
        endTime: '',   // 需要根据实际数据计算
        expectedRows: limit,
        offset,
        limit,
      });

      // 下一个批次的起始位置考虑重叠
      // 为了避免无限循环，确保offset总是向前移动
      const step = Math.max(batchSize - overlapSize, 1);
      offset += step;
      batchIndex++;

      // 安全检查：如果批次数超过合理范围，退出
      if (batchIndex > totalRecords + 10) {
        throw new Error('Batch generation infinite loop detected');
      }
    }

    return batches;
  }

  /**
   * 构建特征查询（如果数据中包含预计算的特征）
   * 
   * @param request 数据提取请求
   * @param featureIds 特征 ID 列表
   * @returns SQL 查询字符串
   */
  buildFeatureQuery(request: FetchRequest, featureIds: string[]): string {
    const { symbol, market, baseTimeframe } = request;
    const parquetPath = this.buildParquetPath(symbol, market, baseTimeframe);

    // 基础字段
    const baseFields = [
      'timestamp',
      'open',
      'high',
      'low',
      'close',
      'volume',
    ];

    // 添加特征字段
    const allFields = [...baseFields, ...featureIds];

    const sql = `
      SELECT ${allFields.join(', ')}
      FROM read_parquet('${parquetPath}')
      WHERE timestamp >= '${request.start}' 
        AND timestamp < '${request.end}'
      ORDER BY timestamp ASC
    `.trim();

    return sql;
  }
}

/**
 * 创建默认的查询构建器实例
 * 
 * @param storageBasePath 数据存储根路径
 * @returns DuckDBQueryBuilder 实例
 */
export function createQueryBuilder(storageBasePath?: string): DuckDBQueryBuilder {
  return new DefaultDuckDBQueryBuilder(storageBasePath);
}

