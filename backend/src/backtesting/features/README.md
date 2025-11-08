# FeatureRegistry - 特征注册表

特征注册表是回测框架的核心模块之一，负责管理、注册和计算技术指标特征。

---

## 目录

- [概述](#概述)
- [核心概念](#核心概念)
- [快速开始](#快速开始)
- [内置特征](#内置特征)
- [使用示例](#使用示例)
- [高级用法](#高级用法)
- [API 文档](#api-文档)

---

## 概述

FeatureRegistry 提供了一个统一的接口来：

- ✅ 注册和管理技术指标特征
- ✅ 参数校验和默认值处理
- ✅ 依赖关系解析（拓扑排序、循环检测）
- ✅ 流式数据处理（基于 RxJS）
- ✅ 高精度数值计算（基于 big.js）
- ✅ 特征目录生成（供前端和分析模块使用）

### 设计原则

1. **类型安全**: 完整的 TypeScript 类型定义
2. **流式处理**: 使用 RxJS Observable 支持增量计算
3. **高精度**: 使用 big.js 确保金融级计算精度
4. **可扩展**: 支持自定义特征注册
5. **声明式**: 特征定义采用声明式配置

---

## 核心概念

### 1. FeatureDefinition (特征定义)

特征定义包含以下信息：

```typescript
interface FeatureDefinition {
  id: string;                    // 特征唯一标识
  description: string;           // 特征描述
  category?: string;             // 特征分类
  version?: string;              // 特征版本
  
  dependsOn?: FeatureDependency[];  // 依赖的字段或其他特征
  
  displayName?: string | ((params?) => string);  // 显示名称
  valueType?: ValueType;         // 输出值类型
  unit?: string;                 // 单位
  
  defaultParams?: Record<string, unknown>;     // 默认参数
  paramSchema?: Record<string, ParameterSchema>;  // 参数Schema
  
  compute(stream, params?): Observable<BarEvent>;  // 计算函数
}
```

### 2. FeatureRegistry (特征注册表)

特征注册表的核心功能：

```typescript
interface FeatureRegistry {
  register(feature: FeatureDefinition): void;
  get(id: string): FeatureDefinition | undefined;
  has(id: string): boolean;
  
  validateParams(id: string, params: Record<string, unknown>): ValidationResult;
  resolve(configs: FeatureConfig[]): ResolvedFeature[];
  
  listDefinitions(): FeatureMetadata[];
  generateCatalog(features: ResolvedFeature[]): FeatureCatalog;
}
```

### 3. BarEvent (K线事件)

标准的K线数据结构：

```typescript
interface BarEvent {
  sequenceId: string;
  timestamp: string;
  symbol: string;
  timeframe: string;
  
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  
  source: string;
  features?: Record<string, string | number>;
}
```

---

## 快速开始

### 安装

特征注册表作为回测框架的一部分，无需单独安装。

### 基础使用

```typescript
import { createFeatureRegistry } from './features';
import { MAFeature, RSIFeature } from './features/built-in';
import { of } from 'rxjs';
import { toArray } from 'rxjs/operators';

// 1. 创建注册表
const registry = createFeatureRegistry();

// 2. 注册特征
registry.register(MAFeature);
registry.register(RSIFeature);

// 3. 准备数据
const bars = [
  {
    sequenceId: '1',
    timestamp: '2024-01-01T00:00:00.000Z',
    symbol: 'BTC-USDT',
    timeframe: '1m',
    open: '50000',
    high: '50100',
    low: '49900',
    close: '50050',
    volume: '10.5',
    source: 'binance',
  },
  // ... more bars
];

// 4. 计算特征
const stream = of(...bars);
const result = await MAFeature.compute(stream, { window: 20 })
  .pipe(toArray())
  .toPromise();

console.log(result);
```

---

## 内置特征

### 趋势类指标 (Trend Indicators)

#### 1. MA - 简单移动平均

```typescript
import { MAFeature } from './features/built-in';

// 默认参数: window=20, source='close'
const result = await MAFeature.compute(stream).pipe(toArray()).toPromise();

// 自定义参数
const result = await MAFeature.compute(stream, {
  window: 50,
  source: 'high'
}).pipe(toArray()).toPromise();
```

**输出字段**: `MA`, `MA_{window}`

#### 2. EMA - 指数移动平均

```typescript
import { EMAFeature, EMA10Feature, EMA20Feature } from './features/built-in';

// 默认EMA (period=20)
const result = await EMAFeature.compute(stream).pipe(toArray()).toPromise();

// 预定义的EMA10
const result = await EMA10Feature.compute(stream).pipe(toArray()).toPromise();

// 自定义参数
const result = await EMAFeature.compute(stream, {
  window: 50,
  source: 'close'
}).pipe(toArray()).toPromise();
```

**输出字段**: `EMA`, `EMA_{window}`

#### 3. ADX - 平均趋向指标

```typescript
import { ADXFeature } from './features/built-in';

// 默认参数: period=14
const result = await ADXFeature.compute(stream).pipe(toArray()).toPromise();

// 自定义周期
const result = await ADXFeature.compute(stream, {
  period: 20
}).pipe(toArray()).toPromise();
```

**输出字段**: `ADX`, `ADX_{period}`  
**值范围**: 0-100  
**说明**: 
- ADX < 20: 无趋势或弱趋势
- 20 ≤ ADX < 40: 中等趋势
- ADX ≥ 40: 强趋势

#### 4. DMI - 趋向运动指标

```typescript
import { DMIFeature } from './features/built-in';

const result = await DMIFeature.compute(stream, {
  period: 14
}).pipe(toArray()).toPromise();

// 访问结果
result.forEach(bar => {
  const plusDI = bar.features?.PLUS_DI;
  const minusDI = bar.features?.MINUS_DI;
  
  if (plusDI > minusDI) {
    console.log('上涨趋势');
  } else {
    console.log('下跌趋势');
  }
});
```

**输出字段**: `PLUS_DI`, `MINUS_DI`, `PLUS_DI_{period}`, `MINUS_DI_{period}`  
**值范围**: 0-100

### 动量类指标 (Momentum Indicators)

#### 5. RSI - 相对强弱指标

```typescript
import { RSIFeature } from './features/built-in';

// 默认参数: period=14, source='close'
const result = await RSIFeature.compute(stream).pipe(toArray()).toPromise();

// 自定义参数
const result = await RSIFeature.compute(stream, {
  period: 7,
  source: 'close'
}).pipe(toArray()).toPromise();

// 判断超买超卖
result.forEach(bar => {
  const rsi = parseFloat(bar.features?.RSI || '50');
  if (rsi > 70) {
    console.log('超买');
  } else if (rsi < 30) {
    console.log('超卖');
  }
});
```

**输出字段**: `RSI`, `RSI_{period}`  
**值范围**: 0-100  
**说明**:
- RSI > 70: 超买区域
- RSI < 30: 超卖区域

### 波动率指标 (Volatility Indicators)

#### 6. ATR - 平均真实波动

```typescript
import { ATRFeature } from './features/built-in';

// 默认参数: period=14
const result = await ATRFeature.compute(stream).pipe(toArray()).toPromise();

// 用于动态止损
result.forEach(bar => {
  const atr = parseFloat(bar.features?.ATR || '0');
  const close = parseFloat(bar.close);
  
  const stopLoss = close - (atr * 2);  // 2倍ATR止损
  console.log(`Stop Loss: ${stopLoss}`);
});
```

**输出字段**: `ATR`, `ATR_{period}`  
**说明**: ATR 值越大，市场波动越大

### 价格形态指标 (Price Pattern Indicators)

#### 7. IBS - 内部柱强度

```typescript
import { IBSFeature } from './features/built-in';

// 默认参数: precision=4
const result = await IBSFeature.compute(stream).pipe(toArray()).toPromise();

// 均值回归策略
result.forEach(bar => {
  const ibs = parseFloat(bar.features?.IBS || '0.5');
  
  if (ibs < 0.2) {
    console.log('收盘价接近最低价，可能反弹');
  } else if (ibs > 0.8) {
    console.log('收盘价接近最高价，可能回调');
  }
});
```

**输出字段**: `IBS`  
**值范围**: 0-1  
**说明**:
- IBS = 0: 收盘价等于最低价（弱势）
- IBS = 0.5: 收盘价位于中间（中性）
- IBS = 1: 收盘价等于最高价（强势）

#### 8. Overlap - K线重叠度

```typescript
import { OverlapFeature } from './features/built-in';

// 相对重叠度
const result = await OverlapFeature.compute(stream, {
  method: 'relative',
  precision: 4
}).pipe(toArray()).toPromise();

// 同时输出相对和绝对重叠度
const result = await OverlapFeature.compute(stream, {
  method: 'both'
}).pipe(toArray()).toPromise();

// 识别跳空缺口
result.forEach(bar => {
  const overlap = parseFloat(bar.features?.Overlap || '1');
  
  if (overlap === 0) {
    console.log('跳空缺口');
  } else if (overlap > 0.9) {
    console.log('高度重叠，盘整');
  }
});
```

**输出字段**: `Overlap`, `Overlap_Abs` (可选)  
**值范围**: 0-2  
**说明**:
- Overlap = 0: 完全不重叠（跳空）
- Overlap = 1: 完全重叠
- Overlap > 1: 当前K线包含前一根K线

---

## 使用示例

### 示例 1: 单个特征计算

```typescript
import { createFeatureRegistry } from './features';
import { RSIFeature } from './features/built-in';
import { of } from 'rxjs';
import { toArray } from 'rxjs/operators';

async function calculateRSI() {
  const bars = loadHistoricalData('BTC-USDT', '1h');
  const stream = of(...bars);
  
  const result = await RSIFeature.compute(stream, { period: 14 })
    .pipe(toArray())
    .toPromise();
  
  result.forEach(bar => {
    if (bar.features?.RSI) {
      console.log(`${bar.timestamp}: RSI = ${bar.features.RSI}`);
    }
  });
}
```

### 示例 2: 多个特征组合

```typescript
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { MAFeature, RSIFeature, ATRFeature } from './features/built-in';

async function multipleFeatures() {
  const bars = loadHistoricalData('BTC-USDT', '1h');
  const stream = of(...bars);
  
  // 计算多个特征
  const ma20 = MAFeature.compute(stream, { window: 20 });
  const rsi14 = RSIFeature.compute(stream, { period: 14 });
  const atr14 = ATRFeature.compute(stream, { period: 14 });
  
  // 合并结果
  const combined = combineLatest([ma20, rsi14, atr14]).pipe(
    map(([bar1, bar2, bar3]) => ({
      ...bar1,
      features: {
        ...bar1.features,
        ...bar2.features,
        ...bar3.features,
      },
    }))
  );
  
  const result = await combined.pipe(toArray()).toPromise();
  
  // 生成交易信号
  result.forEach(bar => {
    const close = parseFloat(bar.close);
    const ma20 = parseFloat(bar.features?.MA || '0');
    const rsi = parseFloat(bar.features?.RSI || '50');
    
    if (close > ma20 && rsi < 30) {
      console.log('BUY Signal');
    } else if (close < ma20 && rsi > 70) {
      console.log('SELL Signal');
    }
  });
}
```

### 示例 3: 依赖解析和特征目录生成

```typescript
import { createFeatureRegistry } from './features';
import { BUILT_IN_FEATURES } from './features/built-in';

async function generateFeatureCatalog() {
  const registry = createFeatureRegistry();
  
  // 批量注册所有内置特征
  registry.registerBatch(BUILT_IN_FEATURES);
  
  // 配置需要计算的特征
  const configs = [
    { featureId: 'MA', params: { window: 20 } },
    { featureId: 'EMA', params: { window: 50 } },
    { featureId: 'RSI', params: { period: 14 } },
  ];
  
  // 解析依赖并排序
  const resolved = registry.resolve(configs);
  
  console.log('Feature Execution Order:');
  resolved.forEach((feature, index) => {
    console.log(`${index + 1}. ${feature.id} (${feature.outputKeys.join(', ')})`);
  });
  
  // 生成特征目录
  const catalog = registry.generateCatalog(resolved);
  
  console.log('\nFeature Catalog:');
  console.log(`Total: ${catalog.total}`);
  console.log(`Categories:`, catalog.byCategory);
  
  return catalog;
}
```

### 示例 4: 自定义特征

```typescript
import { FeatureDefinition } from './features/interfaces';
import { Observable } from 'rxjs';
import { map, scan } from 'rxjs/operators';
import Big from 'big.js';

// 自定义特征：价格动量
const PriceMomentumFeature: FeatureDefinition = {
  id: 'PRICE_MOMENTUM',
  description: '价格动量 - N周期价格变化率',
  category: 'momentum',
  version: '1.0.0',
  
  dependsOn: [
    { ref: 'close', type: 'field' },
  ],
  
  displayName: (params) => `Momentum(${params?.period || 10})`,
  
  valueType: 'number',
  unit: 'percent',
  
  defaultParams: {
    period: 10,
  },
  
  paramSchema: {
    period: {
      type: 'integer',
      required: false,
      min: 1,
      max: 100,
      default: 10,
      description: 'Momentum period',
    },
  },
  
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>) {
    const period = (params?.period as number) || 10;
    
    return stream.pipe(
      scan<BarEvent, { bar: BarEvent; history: string[] }>(
        (state, bar) => {
          const close = bar.close as string;
          const history = [...state.history, close];
          
          // 保持窗口大小
          if (history.length > period + 1) {
            history.shift();
          }
          
          return { bar, history };
        },
        { bar: {} as BarEvent, history: [] }
      ),
      map((state) => {
        if (state.history.length < period + 1) {
          return state.bar;
        }
        
        const oldPrice = new Big(state.history[0]);
        const newPrice = new Big(state.history[state.history.length - 1]);
        const momentum = newPrice.minus(oldPrice).div(oldPrice).times(100);
        
        return {
          ...state.bar,
          features: {
            ...state.bar.features,
            PRICE_MOMENTUM: momentum.toFixed(2),
          },
        };
      })
    );
  },
};

// 使用自定义特征
registry.register(PriceMomentumFeature);
const result = await PriceMomentumFeature.compute(stream, { period: 10 })
  .pipe(toArray())
  .toPromise();
```

### 示例 5: 参数校验

```typescript
import { createFeatureRegistry } from './features';
import { RSIFeature } from './features/built-in';

const registry = createFeatureRegistry();
registry.register(RSIFeature);

// 校验有效参数
const valid = registry.validateParams('RSI', {
  period: 14,
  source: 'close'
});

console.log(valid.valid);  // true
console.log(valid.errors);  // []

// 校验无效参数
const invalid = registry.validateParams('RSI', {
  period: 0,  // 无效：小于最小值
  source: 'invalid'  // 无效：不在枚举中
});

console.log(invalid.valid);  // false
console.log(invalid.errors);  
// ['period must be >= 2', 'source must be one of: open, high, low, close']
```

---

## 高级用法

### 1. 流式处理大规模数据

```typescript
import { from } from 'rxjs';
import { bufferCount, mergeMap } from 'rxjs/operators';

async function processLargeDataset() {
  // 流式读取大量数据
  const dataStream = from(fetchDataInChunks('BTC-USDT', '1m'));
  
  // 批量处理
  const result = dataStream.pipe(
    bufferCount(1000),  // 每1000条处理一次
    mergeMap(chunk => RSIFeature.compute(of(...chunk))),
    // ... 进一步处理
  );
  
  result.subscribe(bar => {
    // 实时处理每个结果
    if (bar.features?.RSI) {
      saveToDB(bar);
    }
  });
}
```

### 2. 特征缓存

```typescript
import { shareReplay } from 'rxjs/operators';

const bars = loadHistoricalData('BTC-USDT', '1h');
const stream = of(...bars);

// 缓存计算结果
const ma20Cached = MAFeature.compute(stream, { window: 20 })
  .pipe(shareReplay());

// 多次订阅不会重复计算
ma20Cached.subscribe(bar => console.log('Subscriber 1:', bar.features?.MA));
ma20Cached.subscribe(bar => console.log('Subscriber 2:', bar.features?.MA));
```

### 3. 特征组合策略

```typescript
function combinedStrategy(bars: BarEvent[]) {
  const stream = of(...bars);
  
  // 趋势指标
  const trend = combineLatest([
    MAFeature.compute(stream, { window: 20 }),
    EMAFeature.compute(stream, { window: 50 }),
  ]).pipe(
    map(([bar1, bar2]) => ({
      ...bar1,
      features: { ...bar1.features, ...bar2.features },
    }))
  );
  
  // 动量指标
  const momentum = RSIFeature.compute(stream, { period: 14 });
  
  // 波动率指标
  const volatility = ATRFeature.compute(stream, { period: 14 });
  
  // 合并所有特征
  return combineLatest([trend, momentum, volatility]).pipe(
    map(([bar1, bar2, bar3]) => ({
      ...bar1,
      features: {
        ...bar1.features,
        ...bar2.features,
        ...bar3.features,
      },
    }))
  );
}
```

---

## API 文档

### FeatureRegistry

#### `register(feature: FeatureDefinition): void`

注册一个特征定义。

**参数**:
- `feature`: 特征定义对象

**抛出**:
- 如果特征ID已存在，抛出错误

**示例**:
```typescript
registry.register(MAFeature);
```

#### `registerBatch(features: FeatureDefinition[]): void`

批量注册多个特征。

**参数**:
- `features`: 特征定义数组

**示例**:
```typescript
registry.registerBatch([MAFeature, EMAFeature, RSIFeature]);
```

#### `get(id: string): FeatureDefinition | undefined`

获取特征定义。

**参数**:
- `id`: 特征ID

**返回**: 特征定义对象，如果不存在则返回 `undefined`

**示例**:
```typescript
const ma = registry.get('MA');
```

#### `has(id: string): boolean`

检查特征是否已注册。

**参数**:
- `id`: 特征ID

**返回**: 如果存在返回 `true`，否则返回 `false`

**示例**:
```typescript
if (registry.has('MA')) {
  console.log('MA is registered');
}
```

#### `listDefinitions(): FeatureMetadata[]`

列出所有已注册的特征元数据。

**返回**: 特征元数据数组

**示例**:
```typescript
const allFeatures = registry.listDefinitions();
console.log(`Total features: ${allFeatures.length}`);
```

#### `validateParams(id: string, params: Record<string, unknown>): ValidationResult`

校验特征参数。

**参数**:
- `id`: 特征ID
- `params`: 参数对象

**返回**: 校验结果对象
```typescript
{
  valid: boolean;
  errors: string[];
}
```

**示例**:
```typescript
const result = registry.validateParams('MA', { window: 20 });
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

#### `resolve(configs: FeatureConfig[]): ResolvedFeature[]`

解析特征依赖关系，返回拓扑排序后的特征列表。

**参数**:
- `configs`: 特征配置数组

**返回**: 已解析的特征数组（拓扑排序）

**抛出**:
- 如果检测到循环依赖，抛出错误

**示例**:
```typescript
const configs = [
  { featureId: 'MA', params: { window: 20 } },
  { featureId: 'RSI', params: { period: 14 } },
];

const resolved = registry.resolve(configs);
```

#### `generateCatalog(features: ResolvedFeature[]): FeatureCatalog`

生成特征目录。

**参数**:
- `features`: 已解析的特征数组

**返回**: 特征目录对象

**示例**:
```typescript
const catalog = registry.generateCatalog(resolved);
console.log(`Total features: ${catalog.total}`);
console.log('By category:', catalog.byCategory);
```

---

## 性能优化建议

1. **批量注册**: 使用 `registerBatch` 而不是多次调用 `register`
2. **流式处理**: 对于大数据集，使用 RxJS 的流式操作符
3. **特征缓存**: 使用 `shareReplay` 缓存常用特征的计算结果
4. **参数预验证**: 在批量处理前先验证参数，避免运行时错误
5. **合理的窗口大小**: 较大的窗口需要更多数据和计算时间

---

## 常见问题

### Q: 如何处理数据不足的情况？

A: 所有内置特征都会自动处理数据不足的情况。如果bar数量少于所需的最小数量（通常是周期长度），特征值将不会输出或输出 `undefined`。

### Q: 如何处理缺失数据？

A: 建议使用 DataProvider 模块的 gap filling 功能预处理数据，确保K线序列的连续性。

### Q: 特征计算的时间复杂度是多少？

A: 所有内置特征的单个bar计算复杂度为 O(1)，初始化成本为 O(period)。

### Q: 如何调试特征计算？

A: 可以使用 RxJS 的 `tap` 操作符在计算流程中插入日志：

```typescript
MAFeature.compute(stream)
  .pipe(
    tap(bar => console.log('MA result:', bar.features?.MA)),
    toArray()
  )
  .toPromise();
```

### Q: 可以同时计算多个timeframe的特征吗？

A: 可以。为每个timeframe创建独立的数据流，然后并行计算：

```typescript
const stream1m = of(...bars1m);
const stream5m = of(...bars5m);

const ma1m = MAFeature.compute(stream1m);
const ma5m = MAFeature.compute(stream5m);
```

---

## 下一步

- 📖 查看 [内置特征目录](./FEATURE_CATALOG.md)
- 🧪 查看 [测试报告](./BUILT_IN_FEATURES_TEST_REPORT.md)
- 📊 查看 [实现进度](./PROGRESS_REPORT.md)
- 💻 查看 [使用示例](./examples/)

---

**版本**: 1.0.0  
**最后更新**: 2024-11-07

