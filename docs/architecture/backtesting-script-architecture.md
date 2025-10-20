# 回测脚本架构设计

## 1. 设计目标
- 为量化策略提供一致的 TypeScript 开发体验，与平台回测引擎无缝对接。
- 所有变量、因子、参数注册在脚本内部完成，无需额外表单或 JSON Schema 配置。
- 后台直接保存脚本源码文本，版本化管理并可在控制台内编辑。

## 2. 脚本形态与结构
- **语言与运行时**：策略脚本使用 TypeScript 编写，平台以 Bun 运行时直接执行，无需预打包。
- **入口约定**：脚本导出一个实现 `BacktestStrategyModule` 接口的默认对象或工厂函数。
- **在线编辑**：控制台采用 Monaco Editor 呈现和保存脚本；支持创建新版本、编辑已有版本、标记主版本。
- **Manifest（可选）**：脚本可导出或附带 manifest，用于描述入口文件、依赖、默认标签等元信息，存储为 JSON。

```ts
import { defineStrategy } from '@platform/backtest-sdk';

export default defineStrategy({
  meta: {
    name: 'overlap-long',
    version: '1.0.0',
    description: '基于重叠度筛选多头信号',
    tags: ['momentum', 'spot'],
  },
  variables: ({ types }) => [
    types.float('lookback', {
      label: '重叠度窗口',
      default: 20,
      min: 5,
      max: 200,
    }),
    types.float('minOverlap', {
      label: '最小重叠度',
      default: 0.6,
      min: 0,
      max: 1,
    }),
  ],
  factors: ({ filters, dataTypes }) => [
    {
      key: 'overlap',
      label: '窗口重叠度',
      valueType: dataTypes.float,
      filter: filters.bySymbol(),
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
- `variables(builder)`：返回变量配置集合，SDK 提供便捷的 `types.xxx` 方法声明类型、默认值、校验范围；平台在回测任务配置时自动呈现。
- `factors(builder)`：返回自定义因子注册，定义因子的 key、展示名、筛选维度等，回测执行时通过 `context.factors.record` 输出。
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

## 4. 因子与变量注册
- 变量与因子的定义全部在脚本代码中完成，并由 SDK 在任务执行前解析。
- 回测任务创建时读取脚本最新主版本，将 `variables` 输出为配置表单，`factors` 注册为分析维度。
- 无需对变量/因子做手工表单编辑，所有变更通过脚本版本迭代进行。
- 运行中调用 `context.factors.record` 和 `context.metrics.record` 输出数据，平台按任务 ID 和因子 key 建立索引。

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
- **静态分析**：保存脚本时自动运行类型检查、lint、依赖审查，阻断不安全脚本。
- **变量/因子可视化**：解析脚本后在控制台展示变量说明、默认值、返回类型等信息。
- **脚本差异对比**：支持版本间 diff、评论、审批流程。
- **多语言脚本**：规划通过 WASM / gRPC 兼容 Python、Rust 等，但仍遵循相同上下文与钩子协议。
- **测试框架**：提供脚本级 unit test 工具（模拟行情、断言指标），提升研发效率。
