# 回测任务管理 - 数据库设计

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**状态**: ✅ 设计完成

---

## 📋 目录

1. [概述](#1-概述)
2. [表结构设计](#2-表结构设计)
3. [索引设计](#3-索引设计)
4. [关系图](#4-关系图)
5. [数据字典](#5-数据字典)
6. [迁移脚本](#6-迁移脚本)

---

## 1. 概述

### 1.1 设计原则

- **简洁性**: MVP阶段保持表结构简单
- **扩展性**: 为未来功能预留字段
- **性能**: 合理设置索引
- **一致性**: 与现有表结构保持一致的命名规范

### 1.2 表清单

| 表名 | 说明 | 行数预估 |
|------|------|---------|
| `backtest_tasks` | 回测任务主表 | 10,000+ |
| `task_logs` | 任务日志表 | 1,000,000+ |
| `task_snapshots` | 任务快照表（V1.1） | 1,000+ |

---

## 2. 表结构设计

### 2.1 backtest_tasks（回测任务表）

```sql
CREATE TABLE backtest_tasks (
  -- 主键
  task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 任务基本信息
  task_name VARCHAR(100) NOT NULL,
  task_description TEXT,
  
  -- 关联外键
  strategy_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  dataset_id UUID NOT NULL,
  
  -- 配置（JSON格式）
  strategy_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- 状态与进度
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  
  -- 时间戳
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  queued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- 结果摘要
  result_summary JSONB,
  result_file_path VARCHAR(500),
  error_message TEXT,
  
  -- 审计字段
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 外键约束
  CONSTRAINT fk_backtest_tasks_strategy 
    FOREIGN KEY (strategy_id) 
    REFERENCES strategies(strategy_id) 
    ON DELETE RESTRICT,
    
  CONSTRAINT fk_backtest_tasks_script_version 
    FOREIGN KEY (script_version_id) 
    REFERENCES script_versions(script_version_id) 
    ON DELETE RESTRICT,
    
  CONSTRAINT fk_backtest_tasks_dataset 
    FOREIGN KEY (dataset_id) 
    REFERENCES datasets(dataset_id) 
    ON DELETE RESTRICT,
    
  -- 状态检查约束
  CONSTRAINT chk_backtest_tasks_status 
    CHECK (status IN ('submitted', 'queued', 'running', 'completed', 'failed', 'cancelled'))
);

-- 表注释
COMMENT ON TABLE backtest_tasks IS '回测任务主表，存储任务元数据和状态';

-- 字段注释
COMMENT ON COLUMN backtest_tasks.task_id IS '任务唯一标识';
COMMENT ON COLUMN backtest_tasks.task_name IS '任务名称，用户可自定义';
COMMENT ON COLUMN backtest_tasks.task_description IS '任务描述';
COMMENT ON COLUMN backtest_tasks.strategy_id IS '关联的策略ID';
COMMENT ON COLUMN backtest_tasks.script_version_id IS '使用的脚本版本ID';
COMMENT ON COLUMN backtest_tasks.dataset_id IS '使用的数据集ID';
COMMENT ON COLUMN backtest_tasks.strategy_params IS '策略参数配置（JSON）';
COMMENT ON COLUMN backtest_tasks.execution_config IS '执行配置（初始资金、手续费等）';
COMMENT ON COLUMN backtest_tasks.data_config IS '数据配置（时间范围等）';
COMMENT ON COLUMN backtest_tasks.status IS '任务状态：submitted/queued/running/completed/failed/cancelled';
COMMENT ON COLUMN backtest_tasks.progress IS '任务进度百分比（0-100）';
COMMENT ON COLUMN backtest_tasks.submitted_at IS '任务提交时间';
COMMENT ON COLUMN backtest_tasks.queued_at IS '任务进入队列时间';
COMMENT ON COLUMN backtest_tasks.started_at IS '任务开始执行时间';
COMMENT ON COLUMN backtest_tasks.completed_at IS '任务完成时间';
COMMENT ON COLUMN backtest_tasks.result_summary IS '结果摘要（收益率、交易数等）';
COMMENT ON COLUMN backtest_tasks.result_file_path IS 'Parquet结果文件路径';
COMMENT ON COLUMN backtest_tasks.error_message IS '错误信息（失败时）';
```

**字段说明**:

#### strategy_params 示例
```json
{
  "fastPeriod": 10,
  "slowPeriod": 30,
  "positionSize": 0.5,
  "stopLoss": 0.02
}
```

#### execution_config 示例
```json
{
  "initialCapital": 10000,
  "leverage": 1,
  "slippage": {
    "type": "fixed",
    "value": 0.001
  },
  "fees": {
    "makerFee": 0.0002,
    "takerFee": 0.0005
  },
  "tradingHours": {
    "start": "09:00",
    "end": "15:00"
  }
}
```

#### data_config 示例
```json
{
  "timeRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  },
  "timeframe": "1h"
}
```

#### result_summary 示例
```json
{
  "totalReturn": 0.158,
  "annualizedReturn": 0.187,
  "maxDrawdown": -0.082,
  "sharpeRatio": 1.42,
  "winRate": 0.65,
  "totalTrades": 145,
  "processedEvents": 8760,
  "executionTime": 125.5
}
```

---

### 2.2 task_logs（任务日志表）

```sql
CREATE TABLE task_logs (
  -- 主键
  log_id BIGSERIAL PRIMARY KEY,
  
  -- 关联任务
  task_id UUID NOT NULL,
  
  -- 日志内容
  level VARCHAR(10) NOT NULL,
  module VARCHAR(50),
  message TEXT NOT NULL,
  metadata JSONB,
  
  -- 时间戳
  logged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 外键约束
  CONSTRAINT fk_task_logs_task 
    FOREIGN KEY (task_id) 
    REFERENCES backtest_tasks(task_id) 
    ON DELETE CASCADE,
    
  -- 日志级别约束
  CONSTRAINT chk_task_logs_level 
    CHECK (level IN ('debug', 'info', 'warn', 'error'))
);

-- 表注释
COMMENT ON TABLE task_logs IS '任务执行日志表';

-- 字段注释
COMMENT ON COLUMN task_logs.log_id IS '日志ID，自增主键';
COMMENT ON COLUMN task_logs.task_id IS '关联的任务ID';
COMMENT ON COLUMN task_logs.level IS '日志级别：debug/info/warn/error';
COMMENT ON COLUMN task_logs.module IS '日志来源模块（如Orchestrator、Strategy等）';
COMMENT ON COLUMN task_logs.message IS '日志消息内容';
COMMENT ON COLUMN task_logs.metadata IS '日志元数据（JSON格式）';
COMMENT ON COLUMN task_logs.logged_at IS '日志记录时间';
```

**字段说明**:

#### metadata 示例
```json
{
  "sequenceId": "seq-12345",
  "eventType": "BAR",
  "timestamp": "2024-11-12T10:30:00Z",
  "tradeId": "trade-67890",
  "price": 50000,
  "quantity": 0.1
}
```

---

### 2.3 task_snapshots（任务快照表）- V1.1

```sql
CREATE TABLE task_snapshots (
  -- 主键
  snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 关联任务
  task_id UUID NOT NULL,
  
  -- 快照信息
  snapshot_type VARCHAR(20) NOT NULL,
  reason TEXT,
  checkpoint_id VARCHAR(100),
  
  -- 快照数据
  snapshot_size BIGINT,
  file_path VARCHAR(500),
  
  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 外键约束
  CONSTRAINT fk_task_snapshots_task 
    FOREIGN KEY (task_id) 
    REFERENCES backtest_tasks(task_id) 
    ON DELETE CASCADE,
    
  -- 快照类型约束
  CONSTRAINT chk_task_snapshots_type 
    CHECK (snapshot_type IN ('auto', 'manual'))
);

-- 表注释
COMMENT ON TABLE task_snapshots IS '任务快照表（V1.1功能）';

-- 字段注释
COMMENT ON COLUMN task_snapshots.snapshot_id IS '快照ID';
COMMENT ON COLUMN task_snapshots.task_id IS '关联的任务ID';
COMMENT ON COLUMN task_snapshots.snapshot_type IS '快照类型：auto/manual';
COMMENT ON COLUMN task_snapshots.reason IS '创建快照的原因';
COMMENT ON COLUMN task_snapshots.checkpoint_id IS 'Orchestrator返回的checkpointId';
COMMENT ON COLUMN task_snapshots.snapshot_size IS '快照文件大小（字节）';
COMMENT ON COLUMN task_snapshots.file_path IS '快照文件路径';
```

---

## 3. 索引设计

### 3.1 backtest_tasks 索引

```sql
-- 状态索引（用于筛选running/failed等状态）
CREATE INDEX idx_backtest_tasks_status 
ON backtest_tasks(status);

-- 策略索引（用于按策略筛选）
CREATE INDEX idx_backtest_tasks_strategy 
ON backtest_tasks(strategy_id);

-- 数据集索引（用于按数据集筛选）
CREATE INDEX idx_backtest_tasks_dataset 
ON backtest_tasks(dataset_id);

-- 提交时间索引（用于时间范围筛选和排序）
CREATE INDEX idx_backtest_tasks_submitted_at 
ON backtest_tasks(submitted_at DESC);

-- 创建人索引（用于按创建人筛选）
CREATE INDEX idx_backtest_tasks_created_by 
ON backtest_tasks(created_by);

-- 复合索引：状态+提交时间（常用查询组合）
CREATE INDEX idx_backtest_tasks_status_submitted 
ON backtest_tasks(status, submitted_at DESC);
```

### 3.2 task_logs 索引

```sql
-- 任务ID索引（用于查询特定任务的日志）
CREATE INDEX idx_task_logs_task_id 
ON task_logs(task_id);

-- 日志级别索引（用于筛选warn/error日志）
CREATE INDEX idx_task_logs_level 
ON task_logs(level);

-- 时间索引（用于时间范围查询）
CREATE INDEX idx_task_logs_logged_at 
ON task_logs(logged_at DESC);

-- 复合索引：任务+时间（最常用的查询）
CREATE INDEX idx_task_logs_task_logged 
ON task_logs(task_id, logged_at DESC);

-- 复合索引：任务+级别（筛选特定级别日志）
CREATE INDEX idx_task_logs_task_level 
ON task_logs(task_id, level);
```

### 3.3 task_snapshots 索引

```sql
-- 任务ID索引
CREATE INDEX idx_task_snapshots_task_id 
ON task_snapshots(task_id);

-- 创建时间索引
CREATE INDEX idx_task_snapshots_created_at 
ON task_snapshots(created_at DESC);
```

---

## 4. 关系图

```
┌─────────────────────┐
│    strategies       │
│  (阶段1已有)         │
└──────────┬──────────┘
           │
           │ 1:N
           ↓
┌─────────────────────┐
│  script_versions    │
│  (阶段1已有)         │
└──────────┬──────────┘
           │
           │
           ↓                    ┌─────────────────────┐
┌─────────────────────┐         │     datasets        │
│  backtest_tasks     │←────────│  (交易数据管理已有)  │
│  (新增)             │  N:1    └─────────────────────┘
└──────────┬──────────┘
           │
           │ 1:N
           ↓
┌─────────────────────┐
│    task_logs        │
│  (新增)             │
└─────────────────────┘
           │
           │ 1:N (V1.1)
           ↓
┌─────────────────────┐
│  task_snapshots     │
│  (新增, V1.1)        │
└─────────────────────┘
```

---

## 5. 数据字典

### 5.1 枚举值定义

#### TaskStatus（任务状态）
```typescript
enum TaskStatus {
  SUBMITTED = 'submitted',   // 已提交
  QUEUED = 'queued',        // 排队中
  RUNNING = 'running',      // 运行中
  COMPLETED = 'completed',  // 已完成
  FAILED = 'failed',        // 失败
  CANCELLED = 'cancelled'   // 已取消
}
```

#### LogLevel（日志级别）
```typescript
enum LogLevel {
  DEBUG = 'debug',  // 调试信息
  INFO = 'info',    // 一般信息
  WARN = 'warn',    // 警告
  ERROR = 'error'   // 错误
}
```

#### SnapshotType（快照类型）
```typescript
enum SnapshotType {
  AUTO = 'auto',    // 自动快照
  MANUAL = 'manual' // 手动快照
}
```

### 5.2 字段长度限制

| 字段 | 类型 | 长度 | 说明 |
|------|------|------|------|
| task_name | VARCHAR | 100 | 任务名称 |
| status | VARCHAR | 20 | 状态枚举值 |
| level | VARCHAR | 10 | 日志级别 |
| module | VARCHAR | 50 | 模块名称 |
| created_by | VARCHAR | 64 | 用户标识 |
| result_file_path | VARCHAR | 500 | 文件路径 |

---

## 6. 迁移脚本

### 6.1 创建迁移文件

**文件名**: `1732950000000-create-backtest-tasks.ts`

```typescript
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateBacktestTasks1732950000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 确保UUID扩展存在
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 创建 backtest_tasks 表
    await queryRunner.createTable(
      new Table({
        name: 'backtest_tasks',
        columns: [
          {
            name: 'task_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'task_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'task_description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'strategy_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'script_version_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'dataset_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'strategy_params',
            type: 'jsonb',
            isNullable: false,
            default: "'{}'::jsonb",
          },
          {
            name: 'execution_config',
            type: 'jsonb',
            isNullable: false,
            default: "'{}'::jsonb",
          },
          {
            name: 'data_config',
            type: 'jsonb',
            isNullable: false,
            default: "'{}'::jsonb",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'submitted'",
          },
          {
            name: 'progress',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'submitted_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'queued_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'result_summary',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'result_file_path',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'updated_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 添加外键约束
    await queryRunner.createForeignKey(
      'backtest_tasks',
      new TableForeignKey({
        name: 'fk_backtest_tasks_strategy',
        columnNames: ['strategy_id'],
        referencedTableName: 'strategies',
        referencedColumnNames: ['strategy_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'backtest_tasks',
      new TableForeignKey({
        name: 'fk_backtest_tasks_script_version',
        columnNames: ['script_version_id'],
        referencedTableName: 'script_versions',
        referencedColumnNames: ['script_version_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'backtest_tasks',
      new TableForeignKey({
        name: 'fk_backtest_tasks_dataset',
        columnNames: ['dataset_id'],
        referencedTableName: 'datasets',
        referencedColumnNames: ['dataset_id'],
        onDelete: 'RESTRICT',
      }),
    );

    // 创建索引
    await queryRunner.createIndex(
      'backtest_tasks',
      new TableIndex({
        name: 'idx_backtest_tasks_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_tasks',
      new TableIndex({
        name: 'idx_backtest_tasks_strategy',
        columnNames: ['strategy_id'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_tasks',
      new TableIndex({
        name: 'idx_backtest_tasks_dataset',
        columnNames: ['dataset_id'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_tasks',
      new TableIndex({
        name: 'idx_backtest_tasks_submitted_at',
        columnNames: ['submitted_at'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_tasks',
      new TableIndex({
        name: 'idx_backtest_tasks_created_by',
        columnNames: ['created_by'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_tasks',
      new TableIndex({
        name: 'idx_backtest_tasks_status_submitted',
        columnNames: ['status', 'submitted_at'],
      }),
    );

    // 添加约束
    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      ADD CONSTRAINT chk_backtest_tasks_status
      CHECK (status IN ('submitted', 'queued', 'running', 'completed', 'failed', 'cancelled'));
    `);

    await queryRunner.query(`
      ALTER TABLE backtest_tasks
      ADD CONSTRAINT chk_backtest_tasks_progress
      CHECK (progress >= 0 AND progress <= 100);
    `);

    // 创建 task_logs 表
    await queryRunner.createTable(
      new Table({
        name: 'task_logs',
        columns: [
          {
            name: 'log_id',
            type: 'bigserial',
            isPrimary: true,
          },
          {
            name: 'task_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'level',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'module',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'logged_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 添加外键
    await queryRunner.createForeignKey(
      'task_logs',
      new TableForeignKey({
        name: 'fk_task_logs_task',
        columnNames: ['task_id'],
        referencedTableName: 'backtest_tasks',
        referencedColumnNames: ['task_id'],
        onDelete: 'CASCADE',
      }),
    );

    // 创建索引
    await queryRunner.createIndex(
      'task_logs',
      new TableIndex({
        name: 'idx_task_logs_task_id',
        columnNames: ['task_id'],
      }),
    );

    await queryRunner.createIndex(
      'task_logs',
      new TableIndex({
        name: 'idx_task_logs_level',
        columnNames: ['level'],
      }),
    );

    await queryRunner.createIndex(
      'task_logs',
      new TableIndex({
        name: 'idx_task_logs_logged_at',
        columnNames: ['logged_at'],
      }),
    );

    await queryRunner.createIndex(
      'task_logs',
      new TableIndex({
        name: 'idx_task_logs_task_logged',
        columnNames: ['task_id', 'logged_at'],
      }),
    );

    await queryRunner.createIndex(
      'task_logs',
      new TableIndex({
        name: 'idx_task_logs_task_level',
        columnNames: ['task_id', 'level'],
      }),
    );

    // 添加约束
    await queryRunner.query(`
      ALTER TABLE task_logs
      ADD CONSTRAINT chk_task_logs_level
      CHECK (level IN ('debug', 'info', 'warn', 'error'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除 task_logs 表
    await queryRunner.dropTable('task_logs');

    // 删除 backtest_tasks 表
    await queryRunner.dropTable('backtest_tasks');
  }
}
```

---

## 7. 性能优化建议

### 7.1 分区策略（未来优化）

当数据量增长到一定规模后，可以考虑按时间分区：

```sql
-- 按月份分区 task_logs
CREATE TABLE task_logs_2024_11 PARTITION OF task_logs
FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

CREATE TABLE task_logs_2024_12 PARTITION OF task_logs
FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');
```

### 7.2 归档策略

```sql
-- 归档90天前的日志到历史表
CREATE TABLE task_logs_archive AS
SELECT * FROM task_logs
WHERE logged_at < NOW() - INTERVAL '90 days';

DELETE FROM task_logs
WHERE logged_at < NOW() - INTERVAL '90 days';
```

### 7.3 查询优化

```sql
-- 使用EXPLAIN分析查询计划
EXPLAIN ANALYZE
SELECT * FROM backtest_tasks
WHERE status = 'running'
ORDER BY submitted_at DESC
LIMIT 20;
```

---

## 8. 数据示例

### 8.1 任务示例

```sql
INSERT INTO backtest_tasks (
  task_name,
  strategy_id,
  script_version_id,
  dataset_id,
  strategy_params,
  execution_config,
  status
) VALUES (
  'MA策略回测-BTCUSDT-2024',
  'uuid-of-strategy',
  'uuid-of-script-version',
  'uuid-of-dataset',
  '{"fastPeriod": 10, "slowPeriod": 30}'::jsonb,
  '{"initialCapital": 10000, "leverage": 1}'::jsonb,
  'submitted'
);
```

### 8.2 日志示例

```sql
INSERT INTO task_logs (
  task_id,
  level,
  module,
  message,
  metadata
) VALUES (
  'uuid-of-task',
  'info',
  'Orchestrator',
  '任务开始执行',
  '{"sessionId": "session-123"}'::jsonb
);
```

---

## 9. 验收标准

- [ ] 所有表创建成功
- [ ] 所有外键约束生效
- [ ] 所有索引创建成功
- [ ] 所有检查约束生效
- [ ] 迁移可以成功执行和回退
- [ ] 表注释和字段注释完整

---

**文档版本**: 1.0  
**最后更新**: 2025-11-12  
**维护者**: Development Team

