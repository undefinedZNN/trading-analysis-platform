# 交易数据管理 API 草案

> 说明：本草案用于前后端对齐接口设计，后续可迁移到 OpenAPI/Swagger 定义。接口以 `/api/v1/trading-data` 为前缀。

## 1. 数据集列表

- `GET /trading-data/datasets`
- 功能：分页查询已导入数据集，默认过滤软删除记录。
- 查询参数：
  - `page`、`pageSize`
  - `source`（可空）
  - `tradingPair`（模糊匹配）
  - `granularity`
  - `dataStart`、`dataEnd`（数据时间范围，返回包含指定区间的数据集）
  - `createdStart`、`createdEnd`
  - `tags`（逗号分隔）
  - `status`（`active`、`deleted`、`all`）
  - `importStatus`（`pending`/`uploading`/`processing`/`completed`/`failed`）
- 返回：
  ```json
  {
    "items": [
      {
        "datasetId": 1,
        "source": "binance",
        "tradingPair": "BTC/USDT",
        "granularity": "1m",
        "timeStart": "2024-01-01T00:00:00Z",
        "timeEnd": "2024-01-01T23:59:00Z",
        "rowCount": 1440,
        "labels": ["crypto", "spot"],
        "status": "completed",
        "createdAt": "2024-01-02T05:00:00Z",
        "deletedAt": null,
        "importStatus": "completed",
        "progress": 100
      }
    ],
    "total": 12
  }
  ```

- `GET /trading-data/datasets/{datasetId}`
- 功能：获取数据集详细信息（含导入任务、错误日志等）。

## 3. 更新元数据

- `PATCH /trading-data/datasets/{datasetId}`
- 功能：更新描述、备注、自定义标签。
- 请求体：
  ```json
  {
    "description": "optional text",
    "remarks": "optional text",
    "labels": ["crypto", "btc"]
  }
  ```

- `POST /trading-data/datasets/{datasetId}/delete`
- 功能：将数据集软删除，写入 `deleted_at`。
- `POST /trading-data/datasets/{datasetId}/restore`
- 功能：恢复软删除的数据集。

## 5. 导入任务创建

- `POST /trading-data/imports`
- 功能：提交导入任务。前端先完成文件上传（可使用 form-data），后端返回任务 ID。
- 请求体（multipart/form-data）：
  - `pluginName`（必填，MVP 使用 `CsvOhlcvPlugin`）
  - `pluginVersion`
  - `createdBy`（可选）
  - `metadata`（JSON 字符串，包含 `source`、`tradingPair`、`granularity`、`labels`、`description` 等）
  - `file`（必填，当前支持 CSV）
- 返回：
  ```json
  {
    "importId": "uuid",
    "datasetId": null,
    "status": "pending"
  }
  ```

## 6. 导入任务状态

- `GET /trading-data/imports`
- 功能：分页查询导入任务，可按状态、来源、交易对、关键字过滤。
- 查询参数：`page`、`pageSize`、`status`、`source`、`tradingPair`、`keyword`

- `GET /trading-data/imports/{importId}`
- 功能：获取任务状态、进度、阶段、错误日志。
- 返回：
  ```json
  {
    "importId": "uuid",
    "status": "processing",
    "progress": 65.5,
    "stage": "cleaning",
    "message": "processing row 10000/20000",
    "errorLog": null,
    "datasetId": 1
  }
  ```

## 7. 重新上传/重试清洗

- `POST /trading-data/imports/{importId}/retry`
- 功能：在失败后重新触发导入，可选择沿用原文件或重新上传。
- 请求体（multipart/form-data，可选上传文件）：
  ```json
  {
    "reuseOriginalFile": true,
    "metadata": {
      "tradingPair": "BTC/USDT",
      "granularity": "1m",
      "labels": ["crypto"]
    }
  }
  ```

## 8. 标签推荐

- `GET /trading-data/datasets/tags`
- 功能：返回当前常用标签列表，支持分页或前缀搜索。

## 9. 错误日志下载

- `GET /trading-data/imports/{importId}/error-log`
- 功能：下载或获取完整错误日志（纯文本），用于前端查看或下载。

## 响应与错误约定

- 成功状态码：`200/201/204`
- 失败状态码：
  - `400` 参数错误或标签超出限制
  - `404` 资源不存在或已删除
  - `409` 导入任务状态冲突（如正在处理时重复重试）
  - `500` 服务器异常
- 错误响应格式：
  ```json
  {
    "code": "IMPORT_IN_PROGRESS",
    "message": "Import is still processing",
    "details": {}
  }
  ```

> 最终实现建议以 NestJS + TypeORM 编写接口，并在 Swagger/OpenAPI 文档中同步更新。
