# 多 Worker 真实进程演练手册

> 目标：在真实 Nest 服务/Worker 进程中完成一次端到端演练，验证注册 → 派单 → 状态回调 → 取消/重分配闭环。该流程可用于预发/内网环境或本地多终端排查。

## 1. 先决条件

- Node.js ≥ 18，已运行 `npm install`（根目录、`backend/`、`backtest-worker/`）。
- PostgreSQL/Redis 可选，本演练仅依赖本地 sqlite/内存，不会写入外部存储。
- `backend/.env` 中开启 `BACKTEST_WORKER_ENABLED=true`，并配置 `BACKTEST_WORKER_SHARED_SECRET`（供 Worker 回调）。
- 确认 `libs/backtesting-contracts` 与主/Worker 保持版本一致（本仓已通过 workspace 共享）。

## 2. 启动流程

### 2.1 启动主服务（终端 A）

```bash
cd backend
BACKTEST_WORKER_ENABLED=true \
BACKTEST_WORKER_SHARED_SECRET=dev-secret \
npm run start:dev
```

关键日志：

- `WorkerClientService` 提示 Worker 模式开启。
- `/backtesting/tasks` API 正常对外提供。

### 2.2 启动 Worker（终端 B）

```bash
cd backtest-worker
MAIN_SERVICE_URL=http://127.0.0.1:3000 \
MAIN_SERVICE_REPORT_TOKEN=dev-secret \
WORKER_ID=worker-dev-1 \
WORKER_STRATEGIES="*" \
npm run start:dev
```

验证点：

1. Worker 启动日志显示 `Worker registered: worker-dev-1`.
2. `backend` 日志可见 `/api/v1/internal/workers/register` 被调用。

如需多 Worker，可复制终端 B，将 `WORKER_ID`、`WORKER_PORT`（默认 3001）调整后再次启动，或在 `backtest-worker/scripts/start-workers.sh` 中设置 `WORKER_PM2_INSTANCES` 并运行脚本（内部使用 PM2）。

## 3. 演练脚本

以下命令使用 `curl` 模拟任务创建、执行、取消以及 Worker 失联：

### 3.1 创建并执行任务

```bash
curl -X POST http://127.0.0.1:3000/api/v1/backtesting/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "taskName": "demo-e2e",
    "strategyId": "demo-strategy",
    "scriptVersionId": "demo-version",
    "datasetId": 1,
    "strategyParams": {},
    "executionConfig": { "initialCapital": 10000, "leverage": 1, "slippage": 0, "fees": { "makerFee": 0.0002, "takerFee": 0.0005 } },
    "dataConfig": {
      "timeRange": { "start": "2024-01-01T00:00:00Z", "end": "2024-01-02T00:00:00Z" },
      "timeframe": "1m"
    }
  }'

curl -X POST http://127.0.0.1:3000/api/v1/backtesting/tasks/<taskId>/execute
```

### 3.2 查看状态/进度

```bash
curl http://127.0.0.1:3000/api/v1/backtesting/tasks/<taskId> | jq '.assignedWorkerId, .metricsSnapshot'
```

期望看到 Worker ID 以及实时 `metricsSnapshot`（吞吐、运行任务数等）。

### 3.3 取消任务（验证回调）

```bash
curl -X POST http://127.0.0.1:3000/api/v1/backtesting/tasks/<taskId>/cancel
```

Worker 日志应出现 `Cancelling running task`，主服务日志出现 `TaskStatusStore` 更新。再次查询任务详情，状态应为 `cancelled`，`metricsSnapshot` 保留最后一次 heart-beat。

### 3.4 模拟 Worker 失联 + 重派

1. 暂停某个 Worker 进程（Ctrl+C）。
2. 创建新任务执行。
3. 主服务日志应显示 `selectWorker` 跳过超时节点，并将任务派发给剩余 Worker。`assignedWorkerId` 体现新的 Worker。

### 3.5 监控指标验证

- 主服务暴露 Prometheus 风格指标：`GET http://127.0.0.1:3000/metrics/backtesting`
- 关键字段：
  - `backtest_workers_active`：当前注册 Worker 数
  - `backtest_worker_load{worker_id="..."}`：Worker 正在处理的任务数
  - `backtest_task_status_total{status="running"}`：状态变更累计
  - `backtest_task_last_progress_percent`：最近一次上报的任务进度百分比
- 可在演练过程实时刷新确认注册/取消/失联时指标随之变化，为后续接入 Prometheus/Grafana 打下基础。

## 4. 演练验证清单

| 步骤 | 预期 | 日志/接口 |
| --- | --- | --- |
| Worker 注册 | `/api/internal/workers/register` 返回 200；ServiceRegistry 中可见新 Worker | `backend` 日志 `[ServiceRegistryService] Worker registered` |
| 任务执行 | `/execute` 返回 202；`assignedWorkerId` 不为空 | `task-executor` 中 `WorkerClient` log |
| 进度回调 | `/backtesting/tasks/:id/progress` 被调用，`metricsSnapshot.runningTasks` 更新 | Worker 日志 `MainServiceReporter` |
| 取消 | Worker 收到 `/cancel`，任务状态变更为 `cancelled` | `TaskLogs` 中 `Task cancelled by user` |
| Worker 失联重派 | Heartbeat 超时 → `status=down`，新任务派给其他 Worker | `ServiceRegistryService` warn + 新 `dispatchTask` log |

## 5. CI 嵌入

- `backend/package.json` 新增 `npm run test:workers` / `npm run test:ci`：CI 流水线运行 `npm run test:ci` 即自动执行常规 Jest + in-process worker E2E。
- CI 还会运行 `npm run worker:scripts-check`（调用 `backtest-worker` 的 `scripts:dry-run`）确保 PM2 启停脚本格式正确。
- 演练脚本可写入 CI/CD pipeline 的“手工验证”步骤，结合上方命令自动化执行（可使用 `newman`/`curl` 脚本）。

> 提醒：真实任务依赖交易数据/策略脚本，这里仅演示调度闭环。上线前需结合实际数据集、策略与监控系统完成完整演练。 ***
