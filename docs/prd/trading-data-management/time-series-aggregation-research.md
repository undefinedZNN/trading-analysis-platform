# 交易数据多时间周期聚合调研报告

## 1. 背景与需求

### 1.1 当前架构现状

#### 数据存储
- 原始数据以最细粒度（如tick、1s、1m）存储为Parquet文件
- 存储路径: `storage/datasets/{source}/{trading_pair}/{granularity}/dt={date}/hour={hour}/batch_{importId}.parquet`
- 使用DuckDB作为查询引擎访问Parquet文件

#### 数据访问模式
**回测系统访问**：
- 通过 `ParquetDuckDBProvider` 读取数据
- 支持指定时间范围和基础时间粒度
- 批量加载，支持流式处理

**图表可视化访问**（TradingView集成）：
- `TradingDataService.getDatasetCandles()` 方法
- 实时使用DuckDB进行时间粒度聚合
- SQL示例：
```sql
WITH filtered AS (
  SELECT *,
    CAST(FLOOR(epoch(timestamp) / ${intervalSeconds}) * ${intervalSeconds} AS BIGINT) AS bucket
  FROM read_parquet([...])
  WHERE timestamp BETWEEN '...' AND '...'
)
SELECT
  bucket AS time,
  arg_min(open, timestamp) AS open,
  max(high) AS high,
  min(low) AS low,
  arg_max(close, timestamp) AS close,
  sum(volume) AS volume
FROM filtered
GROUP BY bucket
ORDER BY bucket
```

#### 当前痛点
1. **计算开销**：每次查询高时间周期数据都需要实时聚合
2. **IO开销**：需要读取大量原始细粒度数据
3. **性能瓶颈**：大数据集（如数年的分钟级数据）聚合到日线或周线时延迟明显
4. **重复计算**：相同时间范围的聚合请求需要重复计算

### 1.2 用户需求

#### 核心需求
在数据导入阶段或导入完成后，自动或手动触发多时间周期聚合，生成以下粒度的数据：

| 粒度 | 符号 | 适用场景 |
|------|------|----------|
| 1秒 | 1s | 高频回测、tick数据聚合 |
| 1分钟 | 1m | 短期策略、日内交易 |
| 5分钟 | 5m | 日内策略 |
| 15分钟 | 15m | 日内到短期策略 |
| 30分钟 | 30m | 日内到短期策略 |
| 1小时 | 1h | 短期到中期策略 |
| 1天 | 1d | 中长期策略、每日分析 |
| 1周 | 1w | 周线策略、长期趋势 |
| 1月 | 1M | 月线策略、宏观分析 |

#### 功能需求
1. **触发方式**
   - 自动触发：数据导入完成后自动聚合
   - 手动触发：用户在UI或API手动触发聚合
   - 批量触发：批量对已有数据集进行聚合

2. **聚合配置**
   - 可选择需要聚合的时间周期
   - 支持增量聚合（追加数据时只聚合新增部分）

3. **进度追踪**
   - 显示聚合任务状态和进度
   - 支持取消或重试失败的聚合任务

---

## 2. 技术方案调研

### 2.1 方案A：物化预聚合（Materialized Pre-Aggregation）

#### 设计思路
为每个数据集的每个目标时间周期生成独立的Parquet文件存储聚合结果。

#### 存储结构
```
storage/datasets/
  └── {source}/
      └── {trading_pair}/
          ├── 1s/          # 原始或基础粒度
          │   └── dt=2024-01-01/hour=00/batch_1.parquet
          ├── 1m/          # 预聚合：1分钟
          │   └── dt=2024-01-01/hour=00/agg_1m_from_1s.parquet
          ├── 5m/          # 预聚合：5分钟
          │   └── dt=2024-01-01/agg_5m_from_1s.parquet
          ├── 1h/          # 预聚合：1小时
          │   └── dt=2024-01-01/agg_1h_from_1s.parquet
          └── 1d/          # 预聚合：1天
              └── agg_1d_from_1s.parquet
```

#### 数据表设计

**新增表：`dataset_aggregations`**
```sql
CREATE TABLE dataset_aggregations (
  aggregation_id      SERIAL PRIMARY KEY,
  dataset_id          INTEGER NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
  source_granularity  TEXT NOT NULL,      -- 源粒度，如 '1s'
  target_granularity  TEXT NOT NULL,      -- 目标粒度，如 '1h', '1d'
  path                TEXT NOT NULL,      -- 聚合结果存储路径
  time_start          TIMESTAMPTZ NOT NULL,
  time_end            TIMESTAMPTZ NOT NULL,
  row_count           BIGINT NOT NULL,
  checksum            TEXT NOT NULL,
  status              TEXT NOT NULL,      -- 'pending', 'processing', 'completed', 'failed'
  progress            NUMERIC(5,2) DEFAULT 0,
  error_log           TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dataset_id, target_granularity)
);

CREATE INDEX idx_aggregations_dataset ON dataset_aggregations(dataset_id);
CREATE INDEX idx_aggregations_status ON dataset_aggregations(status);
```

**新增表：`aggregation_tasks`**
```sql
CREATE TABLE aggregation_tasks (
  task_id             SERIAL PRIMARY KEY,
  aggregation_id      INTEGER REFERENCES dataset_aggregations(aggregation_id) ON DELETE CASCADE,
  dataset_id          INTEGER NOT NULL REFERENCES datasets(dataset_id),
  target_granularity  TEXT NOT NULL,
  trigger_type        TEXT NOT NULL,      -- 'auto', 'manual', 'retry'
  triggered_by        TEXT,
  status              TEXT NOT NULL,      -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  progress            NUMERIC(5,2) DEFAULT 0,
  message             TEXT,
  error_log           TEXT,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_aggregation_tasks_status ON aggregation_tasks(status);
CREATE INDEX idx_aggregation_tasks_dataset ON aggregation_tasks(dataset_id);
```

#### 聚合算法实现

**DuckDB SQL 模板**：
```typescript
interface AggregationConfig {
  sourceGranularity: string;      // '1s'
  targetGranularity: string;      // '1h'
  sourcePaths: string[];          // Parquet文件路径列表
  outputPath: string;             // 输出路径
  timeStart: Date;
  timeEnd: Date;
}

function buildAggregationSQL(config: AggregationConfig): string {
  const intervalSeconds = parseGranularityToSeconds(config.targetGranularity);
  
  return `
    WITH source_data AS (
      SELECT 
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        trades,
        notional
      FROM read_parquet([${config.sourcePaths.map(p => `'${p}'`).join(', ')}])
      WHERE timestamp >= TIMESTAMP '${config.timeStart.toISOString()}'
        AND timestamp < TIMESTAMP '${config.timeEnd.toISOString()}'
    ),
    bucketed AS (
      SELECT 
        *,
        CAST(
          FLOOR(epoch(timestamp) / ${intervalSeconds}) * ${intervalSeconds}
        AS BIGINT) AS bucket
      FROM source_data
    )
    SELECT
      to_timestamp(bucket) AS timestamp,
      arg_min(open, timestamp) AS open,
      max(high) AS high,
      min(low) AS low,
      arg_max(close, timestamp) AS close,
      sum(volume) AS volume,
      sum(COALESCE(trades, 0)) AS trades,
      sum(COALESCE(notional, 0)) AS notional
    FROM bucketed
    GROUP BY bucket
    ORDER BY bucket
  `;
}
```

#### 聚合服务实现

```typescript
@Injectable()
export class DataAggregationService {
  constructor(
    @InjectRepository(DatasetEntity)
    private datasetRepo: Repository<DatasetEntity>,
    @InjectRepository(DatasetAggregationEntity)
    private aggregationRepo: Repository<DatasetAggregationEntity>,
    @InjectRepository(AggregationTaskEntity)
    private taskRepo: Repository<AggregationTaskEntity>,
  ) {}

  /**
   * 为数据集创建聚合任务
   */
  async createAggregationTasks(
    datasetId: number,
    targetGranularities: string[],
    triggerType: 'auto' | 'manual' = 'auto',
    triggeredBy?: string,
  ): Promise<AggregationTaskEntity[]> {
    const dataset = await this.datasetRepo.findOneOrFail({
      where: { datasetId },
      relations: ['batches'],
    });

    const tasks: AggregationTaskEntity[] = [];
    
    for (const targetGranularity of targetGranularities) {
      // 验证聚合粒度合法性
      if (!this.canAggregate(dataset.granularity, targetGranularity)) {
        throw new BadRequestException(
          `Cannot aggregate from ${dataset.granularity} to ${targetGranularity}`
        );
      }

      // 检查是否已存在聚合记录
      let aggregation = await this.aggregationRepo.findOne({
        where: { datasetId, targetGranularity },
      });

      if (!aggregation) {
        aggregation = this.aggregationRepo.create({
          datasetId,
          sourceGranularity: dataset.granularity,
          targetGranularity,
          path: this.buildAggregationPath(dataset, targetGranularity),
          timeStart: dataset.timeStart,
          timeEnd: dataset.timeEnd,
          rowCount: 0,
          checksum: '',
          status: 'pending',
        });
        await this.aggregationRepo.save(aggregation);
      }

      // 创建任务
      const task = this.taskRepo.create({
        aggregationId: aggregation.aggregationId,
        datasetId,
        targetGranularity,
        triggerType,
        triggeredBy,
        status: 'pending',
      });
      
      tasks.push(await this.taskRepo.save(task));
    }

    // 异步执行聚合
    this.scheduleAggregations(tasks);

    return tasks;
  }

  /**
   * 执行聚合任务
   */
  private async executeAggregation(task: AggregationTaskEntity): Promise<void> {
    const logger = new Logger(`AggregationTask-${task.taskId}`);
    
    try {
      await this.taskRepo.update(task.taskId, {
        status: 'running',
        startedAt: new Date(),
      });

      const dataset = await this.datasetRepo.findOneOrFail({
        where: { datasetId: task.datasetId },
        relations: ['batches'],
      });

      const aggregation = await this.aggregationRepo.findOneOrFail({
        where: { aggregationId: task.aggregationId },
      });

      // 收集源文件路径
      const sourcePaths = dataset.batches.map(b => 
        resolveDatasetPath(b.path)
      );

      // 构建输出路径
      const outputPath = resolveDatasetPath(aggregation.path);
      await mkdir(dirname(outputPath), { recursive: true });

      // 构建并执行聚合SQL
      const sql = this.buildAggregationSQL({
        sourceGranularity: dataset.granularity,
        targetGranularity: task.targetGranularity,
        sourcePaths,
        outputPath,
        timeStart: dataset.timeStart,
        timeEnd: dataset.timeEnd,
      });

      const db = new duckdb.Database(':memory:');
      const connection = db.connect();

      // 创建临时表
      await this.execDuckDB(connection, sql);

      // 导出到Parquet
      const exportSQL = `
        COPY (${sql})
        TO '${outputPath}'
        (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
      `;
      await this.execDuckDB(connection, exportSQL);

      // 获取统计信息
      const stats = await this.getAggregationStats(connection, sql);
      
      connection.close();
      db.close();

      // 计算校验和
      const checksum = await this.computeFileChecksum(outputPath);

      // 更新聚合记录
      await this.aggregationRepo.update(aggregation.aggregationId, {
        rowCount: stats.rowCount,
        checksum,
        status: 'completed',
        timeStart: stats.timeStart,
        timeEnd: stats.timeEnd,
      });

      // 更新任务状态
      await this.taskRepo.update(task.taskId, {
        status: 'completed',
        progress: 100,
        finishedAt: new Date(),
      });

      logger.log(`聚合任务 ${task.taskId} 完成，生成 ${stats.rowCount} 条记录`);
    } catch (error) {
      logger.error(`聚合任务 ${task.taskId} 失败: ${error.message}`);
      
      await this.taskRepo.update(task.taskId, {
        status: 'failed',
        message: error.message,
        errorLog: error.stack,
        finishedAt: new Date(),
      });

      await this.aggregationRepo.update(task.aggregationId!, {
        status: 'failed',
      });
    }
  }

  /**
   * 验证聚合粒度合法性
   */
  private canAggregate(source: string, target: string): boolean {
    const sourceMs = parseGranularityToMs(source);
    const targetMs = parseGranularityToMs(target);
    
    // 目标粒度必须大于等于源粒度
    if (targetMs < sourceMs) {
      return false;
    }
    
    // 目标粒度必须是源粒度的整数倍
    return targetMs % sourceMs === 0;
  }

  /**
   * 构建聚合结果存储路径
   */
  private buildAggregationPath(
    dataset: DatasetEntity,
    targetGranularity: string,
  ): string {
    const source = dataset.source || 'unknown';
    const pair = dataset.tradingPair.replace('/', '_');
    return posixPath.join(
      source,
      pair,
      targetGranularity,
      `agg_${targetGranularity}_from_${dataset.granularity}.parquet`
    );
  }
}
```

#### 查询层自动路由

修改 `TradingDataService.getDatasetCandles()` 和回测系统的数据提供者，优先使用预聚合数据：

```typescript
async getDatasetCandles(
  datasetId: number,
  query: DatasetCandlesQueryDto,
): Promise<CandlesResponse> {
  const dataset = await this.datasetsRepository.findOneOrFail({
    where: { datasetId },
    relations: ['batches', 'aggregations'],
  });

  const resolution = query.resolution ?? dataset.granularity;

  // 检查是否有可用的预聚合数据
  const aggregation = dataset.aggregations?.find(
    agg => agg.targetGranularity === resolution && agg.status === 'completed'
  );

  if (aggregation) {
    // 使用预聚合数据
    return this.queryCandlesFromAggregation(aggregation, query);
  } else {
    // 降级到实时聚合
    return this.queryCandlesWithRealTimeAggregation(dataset, query);
  }
}
```

#### 优点
- ✅ **性能最优**：查询时无需计算，直接读取预聚合结果
- ✅ **响应速度快**：IO量显著减少，特别是跨越大时间范围查询
- ✅ **降低计算压力**：聚合计算一次性完成，查询时无CPU开销
- ✅ **缓存效果好**：预聚合文件可被操作系统文件缓存

#### 缺点
- ❌ **存储空间翻倍**：每个聚合粒度需要额外存储空间
- ❌ **数据一致性维护复杂**：追加写入时需要更新所有聚合粒度
- ❌ **初次聚合耗时**：导入后需等待聚合完成才能使用
- ❌ **灵活性差**：只能查询预定义的粒度

#### 存储空间估算

假设原始数据为1分钟粒度，1年数据：
- 1m数据：365 * 24 * 60 = 525,600 条记录
- 5m数据：525,600 / 5 = 105,120 条（约20%）
- 15m数据：35,040 条（约6.7%）
- 30m数据：17,520 条（约3.3%）
- 1h数据：8,760 条（约1.7%）
- 1d数据：365 条（约0.07%）
- 总增长：约31.77%

考虑Parquet压缩率，实际存储增长约**15-25%**。

---

### 2.2 方案B：按需聚合 + 查询缓存（On-Demand + Cache）

#### 设计思路
不预先生成聚合数据，而是在首次查询时进行聚合计算，并将结果缓存。

#### 缓存策略
1. **内存缓存**（Redis/Memcached）
   - 缓存最近查询的聚合结果
   - TTL：1小时 - 24小时
   - LRU淘汰策略

2. **持久化缓存**（临时Parquet文件）
   - 缓存到临时目录：`storage/cache/aggregations/{dataset_id}/{granularity}/{start}_{end}.parquet`
   - 定期清理（如保留7天）

#### 缓存表设计

```sql
CREATE TABLE aggregation_cache (
  cache_id            SERIAL PRIMARY KEY,
  dataset_id          INTEGER NOT NULL,
  target_granularity  TEXT NOT NULL,
  time_start          TIMESTAMPTZ NOT NULL,
  time_end            TIMESTAMPTZ NOT NULL,
  cache_path          TEXT NOT NULL,
  row_count           BIGINT NOT NULL,
  hit_count           INTEGER DEFAULT 0,
  last_accessed_at    TIMESTAMPTZ DEFAULT now(),
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dataset_id, target_granularity, time_start, time_end)
);

CREATE INDEX idx_cache_expiry ON aggregation_cache(expires_at);
CREATE INDEX idx_cache_access ON aggregation_cache(last_accessed_at);
```

#### 实现示例

```typescript
@Injectable()
export class CachedAggregationService {
  constructor(
    @InjectRepository(AggregationCacheEntity)
    private cacheRepo: Repository<AggregationCacheEntity>,
    @Inject('REDIS')
    private redis: Redis,
  ) {}

  async getOrComputeCandles(
    dataset: DatasetEntity,
    query: CandlesQuery,
  ): Promise<Candle[]> {
    const cacheKey = this.buildCacheKey(dataset.datasetId, query);

    // 1. 尝试从Redis读取
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. 尝试从持久化缓存读取
    const persistedCache = await this.cacheRepo.findOne({
      where: {
        datasetId: dataset.datasetId,
        targetGranularity: query.resolution,
        timeStart: query.from,
        timeEnd: query.to,
      },
    });

    if (persistedCache && new Date() < persistedCache.expiresAt) {
      const candles = await this.readCandlesFromCache(persistedCache.cachePath);
      
      // 回填Redis
      await this.redis.setex(cacheKey, 3600, JSON.stringify(candles));
      
      // 更新访问统计
      await this.cacheRepo.update(persistedCache.cacheId, {
        hitCount: () => 'hit_count + 1',
        lastAccessedAt: new Date(),
      });

      return candles;
    }

    // 3. 实时计算并缓存
    const candles = await this.computeAggregation(dataset, query);

    // 存入Redis
    await this.redis.setex(cacheKey, 3600, JSON.stringify(candles));

    // 对于大结果集，持久化缓存
    if (candles.length > 1000) {
      await this.persistCache(dataset.datasetId, query, candles);
    }

    return candles;
  }

  /**
   * 定期清理过期缓存
   */
  @Cron('0 0 * * *')  // 每天凌晨
  async cleanExpiredCache(): Promise<void> {
    const expired = await this.cacheRepo.find({
      where: {
        expiresAt: LessThan(new Date()),
      },
    });

    for (const cache of expired) {
      await unlink(cache.cachePath).catch(() => {});
      await this.cacheRepo.delete(cache.cacheId);
    }

    this.logger.log(`清理了 ${expired.length} 个过期缓存`);
  }
}
```

#### 优点
- ✅ **存储开销小**：只缓存被查询过的数据
- ✅ **灵活性高**：支持任意时间范围和粒度查询
- ✅ **无需预处理**：导入后立即可用
- ✅ **自适应**：热点数据自动缓存

#### 缺点
- ❌ **首次查询慢**：冷缓存时需要实时计算
- ❌ **缓存管理复杂**：需要考虑失效、更新、清理策略
- ❌ **缓存一致性问题**：追加写入时需要失效相关缓存
- ❌ **内存压力**：大量缓存可能占用大量内存

---

### 2.3 方案C：混合方案（热点预聚合 + 按需聚合）

#### 设计思路
结合方案A和方案B的优点：
- 对常用时间粒度（如1m、5m、1h、1d）进行预聚合
- 对不常用或自定义粒度使用按需聚合 + 缓存

#### 预聚合粒度策略

**核心粒度（必须预聚合）**：
- 5m（日内策略常用）
- 1h（日内分析常用）

**可选粒度（按需预聚合）**：
- 15m、30m（根据用户配置）
- 1d、1M（长周期分析）

**按需聚合**：
- 非标准粒度（如7m、45m）
- 自定义时间范围的聚合

#### 配置管理

```typescript
// 数据集聚合配置
interface DatasetAggregationConfig {
  datasetId: number;
  autoAggregateOnImport: boolean;          // 导入后自动聚合
  preAggregateGranularities: string[];     // 预聚合粒度列表
  enableCache: boolean;                     // 启用查询缓存
  cacheStrategy: 'memory' | 'disk' | 'both';
}

// 全局默认配置
const DEFAULT_AGGREGATION_CONFIG: Partial<DatasetAggregationConfig> = {
  autoAggregateOnImport: true,
  preAggregateGranularities: ['5m', '1h'],  // 默认聚合5分钟和小时
  enableCache: true,
  cacheStrategy: 'both',
};
```

#### 智能路由

```typescript
async getCandles(datasetId: number, query: CandlesQuery): Promise<Candle[]> {
  const dataset = await this.getDataset(datasetId);
  const resolution = query.resolution;

  // 1. 检查是否有预聚合数据
  const aggregation = await this.findCompletedAggregation(datasetId, resolution);
  if (aggregation) {
    return this.queryCandlesFromAggregation(aggregation, query);
  }

  // 2. 检查是否可从更大粒度的预聚合数据二次聚合
  const coarserAggregation = await this.findCoarserAggregation(datasetId, resolution);
  if (coarserAggregation && this.isMoreEfficientThanRaw(coarserAggregation, dataset)) {
    return this.queryCandlesFromCoarserAggregation(coarserAggregation, resolution, query);
  }

  // 3. 降级到按需聚合 + 缓存
  return this.cachedAggregationService.getOrComputeCandles(dataset, query);
}

/**
 * 判断从较粗粒度二次聚合是否比从原始数据聚合更高效
 */
private isMoreEfficientThanRaw(
  coarserAggregation: DatasetAggregationEntity,
  dataset: DatasetEntity,
): boolean {
  // 简单启发式：如果粗粒度数据量小于原始数据的50%，则使用粗粒度
  return coarserAggregation.rowCount < dataset.rowCount * 0.5;
}
```

#### 优点
- ✅ **兼顾性能和存储**：只预聚合常用粒度
- ✅ **灵活适应**：罕见需求通过按需聚合满足
- ✅ **渐进优化**：可根据实际使用情况调整预聚合策略
- ✅ **成本可控**：存储和计算开销可配置

#### 缺点
- ❌ **实现复杂度高**：需要维护多种数据获取路径
- ❌ **配置决策难**：需要预判哪些粒度是"常用"的
- ❌ **冷启动问题**：新数据集的最优配置需要时间探索

---

## 3. 对标产品调研

### 3.1 InfluxDB（时序数据库）

#### 聚合策略
- **Continuous Queries（持续查询）**：定期执行聚合，写入新表
- **Retention Policies（保留策略）**：自动淘汰原始高精度数据

#### 启示
- 提供了预聚合的自动化机制
- 与保留策略结合，自动降级数据精度

### 3.2 TimescaleDB（PostgreSQL扩展）

#### 聚合策略
- **Continuous Aggregates**：增量物化视图
- **Refresh Policies**：自动或手动刷新聚合

#### 特点
- 增量更新聚合，避免全量重算
- 查询优化器自动选择最优聚合粒度

#### 启示
- 增量聚合可大幅减少追加写入时的聚合开销
- 透明的查询路由可简化应用层逻辑

### 3.3 Pandas/Arctic（量化回测平台）

#### 聚合策略
- **多分辨率存储**：同时存储多个时间粒度
- **按需降采样**：使用resample()函数实时聚合

#### 启示
- 小规模数据集按需聚合即可
- 大规模数据集建议预聚合常用粒度

### 3.4 TDengine（时序数据库）

#### 聚合策略
- **超级表（STable）**：支持多级聚合
- **流式计算**：实时聚合到下游表

#### 启示
- 流式聚合适合实时数据场景
- 批量历史数据更适合批处理聚合

---

## 4. 推荐方案

### 4.1 总体方案：混合方案C + 增量聚合

结合前述调研，推荐采用**混合方案**，具体策略如下：

#### 阶段一：MVP（最小可行产品）

**预聚合粒度**：
- 默认：`5m`、`1h`
- 可选（用户配置）：`15m`、`30m`、`1d`、`1M`

**触发方式**：
- 导入完成后自动触发（可配置关闭）
- 手动触发API：`POST /trading-data/datasets/:id/aggregate`

**查询路由**：
- 优先使用预聚合数据
- 降级到实时聚合（不缓存）

#### 阶段二：增量聚合优化

**增量更新机制**：
- 追加写入时，只聚合新增时间范围
- 使用 `dataset_batches` 表追踪已聚合的批次

**示例**：
```typescript
async appendAggregation(
  aggregation: DatasetAggregationEntity,
  newBatch: DatasetBatchEntity,
): Promise<void> {
  // 1. 聚合新增批次
  const newAggPath = await this.aggregateBatch(
    newBatch,
    aggregation.targetGranularity
  );

  // 2. 合并到现有聚合文件
  await this.mergeParquetFiles([
    aggregation.path,
    newAggPath,
  ], aggregation.path);

  // 3. 更新聚合元数据
  await this.aggregationRepo.update(aggregation.aggregationId, {
    timeEnd: newBatch.timeEnd,
    rowCount: /* 更新后的总行数 */,
    checksum: /* 重新计算校验和 */,
  });
}
```

#### 阶段三：查询缓存 + 智能预聚合

**查询缓存**：
- 对非预聚合粒度的查询结果进行持久化缓存
- 基于访问频率自动推荐预聚合粒度

**智能推荐**：
```typescript
@Cron('0 0 * * 0')  // 每周日凌晨
async analyzeAndRecommendAggregations(): Promise<void> {
  // 分析过去一周的查询日志
  const frequentQueries = await this.queryLogRepo
    .createQueryBuilder('log')
    .select('log.datasetId')
    .addSelect('log.targetGranularity')
    .addSelect('COUNT(*)', 'count')
    .where('log.createdAt > NOW() - INTERVAL \'7 days\'')
    .groupBy('log.datasetId')
    .addGroupBy('log.targetGranularity')
    .having('COUNT(*) > 10')  // 一周内查询超过10次
    .getRawMany();

  for (const { datasetId, targetGranularity, count } of frequentQueries) {
    // 检查是否已有预聚合
    const exists = await this.aggregationRepo.findOne({
      where: { datasetId, targetGranularity, status: 'completed' },
    });

    if (!exists) {
      this.logger.log(
        `推荐为数据集 ${datasetId} 预聚合粒度 ${targetGranularity}（查询次数：${count}）`
      );
      // 可以自动创建聚合任务，或通知管理员
    }
  }
}
```

### 4.2 实施路线图

#### M1：基础预聚合（2-3周）

**后端**：
1. 创建数据库表：`dataset_aggregations`、`aggregation_tasks`
2. 实现 `DataAggregationService`：
   - `createAggregationTasks()`
   - `executeAggregation()`
3. 修改导入流程，完成后自动触发聚合（可配置）
4. 实现手动触发API：`POST /trading-data/datasets/:id/aggregate`
5. 修改查询逻辑，优先使用预聚合数据

**前端**：
1. 数据集详情页显示聚合状态
2. 提供"生成聚合"按钮，支持选择粒度
3. 显示聚合任务进度

**测试**：
- 单元测试：聚合算法正确性
- 集成测试：端到端聚合流程
- 性能测试：聚合速度和查询性能对比

#### M2：增量聚合（1-2周）

1. 实现批次级别的增量聚合
2. 追加写入时自动更新所有聚合
3. 优化Parquet文件合并逻辑

#### M3：查询缓存与智能优化（1-2周）

1. 实现查询缓存表和服务
2. 记录查询日志
3. 实现智能推荐算法
4. 提供聚合配置管理界面

---

## 5. 性能评估

### 5.1 聚合性能测试（预估）

| 数据规模 | 源粒度 | 目标粒度 | 预估聚合时间 | 输出数据量 |
|---------|--------|----------|-------------|-----------|
| 1个月 1s数据 | 1s | 1m | ~30秒 | 原始的1/60 |
| 1个月 1s数据 | 1s | 1h | ~20秒 | 原始的1/3600 |
| 1年 1m数据 | 1m | 1h | ~10秒 | 原始的1/60 |
| 1年 1m数据 | 1m | 1d | ~5秒 | 原始的1/1440 |

### 5.2 查询性能对比（预估）

**查询场景**：获取1年的日线数据

| 方案 | 首次查询时间 | 后续查询时间 | 存储增长 |
|-----|------------|-------------|----------|
| 实时聚合（当前） | ~2-5秒 | ~2-5秒 | 0% |
| 预聚合 | ~50ms | ~50ms | +15-25% |
| 按需聚合+缓存 | ~2-5秒（首次） | ~50ms（缓存命中） | +5-10% |
| 混合方案 | ~50ms | ~50ms | +10-15% |

---

## 6. 风险与挑战

### 6.1 技术风险

1. **Parquet文件合并性能**
   - 风险：追加写入时合并大文件可能很慢
   - 缓解：使用DuckDB的`COPY ... UNION ALL`或分区策略

2. **聚合任务失败处理**
   - 风险：部分聚合失败可能导致数据不一致
   - 缓解：记录详细日志，支持重试和回滚

3. **并发聚合冲突**
   - 风险：同一数据集的多个聚合任务可能冲突
   - 缓解：使用数据库锁或任务队列序列化

### 6.2 运维风险

1. **存储空间管理**
   - 风险：预聚合数据占用大量空间
   - 缓解：提供存储监控和清理工具

2. **聚合任务监控**
   - 风险：聚合任务失败未被及时发现
   - 缓解：集成监控告警，提供管理界面

### 6.3 用户体验风险

1. **导入后等待时间**
   - 风险：自动聚合延长导入完成时间
   - 缓解：异步聚合，导入完成后立即可用原始数据

2. **配置复杂度**
   - 风险：过多配置项增加用户负担
   - 缓解：提供合理默认值，高级选项可选

---

## 7. 替代技术方案

### 7.1 使用专业时序数据库（替换DuckDB+Parquet）

**候选方案**：
- TimescaleDB
- ClickHouse
- QuestDB

**优点**：
- 原生支持时间粒度聚合
- 查询性能优化到位
- 自动增量聚合

**缺点**：
- 架构变更大，迁移成本高
- 丢失Parquet的列式存储和Pandas兼容性
- 增加新的数据库维护负担

**建议**：短期内不推荐，可作为长期技术演进方向。

### 7.2 使用Apache Arrow + Flight SQL

**方案**：
- 使用Arrow作为内存数据格式
- 使用Flight SQL提供远程查询接口
- 客户端使用Arrow进行高效聚合

**优点**：
- 零拷贝数据传输
- 客户端可利用多核并行聚合

**缺点**：
- 需要重写数据访问层
- 增加客户端复杂度

### 7.3 使用DuckDB的物化视图（Materialized Views）

**方案**：
- DuckDB在v0.9+支持物化视图
- 定义聚合逻辑为视图，自动维护

**优点**：
- 原生数据库特性，无需自己实现
- 增量更新自动化

**缺点**：
- DuckDB物化视图尚不成熟
- 对Parquet文件的物化视图支持有限

**建议**：密切关注DuckDB新特性，未来可迁移到物化视图。

---

## 8. 总结与建议

### 8.1 核心建议

**推荐方案**：**混合方案C（热点预聚合 + 按需聚合）**

**关键决策**：
1. **预聚合粒度**：默认预聚合`1h`和`1d`，其他粒度可选
2. **触发方式**：导入完成后自动触发，同时支持手动触发
3. **增量聚合**：M2阶段实现，追加写入时仅聚合新增部分
4. **查询缓存**：M3阶段实现，基于访问频率动态缓存

### 8.2 实施优先级

**P0（必须）**：
- 基础预聚合框架（M1）
- `1h`和`1d`粒度的预聚合
- 手动触发聚合API

**P1（重要）**：
- 自动触发聚合（导入完成后）
- 增量聚合机制
- 查询层自动路由

**P2（可选）**：
- 查询缓存
- 智能推荐
- 自定义聚合粒度

### 8.3 后续工作

1. **与产品团队确认**：
   - 默认预聚合粒度是否合理
   - UI交互设计（聚合任务状态展示、手动触发入口）

2. **技术预研**：
   - DuckDB聚合性能基准测试
   - Parquet文件合并方案选型

3. **开发排期**：
   - M1阶段：2-3周
   - M2阶段：1-2周
   - M3阶段：1-2周

4. **监控指标定义**：
   - 聚合任务成功率
   - 聚合耗时P50/P99
   - 查询性能对比（预聚合 vs 实时聚合）
   - 存储空间增长率

---

## 9. 参考资料

### 技术文档
- [DuckDB Parquet Guide](https://duckdb.org/docs/data/parquet.html)
- [TimescaleDB Continuous Aggregates](https://docs.timescale.com/timescaledb/latest/how-to-guides/continuous-aggregates/)
- [InfluxDB Downsampling](https://docs.influxdata.com/influxdb/v2.0/process-data/common-tasks/downsample-data/)

### 相关代码
- `backend/src/trading-data/trading-data.service.ts:getDatasetCandles()` - 当前实时聚合实现
- `backend/src/backtesting/data/providers/parquet-duckdb.provider.ts` - 回测系统数据访问
- `backend/src/trading-data/services/import-processing.service.ts` - 导入处理服务

### 业界最佳实践
- [Pandas Resample Documentation](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.resample.html)
- [Arctic - High performance datastore for time series and tick data](https://github.com/man-group/arctic)

---

**文档版本**：v1.0  
**创建日期**：2025-11-14  
**作者**：研发团队  
**审核状态**：待审核

