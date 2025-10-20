# 回测脚本架构设计

## 1. 设计目标
- 为量化策略提供一致的 TypeScript 开发体验，与平台回测引擎无缝对接。
- 通过接口继承约束策略生命周期、参数声明、因子注册，确保元数据可追溯。
- 通过 SDK 封装数据访问、交易账户、指标记录，阻断对底层存储的直接依赖。

## 2. 脚本形态与结构
- **语言与运行时**：策略脚本使用 TypeScript 编写，平台以 Bun 运行时直接执行，无需预先打包。
- **入口约定**：脚本导出一个实现 `BacktestStrategyModule` 接口的默认对象或工厂函数。
- **Manifest**：策略模块可选导出 `manifest` 常量，描述依赖的内置因子、使用的自定义变量、所需的数据源标签，便于平台管理。

```ts
import { defineStrategy } from '@platform/backtest-sdk';

export default defineStrategy({
  meta: {
    name: 'overlap-long',
    version: '1.0.0',
    description: '基于重叠度筛选多头信号',
    tags: ['momentum', 'spot'],
  },
  variables: () => [
    {
      name: 'lookback',
      schema: {
        type: 'integer',
        title: '重叠度窗口',
        minimum: 5,
        maximum: 200,
        default: 20,
        description: '计算历史重叠度的 K 线数量',
        'x-ui': {
          widget: 'slider',
          step: 1,
        },
      },
    },
    {
      name: 'minOverlap',
      schema: {
        type: 'number',
        title: '最小重叠度',
        default: 0.6,
        minimum: 0,
        maximum: 1,
        description: '触发下单所需的最小重叠比率',
        'x-ui': {
          widget: 'input-number',
          precision: 2,
        },
      },
    },
  ],
  factors: () => [
    {
      key: 'overlap',
      schema: {
        type: 'number',
        title: '窗口重叠度',
        description: '最近 lookback 根 K 线的重叠比例',
        minimum: 0,
        maximum: 1,
        'x-filter': {
          widget: 'range-slider',
          mode: 'between',
          precision: 2,
        },
      },
    },
  ],
  hooks: {
    onInit: async ({ context }) => {
      context.state.set('history', []);
    },
    onBar: async ({ bar, context }) => {
      const params = context.params;
      const history = context.state.get<number[]>('history');
      const overlap = context.utils.calcOverlap(history, bar, params.lookback);
      context.factors.record('overlap', bar.timestamp, overlap, { symbol: bar.symbol });
      if (overlap >= params.minOverlap) {
        await context.order.submit({
          side: 'BUY',
          symbol: bar.symbol,
          quantity: context.portfolio.sizePct(0.1),
          type: 'MARKET',
        });
      }
      context.state.update('history', (arr) =>
        context.utils.pushBar(arr, bar, params.lookback),
      );
    },
  },
});
```

## 3. 核心接口

### 3.1 `BacktestStrategyModule`
- `meta`：策略元信息（名称、版本、描述、标签、默认市场）用于策略管理模块展示。
- `variables(builder)`：返回 `VariableDefinition[]`，其中每个定义包含 `name` 与符合 JSON Schema Draft 2020-12 的 `schema`；schema 支持枚举、数值范围、依赖关系以及扩展字段 `x-ui.*`（用于声明前端筛选器类型、默认交互控件、展示分组等）。
- `factors(builder)`：返回 `FactorDefinition[]`，包含因子 `key`、类型 schema（同样遵循 JSON Schema），以及 `x-filter.*` 扩展，指定前端筛选组件、可选枚举、区间模式与维度映射。
- `hooks`：策略生命周期钩子集合，常用包括：
  - `onInit(ctx)`：初始化状态、注册指标。
  - `onBar(payload)`：每个 K 线触发，payload 含 `bar`, `context`。
  - `onFinalize(ctx)`：清理资源、记录最终指标。
  - 预留 `onSignal`、`onTick`、`onOrderFill` 等未来扩展。
- `services?`：可选，声明所需的内置服务（如 `portfolioMetrics`, `riskControls`），平台按需注入。

### 3.2 `StrategyContext`
- `params`：根据变量声明生成的参数对象，包含默认值与用户输入。
- `logger`：结构化日志输出（`debug/info/warn/error`），自动附带任务 ID。
- `state`：任务内存储（`set/get/update/delete`），生命周期与任务一致。
- `data`：数据访问接口，常用方法：
  - `series({ datasetId, symbol, granularity, fields, start, end })`：批量拉取历史。
  - `stream.subscribe('bar', handler)`：订阅额外序列。
  - 内部处理分页、缓存，不暴露 DuckDB/Parquet。
- `order`：交易指令接口（`submit`, `cancel`, `replace`），返回 Promise。
- `portfolio`：账户视图，含仓位、余额、`sizePct` 等辅助方法。
- `factors.record(key, timestamp, value, context?)`：记录自定义因子，`context` 可注明 symbol/position 等过滤维度。
- `metrics.record(name, value, timestamp?)`：写入自定义指标。
- `analytics`：访问内置指标库，例如重叠度、波动率、收益分布。
- `utils`：常用工具函数（移动平均、滚动窗口、规范化等）。

### 3.3 错误与终止
- 策略可抛出 `StrategyError`（含 `code`, `message`, `details`），平台将返回用户友好的错误。
- 未捕获异常会导致任务失败；SDK 会附带最近日志、参数快照。
- 支持在 `context.abort('reason')` 下主动请求终止。

### 3.4 JSON Schema 扩展约定
- `x-ui.widget`：前端控件类型（如 `slider`、`input-number`、`select`、`tag-group`、`date-range`）。
- `x-ui.filterMode`：筛选语义（`single`、`multiple`、`between`、`relative-range` 等），驱动筛选器行为。
- `x-ui.datasource`：引用平台保存的枚举/字典数据来源（如交易对列表、市场标签），前端按需懒加载。
- `x-filter.widget` / `x-filter.mode`：用于因子筛选器，控制结果页的条件构建器。
- 其余自定义字段以 `x-` 前缀扩展，平台后端会在持久化前做白名单校验，确保兼容性。

## 4. 因子与变量元数据管理
- 自定义变量与因子元数据会在策略上传时校验并存入策略管理库，形成版本快照。
- 平台缓存变量/因子的 JSON Schema 与 `x-ui`/`x-filter` 扩展信息，生成控制台表单与结果筛选器配置，并在任务执行时记录 schema 摘要便于回溯。
- 任务启动时，将变量默认值与用户输入合并，注入 `context.params`；保留参数实例审计记录。
- 因子定义会同步至回测结果分析模块，用于筛选器、对比视图、导出字段。
- 运行时生成的因子数据按 `任务ID/因子key/过滤维度` 组织，写入 DuckDB/Parquet；基础指标写入 PostgreSQL。
- 内置因子库由平台维护，策略可在 manifest 中声明 `builtinFactors: ['triggeredAt', 'holdingDuration', 'overlap5', ...]` 以启用。

## 5. 开发与调试流程
- **本地 CLI**：提供 `backtest run --strategy path/to/file.ts --dataset BTC_USDT --from 2023-01-01`，使用相同 SDK 在沙箱数据上调试。
- **静态检查**：提交前需通过 ESLint、TypeScript 编译检查；CI 自动运行示例回测确保钩子基本完整。
- **日志与快照**：本地运行支持输出任务快照（指标摘要、因子样例），便于在平台验证。
- **版本控制**：策略脚本与 manifest 一同上传，平台根据内容计算版本号；可标记主版本并关联依赖审计。

## 6. 安全约束
- 禁止使用 `eval`、动态 `import` 外部 URL、`child_process` 等高危 API。
- 不允许直接访问文件系统或网络；如需额外数据，须通过平台审核的外部数据接口。
- SDK 限制资源使用（最大内存、最大执行时间将于后续阶段配置）。
- 变量与因子元数据需通过 schema 验证，避免恶意注入或过大 payload。

## 7. 未来扩展
- **多语言运行时**：规划通过 WASM/gRPC 支持 Python/Rust，但统一遵循相同接口规范。
- **状态持久化**：提供受控的跨任务缓存（如模型权重），需在 manifest 中声明。
- **更丰富的钩子**：引入 `onDailyClose`, `onSignal`, `onRiskLimit` 等事件。
- **策略依赖管理**：支持用户声明 NPM 依赖，由平台审核后注入隔离环境。
- **测试框架**：内置策略单元测试辅助（模拟数据片段、断言指标），提升迭代效率。
