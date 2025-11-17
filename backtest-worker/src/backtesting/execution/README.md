# ExecutionEngine - 执行撮合引擎

**版本**: 1.0.0  
**状态**: ✅ 已完成  
**测试**: 16/16 通过 (100%)

---

## 📋 模块概述

ExecutionEngine 是回测系统的执行撮合引擎，负责模拟真实市场的订单簿和撮合逻辑。它处理各种订单类型，模拟滑点和手续费，管理仓位，并生成执行回报。

### 核心特性

- ✅ **订单生命周期管理** - 跟踪订单从创建到完成的全过程
- ✅ **多种订单类型** - 支持市价、限价、止损单
- ✅ **撮合逻辑** - 模拟真实市场的订单成交机制
- ✅ **滑点模拟** - 多种滑点模型（零滑点、固定点差、比例、市场冲击）
- ✅ **手续费计算** - 支持 maker/taker 费率
- ✅ **TIF 支持** - GTC/IOC/FOK 时间有效性
- ✅ **仓位管理** - 自动追踪和更新仓位
- ✅ **快照恢复** - 支持暂停/恢复回测

---

## 🚀 快速开始

### 1. 基本使用

```typescript
import { 
  createExecutionEngine, 
  FixedSpreadSlippage, 
  FixedRateFeeModel 
} from '@/backtesting/execution';

// 创建执行引擎
const engine = createExecutionEngine({
  sessionId: 'session-001',
  strategyId: 'strategy-001',
  slippageModel: new FixedSpreadSlippage(10), // 10 bps
  feeModel: new FixedRateFeeModel(0.02, 0.05), // 0.02% maker, 0.05% taker
  marketFillPolicy: 'close', // 市价单按收盘价成交
});

// 提交订单
const orderId = await engine.submit({
  intentId: 'intent-001',
  strategyId: 'strategy-001',
  symbol: 'BTC/USDT',
  side: 'buy',
  type: 'limit',
  quantity: '1.0',
  price: '50000',
  tif: 'GTC',
});

// 处理行情（触发撮合）
await engine.processBars([{
  symbol: 'BTC/USDT',
  timestamp: '2024-01-01T00:00:00Z',
  open: '50000',
  high: '51000',
  low: '49000',
  close: '50500',
  volume: '100',
}]);

// 查询订单
const order = engine.getOrder(orderId);
console.log(order.status); // 'filled', 'new', 'cancelled', etc.
```

### 2. 使用编排器

```typescript
import { 
  createExecutionEngine, 
  createExecutionOrchestrator 
} from '@/backtesting/execution';
import { eventBus } from '@/backtesting/events';

// 创建引擎和编排器
const engine = createExecutionEngine({
  sessionId: 'session-001',
  strategyId: 'strategy-001',
});

const orchestrator = createExecutionOrchestrator('session-001');

// 启动编排器（自动订阅事件）
orchestrator.start(eventBus, engine);

// 编排器会自动：
// 1. 订阅 risk.decision - 处理风控决策
// 2. 订阅 market.bar - 触发撮合
// 3. 发布 execution.report - 执行回报
// 4. 发布 portfolio.update - 组合更新

// 停止编排器
orchestrator.stop();
```

---

## 📚 订单类型

### 1. 市价单 (Market Order)

立即按当前市价成交。

```typescript
await engine.submit({
  intentId: 'intent-001',
  strategyId: 'strategy-001',
  symbol: 'BTC/USDT',
  side: 'buy',
  type: 'market',
  quantity: '1.0',
});
```

**成交规则**:
- `marketFillPolicy: 'open'` - 按开盘价成交
- `marketFillPolicy: 'close'` - 按收盘价成交（默认）
- `marketFillPolicy: 'mid'` - 按高低价中间值成交

### 2. 限价单 (Limit Order)

只有在价格触及限价时才成交。

```typescript
await engine.submit({
  intentId: 'intent-002',
  strategyId: 'strategy-001',
  symbol: 'BTC/USDT',
  side: 'buy',
  type: 'limit',
  quantity: '1.0',
  price: '49500', // 限价
  tif: 'GTC',
});
```

**成交规则**:
- 买单：`limitPrice >= bar.low`
- 卖单：`limitPrice <= bar.high`

### 3. 止损单 (Stop Order)

当价格触及止损价后，转为市价单成交。

```typescript
await engine.submit({
  intentId: 'intent-003',
  strategyId: 'strategy-001',
  symbol: 'BTC/USDT',
  side: 'sell',
  type: 'stop',
  quantity: '1.0',
  stopPrice: '48000', // 止损价
});
```

**触发规则**:
- 买单止损：`bar.high >= stopPrice`
- 卖单止损：`bar.low <= stopPrice`

---

## 🔧 滑点模型

### 1. 零滑点 (Zero Slippage)

无滑点，用于测试。

```typescript
new ZeroSlippageModel()
```

### 2. 固定点差 (Fixed Spread)

固定的滑点比例（基点）。

```typescript
new FixedSpreadSlippage(10) // 10 bps = 0.1%
```

- 买入：价格上升 0.1%
- 卖出：价格下降 0.1%

### 3. 比例滑点 (Proportional)

根据流动性类型（maker/taker）应用不同滑点。

```typescript
new ProportionalSlippage(
  20, // taker: 20 bps
  5   // maker: 5 bps
)
```

### 4. 市场冲击 (Market Impact)

基于订单大小和市场深度的动态滑点。

```typescript
new MarketImpactSlippage(
  10,   // base: 10 bps
  0.1   // impact factor
)
```

滑点 = baseBps + (orderSize / marketDepth) * impactFactor

---

## 💰 手续费模型

### 1. 零手续费 (Zero Fee)

无手续费，用于测试。

```typescript
new ZeroFeeModel()
```

### 2. 固定费率 (Fixed Rate)

固定的 maker/taker 费率。

```typescript
new FixedRateFeeModel(
  0.02, // maker: 0.02%
  0.05  // taker: 0.05%
)
```

### 3. 分级费率 (Tiered)

基于交易量的分级费率。

```typescript
new TieredFeeModel([
  { threshold: '0', makerRate: 0.02, takerRate: 0.05 },
  { threshold: '10000', makerRate: 0.015, takerRate: 0.04 },
  { threshold: '100000', makerRate: 0.01, takerRate: 0.03 },
])
```

---

## ⏱️ 时间有效性 (TIF)

### 1. GTC (Good-Til-Cancelled)

一直有效直到取消（默认）。

```typescript
tif: 'GTC'
```

### 2. IOC (Immediate-Or-Cancel)

立即成交，未成交部分取消。

```typescript
tif: 'IOC'
```

### 3. FOK (Fill-Or-Kill)

全部成交或全部取消。

```typescript
tif: 'FOK'
```

---

## 📊 仓位管理

ExecutionEngine 自动追踪和更新仓位。

```typescript
// 启用仓位追踪（默认开启）
const engine = createExecutionEngine({
  sessionId: 'session-001',
  strategyId: 'strategy-001',
  trackPositions: true,
});

// 每次成交后，会自动：
// 1. 更新仓位数量
// 2. 计算平均入场价
// 3. 计算未实现盈亏
// 4. 发布 portfolio.update 事件
```

---

## 📸 快照与恢复

支持执行引擎状态的持久化和恢复。

```typescript
// 创建快照
const snapshot = engine.createSnapshot();
console.log(snapshot.orders.length);
console.log(snapshot.stats);

// 恢复快照
engine.restoreSnapshot(snapshot);
```

---

## 🧪 测试

### 运行测试

```bash
cd backend
npx ts-node src/backtesting/execution/__tests__/execution-engine.test.ts
```

### 测试覆盖

- ✅ ExecutionEngine 核心（6个测试）
- ✅ 撮合器（3个测试）
- ✅ 滑点模型（3个测试）
- ✅ 手续费模型（3个测试）
- ✅ 快照（1个测试）

**总计**: 16/16 测试通过 (100%)

---

## 📖 API 参考

### ExecutionEngine

| 方法 | 说明 |
|------|------|
| `submit(intent)` | 提交订单 |
| `cancel(orderId, reason)` | 取消订单 |
| `processBars(bars)` | 处理行情（触发撮合） |
| `getOrder(orderId)` | 查询订单 |
| `getActiveOrders()` | 获取活跃订单 |
| `getAllOrders()` | 获取所有订单 |
| `getStats()` | 获取统计信息 |
| `createSnapshot()` | 创建快照 |
| `restoreSnapshot(snapshot)` | 恢复快照 |
| `reset()` | 重置引擎 |

### ExecutionEngineOrchestrator

| 方法 | 说明 |
|------|------|
| `start(eventBus, engine)` | 启动编排器 |
| `stop()` | 停止编排器 |
| `getStats()` | 获取统计信息 |

---

## 🔗 依赖关系

### 上游依赖

- ✅ **M1-04 EventBus** - 事件发布与订阅
- ✅ **M2-02 RiskEngine** - 风控决策
- ✅ **big.js** - 精度计算
- ✅ **nanoid** - ID 生成

### 下游依赖

- **M2-04 LedgerService** - 账本记录
- **M3-01 Orchestrator** - 整体流程编排

---

## 💡 最佳实践

### 1. 选择合适的滑点模型

```typescript
// 简单回测：零滑点
slippageModel: new ZeroSlippageModel()

// 一般回测：固定点差
slippageModel: new FixedSpreadSlippage(10)

// 精确回测：市场冲击
slippageModel: new MarketImpactSlippage(10, 0.1)
```

### 2. 设置合理的手续费

```typescript
// Binance 现货费率
feeModel: new FixedRateFeeModel(0.01, 0.01)

// 分级费率（大户优惠）
feeModel: new TieredFeeModel([...])
```

### 3. 使用编排器简化集成

```typescript
// 推荐：使用编排器
const orchestrator = createExecutionOrchestrator(sessionId);
orchestrator.start(eventBus, engine);

// 不推荐：手动订阅事件
eventBus.subscribe('risk.decision', async (event) => {
  // 手动处理...
});
```

---

## ⚠️ 注意事项

1. **订单状态**: 订单状态流转为 `new` → `partially_filled` → `filled` 或 `cancelled`
2. **TIF 规则**: IOC/FOK 只在首次匹配时生效
3. **仓位计算**: 简化实现，未考虑多币种和杠杆
4. **性能**: 每个 bar 遍历所有活跃订单，大量订单时可能较慢

---

## 🛣️ 未来计划

- [ ] 支持止损限价单 (Stop-Limit)
- [ ] 支持冰山订单 (Iceberg)
- [ ] 支持条件订单 (Conditional)
- [ ] 优化大量订单的性能
- [ ] 支持杠杆交易

---

## 📝 变更日志

### v1.0.0 (2024-11-07)

- ✅ 实现 ExecutionEngine 核心
- ✅ 实现 3 种撮合器（市价、限价、止损）
- ✅ 实现 4 种滑点模型
- ✅ 实现 3 种手续费模型
- ✅ 实现仓位管理
- ✅ 实现快照恢复
- ✅ 实现编排器
- ✅ 完成单元测试（16/16 通过）
- ✅ 完成文档

---

**维护者**: AI Assistant  
**最后更新**: 2024-11-07

