# M1-01: DataProvider 数据提供者

**任务ID**: M1-01  
**里程碑**: M1 - 数据/特征与事件总线基线  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 10天  
**优先级**: 🔥 高  
**依赖**: 无

---

## 📋 任务概述

实现统一的数据提供者接口，封装 Parquet+DuckDB 数据源，支持时间分片加载、缺口处理策略和基础特征注入，输出标准化的 `BarEvent` 流。

## 🎯 核心目标

1. **统一数据接口** - 提供 `DataProvider` 抽象层，屏蔽底层数据源差异
2. **高效分片加载** - 支持大规模数据集按时间分片查询，避免内存溢出
3. **缺口处理** - 实现 `skip`/`fill` 两种缺口策略，保证数据连续性
4. **标准化输出** - 输出符合规范的 `BarEvent`，包含时间戳、OHLCV、特征等字段

## 📐 设计要求

### 核心接口定义

```typescript
interface DataProvider {
  id: string;
  supports(request: FetchRequest): boolean;
  fetch(request: FetchRequest): Observable<BarEvent>;
  close?(): Promise<void>;
}

interface FetchRequest {
  symbol: string;
  market?: string;
  start: string;              // ISO8601 或 epoch 毫秒
  end: string;
  baseTimeframe: Timeframe;   // 最细粒度
  fields?: Array<'open' | 'high' | 'low' | 'close' | 'volume' | 'trades' | 'notional' | string>;
  batchSize?: number;         // 每批次返回条目数
  overlapSize?: number;       // 批次之间的重叠窗口，用于滚动指标
  gapPolicy?: GapPolicy;      // 默认外层配置决定
  fillMethod?: FillMethod;    // gapPolicy === 'fill' 时生效
  featureSet?: string[];      // 需要启用的内置特征 ID
}

interface BarEvent {
  sequenceId: string;
  timestamp: string;
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

type GapPolicy = 'skip' | 'fill';
type FillMethod = 'forwardFill' | 'linear';
type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h' | string;
```

### 分片查询策略

```typescript
interface BatchConfig {
  batchSize: number;          // 每批查询的行数，默认 10000
  overlapSize: number;        // 批次重叠行数，用于指标计算
  maxConcurrent: number;      // 最大并发查询数
}

interface DuckDBQueryBuilder {
  buildRangeQuery(request: FetchRequest, offset: number, limit: number): string;
  buildGapDetectionQuery(request: FetchRequest): string;
}
```

## 🔧 实现要点

### 1. DuckDB 集成

- 使用 `duckdb-node` 连接 Parquet 文件
- 优化查询性能：
  ```sql
  SELECT timestamp, open, high, low, close, volume
  FROM read_parquet('storage/datasets/{symbol}/{timeframe}/*.parquet')
  WHERE timestamp >= ? AND timestamp < ?
  ORDER BY timestamp ASC
  LIMIT ? OFFSET ?
  ```
- 支持多文件并行读取

### 2. 缺口检测与填充

```typescript
interface GapDetector {
  detectGaps(events: BarEvent[], expectedInterval: number): Gap[];
}

interface Gap {
  startTimestamp: string;
  endTimestamp: string;
  expectedBars: number;
}

interface GapFiller {
  fillGap(gap: Gap, lastBar: BarEvent, method: FillMethod): BarEvent[];
}
```

**填充方法**：
- `forwardFill`: 使用最后一个有效 bar 的 close 价格作为所有 OHLC
- `linear`: 线性插值（可选）
- 标记 `context.qualityFlag = 'synthetic'`

### 3. 批次流式处理

使用 RxJS 实现流式加载：

```typescript
function fetchInBatches(request: FetchRequest): Observable<BarEvent> {
  return from(calculateBatches(request)).pipe(
    mergeMap(
      batch => queryDuckDB(batch),
      config.maxConcurrent
    ),
    scan(handleOverlap, { buffer: [], overlap: request.overlapSize }),
    mergeMap(events => from(events)),
    applyGapPolicy(request.gapPolicy),
    tap(event => assignSequenceId(event))
  );
}
```

### 4. 精度处理

- 所有数值字段统一使用 `big.js` 处理
- 从数据库读取后立即转换为字符串格式
- 避免中间计算使用 JavaScript Number 类型

## 📦 交付物清单

### 必需交付物

- [ ] **架构设计文档** (`docs/design/data-provider-architecture.md`)
  - 数据流图
  - 分片策略说明
  - 缺口处理流程图
  
- [ ] **接口定义** (`backend/src/backtesting/data/interfaces.ts`)
  - `DataProvider` 接口
  - `FetchRequest` 和 `BarEvent` 类型
  - `GapPolicy` 和相关工具接口
  
- [ ] **实现代码**
  - `ParquetDuckDBProvider` 类 (`backend/src/backtesting/data/providers/parquet-duckdb.provider.ts`)
  - `GapDetector` 工具类 (`backend/src/backtesting/data/utils/gap-detector.ts`)
  - `GapFiller` 工具类 (`backend/src/backtesting/data/utils/gap-filler.ts`)
  - `BatchQueryBuilder` (`backend/src/backtesting/data/utils/query-builder.ts`)
  
- [ ] **模块 README** (`backend/src/backtesting/data/README.md`)
  - 快速开始指南
  - 配置说明
  - API 文档
  - 故障排查

- [ ] **示例代码** (`backend/src/backtesting/data/examples/`)
  - 基础用法示例
  - 缺口处理示例
  - 性能优化示例

### 测试要求

- [ ] **单元测试** (`backend/src/backtesting/data/__tests__/`)
  - `parquet-duckdb.provider.spec.ts`
    - ✓ 基础查询功能
    - ✓ 时间范围过滤
    - ✓ 分片逻辑正确性
  - `gap-detector.spec.ts`
    - ✓ 正确检测缺口
    - ✓ 边界条件处理
  - `gap-filler.spec.ts`
    - ✓ forwardFill 策略
    - ✓ linear 策略
    - ✓ qualityFlag 标记
  - 覆盖率要求：≥ 85%

- [ ] **集成测试** (`backend/src/backtesting/data/__tests__/integration/`)
  - `data-pipeline.integration.spec.ts`
    - ✓ 固定测试数据集 → `BarEvent` 流
    - ✓ featureCatalog 生成
    - ✓ 缺口策略端到端验证
    - ✓ 大数据集性能测试（100万条记录）

- [ ] **测试数据集**
  - 准备 `tests/fixtures/data/`
    - `BTC-USDT-1s-complete.parquet` (无缺口)
    - `BTC-USDT-1s-with-gaps.parquet` (包含已知缺口)
    - `expected-bar-events.json` (预期输出)

## 🔗 依赖关系

### 上游依赖
- 无（本任务是基础模块）

### 下游依赖
- M1-03: FeatureRegistry（使用 `BarEvent` 作为输入）
- M2-01: StrategySandbox（订阅 `BarEvent` 流）

### 外部依赖
- `duckdb` (npm package)
- `parquetjs` 或 `parquetjs-lite`
- `rxjs` ^8.0.0
- `big.js` ^6.0.0

## 📚 参考文档

- [技术架构设计](../backtest-framework-architecture.md) 第 31-34 行
- [共识纪要 - 数据层](../backtest-framework-consensus.md) 第 19-70 行
- [DuckDB 官方文档](https://duckdb.org/docs/)
- [Parquet 格式规范](https://parquet.apache.org/docs/)

## ✅ 验收标准

### 功能验收
1. ✅ 能够成功连接并查询 Parquet 文件
2. ✅ 正确实现分片查询，避免内存溢出
3. ✅ `skip` 和 `fill` 两种缺口策略均正常工作
4. ✅ 输出的 `BarEvent` 符合 schema 定义
5. ✅ 所有数值字段使用 `big.js` 字符串格式

### 性能验收
1. ✅ 查询 100 万条记录，内存使用 < 500MB
2. ✅ 分片加载延迟 < 100ms（单批次）
3. ✅ 支持并发查询，吞吐量 > 10万条/秒

### 测试验收
1. ✅ 单元测试覆盖率 ≥ 85%
2. ✅ 所有集成测试通过
3. ✅ 提供完整的测试数据集和预期输出

### 文档验收
1. ✅ 架构设计文档完整且清晰
2. ✅ README 包含快速开始和常见问题
3. ✅ API 文档完整，包含示例代码

## 🚨 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| DuckDB 性能不达标 | 高 | 提前进行性能基准测试，准备备选方案 |
| Parquet 文件格式不兼容 | 中 | 确保数据导入模块使用统一的 schema |
| 缺口填充算法复杂度高 | 低 | 一期仅实现 forwardFill，复杂算法后续迭代 |
| 内存泄漏风险 | 中 | 严格测试长时间运行场景，确保流正确释放 |

## 📝 开发笔记

### 技术选型说明
- 选择 DuckDB 而非直接使用 Parquet 库，是为了利用其 SQL 查询能力和优化器
- RxJS 流式处理可以天然支持背压和取消订阅

### 实现建议
1. 先实现基础查询功能，确保能正确读取 Parquet
2. 再添加分片逻辑，进行性能测试
3. 最后实现缺口处理，这部分相对独立

### 测试策略
- 使用固定的测试数据集，确保结果可重复
- 集成测试应覆盖真实的回测场景

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07  
**下一步行动**: 分配负责人，开始架构设计

