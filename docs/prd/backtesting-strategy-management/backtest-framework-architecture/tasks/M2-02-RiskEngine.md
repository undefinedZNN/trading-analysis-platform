# M2-02: RiskEngine 风险控制引擎

**任务ID**: M2-02  
**里程碑**: M2 - 策略沙箱、风控与执行撮合  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 10天  
**优先级**: 🔥 高  
**依赖**: M1-04 (EventBus)

---

## 📋 任务概述

实现插件化的风险控制引擎，拦截策略指令并评估是否符合风控规则，支持额度、杠杆、止损止盈等多种规则，输出风控决策事件。

## 🎯 核心目标

1. **规则引擎框架** - 提供可插拔的风控规则接口
2. **默认规则集** - 实现 MaxOrderSize、MaxLeverage、PnLDailyLimit、StopLoss 等内置规则
3. **状态管理** - 维护账户、仓位、损益等风控状态
4. **决策输出** - 生成 approve/reject/modify/halt 决策事件
5. **快照恢复** - 支持风控状态的持久化和恢复

## 📐 设计要求

### 核心接口定义

```typescript
interface RiskEngine {
  // 评估策略指令
  evaluate(intent: OrderIntentPayload): Promise<RiskDecisionResult>;
  
  // 更新状态
  updatePortfolio(update: PortfolioUpdatePayload): void;
  updateExecution(report: ExecutionReportPayload): void;
  
  // 规则管理
  registerRule(rule: RiskRule): void;
  enableRule(ruleId: string): void;
  disableRule(ruleId: string): void;
  
  // 快照
  createSnapshot(): RiskSnapshot;
  restoreSnapshot(snapshot: RiskSnapshot): void;
}

type RiskDecisionType = 'approve' | 'reject' | 'modify' | 'halt';

interface RiskDecisionResult {
  decision: RiskDecisionType;
  modifiedIntent?: Partial<OrderIntentPayload>;
  reason?: { code: string; message: string };
  followUp?: Array<FollowUpAction>;
  ruleId?: string;
  severity?: 'info' | 'warning' | 'critical';
}

interface RiskRule {
  id: string;
  name: string;
  priority: number;              // 数字越小优先级越高
  enabled: boolean;
  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null;
}

interface RiskRuleContext {
  portfolio: PortfolioSnapshot;
  currentIntent: OrderIntentPayload;
  historicalStats: HistoricalStats;
  marketSnapshot?: MarketBarEvent;
  runtimeConfig: RiskRuntimeConfig;
}

interface PortfolioSnapshot {
  balances: Record<string, string>;
  positions: Record<string, PositionSnapshot>;
  equity: string;
  marginUsage: string;
}

interface PositionSnapshot {
  symbol: string;
  side: 'long' | 'short';
  quantity: string;
  avgEntryPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
}

interface HistoricalStats {
  ordersToday: number;
  filledToday: number;
  pnlToday: string;
  cumulativePnl: string;
  maxDrawdown: string;
  lastResetAt: string;
}

interface FollowUpAction {
  type: 'force-close' | 'cancel-order' | 'notify' | 'halt-strategy';
  payload?: Record<string, unknown>;
}
```

### 内置规则定义

#### 1. MaxOrderSizeRule

```typescript
interface MaxOrderSizeParams {
  maxQuantity?: string;
  maxNotional?: string;
  symbols?: string[];
}

class MaxOrderSizeRule implements RiskRule {
  id = 'MaxOrderSizeRule';
  name = '最大订单规模';
  priority = 10;
  
  constructor(private params: MaxOrderSizeParams) {}
  
  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null {
    // 检查标的是否在监控范围
    if (this.params.symbols && !this.params.symbols.includes(ctx.currentIntent.symbol)) {
      return null; // 不处理
    }
    
    // 检查数量
    if (this.params.maxQuantity) {
      const qty = new Big(ctx.currentIntent.quantity);
      if (qty.gt(this.params.maxQuantity)) {
        return {
          decision: 'reject',
          reason: {
            code: 'MAX_ORDER_SIZE_EXCEEDED',
            message: `订单数量 ${qty} 超过限制 ${this.params.maxQuantity}`
          },
          ruleId: this.id,
          severity: 'warning'
        };
      }
    }
    
    // 检查名义价值
    if (this.params.maxNotional && ctx.currentIntent.price) {
      const notional = new Big(ctx.currentIntent.quantity).times(ctx.currentIntent.price);
      if (notional.gt(this.params.maxNotional)) {
        return {
          decision: 'modify',
          modifiedIntent: {
            quantity: new Big(this.params.maxNotional).div(ctx.currentIntent.price).toFixed()
          },
          reason: {
            code: 'MAX_NOTIONAL_EXCEEDED',
            message: `订单名义价值超限，调整至 ${this.params.maxNotional}`
          },
          ruleId: this.id,
          severity: 'info'
        };
      }
    }
    
    return null; // 通过
  }
}
```

#### 2. MaxLeverageRule

```typescript
interface MaxLeverageParams {
  maxLeverage: number;
  maxExposurePerSymbol?: string;
  maxExposureTotal?: string;
}

class MaxLeverageRule implements RiskRule {
  id = 'MaxLeverageRule';
  name = '最大杠杆率';
  priority = 20;
  
  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null {
    // 计算新订单后的杠杆率
    const newLeverage = this.calculateLeverage(ctx);
    
    if (newLeverage > this.params.maxLeverage) {
      return {
        decision: 'reject',
        reason: {
          code: 'MAX_LEVERAGE_EXCEEDED',
          message: `杠杆率 ${newLeverage.toFixed(2)} 超过限制 ${this.params.maxLeverage}`
        },
        ruleId: this.id,
        severity: 'critical'
      };
    }
    
    return null;
  }
}
```

#### 3. PnLDailyLimitRule

```typescript
interface PnLDailyLimitParams {
  dailyLossLimit: string;
  dailyProfitLock?: string;
  resetAt: string;                // 如 "00:00:00Z"
}

class PnLDailyLimitRule implements RiskRule {
  id = 'PnLDailyLimitRule';
  name = '日内盈亏限制';
  priority = 30;
  
  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null {
    const pnlToday = new Big(ctx.historicalStats.pnlToday);
    
    // 检查亏损限制
    if (pnlToday.lt(this.params.dailyLossLimit)) {
      return {
        decision: 'halt',
        reason: {
          code: 'DAILY_LOSS_LIMIT_REACHED',
          message: `日内亏损 ${pnlToday} 达到限制 ${this.params.dailyLossLimit}`
        },
        followUp: [{
          type: 'halt-strategy',
          payload: { reason: 'daily_loss_limit' }
        }],
        ruleId: this.id,
        severity: 'critical'
      };
    }
    
    // 检查盈利锁定（可选）
    if (this.params.dailyProfitLock && pnlToday.gt(this.params.dailyProfitLock)) {
      return {
        decision: 'reject',
        reason: {
          code: 'DAILY_PROFIT_LOCKED',
          message: `日内盈利 ${pnlToday} 已锁定`
        },
        ruleId: this.id,
        severity: 'info'
      };
    }
    
    return null;
  }
}
```

#### 4. StopLossRule

```typescript
interface StopLossParams {
  maxDrawdownPct: number;
  forceClose: boolean;
  graceBars?: number;
}

class StopLossRule implements RiskRule {
  id = 'StopLossRule';
  name = '止损规则';
  priority = 40;
  
  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null {
    const maxDrawdown = new Big(ctx.historicalStats.maxDrawdown);
    const threshold = new Big(ctx.portfolio.equity).times(this.params.maxDrawdownPct);
    
    if (maxDrawdown.abs().gt(threshold)) {
      if (this.params.forceClose) {
        return {
          decision: 'halt',
          reason: {
            code: 'STOP_LOSS_TRIGGERED',
            message: `回撤 ${maxDrawdown} 超过阈值 ${threshold}`
          },
          followUp: [{
            type: 'force-close',
            payload: { symbol: ctx.currentIntent.symbol }
          }],
          ruleId: this.id,
          severity: 'critical'
        };
      } else {
        return {
          decision: 'reject',
          reason: {
            code: 'STOP_LOSS_TRIGGERED',
            message: `回撤超限，拒绝新订单`
          },
          ruleId: this.id,
          severity: 'warning'
        };
      }
    }
    
    return null;
  }
}
```

## 🔧 实现要点

### 1. 风控引擎核心

```typescript
class RiskEngineImpl implements RiskEngine {
  private rules: Map<string, RiskRule> = new Map();
  private state: RiskState;
  
  async evaluate(intent: OrderIntentPayload): Promise<RiskDecisionResult> {
    // 1. 构建上下文
    const context = this.buildContext(intent);
    
    // 2. 按优先级排序规则
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    // 3. 依次评估规则
    for (const rule of sortedRules) {
      const result = rule.evaluate(context);
      
      // 如果规则返回决策，立即处理
      if (result && result.decision !== 'approve') {
        // 记录风控事件
        this.logRiskDecision(intent, result);
        return result;
      }
    }
    
    // 4. 所有规则通过
    return {
      decision: 'approve',
      ruleId: 'all-passed',
      severity: 'info'
    };
  }
  
  updatePortfolio(update: PortfolioUpdatePayload): void {
    this.state.portfolio = {
      balances: update.balances,
      positions: this.mapPositions(update.positions),
      equity: update.equity,
      marginUsage: update.marginUsage || '0'
    };
  }
  
  updateExecution(report: ExecutionReportPayload): void {
    // 更新统计数据
    if (report.status === 'filled') {
      this.state.stats.filledToday += 1;
      this.updatePnl(report);
    }
  }
}
```

### 2. 事件订阅

```typescript
class RiskEngineOrchestrator {
  start(eventBus: EventBus, riskEngine: RiskEngine): void {
    // 订阅策略指令
    eventBus.subscribe('strategy.intent', async (event) => {
      const result = await riskEngine.evaluate(event.payload);
      
      // 发布风控决策
      const decision: BaseEvent<RiskDecisionPayload> = {
        eventId: generateId(),
        eventType: 'risk.decision',
        sessionId: event.sessionId,
        sequenceId: '',
        timestamp: new Date().toISOString(),
        source: 'risk-engine',
        payload: {
          strategyId: event.payload.strategyId,
          intentId: event.eventId,
          decision: result.decision,
          modifications: result.modifiedIntent,
          reasons: result.reason ? [result.reason] : []
        }
      };
      
      eventBus.publish(decision);
      
      // 处理后续动作
      if (result.followUp) {
        this.handleFollowUp(result.followUp, eventBus);
      }
    });
    
    // 订阅仓位更新
    eventBus.subscribe('portfolio.update', (event) => {
      riskEngine.updatePortfolio(event.payload);
    });
    
    // 订阅执行回报
    eventBus.subscribe('execution.report', (event) => {
      riskEngine.updateExecution(event.payload);
    });
  }
}
```

## 📦 交付物清单

### 必需交付物

- [ ] **设计文档** (`docs/design/risk-engine-design.md`)
- [ ] **接口定义** (`backend/src/backtesting/risk/interfaces.ts`)
- [ ] **实现代码**
  - 风控引擎核心 (`backend/src/backtesting/risk/engine.ts`)
  - 内置规则 (`backend/src/backtesting/risk/rules/`)
  - 状态管理 (`backend/src/backtesting/risk/state.ts`)
- [ ] **模块 README** (`backend/src/backtesting/risk/README.md`)

### 测试要求

- [ ] **单元测试**
  - 每个规则的单元测试
  - 覆盖率要求：≥ 85%

- [ ] **集成测试**
  - intent→decision 链路测试

## ✅ 验收标准

1. ✅ 所有内置规则正常工作
2. ✅ 决策事件正确发布
3. ✅ 状态更新准确
4. ✅ 快照恢复功能完整

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07

