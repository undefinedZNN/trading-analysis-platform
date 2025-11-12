# 回测策略库

本目录包含多个经典的交易策略实现，适用于回测框架。

## 📚 策略列表

### 1. MA Cross（双均线交叉）

**文件**: `ma-cross.strategy.ts`

**策略类型**: 趋势跟踪

**适用市场**: 趋势市场（上涨或下跌）

**策略逻辑**:
- 当快速均线上穿慢速均线时（金叉），产生买入信号
- 当快速均线下穿慢速均线时（死叉），产生卖出信号

**参数**:
- `fastPeriod`: 快速均线周期（默认: 10）
- `slowPeriod`: 慢速均线周期（默认: 30）
- `positionSize`: 仓位大小（默认: 0.5，即50%资金）

**特征依赖**:
- `MA` (快速): 快速移动平均线
- `MA` (慢速): 慢速移动平均线

**优点**:
- 简单易懂，容易实现
- 在强趋势市场表现良好
- 风险可控

**缺点**:
- 在震荡市场容易产生假信号
- 有滞后性
- 可能错过趋势的初期

---

### 2. RSI Mean Reversion（RSI均值回归）

**文件**: `rsi-mean-reversion.strategy.ts`

**策略类型**: 均值回归

**适用市场**: 震荡市场

**策略逻辑**:
- 当RSI低于超卖阈值（默认30）时买入
- 当RSI高于超买阈值（默认70）时卖出
- 配合移动止损保护利润

**参数**:
- `rsiPeriod`: RSI周期（默认: 14）
- `oversoldThreshold`: 超卖阈值（默认: 30）
- `overboughtThreshold`: 超买阈值（默认: 70）
- `positionSize`: 仓位大小（默认: 0.3）
- `stopLossPercent`: 止损百分比（默认: 0.05）

**特征依赖**:
- `RSI`: 相对强弱指标

**优点**:
- 在震荡市场表现优异
- 有明确的止损规则
- 风险收益比较好

**缺点**:
- 在强趋势市场可能被套
- 需要频繁交易
- 假突破较多

---

### 3. Bollinger Bands（布林带策略）

**文件**: `bollinger-bands.strategy.ts`

**策略类型**: 均值回归 / 突破

**适用市场**: 震荡市场（均值回归）或趋势市场（突破）

**策略逻辑**:

**均值回归模式**:
- 价格触及下轨时买入
- 价格触及上轨时卖出

**突破模式**:
- 价格突破上轨时买入（追涨）
- 价格跌破下轨时卖出

**参数**:
- `period`: 布林带周期（默认: 20）
- `stdDev`: 标准差倍数（默认: 2.0）
- `positionSize`: 仓位大小（默认: 0.4）
- `strategy`: 策略类型（`mean_reversion` 或 `breakout`）
- `stopLossPercent`: 止损百分比（默认: 0.03）

**特征依赖**:
- `Bollinger`: 布林带（上轨、中轨、下轨）

**优点**:
- 自适应性强（带宽随波动调整）
- 两种模式适应不同市场
- 可视化效果好

**缺点**:
- 参数敏感
- 需要根据市场切换模式
- 假突破较多

---

## 🧪 测试策略

### 运行测试

```bash
cd /Volumes/work/zen/trading-analysis-platform/backend
npx ts-node src/backtesting/strategies/test-strategies.ts
```

### 测试内容

测试套件会：
1. ✅ 使用 OHLCVGenerator 生成模拟数据
2. ✅ 测试策略初始化
3. ✅ 测试策略信号生成
4. ✅ 测试快照/恢复功能
5. ✅ 输出策略执行结果

### 测试场景

- **MA Cross**: 上涨趋势（200个bar）
- **RSI Mean Reversion**: 震荡市场（200个bar）
- **Bollinger Bands (Mean Reversion)**: 震荡市场（200个bar）
- **Bollinger Bands (Breakout)**: 上涨趋势（200个bar）

---

## 📊 策略结构

所有策略遵循统一的结构：

```typescript
export const parameters = {
  // 策略参数定义
};

export const features = [
  // 依赖的特征
];

export class StrategyClass {
  constructor(params, context) {
    // 初始化
  }

  onInit(): void {
    // 策略启动时调用
  }

  onBar(bar): void {
    // 处理每个bar
    // 生成交易信号
  }

  onSnapshot(): any {
    // 创建快照
  }

  onRestore(snapshot): void {
    // 恢复快照
  }
}

export default {
  name: 'Strategy Name',
  version: '1.0.0',
  description: 'Strategy Description',
  parameters,
  features,
  Strategy: StrategyClass,
};
```

---

## 🎯 使用建议

### 参数优化

1. **回测验证**: 使用历史数据验证策略表现
2. **参数扫描**: 测试不同参数组合
3. **样本外测试**: 保留部分数据用于验证
4. **滑动窗口**: 使用滑动窗口验证稳定性

### 风险管理

1. **止损设置**: 所有策略都应设置止损
2. **仓位管理**: 不要满仓操作
3. **分散投资**: 不要只使用一个策略
4. **市场适应**: 根据市场状态切换策略

### 组合策略

可以组合使用多个策略：

```typescript
// 示例：趋势 + 震荡组合
- 上升趋势: 使用 MA Cross
- 震荡市场: 使用 RSI Mean Reversion
- 高波动: 使用 Bollinger Bands Breakout
```

---

## 🔧 扩展策略

要创建新策略：

1. 复制现有策略模板
2. 定义参数和特征依赖
3. 实现策略逻辑
4. 添加日志和指标记录
5. 实现快照/恢复
6. 运行测试验证

### 示例模板

```typescript
export const parameters = {
  // 你的参数
};

export const features = [
  // 你的特征
];

export class YourStrategy {
  constructor(params, context) {
    this.params = params;
    this.context = context;
  }

  onInit(): void {
    this.context.log('info', 'Strategy initialized');
  }

  onBar(bar): void {
    // 你的策略逻辑
  }

  onSnapshot(): any {
    return { /* state */ };
  }

  onRestore(snapshot): void {
    // 恢复状态
  }
}

export default {
  name: 'Your Strategy',
  version: '1.0.0',
  description: 'Your description',
  parameters,
  features,
  Strategy: YourStrategy,
};
```

---

## 📖 相关文档

- [回测框架架构](../../docs/prd/backtesting-strategy-management/backtest-framework-architecture/)
- [特征注册表文档](../features/README.md)
- [风控引擎文档](../risk/README.md)
- [执行引擎文档](../execution/README.md)

---

## 🤝 贡献

欢迎贡献新的策略！请确保：

1. ✅ 遵循统一的代码结构
2. ✅ 添加完整的参数说明
3. ✅ 包含测试用例
4. ✅ 更新本 README

---

**最后更新**: 2025-11-12  
**版本**: 1.0.0

