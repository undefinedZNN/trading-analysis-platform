# Frontend API集成更新计划

**开始时间**: 2025-11-22  
**预计完成**: 1天  
**状态**: 🚀 进行中

---

## 📋 更新任务清单

### Phase 1: API Client迁移（上午）

#### 1. 创建统一的API适配器 ✅ 进行中

**目标**: 创建一个适配器，桥接旧API和新API Client

**文件**: `frontend/src/api/tasks-adapter.ts`

**功能**:
- 使用新的API Client（`api/client.ts`）
- 保持旧的接口签名（向后兼容）
- 添加新功能（暂停/恢复/统计）
- 统一错误处理

#### 2. 更新TaskListPage

**文件**: `BacktestTaskListPage.tsx`

**修改**:
- 导入新的API适配器
- 添加统计卡片组件
- 测试所有功能

#### 3. 更新TaskCard组件

**文件**: `BacktestTaskCard.tsx`

**修改**:
- 添加暂停按钮（running状态时显示）
- 添加恢复按钮（paused状态时显示）
- 更新状态标签

---

### Phase 2: 新功能集成（下午）

#### 4. 创建统计卡片组件

**文件**: `frontend/src/modules/backtesting/components/TaskStatisticsCards.tsx`

**功能**:
- 显示任务总数
- 显示各状态任务数
- 显示成功率
- 显示平均执行时间

#### 5. 集成实时更新

**功能**:
- 定时刷新运行中的任务
- 乐观更新UI
- WebSocket准备（可选）

#### 6. 错误处理优化

**功能**:
- 统一的错误提示
- 重试机制
- 加载状态优化

---

## 🎯 具体实现计划

### Step 1: 创建API适配器

创建 `frontend/src/api/tasks-adapter.ts`，使用新的API Client，同时保持与旧API兼容的接口。

### Step 2: 创建统计卡片组件

创建 `TaskStatisticsCards.tsx`，展示任务统计信息。

### Step 3: 更新任务卡片

在 `BacktestTaskCard.tsx` 中添加暂停/恢复按钮。

### Step 4: 更新任务列表页面

在 `BacktestTaskListPage.tsx` 中：
- 导入新的API适配器
- 添加统计卡片
- 测试所有功能

### Step 5: 测试和优化

- 测试所有API调用
- 验证错误处理
- 优化用户体验

---

## 📝 兼容性策略

### 向后兼容

为了避免破坏现有代码，我们将：

1. **创建适配器层**
   - 新API Client作为底层
   - 适配器提供旧接口
   - 逐步迁移

2. **保持接口不变**
   - 函数名称不变
   - 参数类型不变
   - 返回值类型兼容

3. **增量更新**
   - 先添加新功能
   - 再优化现有功能
   - 最后清理旧代码

---

## 🔄 迁移对照表

| 旧API方法 | 新API Client方法 | 状态 |
|----------|-----------------|------|
| `listBacktestTasks()` | `apiClient.listTasks()` | ⏳ 待迁移 |
| `createBacktestTask()` | `apiClient.createTask()` | ⏳ 待迁移 |
| `fetchBacktestTask()` | `apiClient.getTask()` | ⏳ 待迁移 |
| `updateBacktestTask()` | `apiClient.updateTask()` | ⏳ 待迁移 |
| `cancelBacktestTask()` | `apiClient.cancelTask()` | ⏳ 待迁移 |
| `retryBacktestTask()` | `apiClient.retryTask()` | ⏳ 待迁移 |
| `deleteBacktestTask()` | `apiClient.deleteTask()` | ⏳ 待迁移 |
| ❌ 不存在 | `apiClient.pauseTask()` | ✨ 新增 |
| ❌ 不存在 | `apiClient.resumeTask()` | ✨ 新增 |
| ❌ 不存在 | `apiClient.getTaskStatistics()` | ✨ 新增 |

---

## ✅ 预期成果

### 功能增强

1. ✅ 所有API使用新Client
2. ✅ 统一的错误处理
3. ✅ 完整的TypeScript类型
4. ✅ 暂停/恢复功能
5. ✅ 任务统计展示

### 代码质量

1. ✅ 类型安全
2. ✅ 代码复用
3. ✅ 易于维护
4. ✅ 向后兼容

### 用户体验

1. ✅ 更好的错误提示
2. ✅ 更多的任务控制
3. ✅ 实时统计信息
4. ✅ 流畅的交互

---

## 📊 进度跟踪

- [ ] Step 1: 创建API适配器
- [ ] Step 2: 创建统计卡片组件
- [ ] Step 3: 更新任务卡片
- [ ] Step 4: 更新任务列表页面
- [ ] Step 5: 测试和优化

**开始时间**: 现在  
**预计完成**: 今天下班前

---

**下一步**: 立即开始 Step 1 - 创建API适配器

