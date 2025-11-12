# 回测任务管理模块

本模块提供回测任务的创建、执行、监控和管理功能。

## 📁 目录结构

```
tasks/
├── entities/               # TypeORM 实体
│   ├── backtest-task.entity.ts
│   ├── task-log.entity.ts
│   └── index.ts
├── dto/                   # 数据传输对象
│   ├── create-backtest-task.dto.ts
│   ├── update-backtest-task.dto.ts
│   ├── list-backtest-tasks.dto.ts
│   ├── list-task-logs.dto.ts
│   └── index.ts
├── backtest-tasks.service.ts       # 任务管理服务
├── task-logs.service.ts            # 日志管理服务
├── backtest-tasks.controller.ts    # REST API 控制器
├── backtest-tasks.module.ts        # NestJS 模块
├── *.spec.ts                       # 单元测试文件
├── API_EXAMPLES.md                 # API 使用示例
├── TESTING_SUMMARY.md              # 测试总结报告
└── README.md                       # 本文件
```

## 🚀 快速开始

### 1. 数据库迁移

模块依赖以下数据库表：
- `backtest_tasks` - 回测任务表
- `task_logs` - 任务日志表

运行迁移：
```bash
npm run migration:run
```

### 2. 模块注册

模块已自动注册到 `BacktestingModule`，无需额外配置。

### 3. API 访问

所有端点均在 `/api/v1/backtesting/tasks` 路径下。

查看 Swagger 文档：
```
http://localhost:3000/api/docs
```

## 📚 API 端点

### 任务管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/backtesting/tasks` | 创建任务 |
| GET | `/backtesting/tasks` | 查询列表 |
| GET | `/backtesting/tasks/:taskId` | 查询详情 |
| PATCH | `/backtesting/tasks/:taskId` | 更新任务 |
| DELETE | `/backtesting/tasks/:taskId` | 删除任务 |
| POST | `/backtesting/tasks/:taskId/cancel` | 取消任务 |
| POST | `/backtesting/tasks/:taskId/retry` | 重试任务 |
| GET | `/backtesting/tasks/:taskId/copy` | 复制配置 |

### 日志管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/backtesting/tasks/:taskId/logs` | 查询日志 |
| GET | `/backtesting/tasks/:taskId/logs/stats` | 日志统计 |

详细的API使用示例请查看 [API_EXAMPLES.md](./API_EXAMPLES.md)。

## 🧪 测试

### 运行所有测试
```bash
npm test -- tasks
```

### 运行特定测试
```bash
# Service 测试
npm test -- backtest-tasks.service

# Controller 测试
npm test -- backtest-tasks.controller

# 日志 Service 测试
npm test -- task-logs.service
```

### 测试覆盖率
```bash
npm run test:cov -- tasks
```

测试详情请查看 [TESTING_SUMMARY.md](./TESTING_SUMMARY.md)。

## 💡 使用示例

### 创建任务

```typescript
import { BacktestTasksService } from './backtest-tasks.service';
import { CreateBacktestTaskDto } from './dto';

const taskDto: CreateBacktestTaskDto = {
  taskName: '双均线策略回测',
  strategyId: 'your-strategy-id',
  scriptVersionId: 'your-version-id',
  datasetId: 1,
  strategyParams: {
    fastPeriod: 10,
    slowPeriod: 30,
  },
  executionConfig: {
    initialCapital: 10000,
    leverage: 1,
    slippage: 0,
    fees: {
      makerFee: 0.0002,
      takerFee: 0.0005,
    },
  },
  dataConfig: {
    timeRange: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-12-31T23:59:59Z',
    },
    timeframe: '1h',
  },
};

const task = await backtestTasksService.create(taskDto);
```

### 更新任务状态

```typescript
// 开始执行
await backtestTasksService.updateStatus(
  taskId,
  BacktestTaskStatus.RUNNING
);

// 更新进度
await backtestTasksService.updateProgress(taskId, 50);

// 完成任务
await backtestTasksService.updateStatus(
  taskId,
  BacktestTaskStatus.COMPLETED,
  {
    resultSummary: {
      totalReturn: 0.235,
      maxDrawdown: -0.123,
      // ... 其他指标
    },
  }
);
```

### 记录日志

```typescript
import { TaskLogsService, LogLevel } from './task-logs.service';

// 使用便捷方法
await taskLogsService.info(
  taskId,
  'Backtest session started',
  'Orchestrator',
  { sessionId: 'session-123' }
);

await taskLogsService.error(
  taskId,
  'Strategy execution failed',
  'StrategySandbox',
  { error: 'Timeout' }
);

// 批量记录
await taskLogsService.createBatch([
  {
    taskId,
    level: LogLevel.INFO,
    message: 'Processing bar 1000',
    module: 'DataProvider',
  },
  {
    taskId,
    level: LogLevel.INFO,
    message: 'Trade executed',
    module: 'ExecutionEngine',
  },
]);
```

### 查询任务列表

```typescript
// 基础查询
const result = await backtestTasksService.findAll({
  page: 1,
  pageSize: 20,
});

// 带筛选
const filtered = await backtestTasksService.findAll({
  strategyId: 'your-strategy-id',
  status: BacktestTaskStatus.RUNNING,
  sortBy: SortField.CREATED_AT,
  sortOrder: SortOrder.DESC,
  page: 1,
  pageSize: 10,
});
```

## 🏗️ 架构设计

### 数据模型

#### BacktestTaskEntity
- 任务元数据（名称、描述）
- 关联引用（策略ID、版本ID、数据集ID）
- 配置参数（策略参数、执行配置、数据配置）
- 执行状态（状态、进度）
- 结果数据（结果摘要、文件路径）
- 错误信息（错误消息、堆栈）

#### TaskLogEntity
- 日志基本信息（ID、任务ID）
- 日志内容（级别、模块、消息）
- 结构化元数据（JSONB）
- 时间戳

### 状态流转

```
pending → running → completed
                 → failed
                 → cancelled
```

### 服务分层

```
Controller (REST API)
    ↓
Service (业务逻辑)
    ↓
Repository (数据访问)
    ↓
Database (PostgreSQL)
```

## 🔒 数据验证

所有DTO都包含完整的验证规则：
- **必填字段**: `@IsNotEmpty()`
- **类型验证**: `@IsString()`, `@IsNumber()`, `@IsUUID()`
- **范围限制**: `@Min()`, `@Max()`
- **格式验证**: `@IsISO8601()`, `@Matches()`
- **嵌套验证**: `@ValidateNested()`, `@Type()`

## 📊 性能优化

### 数据库索引
- 状态索引：`idx_backtest_tasks_status`
- 策略索引：`idx_backtest_tasks_strategy`
- 版本索引：`idx_backtest_tasks_version`
- 复合索引：`idx_backtest_tasks_strategy_version_status`
- 时间索引：`idx_backtest_tasks_created_at`
- 日志索引：`idx_task_logs_task_time`

### 查询优化
- 使用 QueryBuilder 构建复杂查询
- 避免 N+1 查询问题
- 合理使用分页限制

### 日志管理
- 下拉加载机制（使用 `before` 参数）
- 日志级别筛选
- 定期清理旧日志（`cleanOldLogs()`）

## 🛡️ 错误处理

模块统一使用 NestJS 异常：
- `NotFoundException` - 资源不存在
- `BadRequestException` - 参数错误或业务规则限制

所有异常都会返回标准格式：
```json
{
  "message": "错误描述",
  "error": "错误类型",
  "statusCode": 400
}
```

## 🔍 监控和调试

### 日志级别
- `debug` - 详细调试信息
- `info` - 一般信息
- `warn` - 警告信息
- `error` - 错误信息

### 日志统计
使用 `countByLevel()` 方法快速了解任务执行情况。

## 📝 最佳实践

### 1. 任务命名
使用描述性的任务名称，包含策略、时间范围等关键信息：
```
双均线策略-BTC/USDT-2024Q1
```

### 2. 错误处理
始终记录详细的错误信息和堆栈：
```typescript
try {
  // 任务执行逻辑
} catch (error) {
  await backtestTasksService.updateStatus(
    taskId,
    BacktestTaskStatus.FAILED,
    {
      errorMessage: error.message,
      errorStack: error.stack,
    }
  );
}
```

### 3. 进度更新
定期更新任务进度，提供良好的用户体验：
```typescript
// 每处理100条数据更新一次
if (processedCount % 100 === 0) {
  const progress = Math.floor((processedCount / totalCount) * 100);
  await backtestTasksService.updateProgress(taskId, progress);
}
```

### 4. 日志记录
合理使用日志级别，避免日志过多：
```typescript
// 关键事件使用 info
await taskLogsService.info(taskId, 'Trade executed', 'ExecutionEngine');

// 调试信息使用 debug
await taskLogsService.debug(taskId, 'Processing bar', 'DataProvider');

// 错误使用 error
await taskLogsService.error(taskId, 'Failed to load data', 'DataProvider');
```

## 🤝 贡献指南

1. 遵循现有代码风格
2. 为新功能添加单元测试
3. 更新相关文档
4. 确保所有测试通过

## 📄 相关文档

- [API使用示例](./API_EXAMPLES.md)
- [测试总结报告](./TESTING_SUMMARY.md)
- [数据库设计](../../design/DATABASE_DESIGN.md)
- [API设计文档](../../design/API_DESIGN.md)

## 📞 联系方式

如有问题或建议，请联系：
- Backend Team
- Email: backend@trading-platform.com

---

**版本**: v1.0  
**最后更新**: 2025-11-12  
**维护者**: Backend Team

