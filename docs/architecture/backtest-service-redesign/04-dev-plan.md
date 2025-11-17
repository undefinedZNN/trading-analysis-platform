# 回测服务隔离改造 - 开发任务与进度计划

## 1. 目标与范围

| 目标 | 说明 |
| --- | --- |
| 服务隔离 | 将回测执行从主服务剥离为独立 Worker，支持多实例扩展与故障隔离。 |
| 技术栈一致 | Worker 采用 NestJS，与主服务共享配置、日志、拦截器、契约。 |
| 状态可观测 | Worker 暴露 `/health`、`/tasks/:taskId/status`，主服务可查询任务状态并追踪进度。 |
| 契约统一 | 任务/进度/状态 DTO 抽象到 `libs/backtesting-contracts`，通过 contract test 保证兼容。 |
| 运维易用 | 提供启停脚本、PM2 配置、监控指标与告警策略。 |

不在本轮范围：策略引擎改写、行情数据存储升级、容器编排（预留扩展接口即可）。

## 2. 需求拆解

1. **架构基线**：整理现状、确认资源限制与部署拓扑，复用主服务配置管理方案。
2. **Worker 服务**：
   - Nest 启动入口（`main.ts` + `WorkerModule`）。
   - Controllers：`/execute`、`/tasks/:taskId/status`、`/tasks/:taskId/cancel`、`/health`.
   - 执行器：数据加载、内存管理、进度上报、TaskStatusStore。
   - 注册与心跳：与主服务 `ServiceRegistry` 通信，感知任务负载。
3. **主服务改造**：
   - `ServiceRegistryService` 追踪 Worker 生命周期。
   - `WorkerClientService`/`BacktestOrchestrator` 派单、取消、轮询状态。
   - API/后台任务：对接任务队列、状态查询 API。
4. **共享契约与工具**：
   - DTO/枚举抽象，Pact/contract 测试。
   - 日志/Tracing/Config/Exception Filter 复用。
5. **运维与监控**：
   - 启停脚本、PM2、日志目录、资源限制。
   - 指标：内存、吞吐量、任务耗时、活跃 Worker、失败率。
6. **验收与演练**：
   - 端到端回测流水线演练。
   - Worker 故障切换、任务取消、断点续跑。

## 3. 开发阶段与节奏

| 阶段 | 时间（建议） | 目标 | 核心产出 | 完成标准 |
| --- | --- | --- | --- | --- |
| Phase 0 - 准备 | 1 天 | 对齐架构、资源及依赖 | 任务拆解、环境检查、契约草稿 | 评审通过、文档确认 |
| Phase 1 - 基座搭建 | 3 天 | Worker Nest 化 + shared contracts | `backtest-worker` Nest 模板、`libs/backtesting-contracts`、TaskStatusStore | Worker 启动成功，可返回任务状态 |
| Phase 2 - Worker 执行器 | 4 天 | 实现执行、进度、取消 | `BacktestExecutor`、数据加载、内存控制、状态上报 | 单 Worker 可完成中等规模回测，指标达标（<500MB） |
| Phase 3 - 主服务集成 | 3 天 | 注册、派单、查询、任务编排 | `ServiceRegistryService`、`WorkerClientService`、Orchestrator 接口改造 | 主服务可分配任务至 Worker 并查询状态 |
| Phase 4 - 运维与测试 | 3 天 | 脚本、监控、契约测试 | start/stop 脚本、PM2、健康检查、Pact 测试 | CI 覆盖、监控面板与告警规则可用 |
| Phase 5 - 演练与验收 | 2 天 | 故障演练、性能验证 | E2E 结果、故障恢复报告 | 压测/演练通过，迁移 checklist 全部完成 |

> 时间基于 1~2 人全时投入估算，可根据团队资源调整。

### 当前阶段进展（截至 2025-11-16）

- Phase 0/1：完成架构确认、迁移清单与契约草稿，`libs/backtesting-contracts` 已提供 DTO/状态枚举并被主服务与 Worker 共享，`backtest-worker` Nest 基座（Health/Tasks Controller、ConfigModule、TaskStatusStore）运行稳定。
- Phase 2：迁移 `backend/src/backtesting` 下策略/风控/账本/数据加载逻辑至 `backtest-worker/src/executor` 并通过 `TaskStatusStore` 与 `MainServiceReporter` 上报进度，`npm run test` 覆盖 4 个 suites（executor、data loader、task controller、status store）。
- Phase 3（进行中）：主服务新增 `WorkerClientService`，`BacktestExecutorService` 可在 `BACKTEST_WORKER_ENABLED=true` 时优先派单给 Worker，并通过 `/backtesting/tasks/:taskId/progress|/result` 接收回调；已补充 `ServiceRegistryService`、Worker 注册/心跳与任务闭环（workerId 透传、进度/结果契约、调度重试/负载回收），新增 in-process 多 Worker e2e（`backend/src/backtesting/tasks/multi-worker-orchestration.e2e-spec.ts` + `npm run test:workers`）验证派单/心跳超时/取消全链路，同时提供真实进程演练手册 `05-worker-e2e-playbook.md` 与主/Worker `/metrics` 监控端点。当前 Worker 调度闭环已在主服务落地：`WorkerClientService` 根据注册表挑选实例、`TaskExecutorService` 记录 `assignedWorkerId`/转发取消命令、`BacktestTaskService` 持久化 `metricsSnapshot` 并在完成时释放负载；下一阶段聚焦性能与 UI 展示。
- 下一步：按 `02-service-isolation.md:323-420` 的契约实现 Worker 注册/心跳、主服务调度策略（能力匹配 + 负载均衡）以及 Worker 端注册器与重试逻辑，随后迭代任务闭环与监控。

### 阶段任务拆解与引用

> 如未特别说明，涉及 API/结构的详细设计可参考 `docs/architecture/backtest-service-redesign/02-service-isolation.md` 相应章节。

#### Phase 0 - 准备
- 阅读并确认整体架构和隔离方案（参考 `02-service-isolation.md:62` 起、`01-architecture-overview.md:33`）。
- 梳理现有 `backend/src/backtesting` 模块职责、依赖与技术债，形成迁移 checklist（含策略执行、行情加载、内存管理等）。
- 产出共享契约草稿：列出需要在 `libs/backtesting-contracts` 中定义的 DTO、状态枚举、错误码（需要编写契约示例+单元测试草稿）。
- 明确资源需求（端口、内存、日志目录）及环境变量表，为后续 ConfigModule 校验提供输入。

##### Phase 0 输出（迁移清单 + 契约草稿）

###### 迁移清单

| 模块/路径 | 说明 | Worker 目标位置 | 注意点 |
| --- | --- | --- | --- |
| `backend/src/backtesting/execution` | 核心执行引擎、数据驱动循环、指标计算入口 | `backtest-worker/src/executor` | 参数化批量大小/窗口，接入 `TaskStatusStore`、记录指标 |
| `backend/src/backtesting/strategies` & `strategy` | 策略工厂、策略接口、示例策略 | `backtest-worker/src/strategies` | 统一接口暴露 + 单元测试，确保热插拔 |
| `backend/src/backtesting/data` | DuckDB/Parquet 数据加载、滑动窗口逻辑 | `backtest-worker/src/executor/data-loader.ts` 等 | 需要流式加载、内存阈值控制，mock 数据测试 |
| `backend/src/backtesting/ledger` | 订单、持仓、资金曲线 | `backtest-worker/src/executor/ledger` | 复用实体定义，保证序列化结果与主服务一致 |
| `backend/src/backtesting/risk` | 风控规则、仓位限制 | `backtest-worker/src/backtesting/risk` | 结合策略上下文评估订单，规则可通过任务配置启用/禁用 |
| `backend/src/backtesting/analytics` | 指标计算、报告生成 | `backtest-worker/src/executor/analytics` | 输出结构应匹配主服务存储格式 |
| `backend/src/backtesting/tasks` & `orchestrator` | 任务元数据、编排逻辑 | 拆分：主服务保留调度，Worker 仅保留执行入口 | 明确边界，更新文档/依赖 |
| `backend/src/backtesting/events` | 进度/结果事件发布 | Worker 内部事件或回调 | 与 `TaskProgressEvent` 契约对齐，确保幂等 |
| `backend/src/backtesting/utils` | 通用函数 | 根据用途拆至共享包或 Worker | 清理未使用函数，补充测试 |
| `backend/src/backtesting/tests`、`__tests__`、`e2e-tests` | 单元 & e2e 测试 | Worker 专属测试、主服务契约测试 | 迁移后更新路径、断言，确保测试通过 |

###### 契约草稿（位于 `libs/backtesting-contracts`）

| DTO / 事件 | 说明 | 字段草案 | 引用位置 | 测试要求 |
| --- | --- | --- | --- | --- |
| `ExecuteTaskDto` | 主服务向 Worker 派发回测任务 | `taskId`, `config.strategyId`, `config.datasetId`, `timeRange`, `timeframe`, `parameters` | Worker `/execute`、主服务 `WorkerClientService` | DTO 验证单测，contract 测试请求体必填 |
| `ExecuteTaskResponse` | Worker 确认任务接收 | `taskId`, `workerId`, `status`, `acceptedAt` | `/execute` 响应、任务队列 | e2e 测试覆盖 202/4xx |
| `TaskStatusDto` | 查询任务当前状态 | `taskId`, `status`, `progress`, `metrics`, `updatedAt`, `error?`, `workerId?` | Worker `TaskStatusStore`、主服务查询 API | 单元测试涵盖状态流转；contract 测试响应结构 |
| `TaskProgressEvent` | Worker 上报进度 | `taskId`, `workerId`, `progress`, `processedBars`, `totalBars`, `currentTime`, `metrics` | Worker → 主服务 `/api/internal/tasks/{id}/progress` | 集成测试验证字段完整性与幂等 |
| `TaskResultDto` | 任务完成结果快照 | `taskId`, `workerId`, `summary`, `metrics`, `artifacts` | Worker 上传结果、主服务持久化 | e2e 测试验证结果落库 |
| `CancelTaskDto` | 取消任务请求 | `taskId`, `reason?` | `/tasks/:taskId/cancel` | 单元测试覆盖合法/非法输入 |
| `WorkerRegistrationDto` | Worker 注册参数 | `workerId`, `host`, `port`, `capabilities` | `/api/internal/workers/register` | DTO 验证单测 |
| `WorkerHeartbeatDto` | 心跳/监控上报 | `workerId`, `status`, `currentLoad`, `metrics` | `/api/internal/workers/{id}/heartbeat` | 合约测试模拟 idle/busy/down |
| `WorkerInfoDto` | 主服务对外展示信息 | `workerId`, `status`, `host`, `port`, `capabilities`, `lastHeartbeat` | 管理 API、监控面板 | 映射单测 |

> 每个契约需提供至少一个验证测试 + 一个功能对齐环节（contract/e2e/集成）。迁移清单在 Phase 2 完成时逐条勾选，并在 Phase 5 验收复核。

#### Phase 1 - 基座搭建
- 创建 `backtest-worker` Nest 工程：`main.ts`、`WorkerModule`、`HealthController`、`TasksController`（参考 `02-service-isolation.md:66`、`:110`）。
- 引入 `ConfigModule`、`HttpModule` 并实现配置 schema；编写配置单元测试（验证必填字段、默认值）。
- 设计并实现 `TaskStatusStore` 初版（`02-service-isolation.md:253`），包含状态 CRUD、聚合指标接口；补充单元测试覆盖状态流转。
- 输出初版 `/health`、`/tasks/:id/status` 接口 contract test（可基于 Nest e2e 测试或 contract 工具）。

#### Phase 2 - Worker 执行器迁移
- 将 `backend/src/backtesting` 下的回测框架代码迁移/重构到 `backtest-worker/src/executor`，包括策略入口、数据加载器、内存管理和取消逻辑；Worker 通过 `TaskConfigDto.parameters` 支持主服务动态传入策略类型、初始资金、风险规则。
- 接入 `TaskStatusStore`：执行开始/进度/完成/失败/取消时更新状态；在任务完成时写入执行指标（订单/成交/收益、Ledger 统计、账户权益），方便主服务展示结果；添加与状态相关的单元测试。
- 根据 `02-service-isolation.md:110` 所述接口，确保 `/execute` 可异步执行并处理错误上报；编写 e2e 测试模拟任务执行。
- 校准资源占用：补充内存/吞吐量基准测试，记录结果作为 Phase 2 的验收输入。

#### Phase 3 - 主服务集成（进行中）
- **Worker 注册 & 心跳**：实现 `ServiceRegistryService`、`WorkerRegistrationController`，遵循 `02-service-isolation.md:323-420` 的接口定义（`/api/internal/workers/register`、`/heartbeat`、`/deregister`），记录 host、端口、能力（支持策略/最大并发）、当前负载和最新心跳；提供过期清理与手动下线。
- **Worker 端注册器**：在 `backtest-worker/src/executor/main-service-reporter.ts` 基础上扩展 `WorkerRegistrationService`，在启动时注册、按 `worker.reporting.heartbeatInterval` 心跳、退出前注销；失败时退避重试并写入结构化日志。
- **调度与能力匹配**：`WorkerClientService` 根据注册表选择 Worker（Idle 优先，其次负载/能力匹配，必要时考虑数据 locality），无法匹配时回退到本地执行；调度策略需暴露 metrics 供监控（`runningTasks`、`avgLatency`）。
- **任务透传 & 回调**：任务创建/取消/状态查询 API 统一通过 Orchestrator 派单；`BacktestTaskEntity.metricsSnapshot`（参考 `backend/src/backtesting/tasks`）用于持久化 Worker 回传指标，并确保 `TaskConfigDto.parameters` 完整透传策略参数、初始资金、风险规则。
- **测试与验收**：新增 contract/e2e 测试模拟多 Worker 注册、节点失联、任务重试、回调鉴权缺失的容错路径；对关键 service（registry、client、worker-side registration）编写单元测试，确保异常/超时处理覆盖。

#### Phase 4 - 运维与测试
- 完成 `scripts/start-workers.sh`、`scripts/stop-workers.sh` 和 PM2/服务管理配置（`02-service-isolation.md:520` 起）；为脚本编写 smoke 测试或至少 dry-run 自检。
- 接入监控指标：日志结构化、健康检查、OpenTelemetry/metrics（参见 `02-service-isolation.md:603` 起）；撰写监控配置文档。
- 扩充 CI：包含单元测试、e2e/contract 测试、lint、资源基准脚本；失败条件记录在 README/计划中。
- 功能对齐：与主服务功能清单核对（任务创建/进度/取消/恢复），形成 checklist 并完成对勾。

#### Phase 5 - 演练与验收
- 运行端到端回测流程（含多 Worker 并行），记录性能数据，与 Phase 2 基准对比。
- 执行故障演练：Worker 崩溃、网络抖动、任务取消与断点续跑，验证 Orchestrator 行为；形成演练报告。
- 验证迁移 checklist：检查 `backend/src/backtesting` 残留逻辑、配置、文档是否同步更新。
- 交付最终运维手册（含监控、告警、排障）与 FAQ，回收所有开放的测试/演练任务。

## 4. 工作包与依赖

| 编号 | 工作包 | 说明 | 依赖 | 责任人 | 交付物 |
| --- | --- | --- | --- | --- | --- |
| W1 | 契约抽象 | 创建 `libs/backtesting-contracts` 并迁移 DTO/状态枚举 | 无 | 待定 | 新库 + 使用示例 |
| W2 | Worker Nest 模板 | `main.ts`、`WorkerModule`、配置、Health/Tasks Controller | W1 | 待定 | 可运行 Worker 服务 |
| W3 | TaskStatusStore & Executor | 迁移 `backend/src/backtesting` 中的回测框架（执行器、策略、内存管理等）并完善状态存储、执行流程、取消/失败处理；回测完成后输出策略/风险/账本指标 | W2 | 待定 | `BacktestExecutor` + 单元测试 |
| W4 | 注册/心跳 | `WorkerRegistrationService`、心跳/注销逻辑 | W2 | 待定 | Worker 可在主服务注册表展示 |
| W5 | Service Registry | 主服务 registry、清理、选择策略 | W1 | 待定 | Registry 服务及 API |
| W6 | Worker Client & Orchestrator | 调度、取消、状态查询整合 | W5 | 待定 | 任务生命周期闭环 |
| W7 | 运维脚本/PM2 | `start-workers.sh`、`stop-workers.sh`、ecosystem 配置 | W2 | 待定 | 可启动/停止多实例 |
| W8 | 监控 & 契约测试 | 指标采集、健康检查、Pact/contract tests | W2/W5 | 待定 | 监控仪表盘 + CI 断言 |
| W9 | 演练与文档 | 故障演练、迁移指导、FAQ | 全部 | 待定 | 演练记录 + 运维手册 |

## 5. 进度追踪

| 工作包 | 状态 | 起止日期 | 备注 |
| --- | --- | --- | --- |
| W1 - 契约抽象 | Done | 11/10 - 11/10 | `libs/backtesting-contracts` 已落地，DTO/状态枚举 + contract tests（参考 `libs/backtesting-contracts/__tests__`）。 |
| W2 - Worker Nest 模板 | Done | 11/10 - 11/11 | `backtest-worker` 主干、Health/Tasks Controller、配置校验完成。 |
| W3 - TaskStatusStore & Executor | Done | 11/11 - 11/14 | `backtest-worker/src/executor` 迁移 + 策略/风控/账本整合，含 `task-status.store.spec.ts`、`backtest-executor.spec.ts`。 |
| W4 - 注册/心跳 | Todo | 11/16 - 11/18（计划） | 待实现 Worker 端注册器 + `/api/internal/workers/*` 控制面；需与配置/日志联动。 |
| W5 - Service Registry | Todo | 11/16 - 11/19（计划） | 设计/实现 `ServiceRegistryService`、心跳超时清理、能力/负载模型；与 ORM/缓存集成待定。 |
| W6 - Worker Client & Orchestrator | In Progress | 11/13 - 11/20 | Worker Client/Orchestrator 已完成 worker 注册表接入、智能调度/重试、任务回调闭环（派单选路、取消转发、`assignedWorkerId`/`metricsSnapshot` 持久化），并补充多 Worker e2e（`npm run test:workers`）+ 真实进程演练手册 `05-worker-e2e-playbook.md`；待补性能压测与 UI 展示。 |
| W7 - 运维脚本/PM2 | Todo | 11/20 - 11/22（计划） | 启停脚本、PM2 ecosystem、smoke 测试未启动。 |
| W8 - 监控 & 契约测试 | Todo | 11/22 - 11/24（计划） | 需补 metrics 暴露、Pact/contract pipeline。 |
| W9 - 演练与文档 | Todo | 11/24 - 11/25（计划） | 故障演练、运维手册、FAQ 暂未开始。 |

更新规则：
- 每日站会后同步状态与风险，如状态 Blocked 需注明原因/协助人。
- 交付后将状态置为 Done，并在备注中加入 PR/测试报告等引用。

## 6. 风险与缓解

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| DTO 改动导致主/Worker 不兼容 | 线上任务失败 | 严格走 contract test + 版本对齐流程，必要时灰度。 |
| Worker 内存未达标 | 影响稳定性 | 结合压测调参，设置 `--max-old-space-size`，监控触发告警。 |
| 注册表数据漂移 | 派单失败、任务堆积 | 心跳超时清理 + 主动探测，必要时落地持久化缓存。 |
| 运维脚本复杂 | 启停失败 | 使用 PM2/系统服务托管，脚本内加入 PID/日志校验。 |
| 故障演练覆盖不足 | 上线风险 | 在 Phase 5 前完成 Worker 崩溃/网络隔离/重试等演练。 |

## 7. 验收清单

- [ ] 多 Worker 并发执行，主服务可正确分配与回收任务。
- [ ] `/tasks/:taskId/status`、`/health` 接口符合契约，监控面板实时更新。
- [ ] 任务取消/失败可回调至主服务并触发重试策略。
- [ ] 启停脚本、PM2、日志/指标接入均已验证。
- [ ] 演练记录与运维手册发布到内部知识库。

> 文档使用中如需调整，请在对应工作包 PR 中同步更新，并在计划表记录版本。
