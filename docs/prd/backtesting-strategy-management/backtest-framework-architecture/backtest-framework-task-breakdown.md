# 回测框架任务拆解清单

最后更新：2025-11-04  
关联文档：  
- 架构设计：`docs/prd/backtesting-strategy-management/backtest-framework-architecture/backtest-framework-architecture.md`  
- 共识纪要：`docs/prd/backtesting-strategy-management/backtest-framework-architecture/backtest-framework-consensus.md`

## 1. 使用说明
- **状态枚举**：`Pending`（未开始）、`In Progress`（进行中）、`Blocked`（被依赖阻塞）、`Review`（联调/测试中）、`Done`（单元测试通过并完成交付物）。  
- **交付物**：每个任务必须包含设计图/流程图、接口定义（TypeScript 类型或 API 契约）、子模块 README、测试策略计划及实现代码。  
- **测试门槛**：单元测试与预期的集成/回归测试通过后方可提交任务；需要在 PR/任务记录中附测试结果。  
- **引用规范**：功能点描述需引用架构/共识文档的行号，便于追溯需求来源。  
- **文档维护**：状态更新或范围变更后同步此清单，保证所有成员掌握最新进度。

## 2. 里程碑与任务

### M1：数据/特征与事件总线基线

| Task ID | 模块 | 状态 | 功能与范围 | 交付物 | 测试要求 | 文档引用 |
|---------|------|------|------------|--------|----------|----------|
| M1-01 | DataProvider | Pending | 实现 Parquet+DuckDB 数据加载、按时间分片、缺口策略（skip/fill）与基础特征注入，输出标准 `BarEvent`。 | 架构图、`fetch`/`setGapPolicy` 接口说明、`data-provider/README.md`、测试计划。 | 单元：分片/缺口策略/字段校验；集成：固定数据集生成 `BarEvent`/`featureCatalog`。 | `backtest-framework-architecture.md:31-34`, `backtest-framework-consensus.md:19-70` |
| M1-02 | TimeframeAdapter | Pending | 构建主/辅助时间框架重采样与同步推送，保证事件对齐和辅助流标记。 | 设计图、API（如 `resample`）、模块 README、测试计划。 | 单元：窗口聚合/对齐；集成：5m 主流+1s 辅流对齐验证。 | `backtest-framework-architecture.md:34`, `backtest-framework-consensus.md:19-38` |
| M1-03 | FeatureRegistry | Pending | 注册内置/自定义特征、参数校验、依赖拓扑、featureCatalog 输出。 | 设计文档、接口类型、README、featureCatalog schema & 生成脚本说明。 | 单元：参数校验/依赖解析；集成：featureSet → catalog 生成。 | `backtest-framework-architecture.md:31-39,53-59`, `backtest-framework-consensus.md:60-257` |
| M1-04 | EventBus & EventStore | Pending | RxJS 事件总线、控制事件、BusState、死信、Checkpoint/EventStore（内存+Parquet）。 | 流程图、`publish/subscribe/state$/control$` 接口、README、快照格式说明。 | 单元：状态机/控制事件/死信；集成：策略→风控→执行伪模块串联。 | `backtest-framework-architecture.md:35,45-61`, `backtest-framework-consensus.md:258-423` |

### M2：策略沙箱、风控与执行撮合

| Task ID | 模块 | 状态 | 功能与范围 | 交付物 | 测试要求 | 文档引用 |
|---------|------|------|------------|--------|----------|----------|
| M2-01 | StrategySandbox | Pending | 生命周期钩子、Manifest 加载、上下文 API、快照恢复、日志/指标输出。 | 设计与上下文序列图、接口定义、示例策略 README、测试计划。 | 单元：钩子触发、参数解析、快照恢复；集成：示例策略跑 mock 行情。 | `backtest-framework-architecture.md:36,45-51,53-59`, `backtest-framework-consensus.md:529-820` |
| M2-02 | RiskEngine | Pending | 插件化规则引擎、RiskState 维护、决策事件/控制流、默认规则集。 | 规则流程图、`RiskRule` 接口文档、模块 README、参数模板与测试策略。 | 单元：MaxOrderSize/MaxLeverage/PnLDailyLimit/StopLoss；集成：intent→decision 链路。 | `backtest-framework-architecture.md:37,45-51,53-59`, `backtest-framework-consensus.md:949-1087` |
| M2-03 | ExecutionEngine | Pending | 订单簿、撮合（市价/限价/止损/TIF）、滑点/手续费模型、execution/portfolio/ledger 生成、快照。 | 状态机图、接口定义、README、模型配置说明、测试计划。 | 单元：价格命中、滑点/费用、TIF；集成：order lifecycle → ledger 对齐。 | `backtest-framework-architecture.md:38,45-51,53-59`, `backtest-framework-consensus.md:823-947` |
| M2-04 | LedgerService | Pending | 交易账簿、PNL、featureCatalog 关联、日志存储。 | 数据流图、schema 定义、README、输出文件说明。 | 单元：schema 校验、feature 对齐；集成：execution→ledger。 | `backtest-framework-architecture.md:39,45-51`, `backtest-framework-consensus.md:16-257,908-947` |

### M3：编排、快照/恢复与结果交付

| Task ID | 模块 | 状态 | 功能与范围 | 交付物 | 测试要求 | 文档引用 |
|---------|------|------|------------|--------|----------|----------|
| M3-01 | Orchestrator & DI | Pending | `BacktestSessionConfig` 合并、依赖注入、Session 状态机、CLI/API。 | 架构图、配置 schema、ServiceContainer 接口、README、CLI 说明。 | 单元：配置校验、状态机；集成：start→pause→resume→stop。 | `backtest-framework-architecture.md:40,62-79,93-100`, `backtest-framework-consensus.md:1126-1285` |
| M3-02 | Snapshot/Resume Coordination | Pending | `SessionSnapshot` 编排、模块快照协议、EventStore 检查点。 | 时序图、快照存储格式、操作手册。 | 单元：快照写读；集成：SnapshotResume 测试策略。 | `backtest-framework-architecture.md:45-51,62-79`, `backtest-framework-consensus.md:268-343,607-620,926-938,1042-1053,1237-1261` |
| M3-03 | Analytics Output & API | Pending | 回测结果导出（ledger、featureCatalog、metrics）、API/下载接口、日志聚合。 | 数据流图、API 文档、README。 | 集成：结果文件 schema 校验、API 拉取。 | `backtest-framework-architecture.md:39-41,62-79`, `backtest-framework-consensus.md:16-257,908-947,1262-1285` |

### M4：测试策略套件与 CI

| Task ID | 模块 | 状态 | 功能与范围 | 交付物 | 测试要求 | 文档引用 |
|---------|------|------|------------|--------|----------|----------|
| M4-01 | 测试策略框架 | Pending | `tests/strategies/*` 目录规范、加载器、断言脚本、报告输出。 | 目录结构图、CLI 文档、README、样例策略。 | 端到端：`PriceEcho`, `FixedRebalance`, `RiskStress`, `SnapshotResume`, `EdgeCase` 回归。 | `backtest-framework-architecture.md:41,80-92,93-100`, `backtest-framework-consensus.md:1288-1346` |
| M4-02 | CI 集成 | Pending | 将框架测试加入 CI，产出 report + diff，失败阻断发布。 | CI 配置说明、报告模板、维护手册。 | 自动触发：pull request / nightly。 | `backtest-framework-architecture.md:80-92,93-100`, `backtest-framework-consensus.md:1288-1346` |

## 3. 共用交付要求
1. **设计图**：建议使用 PlantUML/Mermaid 或 Figma，保存至仓库 `docs/design/`，在 README 中引用。  
2. **接口定义**：所有 TypeScript 接口、事件 schema、配置结构需在 `@platform/backtest` 包或 `docs/api/` 中集中声明。  
3. **子模块 README**：描述模块定位、依赖、启动方式、关键命令与测试指引。  
4. **测试策略计划**：包含目标场景、测试数据、断言、自动化脚本路径。  
5. **单元测试完成即门槛**：没有测试即视为未完成；需要提供测试日志或覆盖率摘要。  
6. **里程碑评审**：每个阶段结束召开评审会（参加方：数据、策略、风控、执行、平台、QA），审查任务状态与测试结果，更新本清单。

## 4. 建议与风险提示
- 尽早确定测试数据与策略脚本，避免实现完成后缺少可复现的验证素材。  
- 模块间接口（尤其事件 schema 与配置）需在评审前冻结，减少后续反复调整。  
- Snapshot/Resume、Ledger 与 FeatureCatalog 的格式一旦上线即视为公共契约，发布前务必进行跨模块联调与版本记录。  
- 任务负责人应在 issue/PR 中链接此文档条目，方便跟踪。  
- 若需要新增任务或拆分，应保持 Task ID 连续并更新里程碑章节，确保透明可追踪。
