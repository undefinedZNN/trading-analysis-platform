# E2E 测试指南

**版本**: 1.0  
**最后更新**: 2024-11-08  
**维护者**: AI Assistant

---

## 📋 目录

1. [概述](#概述)
2. [测试策略](#测试策略)
3. [快速开始](#快速开始)
4. [编写测试](#编写测试)
5. [断言工具](#断言工具)
6. [数据生成](#数据生成)
7. [最佳实践](#最佳实践)
8. [故障排查](#故障排查)

---

## 概述

### 什么是 E2E 测试？

End-to-End（E2E）测试验证整个回测系统的完整工作流程，从数据加载、策略执行、风控检查、订单撮合到结果收集。

### 为什么需要 E2E 测试？

- ✅ **验证集成**：确保所有模块正确协同工作
- ✅ **回归检测**：及早发现破坏性变更
- ✅ **文档化**：测试即文档，展示实际用法
- ✅ **信心保证**：部署前的最后一道防线

### 测试覆盖范围

| 测试策略 | 覆盖领域 | 目的 |
|---------|---------|------|
| **PriceEcho** | 数据管线 | 验证数据加载、特征计算 |
| **FixedRebalance** | 订单撮合 | 验证交易执行、费用计算 |
| **RiskStress** | 风控规则 | 验证风控触发、系统稳定性 |
| **SnapshotResume** | 快照恢复 | 验证状态保存、恢复一致性 |
| **EdgeCases** | 边界情况 | 验证系统鲁棒性 |

---

## 测试策略

### 1. PriceEcho - 数据管线测试

**目的**: 测试数据加载和特征计算  
**行为**: 只读取行情，不执行交易  
**数据**: 2天上涨趋势（2880个bar）

**验证点**:
- ✅ 数据完整性
- ✅ 特征值可访问
- ✅ 日志记录
- ✅ 无交易执行
- ✅ 权益不变

**使用示例**:
```typescript
import { createPriceEchoTest } from './strategies';

const test = createPriceEchoTest({
  expectedBars: 2880,
  features: ['close', 'volume', 'MA_20', 'EMA_20'],
  validateLogs: true,
});

const result = await test.run();
await test.assert(result.results!);
```

---

### 2. FixedRebalance - 订单撮合测试

**目的**: 测试订单执行和撮合流程  
**行为**: 每100个bar再平衡持仓  
**数据**: 4天横盘（5760个bar）

**验证点**:
- ✅ 订单创建和执行
- ✅ 交易记录生成
- ✅ 手续费计算
- ✅ 持仓更新
- ✅ 权益变化

**使用示例**:
```typescript
import { createFixedRebalanceTest } from './strategies';

const test = createFixedRebalanceTest({
  rebalanceInterval: 100,
  targetAllocation: 0.5,
  feeRate: 0.001,
  expectedTrades: 40,
});

const result = await test.run();
await test.assert(result.results!);
```

---

### 3. RiskStress - 风控压力测试

**目的**: 测试风控规则和系统稳定性  
**行为**: 故意触发5种风控限制  
**数据**: 1天波动数据（1440个bar）

**验证点**:
- ✅ 最大持仓限制
- ✅ 最大杠杆限制
- ✅ 日亏损限制
- ✅ 止损触发
- ✅ 强制平仓

**使用示例**:
```typescript
import { createRiskStressTest } from './strategies';

const test = createRiskStressTest({
  initialCapital: '10000',
  maxPositionSize: '0.5',
  maxLeverage: 3,
  dailyLossLimit: '1000',
  stopLossRatio: 0.05,
});

const result = await test.run();
await test.assert(result.results!);
```

---

### 4. SnapshotResume - 快照恢复测试

**目的**: 测试快照保存和恢复功能  
**行为**: 运行→快照→重启→恢复→继续  
**数据**: 2天数据分两阶段（各720个bar）

**验证点**:
- ✅ 快照创建
- ✅ 状态完整保存
- ✅ 恢复准确无误
- ✅ 无重复交易
- ✅ PnL连续性

**使用示例**:
```typescript
import { createSnapshotResumeTest } from './strategies';

const test = createSnapshotResumeTest({
  phase1Bars: 720,
  phase2Bars: 720,
  tradeInterval: 60,
});

const result = await test.run();
await test.assert(result.results!);
```

---

### 5. EdgeCases - 边界情况测试

**目的**: 测试系统对极端情况的处理  
**行为**: 运行7种边界情况测试  

**测试场景**:
- ✅ 空数据集
- ✅ 单个bar
- ✅ 零交易量
- ✅ 极端价格
- ✅ 数据缺口
- ✅ 快速变化
- ✅ 最小资金

**使用示例**:
```typescript
import { createEdgeCasesTest } from './strategies';

const test = createEdgeCasesTest({
  testCases: [
    'empty_dataset',
    'single_bar',
    'zero_volume',
    'extreme_prices',
    'data_gaps',
    'rapid_changes',
    'minimal_capital',
  ],
});

const result = await test.run();
await test.assert(result.results!);
```

---

## 快速开始

### 安装依赖

```bash
cd backend
npm install
```

### 运行基础测试

```bash
npx ts-node src/backtesting/e2e-tests/run-basic-tests.ts
```

输出：
```
🚀 Running Basic E2E Tests

📋 Registering test strategies...
▶️  Running tests...

✅ PriceEcho - PASSED (2.3s)
✅ FixedRebalance - PASSED (3.1s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test Suite Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 2
Passed: 2 ✅
Failed: 0
Duration: 5.4s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 运行高级测试

```bash
npx ts-node src/backtesting/e2e-tests/run-advanced-tests.ts
```

### 运行完整测试套件

```bash
npx ts-node src/backtesting/e2e-tests/run-all-tests.ts
```

---

## 编写测试

### 测试策略结构

```typescript
import type { TestStrategy, TestResult, TestConfig } from '../runner/test-runner';
import type { SessionResults } from '../../analytics/interfaces';
import { assertBacktest, assert } from '../assertions';

export class MyTestStrategy implements TestStrategy {
  name = 'MyTest';
  description = '测试描述';
  scriptPath = 'strategies/my-test-strategy.js';

  testConfig: TestConfig = {
    dataset: 'test-data-uptrend',
    startTime: '2024-01-01T00:00:00Z',
    endTime: '2024-01-02T00:00:00Z',
    symbols: ['BTCUSDT'],
    timeframe: '1m',
    initialCapital: '10000',
    timeout: 60000,
  };

  async run(): Promise<TestResult> {
    // 1. 生成测试数据
    // 2. 运行策略逻辑
    // 3. 返回结果
  }

  async assert(results: SessionResults): Promise<void> {
    // 执行断言
  }
}
```

### 最小测试示例

```typescript
export class SimpleTest implements TestStrategy {
  name = 'Simple';
  description = '简单测试';

  async run(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // 你的测试逻辑
      
      return {
        name: this.name,
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        name: this.name,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  async assert(results: SessionResults): Promise<void> {
    assertBacktest.assertSessionCompleted(results);
  }
}
```

---

## 断言工具

### 通用断言

```typescript
import { assert } from '../assertions';

// 相等断言
assert.assertEqual(actual, expected, 'message');

// 不等断言
assert.assertNotEqual(actual, notExpected, 'message');

// 真值断言
assert.assertTrue(condition, 'message');
assert.assertFalse(condition, 'message');

// 空值断言
assert.assertNull(value, 'message');
assert.assertNotNull(value, 'message');

// 范围断言
assert.assertInRange(value, min, max, 'message');

// 数组包含
assert.assertContains(array, item, 'message');

// 数组长度
assert.assertArrayLength(array, expectedLength, 'message');

// 对象属性
assert.assertHasProperty(object, property, 'message');
```

### 回测专用断言

```typescript
import { assertBacktest } from '../assertions';

// 会话状态
assertBacktest.assertSessionCompleted(results, 'message');
assertBacktest.assertNoErrors(results, 'message');

// 交易断言
assertBacktest.assertTradeCount(trades, expectedCount, 'message');
assertBacktest.assertNoDuplicateTrades(trades, 'message');
assertBacktest.assertTradeContinuity(trades, 'message');

// 费用断言
assertBacktest.assertFees(actualFees, expectedFees, tolerance, 'message');

// PnL断言
assertBacktest.assertPnL(actualPnL, expectedPnL, tolerance, 'message');
```

---

## 数据生成

### 内置数据生成器

```typescript
import { DataGenerator } from '../fixtures/data-generator';

// 上涨趋势
const uptrend = DataGenerator.generateUptrend(days);
// 每天1440个bar（1分钟）
// 价格每天上涨1%

// 下跌趋势
const downtrend = DataGenerator.generateDowntrend(days);
// 价格每天下跌1%

// 横盘
const sideways = DataGenerator.generateSideways(days);
// 价格在±0.5%范围内随机波动

// 波动
const volatile = DataGenerator.generateVolatile(days);
// 价格在±5%范围内剧烈波动
```

### 自定义数据

```typescript
const customData = [
  {
    timestamp: '2024-01-01T00:00:00Z',
    symbol: 'BTCUSDT',
    open: '50000',
    high: '50100',
    low: '49900',
    close: '50050',
    volume: '100',
  },
  // ... more bars
];
```

---

## 最佳实践

### 1. 测试独立性

✅ **好**:
```typescript
// 每个测试生成自己的数据
const testData = DataGenerator.generateUptrend(2);
```

❌ **差**:
```typescript
// 依赖全局数据或其他测试的状态
const testData = globalTestData; // 不好
```

### 2. 明确的断言

✅ **好**:
```typescript
assert.assertEqual(
  trades.length,
  40,
  'Should execute 40 trades (4 days * 10 trades/day)'
);
```

❌ **差**:
```typescript
assert.assertTrue(trades.length > 0); // 太模糊
```

### 3. 测试描述

✅ **好**:
```typescript
name = 'PriceEcho';
description = '测试数据管线和特征加载，验证数据完整性';
```

❌ **差**:
```typescript
name = 'Test1';
description = '测试'; // 信息不足
```

### 4. 错误处理

✅ **好**:
```typescript
try {
  await test.run();
} catch (error) {
  return {
    name: this.name,
    passed: false,
    error: error.message,
    duration: Date.now() - startTime,
  };
}
```

❌ **差**:
```typescript
// 未捕获的异常导致测试崩溃
await test.run(); // 可能抛出异常
```

### 5. 性能考虑

✅ **好**:
```typescript
testConfig: TestConfig = {
  timeout: 60000, // 1分钟超时
};
```

❌ **差**:
```typescript
// 无超时控制，可能永远hang住
```

### 6. 数据量合理

✅ **好**:
```typescript
// 2天数据足够测试
const testData = DataGenerator.generateUptrend(2);
```

❌ **差**:
```typescript
// 100天数据太多，测试太慢
const testData = DataGenerator.generateUptrend(100);
```

---

## 故障排查

### 问题1: 测试超时

**症状**: `Error: Test timeout after 60000ms`

**原因**:
- 数据量太大
- 无限循环
- 等待未完成的异步操作

**解决方案**:
```typescript
// 1. 增加超时时间
testConfig.timeout = 120000; // 2分钟

// 2. 减少数据量
const testData = DataGenerator.generateUptrend(1); // 只1天

// 3. 检查异步操作
await Promise.all([...]); // 确保所有异步完成
```

### 问题2: 断言失败

**症状**: `AssertionError: Expected 40 but got 38`

**原因**:
- 测试数据不稳定
- 断言期望值不正确
- 系统行为变化

**解决方案**:
```typescript
// 1. 使用范围断言
assert.assertInRange(trades.length, 38, 42); // 允许±5%

// 2. 使用相对断言
const expectedMin = Math.floor(expectedTrades * 0.9);
const expectedMax = Math.ceil(expectedTrades * 1.1);
assert.assertInRange(trades.length, expectedMin, expectedMax);

// 3. 检查日志
console.log('Actual trades:', trades.length);
console.log('Expected trades:', expectedTrades);
```

### 问题3: 内存泄漏

**症状**: 测试运行一段时间后变慢或崩溃

**原因**:
- 未清理的资源
- 累积的数据
- 未取消的订阅

**解决方案**:
```typescript
// 1. 清理资源
afterEach(() => {
  this.trades = [];
  this.logs = [];
});

// 2. 取消订阅
const subscription = eventBus.subscribe(...);
// ... test
subscription.unsubscribe();

// 3. 显式垃圾回收（测试环境）
if (global.gc) {
  global.gc();
}
```

### 问题4: 数据生成错误

**症状**: `TypeError: Cannot read property 'close' of undefined`

**原因**:
- 数据生成器返回空数组
- 数据格式不正确

**解决方案**:
```typescript
// 1. 验证数据
const testData = DataGenerator.generateUptrend(2);
assert.assertTrue(testData.length > 0, 'Data should not be empty');
assert.assertHasProperty(testData[0], 'close', 'Bar should have close price');

// 2. 添加数据检查
if (!testData || testData.length === 0) {
  throw new Error('Failed to generate test data');
}
```

---

## 高级主题

### 并行测试

```typescript
const runner = createTestRunner({ parallel: true });
runner.register(test1);
runner.register(test2);
runner.register(test3);

// 并行运行所有测试
const suite = await runner.runAll();
```

### 自定义断言

```typescript
function assertProfitFactor(
  trades: TradeRecord[],
  minProfitFactor: number
): void {
  const wins = trades.filter(t => parseFloat(t.realizedPnl) > 0);
  const losses = trades.filter(t => parseFloat(t.realizedPnl) < 0);
  
  const totalWin = wins.reduce((sum, t) => sum + parseFloat(t.realizedPnl), 0);
  const totalLoss = Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.realizedPnl), 0));
  
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : 0;
  
  assert.assertTrue(
    profitFactor >= minProfitFactor,
    `Profit factor ${profitFactor} should be >= ${minProfitFactor}`
  );
}
```

### 测试数据持久化

```typescript
import * as fs from 'fs';

// 保存测试结果
fs.writeFileSync(
  'test-results.json',
  JSON.stringify(results, null, 2)
);

// 加载测试数据
const savedData = JSON.parse(
  fs.readFileSync('test-data.json', 'utf-8')
);
```

---

## 参考资料

- [测试框架README](./README.md)
- [维护指南](./MAINTENANCE.md)
- [断言API文档](./assertions/index.ts)
- [数据生成器API](./fixtures/data-generator.ts)

---

**文档版本**: 1.0  
**最后更新**: 2024-11-08  
**维护者**: AI Assistant

