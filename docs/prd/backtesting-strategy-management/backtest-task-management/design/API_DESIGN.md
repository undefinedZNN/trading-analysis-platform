# 回测任务管理 - API 设计

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**状态**: ✅ 设计完成

---

## 📋 目录

1. [概述](#1-概述)
2. [API 端点列表](#2-api-端点列表)
3. [数据模型](#3-数据模型)
4. [API 详细设计](#4-api-详细设计)
5. [错误处理](#5-错误处理)
6. [实时通信](#6-实时通信)

---

## 1. 概述

### 1.1 基本信息

- **Base URL**: `/api/v1/backtesting`
- **认证方式**: Bearer Token（复用现有认证机制）
- **数据格式**: JSON
- **编码**: UTF-8

### 1.2 通用响应格式

#### 成功响应
```typescript
{
  "data": any,           // 响应数据
  "message": string,     // 提示消息（可选）
  "timestamp": string    // ISO 8601格式时间戳
}
```

#### 错误响应
```typescript
{
  "error": {
    "code": string,      // 错误代码
    "message": string,   // 错误消息
    "details": any       // 错误详情（可选）
  },
  "timestamp": string
}
```

### 1.3 分页响应格式
```typescript
{
  "data": {
    "items": any[],
    "total": number,
    "page": number,
    "pageSize": number,
    "totalPages": number
  }
}
```

---

## 2. API 端点列表

### 2.1 任务管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/tasks` | 获取任务列表 | 认证用户 |
| POST | `/tasks` | 创建任务 | 认证用户 |
| GET | `/tasks/:taskId` | 获取任务详情 | 任务创建人 |
| PATCH | `/tasks/:taskId` | 更新任务 | 任务创建人 |
| DELETE | `/tasks/:taskId` | 删除任务 | 任务创建人 |

### 2.2 任务操作

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/tasks/:taskId/cancel` | 取消任务 | 任务创建人 |
| POST | `/tasks/:taskId/retry` | 重试任务（V1.1） | 任务创建人 |

### 2.3 日志与监控

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/tasks/:taskId/logs` | 获取日志列表 | 任务创建人 |
| GET | `/tasks/:taskId/logs/stream` | 日志流（SSE） | 任务创建人 |
| GET | `/tasks/:taskId/progress` | 获取进度 | 任务创建人 |

### 2.4 快照管理（V1.1）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/tasks/:taskId/snapshots` | 获取快照列表 | 任务创建人 |
| POST | `/tasks/:taskId/snapshots` | 创建快照 | 任务创建人 |
| POST | `/tasks/:taskId/snapshots/:snapshotId/restore` | 恢复快照 | 任务创建人 |
| DELETE | `/tasks/:taskId/snapshots/:snapshotId` | 删除快照 | 任务创建人 |

---

## 3. 数据模型

### 3.1 TaskSummary（任务摘要）
```typescript
interface TaskSummary {
  taskId: string;
  taskName: string;
  taskDescription?: string;
  
  // 关联信息
  strategy: {
    strategyId: string;
    name: string;
  };
  scriptVersion: {
    scriptVersionId: string;
    versionName: string;
  };
  dataset: {
    datasetId: string;
    name: string;
    symbol: string;
  };
  
  // 状态与进度
  status: TaskStatus;
  progress: number;
  
  // 时间信息
  submittedAt: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  
  // 结果摘要
  resultSummary?: {
    totalReturn?: number;
    maxDrawdown?: number;
    sharpeRatio?: number;
    totalTrades?: number;
  };
  
  // 审计
  createdBy?: string;
}
```

### 3.2 TaskDetail（任务详情）
```typescript
interface TaskDetail extends TaskSummary {
  // 配置详情
  strategyParams: Record<string, any>;
  executionConfig: ExecutionConfig;
  dataConfig: DataConfig;
  
  // 结果
  resultFilePath?: string;
  errorMessage?: string;
  
  // 完整时间信息
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 ExecutionConfig（执行配置）
```typescript
interface ExecutionConfig {
  initialCapital: number;
  leverage: number;
  slippage: {
    type: 'fixed' | 'percentage' | 'dynamic';
    value: number;
  };
  fees: {
    makerFee: number;
    takerFee: number;
  };
  tradingHours?: {
    start: string;  // HH:mm
    end: string;    // HH:mm
  };
}
```

### 3.4 TaskLog（任务日志）
```typescript
interface TaskLog {
  logId: number;
  taskId: string;
  level: LogLevel;
  module?: string;
  message: string;
  metadata?: Record<string, any>;
  loggedAt: string;
}
```

### 3.5 TaskProgress（任务进度）
```typescript
interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  progress: number;
  
  // 统计信息
  processedEvents: number;
  totalEvents?: number;
  currentTime?: string;  // 回测时间
  
  // 性能
  executionTime: number;  // 秒
  avgSpeed?: number;      // 事件/秒
  estimatedRemaining?: number;  // 秒
}
```

---

## 4. API 详细设计

### 4.1 获取任务列表

#### GET `/tasks`

**查询参数**:
```typescript
{
  page?: number;           // 页码，默认1
  pageSize?: number;       // 每页数量，默认20
  status?: TaskStatus[];   // 状态筛选
  strategyId?: string;     // 策略筛选
  datasetId?: string;      // 数据集筛选
  createdBy?: string;      // 创建人筛选
  startDate?: string;      // 提交时间开始（ISO 8601）
  endDate?: string;        // 提交时间结束（ISO 8601）
  sortBy?: string;         // 排序字段，默认submittedAt
  sortOrder?: 'ASC' | 'DESC';  // 排序方向，默认DESC
}
```

**响应示例**:
```json
{
  "data": {
    "items": [
      {
        "taskId": "task-uuid-123",
        "taskName": "MA策略回测-BTCUSDT",
        "strategy": {
          "strategyId": "strategy-uuid",
          "name": "双均线策略"
        },
        "scriptVersion": {
          "scriptVersionId": "version-uuid",
          "versionName": "v1.2.0"
        },
        "dataset": {
          "datasetId": "dataset-uuid",
          "name": "BTCUSDT-2024",
          "symbol": "BTCUSDT"
        },
        "status": "running",
        "progress": 45,
        "submittedAt": "2024-11-12T10:30:00Z",
        "startedAt": "2024-11-12T10:31:00Z",
        "resultSummary": null,
        "createdBy": "user-123"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

---

### 4.2 创建任务

#### POST `/tasks`

**请求体**:
```typescript
{
  taskName: string;              // 必填
  taskDescription?: string;
  strategyId: string;            // 必填
  scriptVersionId: string;       // 必填
  datasetId: string;             // 必填
  strategyParams: Record<string, any>;  // 必填
  executionConfig: ExecutionConfig;     // 必填
  dataConfig?: {
    timeRange?: {
      start: string;  // ISO 8601
      end: string;    // ISO 8601
    };
    timeframe?: string;
  };
}
```

**请求示例**:
```json
{
  "taskName": "MA策略回测-BTCUSDT",
  "taskDescription": "测试双均线策略在2024年的表现",
  "strategyId": "strategy-uuid-123",
  "scriptVersionId": "version-uuid-456",
  "datasetId": "dataset-uuid-789",
  "strategyParams": {
    "fastPeriod": 10,
    "slowPeriod": 30,
    "positionSize": 0.5
  },
  "executionConfig": {
    "initialCapital": 10000,
    "leverage": 1,
    "slippage": {
      "type": "fixed",
      "value": 0.001
    },
    "fees": {
      "makerFee": 0.0002,
      "takerFee": 0.0005
    }
  },
  "dataConfig": {
    "timeRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    }
  }
}
```

**响应示例**:
```json
{
  "data": {
    "taskId": "task-uuid-new",
    "taskName": "MA策略回测-BTCUSDT",
    "status": "submitted",
    "progress": 0,
    "submittedAt": "2024-11-12T10:30:00Z"
  },
  "message": "任务创建成功"
}
```

**错误响应**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "参数校验失败",
    "details": {
      "strategyParams.fastPeriod": "必须大于0",
      "executionConfig.initialCapital": "必须大于0"
    }
  },
  "timestamp": "2024-11-12T10:30:00Z"
}
```

---

### 4.3 获取任务详情

#### GET `/tasks/:taskId`

**响应示例**:
```json
{
  "data": {
    "taskId": "task-uuid-123",
    "taskName": "MA策略回测-BTCUSDT",
    "taskDescription": "测试双均线策略",
    "strategy": {
      "strategyId": "strategy-uuid",
      "name": "双均线策略"
    },
    "scriptVersion": {
      "scriptVersionId": "version-uuid",
      "versionName": "v1.2.0",
      "code": "// 策略代码..."
    },
    "dataset": {
      "datasetId": "dataset-uuid",
      "name": "BTCUSDT-2024",
      "symbol": "BTCUSDT",
      "timeRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T23:59:59Z"
      }
    },
    "strategyParams": {
      "fastPeriod": 10,
      "slowPeriod": 30,
      "positionSize": 0.5
    },
    "executionConfig": {
      "initialCapital": 10000,
      "leverage": 1,
      "slippage": {
        "type": "fixed",
        "value": 0.001
      },
      "fees": {
        "makerFee": 0.0002,
        "takerFee": 0.0005
      }
    },
    "dataConfig": {
      "timeRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T23:59:59Z"
      }
    },
    "status": "completed",
    "progress": 100,
    "submittedAt": "2024-11-12T10:30:00Z",
    "queuedAt": "2024-11-12T10:30:05Z",
    "startedAt": "2024-11-12T10:31:00Z",
    "completedAt": "2024-11-12T10:45:30Z",
    "resultSummary": {
      "totalReturn": 0.158,
      "annualizedReturn": 0.187,
      "maxDrawdown": -0.082,
      "sharpeRatio": 1.42,
      "winRate": 0.65,
      "totalTrades": 145,
      "processedEvents": 8760,
      "executionTime": 870
    },
    "resultFilePath": "/results/task-uuid-123.parquet",
    "createdBy": "user-123",
    "createdAt": "2024-11-12T10:30:00Z",
    "updatedAt": "2024-11-12T10:45:30Z"
  }
}
```

---

### 4.4 取消任务

#### POST `/tasks/:taskId/cancel`

**请求体**:
```typescript
{
  reason?: string;  // 取消原因（可选）
}
```

**响应示例**:
```json
{
  "data": {
    "taskId": "task-uuid-123",
    "status": "cancelled",
    "cancelledAt": "2024-11-12T10:35:00Z"
  },
  "message": "任务已取消"
}
```

**错误响应**:
```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "任务当前状态不允许取消",
    "details": {
      "currentStatus": "completed",
      "allowedStatuses": ["queued", "running"]
    }
  },
  "timestamp": "2024-11-12T10:35:00Z"
}
```

---

### 4.5 获取任务日志

#### GET `/tasks/:taskId/logs`

**查询参数**:
```typescript
{
  page?: number;
  pageSize?: number;  // 默认100
  level?: LogLevel[];  // 日志级别筛选
  keyword?: string;    // 关键词搜索
  startTime?: string;  // 开始时间
  endTime?: string;    // 结束时间
}
```

**响应示例**:
```json
{
  "data": {
    "items": [
      {
        "logId": 12345,
        "taskId": "task-uuid-123",
        "level": "info",
        "module": "Orchestrator",
        "message": "任务开始执行",
        "metadata": {
          "sessionId": "session-123"
        },
        "loggedAt": "2024-11-12T10:31:00.000Z"
      },
      {
        "logId": 12346,
        "taskId": "task-uuid-123",
        "level": "info",
        "module": "DataProvider",
        "message": "加载数据集: BTCUSDT-2024",
        "metadata": {
          "datasetId": "dataset-uuid"
        },
        "loggedAt": "2024-11-12T10:31:05.234Z"
      },
      {
        "logId": 12347,
        "taskId": "task-uuid-123",
        "level": "warn",
        "module": "RiskEngine",
        "message": "风控警告: 持仓超过50%",
        "metadata": {
          "position": 0.55,
          "threshold": 0.50
        },
        "loggedAt": "2024-11-12T10:31:11.789Z"
      }
    ],
    "total": 1500,
    "page": 1,
    "pageSize": 100,
    "totalPages": 15
  }
}
```

---

### 4.6 获取任务进度

#### GET `/tasks/:taskId/progress`

**响应示例**:
```json
{
  "data": {
    "taskId": "task-uuid-123",
    "status": "running",
    "progress": 45,
    "processedEvents": 3942,
    "totalEvents": 8760,
    "currentTime": "2024-06-15T10:00:00Z",
    "executionTime": 325,
    "avgSpeed": 12.13,
    "estimatedRemaining": 396
  }
}
```

---

### 4.7 日志流（SSE）

#### GET `/tasks/:taskId/logs/stream`

**响应类型**: `text/event-stream`

**事件格式**:
```
event: log
data: {"level":"info","module":"Orchestrator","message":"处理事件 #1000","loggedAt":"2024-11-12T10:35:00Z"}

event: log
data: {"level":"info","module":"Strategy","message":"开仓信号","loggedAt":"2024-11-12T10:35:01Z"}

event: progress
data: {"progress":50,"processedEvents":4380}

event: complete
data: {"taskId":"task-uuid-123","status":"completed"}
```

**客户端使用示例**:
```typescript
const eventSource = new EventSource('/api/v1/backtesting/tasks/task-uuid-123/logs/stream');

eventSource.addEventListener('log', (e) => {
  const log = JSON.parse(e.data);
  console.log(log.message);
});

eventSource.addEventListener('progress', (e) => {
  const progress = JSON.parse(e.data);
  updateProgressBar(progress.progress);
});

eventSource.addEventListener('complete', (e) => {
  const result = JSON.parse(e.data);
  console.log('任务完成');
  eventSource.close();
});
```

---

## 5. 错误处理

### 5.1 错误代码

| 错误代码 | HTTP状态码 | 说明 |
|---------|-----------|------|
| `VALIDATION_ERROR` | 400 | 参数校验失败 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `UNAUTHORIZED` | 401 | 未认证 |
| `FORBIDDEN` | 403 | 无权限 |
| `INVALID_STATE` | 400 | 状态不允许该操作 |
| `RESOURCE_CONFLICT` | 409 | 资源冲突 |
| `RATE_LIMIT` | 429 | 请求频率过高 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### 5.2 错误响应示例

#### 参数校验失败
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数不合法",
    "details": {
      "field": "strategyParams.fastPeriod",
      "rule": "min",
      "expected": 1,
      "actual": 0
    }
  },
  "timestamp": "2024-11-12T10:30:00Z"
}
```

#### 资源不存在
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "任务不存在",
    "details": {
      "taskId": "task-uuid-not-exist"
    }
  },
  "timestamp": "2024-11-12T10:30:00Z"
}
```

#### 状态不允许
```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "任务已完成，无法取消",
    "details": {
      "taskId": "task-uuid-123",
      "currentStatus": "completed",
      "requiredStatuses": ["queued", "running"]
    }
  },
  "timestamp": "2024-11-12T10:30:00Z"
}
```

---

## 6. 实时通信

### 6.1 SSE连接生命周期

```typescript
// 1. 客户端发起连接
GET /api/v1/backtesting/tasks/:taskId/logs/stream
Headers:
  Authorization: Bearer <token>
  Accept: text/event-stream

// 2. 服务器保持连接
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 3. 服务器推送事件
event: log
data: {...}

// 4. 心跳（每30秒）
: heartbeat

// 5. 任务完成或错误时关闭
event: complete
data: {...}
```

### 6.2 重连机制

```typescript
const connectSSE = (taskId: string) => {
  let retryCount = 0;
  const maxRetries = 3;
  
  const connect = () => {
    const es = new EventSource(`/api/v1/backtesting/tasks/${taskId}/logs/stream`);
    
    es.onerror = () => {
      es.close();
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(connect, 1000 * retryCount);
      }
    };
    
    return es;
  };
  
  return connect();
};
```

---

## 7. 接口测试

### 7.1 Postman Collection

```json
{
  "info": {
    "name": "Backtest Tasks API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "创建任务",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/tasks",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"taskName\": \"测试任务\",\n  \"strategyId\": \"{{strategyId}}\",\n  \"scriptVersionId\": \"{{versionId}}\",\n  \"datasetId\": \"{{datasetId}}\",\n  \"strategyParams\": {},\n  \"executionConfig\": {\n    \"initialCapital\": 10000,\n    \"leverage\": 1\n  }\n}"
        }
      }
    }
  ]
}
```

---

## 8. API版本控制

### 8.1 版本策略

- 当前版本: `v1`
- URL包含版本号: `/api/v1/backtesting`
- 破坏性变更需要新版本

### 8.2 废弃策略

1. 提前3个月公告
2. 响应头添加废弃提示
3. 文档标记废弃

```http
Deprecated: API version v1 will be removed on 2025-12-31
```

---

**文档版本**: 1.0  
**最后更新**: 2025-11-12  
**维护者**: Development Team

