# 交易数据导入与清洗设计

本文档记录当前阶段的 OHLCV 数据导入、清洗与存储方案，作为后续实现与协作的依据。

## 导入流程概览

单次导入处理一个原始文件，由人工触发，统一经过以下步骤：

1. **格式检测**：根据文件扩展名或头部特征识别支持的格式（zst/CSV/JSON 等），并匹配对应插件。
2. **数据转换**：调用插件读取原始数据，按平台统一 OHLCV 标准产出记录流（时间戳、开高低收、成交量等）。
3. **数据汇总**：在转换过程中统计时间范围、记录数量、校验值（如 MD5/CRC）。
4. **写入存储**：生成 Parquet 文件落盘，并通过 DuckDB 进行查询注册。
5. **元数据入库**：将数据集描述与导入纪录写入 PostgreSQL，方便检索与运营追踪。

数据一旦清洗完成即视为只读，不支持后续内容修改。

## 插件约定

考虑到数据源类型有限，目前采用轻量的硬编码插件方式，每种格式实现一个插件（如 `CsvOhlcvPlugin`、`JsonOhlcvPlugin`）。插件需实现以下约定接口：

- `supports(format: string): boolean`：判断是否支持指定格式。
- `transform(rawPath: string, context): Iterable<OhlcvRecord>`：读取并产出统一字段的 OHLCV 记录。
- `handleError?(rawPath: string, error: Error)`：可选，用于在导入失败时记录额外调试信息。

导入服务内维护一个内存 `PluginRegistry`，插件通过注册函数声明 `name`、`version`、`supportedFormats`。执行时根据格式选择唯一插件运行。

### 统一数据模式

标准 OHLCV 记录字段：

- `timestamp`: 交易时间（UTC）
- `open`, `high`, `low`, `close`: 价格
- `volume`: 成交量
- 可扩展附加字段：`turnover`、`open_interest` 等

所有额外字段需在数据集标签或描述中登记，便于后续分析侧识别。

## 存储策略

### Parquet + DuckDB

- 数据目录：`/datasets/{source-or-unknown}/{trading_pair}/{granularity}/batch_{ingestTime}_{timeStart}_{timeEnd}.parquet`（当来源为空时使用占位符 `unknown`）
- 每个导入批次生成独立文件，包含时间范围、行数、校验值。
- 建议设置合适的 `row_group_size`（约 256MB）以兼顾大批量读写效率。
- 导入完成后通过 DuckDB 注册外部表，启用 `PRAGMA enable_object_cache`，并按时间字段分区以提升范围查询性能。

### PostgreSQL 元数据

两张核心表即可支撑当前需求：

```sql
CREATE TABLE datasets (
  dataset_id      SERIAL PRIMARY KEY,
  source          TEXT,
  trading_pair    TEXT NOT NULL,
  granularity     TEXT NOT NULL,
  path            TEXT NOT NULL,
  time_start      TIMESTAMP NOT NULL,
  time_end        TIMESTAMP NOT NULL,
  row_count       BIGINT NOT NULL,
  checksum        TEXT NOT NULL,
  labels          JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMP DEFAULT now(),
  deleted_at      TIMESTAMP
);

CREATE INDEX idx_datasets_lookup
  ON datasets (COALESCE(source, 'unknown'), trading_pair, granularity, time_start)
  WHERE deleted_at IS NULL;

CREATE TABLE imports (
  import_id       SERIAL PRIMARY KEY,
  source_file     TEXT NOT NULL,
  plugin_name     TEXT NOT NULL,
  plugin_version  TEXT NOT NULL,
  status          TEXT NOT NULL,
  progress        NUMERIC(5,2) DEFAULT 0,
  started_at      TIMESTAMP DEFAULT now(),
  finished_at     TIMESTAMP,
  message         TEXT,
  error_log       TEXT
);
```

`datasets` 记录清洗后数据集的存放位置与统计信息，`labels` 字段承载去重后的自定义标签集合（标签在入库前应去除首尾空格并控制在 25 字以内），并通过 `deleted_at` 字段实现软删除（后续可将 `deleted_at` 置空实现恢复）；`imports` 用于跟踪导入任务状态，同时保留完整错误日志字段，便于在前端展示并支持重新发起清洗。

> 数据库迁移建议使用 NestJS TypeORM 的 migration 机制统一管理上述表结构与字段调整。

## 任务状态与进度

导入任务遵循简化状态机：

- `pending`：创建任务，等待执行；
- `running`：正在处理，定期更新 `imports.progress`（0-100）；
- `completed`：导入成功，写入 `finished_at` 并将进度设为 100；
- `failed`：导入失败，记录错误摘要在 `message` 字段，并将完整日志写入 `error_log`；可选触发插件 `handleError`。

导入服务需在每个阶段（读取、转换、写入、入库）更新状态，确保使用者可以实时了解当前进度与最终结果；若失败，可直接复用原任务上下文重新上传或清洗。

## 后续工作

1. 根据本约定编写插件 SDK 及示例实现，验证统一输出格式。
2. 编写导入服务逻辑，将状态更新写入 `imports` 表并生成 `datasets` 记录。
3. 设计导入触发与监控界面，展示任务状态、进度与基础日志。
