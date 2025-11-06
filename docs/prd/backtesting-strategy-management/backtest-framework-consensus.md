# 回测框架共识纪要

最后更新：2025-11-04

## 1. 目标与范畴
- 建立 TypeScript 回测框架，拥抱 `big.js` 保证数值精度，使用 RxJS 作为事件驱动骨架。
- 聚焦单策略回测（暂不支持策略组合），输出结构化交易账簿供“交易结果分析”功能消费。

## 2. 分层架构共识
- **数据接入层**：封装 Parquet+DuckDB 等多数据源为统一 `DataProvider`，负责时间对齐、缺口填补、特征工程。
- **时间框架适配层**：`TimeframeAdapter/Resampler` 组件，把最细粒度数据转换成策略声明的主时间框架，并可同步输出原始辅助流。
- **事件总线层**：基于 RxJS 的事件编排，实现发布/订阅、顺序推进、背压控制，为各层提供解耦通信。
- **策略层**：TypeScript 策略沙箱，订阅行情事件，运用 `big.js` 计算并生成下单/撤单指令；提供生命周期钩子与时间框架声明。
- **执行撮合层**：模拟订单簿与成交，处理滑点、手续费、内部止损止盈等逻辑，生成成交/部分成交/撤单事件。
- **风险控制层**：独立于策略运行，监控仓位、资金、杠杆及止盈止损阈值，对违规指令进行阻断或强平。
- **交易账簿与日志层**：替代原“性能分析与报告”称谓，负责记录逐笔成交、订单状态、资金曲线、策略因子与上下文信息，产出供分析模块使用的结构化数据。
- **编排与配置层**：管理回测会话生命周期、依赖注入与组件注册，对接外部前端/调度服务。

## 3. 数据粒度与多源处理
- 数据源可能来自秒级、分钟级乃至小时级行情；数据层通过统一接口输出标准化 `BarEvent`（包含时间戳、OHLCV、特征集合、`timeframe` 元数据）。
- 策略可同时声明一个主时间框架（如 5 分钟）与若干辅助流（如 1 秒），框架保证同时推送聚合事件与原始事件。
- 当源粒度高于策略需求：通过 `TimeframeAdapter` 聚合。
- 当源粒度低于策略需求：默认拒绝，提示策略选择合适粒度或另行补充细数据。

### 3.1 标准化行情事件结构
- 数据接入层输出的所有行情事件遵循统一结构，方便策略与后续模块消费。
- 核心字段涵盖时间、标的、时间框架、OHLCV、特征向量以及元数据，支持扩展。
- 建议 TypeScript 接口定义如下（可作为协议契约起点）：

```typescript
type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h' | string;

interface BarEvent {
  sequenceId: string;          // 全局唯一事件序号，保证顺序处理
  timestamp: string;           // ISO8601 或 epoch 毫秒
  symbol: string;              // 标的代码，例如 BTC/USDT
  market?: string;             // 可选市场或交易所标识
  timeframe: Timeframe;        // 本事件所属的时间框架
  open: string;                // 使用 big.js 处理的字符串数值
  high: string;
  low: string;
  close: string;
  volume: string;              // 成交量（以基础单位或合约张数）
  trades?: number;             // 可选成交笔数
  notional?: string;           // 可选成交额
  features?: Record<string, string | number>; // 预处理特征，如指标、信号
  source: string;              // 数据来源标识，便于追踪
  auxStreams?: string[];       // 该事件关联的辅助流 ID，用于多时间框架对齐
  context?: Record<string, unknown>; // 额外上下文信息（如数据质量标签）
}
```

- 当 `BarEvent.timeframe` 不同于策略主时间框架时，可通过 `auxStreams` 或订阅配置标识事件所属的辅助流。

### 3.2 数据缺口策略
- 框架实例化时通过配置项选择缺口处理方式，默认 `gapPolicy: 'skip'` 表示跳过缺口区间。
- 当设置为 `gapPolicy: 'fill'` 时，需同时指定 `fillMethod`（`forwardFill`、`linear` 等）；数据层会生成补齐事件并在 `context.qualityFlag` 标注为 `synthetic`。
- 缺口策略为会话级配置，后续可扩展为按标的/数据源覆盖；策略侧可根据 `qualityFlag` 决定是否忽略补齐数据。

### 3.3 特征字段管线
- 数据层负责计算一套内置特征因子，初始包含：`MA`、`EMA10`、`EMA20`、`RSI`、`ATR`、`IBS`、最近 5/10/15/20 根 K 线的重叠度等，用于识别交易区间与波动状态。
- 内置因子计算逻辑可按需扩展，通过配置开关控制是否加载，避免无谓开销。
- 策略可在 runtime 基于已推送的 `BarEvent` 自行派生额外特征，框架提供 `featureRegistry` 注册机制，支持策略声明输出字段并在事件路由中合并。
- 所有特征字段默认存放在 `features` 对象中，数值类型遵循字符串或 `big.js` 可解析格式，便于统一精度管理。

### 3.4 DuckDB 查询与分片
- Parquet+DuckDB 数据源默认采用按时间区间分片查询，减少单次 IO 压力并支持长区间回测。
- `FetchRequest` 会拆分为多个子区间批次，DuckDB 在每个批次内执行 SQL 并流式返回结果，避免一次性加载到内存。
- 分片策略可配置（例如按天、按周、按自定义条数），以平衡查询性能与内存使用；当策略需要滚动窗口时，数据层可在批次间注入必要的重叠数据。

### 3.5 核心接口草稿
```typescript
type GapPolicy = 'skip' | 'fill';
type FillMethod = 'forwardFill' | 'linear';

interface FetchRequest {
  symbol: string;
  market?: string;
  start: string;              // ISO8601 或 epoch 毫秒
  end: string;
  baseTimeframe: Timeframe;   // 最细粒度
  fields?: Array<'open' | 'high' | 'low' | 'close' | 'volume' | 'trades' | 'notional' | string>;
  batchSize?: number;         // 每批次返回条目数
  overlapSize?: number;       // 批次之间的重叠窗口，用于滚动指标
  gapPolicy?: GapPolicy;      // 默认外层配置决定
  fillMethod?: FillMethod;    // gapPolicy === 'fill' 时生效
  featureSet?: string[];      // 需要启用的内置特征 ID
}

interface DataProvider {
  id: string;
  supports(request: FetchRequest): boolean;
  fetch(request: FetchRequest): Observable<BarEvent>;
  close?(): Promise<void>;
}

interface FeatureDefinition {
  id: string;
  description: string;
  dependsOn?: Array<{ ref: string; type: 'field' | 'feature'; optional?: boolean }>; // 明确依赖的原始字段或其他特征
  displayName?: string | ((params?: Record<string, unknown>) => string); // 用于渲染的名称，可根据参数动态生成
  valueType?: 'number' | 'integer' | 'boolean' | 'string' | 'enum'; // 输出数据类型，供过滤器与前端使用
  unit?: string; // 可选单位（如 pct、bps、usd）
  supportedOperators?: Array<'=' | '!=' | '>' | '>=' | '<' | '<=' | 'between' | 'in'>; // 过滤器支持的比较方式
  domain?: Array<string | number>; // 对于枚举型字段的候选值
  range?: { min?: number; max?: number }; // 数值型的推荐范围
  compute(stream: Observable<BarEvent>): Observable<BarEvent>;
}

interface FeatureRegistry {
  register(feature: FeatureDefinition): void;
  resolve(ids: string[]): FeatureDefinition[];
}
```

- `DataProvider` 只负责提供满足 `FetchRequest` 的原始或预处理后事件，特征计算通过注册的 `FeatureDefinition` 管道叠加完成。
- `FeatureDefinition.compute` 可在内部使用 RxJS 运算符对传入流加工，并返回追加 `features` 的新流；策略自定义因子通过运行时注册实现。

### 3.6 会话配置示例
```json
{
  "sessionId": "bt-2025-11-04",
  "data": {
    "providerId": "duckdb.parquet",
    "symbols": ["BTC-USDT"],
    "baseTimeframe": "1s",
    "timeRange": ["2024-01-01T00:00:00Z", "2024-02-01T00:00:00Z"],
    "gapPolicy": "skip",
    "fill": {
      "method": "forwardFill",
      "qualityFlag": "synthetic"
    },
    "featureSet": ["MA", "EMA10", "EMA20", "RSI", "ATR", "IBS", "overlap5", "overlap10"]
  }
}
```

- `gapPolicy` 未显式配置时默认继承会话级 `skip`，若设置为 `fill` 则需在 `fill` 对象中声明 `method`，并可指定写入 `qualityFlag` 字段值。
- `featureSet` 列表对应 `FeatureRegistry` 中注册的内置 ID；策略可在自身配置追加自定义特征 ID，框架按需加载。

### 3.7 特征命名与配置规范
- 命名采用 `<指标名><窗口>` 形式，窗口长度为整数时间步；例如 `EMA10` 表示使用 10 根 K 线计算的指数移动平均。
- 当指标有多个参数时，使用连字符追加，例如 `ATR-14`、`BOLL-20-2`（20 根窗口、2 倍标准差）。
- 指标若需指明价格来源或方向，可扩展后缀：`RSI14-close`、`Overlap5-high-low`。
- 内置特征初始覆盖下表所列：

| Feature ID   | 描述                           | 默认窗口 | 其他参数说明        |
|--------------|--------------------------------|----------|---------------------|
| `MA20`       | 简单移动平均                   | 20       | 使用收盘价          |
| `EMA10`      | 指数移动平均                   | 10       | 使用收盘价          |
| `EMA20`      | 指数移动平均                   | 20       | 使用收盘价          |
| `RSI14`      | 相对强弱指标                   | 14       | 基于收盘价          |
| `ATR14`      | 平均真实波动                   | 14       | 依赖高/低/收价格    |
| `IBS`        | 内部柱强度指数                 | 1        | 单根 bar 计算       |
| `Overlap5`   | 最近 5 根 K 线高低区间重叠度   | 5        | 基于高低价区间      |
| `Overlap10`  | 最近 10 根 K 线高低区间重叠度  | 10       | -                   |
| `Overlap15`  | 最近 15 根 K 线高低区间重叠度  | 15       | -                   |
| `Overlap20`  | 最近 20 根 K 线高低区间重叠度  | 20       | -                   |

- 如需不同窗口或参数，可在 `featureSet` 中以同规则声明（如 `EMA50`）。`FeatureRegistry` 在实例化时会解析 ID，获取窗口长度与依赖字段，告知数据层预留历史数据量。
- 自定义特征建议使用 `custom:<name>` 前缀，并在注册时提供窗口需求与计算逻辑；框架会把它们合并进 `features` 字段输出。
- 内置特征应在注册时提供 `displayName` 或 `displayName(params)`，方便前端直接渲染可读名称；未提供时可回退至 `outputId`。
- 注册时同时补充 `valueType`、`unit`、`supportedOperators`、`range/domain` 等元信息，为报告过滤器与可视化组件提供所需上下文。
- 数据层在按分片查询时，会根据已启用特征的最大窗口长度自动扩展起始查询范围（例如窗口为 20，则额外取前 19 条），保证在批次边界处指标连续。

### 3.8 `featureSet` JSON 配置格式
- 为保持向后兼容，`featureSet` 支持字符串与对象两种写法：
  - 字符串：`"EMA20"`，代表使用默认参数的特征。
  - 对象：`{ "id": "EMA", "params": { "window": 20, "source": "close" }, "outputId": "EMA20" }`，用于覆盖默认窗口、指定输入字段或设置输出名称。
- 推荐对象结构：

```json
{
  "id": "BOLL",
  "params": {
    "window": 20,
    "stdMultiplier": 2,
    "source": "close"
  },
  "outputId": "BOLL-20-2"
}
```

- 字段说明：
  - `id`：特征类型标识，对应 `FeatureRegistry` 注册的 `FeatureDefinition.id`。
  - `params`：指标所需参数，键名由特征定义决定，例如 `window`、`alpha`、`lookback`、`source` 等。
  - `outputId`（可选）：自定义输出名称，未指定时由框架按命名规范自动生成（如 `EMA20`）。
  - `label`（可选）：渲染用名称，未指定时会调用对应 `FeatureDefinition.displayName`，示例：“移动平均值20”。
  - `extras`（可选）：保留字段，供后续扩展，如输出多个通道、选择多资产共享状态等。
- 解析流程：
  1. 编排层读取 `featureSet`，将字符串转换为 `{id, params}` 形式（解析默认窗口）。
  2. `FeatureRegistry.resolve` 根据 `id` 找到定义，合并默认参数与配置中的 `params`。
  3. 若 `outputId` 冲突或缺失，框架自动生成唯一 ID 并写入 `features`。
  4. 数据层依据解析结果计算最大窗口需求，调整 `FetchRequest.overlapSize` 与分片扩展长度。
- 自定义特征可使用 `custom:<name>` 作为 `id`，并通过策略在会话启动时调用 `FeatureRegistry.register` 提供 `compute` 函数；配置对象中的 `params` 会原封不动传给 `compute`，便于策略控制行为。

### 3.9 常见指标参数键名与默认值
- 默认值用于在 `featureSet` 以字符串形式声明时回退，也作为对象配置的参数参考。

| 指标 ID/模式                    | 参数键名                                   | 默认值/说明                                                  |
|---------------------------------|--------------------------------------------|--------------------------------------------------------------|
| `MA` / `MA<window>`             | `window`, `source`                         | `window=20`，`source="close"`                                 |
| `EMA` / `EMA<window>`           | `window`, `source`                         | `window=10`，`source="close"`                                 |
| `RSI` / `RSI<window>`           | `window`, `source`                         | `window=14`，`source="close"`                                 |
| `ATR` / `ATR<window>`           | `window`, `method`                         | `window=14`，`method="wilder"`（Wilder 平滑）                |
| `IBS`                           | `sourceHigh`, `sourceLow`, `sourceClose`   | 默认使用当前 bar 的 `high/low/close`                          |
| `Overlap` / `Overlap<window>`   | `window`, `sourceHigh`, `sourceLow`        | `window` 取自 ID；高低价默认使用 `high/low`                  |
| `BOLL` / `BOLL-<window>-<mult>` | `window`, `stdMultiplier`, `source`        | `window=20`，`stdMultiplier=2`，`source="close"`              |
| `ATRBand`（扩展示例）           | `window`, `multiplier`, `source`           | `window=14`，`multiplier=1.5`，`source="close"`               |
| `MACD`                          | `fast`, `slow`, `signal`, `source`         | `fast=12`，`slow=26`，`signal=9`，`source="close"`             |
| `KDJ`                           | `fastk`, `slowk`, `slowd`, `sourceHigh`, `sourceLow`, `sourceClose` | `fastk=9`，`slowk=3`，`slowd=3`，默认使用 `high/low/close` |

- 若配置中出现额外参数键，由特征实现决定是否支持（不支持时应抛出可读错误）。
- 字符串形式（如 `"EMA20"`）会解析 `20` 为 `window` 并套用表中默认参数；对象形式可覆盖任意键值。
- 新增内置指标时需同步更新此表，并在注册时声明窗口长度，确保数据层可预估历史数据需求。

### 3.10 `source` 参数约定
- 默认价格来源采用 `close`（收盘价），除非指标需要高低价或其他字段。
- 可选值建议统一为：`open`、`high`、`low`、`close`、`hl2`（(high+low)/2）、`hlc3`（(high+low+close)/3）、`ohlc4`（(open+high+low+close)/4）、`volume`、`typical` 等。
- 当指标需要多源输入（如 `sourceHigh`、`sourceLow`），默认分别取当前 `BarEvent` 中的 `high`、`low` 字段；若数据源缺失，应在预处理阶段补齐或抛出缺字段错误。
- 自定义特征若需要引用其他衍生字段，可在 `features` 内使用 `features.<name>` 作为约定前缀，解析时由特征实现决定如何读取。

### 3.11 FeatureRegistry 参数校验规范
- `FeatureDefinition` 在注册时需声明：
  - 支持的 `params` 键名集合；
  - 必需参数及其类型、取值范围；
  - 默认参数（用于缺省合并）。
- `FeatureRegistry.register` 在接受定义时执行基础校验：重复 ID 拒绝注册、必需字段缺失报错、默认值类型校验。
- 在 `FeatureRegistry.resolve` 阶段，对外部配置传入的 `params` 进行：
  - 键名检查：未声明的键默认拒绝（除非 `allowUnknownParams = true`）；
  - 类型检查：数字字段需可解析为 `number`，字符串需符合预设枚举；
- 取值校验：窗口长度等需要为正整数、`source` 必须落在可选列表。
- 校验失败时返回结构化错误，供编排层将问题反馈给调用者，避免在回测过程中才发现配置问题。
- 对于需要跨指标共享参数的情况（例如多输出通道），可在 `FeatureDefinition` 中提供自定义 `validate(params)` 钩子，Registry 会优先调用该钩子执行高级校验。
- Registry 需暴露 `listDefinitions()`（或同等 API）返回当前所有注册特征的元数据，包含 `id`、`displayName/label`、`valueType`、`supportedOperators`、`range/domain`、`unit` 等信息，供前端动态渲染筛选项。
- 回测会话启动后，将启用的特征清单与最终 `outputId/label` 固化为 `featureCatalog` 元数据随同结果存储；报告模块与前端通过读取该清单驱动过滤表单，避免与历史回测脱节。

### 3.12 特征依赖关系建模
- `FeatureDefinition.dependsOn` 用于声明构建特征前必须可用的输入，可分两类：
  - `type: 'field'`：依赖原始行情字段，如 `high`、`low`、`volume`；框架会在预处理阶段确保字段存在。
  - `type: 'feature'`：依赖另一特征（如 `MACD` 需要 `EMA`）；Registry 会按拓扑顺序拓展依赖链。
- 注册流程：
  1. 校验依赖是否存在（内置或自定义特征已注册），否则拒绝登记。
  2. 构建依赖图并执行环检测，防止循环引用。
  3. 生成拓扑排序，确保计算时先执行依赖特征，再执行当前特征。
- 在会话解析 `featureSet` 时，若用户仅配置 `MACD`，Registry 会自动补全其依赖的 `EMA12`、`EMA26`，并将这些特征添加到执行计划（可标记为 `isImplicit=true` 控制是否暴露给筛选器）。
- 对于可选依赖（`optional: true`），当配置中未启用对应特征时可退化到默认行为（例如使用原始字段替代）；如无法退化则在解析阶段报错。
- 依赖信息同样会写入 `featureCatalog`，报告模块可以根据依赖树决定哪些特征需要一起展示或作为过滤器选择项。

### 3.13 featureCatalog 存储形态
- 为兼顾查询与展示，回测结束时生成两份特征目录：
  - `feature_catalog.parquet`：结构化列式数据，字段示例 `feature_id`、`output_id`、`label`、`value_type`、`unit`、`supported_operators`、`domain`、`range_min`、`range_max`、`is_implicit` 等，方便 DuckDB/Arrow 直接 join 交易明细做统计或过滤。
  - `featureCatalog.json`：便于前端一次性加载的轻量元数据，沿用同样字段并可补充描述、分组、排序权重等 UI 信息。
- 交易明细 Parquet 中保留与特征目录关联的字段（如 `feature_id` 或 `output_id`），实现事实表与维度表的解耦。
- 生成流程：Registry 解析会话的 `featureSet` → 拓扑排序得到实际启用的特征（含隐式依赖）→ 输出结构化目录 → 同步导出 JSON 版本。
- 当特征定义迭代时，历史回测保留当时的目录文件，保证报告与筛选功能可回放，避免受当前 Registry 变化影响。

## 4. 事件总线层细化

### 4.1 核心职责概览
- 统一接收各模块产生的事件（数据层、策略、执行、风控、账簿、编排器），基于事件类型和订阅条件做路由。
- 通过 RxJS 调度器控制关键链路串行（如订单→风控→执行）与辅助链路异步（日志、可视化），并提供背压策略。
- 暴露状态流与控制入口，允许编排器触发启动、暂停、恢复、停止、快照等操作。
- 维护事件时间线与检查点，实现断点续跑、回放、重审。
- 将异常转化为可追踪的死信事件，保证主流程不中断，并输出监控指标。
- 允许挂载可视化/监控模块作为只读观察者，订阅行情、订单、成交等事件生成图表或状态面板，同时与主执行路径隔离，避免影响回测节奏。

### 4.2 运行状态模型与控制事件

```typescript
type RunStatus =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'error';

interface BusState {
  sessionId: string;
  status: RunStatus;
  currentSeq: string;           // 最近处理完的事件序号
  logicalTime: string;          // 对应事件的时间戳
  clockMode: 'event' | 'wall';  // 事件驱动或墙钟驱动
  inflight: number;             // 当前待处理事件数量
  lastCheckpoint?: CheckpointMeta;
}

interface ControlEvent {
  type: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'SNAPSHOT' | 'SEEK';
  sessionId: string;
  payload?: {
    sequenceId?: string;
    timestamp?: string;
    reason?: string;
  };
}
```

- 总线对外暴露 `state$`（`Observable<BusState>`）供 UI/监控订阅；接收 `ControlEvent` 后更新 `BusState` 并广播控制结果。
- `clockMode` 决定推进方式：回测通常为 `event`，实时模拟可选择 `wall` 结合节流。

### 4.3 暂停、恢复与重放的数据结构

```typescript
interface RecordedEvent {
  sequenceId: string;
  timestamp: string;
  streamId: string;                  // 事件所属流，例如 bar:BTC-USDT:5m
  payload: BaseEvent;
  status: 'pending' | 'processed' | 'skipped';
  error?: SerializedError;
}

interface EventStore {
  append(event: RecordedEvent): void;
  readFrom(sequenceId: string): AsyncIterable<RecordedEvent>;
  latest(): RecordedEvent | undefined;
}

interface CheckpointMeta {
  sequenceId: string;
  timestamp: string;
  createdAt: string;
  reason: 'auto' | 'manual' | 'pause';
}

interface CheckpointSnapshot {
  meta: CheckpointMeta;
  busState: BusState;
  moduleStates: Record<string, unknown>; // 各模块序列化后的快照（策略、执行、风控等）
}
```

- **暂停 (`PAUSE`)**：总线刷新 `BusState.status = 'paused'`，停止向下游推送新事件，并立即生成 `CheckpointSnapshot`（包括 `BusState` 与模块自报状态）缓存到存储。
- **恢复 (`RESUME`)**：读取最近的 `CheckpointSnapshot`，还原 `BusState` 与 `moduleStates`，然后调用 `EventStore.readFrom(lastSeq)` 继续向策略/执行层推送事件。
- **重放 (`SEEK`)**：根据 `payload.sequenceId` 或 `timestamp` 重新定位 `currentSeq`，重置相关模块状态（可选择最近检查点或全量回放），再重发事件流，常用于调试。
- **缓冲实现**：`EventStore` 可用内存环缓冲 + 持久化（Parquet/Arrow）双层结构，最近事件保留在内存以支持即时暂停/重播，历史事件从磁盘流式回放。
- **死信与重投递**：订阅链抛错时将事件写入 `RecordedEvent`（status=`skipped`，附错误），同时投递到 `deadLetter$`，暂停/恢复后可由运维决定是否 `requeue`。

### 4.4 监控、背压与扩展钩子
- 通过 RxJS 的 `bufferTime`、`throttleTime` 等算子为高频流配置背压策略，防止策略或可视化模块被事件洪水淹没。
- 提供 `metrics$` 和 `audit$` 中间流，记录处理延迟、队列长度、错误率；编排器或外部监控可订阅这些流上报指标。
- 支持注册中间件（`BusPlugin`），可在事件进入/离开总线时注入逻辑（例如审计、跨模块同步、事件采样），实现可插拔扩展。

### 4.5 核心事件类型 Schema
- 事件总线传递的所有消息遵循统一的基础结构，`eventType` 决定 payload 的具体形态。

```typescript
type EventType =
  | 'market.bar'
  | 'strategy.intent'
  | 'risk.decision'
  | 'execution.report'
  | 'portfolio.update'
  | 'ledger.record'
  | 'control'
  | 'system.deadletter';

interface BaseEvent<TPayload = unknown> {
  eventId: string;
  eventType: EventType;
  sessionId: string;
  sequenceId: string;
  timestamp: string;                 // 事件发生时间
  source: string;                    // 发布方模块 ID
  payload: TPayload;
  metadata?: Record<string, unknown>; // 额外上下文，如 traceId、debug 信息
}
```

#### 行情事件
- 行情事件沿用数据层定义的 `BarEvent`，嵌入在 `payload` 中：

```typescript
type MarketBarEvent = BaseEvent<{
  bar: BarEvent;
  streamId: string; // 例如 BTC-USDT:1s 或 aggregated:5m
}>;
```

#### 策略指令事件

```typescript
interface OrderIntentPayload {
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop-limit';
  quantity: string;            // 使用 big.js 的字符串
  price?: string;
  tif?: 'GTC' | 'IOC' | 'FOK';
  clientOrderId?: string;
  tags?: string[];
}

type StrategyIntentEvent = BaseEvent<OrderIntentPayload>;
```

#### 风控判定事件

```typescript
interface RiskDecisionPayload {
  strategyId: string;
  intentId: string;            // 引用原始指令
  decision: 'approve' | 'reject' | 'modify' | 'halt';
  modifications?: Partial<OrderIntentPayload>;
  reasons?: Array<{ code: string; message: string }>;
}

type RiskDecisionEvent = BaseEvent<RiskDecisionPayload>;
```

#### 执行回报事件

```typescript
interface ExecutionFill {
  fillId: string;
  quantity: string;
  price: string;
  fee?: { amount: string; asset: string };
  liquidity: 'maker' | 'taker';
}

interface ExecutionReportPayload {
  strategyId: string;
  intentId: string;
  status: 'new' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
  fills?: ExecutionFill[];
  averagePrice?: string;
  remainingQuantity?: string;
  reason?: string;
}

type ExecutionReportEvent = BaseEvent<ExecutionReportPayload>;
```

#### 账户/仓位更新事件

```typescript
interface PortfolioUpdatePayload {
  strategyId: string;
  balances: Record<string, string>;          // 资产余额
  positions: Array<{
    symbol: string;
    side: 'long' | 'short';
    quantity: string;
    avgEntryPrice: string;
    unrealizedPnl: string;
  }>;
  equity: string;
  marginUsage?: string;
}

type PortfolioUpdateEvent = BaseEvent<PortfolioUpdatePayload>;
```

#### 交易账簿记录事件

```typescript
interface LedgerRecordPayload {
  tradeId: string;
  strategyId: string;
  symbol: string;
  intentId: string;
  fillId: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  pnl: string;
  fees?: string;
  factors?: Record<string, string | number>; // 触发因子快照
  context?: Record<string, unknown>;         // 额外信息，如市场状态、风控标签
}

type LedgerRecordEvent = BaseEvent<LedgerRecordPayload>;
```

#### 控制与死信事件
- 控制事件复用前述 `ControlEvent`，通过 `BaseEvent<ControlEvent>` 形式统一入总线。
- `DeadLetter` 事件用于包裹异常，便于监控与后续处理：

```typescript
interface DeadLetterPayload {
  failedEvent: BaseEvent;
  error: SerializedError;
  handled: boolean;
}

type DeadLetterEvent = BaseEvent<DeadLetterPayload>;
```

- 以上 schema 作为事件总线的数据契约，编排层和各模块在实现时应遵守字段命名、数值类型（字符串形式以配合 `big.js`）与 ID 关联约定，确保事件可以正确路由、重放与分析。

#### 策略日志与指标事件

```typescript
interface StrategyLogPayload {
  strategyId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  extra?: Record<string, unknown>;
}

type StrategyLogEvent = BaseEvent<StrategyLogPayload>;

interface StrategyMetricPayload {
  strategyId: string;
  metric: string;                       // 例如 trades.count、drawdown
  type: 'counter' | 'gauge' | 'histogram';
  value: number;
  tags?: Record<string, string>;        // 自定义维度，如 symbol=BTC-USDT
}

type StrategyMetricEvent = BaseEvent<StrategyMetricPayload>;
```

- `ctx.log` 调用生成 `strategy.log` 事件，事件总线将其路由到：
  - **日志存储器**：写入 Parquet/日志文件供回测结果查询；
  - **前端可视化**：实时显示在策略日志面板；
  - **告警/监控**：按 `level` 过滤后推送到监控系统。
- `ctx.metrics.increment / observe` 产生 `strategy.metric` 事件，可在总线中做 `bufferTime` 聚合后路由至：
  - **指标聚合器**：累积 counter/gauge/histogram，导出至时序库或结果仓库；
  - **可视化仪表盘**：实时展示策略表现。
- 日志与指标事件与其他事件共享 `sequenceId`，回放时可以对齐时间线，辅助调试与复盘。

## 5. 策略沙箱层细化

### 5.1 角色与生命周期
- 策略沙箱负责管理单个策略脚本的运行，订阅事件总线传入的行情/执行/风控反馈，并向总线发出指令。
- 生命周期钩子（按触发顺序）：

```typescript
interface StrategyLifecycle {
  onInit?(ctx: StrategyContext): Promise<void> | void;
  onWarmup?(ctx: StrategyContext, event: MarketBarEvent): Promise<void> | void;
  onBar?(ctx: StrategyContext, event: MarketBarEvent): Promise<void> | void;
  onAuxStream?(ctx: StrategyContext, event: MarketBarEvent): Promise<void> | void;
  onExecutionReport?(ctx: StrategyContext, event: ExecutionReportEvent): Promise<void> | void;
  onRiskDecision?(ctx: StrategyContext, event: RiskDecisionEvent): Promise<void> | void;
  onControl?(ctx: StrategyContext, event: BaseEvent<ControlEvent>): Promise<void> | void;
  onSnapshot?(ctx: StrategyContext): Promise<StrategySnapshot>;
  onRestore?(ctx: StrategyContext, snapshot: StrategySnapshot): Promise<void> | void;
  onStop?(ctx: StrategyContext, reason: string): Promise<void> | void;
  onError?(ctx: StrategyContext, error: UnknownError): Promise<void> | void;
}
```

- `onWarmup` 在策略初始化时可选对预热数据进行处理（例如指标缓冲）；之后常规行情流进入 `onBar`。
- `onAuxStream` 用于处理辅助时间框架事件（如原始 1s 数据）。

### 5.2 策略声明（Manifest）
- 策略元信息（Manifest）不再存于独立文件，而是保存在数据库中，字段示例：

```json
{
  "strategyId": "mean-reversion",
  "name": "Mean Reversion Demo",
  "version": "1.0.0",
  "description": "Simple mean reversion on 5m bars.",
  "author": "Quant Team",
  "requiredTimeframe": "5m",
  "auxStreams": [],
  "featureDeps": ["MA20", "MA50"],
  "dataDeps": [{"symbol": "BTC-USDT"}],
  "defaultParameters": {
    "entryThreshold": 1.5,
    "exitThreshold": 0.5,
    "quantity": "0.1"
  },
  "warmupBars": 20
}
```

- 保存脚本时，后端将 Manifest 字段与脚本文本一并写入数据库；回测启动时编排层读取 Manifest+脚本组合成 `StrategyConfig` 供沙箱使用。
- 参数 Schema（若需要更严格校验）也存于数据库，对应 `defaultParameters` 的 JSON Schema。

### 5.3 策略上下文 API

```typescript
interface StrategyContext {
  sessionId: string;
  strategyId: string;
  manifest: StrategyManifest;
  now(): string;                                            // 当前事件时间戳
  publishIntent(intent: OrderIntentPayload): void;
  cancelIntent(intentId: string): void;
  getPosition(symbol: string): PositionSnapshot | undefined;
  getPortfolio(): PortfolioUpdatePayload;
  getFeature(event: MarketBarEvent, featureId: string): string | number | undefined;
  log(level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>): void;
  metrics: {
    increment(counter: string, value?: number): void;
    observe(histogram: string, value: number): void;
  };
  requestSnapshot(): Promise<StrategySnapshot>;             // 手动触发序列化
  setParameterOverrides(params: Record<string, unknown>): void;
}
```

- `publishIntent` / `cancelIntent` 通过事件总线产生 `strategy.intent`，限制同一事件内的调用次数可作为一期基本防护。
- `getFeature` 提供快捷访问当前 `BarEvent.features` 或其他共享特征，返回值支持字符串或数值。
- `metrics`/`log` 输出统一进入事件总线的监控/日志流。

### 5.4 状态快照与恢复

```typescript
interface StrategySnapshot {
  state: Record<string, unknown>;
  createdAt: string;
  lastSequenceId: string;
}
```

- 沙箱在收到 `SNAPSHOT` 控制事件或暂停时调用策略的 `onSnapshot`（若未实现则默认使用框架托管的状态）。
- 在恢复或 `SEEK` 后，框架先还原 `StrategySnapshot` 再继续投递事件，保障策略内部指标/仓位缓存一致。
- 一期若策略未实现 `onSnapshot`，框架可选择落地最基本的内置状态（例如当前持仓、参数），同时记录缺失信息在日志中提示。

### 5.5 错误处理与降级
- 策略回调抛出的异常由沙箱捕获并生成 `DeadLetterEvent`，同时触发 `onError` 钩子供策略自定义处理。
- 框架可配置错误策略：`fail-fast`（终止回测）、`isolate`（暂停该策略）、`continue`（记录后继续）。一期默认可选 `continue` 以便调试。
- 对于超时或循环调用的情况，一期至少记录警告，并在日志中指出问题；二期再补充更强的资源隔离（独立进程/Worker、CPU/内存限制）。

### 5.6 一期资源隔离取舍
- 第一阶段不实现真正的进程级隔离，策略代码与主进程同运行环境，但必须：
  - 通过 `StrategyContext` 暴露白名单 API，禁止直接访问 `require`/文件系统等危害操作；
  - 在沙箱回调周围加超时监控与异常捕获，防止单次处理阻塞整个回测；
  - 记录策略执行耗时、内存指标，超阈触发警告或暂停，作为后续迭代的数据依据。
- 架构上仍旧保留未来迁移到 Worker/VM2 的接口（例如所有上下文通信都走消息封装），二期可以直接替换底层实现而无需改动策略代码。

### 5.7 脚本结构与导出约定
- 每个策略脚本存储在数据库中（单文件 TypeScript/JavaScript 字符串），保存时一并提交元信息与脚本文本。
- 脚本需导出：
  - `default`：实现 `StrategyLifecycle` 的对象；
  - `parameters`（可选）：通过 `defineParameters` 定义的参数集合；
  - `customFeatures`（可选）：通过 `defineFeatures` 定义的自定义特征数组。
- 推荐模板：

```typescript
import { StrategyLifecycle, defineParameters, defineFeatures } from '@platform/backtest';
import { map, withLatestFrom } from 'rxjs/operators';

export const parameters = defineParameters({
  entryThreshold: {
    type: 'number',
    title: '入场阈值（σ）',
    default: 1.5,
    minimum: 0,
    maximum: 5,
    'x-component': 'Slider',
    'x-component-props': { step: 0.1, marks: { 0: '0σ', 5: '5σ' } },
    'x-validator': [{ minimum: 0 }, { maximum: 5 }]
  },
  positionSize: {
    type: 'string',
    title: '开仓数量',
    default: '0.1',
    pattern: '^[0-9]+(\\.[0-9]+)?$',
    'x-component': 'InputNumber'
  },
  tradeSide: {
    type: 'string',
    title: '交易方向',
    enum: [
      { label: '只做多', value: 'long' },
      { label: '只做空', value: 'short' },
      { label: '双向', value: 'both' }
    ],
    default: 'both',
    'x-component': 'Select'
  },
  enableStopLoss: {
    type: 'boolean',
    title: '启用止损',
    default: true,
    'x-component': 'Switch'
  }
});

export const customFeatures = defineFeatures([
  {
    id: 'atr14',
    label: 'ATR(14)',
    valueType: 'number',
    unit: 'price',
    supportedOperators: ['>', '<', 'between'],
    schemaForm: {
      operator: {
        type: 'string',
        title: '比较方式',
        enum: ['>', '<', 'between'],
        default: '>'
      },
      value: {
        type: 'number',
        title: '阈值',
        'x-component': 'NumberPicker'
      },
      range: {
        type: 'array',
        title: '区间',
        items: { type: 'number' },
        'x-component': 'RangeInput',
        'x-visible': '{{ $values.operator === "between" }}'
      }
    },
    compute(stream) {
      return stream;
    }
  },
  {
    id: 'signalTag',
    label: '信号标签',
    valueType: 'enum',
    domain: ['breakout', 'reversion', 'momentum'],
    supportedOperators: ['=', '!=', 'in'],
    schemaForm: {
      operator: {
        type: 'string',
        title: '比较方式',
        enum: ['=', '!=', 'in'],
        default: 'in'
      },
      values: {
        type: 'array',
        title: '标签',
        items: {
          type: 'string',
          enum: [
            { label: '突破', value: 'breakout' },
            { label: '均值回归', value: 'reversion' },
            { label: '动量', value: 'momentum' }
          ]
        },
        'x-component': 'Select',
        'x-component-props': { mode: 'multiple' }
      }
    },
    compute(stream) {
      return stream;
    }
  },
  {
    id: 'holdingPeriod',
    label: '持仓时长（分钟）',
    valueType: 'integer',
    supportedOperators: ['>', '<', 'between'],
    schemaForm: {
      operator: {
        type: 'string',
        title: '比较方式',
        enum: ['>', '<', 'between'],
        default: '>'
      },
      value: {
        type: 'integer',
        title: '分钟数',
        minimum: 0,
        'x-component': 'NumberPicker'
      },
      range: {
        type: 'array',
        title: '区间',
        items: { type: 'integer' },
        'x-component': 'RangeInput',
        'x-visible': '{{ $values.operator === "between" }}'
      }
    },
    compute(stream, ctx) {
      const sharedHolding = ctx.sharedState?.holdingMinutes$;
      return sharedHolding
        ? stream.pipe(
            withLatestFrom(sharedHolding),
            map(([event, minutes]) => ({
              ...event,
              features: { ...event.features, holdingPeriod: minutes }
            }))
          )
        : stream;
    }
  }
]);

const strategy: StrategyLifecycle = {
  onInit(ctx) {
    const params = ctx.getParameters<typeof parameters>();
    ctx.log('info', `Strategy init with threshold ${params.entryThreshold}`);
  },
  // ... 其余生命周期钩子
};

export default strategy;
```

- 后端保存脚本时，会解析/执行 `defineParameters` 与 `defineFeatures` 的返回值，将元数据提取并单独存入数据库，供前端表单与分析模块使用。

### 5.8 自定义参数的提取与使用
- `defineParameters` 返回一个 Formily 兼容的 schema 片段（以参数名为 key），字段中可包含 `type`、`title`、`default`、`x-component`、`x-component-props`、`x-validator` 等信息；保存脚本时原样序列化到数据库。
- 前端加载策略时读取该 schema 渲染表单，用户填写后作为会话配置提交；编排层合并 `defaultParameters`（Manifest）与用户输入 → 通过 `StrategyContext.getParameters()` 提供给脚本，保持字段名一致。
- schema 可扩展更多组件与校验（如联动、提示语等），策略端获取值时仍以 key 访问。

### 5.9 自定义因子定义与前端展示
- `defineFeatures` 中的每个特征需提供：
  - `id`、`label`、`valueType`、`unit`、`supportedOperators`、`domain/range` 等描述；
  - `schemaForm`：用于筛选表单的 Formily 片段（定义 operator、输入控件等）；
  - `dependsOn`（可选）声明依赖字段；
  - `compute`：RxJS 运算，将特征写回事件的 `features` 字段，可结合 `ctx.sharedState` 复用已有结果。
- 保存脚本时，后端提取 `customFeatures` 元数据与 `schemaForm`；回测运行中由 FeatureRegistry 注册执行。
- “交易结果分析”模块读取特征元数据和 `schemaForm` 渲染筛选 UI，根据 `supportedOperators` 生成比较逻辑（如 ATR > 10 / between 等）。
- 若特征需要参数化（如窗口长度），可在 `compute` 中读取 `ctx.getParameters()` 或在 `schemaForm` 中引导用户输入，自行处理。

### 5.10 脚本内部共享状态与复用因子结果
- `StrategyContext` 将提供 `ctx.sharedState` 或 `ctx.registerSharedState(key, observable)` 等 API，允许策略在生命周期内注册可复用的数据流（例如在 `onBar` 中计算好的指标结果）。
- `defineFeatures` 的 `compute` 第二个参数会收到上述共享状态引用，可通过 `withLatestFrom` 等方式直接复用已有结果，避免重复计算。
- 若特征依赖执行或风控事件，可在策略生命周期中把结果推送到 `sharedState`（例如使用 `Subject`），`compute` 流中订阅该 `Subject` 并与行情流组合。
- 快照/恢复时，策略需在 `onSnapshot` / `onRestore` 中同步共享状态，以确保暂停后恢复时计算持续正确。
- `compute` 的触发时机为每个行情事件（`MarketBarEvent` 或辅助流）进入策略生命周期之前，FeatureRegistry 会先执行自定义特征的 `compute` 管道再将事件投递给策略钩子，确保 `event.features` 始终包含最新值。

如需调整或扩展以上共识，请继续补充。框架方案的进一步细化将以此为基线。
- **事件存档**：`RecordedEvent` 与 `EventStore` 会将所有事件按 `sequenceId` 顺序持久化。分析亏损交易时可据 `LedgerRecordPayload.sequenceId` 或 `timestamp` 回读前后事件（行情、策略指令、风控反馈、执行回报、日志、指标），重建完整上下文。
- **同步校验**：策略日志、指标事件同样携带 `sequenceId`，确保回放时能对齐交易发生时刻，实现“交易 → 行情 → 决策 → 风控 → 执行 → 结果”全链路复盘。

## 6. 执行撮合层细化

### 6.1 核心职责
- 管理订单生命周期：接收策略指令（风控放行后）、生成内部订单对象、跟踪状态变更。
- 基于行情事件模拟撮合，处理市价、限价、止损、止盈等订单，注入滑点、手续费、内部条件。
- 生成 `execution.report`、`portfolio.update`、`ledger.record` 等事件，反馈成交结果与仓位变化。
- 支持撤单、TIF（GTC/IOC/FOK）、内部止损触发，并与事件总线快照机制协同。

### 6.2 数据结构与订单生命周期

```typescript
type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit';
type OrderStatus =
  | 'pending'
  | 'new'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired';

interface OrderEntry {
  orderId: string;
  intentId: string;
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: OrderType;
  tif: 'GTC' | 'IOC' | 'FOK';
  limitPrice?: string;
  stopPrice?: string;
  quantity: string;
  remaining: string;
  createdAt: string;
  status: OrderStatus;
  metadata?: Record<string, unknown>;
}

interface OrderBookState {
  activeOrders: Map<string, OrderEntry>;
  restingBids: OrderEntry[];    // 限价买单，按价格/时间排序
  restingAsks: OrderEntry[];    // 限价卖单
  triggeredQueue: OrderEntry[]; // 已触发待执行的条件单
}
```

- 生命周期流程：
  1. `strategy.intent` → 创建 `OrderEntry`（status=`new`），发布初始 `execution.report`。
  2. 行情事件驱动撮合 → 更新 `remaining`、`status`，产出成交或部分成交回报。
  3. 接收撤单/过期 → 状态置为 `cancelled`/`expired`，发回报并从 `activeOrders` 移除。
  4. 订单完成（status=`filled`）后写入账簿。

### 6.3 撮合流程
- **市价单**：按当前 bar 的基准价（可配置 `open`/`close`/`mid`）成交，并通过滑点模型调整最终成交价。
- **限价单**：若 `limitPrice` 落入 bar 高低区间，视为成交；成交价策略可选 `limitPrice`、`bar.open` 等。
- **止损/止盈单**：当 bar 触及 `stopPrice` 或内部阈值时，将订单转入 `triggeredQueue` 并按市价/限价执行。
- **部分成交 & TIF**：
  - 未全部成交的订单保留 `remaining`；`IOC` 自动撤余量；`FOK` 若无法满额则整体撤单。
- **内部条件**：支持内部止损、时间到期等逻辑，触发后自动生成反向订单或直接输出执行回报。

### 6.4 滑点与手续费模型

```typescript
interface SlippageModel {
  apply(input: {
    basePrice: string;
    side: 'buy' | 'sell';
    quantity: string;
    liquidity: 'maker' | 'taker';
  }): string;
}

interface FeeModel {
  compute(input: {
    price: string;
    quantity: string;
    side: 'buy' | 'sell';
    liquidity: 'maker' | 'taker';
  }): { amount: string; asset: string };
}
```

- 默认实现支持固定点差、比例手续费；通过依赖注入可扩展更复杂的市场模型。
- 成交回报中的 `fills` 字段写入滑点后价格与费用，供账簿与绩效分析使用。

### 6.5 事件生成与仓位同步
- 每次状态变化生成 `execution.report`，字段遵循第 4 章定义。
- 撮合层更新账户/仓位并产出 `portfolio.update`，保持策略对当前余额、仓位的实时认知。
- 对成交写入 `ledger.record`，包含 `tradeId`、`intentId`、`pnl`、`fees`、`factors`、`sequenceId` 等，方便后续分析。

### 6.6 撤单与异常处理

```typescript
interface CancelInstruction {
  strategyId: string;
  intentId: string;
  reason?: string;
}
```

- 接到撤单指令，撮合层查找 `OrderEntry`，设置状态为 `cancelled`，发对应回报。
- 撮合或模型异常时，捕获错误并通过 `DeadLetterEvent` 上报，同时将订单标记为 `rejected`，在日志中说明原因。

### 6.7 状态快照与恢复

```typescript
interface ExecutionSnapshot {
  orders: OrderEntry[];
  triggeredQueue: OrderEntry[];
  lastProcessedSeq: string;
}
```

- 暂停/快照时序列化 `OrderBookState` 与 `triggeredQueue`，恢复后按 `lastProcessedSeq` 继续撮合，避免事件丢失或重复执行。
- 触发队列在恢复时需重评估当前行情，防止多次触发。

### 6.8 一期简化方案
- 初期实现保持可配置但提供简洁默认值：
  - 市价单默认使用 `bar.open` 成交，可通过会话配置指定 `marketFillPolicy`（如 `open`、`close`、`vwap`）；
  - 限价单只判断是否触及且默认以 `limitPrice` 成交，可通过 `limitFillPolicy` 注入不同取价策略；
  - 滑点与手续费默认采用固定参数，但通过依赖注入替换 `SlippageModel`、`FeeModel`，允许在一期配置成自定义函数或不同费率；
  - 内部止损默认支持固定阈值，可在配置中调整阈值或关闭该功能。
- 设计保持扩展性，后续可在不改策略接口的情况下增加 L2 深度、队列优先级、撮合延迟等真实市场细节。

如需调整或扩展以上共识，请继续补充。框架方案的进一步细化将以此为基线。

## 7. 风险控制层细化

### 7.1 核心职责
- 拦截策略指令，在进入执行撮合前评估是否符合风控规则，输出 `risk.decision`。
- 监控策略账户状态、仓位、资金与历史损益，执行额度、杠杆、止盈止损等策略。
- 根据规则触发强平、撤单或策略暂停，并记录所有风控行为供复盘。
- 在暂停/恢复时保持风控状态一致，与事件总线快照体系协同。

### 7.2 事件输入与输出
- 输入事件：`strategy.intent`、`execution.report`、`portfolio.update`、`market.bar`（用于价格阈值）、`control`（如重置、暂停指令）。
- 输出事件：
  - `risk.decision`：含 `decision`（approve/reject/modify/halt）及原因码、修改后的订单字段。
  - `control`：必要时向编排器发出 `HALT_STRATEGY` 等控制事件。
  - `strategy.log`/`strategy.metric`：记录风控动作、违规次数等。

### 7.3 规则引擎接口

```typescript
type RiskDecisionType = 'approve' | 'reject' | 'modify' | 'halt';

interface RiskDecisionResult {
  decision: RiskDecisionType;
  modifiedIntent?: Partial<OrderIntentPayload>;
  reason?: { code: string; message: string };
  followUp?: Array<FollowUpAction>;
}

interface RiskRuleContext {
  portfolio: PortfolioSnapshot;
  currentIntent: OrderIntentPayload;
  historicalStats: HistoricalStats; // 当日/累计下单、盈亏等
  marketSnapshot: MarketBarEvent;
  runtimeConfig: RiskRuntimeConfig;
}

interface RiskRule {
  id: string;
  priority: number;
  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null;
}

interface FollowUpAction {
  type: 'force-close' | 'cancel-order' | 'notify';
  payload?: Record<string, unknown>;
}
```

- `evaluate` 返回 `null` 时表示“未处理”，引擎继续执行下一个规则；返回结果后遵循优先级决定是否短路。
- `RiskRuntimeConfig` 用于热更新规则参数（如限额、阈值）。

### 7.4 风险规则类型（一期）
- **额度/价格偏离规则**：限制单笔下单数量、检查限价偏离、禁止黑名单标的。
- **杠杆与仓位规则**：校验新订单后账户杠杆是否超标、单标的/全局敞口是否越界。
- **损益/回撤规则**：监控当日或累计亏损、浮动回撤，一旦触发可 `modify`（减仓）或 `halt`。
- **止盈止损规则**：独立止盈止损阈值（如达到固定收益/亏损比率），可触发 `followUp` 强平。
- **风控时间窗**：支持重置周期（如每日重置），利用编排层的定时控制事件或策略会话切分。

### 7.5 风控状态管理

```typescript
interface PortfolioSnapshot {
  balances: Record<string, string>;
  positions: Record<string, PositionSnapshot>;
  equity: string;
  marginUsage: string;
}

interface HistoricalStats {
  ordersToday: number;
  filledToday: number;
  pnlToday: string;
  cumulativePnl: string;
  maxDrawdown: string;
  lastResetAt: string;
}

interface RiskState {
  portfolio: PortfolioSnapshot;
  stats: HistoricalStats;
  halted: boolean;
}
```

- 风控层订阅 `portfolio.update` 和 `execution.report` 维护最新 `RiskState`；当规则运行时使用该状态。
- `halted` 状态为 `true` 时自动拒绝后续指令，直到编排层恢复或配置重置。

### 7.6 决策与后续动作
- `approve`：指令直接进入执行层，风控仍可记录日志。
- `modify`：修改数量、价格、TIF 等字段，返回 `modifiedIntent` 并随 `risk.decision` 广播；执行层使用修改后的指令。
- `reject`：直接拒单，策略侧收到 `risk.decision` 通知。
- `halt`：触发策略暂停（向编排器发控制事件），并可附加 `followUp` 强制平仓操作。
- 所有决策事件附带 `ruleId`、`reasonCode`、`severity`，供日志与后续分析使用。

### 7.7 快照与恢复

```typescript
interface RiskSnapshot {
  state: RiskState;
  lastProcessedSeq: string;
}
```

- 暂停/快照时序列化 `RiskState` 与最新事件序号；恢复后复原状态并从 `lastProcessedSeq` 继续处理意图。
- 当规则带有周期性统计（如每日重置），快照中需记录 `lastResetAt` 等字段，恢复后根据当前时间判断是否需要重新初始化。

### 7.8 一期实现范围
- 提供规则插件框架，但默认内置以下规则，可通过配置开关与参数调整：
  1. `MaxOrderSizeRule`
  2. `MaxLeverageRule`
  3. `PnLDailyLimitRule`
  4. `StopLossRule`
- 支持策略在 Manifest 中声明需要的风控参数（如 `maxLeverage`、`dailyLossLimit`），或者在会话配置中统一设定。
- 日志与指标：每次拒单/调整/强平，写入 `strategy.log`（level=`warn`/`error`）和对应 `strategy.metric`（例如 `risk.rejections` counter）。
- 预留扩展点：未来可添加组合风险、信用检查、流动性约束等规则而无需修改现有接口。

### 7.9 风控配置示例

```json
{
  "risk": {
    "rules": [
      {
        "id": "MaxOrderSizeRule",
        "enabled": true,
        "priority": 10,
        "params": {
          "maxQuantity": "5",
          "maxNotional": "100000",
          "symbols": ["BTC-USDT", "ETH-USDT"]
        }
      },
      {
        "id": "MaxLeverageRule",
        "enabled": true,
        "priority": 20,
        "params": {
          "maxLeverage": "3",
          "maxExposurePerSymbol": "200000",
          "maxExposureTotal": "500000"
        }
      },
      {
        "id": "PnLDailyLimitRule",
        "enabled": true,
        "priority": 30,
        "params": {
          "dailyLossLimit": "-10000",
          "dailyProfitLock": "15000",
          "resetAt": "00:00:00Z"
        }
      },
      {
        "id": "StopLossRule",
        "enabled": true,
        "priority": 40,
        "params": {
          "maxDrawdownPct": 0.1,
          "forceClose": true,
          "graceBars": 1
        }
      }
    ],
    "runtimeConfig": {
      "haltOnRule": ["PnLDailyLimitRule", "StopLossRule"],
      "logLevel": "warn"
    }
  }
}
```

- 规则数组按照 `priority` 执行；`enabled=false` 的规则会被跳过。
- `params` 与每个 `RiskRule` 的实现对应，可以定义阈值、限定标的、是否触发强平等。
- `runtimeConfig.haltOnRule` 指定哪些规则触发 `halt` 决策；其余规则默认 `reject` 或 `modify`。
- 若策略 Manifest 中声明了专属参数（如 `riskParams.maxOrderSize`），编排层可在加载时将其合并进上述配置。

如需调整或扩展以上共识，请继续补充。框架方案的进一步细化将以此为基线。

## 8. 编排与配置层细化

### 8.1 核心职责
- 整合策略 Manifest、系统默认与用户输入，生成完整的 `BacktestSessionConfig`。
- 校验配置依赖（数据源、特征、风控、撮合等），实例化各模块并注入事件总线。
- 管理回测会话生命周期（启动、暂停、恢复、快照、停止），对外提供统一接口。
- 聚合监控、日志、结果输出，为前端和 API 提供状态、快照、报告查询。
- 预留多会话/资源调度扩展能力。

### 8.2 配置结构与校验

```typescript
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

- 合并流程：
  1. 读取策略 Manifest（默认时间框架、特征、参数 schema）；
  2. 加载系统默认和用户配置（JSON/YAML）；
  3. 执行 schema 校验（例如 `ajv` 或自定义 validator）；
  4. 检查依赖：数据源粒度是否满足、特征是否存在、风控/撮合模型 ID 是否可用；
  5. 若不满足输出明确错误并终止会话创建。
- 配置示例：

```json
{
  "strategy": {
    "manifest": "strategies/mean-reversion/manifest.json",
    "parameters": { "lookback": 20, "threshold": 1.5 },
    "riskParams": { "dailyLossLimit": "-5000" }
  },
  "data": {
    "providerId": "duckdb.parquet",
    "symbols": ["BTC-USDT"],
    "timeRange": ["2024-01-01T00:00:00Z", "2024-02-01T00:00:00Z"]
  },
  "execution": {
    "marketFillPolicy": "open",
    "slippageModel": "fixed:0.0005",
    "feeModel": "maker:0.0002,taker:0.0004"
  },
  "risk": {
    "rules": [
      { "id": "MaxOrderSizeRule", "params": { "maxQuantity": "3" } }
    ]
  }
}
```

### 8.3 组件注册与依赖注入

```typescript
interface ComponentFactory<T> {
  id: string;
  create(config: BacktestSessionConfig, container: ServiceContainer): Promise<T>;
}

interface ServiceContainer {
  register<T>(token: string, instance: T): void;
  resolve<T>(token: string): T;
}
```

- 编排层按如下顺序创建组件：
  1. 数据 provider、timeframe adapter；
  2. Feature registry（加载内置与自定义特征）；
  3. Strategy sandbox（传入 Manifest、参数、上下文 API）；
  4. Wind控规则引擎（基于 `risk.rules` 注入）；
  5. Execution engine（注入滑点/手续费模型）；
  6. Event bus 与监控中间件。
- 所有组件通过容器注册，方便策略/风控/执行层在运行时互相获取依赖。

### 8.4 会话状态机

```typescript
type SessionStatus =
  | 'created'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'seeking'
  | 'stopping'
  | 'completed'
  | 'failed';

interface SessionState {
  sessionId: string;
  status: SessionStatus;
  startedAt?: string;
  endedAt?: string;
  lastError?: string;
  progress?: number; // 0-1，基于时间或事件序列
}
```

- 状态转移由编排层驱动，关键操作：
  - `start()`：校验配置 → 实例化组件 → 向总线发送 `START` 控制事件；
  - `pause()`：向总线发送 `PAUSE`，等待各模块确认；
  - `resume()`：恢复快照或继续从当前位置运行；
  - `seek(sequenceId)`：协调各模块重放到指定序列；
  - `stop()`：向总线发送 `STOP`，清理资源；
  - `complete()`：所有事件处理完毕后调用。
- 会话状态通过事件流发布给前端/API。

### 8.5 快照与恢复编排

```typescript
interface SessionSnapshot {
  meta: {
    sessionId: string;
    createdAt: string;
    status: SessionStatus;
  };
  modules: {
    strategy: StrategySnapshot;
    execution: ExecutionSnapshot;
    risk: RiskSnapshot;
    data?: DataSnapshot;
  };
  eventStoreCheckpoint: CheckpointSnapshot;
}
```

- 编排层协调：
  1. 向各模块发送 `SNAPSHOT` 控制事件；
  2. 汇总返回的快照片段，写入存储（本地文件或对象存储）；
  3. 恢复时按顺序重建组件，加载快照，并向总线发送 `RESUME`。
- 支持多版本快照（例如 auto/manual），并提供 API 列表、恢复、删除。

### 8.6 监控与日志聚合
- 订阅事件总线的 `metrics$`/`audit$`，汇总成会话层指标（事件处理延迟、风控拒单数、执行错误数等）。
- 将 `strategy.log`、`risk.decision`、`execution.report` 等写入统一日志目录（包含 sessionId、序列号、时间）。
- 对外提供实时状态接口（如 `/sessions/{id}/status`、`/sessions/{id}/metrics`）与结果下载接口。

### 8.7 API 接口示意

| 方法 | 路径 | 描述 |
|------|------|------|
| `POST` | `/sessions` | 创建并启动回测，提交配置 |
| `POST` | `/sessions/{id}/pause` | 暂停会话 |
| `POST` | `/sessions/{id}/resume` | 恢复会话 |
| `POST` | `/sessions/{id}/seek` | 跳转到指定 `sequenceId` 或时间 |
| `POST` | `/sessions/{id}/snapshot` | 创建快照 |
| `GET` | `/sessions/{id}` | 获取会话当前状态、进度 |
| `GET` | `/sessions/{id}/snapshots` | 列出快照 |
| `GET` | `/sessions/{id}/results` | 下载回测结果（交易账簿、featureCatalog 等） |

- 一期可先实现命令行/内部 API，后续扩展为 REST/gRPC。

### 8.8 一期实现要点
- 重点在：配置校验、组件装配、状态机驱动、快照/恢复流程打通。
- 多会话调度、并发限制、资源配额可作为二期扩展（但接口预留 `runQueue`、`resourceLimits` 字段）。
- 日志/指标可先输出到控制台或本地文件，后续对接监控系统。
- 与前端协同确定所需 API 和状态字段，确保界面操作与编排层兼容。

如需调整或扩展以上共识，请继续补充。框架方案的进一步细化将以此为基线。
