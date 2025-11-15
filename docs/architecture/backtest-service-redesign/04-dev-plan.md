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

### 阶段任务拆解与引用

> 如未特别说明，涉及 API/结构的详细设计可参考 `docs/architecture/backtest-service-redesign/02-service-isolation.md` 相应章节。

#### Phase 0 - 准备
- 阅读并确认整体架构和隔离方案（参考 `02-service-isolation.md:62` 起、`01-architecture-overview.md:33`）。
- 梳理现有 `backend/src/backtesting` 模块职责、依赖与技术债，形成迁移 checklist（含策略执行、行情加载、内存管理等）。
- 产出共享契约草稿：列出需要在 `libs/backtesting-contracts` 中定义的 DTO、状态枚举、错误码（需要编写契约示例+单元测试草稿）。
- 明确资源需求（端口、内存、日志目录）及环境变量表，为后续 ConfigModule 校验提供输入。

#### Phase 1 - 基座搭建
- 创建 `backtest-worker` Nest 工程：`main.ts`、`WorkerModule`、`HealthController`、`TasksController`（参考 `02-service-isolation.md:66`、`:110`）。
- 引入 `ConfigModule`、`HttpModule` 并实现配置 schema；编写配置单元测试（验证必填字段、默认值）。
- 设计并实现 `TaskStatusStore` 初版（`02-service-isolation.md:253`），包含状态 CRUD、聚合指标接口；补充单元测试覆盖状态流转。
- 输出初版 `/health`、`/tasks/:id/status` 接口 contract test（可基于 Nest e2e 测试或 contract 工具）。

#### Phase 2 - Worker 执行器迁移
- 将 `backend/src/backtesting` 下的回测框架代码迁移/重构到 `backtest-worker/src/executor`，包括策略入口、数据加载器、内存管理和取消逻辑。
- 接入 `TaskStatusStore`：执行开始/进度/完成/失败/取消时更新状态；添加与状态相关的单元测试。
- 根据 `02-service-isolation.md:110` 所述接口，确保 `/execute` 可异步执行并处理错误上报；编写 e2e 测试模拟任务执行。
- 校准资源占用：补充内存/吞吐量基准测试，记录结果作为 Phase 2 的验收输入。

#### Phase 3 - 主服务集成
- 实现/完善 `ServiceRegistryService`、`WorkerClientService`、`BacktestOrchestrator` （参考 `02-service-isolation.md:323`、`:435`），确保与 Worker API 对齐。
- 更新主服务 API/后台任务：任务创建、状态查询、取消流程调用新的 Worker 客户端；单元测试覆盖调度逻辑和错误处理。
- 编写集成测试：模拟多个 Worker 心跳、任务派发与失败场景，验证任务自动重试/重分配。
- 对齐 DTO：确保主服务引用的 DTO 全部来自 `libs/backtesting-contracts`，并通过 contract/pact 测试验证。

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
| W3 | TaskStatusStore & Executor | 迁移 `backend/src/backtesting` 中的回测框架（执行器、策略、内存管理等）并完善状态存储、执行流程、取消/失败处理 | W2 | 待定 | `BacktestExecutor` + 单元测试 |
| W4 | 注册/心跳 | `WorkerRegistrationService`、心跳/注销逻辑 | W2 | 待定 | Worker 可在主服务注册表展示 |
| W5 | Service Registry | 主服务 registry、清理、选择策略 | W1 | 待定 | Registry 服务及 API |
| W6 | Worker Client & Orchestrator | 调度、取消、状态查询整合 | W5 | 待定 | 任务生命周期闭环 |
| W7 | 运维脚本/PM2 | `start-workers.sh`、`stop-workers.sh`、ecosystem 配置 | W2 | 待定 | 可启动/停止多实例 |
| W8 | 监控 & 契约测试 | 指标采集、健康检查、Pact/contract tests | W2/W5 | 待定 | 监控仪表盘 + CI 断言 |
| W9 | 演练与文档 | 故障演练、迁移指导、FAQ | 全部 | 待定 | 演练记录 + 运维手册 |

## 5. 进度追踪模板

| 工作包 | 状态 (Todo/In Progress/Blocked/Done) | 起止日期 | 备注 |
| --- | --- | --- | --- |
| W1 | Todo |  |  |
| W2 | Todo |  |  |
| W3 | Todo |  |  |
| W4 | Todo |  |  |
| W5 | Todo |  |  |
| W6 | Todo |  |  |
| W7 | Todo |  |  |
| W8 | Todo |  |  |
| W9 | Todo |  |  |

更新规则：
- 每日站会后更新状态与风险。
- 若状态变为 Blocked，需要注明阻塞原因与协助人。
- 交付物验收后将状态置为 Done，并在备注中链接 PR/测试报告。

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
