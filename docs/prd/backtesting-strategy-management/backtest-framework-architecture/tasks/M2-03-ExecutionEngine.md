# M2-03: ExecutionEngine 执行撮合引擎

**任务ID**: M2-03  
**里程碑**: M2 - 策略沙箱、风控与执行撮合  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 12天  
**优先级**: 🔥 高  
**依赖**: M1-04 (EventBus)

---

## 📋 任务概述

实现模拟订单簿和撮合引擎，处理市价、限价、止损等订单类型，模拟滑点和手续费，生成执行回报和仓位更新事件。

## 🎯 核心目标

1. **订单生命周期管理** - 跟踪订单从创建到完成的全过程
2. **撮合逻辑** - 模拟真实市场的订单成交
3. **滑点和手续费** - 支持可配置的成本模型
4. **TIF 支持** - 实现 GTC/IOC/FOK 等时间有效性规则
5. **快照恢复** - 支持执行状态的序列化

## 📐 设计要求

### 核心接口

```typescript
interface ExecutionEngine {
  // 提交订单
  submit(intent: OrderIntentPayload): Promise<string>; // 返回 orderId
  
  // 撤单
  cancel(orderId: string, reason?: string): Promise<void>;
  
  // 处理行情（触发撮合）
  processBars(bars: BarEvent[]): Promise<void>;
  
  // 查询订单
  getOrder(orderId: string): OrderEntry | undefined;
  getActiveOrders(): OrderEntry[];
  
  // 快照
  createSnapshot(): ExecutionSnapshot;
  restoreSnapshot(snapshot: ExecutionSnapshot): void;
}

type OrderStatus =
  | 'pending'
  | 'new'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired';

interface OrderEntry {
  orderId: string;
  intentId: string;
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop-limit';
  tif: 'GTC' | 'IOC' | 'FOK';
  limitPrice?: string;
  stopPrice?: string;
  quantity: string;
  remaining: string;
  createdAt: string;
  status: OrderStatus;
  fills: ExecutionFill[];
  metadata?: Record<string, unknown>;
}

interface ExecutionFill {
  fillId: string;
  quantity: string;
  price: string;
  fee?: { amount: string; asset: string };
  liquidity: 'maker' | 'taker';
  timestamp: string;
}
```

### 撮合策略

```typescript
interface MatchingEngine {
  match(order: OrderEntry, bar: BarEvent): MatchResult | null;
}

interface MatchResult {
  fillQuantity: string;
  fillPrice: string;
  liquidity: 'maker' | 'taker';
  timestamp: string;
}

// 市价单撮合
class MarketOrderMatcher implements MatchingEngine {
  constructor(private config: { fillPolicy: 'open' | 'close' | 'mid' }) {}
  
  match(order: OrderEntry, bar: BarEvent): MatchResult {
    const fillPrice = this.getFillPrice(bar);
    return {
      fillQuantity: order.remaining,
      fillPrice,
      liquidity: 'taker',
      timestamp: bar.timestamp
    };
  }
  
  private getFillPrice(bar: BarEvent): string {
    switch (this.config.fillPolicy) {
      case 'open':
        return bar.open;
      case 'close':
        return bar.close;
      case 'mid':
        return new Big(bar.high).plus(bar.low).div(2).toFixed();
    }
  }
}

// 限价单撮合
class LimitOrderMatcher implements MatchingEngine {
  match(order: OrderEntry, bar: BarEvent): MatchResult | null {
    const limitPrice = new Big(order.limitPrice!);
    const high = new Big(bar.high);
    const low = new Big(bar.low);
    
    // 买单：限价 >= 最低价
    if (order.side === 'buy' && limitPrice.gte(low)) {
      return {
        fillQuantity: order.remaining,
        fillPrice: order.limitPrice!,
        liquidity: 'maker',
        timestamp: bar.timestamp
      };
    }
    
    // 卖单：限价 <= 最高价
    if (order.side === 'sell' && limitPrice.lte(high)) {
      return {
        fillQuantity: order.remaining,
        fillPrice: order.limitPrice!,
        liquidity: 'maker',
        timestamp: bar.timestamp
      };
    }
    
    return null; // 未触及
  }
}
```

### 滑点和手续费模型

```typescript
interface SlippageModel {
  apply(input: {
    basePrice: string;
    side: 'buy' | 'sell';
    quantity: string;
    liquidity: 'maker' | 'taker';
  }): string; // 返回调整后的价格
}

interface FeeModel {
  compute(input: {
    price: string;
    quantity: string;
    side: 'buy' | 'sell';
    liquidity: 'maker' | 'taker';
  }): { amount: string; asset: string };
}

// 固定点差滑点模型
class FixedSpreadSlippage implements SlippageModel {
  constructor(private bps: number) {} // 基点
  
  apply(input: { basePrice: string; side: 'buy' | 'sell' }): string {
    const price = new Big(input.basePrice);
    const slippage = price.times(this.bps).div(10000);
    
    if (input.side === 'buy') {
      return price.plus(slippage).toFixed();
    } else {
      return price.minus(slippage).toFixed();
    }
  }
}

// 固定费率手续费模型
class FixedRateFee implements FeeModel {
  constructor(
    private makerRate: number,
    private takerRate: number
  ) {}
  
  compute(input: {
    price: string;
    quantity: string;
    liquidity: 'maker' | 'taker';
  }): { amount: string; asset: string } {
    const notional = new Big(input.price).times(input.quantity);
    const rate = input.liquidity === 'maker' ? this.makerRate : this.takerRate;
    const fee = notional.times(rate);
    
    return {
      amount: fee.toFixed(),
      asset: 'USDT'
    };
  }
}
```

## 🔧 实现要点

### 1. 执行引擎核心

```typescript
class ExecutionEngineImpl implements ExecutionEngine {
  private orders = new Map<string, OrderEntry>();
  private activeOrders = new Set<string>();
  private portfolioStore: PortfolioStore;
  
  async submit(intent: OrderIntentPayload): Promise<string> {
    // 1. 创建订单
    const order: OrderEntry = {
      orderId: generateId(),
      intentId: intent.clientOrderId || generateId(),
      strategyId: intent.strategyId,
      symbol: intent.symbol,
      side: intent.side,
      type: intent.type,
      tif: intent.tif || 'GTC',
      limitPrice: intent.price,
      quantity: intent.quantity,
      remaining: intent.quantity,
      createdAt: new Date().toISOString(),
      status: 'new',
      fills: []
    };
    
    // 2. 存储订单
    this.orders.set(order.orderId, order);
    this.activeOrders.add(order.orderId);
    
    // 3. 发布执行回报
    this.publishExecutionReport(order);
    
    // 4. 如果是市价单，立即尝试撮合
    if (order.type === 'market' && this.latestBar) {
      await this.tryMatch(order, this.latestBar);
    }
    
    return order.orderId;
  }
  
  async processBars(bars: BarEvent[]): Promise<void> {
    for (const bar of bars) {
      this.latestBar = bar;
      
      // 对所有活跃订单尝试撮合
      for (const orderId of this.activeOrders) {
        const order = this.orders.get(orderId)!;
        await this.tryMatch(order, bar);
      }
    }
  }
  
  private async tryMatch(order: OrderEntry, bar: BarEvent): Promise<void> {
    // 1. 选择匹配引擎
    const matcher = this.getMatcherForOrder(order);
    
    // 2. 尝试撮合
    const match = matcher.match(order, bar);
    if (!match) return;
    
    // 3. 应用滑点
    const fillPrice = this.slippageModel.apply({
      basePrice: match.fillPrice,
      side: order.side,
      quantity: match.fillQuantity,
      liquidity: match.liquidity
    });
    
    // 4. 计算手续费
    const fee = this.feeModel.compute({
      price: fillPrice,
      quantity: match.fillQuantity,
      side: order.side,
      liquidity: match.liquidity
    });
    
    // 5. 创建成交记录
    const fill: ExecutionFill = {
      fillId: generateId(),
      quantity: match.fillQuantity,
      price: fillPrice,
      fee,
      liquidity: match.liquidity,
      timestamp: bar.timestamp
    };
    
    order.fills.push(fill);
    
    // 6. 更新剩余数量
    order.remaining = new Big(order.remaining).minus(fill.quantity).toFixed();
    
    // 7. 更新状态
    if (new Big(order.remaining).eq(0)) {
      order.status = 'filled';
      this.activeOrders.delete(order.orderId);
    } else {
      order.status = 'partially_filled';
      
      // 检查 TIF
      if (order.tif === 'IOC') {
        this.cancel(order.orderId, 'IOC not fully filled');
      } else if (order.tif === 'FOK' && order.fills.length === 1) {
        // FOK 第一次未完全成交，取消
        this.cancel(order.orderId, 'FOK not fully filled');
        return;
      }
    }
    
    // 8. 发布执行回报
    this.publishExecutionReport(order);
    
    // 9. 更新仓位
    this.updatePosition(order, fill);
    
    // 10. 记录到账簿
    this.publishLedgerRecord(order, fill);
  }
  
  private updatePosition(order: OrderEntry, fill: ExecutionFill): void {
    const position = this.portfolioStore.getPosition(order.strategyId, order.symbol) || {
      symbol: order.symbol,
      side: order.side === 'buy' ? 'long' : 'short',
      quantity: '0',
      avgEntryPrice: '0',
      unrealizedPnl: '0',
      realizedPnl: '0'
    };
    
    // 更新仓位（简化版，实际需要更复杂的逻辑）
    const qty = new Big(position.quantity);
    const fillQty = new Big(fill.quantity);
    
    if (order.side === 'buy') {
      position.quantity = qty.plus(fillQty).toFixed();
    } else {
      position.quantity = qty.minus(fillQty).toFixed();
    }
    
    // 计算 PnL...
    
    this.portfolioStore.updatePosition(order.strategyId, position);
    
    // 发布仓位更新事件
    this.publishPortfolioUpdate(order.strategyId);
  }
}
```

### 2. 事件订阅

```typescript
class ExecutionEngineOrchestrator {
  start(eventBus: EventBus, executionEngine: ExecutionEngine): void {
    // 订阅风控决策（approve 的订单）
    eventBus.subscribe('risk.decision', async (event) => {
      if (event.payload.decision === 'approve') {
        // 从原始 intent 重建订单并提交
        const intent = this.getOriginalIntent(event.payload.intentId);
        await executionEngine.submit(intent);
      } else if (event.payload.decision === 'modify') {
        // 提交修改后的订单
        const modifiedIntent = {
          ...this.getOriginalIntent(event.payload.intentId),
          ...event.payload.modifications
        };
        await executionEngine.submit(modifiedIntent);
      }
    });
    
    // 订阅行情（触发撮合）
    eventBus.subscribe('market.bar', async (event) => {
      await executionEngine.processBars([event.payload.bar]);
    });
  }
}
```

## 📦 交付物清单

### 必需交付物

- [ ] **设计文档** (`docs/design/execution-engine-design.md`)
- [ ] **接口定义** (`backend/src/backtesting/execution/interfaces.ts`)
- [ ] **实现代码**
  - 执行引擎核心 (`backend/src/backtesting/execution/engine.ts`)
  - 撮合引擎 (`backend/src/backtesting/execution/matchers/`)
  - 滑点模型 (`backend/src/backtesting/execution/models/slippage.ts`)
  - 手续费模型 (`backend/src/backtesting/execution/models/fees.ts`)
  - 仓位管理 (`backend/src/backtesting/execution/portfolio-store.ts`)
- [ ] **模块 README**

### 测试要求

- [ ] **单元测试**
  - 覆盖率要求：≥ 85%
- [ ] **集成测试**
  - order lifecycle → ledger 对齐测试

## ✅ 验收标准

1. ✅ 市价单和限价单正确撮合
2. ✅ 滑点和手续费计算准确
3. ✅ TIF 规则正确实现
4. ✅ 执行回报和仓位更新事件正确发布

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07

