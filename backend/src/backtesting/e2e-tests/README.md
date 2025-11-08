# E2E测试框架

端到端测试框架，用于回测框架的集成测试。

## 📋 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [测试策略](#测试策略)
- [断言工具](#断言工具)
- [CLI使用](#cli使用)
- [编写测试](#编写测试)

---

## 概述

E2E测试框架提供了完整的端到端测试能力，包括：

- ✅ **测试运行器** - 自动化测试执行
- ✅ **断言工具** - 专用断言函数
- ✅ **数据生成器** - 模拟测试数据
- ✅ **CLI工具** - 命令行运行
- ✅ **报告生成** - 测试结果报告

---

## 快速开始

### 安装

```bash
cd backend
npm install
```

### 运行所有测试

```bash
npm run test:e2e
```

或使用CLI：

```bash
npx ts-node src/backtesting/e2e-tests/runner/cli.ts
```

### 运行特定测试

```bash
npm run test:e2e -- --pattern "PriceEcho"
```

---

## 测试策略

框架包含5个标准测试策略：

### 1. PriceEcho

**目的**: 测试数据管线和特征加载

**特点**:
- 只读取行情数据
- 不执行交易
- 验证特征值正确性

**断言**:
- 数据完整性
- 特征值正确
- 日志输出匹配

### 2. FixedRebalance

**目的**: 测试订单撮合流程

**特点**:
- 定期下单
- 固定比例再平衡
- 验证交易执行

**断言**:
- 成交笔数
- 手续费计算
- 订单状态

### 3. RiskStress

**目的**: 测试风控规则

**特点**:
- 触发风控限制
- 测试强平机制
- 验证风控拒单

**断言**:
- 风控拒单次数
- 强平记录
- 系统状态

### 4. SnapshotResume

**目的**: 测试快照恢复

**特点**:
- 创建快照
- 暂停并恢复
- 验证状态一致性

**断言**:
- PnL连续性
- 无重复成交
- 状态一致

### 5. EdgeCase

**目的**: 测试异常处理

**特点**:
- 触发边界条件
- 测试异常恢复
- 验证系统稳定性

**断言**:
- 死信队列捕获
- 系统不崩溃
- 错误日志完整

---

## 断言工具

### 基础断言

```typescript
import { assert } from './assertions';

// 相等断言
assert.assertEqual(actual, expected, 'Values should be equal');

// 范围断言
assert.assertInRange(value, 0, 100, 'Value should be in range');

// 接近断言（浮点数）
assert.assertCloseTo(actual, expected, 0.01, 'Values should be close');

// 抛出异常断言
await assert.assertThrows(() => fn(), Error, 'Should throw error');
```

### 回测专用断言

```typescript
import { assertBacktest } from './assertions';

// 交易数量
assertBacktest.assertTradeCount(trades, 10, 'Should have 10 trades');

// PnL断言
assertBacktest.assertPnL(actualPnL, expectedPnL, 0.01);

// 胜率断言
assertBacktest.assertWinRate(winRate, 0.6, 0.01);

// 无错误断言
assertBacktest.assertNoErrors(results);

// 会话完成断言
assertBacktest.assertSessionCompleted(results);

// 无重复交易
assertBacktest.assertNoDuplicateTrades(trades);
```

---

## CLI使用

### 基本用法

```bash
# 运行所有测试
npx ts-node src/backtesting/e2e-tests/runner/cli.ts

# 详细输出
npx ts-node src/backtesting/e2e-tests/runner/cli.ts --verbose

# 指定超时
npx ts-node src/backtesting/e2e-tests/runner/cli.ts --timeout 60000

# 模式匹配
npx ts-node src/backtesting/e2e-tests/runner/cli.ts --pattern "Price.*"
```

### 命令选项

| 选项 | 缩写 | 说明 |
|------|------|------|
| `--verbose` | `-v` | 详细输出 |
| `--timeout` | `-t` | 超时时间（毫秒） |
| `--pattern` | `-p` | 测试名称模式 |

---

## 编写测试

### 创建测试策略

```typescript
import { TestStrategy, TestResult, TestConfig } from '../runner/test-runner';
import { assertBacktest } from '../assertions';

export class MyTestStrategy implements TestStrategy {
  name = 'MyTest';
  description = 'Test description';
  scriptPath = 'path/to/strategy.js';
  
  testConfig: TestConfig = {
    symbols: ['BTCUSDT'],
    timeframe: '1m',
    initialCapital: '10000',
  };

  async run(): Promise<TestResult> {
    // 1. 设置测试环境
    // 2. 运行回测
    // 3. 收集结果
    
    return {
      name: this.name,
      passed: true,
      duration: 1000,
      results: sessionResults,
    };
  }

  async assert(results: SessionResults): Promise<void> {
    // 执行断言
    assertBacktest.assertSessionCompleted(results);
    assertBacktest.assertNoErrors(results);
    assertBacktest.assertTradeCount(results.trades, 10);
  }
}
```

### 注册测试策略

```typescript
import { createTestRunner } from './runner/test-runner';
import { MyTestStrategy } from './strategies/my-test';

const runner = createTestRunner();
runner.register(new MyTestStrategy());

const suite = await runner.runAll();
```

---

## 目录结构

```
e2e-tests/
├── assertions/           # 断言工具
│   └── index.ts
├── runner/              # 测试运行器
│   ├── test-runner.ts
│   └── cli.ts
├── fixtures/            # 测试固件
│   └── data-generator.ts
├── strategies/          # 测试策略
│   ├── price-echo.ts
│   ├── fixed-rebalance.ts
│   ├── risk-stress.ts
│   ├── snapshot-resume.ts
│   └── edge-case.ts
├── utils/               # 工具函数
└── README.md           # 本文档
```

---

## 最佳实践

### 1. 测试隔离

每个测试应该独立运行，不依赖其他测试的状态。

### 2. 清理资源

测试完成后清理资源，避免影响后续测试。

### 3. 有意义的断言

使用清晰的断言消息，便于定位问题。

```typescript
assertBacktest.assertEqual(
  trades.length,
  10,
  'Expected 10 trades but got ' + trades.length
);
```

### 4. 测试数据

使用可重复的测试数据，确保测试结果稳定。

### 5. 超时设置

为长时间运行的测试设置合理的超时时间。

---

## 故障排除

### 测试超时

增加超时时间：

```bash
npx ts-node cli.ts --timeout 120000
```

### 测试失败

使用详细模式查看详细信息：

```bash
npx ts-node cli.ts --verbose
```

### 数据问题

检查测试数据生成器配置。

---

## 贡献指南

欢迎贡献新的测试策略！

1. Fork项目
2. 创建特性分支
3. 编写测试
4. 提交PR

---

## 许可

MIT License

---

**创建时间**: 2024-11-08  
**维护者**: AI Assistant

