# M2-04: LedgerService 交易账簿服务

**任务ID**: M2-04  
**里程碑**: M2 - 策略沙箱、风控与执行撮合  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 8天  
**优先级**: 🟡 中  
**依赖**: M2-03 (ExecutionEngine)

---

## 📋 任务概述

实现交易账簿服务，记录所有交易明细、PnL、特征上下文等信息，输出供分析模块使用的 Parquet/JSON 结构化文件。

## 🎯 核心目标

1. **交易记录** - 记录每笔成交的完整信息
2. **PnL 计算** - 实时计算已实现和未实现盈亏
3. **特征关联** - 将交易与触发时的特征快照关联
4. **结构化输出** - 导出 Parquet 和 JSON 格式的账簿文件

## 📐 设计要求

### 核心接口

```typescript
interface LedgerService {
  // 记录交易
  recordTrade(trade: TradeRecord): Promise<void>;
  
  // 批量写入
  flush(): Promise<void>;
  
  // 查询
  getTrades(filter: TradeFilter): Promise<TradeRecord[]>;
  getTradeStats(): Promise<TradeStats>;
  
  // 导出
  exportToParquet(outputPath: string): Promise<void>;
  exportToJSON(outputPath: string): Promise<void>;
}

interface TradeRecord {
  tradeId: string;
  sessionId: string;
  strategyId: string;
  symbol: string;
  intentId: string;
  fillId: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  pnl: string;
  fees: string;
  timestamp: string;
  sequenceId: string;
  factors?: Record<string, string | number>;  // 特征快照
  context?: Record<string, unknown>;           // 额外上下文
}

interface TradeStats {
  totalTrades: number;
  totalPnl: string;
  totalFees: string;
  winRate: number;
  avgPnl: string;
  maxDrawdown: string;
}
```

### Parquet Schema

```typescript
const LEDGER_SCHEMA = {
  trade_id: { type: 'UTF8' },
  session_id: { type: 'UTF8' },
  strategy_id: { type: 'UTF8' },
  symbol: { type: 'UTF8' },
  intent_id: { type: 'UTF8' },
  fill_id: { type: 'UTF8' },
  side: { type: 'UTF8' },
  quantity: { type: 'UTF8' },
  price: { type: 'UTF8' },
  pnl: { type: 'UTF8' },
  fees: { type: 'UTF8' },
  timestamp: { type: 'TIMESTAMP_MILLIS' },
  sequence_id: { type: 'UTF8' },
  
  // 特征字段（动态）
  'feature.MA20': { type: 'DOUBLE', optional: true },
  'feature.EMA10': { type: 'DOUBLE', optional: true },
  // ... 其他特征
};
```

## 🔧 实现要点

### 1. 账簿服务实现

```typescript
class LedgerServiceImpl implements LedgerService {
  private buffer: TradeRecord[] = [];
  private parquetWriter?: ParquetWriter;
  
  async recordTrade(trade: TradeRecord): Promise<void> {
    this.buffer.push(trade);
    
    // 定期刷新
    if (this.buffer.length >= 1000) {
      await this.flush();
    }
  }
  
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    // 写入 Parquet
    await this.writeToParquet(this.buffer);
    
    // 清空缓冲
    this.buffer = [];
  }
  
  async exportToParquet(outputPath: string): Promise<void> {
    await this.flush();
    // 已经在 flush 中写入
  }
  
  async exportToJSON(outputPath: string): Promise<void> {
    const trades = await this.getAllTrades();
    await fs.writeFile(
      outputPath,
      JSON.stringify(trades, null, 2)
    );
  }
}
```

### 2. 事件订阅

```typescript
class LedgerServiceOrchestrator {
  start(eventBus: EventBus, ledgerService: LedgerService): void {
    eventBus.subscribe('ledger.record', async (event) => {
      await ledgerService.recordTrade(event.payload);
    });
    
    // 会话结束时刷新
    eventBus.subscribe('control', async (event) => {
      if (event.payload.type === 'STOP') {
        await ledgerService.flush();
      }
    });
  }
}
```

## 📦 交付物清单

### 必需交付物

- [ ] **设计文档**
- [ ] **接口定义**
- [ ] **实现代码**
- [ ] **模块 README**

### 测试要求

- [ ] **单元测试**
- [ ] **集成测试**

## ✅ 验收标准

1. ✅ 交易记录完整且准确
2. ✅ PnL 计算正确
3. ✅ Parquet 文件格式正确
4. ✅ 与执行引擎数据对齐

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07

