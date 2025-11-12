# 回测任务管理 - 任务拆分

**文档版本**: 1.0  
**创建时间**: 2025-11-12

---

## 📋 任务拆分总览

本文档详细拆分回测任务管理模块的所有开发任务，包括后端、前端、测试等各个方面。

---

## 1. 数据库层 (7 tasks)

### 1.1 主表设计

#### Task: RT-101 - 创建 backtest_tasks 表
**优先级**: 🔴 高  
**预计时间**: 4小时  
**依赖**: 无

**描述**: 创建回测任务主表的数据库迁移文件

**验收标准**:
- [ ] 迁移文件创建
- [ ] 包含所有必要字段（见REQUIREMENTS.md）
- [ ] 索引创建正确
- [ ] 外键约束正确
- [ ] 迁移可以成功执行和回退

**技术细节**:
```typescript
// 字段列表
- task_id (UUID, PK)
- task_name (VARCHAR(100))
- strategy_id (UUID, FK)
- script_version_id (UUID, FK)
- dataset_id (UUID, FK)
- strategy_params (JSONB)
- execution_config (JSONB)
- data_config (JSONB)
- status (VARCHAR(20))
- progress (INTEGER)
- submitted_at, queued_at, started_at, ended_at (TIMESTAMPTZ)
- result_summary (JSONB)
- error_message (TEXT)
- created_by, updated_by (VARCHAR(64))
- created_at, updated_at (TIMESTAMPTZ)
```

---

#### Task: RT-102 - 创建 task_logs 表
**优先级**: 🔴 高  
**预计时间**: 2小时  
**依赖**: RT-101

**描述**: 创建任务日志表的数据库迁移文件

**验收标准**:
- [ ] 迁移文件创建
- [ ] 包含日志级别、模块、消息等字段
- [ ] 级联删除配置正确
- [ ] 索引优化查询性能

---

#### Task: RT-103 - 创建 task_snapshots 表
**优先级**: 🟡 中  
**预计时间**: 2小时  
**依赖**: RT-101

**描述**: 创建任务快照表的数据库迁移文件

**验收标准**:
- [ ] 迁移文件创建
- [ ] 支持快照数据存储（JSONB）
- [ ] 包含快照类型、原因等字段
- [ ] 级联删除配置正确

---

### 1.2 实体定义

#### Task: RT-104 - 创建 Task 实体
**优先级**: 🔴 高  
**预计时间**: 3小时  
**依赖**: RT-101

**描述**: 创建 BacktestTask 实体和相关 DTO

**验收标准**:
- [ ] 实体类创建 (backtest-task.entity.ts)
- [ ] 关系映射正确（ManyToOne）
- [ ] 字段验证装饰器
- [ ] DTO 创建：
  - CreateBacktestTaskDto
  - UpdateBacktestTaskDto
  - ListBacktestTasksDto
  - BacktestTaskDetailDto

---

#### Task: RT-105 - 创建 TaskLog 实体
**优先级**: 🔴 高  
**预计时间**: 2小时  
**依赖**: RT-102, RT-104

**描述**: 创建 TaskLog 实体和相关 DTO

**验收标准**:
- [ ] 实体类创建
- [ ] 关系映射正确
- [ ] DTO 创建

---

#### Task: RT-106 - 创建 TaskSnapshot 实体
**优先级**: 🟡 中  
**预计时间**: 2小时  
**依赖**: RT-103, RT-104

**描述**: 创建 TaskSnapshot 实体和相关 DTO

**验收标准**:
- [ ] 实体类创建
- [ ] 关系映射正确
- [ ] DTO 创建

---

#### Task: RT-107 - 创建模块和注册实体
**优先级**: 🔴 高  
**预计时间**: 1小时  
**依赖**: RT-104, RT-105, RT-106

**描述**: 创建 BacktestTasksModule 并注册所有实体

**验收标准**:
- [ ] BacktestTasksModule 创建
- [ ] 所有实体注册到 TypeORM
- [ ] 模块导入到 BacktestingModule

---

## 2. 服务层 (10 tasks)

### 2.1 基础服务

#### Task: RT-201 - 实现 TaskService 基础方法
**优先级**: 🔴 高  
**预计时间**: 6小时  
**依赖**: RT-107

**描述**: 实现任务的 CRUD 操作

**验收标准**:
- [ ] listTasks() - 列表查询（分页、筛选）
- [ ] getTaskById() - 获取详情
- [ ] createTask() - 创建任务
- [ ] updateTask() - 更新任务
- [ ] deleteTask() - 删除任务
- [ ] 单元测试覆盖率 > 80%

---

#### Task: RT-202 - 实现任务状态机
**优先级**: 🔴 高  
**预计时间**: 4小时  
**依赖**: RT-201

**描述**: 实现任务状态转换逻辑

**验收标准**:
- [ ] TaskStateMachine 类创建
- [ ] 状态转换验证
- [ ] 状态转换事件发布
- [ ] 单元测试

**技术细节**:
```typescript
enum TaskStatus {
  SUBMITTED = 'submitted',
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// 允许的状态转换
const transitions = {
  submitted: ['queued', 'cancelled'],
  queued: ['running', 'cancelled'],
  running: ['paused', 'completed', 'failed', 'cancelled'],
  paused: ['queued', 'cancelled'],
  // ...
}
```

---

#### Task: RT-203 - 集成 Bull 队列
**优先级**: 🔴 高  
**预计时间**: 6小时  
**依赖**: 无

**描述**: 集成 Bull 队列用于任务调度

**验收标准**:
- [ ] 安装 @nestjs/bull 和 bull
- [ ] 配置 Redis 连接
- [ ] 创建任务队列（backtest-tasks）
- [ ] 实现任务生产者
- [ ] 实现任务消费者
- [ ] 配置并发数和重试策略

**技术细节**:
```typescript
// bull.module.ts
BullModule.forRoot({
  redis: {
    host: 'localhost',
    port: 6379,
  },
}),
BullModule.registerQueue({
  name: 'backtest-tasks',
})
```

---

#### Task: RT-204 - 实现 TaskScheduler
**优先级**: 🔴 高  
**预计时间**: 4小时  
**依赖**: RT-203

**描述**: 实现任务调度服务，负责任务入队

**验收标准**:
- [ ] TaskScheduler 服务创建
- [ ] scheduleTask() - 任务入队
- [ ] getQueueStatus() - 队列状态
- [ ] 优先级队列支持
- [ ] 单元测试

---

#### Task: RT-205 - 实现 TaskExecutor
**优先级**: 🔴 高  
**预计时间**: 8小时  
**依赖**: RT-204

**描述**: 实现任务执行器，调用 Orchestrator

**验收标准**:
- [ ] TaskExecutor 服务创建
- [ ] executeTask() - 执行任务
- [ ] 集成 Orchestrator
- [ ] 进度回调处理
- [ ] 错误处理和日志记录
- [ ] 单元测试

**技术细节**:
```typescript
class TaskExecutor {
  async executeTask(taskId: string) {
    // 1. 加载任务配置
    // 2. 创建 Orchestrator 会话
    // 3. 启动回测
    // 4. 监听进度和事件
    // 5. 处理完成/失败
  }
}
```

---

### 2.2 操作服务

#### Task: RT-206 - 实现任务暂停/恢复
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: RT-205

**描述**: 实现任务暂停和恢复功能

**验收标准**:
- [ ] pauseTask() 方法
- [ ] resumeTask() 方法
- [ ] 调用 Orchestrator 的暂停/恢复接口
- [ ] 创建快照
- [ ] 单元测试

---

#### Task: RT-207 - 实现任务取消
**优先级**: 🟡 中  
**预计时间**: 3小时  
**依赖**: RT-205

**描述**: 实现任务取消功能

**验收标准**:
- [ ] cancelTask() 方法
- [ ] 状态验证
- [ ] 调用 Orchestrator 停止接口
- [ ] 资源清理
- [ ] 单元测试

---

#### Task: RT-208 - 实现任务重试
**优先级**: 🟡 中  
**预计时间**: 3小时  
**依赖**: RT-205

**描述**: 实现失败任务的重试功能

**验收标准**:
- [ ] retryTask() 方法
- [ ] 复制任务配置
- [ ] 支持从快照恢复
- [ ] 单元测试

---

### 2.3 日志与监控

#### Task: RT-209 - 实现日志收集器
**优先级**: 🔴 高  
**预计时间**: 6小时  
**依赖**: RT-205

**描述**: 实现日志收集和存储服务

**验证标准**:
- [ ] LogCollector 服务创建
- [ ] 拦截 Orchestrator 日志
- [ ] 写入数据库
- [ ] 日志分级处理
- [ ] 单元测试

---

#### Task: RT-210 - 实现进度追踪
**优先级**: 🔴 高  
**预计时间**: 4小时  
**依赖**: RT-205

**描述**: 实现任务进度追踪服务

**验证标准**:
- [ ] ProgressTracker 服务创建
- [ ] 订阅 EventBus 进度事件
- [ ] 更新任务进度字段
- [ ] 计算预计剩余时间
- [ ] 单元测试

---

## 3. API 控制器 (6 tasks)

#### Task: RT-301 - 实现任务管理 API
**优先级**: 🔴 高  
**预计时间**: 4小时  
**依赖**: RT-201

**描述**: 实现任务 CRUD 的 REST API

**验收标准**:
- [ ] GET /backtesting/tasks - 列表
- [ ] POST /backtesting/tasks - 创建
- [ ] GET /backtesting/tasks/:id - 详情
- [ ] PATCH /backtesting/tasks/:id - 更新
- [ ] DELETE /backtesting/tasks/:id - 删除
- [ ] API 文档（Swagger）

---

#### Task: RT-302 - 实现任务操作 API
**优先级**: 🔴 高  
**预计时间**: 3小时  
**依赖**: RT-206, RT-207, RT-208

**描述**: 实现任务操作的 REST API

**验收标准**:
- [ ] POST /backtesting/tasks/:id/pause
- [ ] POST /backtesting/tasks/:id/resume
- [ ] POST /backtesting/tasks/:id/cancel
- [ ] POST /backtesting/tasks/:id/retry
- [ ] API 文档

---

#### Task: RT-303 - 实现日志 API
**优先级**: 🔴 高  
**预计时间**: 4小时  
**依赖**: RT-209

**描述**: 实现日志查询和流式传输 API

**验收标准**:
- [ ] GET /backtesting/tasks/:id/logs - 日志列表
- [ ] GET /backtesting/tasks/:id/logs/stream - SSE 日志流
- [ ] 支持筛选（级别、关键词）
- [ ] 支持分页
- [ ] API 文档

**技术细节**:
```typescript
@Sse('logs/stream')
async streamLogs(@Param('id') taskId: string) {
  return interval(1000).pipe(
    map(() => ({
      data: this.logService.getRecentLogs(taskId)
    }))
  );
}
```

---

#### Task: RT-304 - 实现进度 API
**优先级**: 🔴 高  
**预计时间**: 2小时  
**依赖**: RT-210

**描述**: 实现进度查询 API

**验收标准**:
- [ ] GET /backtesting/tasks/:id/progress
- [ ] 返回实时进度信息
- [ ] API 文档

---

#### Task: RT-305 - 实现快照 API
**优先级**: 🟡 中  
**预计时间**: 3小时  
**依赖**: RT-106

**描述**: 实现快照管理 API

**验收标准**:
- [ ] GET /backtesting/tasks/:id/snapshots - 列表
- [ ] POST /backtesting/tasks/:id/snapshots - 创建
- [ ] POST /backtesting/tasks/:id/snapshots/:sid/restore - 恢复
- [ ] DELETE /backtesting/tasks/:id/snapshots/:sid - 删除
- [ ] API 文档

---

#### Task: RT-306 - API 集成测试
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: RT-301, RT-302, RT-303, RT-304, RT-305

**描述**: 编写 API 集成测试

**验收标准**:
- [ ] 所有端点的集成测试
- [ ] 测试覆盖率 > 80%
- [ ] 测试通过 CI

---

## 4. 前端开发 (12 tasks)

### 4.1 API 客户端

#### Task: RT-401 - 创建 API 客户端
**优先级**: 🔴 高  
**预计时间**: 3小时  
**依赖**: RT-301, RT-302, RT-303

**描述**: 创建前端 API 调用客户端

**验收标准**:
- [ ] backtesting-tasks.ts 文件创建
- [ ] 所有 API 函数定义
- [ ] TypeScript 类型定义
- [ ] 错误处理

---

### 4.2 页面组件

#### Task: RT-402 - 实现任务列表页
**优先级**: 🔴 高  
**预计时间**: 8小时  
**依赖**: RT-401

**描述**: 实现任务列表页面

**验收标准**:
- [ ] TaskListPage 组件创建
- [ ] 表格展示（Ant Design Table）
- [ ] 筛选器（策略、状态、时间范围）
- [ ] 分页
- [ ] 行内操作按钮
- [ ] 状态标签和进度条

---

#### Task: RT-403 - 实现任务创建向导（步骤1-2）
**优先级**: 🔴 高  
**预计时间**: 6小时  
**依赖**: RT-401

**描述**: 实现任务创建向导的前两步

**验收标准**:
- [ ] CreateTaskWizard 组件创建
- [ ] 步骤1：选择策略版本
- [ ] 步骤2：选择数据集
- [ ] 表单验证
- [ ] 步骤导航

---

#### Task: RT-404 - 实现任务创建向导（步骤3-4）
**优先级**: 🔴 高  
**预计时间**: 8小时  
**依赖**: RT-403

**描述**: 实现任务创建向导的后两步

**验收标准**:
- [ ] 步骤3：策略参数动态表单
- [ ] 步骤4：执行配置
- [ ] Schema Renderer 复用
- [ ] 表单验证
- [ ] 预览和提交

---

#### Task: RT-405 - 实现任务详情页（基础结构）
**优先级**: 🔴 高  
**预计时间**: 4小时  
**依赖**: RT-401

**描述**: 实现任务详情页的基础结构

**验收标准**:
- [ ] TaskDetailPage 组件创建
- [ ] 顶部任务信息卡片
- [ ] Tab 容器
- [ ] 路由配置

---

#### Task: RT-406 - 实现概览 Tab
**优先级**: 🔴 高  
**预计时间**: 4小时  
**依赖**: RT-405

**描述**: 实现任务详情页的概览 Tab

**验收标准**:
- [ ] 基本信息展示
- [ ] 配置信息展示
- [ ] 状态时间轴组件

---

#### Task: RT-407 - 实现实时日志 Tab
**优先级**: 🔴 高  
**预计时间**: 6小时  
**依赖**: RT-405, RT-303

**描述**: 实现实时日志 Tab

**验收标准**:
- [ ] LogViewer 组件创建
- [ ] SSE 集成（EventSource）
- [ ] 日志级别筛选
- [ ] 关键词搜索
- [ ] 自动滚动
- [ ] 导出功能

---

#### Task: RT-408 - 实现进度详情 Tab
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: RT-405, RT-304

**描述**: 实现进度详情 Tab

**验收标准**:
- [ ] ProgressDetail 组件创建
- [ ] 进度条可视化
- [ ] 性能指标展示
- [ ] 实时更新（轮询）

---

#### Task: RT-409 - 实现快照管理 Tab
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: RT-405, RT-305

**描述**: 实现快照管理 Tab

**验收标准**:
- [ ] SnapshotManager 组件创建
- [ ] 快照列表
- [ ] 创建快照按钮
- [ ] 恢复/删除操作

---

#### Task: RT-410 - 实现任务操作按钮
**优先级**: 🔴 高  
**预计时间**: 3小时  
**依赖**: RT-405, RT-302

**描述**: 实现任务详情页的操作按钮

**验收标准**:
- [ ] 暂停/恢复按钮
- [ ] 取消按钮
- [ ] 重试按钮
- [ ] 复制配置按钮
- [ ] 状态判断和按钮显示

---

#### Task: RT-411 - 实现路由和导航
**优先级**: 🔴 高  
**预计时间**: 2小时  
**依赖**: RT-402, RT-405

**描述**: 配置路由和菜单

**验收标准**:
- [ ] 路由配置
- [ ] 菜单项添加
- [ ] 面包屑导航

---

#### Task: RT-412 - 前端单元测试
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: RT-411

**描述**: 编写关键组件的单元测试

**验收标准**:
- [ ] 测试覆盖率 > 60%
- [ ] 关键交互测试

---

## 5. 测试与质量 (4 tasks)

#### Task: RT-501 - E2E 测试用例设计
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: 无

**描述**: 设计端到端测试用例

**验收标准**:
- [ ] 测试用例文档
- [ ] 测试数据准备
- [ ] 测试环境配置

---

#### Task: RT-502 - E2E 测试实施
**优先级**: 🟡 中  
**预计时间**: 8小时  
**依赖**: RT-501, RT-412

**描述**: 执行端到端测试

**验收标准**:
- [ ] 创建任务流程测试
- [ ] 任务执行流程测试
- [ ] 任务操作测试
- [ ] 所有测试通过

---

#### Task: RT-503 - 性能测试
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: RT-502

**描述**: 执行性能测试

**验收标准**:
- [ ] 并发任务测试（5个）
- [ ] 日志查询性能测试
- [ ] 列表分页性能测试
- [ ] 性能指标达标

---

#### Task: RT-504 - Bug 修复和优化
**优先级**: 🟡 中  
**预计时间**: TBD  
**依赖**: RT-502, RT-503

**描述**: 修复测试发现的问题

**验收标准**:
- [ ] 所有高优先级 bug 修复
- [ ] 性能优化完成
- [ ] 回归测试通过

---

## 6. 文档与交付 (3 tasks)

#### Task: RT-601 - API 文档完善
**优先级**: 🟡 中  
**预计时间**: 2小时  
**依赖**: RT-306

**描述**: 完善 API 文档

**验收标准**:
- [ ] Swagger 文档完整
- [ ] 请求/响应示例
- [ ] 错误码说明

---

#### Task: RT-602 - 用户文档编写
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: RT-502

**描述**: 编写用户使用文档

**验收标准**:
- [ ] 功能说明文档
- [ ] 操作指南
- [ ] FAQ
- [ ] 截图和示例

---

#### Task: RT-603 - 代码审查和清理
**优先级**: 🟡 中  
**预计时间**: 4小时  
**依赖**: RT-504

**描述**: 代码审查和代码清理

**验收标准**:
- [ ] 代码审查通过
- [ ] 无 linter 错误
- [ ] 无 TypeScript 错误
- [ ] 移除调试代码

---

## 📊 任务统计

| 类别 | 任务数 | 总预计时间 |
|------|--------|-----------|
| 数据库层 | 7 | 16小时 |
| 服务层 | 10 | 48小时 |
| API控制器 | 6 | 20小时 |
| 前端开发 | 12 | 60小时 |
| 测试与质量 | 4 | 20小时 |
| 文档与交付 | 3 | 10小时 |
| **总计** | **42** | **174小时** |

**预计工作日**: 22天（按每天8小时计算）  
**考虑并行开发**: 2-3周（2-3人团队）

---

**最后更新**: 2025-11-12  
**文档状态**: ✅ 已完成

