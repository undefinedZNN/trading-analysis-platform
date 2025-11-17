# 回测策略开发指南

## 📖 目录

1. [概述](#概述)
2. [快速开始](#快速开始)
3. [策略结构](#策略结构)
4. [API参考](#api参考)
5. [开发流程](#开发流程)
6. [测试和验证](#测试和验证)
7. [最佳实践](#最佳实践)
8. [示例代码](#示例代码)
9. [常见问题](#常见问题)

---

## 概述

### 什么是回测策略？

回测策略是用于模拟交易决策的代码模块，它：
- 接收市场数据（K线、指标等）
- 根据策略逻辑做出交易决策
- 发布交易意图（买入/卖出信号）
- 管理持仓状态和风险控制

### 系统特点

- ✅ **7层完整验证**：确保策略回测结果100%准确
- ✅ **详细审计日志**：记录每笔交易的完整过程
- ✅ **灵活的参数系统**：支持参数优化和回测
- ✅ **丰富的技术指标**：MA、RSI、Bollinger等
- ✅ **状态快照/恢复**：支持策略的暂停和恢复

---

## 快速开始

### 1. 创建新策略文件

```bash
cd backend/src/backtesting/strategies
touch my-strategy.strategy.ts
```

### 2. 基础模板

```typescript
/**
 * 我的策略
 * 
 * 策略说明：在这里描述你的策略逻辑
 */

import Big from 'big.js';

// ========== 1. 参数定义 ==========
export const parameters = {
  period: {
    type: 'integer' as const,
    default: 14,
    min: 2,
    max: 100,
    description: '指标周期',
  },
  threshold: {
    type: 'number' as const,
    default: 0.5,
    min: 0,
    max: 1,
    description: '阈值',
  },
};

// ========== 2. 特征依赖 ==========
export const features = [
  {
    id: 'MA',
    label: 'my_ma',
    params: { period: 14 },
  },
];

// ========== 3. 策略状态 ==========
interface StrategyState {
  position: 'none' | 'long' | 'short';
  entryPrice: string | null;
  // 添加你需要的状态字段
}

// ========== 4. 策略类 ==========
export class MyStrategy {
  private state: StrategyState;
  private params: any;
  private context: any;

  constructor(params: any, context: any) {
    this.params = params;
    this.context = context;
    this.state = {
      position: 'none',
      entryPrice: null,
    };
  }

  onInit(): void {
    this.context.log('info', 'Strategy initialized', this.params);
  }

  onBar(bar: any): void {
    // 在这里实现你的策略逻辑
    const price = bar.close;
    const ma = bar.features?.my_ma;

    if (!ma) return;

    // 示例：简单的均线策略
    if (this.state.position === 'none' && price > parseFloat(ma)) {
      // 买入信号
      this.context.publishIntent({
        action: 'open',
        side: 'buy',
        quantity: '0.1', // 或 'all' 表示全仓
        reason: '价格上穿均线',
      });
      this.state.position = 'long';
      this.state.entryPrice = price.toString();
    } else if (this.state.position === 'long' && price < parseFloat(ma)) {
      // 卖出信号
      this.context.publishIntent({
        action: 'close',
        side: 'sell',
        quantity: 'all',
        reason: '价格下穿均线',
      });
      this.state.position = 'none';
      this.state.entryPrice = null;
    }
  }

  onSnapshot(): any {
    return { ...this.state };
  }

  onRestore(snapshot: any): void {
    this.state = { ...snapshot };
  }
}
```

### 3. 测试你的策略

```typescript
// 在 test-strategies.ts 中添加测试
const { MyStrategy } = await import('./my-strategy.strategy');
await testStrategy(
  MyStrategy,
  { period: 14, threshold: 0.5 },
  [{ id: 'MA', label: 'my_ma', params: { period: 14 } }],
  50000, // 数据量
  'up'   // 趋势类型
);
```

---

## 策略结构

### 必需的导出项

```typescript
// 1. 参数定义（必需）
export const parameters = { /* ... */ };

// 2. 特征依赖（必需）
export const features = [ /* ... */ ];

// 3. 策略类（必需）
export class MyStrategy { /* ... */ }
```

### 策略类的生命周期

```
创建 → onInit() → onBar() × N → onSnapshot() → 销毁
                                ↓
                         onRestore() → onBar() × N
```

### 完整的策略接口

```typescript
export class Strategy {
  // 构造函数
  constructor(params: any, context: StrategyContext) {}

  // 初始化（在开始接收数据前调用一次）
  onInit(): void {}

  // 每个K线调用一次（核心逻辑）
  onBar(bar: Bar): void {}

  // 创建状态快照（用于暂停/恢复）
  onSnapshot(): any {}

  // 从快照恢复（用于恢复运行）
  onRestore(snapshot: any): void {}
}
```

---

## API参考

### 参数定义 (parameters)

```typescript
export const parameters = {
  // 整数参数
  period: {
    type: 'integer' as const,
    default: 14,
    min: 1,
    max: 200,
    description: '周期',
  },

  // 浮点数参数
  threshold: {
    type: 'number' as const,
    default: 0.5,
    min: 0.0,
    max: 1.0,
    step: 0.1,
    description: '阈值',
  },

  // 字符串参数
  mode: {
    type: 'string' as const,
    default: 'aggressive',
    options: ['conservative', 'moderate', 'aggressive'],
    description: '模式',
  },

  // 布尔参数
  useStopLoss: {
    type: 'boolean' as const,
    default: true,
    description: '是否使用止损',
  },
};
```

### 特征依赖 (features)

```typescript
export const features = [
  // 移动平均线
  {
    id: 'MA',
    label: 'fast_ma',
    params: { period: 10 },
  },

  // RSI指标
  {
    id: 'RSI',
    label: 'rsi',
    params: { period: 14 },
  },

  // 布林带
  {
    id: 'Bollinger',
    label: 'bollinger',
    params: { period: 20, stdDev: 2.0 },
  },

  // MACD
  {
    id: 'MACD',
    label: 'macd',
    params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  },

  // ATR（平均真实波幅）
  {
    id: 'ATR',
    label: 'atr',
    params: { period: 14 },
  },
];
```

### Bar数据结构

```typescript
interface Bar {
  timestamp: number;      // 时间戳（毫秒）
  symbol: string;         // 交易对，如 'BTC/USDT'
  open: number;           // 开盘价
  high: number;           // 最高价
  low: number;            // 最低价
  close: number;          // 收盘价
  volume: number;         // 成交量

  features?: {            // 技术指标
    [label: string]: any; // 根据features定义
  };
}
```

### Context API

#### 1. 发布交易意图

```typescript
// 买入（开多仓）
this.context.publishIntent({
  action: 'open',
  side: 'buy',
  quantity: '0.1',        // 具体数量
  // 或
  quantity: 'all',        // 全仓买入
  reason: '金叉信号',     // 交易理由（用于日志）
});

// 卖出（平多仓）
this.context.publishIntent({
  action: 'close',
  side: 'sell',
  quantity: 'all',        // 全仓卖出
  reason: '死叉信号',
});

// 部分平仓
this.context.publishIntent({
  action: 'close',
  side: 'sell',
  quantity: '0.05',       // 卖出部分
  reason: '部分止盈',
});
```

#### 2. 记录日志

```typescript
// 信息日志
this.context.log('info', '策略运行中', { price: 50000 });

// 警告日志
this.context.log('warning', '持仓过大', { position: 0.8 });

// 错误日志
this.context.log('error', '数据异常', { error: 'Missing MA' });
```

#### 3. 记录指标

```typescript
// 记录自定义指标（用于后续分析）
this.context.metrics('signal_strength', {
  value: 0.75,
  threshold: 0.5,
  action: 'buy',
});
```

#### 4. 获取账户信息

```typescript
// 获取当前权益
const equity = this.context.getEquity();
console.log(`当前权益: $${equity}`);
```

---

## 开发流程

### 步骤 1: 设计策略

在开始编码前，明确：

1. **策略逻辑**：什么时候买入？什么时候卖出？
2. **参数列表**：需要哪些可调参数？
3. **技术指标**：依赖哪些技术指标？
4. **风险控制**：止损、止盈、仓位管理？
5. **适用市场**：趋势市场还是震荡市场？

### 步骤 2: 实现策略

```typescript
// 1. 定义参数
export const parameters = { /* ... */ };

// 2. 声明特征
export const features = [ /* ... */ ];

// 3. 定义状态
interface StrategyState { /* ... */ }

// 4. 实现策略类
export class MyStrategy {
  constructor(params, context) { /* ... */ }
  onInit() { /* ... */ }
  onBar(bar) {
    // 核心逻辑
    // - 获取数据和指标
    // - 判断交易条件
    // - 发布交易意图
    // - 更新状态
  }
  onSnapshot() { /* ... */ }
  onRestore(snapshot) { /* ... */ }
}
```

### 步骤 3: 添加日志

```typescript
onBar(bar: any): void {
  // 在关键点添加日志
  this.context.log('info', '收到新bar', {
    price: bar.close,
    ma: bar.features?.my_ma,
  });

  // 交易时记录详细信息
  if (shouldBuy) {
    this.context.log('info', '触发买入信号', {
      price: bar.close,
      signal: 'golden_cross',
    });
    this.context.publishIntent({ /* ... */ });
  }
}
```

### 步骤 4: 实现风险控制

```typescript
onBar(bar: any): void {
  const price = new Big(bar.close);

  // 止损检查
  if (this.state.position === 'long' && this.state.entryPrice) {
    const entryPrice = new Big(this.state.entryPrice);
    const loss = price.minus(entryPrice).div(entryPrice);

    if (loss.lt(-0.05)) { // 亏损超过5%
      this.context.log('warning', '触发止损', {
        entry: this.state.entryPrice,
        current: price.toFixed(2),
        loss: loss.times(100).toFixed(2) + '%',
      });

      this.context.publishIntent({
        action: 'close',
        side: 'sell',
        quantity: 'all',
        reason: '止损',
      });

      this.state.position = 'none';
    }
  }

  // 移动止盈
  if (this.state.position === 'long' && this.state.highestPrice) {
    const highest = new Big(this.state.highestPrice);
    const drawdown = highest.minus(price).div(highest);

    if (drawdown.gt(0.02)) { // 从最高点回撤超过2%
      this.context.log('info', '触发移动止盈', {
        highest: highest.toFixed(2),
        current: price.toFixed(2),
      });

      this.context.publishIntent({
        action: 'close',
        side: 'sell',
        quantity: 'all',
        reason: '移动止盈',
      });

      this.state.position = 'none';
    }
  }

  // 更新最高价
  if (this.state.position === 'long') {
    if (!this.state.highestPrice || price.gt(this.state.highestPrice)) {
      this.state.highestPrice = price.toFixed(2);
    }
  }
}
```

### 步骤 5: 实现状态管理

```typescript
// 创建快照
onSnapshot(): any {
  return {
    position: this.state.position,
    entryPrice: this.state.entryPrice,
    highestPrice: this.state.highestPrice,
    // 包含所有需要保存的状态
  };
}

// 恢复快照
onRestore(snapshot: any): void {
  this.state.position = snapshot.position || 'none';
  this.state.entryPrice = snapshot.entryPrice || null;
  this.state.highestPrice = snapshot.highestPrice || null;
  // 恢复所有保存的状态

  this.context.log('info', '状态已恢复', snapshot);
}
```

---

## 测试和验证

### 1. 单元测试（手工验证）

```typescript
// test-strategies.ts
async function testMyStrategy() {
  console.log('测试我的策略...');
  
  const { MyStrategy } = await import('./my-strategy.strategy');
  
  await testStrategy(
    MyStrategy,
    { 
      period: 14,
      threshold: 0.5,
    },
    [
      { id: 'MA', label: 'my_ma', params: { period: 14 } },
    ],
    50000,  // 使用50000个bar
    'up'    // 上涨趋势
  );
}
```

### 2. 多场景测试

```typescript
// 测试不同市场环境
const scenarios = [
  { trend: 'up', desc: '上涨趋势' },
  { trend: 'down', desc: '下跌趋势' },
  { trend: 'sideways', desc: '震荡市场' },
];

for (const scenario of scenarios) {
  console.log(`\n测试场景: ${scenario.desc}`);
  await testStrategy(
    MyStrategy,
    params,
    features,
    50000,
    scenario.trend
  );
}
```

### 3. 参数优化

```typescript
// 测试不同参数组合
const paramSets = [
  { period: 10, threshold: 0.3 },
  { period: 14, threshold: 0.5 },
  { period: 20, threshold: 0.7 },
];

for (const params of paramSets) {
  console.log(`\n测试参数: ${JSON.stringify(params)}`);
  await testStrategy(MyStrategy, params, features, 50000, 'up');
}
```

### 4. 验证结果

测试完成后，查看验证报告：

```
╔════════════════════════════════════════════════════════════════════╗
║                     完整验证报告                                   ║
╚════════════════════════════════════════════════════════════════════╝

验证状态: ✅ 通过

验证统计:
  总检查项: 7
  通过: 7
  失败: 0
  警告: 0

检查项详情:
  1. 交易连续性验证
  2. 每笔交易计算验证
  3. 账户状态转换验证
  4. 资金守恒验证
  5. 持仓平衡验证
  6. 盈亏计算验证
  7. 权益交叉验证

✅ 所有验证通过！回测结果可信。
```

**只有当所有7层验证都通过时，你的策略才是可信的！**

---

## 最佳实践

### 1. 代码组织

```typescript
export class MyStrategy {
  // ========== 状态管理 ==========
  private state: StrategyState;
  private params: any;
  private context: any;

  // ========== 构造和初始化 ==========
  constructor(params, context) { /* ... */ }
  onInit() { /* ... */ }

  // ========== 核心逻辑 ==========
  onBar(bar) { /* ... */ }

  // ========== 辅助方法 ==========
  private checkBuySignal(bar): boolean { /* ... */ }
  private checkSellSignal(bar): boolean { /* ... */ }
  private checkStopLoss(price): boolean { /* ... */ }

  // ========== 状态快照 ==========
  onSnapshot() { /* ... */ }
  onRestore(snapshot) { /* ... */ }
}
```

### 2. 使用 Big.js 处理金额

```typescript
import Big from 'big.js';

// ✅ 正确：使用 Big.js
const price = new Big(bar.close);
const stopLoss = price.times(0.95);

// ❌ 错误：直接使用浮点数
const stopLoss = bar.close * 0.95; // 可能有精度问题
```

### 3. 防御性编程

```typescript
onBar(bar: any): void {
  // 检查必需的数据
  if (!bar || !bar.close) {
    this.context.log('warning', 'Bar数据不完整');
    return;
  }

  // 检查特征数据
  const ma = bar.features?.my_ma;
  if (!ma) {
    this.context.log('warning', '缺少MA指标');
    return;
  }

  // 现在可以安全使用数据
  // ...
}
```

### 4. 清晰的状态管理

```typescript
interface StrategyState {
  position: 'none' | 'long' | 'short';
  entryPrice: string | null;
  entryTime: number | null;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
}

// 状态转换要明确
private openPosition(price: string, time: number): void {
  this.state.position = 'long';
  this.state.entryPrice = price;
  this.state.entryTime = time;
  this.state.stopLossPrice = new Big(price).times(0.95).toFixed(2);
}

private closePosition(): void {
  this.state.position = 'none';
  this.state.entryPrice = null;
  this.state.entryTime = null;
  this.state.stopLossPrice = null;
}
```

### 5. 详细的日志

```typescript
// 关键决策点都要记录
this.context.log('info', '评估交易信号', {
  price: bar.close,
  ma: bar.features?.my_ma,
  position: this.state.position,
});

if (buySignal) {
  this.context.log('info', '触发买入信号', {
    signal: 'golden_cross',
    strength: signalStrength,
  });
  
  this.context.publishIntent({ /* ... */ });
}
```

### 6. 参数验证

```typescript
constructor(params: any, context: any) {
  // 验证参数
  if (params.fastPeriod >= params.slowPeriod) {
    throw new Error('快速周期必须小于慢速周期');
  }

  if (params.positionSize <= 0 || params.positionSize > 1) {
    throw new Error('仓位大小必须在0-1之间');
  }

  this.params = params;
  this.context = context;
}
```

### 7. 模块化设计

```typescript
export class MyStrategy {
  // 将复杂逻辑拆分为小方法
  
  private shouldBuy(bar: any): boolean {
    return this.checkTrendCondition(bar) && 
           this.checkMomentumCondition(bar) &&
           this.checkVolumeCondition(bar);
  }

  private checkTrendCondition(bar: any): boolean {
    // 趋势检查逻辑
  }

  private checkMomentumCondition(bar: any): boolean {
    // 动量检查逻辑
  }

  private checkVolumeCondition(bar: any): boolean {
    // 成交量检查逻辑
  }
}
```

---

## 示例代码

### 完整的RSI策略示例

```typescript
/**
 * RSI均值回归策略
 */

import Big from 'big.js';

export const parameters = {
  rsiPeriod: {
    type: 'integer' as const,
    default: 14,
    min: 2,
    max: 50,
    description: 'RSI周期',
  },
  oversoldThreshold: {
    type: 'number' as const,
    default: 30,
    min: 10,
    max: 40,
    description: '超卖阈值',
  },
  overboughtThreshold: {
    type: 'number' as const,
    default: 70,
    min: 60,
    max: 90,
    description: '超买阈值',
  },
  positionSize: {
    type: 'number' as const,
    default: 0.3,
    min: 0.1,
    max: 1.0,
    description: '仓位大小',
  },
  stopLossPercent: {
    type: 'number' as const,
    default: 0.05,
    min: 0.01,
    max: 0.20,
    description: '止损百分比',
  },
};

export const features = [
  {
    id: 'RSI',
    label: 'rsi',
    params: { period: 14 },
  },
];

interface StrategyState {
  position: 'none' | 'long';
  entryPrice: string | null;
  entryTime: number | null;
  stopLossPrice: string | null;
  highestPrice: string | null;
}

export class RSIMeanReversionStrategy {
  private state: StrategyState;
  private params: any;
  private context: any;

  constructor(params: any, context: any) {
    this.params = params;
    this.context = context;
    this.state = {
      position: 'none',
      entryPrice: null,
      entryTime: null,
      stopLossPrice: null,
      highestPrice: null,
    };
  }

  onInit(): void {
    this.context.log('info', 'RSI Strategy initialized', {
      rsiPeriod: this.params.rsiPeriod,
      oversold: this.params.oversoldThreshold,
      overbought: this.params.overboughtThreshold,
    });
  }

  onBar(bar: any): void {
    const price = new Big(bar.close);
    const rsi = bar.features?.rsi;

    if (!rsi) return;

    const rsiValue = parseFloat(rsi);

    // 无持仓时，检查买入信号
    if (this.state.position === 'none') {
      if (rsiValue < this.params.oversoldThreshold) {
        this.openPosition(bar);
      }
    }
    // 有持仓时，检查卖出信号和风险控制
    else if (this.state.position === 'long') {
      // 检查止损
      if (this.checkStopLoss(price)) {
        this.closePosition(bar, '止损');
        return;
      }

      // 检查移动止盈
      if (this.checkTrailingStop(price)) {
        this.closePosition(bar, '移动止盈');
        return;
      }

      // 检查超买信号
      if (rsiValue > this.params.overboughtThreshold) {
        this.closePosition(bar, 'RSI超买');
        return;
      }

      // 更新最高价（用于移动止盈）
      this.updateHighestPrice(price);
    }
  }

  private openPosition(bar: any): void {
    const price = new Big(bar.close);
    const stopLoss = price.times(1 - this.params.stopLossPercent);

    this.context.log('info', '开仓', {
      price: price.toFixed(2),
      stopLoss: stopLoss.toFixed(2),
      rsi: bar.features?.rsi,
    });

    // 计算买入数量
    const equity = new Big(this.context.getEquity());
    const positionValue = equity.times(this.params.positionSize);
    const quantity = positionValue.div(price);

    this.context.publishIntent({
      action: 'open',
      side: 'buy',
      quantity: quantity.toFixed(8),
      reason: 'RSI超卖',
    });

    this.state.position = 'long';
    this.state.entryPrice = price.toFixed(2);
    this.state.entryTime = bar.timestamp;
    this.state.stopLossPrice = stopLoss.toFixed(2);
    this.state.highestPrice = price.toFixed(2);
  }

  private closePosition(bar: any, reason: string): void {
    this.context.log('info', '平仓', {
      reason,
      entryPrice: this.state.entryPrice,
      exitPrice: bar.close,
    });

    this.context.publishIntent({
      action: 'close',
      side: 'sell',
      quantity: 'all',
      reason,
    });

    this.state.position = 'none';
    this.state.entryPrice = null;
    this.state.entryTime = null;
    this.state.stopLossPrice = null;
    this.state.highestPrice = null;
  }

  private checkStopLoss(price: Big): boolean {
    if (!this.state.stopLossPrice) return false;

    const stopLoss = new Big(this.state.stopLossPrice);
    return price.lte(stopLoss);
  }

  private checkTrailingStop(price: Big): boolean {
    if (!this.state.highestPrice) return false;

    const highest = new Big(this.state.highestPrice);
    const drawdown = highest.minus(price).div(highest);

    // 从最高点回撤超过2%触发止盈
    return drawdown.gt(0.02);
  }

  private updateHighestPrice(price: Big): void {
    if (!this.state.highestPrice) {
      this.state.highestPrice = price.toFixed(2);
      return;
    }

    const highest = new Big(this.state.highestPrice);
    if (price.gt(highest)) {
      this.state.highestPrice = price.toFixed(2);
    }
  }

  onSnapshot(): any {
    return { ...this.state };
  }

  onRestore(snapshot: any): void {
    this.state = { ...snapshot };
  }
}
```

---

## 常见问题

### Q1: 如何获取前一个bar的数据？

```typescript
export class MyStrategy {
  private lastBar: any = null;

  onBar(bar: any): void {
    if (this.lastBar) {
      // 可以比较当前bar和上一个bar
      const priceChange = bar.close - this.lastBar.close;
      console.log('价格变化:', priceChange);
    }

    this.lastBar = { ...bar }; // 保存当前bar
  }
}
```

### Q2: 如何实现复杂的条件判断？

```typescript
private shouldBuy(bar: any): boolean {
  // 1. 趋势条件
  const trendOk = bar.features?.fast_ma > bar.features?.slow_ma;

  // 2. 动量条件
  const momentumOk = bar.features?.rsi < 70;

  // 3. 成交量条件
  const volumeOk = bar.volume > this.avgVolume;

  // 4. 持仓条件
  const positionOk = this.state.position === 'none';

  return trendOk && momentumOk && volumeOk && positionOk;
}
```

### Q3: 如何计算自定义指标？

```typescript
export class MyStrategy {
  private priceHistory: number[] = [];

  onBar(bar: any): void {
    // 保存价格历史
    this.priceHistory.push(bar.close);
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift(); // 只保留最近100个
    }

    // 计算自定义指标
    if (this.priceHistory.length >= 20) {
      const sma20 = this.calculateSMA(20);
      const volatility = this.calculateVolatility();
      
      // 使用自定义指标
      if (bar.close > sma20 && volatility < 0.02) {
        // 交易逻辑
      }
    }
  }

  private calculateSMA(period: number): number {
    const slice = this.priceHistory.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private calculateVolatility(): number {
    const returns = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      const ret = (this.priceHistory[i] - this.priceHistory[i-1]) / this.priceHistory[i-1];
      returns.push(ret);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }
}
```

### Q4: 如何处理多个时间框架？

```typescript
// 请求多个时间框架的特征
export const features = [
  {
    id: 'MA',
    label: 'ma_1h',
    params: { period: 20, timeframe: '1h' },
  },
  {
    id: 'MA',
    label: 'ma_4h',
    params: { period: 20, timeframe: '4h' },
  },
];

onBar(bar: any): void {
  const ma1h = bar.features?.ma_1h;
  const ma4h = bar.features?.ma_4h;

  // 多时间框架确认
  if (ma1h && ma4h) {
    if (bar.close > parseFloat(ma1h) && bar.close > parseFloat(ma4h)) {
      // 两个时间框架都看涨
    }
  }
}
```

### Q5: 如何实现金字塔加仓？

```typescript
interface StrategyState {
  positions: Array<{ price: string; size: string }>;
  totalSize: string;
}

private addPosition(price: string, size: string): void {
  this.state.positions.push({ price, size });
  
  const totalSize = this.state.positions.reduce((sum, pos) => {
    return sum.plus(pos.size);
  }, new Big(0));
  
  this.state.totalSize = totalSize.toFixed(8);

  this.context.publishIntent({
    action: 'open',
    side: 'buy',
    quantity: size,
    reason: '加仓',
  });
}
```

### Q6: 验证失败怎么办？

如果看到验证失败的报告：

```
❌ 发现的错误:
  1. 交易 15 (买入): 成本计算错误
  2. 资金守恒验证失败
```

**排查步骤**：

1. **检查交易逻辑**：确认交易数量的计算是否正确
2. **检查状态管理**：确认持仓状态更新是否正确
3. **添加详细日志**：在关键计算点添加日志
4. **手工验证**：用简单的数据手工计算验证

### Q7: 如何优化策略性能？

```typescript
// ✅ 好的做法
export class MyStrategy {
  private cachedValue: number | null = null;
  private lastCalculateBar: number = -1;

  private getExpensiveCalculation(barIndex: number): number {
    // 缓存计算结果
    if (barIndex !== this.lastCalculateBar) {
      this.cachedValue = this.expensiveCalculation();
      this.lastCalculateBar = barIndex;
    }
    return this.cachedValue!;
  }
}
```

---

## 下一步

### 学习资源

1. **查看示例策略**
   - `ma-cross.strategy.ts` - 双均线交叉
   - `rsi-mean-reversion.strategy.ts` - RSI均值回归
   - `bollinger-bands.strategy.ts` - 布林带策略

2. **阅读文档**
   - `README.md` - 策略库概览
   - `COMPREHENSIVE_VALIDATION_GUIDE.md` - 验证系统指南
   - `VALIDATION_SUMMARY.md` - 验证系统总结

3. **运行测试**
   ```bash
   cd backend
   npx tsx src/backtesting/strategies/test-strategies.ts
   ```

### 开发清单

开发新策略时，确保完成：

- [ ] 定义清晰的策略逻辑
- [ ] 实现参数定义
- [ ] 声明特征依赖
- [ ] 实现策略类的所有方法
- [ ] 添加详细的日志
- [ ] 实现风险控制
- [ ] 实现状态快照/恢复
- [ ] 编写测试代码
- [ ] 通过所有7层验证
- [ ] 多场景测试
- [ ] 参数优化

### 提交策略

当你的策略开发完成并通过所有验证后：

1. 确保代码格式规范
2. 添加详细的注释
3. 更新 `README.md`
4. 提交代码审查

---

## 支持

如有问题，请查看：

- 📖 **文档**：`backend/src/backtesting/strategies/`目录下的所有`.md`文件
- 💬 **示例**：查看现有的策略实现
- 🐛 **问题追踪**：提交Issue描述你的问题

**祝你开发出优秀的交易策略！** 🚀📈

