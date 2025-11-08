# Analytics模块

回测结果分析模块，提供完整的性能指标计算、权益曲线生成、结果收集和管理功能。

## 📋 目录

- [模块概述](#模块概述)
- [核心组件](#核心组件)
- [快速开始](#快速开始)
- [API文档](#api文档)
- [性能指标说明](#性能指标说明)
- [最佳实践](#最佳实践)

---

## 模块概述

Analytics模块负责收集回测结果、计算性能指标、生成权益曲线，并提供结果查询和管理功能。

### 主要功能

- ✅ **性能指标计算** - Sharpe/Sortino/Calmar Ratio、最大回撤、VaR/CVaR
- ✅ **权益曲线生成** - 支持多种时间粒度、回撤追踪
- ✅ **结果收集** - 从多个模块汇总数据
- ✅ **结果管理** - LRU缓存、持久化存储

---

## 核心组件

### 1. PerformanceCalculator (性能计算器)

计算各项性能和风险指标。

```typescript
import { createPerformanceCalculator } from '@/analytics';

const calculator = createPerformanceCalculator({
  riskFreeRate: 0.02,
  tradingDaysPerYear: 252,
});

const metrics = calculator.calculate(equityCurve, tradeStats);
console.log('Sharpe Ratio:', metrics.risk.sharpeRatio);
```

### 2. EquityCurveGenerator (权益曲线生成器)

从交易记录生成权益曲线。

```typescript
import { createEquityCurveGenerator } from '@/analytics';

const generator = createEquityCurveGenerator({
  initialCapital: '10000',
  granularity: 'day',
});

const curve = generator.generate(trades);
```

### 3. ResultCollector (结果收集器)

收集并汇总所有模块的数据。

```typescript
import { createResultCollector } from '@/analytics';

const collector = createResultCollector({
  outputDir: '/path/to/results',
  performanceCalculator,
  equityCurveGenerator,
});

const results = await collector.collectResultsWithSources(
  sessionId,
  configSummary,
  dataSources
);
```

### 4. ResultsManager (结果管理器)

管理结果的存储、查询和缓存。

```typescript
import { createResultsManager } from '@/analytics';

const manager = createResultsManager({
  storage,
  cacheSize: 50,
});

const results = await manager.getSessionResults(sessionId);
```

---

## 快速开始

```typescript
import {
  createPerformanceCalculator,
  createEquityCurveGenerator,
  createResultCollector,
  createResultsManager,
  FileSystemResultsStorage,
} from '@/analytics';

// 1. 创建性能计算器
const perfCalculator = createPerformanceCalculator({
  riskFreeRate: 0.02,
});

// 2. 创建权益曲线生成器
const equityGenerator = createEquityCurveGenerator({
  initialCapital: '100000',
  granularity: 'day',
});

// 3. 创建结果收集器
const collector = createResultCollector({
  outputDir: './results',
  performanceCalculator: perfCalculator,
  equityCurveGenerator: equityGenerator,
});

// 4. 收集结果
const results = await collector.collectResultsWithSources(
  'session-123',
  configSummary,
  { ledger, eventStore, featureRegistry },
  { includeLogs: true, includeFeatureCatalog: true }
);

// 5. 创建结果管理器
const storage = new FileSystemResultsStorage({ baseDir: './results' });
const manager = createResultsManager({ storage });

// 6. 查询结果
const metrics = await manager.getSessionMetrics('session-123');
console.log('Total Trades:', metrics.trading.totalTrades);
console.log('Sharpe Ratio:', metrics.risk.sharpeRatio);
```

---

## API文档

### PerformanceCalculator

#### `calculate(equityCurve, tradeStats, config?): PerformanceMetrics`

计算完整的性能指标。

#### `calculateSharpeRatio(returns, riskFreeRate?): number`

计算Sharpe Ratio。

#### `calculateSortinoRatio(returns, targetReturn?): number`

计算Sortino Ratio。

#### `calculateMaxDrawdown(equityCurve): DrawdownStats`

计算最大回撤统计。

#### `calculateReturnStats(equityCurve): ReturnStats`

计算收益率统计。

### EquityCurveGenerator

#### `generate(trades): EquityCurve`

从交易记录生成权益曲线。

#### `generateTimeSeries(trades): TimeSeriesPoint[]`

生成权益时间序列。

#### `generateDrawdownSeries(trades): TimeSeriesPoint[]`

生成回撤时间序列。

### ResultCollector

#### `collectResults(sessionId): Promise<SessionResults>`

收集基础会话结果。

#### `collectResultsWithSources(sessionId, config, sources, options): Promise<SessionResults>`

收集完整会话结果。

#### `exportResults(sessionId, format, outputPath): Promise<void>`

导出结果到文件。

### ResultsManager

#### `getSessionResults(sessionId): Promise<SessionResults | null>`

获取会话结果。

#### `listSessionResults(): Promise<SessionResults[]>`

列出所有会话。

#### `deleteSessionResults(sessionId): Promise<boolean>`

删除会话结果。

#### `getSessionMetrics(sessionId): Promise<PerformanceMetrics | null>`

获取性能指标。

#### `getEquityCurve(sessionId): Promise<EquityCurve | null>`

获取权益曲线。

---

## 性能指标说明

### 交易指标

- **Total Trades**: 总交易数
- **Win Rate**: 胜率（获胜交易数/总交易数）
- **Profit Factor**: 盈亏比（总盈利/总亏损）
- **Avg PnL**: 平均盈亏

### 风险指标

- **Sharpe Ratio**: 夏普比率，衡量每单位风险的超额收益
  - 公式: (收益率 - 无风险利率) / 标准差
  - 越高越好，通常 > 1 为优秀

- **Sortino Ratio**: 索提诺比率，类似Sharpe但只考虑下行风险
  - 公式: (收益率 - 目标收益) / 下行标准差
  - 比Sharpe更关注亏损风险

- **Calmar Ratio**: 卡尔马比率
  - 公式: 年化收益率 / 最大回撤
  - 越高越好

- **Max Drawdown**: 最大回撤，从峰值到谷底的最大跌幅百分比
- **VaR**: 风险价值，在给定置信水平下的预期最大损失
- **CVaR**: 条件风险价值，超过VaR的平均损失

---

## 最佳实践

### 1. 配置合理的参数

```typescript
// 推荐配置
const calculator = createPerformanceCalculator({
  riskFreeRate: 0.02,           // 2%无风险收益率
  targetReturn: 0,              // 目标收益率
  tradingDaysPerYear: 252,      // 年交易日数
  includeDrawdownSeries: false, // 通常不需要
});
```

### 2. 使用缓存提高性能

```typescript
const manager = createResultsManager({
  storage,
  cacheSize: 50, // 缓存最近50个会话
});
```

### 3. 错误处理

```typescript
try {
  const results = await collector.collectResultsWithSources(...);
  
  if (results.status === 'partial') {
    console.warn('部分数据收集失败:', results.error);
  }
} catch (error) {
  console.error('收集结果失败:', error);
}
```

### 4. 选择性数据收集

```typescript
// 只收集必要的数据
const results = await collector.collectResultsWithSources(
  sessionId,
  config,
  sources,
  {
    includeLogs: false,           // 不需要日志
    includeFeatureCatalog: false, // 不需要特征目录
    saveToFile: true,             // 保存到文件
  }
);
```

---

## 目录结构

```
analytics/
├── interfaces.ts                # 接口定义
├── performance-calculator.ts    # 性能计算器
├── metrics-helpers.ts           # 指标辅助函数
├── equity-curve-generator.ts    # 权益曲线生成器
├── result-collector.ts          # 结果收集器
├── results-manager.ts           # 结果管理器
├── results-storage.ts           # 结果存储
├── index.ts                     # 模块导出
├── __tests__/                   # 单元测试
└── README.md                    # 本文档
```

---

## 测试

运行单元测试：

```bash
npm test analytics
```

运行特定测试：

```bash
npm test performance-calculator.spec
npm test equity-curve-generator.spec
npm test result-collector.spec
npm test results-manager.spec
```

---

## 贡献

欢迎贡献代码！请遵循以下准则：

1. 添加单元测试
2. 更新文档
3. 遵循TypeScript最佳实践
4. 保持代码整洁

---

## 许可

MIT License

---

**创建时间**: 2024-11-08  
**维护者**: AI Assistant

