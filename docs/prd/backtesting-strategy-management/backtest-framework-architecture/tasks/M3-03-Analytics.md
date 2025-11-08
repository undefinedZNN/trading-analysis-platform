# M3-03: Analytics Output & API 分析输出与 API

**任务ID**: M3-03  
**里程碑**: M3 - 编排、快照/恢复与结果交付  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 6天  
**优先级**: 🟡 中  
**依赖**: M2-04

---

## 📋 任务概述

实现回测结果的导出和查询接口，提供 API 供前端和分析模块访问账簿、featureCatalog、日志等数据。

## 🎯 核心目标

1. **结果导出** - 将账簿、目录、日志导出为 Parquet/JSON
2. **API 接口** - 提供 REST API 查询结果
3. **日志聚合** - 汇总会话期间的所有日志

## 📐 设计要求

### 结果结构

```typescript
interface SessionResults {
  sessionId: string;
  ledger: string;              // Parquet 文件路径
  featureCatalog: string;      // JSON 文件路径
  logs: string;                // 日志文件路径
  metrics: Record<string, number>;
  summary: {
    totalTrades: number;
    totalPnl: string;
    winRate: number;
  };
}
```

### API 端点

```typescript
// GET /sessions/:id/results
// GET /sessions/:id/ledger
// GET /sessions/:id/logs
// GET /sessions/:id/metrics
```

## 📦 交付物清单

- [ ] **API 文档**
- [ ] **实现代码**
- [ ] **模块 README**
- [ ] **测试**

---

**创建时间**: 2025-11-07

