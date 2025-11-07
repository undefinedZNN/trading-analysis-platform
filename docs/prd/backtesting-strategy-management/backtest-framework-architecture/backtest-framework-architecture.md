# 回测框架技术架构设计

最后更新：2025-11-04  
关联文档：[`backtest-framework-consensus.md`](./backtest-framework-consensus.md)

## 1. 背景与目标
- 基于 TypeScript + RxJS 构建事件驱动的单策略回测框架，输出结构化交易账簿供“交易结果分析”消费。
- 将共识纪要落地成可执行的工程档，指导数据、策略、执行、风控、编排等模块协同实现。
- 在架构阶段明确技术栈、模块边界、接口契约与质量门槛，确保后续迭代按阶段可交付并具备可测试性。

## 2. 设计原则
1. **单一事实源**：所有行情、指令、风控、执行、日志与指标统一走事件总线，并按 `sequenceId` 持久化，便于重放与对账。
2. **配置驱动**：回测会话由 `BacktestSessionConfig` 决定，策略 Manifest、数据源、特征、风控与执行配置通过编排层校验、注入。
3. **精度优先**：数值统一使用 `big.js` 字符串表示，避免浮点误差，跨模块保持一致精度。
4. **可插拔扩展**：FeatureRegistry、RiskRule、Slippage/FeeModel、BusPlugin 等均采用插件化接口，方便按需扩展。
5. **阶段性可测**：每个模块均需提供单元/集成测试与示例数据，形成“实现 + 断言”最小切片。

## 3. 技术栈与基础设施
| 分类 | 选型 | 关键理由 |
|------|------|----------|
| 语言/运行时 | TypeScript + Node.js (ESM) | 与策略脚本一致；类型系统便于约束事件 schema；生态成熟。 |
| 精度 | `big.js` | 统一字符串数值处理，避免浮点误差。 |
| 事件编排 | RxJS 8 + 自定义调度器 | 强大的流式操作、背压和组合能力，易于实现控制事件与插件。 |
| 数据访问 | DuckDB + Parquet、本地 Arrow 缓冲 | 列式读取效率高，支持分片查询与 overlap；离线测试可复现。 |
| 持久化 | Parquet/Arrow (事件存档、featureCatalog、ledger)、JSON 清单 | 与分析层共享格式；易于被 DuckDB 读取。 |
| 依赖注入 | 轻量 ServiceContainer (自研) | 统一组件注册/解析；便于测试替换与多实例。 |
| 日志/指标 | 结构化 JSON log + 可订阅 `metrics$`/`audit$` | 支撑实时监控、调试与回归分析。 |

## 4. 分层架构与模块关系

| 层级 | 核心职责 | 输入/输出 | 关键接口 | 主要依赖 | 负责人 | 阶段测试 |
|------|----------|-----------|----------|----------|--------|----------|
| 数据接入 (`DataProvider`) | 统一加载 Parquet/DuckDB，多源时间对齐、缺口处理、特征预计算 | `FetchRequest` → `BarEvent` 流 | `fetch()`, `setGapPolicy()` | DuckDB, FeatureRegistry | Data Team | 单测：分片/缺口策略；集成：固定数据 → `BarEvent` 校验 |
| 时间框架适配 (`TimeframeAdapter`) | 将最细粒度事件重采样到策略主/辅时间框架 | 原始 `BarEvent` → 聚合/辅助流 | `resample(stream, timeframe)` | RxJS | Data Team | 单测：窗口聚合、对齐；集成：主+辅流同步 |
| 事件总线 (`EventBus`) | 事件路由、背压、控制、检查点、死信 | 任意事件 | `publish`, `subscribe`, `state$`, `control$` | RxJS, EventStore | Platform Team | 单测：控制事件状态机；集成：order→risk→execution 顺序 |
| 策略沙箱 (`StrategySandbox`) | 托管策略生命周期、上下文 API、快照/恢复 | `MarketBar`, `ExecutionReport`, `RiskDecision` 等 | `StrategyLifecycle`, `StrategyContext` | EventBus, FeatureRegistry | Strategy Team | 单测：钩子调用、参数/特征访问；示例策略 e2e |
| 风险控制 (`RiskEngine`) | 插件化规则引擎、状态管理、决策事件 | `strategy.intent`, `portfolio.update`, `market.bar` | `RiskRule.evaluate`, `RiskState` | EventBus, PortfolioStore | Risk Team | 单测：规则断言；集成：拒单/强平链路 |
| 执行撮合 (`ExecutionEngine`) | 模拟订单簿、撮合、市价/限价/TIF、滑点、手续费 | 风控放行指令 + 行情 | `submit`, `cancel`, `ExecutionSnapshot` | Slippage/Fee Model, EventBus | Execution Team | 单测：价格命中、滑点计算；集成：订单生命周期 |
| 交易账簿与日志 (`LedgerService`) | 记录成交、PNL、特征上下文，输出结果文件 | 执行/风控事件 → Parquet/JSON | `appendLedger`, `flush`, `featureCatalog` | EventStore | Analytics Team | 单测：账簿schema；集成：ledger vs execution 对齐 |
| 编排与配置 (`Orchestrator`) | 合并配置、依赖注入、会话状态机、快照协调 | CLI/API 输入 → Session | `start/pause/resume/seek/stop`, `SessionSnapshot` | All above | Platform Team | 单测：配置校验；集成：快照恢复 |
| 测试策略套件 | 固定策略/数据/断言驱动 CI | CLI → 报告 | `pnpm test:framework` | Orchestrator CLI | QA | e2e：五类策略回归 |

模块之间通过事件总线耦合，编排层负责注入依赖并持有快照/恢复流程。数据→策略→风控→执行→账簿构成主路径，日志/指标等辅路径通过 Bus 插件只读监听。

## 5. 数据与事件流
1. **行情管线**：`DataProvider` 依据 `FetchRequest` 按时间分片读 Parquet → 缺口策略 (`skip`/`fill`) → FeatureRegistry 内置与自定义特征计算 → 输出标准 `BarEvent` → `TimeframeAdapter` 生成主/辅流 → 发布到事件总线 `market.bar`。
2. **策略路径**：`StrategySandbox` 订阅 `market.bar` / `aux` / `execution.report` / `risk.decision`，在 `onBar/onAux` 中计算信号并通过 `publishIntent` 产生 `strategy.intent`。
3. **风控路径**：`RiskEngine` 监听 `strategy.intent`、`portfolio.update` 与必要行情，执行规则链 → 发布 `risk.decision`（approve/modify/reject/halt）+ 可选控制事件。
4. **执行路径**：通过 `risk.decision` 的放行指令进入 `ExecutionEngine`，结合实时行情撮合 → 输出 `execution.report`、`portfolio.update`、`ledger.record`，并更新 `RiskEngine`/策略。
5. **控制与快照**：编排器向 `control` 流发布 `START/PAUSE/RESUME/SEEK/SNAPSHOT`，事件总线协调所有模块进入一致状态并生成 `CheckpointSnapshot`。
6. **日志/指标**：策略通过 `ctx.log/metrics` 产生事件，总线将其写入日志存储与监控面板，`sequenceId` 对齐其他事件，方便复盘。

## 6. 关键技术决策
1. **标准事件 Schema**：沿用共识中的 `BaseEvent` + 类型别 payload（行情、策略意图、风控决策、执行回报、账簿、日志、指标、控制、死信），所有模块遵循同一接口，便于序列化与重放。
2. **事件总线实现**：采用 RxJS 多播架构，核心链路（策略→风控→执行）串行执行；可视化/日志通过 `shareReplay` 只读订阅。控制事件改变 `BusState` 并触发检查点。
3. **Checkpoint & EventStore**：`EventStore` 以 Parquet/Arrow 记录 `RecordedEvent`，结合内存环缓冲支持快速 SEEK。`CheckpointSnapshot` 存放 `BusState` + 模块快照（策略、执行、风控、数据游标），恢复时按拓扑顺序重建。
4. **FeatureRegistry**：负责特征定义、参数校验、依赖拓扑、featureCatalog 输出。内置指标按表格声明默认参数；自定义特征通过 `defineFeatures` 注册 `compute` 管道并在事件进入策略前写回 `event.features`。
5. **风险规则插件化**：`RiskRule.evaluate` 返回 `RiskDecisionResult`，可 `modify` 指令或触发 `followUp` 行为；内置 `MaxOrderSize`, `MaxLeverage`, `PnLDailyLimit`, `StopLoss`，后续可按需扩展。
6. **执行撮合策略**：一期默认 `marketFillPolicy=open`、`limitFillPolicy=limitPrice`，支持注入 `SlippageModel`/`FeeModel`；状态以 `ExecutionSnapshot` 记录，恢复后防止重复成交。
7. **依赖注入**：`ServiceContainer` 负责实例注册/解析，模块以 token 获取依赖（如 `FeatureRegistry`, `RiskEngine`），提高测试可替换性。

## 7. 配置与组件装配
```ts
interface BacktestSessionConfig {
  sessionId: string;
  data: DataConfig;
  strategy: StrategyConfig;
  execution: ExecutionConfig;
  risk: RiskConfig;
  analytics?: AnalyticsConfig;
  output?: OutputConfig;
}
```
流程：
1. 编排层加载策略 Manifest（含 `requiredTimeframe`, `featureDeps`, `defaultParameters`）和用户输入。
2. 合并系统默认 → 运行 schema 校验（`ajv`），检查时间粒度、特征、风控/执行模型 ID 等依赖。
3. 注入依赖顺序：DataProvider → TimeframeAdapter → FeatureRegistry → StrategySandbox → RiskEngine → ExecutionEngine → Ledger/Analytics → EventBus → Orchestrator。
4. Orchestrator 公开 CLI/API（`/sessions`, `/pause`, `/resume`, `/seek`, `/snapshot`, `/results`），并维护 `SessionState`。

## 8. 质量与测试策略
| 阶段 | 目标 | 必备测试 | 产出 |
|------|------|----------|------|
| 数据/特征 | 保证 `BarEvent`、缺口策略、指标精度 | 单测：分片、gapPolicy、FeatureRegistry 校验；集成：固定数据 → `featureCatalog` | 样例数据 + `expected-bar-events.json` |
| 事件总线 | 控制状态机、死信、背压 | 单测：`BusState` 转换、控制事件；集成：mock 模块链路 | `bus.spec.ts` + 序列化基准 |
| 策略沙箱 | 生命周期钩子、上下文 API | 单测：参数解析、快照；集成：示例策略对 mock 行情 | `sample-strategy` + fixtures |
| 风控 | 规则执行、状态持久 | 单测：每个规则的参数组合；集成：intent→decision 流程 | `risk.rules.spec.ts`, mock portfolios |
| 执行 | 撮合、费用、快照 | 单测：价格命中、TIF；集成：订单生命周期与 ledger 对齐 | `execution-engine.spec.ts`, deterministic bars |
| Orchestrator | 配置校验、快照恢复 | 单测：配置 schema；集成：start→pause→resume | CLI 回测脚本 |
| 端到端 | CI 回归，覆盖五大策略 (`PriceEcho`, `FixedRebalance`, `RiskStress`, `SnapshotResume`, `EdgeCase`) | `pnpm test:framework` 比较 `expected.json` | 报告 + diff |

所有任务需在 DoD 中写明“实现 + 文档 + 单测/集成测试 + 示例数据”。测试策略套件目录位于 `tests/strategies/`，由 QA/Platform 维护。

## 9. 协作与里程碑
1. **架构评审 (当前)**：确认本文档内容，锁定技术决策与接口，输出行动项。
2. **M1 数据/特征 & 总线**：交付数据层/FeatureRegistry + 事件总线最小可运行版本，完成对应测试。
3. **M2 策略/风控/执行**：策略沙箱、风险引擎、执行撮合串联跑通，产出示例策略与 `FixedRebalance` 用例。
4. **M3 编排 & 结果层**：实现配置合并、快照/恢复、ledger 输出，并完成 `SnapshotResume` e2e。
5. **M4 测试套件 & 确认版**: 建立完整测试策略库，CI 接入，准备 GA。

每个里程碑召开跨组评审（数据、策略、风控、执行、平台、QA 负责人参加），确认接口稳定性与测试覆盖，再进入下一阶段。

---
后续若共识更新或技术选型调整，需同步维护该架构文档，以免实现与基线脱节。
