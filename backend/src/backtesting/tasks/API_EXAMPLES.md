# 回测任务管理 API 使用示例

**基础URL**: `http://localhost:3000/api/v1`  
**前缀**: `/backtesting/tasks`

---

## 📋 目录

1. [创建回测任务](#1-创建回测任务)
2. [查询任务列表](#2-查询任务列表)
3. [查询任务详情](#3-查询任务详情)
4. [更新任务信息](#4-更新任务信息)
5. [取消任务](#5-取消任务)
6. [重试失败任务](#6-重试失败任务)
7. [复制任务配置](#7-复制任务配置)
8. [删除任务](#8-删除任务)
9. [查询任务日志](#9-查询任务日志)
10. [查询日志统计](#10-查询日志统计)

---

## 1. 创建回测任务

创建一个新的回测任务。

**端点**: `POST /api/v1/backtesting/tasks`

### 请求示例

```bash
curl -X POST http://localhost:3000/api/v1/backtesting/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "taskName": "双均线策略回测-2024全年",
    "taskDescription": "测试双均线策略在2024年BTC/USDT上的表现",
    "strategyId": "550e8400-e29b-41d4-a716-446655440000",
    "scriptVersionId": "660e8400-e29b-41d4-a716-446655440001",
    "datasetId": 1,
    "strategyParams": {
      "fastPeriod": 10,
      "slowPeriod": 30,
      "positionSize": 0.5
    },
    "executionConfig": {
      "initialCapital": 10000,
      "leverage": 1,
      "slippage": 0,
      "fees": {
        "makerFee": 0.0002,
        "takerFee": 0.0005
      },
      "tradingHours": {
        "start": "00:00",
        "end": "23:59"
      }
    },
    "dataConfig": {
      "timeRange": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T23:59:59Z"
      },
      "timeframe": "1h"
    }
  }'
```

### 响应示例

```json
{
  "taskId": "770e8400-e29b-41d4-a716-446655440002",
  "taskName": "双均线策略回测-2024全年",
  "taskDescription": "测试双均线策略在2024年BTC/USDT上的表现",
  "strategyId": "550e8400-e29b-41d4-a716-446655440000",
  "scriptVersionId": "660e8400-e29b-41d4-a716-446655440001",
  "datasetId": 1,
  "strategyParams": {
    "fastPeriod": 10,
    "slowPeriod": 30,
    "positionSize": 0.5
  },
  "executionConfig": {
    "initialCapital": 10000,
    "leverage": 1,
    "slippage": 0,
    "fees": {
      "makerFee": 0.0002,
      "takerFee": 0.0005
    }
  },
  "dataConfig": {
    "timeRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    },
    "timeframe": "1h"
  },
  "status": "pending",
  "progress": 0,
  "createdAt": "2025-11-12T10:30:00Z",
  "updatedAt": "2025-11-12T10:30:00Z"
}
```

**状态码**:
- `201 Created` - 任务创建成功
- `400 Bad Request` - 请求参数验证失败
- `404 Not Found` - 策略或数据集不存在

---

## 2. 查询任务列表

查询回测任务列表，支持筛选、排序和分页。

**端点**: `GET /api/v1/backtesting/tasks`

### 请求示例

#### 基础查询
```bash
curl "http://localhost:3000/api/v1/backtesting/tasks?page=1&pageSize=20"
```

#### 带筛选条件
```bash
curl "http://localhost:3000/api/v1/backtesting/tasks?strategyId=550e8400-e29b-41d4-a716-446655440000&status=running&page=1&pageSize=10"
```

#### 关键词搜索
```bash
curl "http://localhost:3000/api/v1/backtesting/tasks?keyword=双均线&page=1&pageSize=20"
```

#### 按时间范围筛选
```bash
curl "http://localhost:3000/api/v1/backtesting/tasks?createdAfter=2024-01-01T00:00:00Z&createdBefore=2024-12-31T23:59:59Z"
```

### 查询参数

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `keyword` | string | 否 | 搜索关键词（搜索任务名称和描述） | `双均线` |
| `strategyId` | UUID | 否 | 策略ID筛选 | `550e8400-e29b-41d4-a716-446655440000` |
| `scriptVersionId` | UUID | 否 | 脚本版本ID筛选 | `660e8400-e29b-41d4-a716-446655440001` |
| `datasetId` | integer | 否 | 数据集ID筛选 | `1` |
| `status` | enum | 否 | 任务状态筛选 | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `createdAfter` | ISO8601 | 否 | 创建时间开始 | `2024-01-01T00:00:00Z` |
| `createdBefore` | ISO8601 | 否 | 创建时间结束 | `2024-12-31T23:59:59Z` |
| `sortBy` | enum | 否 | 排序字段 | `createdAt`, `startedAt`, `completedAt`, `taskName` |
| `sortOrder` | enum | 否 | 排序方向 | `asc`, `desc` |
| `page` | integer | 否 | 页码（从1开始） | `1` |
| `pageSize` | integer | 否 | 每页数量 | `20` |

### 响应示例

```json
{
  "tasks": [
    {
      "taskId": "770e8400-e29b-41d4-a716-446655440002",
      "taskName": "双均线策略回测-2024全年",
      "status": "running",
      "progress": 45,
      "createdAt": "2025-11-12T10:30:00Z",
      "startedAt": "2025-11-12T10:31:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 20
}
```

---

## 3. 查询任务详情

查询指定任务的详细信息。

**端点**: `GET /api/v1/backtesting/tasks/:taskId`

### 请求示例

```bash
curl http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002
```

### 响应示例

```json
{
  "taskId": "770e8400-e29b-41d4-a716-446655440002",
  "taskName": "双均线策略回测-2024全年",
  "taskDescription": "测试双均线策略在2024年BTC/USDT上的表现",
  "strategyId": "550e8400-e29b-41d4-a716-446655440000",
  "scriptVersionId": "660e8400-e29b-41d4-a716-446655440001",
  "datasetId": 1,
  "strategyParams": {
    "fastPeriod": 10,
    "slowPeriod": 30,
    "positionSize": 0.5
  },
  "executionConfig": {
    "initialCapital": 10000,
    "leverage": 1,
    "slippage": 0,
    "fees": {
      "makerFee": 0.0002,
      "takerFee": 0.0005
    }
  },
  "dataConfig": {
    "timeRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    },
    "timeframe": "1h"
  },
  "status": "completed",
  "progress": 100,
  "createdAt": "2025-11-12T10:30:00Z",
  "startedAt": "2025-11-12T10:31:00Z",
  "completedAt": "2025-11-12T11:45:00Z",
  "updatedAt": "2025-11-12T11:45:00Z",
  "resultSummary": {
    "totalReturn": 0.235,
    "annualizedReturn": 0.235,
    "maxDrawdown": -0.123,
    "sharpeRatio": 1.85,
    "winRate": 0.58,
    "profitLossRatio": 1.92,
    "totalTrades": 156,
    "finalCapital": 12350,
    "processedBars": 8760,
    "executionTime": 4440
  },
  "resultFilePath": "/data/backtest-results/770e8400-e29b-41d4-a716-446655440002.parquet"
}
```

**状态码**:
- `200 OK` - 查询成功
- `404 Not Found` - 任务不存在

---

## 4. 更新任务信息

更新任务的基本信息（名称、描述等）。

**端点**: `PATCH /api/v1/backtesting/tasks/:taskId`

### 请求示例

```bash
curl -X PATCH http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002 \
  -H "Content-Type: application/json" \
  -d '{
    "taskName": "双均线策略回测-2024全年（优化版）",
    "taskDescription": "使用优化后的参数测试双均线策略"
  }'
```

### 响应示例

```json
{
  "taskId": "770e8400-e29b-41d4-a716-446655440002",
  "taskName": "双均线策略回测-2024全年（优化版）",
  "taskDescription": "使用优化后的参数测试双均线策略",
  "status": "pending",
  "updatedAt": "2025-11-12T10:35:00Z"
}
```

**状态码**:
- `200 OK` - 更新成功
- `400 Bad Request` - 请求参数验证失败
- `404 Not Found` - 任务不存在

---

## 5. 取消任务

取消正在运行或待执行的任务。

**端点**: `POST /api/v1/backtesting/tasks/:taskId/cancel`

### 请求示例

```bash
curl -X POST http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002/cancel
```

### 响应示例

```json
{
  "taskId": "770e8400-e29b-41d4-a716-446655440002",
  "taskName": "双均线策略回测-2024全年",
  "status": "cancelled",
  "completedAt": "2025-11-12T10:40:00Z",
  "updatedAt": "2025-11-12T10:40:00Z"
}
```

**状态码**:
- `200 OK` - 取消成功
- `400 Bad Request` - 任务状态不允许取消（已完成/失败/已取消）
- `404 Not Found` - 任务不存在

---

## 6. 重试失败任务

为失败的任务创建一个重试任务。

**端点**: `POST /api/v1/backtesting/tasks/:taskId/retry`

### 请求示例

```bash
curl -X POST http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002/retry
```

### 响应示例

```json
{
  "taskId": "880e8400-e29b-41d4-a716-446655440003",
  "taskName": "双均线策略回测-2024全年 (Retry)",
  "taskDescription": "测试双均线策略在2024年BTC/USDT上的表现",
  "strategyId": "550e8400-e29b-41d4-a716-446655440000",
  "scriptVersionId": "660e8400-e29b-41d4-a716-446655440001",
  "datasetId": 1,
  "status": "pending",
  "progress": 0,
  "createdAt": "2025-11-12T10:45:00Z",
  "updatedAt": "2025-11-12T10:45:00Z"
}
```

**状态码**:
- `201 Created` - 重试任务创建成功
- `400 Bad Request` - 只有失败的任务可以重试
- `404 Not Found` - 任务不存在

---

## 7. 复制任务配置

复制任务的配置用于快速创建相似任务。

**端点**: `GET /api/v1/backtesting/tasks/:taskId/copy`

### 请求示例

```bash
curl http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002/copy
```

### 响应示例

```json
{
  "taskName": "双均线策略回测-2024全年 (Copy)",
  "taskDescription": "测试双均线策略在2024年BTC/USDT上的表现",
  "strategyId": "550e8400-e29b-41d4-a716-446655440000",
  "scriptVersionId": "660e8400-e29b-41d4-a716-446655440001",
  "datasetId": 1,
  "strategyParams": {
    "fastPeriod": 10,
    "slowPeriod": 30,
    "positionSize": 0.5
  },
  "executionConfig": {
    "initialCapital": 10000,
    "leverage": 1,
    "slippage": 0,
    "fees": {
      "makerFee": 0.0002,
      "takerFee": 0.0005
    }
  },
  "dataConfig": {
    "timeRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    },
    "timeframe": "1h"
  }
}
```

**使用方法**: 修改返回的配置后，通过创建任务API提交。

---

## 8. 删除任务

删除指定任务（运行中的任务无法删除）。

**端点**: `DELETE /api/v1/backtesting/tasks/:taskId`

### 请求示例

```bash
curl -X DELETE http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002
```

### 响应

**状态码**:
- `204 No Content` - 删除成功
- `400 Bad Request` - 运行中的任务无法删除
- `404 Not Found` - 任务不存在

---

## 9. 查询任务日志

查询任务的执行日志，支持下拉加载。

**端点**: `GET /api/v1/backtesting/tasks/:taskId/logs`

### 请求示例

#### 获取最新日志
```bash
curl "http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002/logs?limit=100"
```

#### 下拉加载更早的日志
```bash
curl "http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002/logs?before=12345&limit=100"
```

#### 按级别筛选
```bash
curl "http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002/logs?level=error&limit=50"
```

#### 关键词搜索
```bash
curl "http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002/logs?keyword=trade&limit=100"
```

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `level` | enum | 否 | 日志级别筛选：`debug`, `info`, `warn`, `error` |
| `keyword` | string | 否 | 搜索关键词 |
| `before` | string | 否 | 获取此日志ID之前的日志（用于下拉加载） |
| `limit` | integer | 否 | 返回日志数量（默认100，最大500） |

### 响应示例

```json
{
  "logs": [
    {
      "logId": "12350",
      "taskId": "770e8400-e29b-41d4-a716-446655440002",
      "level": "info",
      "module": "Orchestrator",
      "message": "Backtest session started",
      "metadata": {
        "sessionId": "session-123",
        "timeframe": "1h"
      },
      "loggedAt": "2025-11-12T10:31:00Z"
    },
    {
      "logId": "12349",
      "taskId": "770e8400-e29b-41d4-a716-446655440002",
      "level": "info",
      "module": "StrategySandbox",
      "message": "Strategy initialized",
      "metadata": {
        "strategyId": "550e8400-e29b-41d4-a716-446655440000"
      },
      "loggedAt": "2025-11-12T10:31:01Z"
    }
  ],
  "hasMore": true
}
```

---

## 10. 查询日志统计

查询任务日志的统计信息（按级别分组）。

**端点**: `GET /api/v1/backtesting/tasks/:taskId/logs/stats`

### 请求示例

```bash
curl http://localhost:3000/api/v1/backtesting/tasks/770e8400-e29b-41d4-a716-446655440002/logs/stats
```

### 响应示例

```json
{
  "total": 1524,
  "debug": 856,
  "info": 542,
  "warn": 98,
  "error": 28
}
```

---

## 📊 错误响应格式

所有错误响应都遵循统一格式：

```json
{
  "message": "错误描述",
  "error": "错误类型",
  "statusCode": 400
}
```

### 常见错误码

| 状态码 | 说明 | 示例 |
|--------|------|------|
| `400` | 请求参数错误 | 验证失败、状态不允许操作等 |
| `404` | 资源不存在 | 任务ID不存在 |
| `500` | 服务器错误 | 内部错误 |

---

## 🔧 完整示例：创建并监控任务

```bash
#!/bin/bash

# 1. 创建任务
TASK_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/backtesting/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "taskName": "测试任务",
    "strategyId": "550e8400-e29b-41d4-a716-446655440000",
    "scriptVersionId": "660e8400-e29b-41d4-a716-446655440001",
    "datasetId": 1,
    "strategyParams": {"fastPeriod": 10, "slowPeriod": 30},
    "executionConfig": {
      "initialCapital": 10000,
      "leverage": 1,
      "slippage": 0,
      "fees": {"makerFee": 0.0002, "takerFee": 0.0005}
    },
    "dataConfig": {
      "timeRange": {"start": "2024-01-01T00:00:00Z", "end": "2024-12-31T23:59:59Z"},
      "timeframe": "1h"
    }
  }')

# 提取任务ID
TASK_ID=$(echo $TASK_RESPONSE | jq -r '.taskId')
echo "任务已创建: $TASK_ID"

# 2. 监控任务进度
while true; do
  TASK=$(curl -s http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID)
  STATUS=$(echo $TASK | jq -r '.status')
  PROGRESS=$(echo $TASK | jq -r '.progress')
  
  echo "状态: $STATUS, 进度: $PROGRESS%"
  
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "cancelled" ]; then
    break
  fi
  
  sleep 60  # 每分钟检查一次
done

# 3. 获取结果
if [ "$STATUS" = "completed" ]; then
  echo "任务完成！"
  echo $TASK | jq '.resultSummary'
else
  echo "任务失败或被取消"
  # 查看错误日志
  curl -s "http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID/logs?level=error" | jq '.logs'
fi
```

---

**文档版本**: v1.0  
**最后更新**: 2025-11-12  
**维护者**: Backend Team

