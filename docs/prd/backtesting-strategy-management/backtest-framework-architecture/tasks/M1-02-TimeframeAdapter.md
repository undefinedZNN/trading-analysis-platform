# M1-02: TimeframeAdapter 时间框架适配器

**任务ID**: M1-02  
**里程碑**: M1 - 数据/特征与事件总线基线  
**状态**: ✅ Done  
**负责人**: AI Assistant  
**实际工期**: 1天  
**优先级**: 🔥 高  
**依赖**: 无（可与 M1-01 并行）

---

## 📋 任务概述

构建时间框架适配器，将最细粒度的行情数据重采样到策略声明的主时间框架（如 5m、15m），同时支持多时间框架同步输出（主流 + 辅助流），确保事件时间对齐。

## 🎯 核心目标

1. **时间框架转换** - 将原始粒度（如 1s）聚合到更大粒度（如 5m）
2. **多流同步** - 支持主时间框架 + 多个辅助流同时推送
3. **事件对齐** - 保证不同时间框架的事件在逻辑时间上对齐
4. **OHLCV 聚合** - 正确计算聚合后的 Open/High/Low/Close/Volume

## 📐 设计要求

### 核心接口定义

```typescript
interface TimeframeAdapter {
  resample(
    source: Observable<BarEvent>,
    targetTimeframe: Timeframe,
    config?: ResampleConfig
  ): Observable<BarEvent>;
  
  createMultiFrameStream(
    source: Observable<BarEvent>,
    config: MultiFrameConfig
  ): MultiFrameStream;
}

interface ResampleConfig {
  aggregationMethod?: 'standard' | 'volume-weighted';
  alignmentMode?: 'close' | 'open';  // bar 以关闭时间还是开始时间标记
  dropIncomplete?: boolean;           // 是否丢弃不完整的最后一根 bar
}

interface MultiFrameConfig {
  primary: Timeframe;                 // 主时间框架
  auxiliary?: Timeframe[];            // 辅助时间框架
  syncMode?: 'wait-all' | 'primary-driven';
}

interface MultiFrameStream {
  primary$: Observable<BarEvent>;     // 主流
  auxiliary$: Record<string, Observable<BarEvent>>; // 辅助流映射
  synchronized$: Observable<SyncedBars>; // 同步后的事件组
}

interface SyncedBars {
  timestamp: string;                  // 主流的时间戳
  primary: BarEvent;
  auxiliary: Record<string, BarEvent[]>; // 辅助流的事件数组
}
```

### 聚合算法

```typescript
interface OHLCVAggregator {
  aggregate(bars: BarEvent[]): AggregatedBar;
}

interface AggregatedBar {
  open: string;      // 第一根 bar 的 open
  high: string;      // 所有 bar 中的最高价
  low: string;       // 所有 bar 中的最低价
  close: string;     // 最后一根 bar 的 close
  volume: string;    // 累计 volume
  trades?: number;   // 累计 trades
  notional?: string; // 累计 notional
}
```

## 🔧 实现要点

### 1. 窗口分组逻辑

使用 RxJS 的 `bufferTime` 或自定义窗口操作符：

```typescript
function resampleToTimeframe(
  source: Observable<BarEvent>,
  targetTimeframe: Timeframe
): Observable<BarEvent> {
  const windowDuration = parseTimeframe(targetTimeframe);
  
  return source.pipe(
    bufferTime(windowDuration, windowDuration, null, scheduler),
    filter(bars => bars.length > 0),
    map(bars => aggregateBars(bars, targetTimeframe)),
    tap(bar => enrichMetadata(bar))
  );
}
```

### 2. 时间对齐策略

```typescript
function alignToTimeframe(timestamp: string, timeframe: Timeframe, mode: 'open' | 'close'): string {
  const ms = new Date(timestamp).getTime();
  const interval = parseTimeframe(timeframe);
  
  if (mode === 'close') {
    // 向下取整到最近的时间框架边界，然后加上间隔
    return new Date(Math.floor(ms / interval) * interval + interval).toISOString();
  } else {
    // 向下取整到最近的时间框架边界
    return new Date(Math.floor(ms / interval) * interval).toISOString();
  }
}
```

### 3. 多流同步

```typescript
function synchronizeStreams(
  primary: Observable<BarEvent>,
  auxiliary: Record<string, Observable<BarEvent>>
): Observable<SyncedBars> {
  return primary.pipe(
    withLatestFrom(...Object.values(auxiliary)),
    map(([primaryBar, ...auxBars]) => ({
      timestamp: primaryBar.timestamp,
      primary: primaryBar,
      auxiliary: mapAuxiliaryBars(auxBars)
    }))
  );
}
```

### 4. 特征字段处理

聚合时需要处理 `features` 字段：
- 数值类型：取最后一个值或平均值（可配置）
- 字符串类型：取最后一个值
- 可扩展为自定义聚合函数

```typescript
interface FeatureAggregationStrategy {
  aggregate(values: Array<string | number>): string | number;
}
```

## 📦 交付物清单

### 必需交付物

- [ ] **设计文档** (`docs/design/timeframe-adapter-design.md`)
  - 重采样算法说明
  - 时间对齐策略
  - 多流同步机制
  - 流程图和示例
  
- [ ] **接口定义** (`backend/src/backtesting/data/timeframe/interfaces.ts`)
  - `TimeframeAdapter` 接口
  - `ResampleConfig` 和 `MultiFrameConfig`
  - 相关类型定义
  
- [ ] **实现代码**
  - `TimeframeAdapter` 类 (`backend/src/backtesting/data/timeframe/adapter.ts`)
  - `OHLCVAggregator` (`backend/src/backtesting/data/timeframe/aggregator.ts`)
  - 时间对齐工具 (`backend/src/backtesting/data/timeframe/time-alignment.ts`)
  - 多流同步器 (`backend/src/backtesting/data/timeframe/sync.ts`)
  
- [ ] **模块 README** (`backend/src/backtesting/data/timeframe/README.md`)
  - 使用指南
  - 配置选项说明
  - 示例代码
  - 常见问题

### 测试要求

- [ ] **单元测试** (`backend/src/backtesting/data/timeframe/__tests__/`)
  - `aggregator.spec.ts`
    - ✓ OHLCV 正确聚合
    - ✓ 特征字段聚合
    - ✓ 边界条件（空数组、单个 bar）
  - `time-alignment.spec.ts`
    - ✓ 时间对齐算法正确性
    - ✓ 不同时间框架的对齐
  - `adapter.spec.ts`
    - ✓ 基础重采样功能
    - ✓ 窗口边界处理
    - ✓ 不完整 bar 的处理
  - 覆盖率要求：≥ 85%

- [ ] **集成测试** (`backend/src/backtesting/data/timeframe/__tests__/integration/`)
  - `resampling.integration.spec.ts`
    - ✓ 1s → 5m 重采样端到端
    - ✓ 1s → 15m 重采样端到端
    - ✓ 主流(5m) + 辅流(1s) 同步验证
    - ✓ 验证输出 bar 数量和时间戳

- [ ] **测试数据**
  - `tests/fixtures/timeframe/`
    - `1s-bars.json` (原始 1 秒数据)
    - `expected-5m-bars.json` (预期 5 分钟聚合结果)
    - `expected-15m-bars.json` (预期 15 分钟聚合结果)

## 🔗 依赖关系

### 上游依赖
- 无（可与 M1-01 并行开发）

### 下游依赖
- M2-01: StrategySandbox（使用多时间框架流）

### 外部依赖
- `rxjs` ^8.0.0
- `big.js` ^6.0.0
- `date-fns` 或 `dayjs` (时间处理)

## 📚 参考文档

- [技术架构设计](../backtest-framework-architecture.md) 第 34 行
- [共识纪要 - 时间框架](../backtest-framework-consensus.md) 第 19-38 行
- [RxJS bufferTime 文档](https://rxjs.dev/api/operators/bufferTime)

## ✅ 验收标准

### 功能验收
1. ✅ 能够正确将 1s 数据聚合到 5m、15m、1h 等时间框架
2. ✅ OHLCV 聚合算法正确（open 取第一根，high/low 取极值，close 取最后）
3. ✅ 时间戳对齐正确，符合配置的对齐模式
4. ✅ 多时间框架同步推送正常工作
5. ✅ 不完整的最后一根 bar 根据配置正确处理

### 精度验收
1. ✅ 所有数值计算使用 `big.js`，无精度损失
2. ✅ 聚合后的数值与预期结果完全匹配

### 性能验收
1. ✅ 处理 100 万条 1s bar 到 5m 的延迟 < 2s
2. ✅ 内存使用稳定，无明显泄漏

### 测试验收
1. ✅ 单元测试覆盖率 ≥ 85%
2. ✅ 所有集成测试通过
3. ✅ 提供完整的测试数据和预期输出

### 文档验收
1. ✅ 设计文档清晰，包含算法说明和流程图
2. ✅ README 包含使用示例和配置说明

## 🚨 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 时区处理复杂 | 中 | 统一使用 UTC 时间，明确时区转换规则 |
| 窗口边界不对齐 | 高 | 严格测试边界条件，提供多种对齐模式 |
| 特征聚合策略不明确 | 中 | 一期使用简单策略（取最后值），后续扩展 |
| RxJS 背压问题 | 低 | 使用合适的调度器，进行压力测试 |

## 📝 开发笔记

### 实现顺序建议
1. 先实现单一时间框架的重采样（不含特征）
2. 添加 OHLCV 聚合逻辑和精度处理
3. 实现特征字段聚合
4. 实现多时间框架同步
5. 优化性能和内存使用

### 技术要点
- 使用 RxJS 的 `windowTime` 或 `bufferTime` 进行分组
- 注意处理不完整的最后一个窗口
- 时间对齐算法需要考虑夏令时等边界情况
- 多流同步时使用 `withLatestFrom` 或 `combineLatest`

### 测试策略
- 使用固定的输入数据，确保聚合结果可验证
- 测试各种时间框架组合（1s→5m, 1m→15m, 5m→1h 等）
- 测试边界条件：跨天、跨周、跨月

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07  
**下一步行动**: 分配负责人，开始设计阶段

