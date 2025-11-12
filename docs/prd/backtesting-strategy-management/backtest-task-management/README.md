# 回测任务管理模块

**版本**: 1.0  
**状态**: 🟡 需求已对齐，准备开发  
**最后更新**: 2025-11-12

回测任务管理模块允许用户创建、监控和管理回测任务，查看任务执行进度和结果。

---

## 📋 模块概述

### 核心功能
1. **创建回测任务** - 配置策略、数据集和执行参数
2. **任务列表管理** - 查看、筛选和操作回测任务
3. **任务详情监控** - 实时查看任务执行状态和进度
4. **结果分析** - 查看回测结果、交易明细和因子分析

### MVP范围
- ✅ 创建任务（完整表单）
- ✅ 任务列表（卡片模式，版本筛选）
- ✅ 任务详情（4个Tab：概览、日志、结果、明细）
- ✅ 执行进度（1分钟刷新 + 主动刷新）
- ✅ 执行日志（下拉加载）
- ✅ 回测结果（指标 + 图表）
- ✅ 交易明细（因子筛选 + CSV导出）

### 本期不实现
- ❌ 杠杆倍数UI、滑点设置UI
- ❌ 日志导出
- ❌ 交易报表（下一期）

---

## 📁 文档结构

```
backtest-task-management/
├── README.md                           # 本文档
├── REQUIREMENTS.md                     # 需求文档
├── ALIGNMENT.md                        # 需求对齐记录
├── IMPLEMENTATION_SUMMARY.md           # 实现总结
│
├── design/                             # 设计文档
│   ├── DATABASE_DESIGN.md              # 数据库设计
│   ├── API_DESIGN.md                   # API设计
│   └── UI_DESIGN.md                    # UI设计
│
├── tasks/                              # 任务追踪
│   ├── README.md                       # 任务追踪说明
│   ├── DASHBOARD.md                    # 任务仪表盘
│   ├── TASK-BREAKDOWN.md               # 任务分解
│   ├── P1-DATABASE-BACKEND.md          # Phase 1 详情
│   ├── P2-FRONTEND-BASIC.md            # Phase 2 详情
│   ├── P3-TASK-DETAIL.md               # Phase 3 详情
│   ├── P4-OPTIMIZATION.md              # Phase 4 详情
│   └── scripts/                        # 辅助脚本
│
└── archive/                            # 归档文档（旧版）
    ├── CREATE_TASK_FLOW.md
    ├── TASK_VIEW_DESIGN.md
    ├── TASK_LIST_DETAIL_DESIGN.md
    ├── DASHBOARD.md (old)
    └── TASK_BREAKDOWN.md (old)
```

---

## 🚀 快速开始

### 1. 查看需求
- [需求文档](./REQUIREMENTS.md) - 完整的功能需求
- [需求对齐记录](./ALIGNMENT.md) - 需求确认历史
- [实现总结](./IMPLEMENTATION_SUMMARY.md) - 技术实现要点

### 2. 查看设计
- [数据库设计](./design/DATABASE_DESIGN.md) - 表结构和关系
- [API设计](./design/API_DESIGN.md) - 接口定义
- [UI设计](./design/UI_DESIGN.md) - 页面和组件设计

### 3. 开始开发
- [任务仪表盘](./tasks/DASHBOARD.md) - 查看当前进度
- [Phase 1: 数据库和后端](./tasks/P1-DATABASE-BACKEND.md) - 开始第一阶段

---

## 📊 开发进度

| 阶段 | 任务数 | 完成率 | 状态 |
|------|--------|--------|------|
| **Phase 1**: 数据库和后端API | 10 | 0% | 🔵 待开始 |
| **Phase 2**: 前端基础 | 9 | 0% | ⚪ 待开始 |
| **Phase 3**: 任务详情页 | 15 | 0% | ⚪ 待开始 |
| **Phase 4**: 优化和测试 | 3 | 0% | ⚪ 待开始 |
| **总计** | **37** | **0%** | 🟡 |

**当前焦点**: Phase 1 - 数据库和后端API  
**预计完工**: 2025-12-06（20个工作日）

查看详细进度 → [任务仪表盘](./tasks/DASHBOARD.md)

---

## 🎯 核心页面

### 1. 创建回测任务
**入口**: 策略列表 → "开始回测"按钮  
**形式**: 弹窗表单  
**流程**: 基本信息 → 数据配置 → 交易配置 → 策略参数

**关键字段**:
- 策略版本（默认master，可切换）
- 数据集选择
- 时间范围（默认全部，可自定义）
- 初始资金、手续费
- 策略参数（动态渲染）

### 2. 回测任务列表
**路由**: `/backtesting/tasks`  
**展示**: 卡片模式  
**筛选**: 搜索、策略、版本、状态、时间

**位置**:
- 独立任务页面（完整功能）
- 策略详情页下方（简化功能）

### 3. 回测任务详情
**路由**: `/backtesting/tasks/:taskId`  
**Tab结构**:
- 📊 概览 - 基本信息、配置、进度
- 📈 执行日志 - 实时日志（下拉加载）
- 💰 回测结果 - 指标和图表
- 📋 交易明细 - 交易列表、因子筛选、CSV导出
- 📊 交易报表 - 下一期实现

---

## 🏗️ 技术架构

### 后端技术栈
- **框架**: NestJS
- **ORM**: TypeORM
- **数据库**: PostgreSQL
- **文件格式**: CSV（导出）

### 前端技术栈
- **框架**: React + TypeScript
- **UI库**: Ant Design
- **图表**: @ant-design/plots / recharts
- **状态管理**: Context API / React Query
- **路由**: React Router

### 数据模型
- **BacktestTask** - 任务实体
- **Trade** - 交易记录
- **TaskLog** - 任务日志

详见 [数据库设计](./design/DATABASE_DESIGN.md)

---

## 🔗 依赖模块

### 内部依赖
- **策略管理模块** - 策略和脚本版本数据
- **数据集管理模块** - 数据集数据
- **回测框架核心** - Orchestrator、StrategySandbox等

### 外部依赖
- TypeORM
- Ant Design
- dayjs
- React Query / SWR

---

## 📚 API概览

### 任务管理
```typescript
POST   /api/backtesting/tasks              # 创建任务
GET    /api/backtesting/tasks              # 任务列表
GET    /api/backtesting/tasks/:id          # 任务详情
POST   /api/backtesting/tasks/:id/cancel   # 取消任务
POST   /api/backtesting/tasks/:id/retry    # 重试任务
DELETE /api/backtesting/tasks/:id          # 删除任务
```

### 日志管理
```typescript
GET    /api/backtesting/tasks/:id/logs     # 获取日志（分页）
```

### 交易明细
```typescript
GET    /api/backtesting/tasks/:id/trades           # 交易列表
GET    /api/backtesting/tasks/:id/trades/export    # 导出CSV
```

详见 [API设计](./design/API_DESIGN.md)

---

## 🧪 测试策略

### 单元测试
- Service层业务逻辑测试
- DTO验证测试
- 工具函数测试
- 目标覆盖率：≥ 80%

### 集成测试
- API端到端测试
- 数据库操作测试
- 因子筛选查询测试

### E2E测试
- 创建任务流程
- 任务列表操作
- 任务详情查看
- CSV导出功能

---

## 📝 开发规范

### 命名规范
- **文件名**: kebab-case（如 `backtest-task.entity.ts`）
- **类名**: PascalCase（如 `BacktestTaskService`）
- **变量/函数**: camelCase（如 `createTask`）
- **常量**: UPPER_SNAKE_CASE（如 `MAX_TASKS_PER_PAGE`）

### 代码规范
- 使用 ESLint + Prettier
- 遵循 Airbnb TypeScript Style Guide
- 所有公共API必须有JSDoc注释

### Git规范
- 分支命名：`feature/backtest-task-{功能}` 或 `fix/backtest-task-{问题}`
- Commit格式：`feat(backtest-task): 功能描述` 或 `fix(backtest-task): 问题描述`

---

## 🎊 里程碑

### Phase 1: 数据库和后端API ✅
- [ ] 数据库迁移完成
- [ ] 所有API端点实现
- [ ] API测试覆盖率 ≥ 80%
- [ ] API文档完成

### Phase 2: 前端基础 ✅
- [ ] 创建任务表单完成
- [ ] 任务列表页面完成
- [ ] 策略详情页集成完成
- [ ] 基础联调测试通过

### Phase 3: 任务详情页 ✅
- [ ] 所有Tab完成
- [ ] 因子筛选功能完成
- [ ] 进度轮询正常
- [ ] 日志下拉加载正常

### Phase 4: 优化和测试 ✅
- [ ] 性能优化完成
- [ ] E2E测试通过
- [ ] 文档完善

---

## 🔮 后续规划

### 下一期功能
- 📊 交易报表Tab（多维度分析）
- ⏸️ 任务暂停/恢复
- 📸 任务快照/恢复
- 🔢 任务优先级
- 📦 批量操作

### 性能优化
- 使用Redis缓存任务状态
- 实现日志归档机制
- 优化大数据量CSV导出
- 实现任务队列管理

---

## 📞 联系方式

- **项目负责人**: [待定]
- **技术负责人**: [待定]
- **问题反馈**: 创建Issue或联系团队

---

## 📜 变更日志

### 2025-11-12
- ✅ 需求对齐完成
- ✅ 设计文档完成
- ✅ 任务追踪体系搭建
- 🎯 准备开始Phase 1开发

---

**状态**: ✅ 需求完整，设计完成，可开始开发  
**维护者**: Development Team  
**最后更新**: 2025-11-12
