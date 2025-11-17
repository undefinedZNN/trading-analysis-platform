# TimeframeAdapter - 时间框架适配器

时间框架适配器负责将原始粒度的行情数据重采样到目标时间框架，并支持多时间框架的同步输出。

## 功能特性

- ✅ **时间框架转换** - 将原始粒度（如 1s）聚合到更大粒度（如 5m、15m、1h）
- ✅ **OHLCV 聚合** - 正确计算聚合后的 Open/High/Low/Close/Volume
- ✅ **精度处理** - 使用 big.js 确保数值精度
- ✅ **多种聚合方法** - 支持标准聚合和成交量加权聚合
- ✅ **时间对齐** - 灵活的时间戳对齐策略（open/close模式）
- ✅ **特征保留** - 可选择保留和聚合特征字段
- ✅ **多流同步** - 支持主时间框架 + 多个辅助流同时输出

## 快速开始

### 基础用法

```typescript
import { of } from 'rxjs';
import { timeframeAdapter } from './adapter';
import { BarEvent } from './interfaces';

// 创建原始 1s bars 流
const bars$: Observable<BarEvent> = of(
  {
    sequenceId: 'seq-1',
    timestamp: '2024-01-01T00:00:00.000Z',
    symbol: 'BTC-USDT',
    timeframe: '1s',
    open: '100',
    high: '101',
    low: '99',
    close: '100.5',
    volume: '1000',
    source: 'data-provider',
  },
  // ... 更多 bars
);

// 重采样到 5 分钟
const resampled$ = timeframeAdapter.resample(bars$, '5m');

resampled$.subscribe(bar => {
  console.log('5m bar:', bar);
});
```

### 配置重采样选项

```typescript
const resampled$ = timeframeAdapter.resample(bars$, '5m', {
  aggregationMethod: 'volume-weighted',  // 使用 VWAP
  alignmentMode: 'close',                // 使用关闭时间对齐
  dropIncomplete: true,                  // 丢弃不完整的最后一根 bar
  preserveFeatures: true,                // 保留特征字段
});
```

### 多时间框架

```typescript
const multiFrame = timeframeAdapter.createMultiFrameStream(bars$, {
  primary: '5m',              // 主时间框架
  auxiliary: ['1s', '1m'],    // 辅助时间框架
  syncMode: 'primary-driven', // 主流驱动模式
});

// 订阅主流
multiFrame.primary$.subscribe(bar => {
  console.log('Primary 5m bar:', bar);
});

// 订阅辅助流
multiFrame.auxiliary$['1m'].subscribe(bar => {
  console.log('Auxiliary 1m bar:', bar);
});

// 订阅同步流
multiFrame.synchronized$.subscribe(synced => {
  console.log('Synced bars:', synced);
});
```

## API 文档

### TimeframeAdapter

#### `resample(source, targetTimeframe, config?)`

将原始 bar 流重采样到目标时间框架。

**参数**：
- `source: Observable<BarEvent>` - 原始 bar 事件流
- `targetTimeframe: Timeframe` - 目标时间框架（如 '5m', '15m', '1h'）
- `config?: ResampleConfig` - 可选配置

**返回**：
- `Observable<BarEvent>` - 重采样后的 bar 事件流

#### `createMultiFrameStream(source, config)`

创建多时间框架流。

**参数**：
- `source: Observable<BarEvent>` - 原始 bar 事件流
- `config: MultiFrameConfig` - 多时间框架配置

**返回**：
- `MultiFrameStream` - 包含主流、辅助流和同步流

### 时间框架格式

支持以下格式：

- 秒：`'1s'`, `'5s'`, `'10s'`, `'15s'`, `'30s'`
- 分钟：`'1m'`, `'5m'`, `'15m'`, `'30m'`
- 小时：`'1h'`, `'4h'`
- 天：`'1d'`
- 自定义：`'2m'`, `'3h'` 等

### 配置选项

#### ResampleConfig

```typescript
interface ResampleConfig {
  aggregationMethod?: 'standard' | 'volume-weighted';  // 聚合方法
  alignmentMode?: 'close' | 'open';                    // 对齐模式
  dropIncomplete?: boolean;                            // 丢弃不完整 bar
  preserveFeatures?: boolean;                          // 保留特征
}
```

#### MultiFrameConfig

```typescript
interface MultiFrameConfig {
  primary: Timeframe;              // 主时间框架
  auxiliary?: Timeframe[];         // 辅助时间框架
  syncMode?: 'wait-all' | 'primary-driven';  // 同步模式
}
```

## 工作原理

### OHLCV 聚合规则

聚合多个 bars 时：

- **Open**: 第一根 bar 的 open 价格
- **High**: 所有 bars 中的最高价
- **Low**: 所有 bars 中的最低价
- **Close**: 最后一根 bar 的 close 价格
- **Volume**: 累计所有 bars 的 volume
- **Trades**: 累计所有 bars 的 trades（如果有）

### 时间对齐

两种对齐模式：

1. **Open 模式**: bar 的时间戳表示窗口开始时间
   - 例：`2024-01-01T00:00:00` 到 `2024-01-01T00:04:59` 的数据 → 时间戳 `2024-01-01T00:00:00`

2. **Close 模式**: bar 的时间戳表示窗口结束时间
   - 例：`2024-01-01T00:00:00` 到 `2024-01-01T00:04:59` 的数据 → 时间戳 `2024-01-01T00:05:00`

## 测试

```bash
# 运行单元测试
npm test -- timeframe

# 运行集成测试
npm test -- resampling.integration

# 查看覆盖率
npm run test:cov -- timeframe
```

## 注意事项

1. **精度处理**: 所有数值字段使用 `big.js` 字符串格式，避免浮点误差
2. **时间对齐**: 确保输入数据的时间戳格式正确（ISO8601）
3. **时区**: 统一使用 UTC 时间
4. **性能**: 对于大数据集，考虑使用流式处理而非一次性加载

## 示例

查看 `examples/` 目录获取更多示例：

- `basic-resampling.ts` - 基础重采样示例
- `multi-timeframe.ts` - 多时间框架示例
- `custom-aggregation.ts` - 自定义聚合策略

## 相关文档

- [技术架构设计](../../../../../../../docs/prd/backtesting-strategy-management/backtest-framework-architecture/backtest-framework-architecture.md)
- [任务文档](../../../../../../../docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/M1-02-TimeframeAdapter.md)

---

**版本**: 1.0.0  
**状态**: ✅ 已完成核心功能  
**最后更新**: 2025-11-07

