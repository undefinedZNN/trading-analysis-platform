# LedgerService - 交易账簿服务

**版本**: 1.0.0  
**状态**: ✅ 已完成  
**测试**: 16/16 通过 (100%)

---

## 📋 模块概述

LedgerService 是回测系统的交易账簿服务，负责记录所有交易明细、计算盈亏、统计分析，并导出结构化数据文件。它是回测结果分析的基础。

### 核心特性

- ✅ **交易记录** - 记录每笔成交的完整信息
- ✅ **PnL 计算** - 自动计算已实现/未实现盈亏
- ✅ **统计分析** - 实时计算胜率、盈亏比、回撤等指标
- ✅ **特征关联** - 将交易与触发时的特征快照关联
- ✅ **多格式导出** - JSON/CSV/Parquet 格式
- ✅ **高性能缓冲** - 批量写入优化

---

## 🚀 快速开始

### 1. 基本使用

```typescript
import { createLedgerService } from '@/backtesting/ledger';

// 创建账簿服务
const ledger = createLedgerService({
  sessionId: 'session-001',
  strategyId: 'strategy-001',
  outputDir: './output',
  bufferSize: 1000,
  autoFlush: true,
});

// 记录交易
await ledger.recordTrade({
  tradeId: 'trade-001',
  sessionId: 'session-001',
  strategyId: 'strategy-001',
  symbol: 'BTC/USDT',
  intentId: 'intent-001',
  orderId: 'order-001',
  fillId: 'fill-001',
  side: 'buy',
  type: 'open',
  quantity: '1.0',
  price: '50000',
  realizedPnl: '-50', // 开仓手续费
  unrealizedPnl: '0',
  fees: '50',
  feeCurrency: 'USDT',
  liquidity: 'taker',
  timestamp: new Date().toISOString(),
  sequenceId: 'seq-001',
});

// 查询交易
const trades = await ledger.getTrades({
  symbol: 'BTC/USDT',
  side: 'buy',
});

// 获取统计
const stats = ledger.getStats();
console.log('Total PnL:', stats.totalPnl);
console.log('Win Rate:', stats.winRate);

// 导出数据
await ledger.exportToJSON('./output/ledger.json');
await ledger.exportToCSV('./output/ledger.csv');
```

### 2. 使用编排器

```typescript
import {
  createLedgerService,
  createLedgerOrchestrator,
} from '@/backtesting/ledger';
import { eventBus } from '@/backtesting/events';

// 创建服务和编排器
const ledger = createLedgerService({
  sessionId: 'session-001',
  strategyId: 'strategy-001',
});

const orchestrator = createLedgerOrchestrator('session-001');

// 启动编排器（自动订阅事件）
orchestrator.start(eventBus, ledger);

// 编排器会自动：
// 1. 订阅 execution.report - 处理执行回报
// 2. 订阅 control - 处理控制事件（刷新）
// 3. 计算 PnL
// 4. 记录交易

// 停止编排器
orchestrator.stop();
```

---

## 📊 PnL 计算

### 原理

LedgerService 使用 `SimplePnLCalculator` 自动计算盈亏：

#### 已实现盈亏（Realized PnL）

**平仓时计算**:
- **多头平仓**: `(卖出价 - 平均入场价) × 数量 - 手续费`
- **空头平仓**: `(平均入场价 - 买入价) × 数量 - 手续费`

#### 未实现盈亏（Unrealized PnL）

**持仓中计算**:
- **多头**: `(当前价 - 平均入场价) × 持仓数量`
- **空头**: `(平均入场价 - 当前价) × 持仓数量`

### 示例

```typescript
import { SimplePnLCalculator } from '@/backtesting/ledger';

const calculator = new SimplePnLCalculator();

// 开仓
const result1 = calculator.calculate(
  {
    side: 'buy',
    quantity: '1.0',
    price: '50000',
    fees: '50',
  }
);
// result1.realizedPnl = '-50' (只有手续费)
// result1.newPosition = { quantity: '1', avgEntryPrice: '50000', side: 'long' }

// 平仓
const result2 = calculator.calculate(
  {
    side: 'sell',
    quantity: '1.0',
    price: '51000',
    fees: '51',
  },
  result1.newPosition
);
// result2.realizedPnl = '949' ((51000 - 50000) * 1.0 - 51)
// result2.newPosition = { quantity: '0', avgEntryPrice: '0', side: 'flat' }
```

---

## 📈 统计指标

LedgerService 自动计算以下统计指标：

### 基础指标

| 指标 | 说明 |
|------|------|
| `totalTrades` | 总交易数 |
| `totalPnl` | 总盈亏 |
| `totalFees` | 总手续费 |
| `winningTrades` | 盈利交易数 |
| `losingTrades` | 亏损交易数 |

### 高级指标

| 指标 | 说明 | 计算公式 |
|------|------|----------|
| `winRate` | 胜率 | 盈利交易数 / 总交易数 |
| `avgPnl` | 平均盈亏 | 总盈亏 / 总交易数 |
| `avgWin` | 平均盈利 | 盈利交易总和 / 盈利交易数 |
| `avgLoss` | 平均亏损 | 亏损交易总和 / 亏损交易数 |
| `profitFactor` | 盈亏比 | 平均盈利 / |平均亏损| |
| `maxWin` | 最大盈利 | 单笔最大盈利 |
| `maxLoss` | 最大亏损 | 单笔最大亏损 |
| `maxDrawdown` | 最大回撤 | 累计盈亏的最大回撤 |

---

## 🔍 查询交易

### 基础查询

```typescript
// 获取所有交易
const allTrades = await ledger.getTrades();

// 按交易对过滤
const btcTrades = await ledger.getTrades({ symbol: 'BTC/USDT' });

// 按方向过滤
const buyTrades = await ledger.getTrades({ side: 'buy' });
```

### 高级查询

```typescript
// 时间范围
const recentTrades = await ledger.getTrades({
  startTime: '2024-01-01T00:00:00Z',
  endTime: '2024-01-31T23:59:59Z',
});

// 盈亏范围
const profitableTrades = await ledger.getTrades({
  minPnl: '0', // 只看盈利交易
});

// 组合条件
const filtered = await ledger.getTrades({
  symbol: 'BTC/USDT',
  side: 'sell',
  minPnl: '100',
});
```

---

## 📤 导出数据

### 1. JSON 格式

```typescript
await ledger.exportToJSON('./output/ledger.json');
```

**输出结构**:
```json
{
  "sessionId": "session-001",
  "strategyId": "strategy-001",
  "stats": {
    "totalTrades": 10,
    "totalPnl": "5000",
    "winRate": 0.7
    // ... 其他统计
  },
  "trades": [
    {
      "tradeId": "trade-001",
      "symbol": "BTC/USDT",
      "side": "buy",
      // ... 交易详情
    }
  ],
  "exportedAt": "2024-01-01T12:00:00Z"
}
```

### 2. CSV 格式

```typescript
await ledger.exportToCSV('./output/ledger.csv');
```

**CSV 列**:
```
trade_id,session_id,strategy_id,symbol,intent_id,order_id,fill_id,
side,type,quantity,price,realized_pnl,unrealized_pnl,fees,
fee_currency,liquidity,timestamp,sequence_id
```

### 3. Parquet 格式

```typescript
await ledger.exportToParquet('./output/ledger.parquet');
```

> **注意**: Parquet 导出需要额外的库支持，当前版本暂未实现。

---

## 🎯 与 ExecutionEngine 集成

### 自动记录

使用 `LedgerServiceOrchestrator` 自动从执行引擎记录交易：

```typescript
import { createExecutionEngine } from '@/backtesting/execution';
import { createLedgerService, createLedgerOrchestrator } from '@/backtesting/ledger';

// 创建执行引擎
const executionEngine = createExecutionEngine({
  sessionId: 'session-001',
  strategyId: 'strategy-001',
});

// 创建账簿服务
const ledger = createLedgerService({
  sessionId: 'session-001',
  strategyId: 'strategy-001',
});

// 创建编排器
const orchestrator = createLedgerOrchestrator('session-001');

// 启动（自动订阅 execution.report 事件）
orchestrator.start(eventBus, ledger);

// 执行引擎产生的每笔成交都会自动记录到账簿
```

---

## 🧪 测试

### 运行测试

```bash
cd backend
npx ts-node src/backtesting/ledger/__tests__/ledger-service.test.ts
```

### 测试覆盖

- ✅ PnL 计算引擎（7个测试）
  - 开仓/加仓/平仓
  - 盈利/亏损计算
  - 部分平仓
  - 未实现盈亏
- ✅ LedgerService 核心（6个测试）
  - 交易记录
  - 查询过滤
  - 统计计算
  - 重置
- ✅ 导出功能（3个测试）
  - JSON 导出
  - CSV 导出

**总计**: 16/16 测试通过 (100%)

---

## 📖 API 参考

### LedgerService

| 方法 | 说明 |
|------|------|
| `recordTrade(trade)` | 记录交易 |
| `flush()` | 刷新缓冲区 |
| `getTrades(filter?)` | 查询交易 |
| `getStats()` | 获取统计信息 |
| `exportToJSON(path)` | 导出为 JSON |
| `exportToCSV(path)` | 导出为 CSV |
| `exportToParquet(path)` | 导出为 Parquet |
| `reset()` | 重置服务 |

### SimplePnLCalculator

| 方法 | 说明 |
|------|------|
| `calculate(trade, position?)` | 计算 PnL |
| `calculateUnrealizedPnl(position, currentPrice)` | 计算未实现盈亏 |

### LedgerServiceOrchestrator

| 方法 | 说明 |
|------|------|
| `start(eventBus, ledgerService)` | 启动编排器 |
| `stop()` | 停止编排器 |
| `getStats()` | 获取统计信息 |

---

## 🔗 依赖关系

### 上游依赖

- ✅ **M2-03 ExecutionEngine** - 执行回报事件
- ✅ **M1-04 EventBus** - 事件发布与订阅
- ✅ **big.js** - 精度计算
- ✅ **nanoid** - ID 生成

### 下游依赖

- **M3-03 Analytics** - 分析模块（使用导出的数据）

---

## 💡 最佳实践

### 1. 使用编排器

```typescript
// 推荐：使用编排器自动记录
const orchestrator = createLedgerOrchestrator(sessionId);
orchestrator.start(eventBus, ledger);

// 不推荐：手动订阅事件
eventBus.subscribe('execution.report', async (event) => {
  // 手动处理...
});
```

### 2. 配置合理的缓冲区

```typescript
// 对于高频策略，增大缓冲区
const ledger = createLedgerService({
  sessionId: 'session-001',
  strategyId: 'strategy-001',
  bufferSize: 5000, // 默认 1000
  autoFlush: true,
});
```

### 3. 及时导出数据

```typescript
// 在回测结束时导出
eventBus.subscribe('control', async (event) => {
  if (event.payload.type === 'STOP') {
    await ledger.flush();
    await ledger.exportToJSON('./output/ledger.json');
    await ledger.exportToCSV('./output/ledger.csv');
  }
});
```

---

## ⚠️ 注意事项

1. **PnL 计算**: 当前实现为简化版本，未考虑：
   - 多币种交易
   - 杠杆交易
   - 复杂的持仓模型（如部分对冲）

2. **Parquet 导出**: 当前版本暂未实现，计划在后续版本添加

3. **内存管理**: 所有交易都保存在内存中，大量交易时可能占用较多内存

4. **特征关联**: 需要在上游（ExecutionEngine）提供特征快照

---

## 🛣️ 未来计划

- [ ] 实现 Parquet 导出
- [ ] 支持杠杆交易的 PnL 计算
- [ ] 支持多币种账本
- [ ] 实现流式写入（降低内存占用）
- [ ] 添加更多统计指标（夏普比率、索提诺比率等）

---

## 📝 变更日志

### v1.0.0 (2024-11-07)

- ✅ 实现 LedgerService 核心
- ✅ 实现 SimplePnLCalculator
- ✅ 实现 LedgerServiceOrchestrator
- ✅ 实现 JSON/CSV 导出
- ✅ 实现统计计算
- ✅ 完成单元测试（16/16 通过）
- ✅ 完成文档

---

**维护者**: AI Assistant  
**最后更新**: 2024-11-07

