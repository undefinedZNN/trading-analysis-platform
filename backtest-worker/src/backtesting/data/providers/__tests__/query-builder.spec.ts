/**
 * QueryBuilder 单元测试
 */

import { DefaultDuckDBQueryBuilder } from '../query-builder';
import { FetchRequest, BatchQuery } from '../interfaces';

describe('DuckDBQueryBuilder', () => {
  let builder: DefaultDuckDBQueryBuilder;

  beforeEach(() => {
    builder = new DefaultDuckDBQueryBuilder('storage/datasets');
  });

  describe('buildRangeQuery', () => {
    it('should build basic range query', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
      };

      const batch: BatchQuery = {
        batchIndex: 0,
        startTime: '',
        endTime: '',
        expectedRows: 100,
        offset: 0,
        limit: 100,
      };

      const sql = builder.buildRangeQuery(request, batch);
      
      expect(sql).toContain('SELECT');
      expect(sql).toContain('FROM read_parquet');
      expect(sql).toContain('storage/datasets/BTC-USDT/1m/**/*.parquet');
      expect(sql).toContain('WHERE timestamp >=');
      expect(sql).toContain('AND timestamp <');
      expect(sql).toContain('ORDER BY timestamp ASC');
      expect(sql).toContain('LIMIT 100 OFFSET 0');
    });

    it('should include market in path when provided', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        market: 'binance',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
      };

      const batch: BatchQuery = {
        batchIndex: 0,
        startTime: '',
        endTime: '',
        expectedRows: 100,
        offset: 0,
        limit: 100,
      };

      const sql = builder.buildRangeQuery(request, batch);
      
      expect(sql).toContain('storage/datasets/BTC-USDT/binance/1m/**/**/*.parquet');
    });

    it('should use specified fields', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
        fields: ['open', 'close', 'volume'],
      };

      const batch: BatchQuery = {
        batchIndex: 0,
        startTime: '',
        endTime: '',
        expectedRows: 100,
        offset: 0,
        limit: 100,
      };

      const sql = builder.buildRangeQuery(request, batch);
      
      expect(sql).toContain('timestamp');
      expect(sql).toContain('open');
      expect(sql).toContain('close');
      expect(sql).toContain('volume');
    });

    it('should handle offset and limit correctly', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
      };

      const batch: BatchQuery = {
        batchIndex: 1,
        startTime: '',
        endTime: '',
        expectedRows: 500,
        offset: 1000,
        limit: 500,
      };

      const sql = builder.buildRangeQuery(request, batch);
      
      expect(sql).toContain('LIMIT 500 OFFSET 1000');
    });
  });

  describe('buildCountQuery', () => {
    it('should build count query', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
      };

      const sql = builder.buildCountQuery(request);
      
      expect(sql).toContain('SELECT COUNT(*)');
      expect(sql).toContain('FROM read_parquet');
      expect(sql).toContain('WHERE timestamp >=');
    });
  });

  describe('buildMetadataQuery', () => {
    it('should build metadata query', () => {
      const sql = builder.buildMetadataQuery('BTC-USDT', '1m');
      
      expect(sql).toContain('SELECT');
      expect(sql).toContain('COUNT(*) AS total_records');
      expect(sql).toContain('MIN(timestamp) AS start_time');
      expect(sql).toContain('MAX(timestamp) AS end_time');
      expect(sql).toContain('FROM read_parquet');
      expect(sql).toContain('storage/datasets/BTC-USDT/1m/**/*.parquet');
    });
  });

  describe('buildFullRangeQuery', () => {
    it('should build query without pagination', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
      };

      const sql = builder.buildFullRangeQuery(request);
      
      expect(sql).toContain('SELECT');
      expect(sql).toContain('FROM read_parquet');
      expect(sql).toContain('WHERE timestamp >=');
      expect(sql).not.toContain('LIMIT');
      expect(sql).not.toContain('OFFSET');
    });
  });

  describe('buildBatches', () => {
    it('should split into multiple batches', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
        batchSize: 100,
        overlapSize: 0,
      };

      const batches = builder.buildBatches(request, 250);
      
      expect(batches).toHaveLength(3); // 100 + 100 + 50
      expect(batches[0].offset).toBe(0);
      expect(batches[0].limit).toBe(100);
      expect(batches[1].offset).toBe(100);
      expect(batches[1].limit).toBe(100);
      expect(batches[2].offset).toBe(200);
      expect(batches[2].limit).toBe(50);
    });

    it('should handle overlap correctly', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
        batchSize: 100,
        overlapSize: 10,
      };

      const batches = builder.buildBatches(request, 200);
      
      expect(batches).toHaveLength(3); // With overlap
      expect(batches[0].offset).toBe(0);
      expect(batches[0].limit).toBe(100);
      expect(batches[1].offset).toBe(90); // 100 - 10
      expect(batches[1].limit).toBe(100);
      expect(batches[2].offset).toBe(180); // 90 + 90
      expect(batches[2].limit).toBe(20);
    });

    it('should create single batch if data fits', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
        batchSize: 1000,
      };

      const batches = builder.buildBatches(request, 500);
      
      expect(batches).toHaveLength(1);
      expect(batches[0].limit).toBe(500);
    });

    it('should throw error if overlapSize >= batchSize', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
        batchSize: 100,
        overlapSize: 100,
      };

      expect(() => builder.buildBatches(request, 200)).toThrow();
    });
  });

  describe('buildGapDetectionQuery', () => {
    it('should build gap detection query with window functions', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
      };

      const sql = builder.buildGapDetectionQuery(request);
      
      expect(sql).toContain('LAG(timestamp)');
      expect(sql).toContain('OVER (ORDER BY timestamp)');
      expect(sql).toContain('EXTRACT(EPOCH');
      expect(sql).toContain('interval_ms');
    });
  });

  describe('buildFeatureQuery', () => {
    it('should build query with feature fields', () => {
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
      };

      const featureIds = ['rsi', 'macd', 'ema20'];
      const sql = builder.buildFeatureQuery(request, featureIds);
      
      expect(sql).toContain('timestamp');
      expect(sql).toContain('open');
      expect(sql).toContain('close');
      expect(sql).toContain('rsi');
      expect(sql).toContain('macd');
      expect(sql).toContain('ema20');
    });
  });

  describe('constructor with custom path', () => {
    it('should use custom storage path', () => {
      const customBuilder = new DefaultDuckDBQueryBuilder('/custom/path');
      
      const request: FetchRequest = {
        symbol: 'BTC-USDT',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T01:00:00.000Z',
        baseTimeframe: '1m',
      };

      const batch: BatchQuery = {
        batchIndex: 0,
        startTime: '',
        endTime: '',
        expectedRows: 100,
        offset: 0,
        limit: 100,
      };

      const sql = customBuilder.buildRangeQuery(request, batch);
      
      expect(sql).toContain('/custom/path/BTC-USDT/1m/**/*.parquet');
    });
  });
});

