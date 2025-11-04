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

### 3.13 featureCatalog 存储形态
- 为兼顾查询与展示，回测结束时生成两份特征目录：
  - `feature_catalog.parquet`：结构化列式数据，字段示例 `feature_id`、`output_id`、`label`、`value_type`、`unit`、`supported_operators`、`domain`、`range_min`、`range_max`、`is_implicit` 等，方便 DuckDB/Arrow 直接 join 交易明细做统计或过滤。
  - `featureCatalog.json`：便于前端一次性加载的轻量元数据，沿用同样字段并可补充描述、分组、排序权重等 UI 信息。
- 交易明细 Parquet 中保留与特征目录关联的字段（如 `feature_id` 或 `output_id`），实现事实表与维度表的解耦。
- 生成流程：Registry 解析会话的 `featureSet` → 拓扑排序得到实际启用的特征（含隐式依赖）→ 输出结构化目录 → 同步导出 JSON 版本。
- 当特征定义迭代时，历史回测保留当时的目录文件，保证报告与筛选功能可回放，避免受当前 Registry 变化影响。

### 3.12 特征依赖关系建模
- `FeatureDefinition.dependsOn` 用于声明构建特征前必须可用的输入，可分两类：
  - `type: 'field'`：依赖原始行情字段，如 `high`、`low`、`volume`；框架会在预处理阶段确保字段存在。
  - `type: 'feature'`：依赖另一特征（如 `MACD` 需要 `EMA`）；Registry 会按拓扑顺序拓展依赖链。
- 注册流程：
  1. 校验依赖是否存在（内置或自定义特征已注册），否则拒绝登记。
  2. 构建依赖图并执行环检测，防止循环引用。
  3. 生成拓扑排序，确保计算时先执行依赖特征，再执行当前特征。
- 在会话解析 `featureSet` 时，若用户仅配置 `MACD`，Registry 会自动补全其依赖的 `EMA12`、`EMA26`，并将这些特征添加到执行计划（并可标记为“隐式启用”以控制是否暴露给前端过滤器）。
- 对于可选依赖（`optional: true`），当配置中未启用对应特征时可退化到默认行为（例如使用原始字段替代）；如无法退化则在解析阶段报错。
- 依赖信息同样会写入 `featureCatalog`，报告模块可以根据依赖树决定哪些特征需要一起展示或作为过滤器选择项。



如需调整或扩展以上共识，请继续补充。框架方案的进一步细化将以此为基线。
