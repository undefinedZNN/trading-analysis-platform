# M3-02: Snapshot/Resume Coordination 快照与恢复协调

**任务ID**: M3-02  
**里程碑**: M3 - 编排、快照/恢复与结果交付  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 8天  
**优先级**: 🔥 高  
**依赖**: M3-01

---

## 📋 任务概述

实现跨模块的快照与恢复协调机制，确保所有模块（策略、执行、风控、数据）状态一致性。

## 🎯 核心目标

1. **协调机制** - 统一触发各模块的快照生成
2. **状态聚合** - 汇总所有模块的快照数据
3. **恢复流程** - 按正确顺序恢复各模块状态
4. **版本管理** - 支持多版本快照

## 📐 设计要求

### 快照结构

```typescript
interface SessionSnapshot {
  meta: {
    sessionId: string;
    checkpointId: string;
    createdAt: string;
    status: SessionStatus;
    sequenceId: string;
  };
  modules: {
    strategy: StrategySnapshot;
    execution: ExecutionSnapshot;
    risk: RiskSnapshot;
    data?: DataSnapshot;
  };
  eventStoreCheckpoint: CheckpointSnapshot;
}
```

### 快照协调器

```typescript
interface SnapshotCoordinator {
  createSnapshot(session: Session, reason?: string): Promise<SessionSnapshot>;
  restoreSnapshot(session: Session, snapshot: SessionSnapshot): Promise<void>;
  saveSnapshot(snapshot: SessionSnapshot, path: string): Promise<void>;
  loadSnapshot(checkpointId: string): Promise<SessionSnapshot>;
}
```

## 📦 交付物清单

- [ ] **设计文档**
- [ ] **实现代码**
- [ ] **操作手册**
- [ ] **测试**
  - SnapshotResume 端到端测试

---

**创建时间**: 2025-11-07

