# M3-01: Orchestrator & DI 编排器与依赖注入

**任务ID**: M3-01  
**里程碑**: M3 - 编排、快照/恢复与结果交付  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 10天  
**优先级**: 🔥 高  
**依赖**: M2-01, M2-02

---

## 📋 任务概述

实现编排器，负责配置合并、组件依赖注入、会话状态机管理，提供 CLI/API 接口控制回测会话的生命周期。

## 🎯 核心目标

1. **配置管理** - 合并策略 Manifest、系统默认和用户配置
2. **依赖注入** - 管理所有模块的实例化和依赖关系
3. **状态机** - 控制会话状态转换（idle → running → paused → stopped）
4. **CLI/API** - 提供回测控制接口

## 📐 设计要求

### 配置结构

```typescript
interface BacktestSessionConfig {
  sessionId: string;
  data: DataConfig;
  strategy: StrategyConfig;
  execution: ExecutionConfig;
  risk: RiskConfig;
  analytics?: AnalyticsConfig;
  output?: OutputConfig;
}

interface StrategyConfig {
  strategyId: string;
  scriptContent: string;
  manifest: StrategyManifest;
  parameters?: Record<string, unknown>;
}
```

### 编排器接口

```typescript
interface Orchestrator {
  // 会话管理
  createSession(config: BacktestSessionConfig): Promise<Session>;
  getSession(sessionId: string): Session | undefined;
  listSessions(): Session[];
  
  // 会话控制
  start(sessionId: string): Promise<void>;
  pause(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
  seek(sessionId: string, sequenceId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  
  // 快照
  createSnapshot(sessionId: string, reason?: string): Promise<string>;
  listSnapshots(sessionId: string): Promise<CheckpointMeta[]>;
  restoreSnapshot(sessionId: string, checkpointId: string): Promise<void>;
  
  // 结果
  getResults(sessionId: string): Promise<SessionResults>;
}

interface Session {
  id: string;
  config: BacktestSessionConfig;
  state: SessionState;
  container: ServiceContainer;
}
```

### 依赖注入容器

```typescript
interface ServiceContainer {
  register<T>(token: string, factory: () => T): void;
  register<T>(token: string, instance: T): void;
  resolve<T>(token: string): T;
  has(token: string): boolean;
}
```

## 📦 交付物清单

### 必需交付物

- [ ] **设计文档**
- [ ] **接口定义**
- [ ] **实现代码**
  - 编排器核心
  - 服务容器
  - 配置校验器
  - CLI 入口
- [ ] **CLI 文档**
- [ ] **模块 README**

### 测试要求

- [ ] **单元测试**
- [ ] **集成测试**
  - start→pause→resume→stop 流程

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07

