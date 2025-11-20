# DataProvider 模块

DataProvider 模块为回测框架提供统一的数据接入层，封装 Parquet+DuckDB 等多种数据源，支持分片加载、缺口处理、特征注入等功能。

## 📋 功能特性

- ✅ **统一数据接口** - 提供 `DataProvider` 抽象层，屏蔽底层数据源差异
- ✅ **高效分片加载** - 支持大规模数据集按时间分片查询，避免内存溢出
- ✅ **缺口处理** - 实现 `skip`/`fill` 两种缺口策略，保证数据连续性
- ✅ **标准化输出** - 输出符合规范的 `BarEvent`，包含时间戳、OHLCV、特征等字段
- ✅ **精度保证** - 所有数值字段使用 `big.js` 处理，避免浮点数精度问题
- ✅ **流式处理** - 基于 RxJS，支持背压和取消订阅

## 🚀 快速开始

### 基础用法

```typescript
import { createParquetDuckDBProvider } from '@/backtesting/data/providers';

// 创建数据提供者
const provider = createParquetDuckDBProvider({
  storageBasePath: '../backend/storage/datasets',
  defaultBatchSize: 10000,
  defaultGapPolicy: 'skip',
});

// 提取数据
const barEvents$ = provider.fetch({
  symbol: 'BTC-USDT',
  start: '2024-01-01T00:00:00.000Z',
  end: '2024-01-01T01:00:00.000Z',
  baseTimeframe: '1m',
});

// 订阅数据流
barEvents$.subscribe({
  next: (bar) => {
    console.log(`[${bar.timestamp}] ${bar.symbol} OHLC: ${bar.open} ${bar.high} ${bar.low} ${bar.close}`);
  },
  error: (err) => console.error('Error:', err),
  complete: () => console.log('Data fetch complete'),
});

// 使用完毕后关闭连接
await provider.close();
```

### 缺口填充

```typescript
// 使用前向填充策略
const barEvents$ = provider.fetch({
  symbol: 'BTC-USDT',
  start: '2024-01-01T00:00:00.000Z',
  end: '2024-01-01T01:00:00.000Z',
  baseTimeframe: '1m',
  gapPolicy: 'fill',
  fillMethod: 'forwardFill', // 或 'linear'
});

barEvents$.subscribe({
  next: (bar) => {
    // 检查是否为合成数据
    if (bar.context?.qualityFlag === 'synthetic') {
      console.log(`Synthetic bar at ${bar.timestamp}`);
    }
  },
});
```

### 分片加载

```typescript
// 大数据集分片加载，避免内存溢出
const barEvents$ = provider.fetch({
  symbol: 'BTC-USDT',
  start: '2024-01-01T00:00:00.000Z',
  end: '2024-01-31T23:59:59.000Z', // 整个月的数据
  baseTimeframe: '1s', // 秒级数据
  batchSize: 50000, // 每批50000条
  maxConcurrent: 3, // 最多3个并发查询
});
```

### 批次重叠（用于滚动指标）

```typescript
// 批次之间有重叠，用于计算需要历史窗口的指标
const barEvents$ = provider.fetch({
  symbol: 'BTC-USDT',
  start: '2024-01-01T00:00:00.000Z',
  end: '2024-01-01T01:00:00.000Z',
  baseTimeframe: '1m',
  batchSize: 100,
  overlapSize: 20, // 每批重叠20条
});
```

## 📦 核心接口

### DataProvider

数据提供者接口：

```typescript
interface DataProvider {
  id: string;
  supports(request: FetchRequest): boolean;
  fetch(request: FetchRequest): Observable<BarEvent>;
  close?(): Promise<void>;
  getMetadata?(symbol: string): Promise<DataMetadata>;
}
```

### FetchRequest

数据提取请求：

```typescript
interface FetchRequest {
  symbol: string;              // 标的代码，如 'BTC-USDT'
  market?: string;             // 市场/交易所，如 'binance'
  start: string;               // 开始时间（ISO8601）
  end: string;                 // 结束时间（ISO8601）
  baseTimeframe: Timeframe;    // 基础时间框架，如 '1m', '5m'
  fields?: string[];           // 需要提取的字段
  batchSize?: number;          // 批次大小，默认10000
  overlapSize?: number;        // 批次重叠大小，默认0
  gapPolicy?: GapPolicy;       // 缺口策略：'skip' | 'fill'
  fillMethod?: FillMethod;     // 填充方法：'forwardFill' | 'linear'
  featureSet?: string[];       // 特征ID列表
  maxConcurrent?: number;      // 最大并发数，默认3
}
```

### BarEvent

标准化的行情事件：

```typescript
interface BarEvent {
  sequenceId: string;          // 唯一序列ID
  timestamp: string;           // ISO8601时间戳
  symbol: string;              // 标的代码
  market?: string;             // 市场
  timeframe: Timeframe;        // 时间框架
  open: string;                // big.js 字符串格式
  high: string;
  low: string;
  close: string;
  volume: string;
  trades?: number;
  notional?: string;
  features?: Record<string, string | number>; // 特征字段
  source: string;              // 数据来源
  auxStreams?: string[];
  context?: Record<string, unknown>;
}
```

## 🔧 工具类

### GapDetector - 缺口检测器

检测时间序列中的数据缺口：

```typescript
import { createGapDetector } from '@/backtesting/data/providers';

const detector = createGapDetector();

// 检测缺口
const gaps = detector.detectGaps(barEvents, 60000, '1m');
console.log(`Found ${gaps.length} gaps`);

// 验证完整性
const report = detector.validateIntegrity(barEvents, 60000);
console.log(`Completeness: ${report.completeness}%`);
console.log(`Missing records: ${report.missingRecords}`);
```

### GapFiller - 缺口填充器

填充数据缺口：

```typescript
import { createGapFiller } from '@/backtesting/data/providers';

const filler = createGapFiller();

// 前向填充
const filledBars = filler.forwardFill(gap, '1m');

// 线性插值填充
const interpolatedBars = filler.linearFill(gap, '1m');

// 合并原始数据和填充数据
const merged = filler.mergeWithFilled(originalBars, gaps, 'forwardFill', '1m');

// 检查是否为合成数据
if (filler.isSynthetic(bar)) {
  console.log('This is a synthetic bar');
}
```

### DuckDBQueryBuilder - 查询构建器

构建 DuckDB SQL 查询：

```typescript
import { createQueryBuilder } from '@/backtesting/data/providers';

const builder = createQueryBuilder('../backend/storage/datasets');

// 构建范围查询
const sql = builder.buildRangeQuery(request, batch);

// 构建计数查询
const countSql = builder.buildCountQuery(request);

// 构建元数据查询
const metaSql = builder.buildMetadataQuery('BTC-USDT', '1m');
```

## 🔍 配置选项

### DataSourceConfig

```typescript
interface DataSourceConfig {
  storageBasePath: string;          // 数据存储根路径
  defaultBatchSize: number;         // 默认批次大小
  defaultOverlapSize: number;       // 默认重叠大小
  defaultMaxConcurrent: number;     // 默认最大并发数
  defaultGapPolicy: GapPolicy;      // 默认缺口策略
  defaultFillMethod: FillMethod;    // 默认填充方法
  enableQueryCache?: boolean;       // 启用查询缓存
  cacheSize?: number;               // 缓存大小（MB）
  connectionPoolSize?: number;      // 连接池大小
}
```

示例配置：

```typescript
const provider = createParquetDuckDBProvider({
  storageBasePath: '../backend/storage/datasets',
  defaultBatchSize: 10000,
  defaultOverlapSize: 0,
  defaultMaxConcurrent: 3,
  defaultGapPolicy: 'skip',
  defaultFillMethod: 'forwardFill',
  enableQueryCache: false,
  connectionPoolSize: 1,
});
```

## 📁 数据存储结构

Parquet 文件应按以下结构存储：

```
storage/datasets/
├── BTC-USDT/
│   ├── 1s/
│   │   ├── 2024-01-01.parquet
│   │   ├── 2024-01-02.parquet
│   │   └── ...
│   ├── 1m/
│   │   └── *.parquet
│   ├── 5m/
│   │   └── *.parquet
│   └── 1h/
│       └── *.parquet
├── ETH-USDT/
│   └── ...
└── ...
```

带市场标识的结构：

```
storage/datasets/
├── BTC-USDT/
│   ├── binance/
│   │   ├── 1s/
│   │   └── 1m/
│   ├── coinbase/
│   │   ├── 1s/
│   │   └── 1m/
│   └── ...
└── ...
```

## 🧪 测试

运行测试：

```bash
# 运行所有测试
npm test providers

# 运行特定测试
npm test gap-detector.spec
npm test gap-filler.spec
npm test query-builder.spec
```

## ⚠️ 注意事项

### 性能优化

1. **合理设置批次大小**: 过大会导致内存占用高，过小会影响吞吐量
2. **控制并发数**: 根据系统资源调整 `maxConcurrent`
3. **使用分片**: 对于大数据集，必须使用分片加载

### 精度处理

1. **所有数值必须使用 big.js**: 从数据库读取后立即转换为字符串
2. **避免 JavaScript Number**: 不要在中间计算中使用 Number 类型
3. **保持精度**: 建议使用 `toFixed(8)` 保持8位小数

### 缺口处理

1. **选择合适的策略**:
   - `skip`: 适用于不允许合成数据的场景
   - `fill`: 适用于需要连续时间序列的场景

2. **检查质量标志**:
   ```typescript
   if (bar.context?.qualityFlag === 'synthetic') {
     // 这是合成数据，可能需要特殊处理
   }
   ```

3. **填充方法选择**:
   - `forwardFill`: 简单快速，适用于大部分场景
   - `linear`: 更平滑，但可能引入不真实的价格

## 🔗 相关文档

- [回测框架架构设计](../../docs/prd/backtesting-strategy-management/backtest-framework-architecture/backtest-framework-architecture.md)
- [共识纪要 - 数据层](../../docs/prd/backtesting-strategy-management/backtest-framework-architecture/backtest-framework-consensus.md)
- [TimeframeAdapter 文档](../timeframe/README.md)

## 📝 更新日志

### v1.0.0 (2025-11-07)

- ✅ 实现 Parquet+DuckDB 数据提供者
- ✅ 支持分片加载和流式处理
- ✅ 实现缺口检测和填充
- ✅ 完整的单元测试覆盖
- ✅ 精度保证（big.js）

## 🙋 常见问题

### Q: 如何处理大数据集？

A: 使用分片加载，设置合适的 `batchSize` 和 `maxConcurrent`：

```typescript
const barEvents$ = provider.fetch({
  symbol: 'BTC-USDT',
  start: '2024-01-01',
  end: '2024-12-31',
  baseTimeframe: '1s',
  batchSize: 50000,  // 每批50000条
  maxConcurrent: 3,  // 最多3个并发
});
```

### Q: 缺口填充会影响性能吗？

A: 会有一定影响，因为需要收集所有数据后进行处理。如果不需要连续性，建议使用 `gapPolicy: 'skip'`。

### Q: 如何验证数据质量？

A: 使用 `GapDetector` 验证完整性：

```typescript
const report = detector.validateIntegrity(barEvents, 60000);
console.log(`Completeness: ${report.completeness}%`);
if (!report.isValid) {
  console.warn(`Found ${report.gapCount} gaps`);
}
```

### Q: 支持哪些数据源？

A: 目前支持 Parquet 文件（通过 DuckDB 查询）。未来可以扩展支持其他数据源，只需实现 `DataProvider` 接口。

## 📧 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。

