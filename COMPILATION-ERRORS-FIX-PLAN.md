# 编译错误修复任务计划

## 📊 当前状态

- **总错误数**: 53个
- **已修复**: 400个 (88.3%)
- **剩余**: 53个 (11.7%)

## 📋 任务拆解

### 阶段1: Events模块修复 (21个错误) - 预计2小时

#### 任务1.1: 修复 events/bus.ts (21个错误) ⚡ 优先级: 高
**文件**: `backend/src/backtesting/events/bus.ts`

**错误分类**:
1. **RxJS操作符参数不匹配** (10个错误)
   - Line 356-357: `mergeMap`, `catchError` 参数数量
   - Line 370-371: 同上
   - Line 383-384: 同上
   - Line 396-397: 同上
   - Line 409-410: 同上

2. **类型转换错误** (5个错误)
   - Line 235: `unknown` → `string`
   - Line 241: `unknown` → `number`
   - Line 255: `BaseEvent<unknown>` → `RecordedEvent`
   - Line 343: `BaseEvent.type` 不存在
   - Line 348: Observable类型不匹配

3. **接口不匹配** (4个错误)
   - Line 336: `subscribe` 方法签名
   - Line 345: 操作符类型不匹配
   - Line 420: `EventStore.clear()` 不存在
   - Line 433: `EventStore.checkpoint()` 不存在

4. **配置属性缺失** (2个错误)
   - Line 467: `EventBusConfig.sessionId` 不存在
   - Line 473: 空对象 vs `Record<EventType, number>`

**修复步骤**:
```typescript
// Step 1: 修复 RxJS 操作符 (10个错误)
// 更新为 RxJS 7+ 语法
mergeMap((event) => handler(event))  // 添加箭头函数包装

// Step 2: 添加类型转换 (5个错误)
const sessionId = payload.sessionId as string;
const seq = payload.sequenceId as number;
store.append(event as RecordedEvent);

// Step 3: 修复接口定义 (4个错误)
// 在 EventStore 接口中添加方法
interface EventStore {
  clear(): void;
  checkpoint(id: string): CheckpointMeta;
}

// Step 4: 添加配置属性 (2个错误)
interface EventBusConfig {
  sessionId?: string;
}
```

**预计时间**: 1小时
**风险**: 低 - 主要是语法修复

---

#### 任务1.2: 修复 events/store.ts (8个错误) ⚡ 优先级: 高
**文件**: `backend/src/backtesting/events/store.ts`

**错误分类**:
1. **接口实现不匹配** (3个错误)
   - Line 148: `append` 方法签名 (同步 vs 异步)
   - Line 307: `loadCheckpoint` 方法签名
   - Line 332: `listCheckpoints` 方法签名

2. **属性不存在** (3个错误)
   - Line 152: `RecordedEvent.eventId`
   - Line 166-168: 类型不匹配
   - Line 248: `CheckpointSnapshot.checkpointId`

3. **类型不匹配** (2个错误)
   - Line 259: 对象字面量
   - Line 333: 返回类型不匹配

**修复策略**:
```typescript
// 方案A: 修改接口为同步 (推荐)
interface EventStore {
  append(event: RecordedEvent): void;  // 移除 Promise
  loadCheckpoint(id: string): CheckpointSnapshot;  // 移除 Promise
  listCheckpoints(sessionId?: string): CheckpointMeta[];  // 移除 Promise
}

// 方案B: 修改实现为异步
class EventStore {
  async append(event: RecordedEvent): Promise<void> { ... }
  async loadCheckpoint(id: string): Promise<CheckpointSnapshot> { ... }
  async listCheckpoints(sessionId?: string): Promise<CheckpointMeta[]> { ... }
}
```

**推荐**: 方案A - 修改接口为同步,因为当前实现是同步的

**预计时间**: 30分钟
**风险**: 中 - 可能影响其他使用 EventStore 的地方

---

#### 任务1.3: 修复 events/state-machine.ts (1个错误) ⚡ 优先级: 低
**文件**: `backend/src/backtesting/events/state-machine.ts`

**错误**:
- Line 31: `ReadonlyMap` 类型定义过长

**修复**:
```typescript
// 拆分类型定义
type TransitionMap = Map<RunStatus, Set<RunStatus>>;
private readonly transitions: ReadonlyMap<RunStatus, ReadonlySet<RunStatus>>;
```

**预计时间**: 5分钟
**风险**: 无

---

### 阶段2: Orchestrator模块修复 (23个错误) - 预计2.5小时

#### 任务2.1: 修复模块导出冲突 (4个错误) ⚡ 优先级: 高
**文件**: `backend/src/backtesting/orchestrator/index.ts`

**错误**: Line 27 - 重复导出
- `SessionSnapshot`
- `SnapshotNotFoundError`
- `SnapshotCoordinator`
- `SnapshotManagerConfig`

**修复**:
```typescript
// 方案A: 显式导出,避免冲突
export { 
  SessionSnapshot as OrchestratorSessionSnapshot,
  SnapshotNotFoundError as OrchestratorSnapshotNotFoundError 
} from './interfaces/orchestrator';

// 方案B: 只导出一个来源
// export * from './interfaces/orchestrator';
// 不导出 './snapshot' 中的重复项
```

**预计时间**: 20分钟
**风险**: 中 - 可能需要更新导入语句

---

#### 任务2.2: 修复 snapshot 接口错误 (3个错误) ⚡ 优先级: 中
**文件**: `backend/src/backtesting/orchestrator/interfaces/snapshot.ts`

**错误**: Error类缺少 `cause` 属性
- Line 392: `SnapshotSerializationError`
- Line 405: `SnapshotRestoreError`
- Line 418: `SnapshotStorageError`

**修复**:
```typescript
export class SnapshotSerializationError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error  // 添加 cause 属性
  ) {
    super(message);
    this.name = 'SnapshotSerializationError';
  }
}
```

**预计时间**: 15分钟
**风险**: 无

---

#### 任务2.3: 修复 snapshot-manager.ts (4个错误) ⚡ 优先级: 中
**文件**: `backend/src/backtesting/orchestrator/snapshot/snapshot-manager.ts`

**错误**:
1. Line 13: 导入 `ModuleSnapshot` 不存在
2. Line 243: 参数数量不匹配
3. Line 315: 属性访问错误
4. Line 334: 属性访问错误

**修复步骤**:
```typescript
// Step 1: 移除或修复导入
// import { ModuleSnapshot } from '../interfaces/snapshot';  // 删除或修复

// Step 2: 修复方法调用
await this.storage.cleanup(sessionId);  // 添加缺失的参数

// Step 3: 修复属性访问
return await this.storage.getStats(sessionId);  // 确保方法存在
```

**预计时间**: 30分钟
**风险**: 中 - 需要检查接口定义

---

#### 任务2.4: 修复 file-storage.ts (4个错误) ⚡ 优先级: 中
**文件**: `backend/src/backtesting/orchestrator/snapshot/file-storage.ts`

**错误**:
1. Line 101: `save` 方法签名不匹配
2. Line 176: `delete` 方法签名不匹配
3. Line 396: `SnapshotMeta.tags` 属性不存在

**修复**:
```typescript
// 在 SnapshotMeta 接口中添加 tags
interface SnapshotMeta {
  // ... 其他属性
  tags?: string[];  // 添加
}

// 修复方法签名
async save(snapshot: SessionSnapshot): Promise<void> { ... }
async delete(snapshotId: string): Promise<void> { ... }
```

**预计时间**: 30分钟
**风险**: 低

---

#### 任务2.5: 修复 json-serializer.ts (2个错误) ⚡ 优先级: 低
**文件**: `backend/src/backtesting/orchestrator/snapshot/json-serializer.ts`

**错误**:
1. Line 129: `compress` 方法签名不匹配
2. Line 153: `decompress` 方法签名不匹配

**修复**: 统一方法签名为异步或同步

**预计时间**: 15分钟
**风险**: 低

---

#### 任务2.6: 修复 orchestrator.ts (4个错误) ⚡ 优先级: 中
**文件**: `backend/src/backtesting/orchestrator/orchestrator/orchestrator.ts`

**错误**:
1. Line 230: `Session.getState` 不存在,应为 `getStats`
2. Line 255-257: 类型转换错误

**修复**:
```typescript
// Line 230: 修复方法名
const stats = session.getStats();  // 不是 getState

// Line 255-257: 添加类型转换
totalEvents: stats.totalEvents as number,
processedEvents: stats.processedEvents as number,
errorCount: stats.errorCount as number,
```

**预计时间**: 20分钟
**风险**: 低

---

#### 任务2.7: 修复 module-coordinator.ts (1个错误) ⚡ 优先级: 低
**文件**: `backend/src/backtesting/orchestrator/orchestrator/module-coordinator.ts`

**错误**: Line 44 - `BacktestSessionConfig.timeframe` 不存在

**修复**:
```typescript
// 在 BacktestSessionConfig 接口中添加
interface BacktestSessionConfig {
  // ... 其他属性
  timeframe?: string;  // 添加
}
```

**预计时间**: 10分钟
**风险**: 无

---

## 📅 执行计划

### 第1天 (2-3小时)
- ✅ **阶段1**: Events模块修复
  - 任务1.1: events/bus.ts (1小时)
  - 任务1.2: events/store.ts (30分钟)
  - 任务1.3: events/state-machine.ts (5分钟)
  - 验证和测试 (30分钟)

### 第2天 (2-3小时)
- ✅ **阶段2**: Orchestrator模块修复
  - 任务2.1: 模块导出冲突 (20分钟)
  - 任务2.2: snapshot接口 (15分钟)
  - 任务2.3: snapshot-manager (30分钟)
  - 任务2.4: file-storage (30分钟)
  - 任务2.5: json-serializer (15分钟)
  - 任务2.6: orchestrator (20分钟)
  - 任务2.7: module-coordinator (10分钟)
  - 验证和测试 (30分钟)

## 🎯 成功标准

1. ✅ 所有53个编译错误修复完成
2. ✅ `npm run build` 成功
3. ✅ 服务正常启动和运行
4. ✅ 所有API功能正常
5. ✅ 无新增错误

## ⚠️ 风险评估

| 风险等级 | 任务数 | 说明 |
|---------|--------|------|
| 🟢 低 | 7 | 简单的语法修复,不影响逻辑 |
| 🟡 中 | 5 | 接口修改,可能影响其他模块 |
| 🔴 高 | 0 | 无高风险任务 |

## 📝 注意事项

1. **每完成一个任务后立即验证**
   ```bash
   npm run build
   curl http://localhost:3000/api/v1/backtesting/health
   ```

2. **保持向后兼容**
   - 接口修改时考虑现有代码
   - 添加可选属性而不是必需属性

3. **测试覆盖**
   - 修复后运行相关测试
   - 确保核心功能不受影响

4. **文档更新**
   - 更新接口文档
   - 记录重要的修改

## 🚀 开始执行

准备好了吗?让我们从**任务1.1: 修复 events/bus.ts**开始!

---

**创建时间**: 2025-11-09  
**预计完成**: 2天 (4-6小时)  
**当前进度**: 0/53 (0%)

