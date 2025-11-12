# 策略开发快速入门

## 🚀 5分钟上手

### 第一步：复制模板

```bash
cd backend/src/backtesting/strategies
cp ma-cross.strategy.ts my-strategy.strategy.ts
```

### 第二步：修改策略名称

```typescript
// my-strategy.strategy.ts
export class MyStrategy {  // 修改类名
  // ...
}
```

### 第三步：定义参数

```typescript
export const parameters = {
  myParam: {
    type: 'number' as const,
    default: 14,
    min: 1,
    max: 100,
    description: '我的参数',
  },
};
```

### 第四步：实现核心逻辑

```typescript
onBar(bar: any): void {
  const price = bar.close;
  
  // 你的策略逻辑
  if (/* 买入条件 */) {
    this.context.publishIntent({
      action: 'open',
      side: 'buy',
      quantity: '0.1',
      reason: '买入信号',
    });
  }
  
  if (/* 卖出条件 */) {
    this.context.publishIntent({
      action: 'close',
      side: 'sell',
      quantity: 'all',
      reason: '卖出信号',
    });
  }
}
```

### 第五步：测试策略

```typescript
// 在 test-strategies.ts 中添加
const { MyStrategy } = await import('./my-strategy.strategy');
await testStrategy(
  MyStrategy,
  { myParam: 14 },
  features,
  50000,
  'up'
);
```

### 第六步：运行测试

```bash
npx tsx src/backtesting/strategies/test-strategies.ts
```

查看结果，确保通过所有验证：

```
✅ 所有验证通过！回测结果可信。
```

---

## 📝 基础模板

```typescript
/**
 * 我的策略
 */
import Big from 'big.js';

// ========== 参数 ==========
export const parameters = {
  period: {
    type: 'integer' as const,
    default: 14,
    min: 2,
    max: 100,
    description: '周期',
  },
};

// ========== 特征 ==========
export const features = [
  {
    id: 'MA',
    label: 'my_ma',
    params: { period: 14 },
  },
];

// ========== 策略 ==========
interface State {
  position: 'none' | 'long';
  entryPrice: string | null;
}

export class MyStrategy {
  private state: State;
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
    this.context.log('info', 'Strategy initialized');
  }

  onBar(bar: any): void {
    const price = bar.close;
    const ma = bar.features?.my_ma;
    
    if (!ma) return;

    // 买入逻辑
    if (this.state.position === 'none' && price > parseFloat(ma)) {
      this.context.publishIntent({
        action: 'open',
        side: 'buy',
        quantity: '0.1',
        reason: '价格上穿MA',
      });
      this.state.position = 'long';
      this.state.entryPrice = price.toString();
    }

    // 卖出逻辑
    if (this.state.position === 'long' && price < parseFloat(ma)) {
      this.context.publishIntent({
        action: 'close',
        side: 'sell',
        quantity: 'all',
        reason: '价格下穿MA',
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

---

## 🎯 常用代码片段

### 止损逻辑

```typescript
private checkStopLoss(price: number): boolean {
  if (!this.state.entryPrice) return false;
  
  const entry = new Big(this.state.entryPrice);
  const current = new Big(price);
  const loss = current.minus(entry).div(entry);
  
  return loss.lt(-0.05); // 亏损5%止损
}
```

### 移动止盈

```typescript
private checkTrailingStop(price: number): boolean {
  if (!this.state.highestPrice) return false;
  
  const highest = new Big(this.state.highestPrice);
  const current = new Big(price);
  const drawdown = highest.minus(current).div(highest);
  
  return drawdown.gt(0.02); // 回撤2%止盈
}
```

### 仓位管理

```typescript
private calculatePositionSize(): string {
  const equity = new Big(this.context.getEquity());
  const positionValue = equity.times(this.params.positionSize);
  const price = new Big(this.currentPrice);
  const quantity = positionValue.div(price);
  
  return quantity.toFixed(8);
}
```

### 信号强度

```typescript
private calculateSignalStrength(bar: any): number {
  let strength = 0;
  
  // 趋势强度
  if (bar.features?.fast_ma > bar.features?.slow_ma) {
    strength += 0.3;
  }
  
  // 动量强度
  const rsi = parseFloat(bar.features?.rsi || '50');
  if (rsi < 30) strength += 0.4;
  
  // 成交量强度
  if (bar.volume > this.avgVolume) {
    strength += 0.3;
  }
  
  return strength;
}
```

---

## ⚠️ 常见错误

### 错误 1：忘记检查数据

```typescript
// ❌ 错误
onBar(bar: any): void {
  const ma = bar.features.my_ma; // 可能 undefined
  if (bar.close > ma) { // 崩溃！
    // ...
  }
}

// ✅ 正确
onBar(bar: any): void {
  const ma = bar.features?.my_ma;
  if (!ma) return; // 数据检查
  
  if (bar.close > parseFloat(ma)) {
    // ...
  }
}
```

### 错误 2：状态不一致

```typescript
// ❌ 错误
if (shouldBuy) {
  this.context.publishIntent({ ... });
  // 忘记更新状态！
}

// ✅ 正确
if (shouldBuy) {
  this.context.publishIntent({ ... });
  this.state.position = 'long';
  this.state.entryPrice = price.toString();
}
```

### 错误 3：浮点数精度

```typescript
// ❌ 错误
const stopLoss = bar.close * 0.95;

// ✅ 正确
import Big from 'big.js';
const stopLoss = new Big(bar.close).times(0.95);
```

---

## 📊 测试你的策略

### 基础测试

```bash
npx tsx src/backtesting/strategies/test-strategies.ts
```

### 只测试你的策略

```bash
# 编辑 test-strategies.ts，注释掉其他策略测试
npx tsx src/backtesting/strategies/test-strategies.ts
```

### 查看验证报告

测试完成后，查找：

```
╔════════════════════════════════════════════════════════════════════╗
║                     完整验证报告                                   ║
╚════════════════════════════════════════════════════════════════════╝

验证状态: ✅ 通过  <-- 必须是"通过"
```

---

## 📚 下一步

1. **阅读详细文档**：`STRATEGY_DEVELOPMENT_GUIDE.md`
2. **学习示例策略**：查看 `ma-cross.strategy.ts`、`rsi-mean-reversion.strategy.ts`
3. **了解验证系统**：`COMPREHENSIVE_VALIDATION_GUIDE.md`
4. **参考策略库**：`README.md`

---

## 💡 提示

- ✅ 始终使用 `Big.js` 处理金额计算
- ✅ 添加详细的日志便于调试
- ✅ 实现完整的风险控制
- ✅ 确保通过所有7层验证
- ✅ 在不同市场环境下测试

**开始编写你的第一个策略吧！** 🚀
