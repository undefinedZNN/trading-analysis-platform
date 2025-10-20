# 交易策略回测引擎架构设计（初稿）
## 1. 整体形态
- **分层结构**：回测平台划分为编排层（Orchestrator）、执行层（Workers）、数据与指标服务层，以及接口层（API 与控制台），实现职责分离与灵活扩展。
- **工作流核心**：回测任务由编排层接收并拆解为执行单元，在多线程 Worker 中运行 TypeScript 策略；执行过程中与数据服务交互、产出指标和因子数据，最终由后处理服务落地结果。
- **部署建议**：MVP 采用单服务内的多进程/多线程模式（Node.js Cluster + Worker Threads），为后续演进到消息队列 + 容器化的分布式架构保留扩展接口。

## 2. 关键组件
- **Task Orchestrator**
  - 接收任务、校验配置、生成任务批次与状态机（排队、运行、完成、失败、取消），并写入调度队列。
  - 技术建议：基于 NestJS，使用 RabbitMQ 管理任务队列、优先级与延迟/重试策略。

### 2.1 任务队列拓扑（RabbitMQ）
- **Exchange 设计**
  - `backtest.tasks.exchange`（类型：topic）：接收业务侧提交的任务消息，路由键按策略类型/优先级命名（例如 `strategy.core.high`）。
  - `backtest.tasks.retry.exchange`（类型：topic，延迟插件/TTL）：处理失败重试，结合死信 TTL 触发回流。
  - `backtest.tasks.dlx`（类型：topic）：死信交换机，收集多次失败或超时的任务，供运维排查。
- **Queue 设计**
  - `backtest.tasks.queue`: 主消费队列，配置 `x-max-priority`=10、`prefetch`=10，绑定路由键 `strategy.*.*`。
  - `backtest.tasks.retry.queue`: 延迟重试队列，配置 `x-message-ttl`=5s/10s/20s（根据重试次数动态设置），死信目标指向主 exchange。
  - `backtest.tasks.dlq`: 死信队列，持久化失败记录，触发告警。
- **状态流转**
  ```
  Submitted
     │ publish(strategy.priority.<level>)
     ▼
  backtest.tasks.queue ──► Worker Ack
     │ Nack w/ requeue=false (on failure)
     ▼
  backtest.tasks.retry.exchange ──► backtest.tasks.retry.queue ──(TTL 到期)─► backtest.tasks.exchange
     │ 重试超过阈值
     ▼
  backtest.tasks.dlx ──► backtest.tasks.dlq ──► 告警/人工干预
  ```
- **控制参数**
  - 每个 Worker 进程设置 `prefetch` 控制并发，避免压垮资源。
  - 使用消息头部记录 `retry-count`，由消费端更新并附带执行用时、错误码。
  - 管理界面（15672）及 Prometheus exporter（可选插件）用于监控队列长度、拒绝数、连接状态。
- **Execution Broker**
  - 从队列拉取任务并分配给 Worker 池；维护 Worker 心跳、资源配额、优先级调度与失败重试。
  - 技术建议：封装 `worker_threads`（如使用 Piscina）或 `child_process` 进程池，提供统一监控接口。
- **Strategy Runtime（Worker）**
  - 加载编译后的策略 bundle，注入 SDK，执行回测循环；捕获订单、指标、因子输出，通过 IPC 流式回传。
  - 安全侧重：沙箱隔离（限制文件系统与网络访问）、依赖白名单及资源限制（CPU/内存超限终止）。
- **Data Access Service**
  - 封装交易数据管理模块的读取接口，支持批量拉取、分片加载、缓存策略，兼容 K 线、成交明细与衍生指标。
  - 可在内存/Redis 建立数据缓存，减少重复 IO；为大数据集提供分页或按时间窗口的流式读取。
- **Factor & Metrics Aggregator**
  - 消费 Worker 事件流，执行实时聚合（胜率、收益分布、分位统计）并计算最终绩效指标。
  - 支持内置因子插件（配置化注册）与自定义因子统一入库；必要时拆分为独立服务处理高吞吐因子计算。
- **Result Store**
  - 持久化任务元数据、订单流水、指标与因子序列。建议使用 PostgreSQL 存储元数据，DuckDB/Parquet 保存大体量时序数据，对象存储留存图表/报表文件。
  - 提供查询索引、历史版本管理，以及按条件导出的能力。
- **API & Console**
  - 面向用户的任务提交、状态查询、结果查看、因子筛选界面。
  - 与策略脚本管理模块集成，支持脚本上传、版本记录、依赖审核。

## 3. 数据与控制流
1. 用户通过控制台或 API 提交回测任务（包含策略版本、参数、数据范围、启用因子）。
2. Orchestrator 校验任务并写入任务表，推送至调度队列；Broker 拉取任务，分配空闲 Worker。
3. Worker 初始化运行时：加载 bundle → 注入 SDK → 拉取初始数据块。
4. Worker 按时间推进执行策略，通过 SDK：
   - 请求 Data Access Service 补充数据；
   - 提交订单、成交与账户变动事件；
   - 调用 `recordFactor`、`recordMetric` 等接口记录因子和指标。
5. Aggregator 接收事件流，执行实时聚合、阶段性快照，并触发内置因子计算。
6. 任务完成后，Broker 汇总执行状态与资源耗时；Aggregator 写入最终指标；Result Store 落地全量结果并生成索引。
7. API 层向前端提供任务详情、收益/回撤曲线、因子筛选接口，并支持导出。

## 4. 扩展路线
- **分布式调度**：当单机资源不足，引入独立调度器与容器化 Worker，借助 Kafka/NATS 传递任务与事件，实现水平扩展。
- **实时仿真/纸上交易**：扩展 Worker 以消费实时行情流，沿用相同策略 SDK 与执行框架。
- **参数优化**：在 Orchestrator 中集成参数网格或贝叶斯优化模块，形成多分支任务 DAG，并将结果回传优化器或调参系统。
- **监控与告警**：输出 Prometheus 指标（任务耗时、失败率、资源占用、因子计算延迟），结合 Grafana 呈现，异常时推送报警。

## 5. 待决事项
- Worker 沙箱选型（Node `vm`、isolated-vm、容器隔离）与性能权衡方案。
- 内置因子插件的打包/热更新机制以及版本兼容策略。
- 大型数据集的分片读取架构（是否引入专用数据服务、列式存储引擎或分布式缓存）。
- 结果数据的冷热分层、归档与清理策略。

## 6. 策略脚本与 SDK 设计（草案）

### 6.1 文件结构与元数据
- **目录规范**：每个策略压缩包包含 `package.json`（可选）、`strategy.config.json`、`src/` 目录（默认入口 `src/index.ts`），便于编译与版本管理。
- **策略元数据**：在 `strategy.config.json` 中声明：
  ```jsonc
  {
    "id": "kline-overlap-alpha",
    "name": "K 线重叠率突破策略",
    "version": "1.0.0",
    "description": "利用前 N 根 K 线重叠率进行择时。",
    "tags": ["trend-following", "kline"],
    "parameters": [
      { "key": "lookback", "type": "number", "default": 10, "min": 1, "max": 200, "step": 1 },
      { "key": "minOverlap", "type": "number", "default": 0.6, "min": 0, "max": 1, "precision": 2 }
    ],
    "requiredData": [
      { "dataset": "ohlcv", "granularity": "1m" }
    ],
    "dependencies": ["@platform/indicators/basic"]
  }
  ```
- **参数声明**：用于前端动态渲染回测表单和参数网格；类型支持 number/string/enum/boolean/date，自定义校验可通过 `validator` 字段扩展。
- **依赖管理**：默认依赖平台 SDK；额外依赖以白名单形式在 `dependencies` 声明，由平台审核后注入沙箱。

### 6.2 运行时生命周期
- 策略入口需导出生命周期钩子，SDK 为其注入强类型上下文：
  ```ts
  import {
    StrategyContext,
    initStrategy,
    BarEvent,
    FactorHandle
  } from '@platform/sdk';

  export default initStrategy(({ context, params }) => {
    let overlapFactor: FactorHandle<number>;

    return {
      onInit: async () => {
        overlapFactor = context.factors.register<number>('kline_overlap_rate', {
          label: 'K 线重叠率',
          description: '最近 N 根 K 线高低点重叠比例',
          aggregation: 'snapshot'
        });
        context.state.set('history', []);
      },
      onBar: async (bar: BarEvent) => {
        const history = context.state.get<number[]>('history');
        const overlap = context.utils.calcOverlap(history, bar, params.lookback);
        overlapFactor.record(bar.timestamp, overlap);

        if (overlap >= params.minOverlap) {
          context.order.submit({
            side: 'BUY',
            symbol: bar.symbol,
            quantity: context.portfolio.sizePct(0.1),
            type: 'MARKET'
          });
        }

        context.state.update('history', h => context.utils.pushBar(h, bar, params.lookback));
      },
      onFinalize: async () => {
        context.metrics.record('custom_metric', context.state.get('someValue'));
      }
    };
  });
  ```
- **核心钩子**：
  - `onInit()`：初始化状态、注册因子/指标。
  - `onBar(bar)`：按 K 线/时间粒度运行（默认），亦可启用 `onTick`、`onSignal` 等扩展钩子。
  - `onFinalize()`：任务结束时执行收尾逻辑，记录自定义指标、清理资源。
  - 异步钩子允许 `await`，运行时会顺序调度；需避免长时间阻塞。

### 6.3 SDK 能力概述
- **上下文（`StrategyContext`）**：
  - `params`：回测输入参数（含默认值与传入值）。
  - `environment`: 回测环境信息（时间范围、货币、手续费配置等）。
  - `logger`: 提供 `debug/info/warn/error` 日志 API，日志自动带任务上下文。
  - `state`: 简单的内存状态容器（`set/get/update/has`）；在同一任务内保持。
  - `cache`: 面向跨任务缓存的异步接口，可选持久化（需在 manifest 中声明）。
- **订单与账户**：
  - `order.submit()` / `order.cancel()` / `order.replace()` 等方法，返回 Promise。
  - `portfolio`：账户视图（仓位、现金、净值），支持 `sizePct()` 等辅助计算。
- **数据访问**：
  - `data.series({ symbol, granularity, fields, window })`：批量读取历史数据。
  - `data.stream.on('bar', handler)`：订阅额外数据流（如多标的）。
  - SDK 自动管理预取与缓存，策略侧可配置 `prefetchWindow`。
- **因子与指标**：
  - `factors.register(key, options)`：登记因子元数据，返回 `record` 接口。
  - `metrics.record(name, value, timestamp?)`：记录自定义绩效指标。
  - `analytics`：访问内置因子/指标库，例如 `analytics.volatility(barSeries)`。
- **工具与限制**：
  - `utils`：常用指标函数（移动平均、RSI、重叠率示例等）。
  - 禁止直接操作文件系统或网络，如需外部数据须走平台审核的 `data.external` 接口。

### 6.4 错误处理与调试
- 平台捕获未处理异常并终止任务，同时记录堆栈与上下文；策略可通过 `context.logger` 输出调试信息。
- 针对业务错误，可抛出 `StrategyError`（自定义枚举 code），平台将以可读格式反馈给用户。
- 支持在开发模式（本地 CLI）使用相同 SDK 与模拟数据调试，方便迭代。

### 6.5 安全与审核要点
- 上传脚本需通过静态检查（ESLint/TS 类型检查）与依赖白名单验证。
- 平台在沙箱内限制 CPU/内存使用，防止无限循环或资源滥用。
- 明确禁止的操作：网络访问、子进程启动、动态 `eval`、反射访问 SDK 内部私有对象。

### 6.6 后续扩展
- **事件丰富度**：引入 `onOrderFill`、`onDailyClose` 等钩子，支持更复杂策略。
- **状态持久化**：为跨任务共享模型权重、信号缓存提供受控存储。
- **多语言支持预留**：未来可通过 WASM 或 gRPC 适配 Python/Rust 等运行时，但统一遵循同一 SDK 协议。
- **策略依赖管理**：引入策略内 `package.json` + 锁文件，配合平台审批机制，实现精准的依赖追踪与复现。


> 本文档为初稿，需结合架构师评审意见进一步细化（例如部署拓扑图、接口协议、SDK 设计细节、监控指标基线等）。
