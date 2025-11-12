# 回测任务管理 - 详细需求文档

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**依据**: `docs/prd/backtesting-strategy-management/PRD.md` - 阶段2

---

## 1. 背景与目标

### 1.1 背景

阶段1已完成策略管理功能，用户可以创建、编辑和管理策略脚本。阶段2需要实现回测任务管理，让用户能够：
- 基于策略版本创建回测任务
- 配置回测参数（数据集、时间范围、初始资金等）
- 执行回测并监控进度
- 查看任务状态和结果

### 1.2 目标

- 提供完整的回测任务生命周期管理
- 支持任务的创建、执行、暂停、恢复、取消
- 实时展示任务进度和日志
- 为阶段3的结果分析提供数据支持

---

## 2. 核心概念

### 2.1 回测任务（Backtest Task）

回测任务是以某个策略的脚本版本 + 数据集 + 参数配置发起的执行实例。

**核心属性**:
- 任务ID（唯一标识）
- 策略ID + 脚本版本ID
- 数据集ID
- 参数配置（JSON）
- 执行配置（初始资金、滑点、费用等）
- 状态（状态机）
- 创建人、创建时间
- 开始时间、结束时间
- 进度信息
- 错误信息（如果失败）

### 2.2 任务状态机

```
submitted → queued → running → completed
                ↓         ↓
              paused    failed
                ↓         ↓
             cancelled  cancelled
```

**状态说明**:
- `submitted`: 任务已提交，等待验证和入队
- `queued`: 任务已通过验证，在队列中等待执行
- `running`: 任务正在执行
- `paused`: 任务已暂停
- `completed`: 任务成功完成
- `failed`: 任务执行失败
- `cancelled`: 任务被取消

### 2.3 任务配置

**数据配置**:
- 数据集ID（必选）
- 时间范围（可选，默认使用数据集全部时间）
- 时间框架（可选，如1分钟、5分钟、1小时）

**策略配置**:
- 策略ID（必选）
- 脚本版本ID（必选）
- 参数配置（JSON，根据策略的参数Schema）

**执行配置**:
- 初始资金（默认10000）
- 杠杆（默认1）
- 滑点模型（固定/百分比/动态）
- 费用模型（Maker/Taker费率）
- 交易时段（可选）

**高级配置**:
- 快照间隔（自动保存快照的时间间隔）
- 日志级别（debug/info/warn/error）
- 超时时间（任务执行超时）

---

## 3. 功能需求

### 3.1 任务列表

**页面**: `/backtesting/tasks`

**功能**:
- 展示所有回测任务的列表
- 支持分页（默认20条/页）
- 支持筛选和搜索

**列表字段**:
| 字段 | 说明 | 示例 |
|------|------|------|
| 任务ID | 任务唯一标识 | `task-uuid-123` |
| 任务名称 | 用户自定义名称 | "MA策略回测-BTCUSDT" |
| 策略名称 | 关联的策略 | "双均线策略" |
| 脚本版本 | 使用的版本 | "v1.2.0" |
| 数据集 | 使用的数据集 | "BTCUSDT-2024" |
| 状态 | 当前状态 | 运行中 |
| 进度 | 执行进度 | 45% |
| 提交时间 | 创建时间 | 2024-11-12 10:30 |
| 开始时间 | 执行开始时间 | 2024-11-12 10:31 |
| 耗时 | 已执行时间 | 5分30秒 |
| 收益率 | 快照收益率（完成后） | +15.8% |
| 操作 | 操作按钮 | 查看/暂停/取消 |

**筛选条件**:
- 状态筛选（全部/运行中/已完成/失败）
- 策略筛选（多选）
- 数据集筛选（多选）
- 时间范围筛选（提交时间）
- 创建人筛选

**排序**:
- 按提交时间（默认降序）
- 按开始时间
- 按完成时间
- 按收益率

**行内操作**:
- 查看详情
- 复制配置（创建相似任务）
- 暂停（仅running状态）
- 恢复（仅paused状态）
- 取消（queued/running/paused状态）
- 重试（failed状态）
- 删除（completed/failed/cancelled状态）

---

### 3.2 创建任务

**页面**: `/backtesting/tasks/new` 或弹窗

**创建流程**:

#### 步骤1：选择策略版本
- 策略下拉选择（可搜索）
- 版本下拉选择（默认选中master版本）
- 显示版本详情（代码预览、参数Schema、因子Schema）

#### 步骤2：选择数据集
- 数据集下拉选择（可搜索）
- 仅显示状态为"清洗完成"的数据集
- 显示数据集信息：
  - 交易对
  - 时间范围
  - 数据量
  - 周期
  - 标签

**时间范围选择**:
- 使用全部数据（默认）
- 自定义时间范围（日期选择器）

#### 步骤3：配置策略参数
- 根据策略的参数Schema动态生成表单
- 支持的组件类型：
  - `input`: 文本输入
  - `number`: 数字输入（支持min/max）
  - `select`: 下拉选择（enumOptions）
  - `switch`: 开关
  - `slider`: 滑块
  - `date`: 日期选择
- 显示参数说明（desc）
- 显示默认值
- 客户端校验（required、validator）

#### 步骤4：配置执行参数
**基础配置**:
- 任务名称（可选，默认生成）
- 初始资金（默认10000）
- 杠杆（默认1，范围1-125）

**费用与滑点**:
- 滑点模型：
  - 固定滑点（默认0.1%）
  - 百分比滑点
  - 动态滑点（基于成交量）
- 费用模型：
  - Maker费率（默认0.02%）
  - Taker费率（默认0.05%）

**高级配置**（可折叠）:
- 交易时段（如仅交易09:00-15:00）
- 快照间隔（默认不自动快照）
- 日志级别（默认info）
- 超时时间（默认1小时）

#### 步骤5：确认并提交
- 预览所有配置
- 显示预估执行时间（基于历史数据）
- 提交按钮

**提交后**:
- 跳转到任务详情页
- 显示任务状态和进度

---

### 3.3 任务详情

**页面**: `/backtesting/tasks/:taskId`

**页面结构**:

#### 顶部：任务信息卡片
- 任务名称
- 状态标签（带颜色）
- 进度条（百分比）
- 关键指标（实时更新）：
  - 已处理事件数
  - 当前时间（回测时间）
  - 执行耗时
  - 收益率快照

#### Tab1: 概览

**基本信息**:
- 任务ID
- 策略名称 + 版本
- 数据集名称
- 提交人
- 提交时间
- 开始时间
- 结束时间
- 总耗时

**配置信息**:
- 策略参数（表格展示）
- 执行配置（表格展示）
- 数据集信息

**状态时间轴**:
```
submitted → queued → running → completed
10:30:00    10:30:05  10:31:00   10:45:30
```

#### Tab2: 实时日志

**功能**:
- 实时展示任务执行日志
- 支持日志级别筛选（debug/info/warn/error）
- 支持关键词搜索
- 支持日志导出（TXT）
- 自动滚动到最新日志
- 支持暂停自动滚动

**日志格式**:
```
[2024-11-12 10:31:05.123] [INFO] [Orchestrator] 任务开始执行
[2024-11-12 10:31:05.234] [INFO] [DataProvider] 加载数据集: BTCUSDT-2024
[2024-11-12 10:31:06.123] [INFO] [EventBus] 已加载 10000 条事件
[2024-11-12 10:31:10.456] [INFO] [Strategy] 策略初始化完成
[2024-11-12 10:31:11.789] [WARN] [RiskEngine] 风控警告: 持仓超过50%
[2024-11-12 10:32:00.123] [INFO] [ExecutionEngine] 执行买入: 价格=50000, 数量=0.1
```

#### Tab3: 进度详情

**可视化进度**:
- 总体进度条
- 各模块进度：
  - 数据加载进度
  - 事件处理进度
  - 交易执行进度

**性能指标**:
- 平均处理速度（事件/秒）
- 当前处理速度
- 预计剩余时间
- CPU使用率（如果可获取）
- 内存使用（如果可获取）

#### Tab4: 快照管理

**功能**:
- 列出任务的所有快照
- 快照列表字段：
  - 快照ID
  - 创建时间
  - 创建原因（自动/手动）
  - 快照大小
  - 包含事件数
  - 快照状态
- 操作：
  - 创建快照（手动）
  - 恢复快照
  - 删除快照
  - 下载快照

#### Tab5: 结果预览（completed状态）

**快速预览**:
- 基础绩效指标
- 收益曲线图（简化版）
- 交易汇总
- 跳转到完整结果分析的按钮

**操作区域**:
- 暂停/恢复按钮（根据状态显示）
- 取消按钮
- 重试按钮（failed状态）
- 复制配置按钮
- 导出日志按钮
- 查看完整结果按钮（completed状态）

---

### 3.4 任务操作

#### 3.4.1 暂停任务
- 仅running状态可暂停
- 点击暂停后：
  - 任务状态变为paused
  - 创建快照保存当前状态
  - 释放执行资源
  - 日志记录暂停原因

#### 3.4.2 恢复任务
- 仅paused状态可恢复
- 点击恢复后：
  - 任务重新进入queued状态
  - 等待调度器分配资源
  - 从最近快照恢复状态
  - 继续执行

#### 3.4.3 取消任务
- queued/running/paused状态可取消
- 需要二次确认
- 点击取消后：
  - 任务状态变为cancelled
  - 创建快照（如果在running状态）
  - 释放资源
  - 日志记录取消原因

#### 3.4.4 重试任务
- 仅failed状态可重试
- 重试选项：
  - 从头开始
  - 从最近快照恢复
- 创建新任务（复制配置）
- 跳转到新任务详情页

#### 3.4.5 删除任务
- completed/failed/cancelled状态可删除
- 需要二次确认
- 删除内容：
  - 任务记录
  - 关联的快照
  - 执行日志
  - 结果数据（可选保留）

---

## 4. 非功能需求

### 4.1 性能要求

- 任务列表加载时间 < 2秒
- 任务详情加载时间 < 1秒
- 日志实时更新延迟 < 500ms
- 进度更新频率：每秒至少1次
- 支持并发运行任务数：至少5个（可配置）

### 4.2 可靠性要求

- 任务执行失败后可恢复
- 定期自动创建快照（可配置）
- 服务重启后任务状态可恢复
- 错误信息清晰，便于排查

### 4.3 安全性要求

- 任务仅创建人可操作（暂停、取消、删除）
- 敏感配置（API密钥）加密存储
- 操作审计日志

### 4.4 可用性要求

- 界面友好，操作流程清晰
- 表单校验及时反馈
- 错误提示明确
- 支持键盘快捷键

---

## 5. 数据模型（初步）

### 5.1 backtest_tasks 表

```sql
CREATE TABLE backtest_tasks (
  task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_name VARCHAR(100) NOT NULL,
  
  -- 关联
  strategy_id UUID NOT NULL REFERENCES strategies(strategy_id),
  script_version_id UUID NOT NULL REFERENCES script_versions(script_version_id),
  dataset_id UUID NOT NULL REFERENCES datasets(dataset_id),
  
  -- 配置
  strategy_params JSONB NOT NULL DEFAULT '{}',
  execution_config JSONB NOT NULL DEFAULT '{}',
  data_config JSONB NOT NULL DEFAULT '{}',
  
  -- 状态
  status VARCHAR(20) NOT NULL, -- submitted/queued/running/paused/completed/failed/cancelled
  progress INTEGER DEFAULT 0, -- 0-100
  
  -- 时间
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  queued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  -- 结果
  result_summary JSONB, -- 快照收益率、交易数等
  error_message TEXT,
  
  -- 审计
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 task_logs 表

```sql
CREATE TABLE task_logs (
  log_id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES backtest_tasks(task_id) ON DELETE CASCADE,
  level VARCHAR(10) NOT NULL, -- debug/info/warn/error
  module VARCHAR(50), -- 日志来源模块
  message TEXT NOT NULL,
  metadata JSONB, -- 额外信息
  logged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_task_logs_task_id (task_id),
  INDEX idx_task_logs_level (level),
  INDEX idx_task_logs_logged_at (logged_at)
);
```

### 5.3 task_snapshots 表

```sql
CREATE TABLE task_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES backtest_tasks(task_id) ON DELETE CASCADE,
  snapshot_type VARCHAR(20) NOT NULL, -- auto/manual
  reason TEXT,
  snapshot_data JSONB NOT NULL, -- 快照数据
  snapshot_size BIGINT, -- 字节
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_task_snapshots_task_id (task_id)
);
```

---

## 6. API接口（初步）

### 任务管理

- `GET /api/v1/backtesting/tasks` - 任务列表
- `POST /api/v1/backtesting/tasks` - 创建任务
- `GET /api/v1/backtesting/tasks/:taskId` - 任务详情
- `PATCH /api/v1/backtesting/tasks/:taskId` - 更新任务
- `DELETE /api/v1/backtesting/tasks/:taskId` - 删除任务

### 任务操作

- `POST /api/v1/backtesting/tasks/:taskId/start` - 启动任务
- `POST /api/v1/backtesting/tasks/:taskId/pause` - 暂停任务
- `POST /api/v1/backtesting/tasks/:taskId/resume` - 恢复任务
- `POST /api/v1/backtesting/tasks/:taskId/cancel` - 取消任务
- `POST /api/v1/backtesting/tasks/:taskId/retry` - 重试任务

### 日志与监控

- `GET /api/v1/backtesting/tasks/:taskId/logs` - 获取日志
- `GET /api/v1/backtesting/tasks/:taskId/logs/stream` - 日志流（SSE/WebSocket）
- `GET /api/v1/backtesting/tasks/:taskId/progress` - 获取进度

### 快照管理

- `GET /api/v1/backtesting/tasks/:taskId/snapshots` - 快照列表
- `POST /api/v1/backtesting/tasks/:taskId/snapshots` - 创建快照
- `POST /api/v1/backtesting/tasks/:taskId/snapshots/:snapshotId/restore` - 恢复快照
- `DELETE /api/v1/backtesting/tasks/:taskId/snapshots/:snapshotId` - 删除快照

---

## 7. 技术方案

### 7.1 任务调度

**方案选择**:
- 使用 Bull 队列（基于Redis）
- 支持任务优先级
- 支持并发控制
- 支持重试机制

### 7.2 任务执行

**集成方式**:
- 调用 Orchestrator 创建回测会话
- 使用已有的回测框架（M1-M3已完成）
- 任务与会话一对一映射

### 7.3 实时通信

**方案选择**:
- 日志流：Server-Sent Events (SSE)
- 进度更新：轮询或SSE
- 备选：WebSocket

### 7.4 数据存储

- 任务元数据：PostgreSQL
- 日志：PostgreSQL + 时序压缩
- 快照：文件系统 + 元数据在DB
- 结果：Parquet文件 + DuckDB

---

## 8. 风险与挑战

### 8.1 技术风险

1. **并发任务资源管理**
   - 风险：多个任务同时运行可能耗尽资源
   - 缓解：限制并发数、资源监控、任务优先级

2. **长时间任务的状态一致性**
   - 风险：服务重启导致任务状态丢失
   - 缓解：定期快照、状态持久化、任务恢复机制

3. **日志数据量大**
   - 风险：日志表快速增长
   - 缓解：日志压缩、定期归档、限制日志保留期

### 8.2 产品风险

1. **用户学习成本**
   - 风险：配置项过多，用户不会用
   - 缓解：提供模板配置、分步向导、在线帮助

2. **任务失败率高**
   - 风险：参数配置错误导致任务失败
   - 缓解：配置预校验、提供默认值、历史配置参考

---

## 9. 测试要点

### 9.1 功能测试

- 任务创建流程
- 任务状态转换
- 任务操作（暂停/恢复/取消）
- 快照创建和恢复
- 日志实时更新
- 进度实时更新

### 9.2 性能测试

- 并发创建任务
- 并发执行任务
- 日志查询性能
- 任务列表分页性能

### 9.3 异常测试

- 服务重启后任务恢复
- 任务执行超时
- 数据集不存在
- 策略版本不存在
- 网络中断恢复

---

## 10. 参考资料

- [主PRD](../PRD.md)
- [M3 Orchestrator完成总结](../../../backend/src/backtesting/orchestrator/M3-01-E-COMPLETION-SUMMARY.md)
- [回测框架架构](../backtest-framework-architecture/README.md)

---

**文档版本**: 1.0  
**最后更新**: 2025-11-12  
**维护者**: Development Team

