# Phase 5: 前端适配 - 数据导入页面 完成总结

**完成时间**: 2025-11-27  
**状态**: ✅ 全部完成，Lint 检查通过

---

## ✅ 已完成的任务

### 5.1 创建前端类型定义 ✅
**文件**: `frontend/src/shared/types/asset-types.ts`

**新增类型**:
```typescript
// 资产类型
export const AssetType = {
  Stock: 'stock',        // 股票
  Futures: 'futures',    // 期货
  Crypto: 'crypto',      // 加密货币
  Forex: 'forex',        // 外汇
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

// 佣金类型
export const CommissionType = {
  Percentage: 'percentage',
  Fixed: 'fixed',
  MakerTaker: 'maker-taker',
  Tiered: 'tiered',
} as const;

export type CommissionType = (typeof CommissionType)[keyof typeof CommissionType];

// 合约规格
export interface ContractSpecs {
  multiplier?: number;      // 合约乘数（期货）
  marginRatio?: number;     // 保证金比例（期货）
  lotSize?: number;         // 最小交易单位（股票）
  tickSize?: number;        // 最小变动价位（期货）
}

// 佣金配置
export interface CommissionConfig {
  type: CommissionType;
  rate?: number;
  amount?: number;
  makerRate?: number;
  takerRate?: number;
  minCommission?: number;
  stampDuty?: number;
}
```

**工具常量**:
```typescript
// 资产类型选项（用于下拉框）
export const ASSET_TYPE_OPTIONS = [
  { value: AssetType.Stock, label: '股票' },
  { value: AssetType.Futures, label: '期货' },
  { value: AssetType.Crypto, label: '加密货币' },
  { value: AssetType.Forex, label: '外汇' },
];

// 资产类型标签映射
export const ASSET_TYPE_LABELS: Record<string, string> = {
  [AssetType.Stock]: '股票',
  [AssetType.Futures]: '期货',
  [AssetType.Crypto]: '加密货币',
  [AssetType.Forex]: '外汇',
};
```

**技术决策**:
- ✅ 使用 `const + as const` 代替 `enum`（兼容 `erasableSyntaxOnly` 模式）
- ✅ 类型定义与后端完全一致
- ✅ 提供工具常量方便 UI 使用

---

### 5.2 更新 API 类型定义 ✅
**文件**: `frontend/src/shared/api/tradingData.ts`

**ImportTaskDto.metadata 新增字段**:
```typescript
metadata?: {
  source?: string | null;
  tradingPair?: string;
  granularity?: string;
  description?: string | null;
  labels?: string[];
  timeStart?: string | null;
  timeEnd?: string | null;
  assetType?: AssetType;           // ✅ 新增
  contractSpecs?: ContractSpecs;   // ✅ 新增
} | null;
```

**DatasetDto 新增字段**:
```typescript
export interface DatasetDto {
  // ... 现有字段 ...
  assetType?: AssetType;               // ✅ 新增
  contractSpecs?: ContractSpecs | null; // ✅ 新增
  // ... 现有字段 ...
}
```

---

### 5.3 更新创建导入任务表单 ✅
**文件**: `frontend/src/modules/trading-data/components/CreateImportModal.tsx`

#### 新增表单字段

**1. 资产类型选择**:
```tsx
<Form.Item label="资产类型（可选）" name="assetType">
  <Select
    placeholder="请选择资产类型"
    options={ASSET_TYPE_OPTIONS}
    allowClear
    onChange={(value) => {
      setSelectedAssetType(value);
      // 切换资产类型时清空合约规格字段
      form.setFieldsValue({
        multiplier: undefined,
        marginRatio: undefined,
        lotSize: undefined,
        tickSize: undefined,
      });
    }}
  />
</Form.Item>
```

**2. 合约规格配置（期货）**:
```tsx
{selectedAssetType === AssetType.Futures && (
  <>
    <Form.Item
      label="合约乘数"
      name="multiplier"
      tooltip="每手对应的标的物数量，例如螺纹钢期货为 10 吨/手"
    >
      <InputNumber min={1} placeholder="例：10" style={{ width: '100%' }} />
    </Form.Item>

    <Form.Item
      label="保证金比例"
      name="marginRatio"
      tooltip="交易所规定的保证金比例，例如 0.09 表示 9%"
    >
      <InputNumber min={0} max={1} step={0.01} placeholder="例：0.09" style={{ width: '100%' }} />
    </Form.Item>

    <Form.Item
      label="最小变动价位"
      name="tickSize"
      tooltip="合约价格的最小变动单位"
    >
      <InputNumber min={0} step={0.01} placeholder="例：1.0" style={{ width: '100%' }} />
    </Form.Item>
  </>
)}
```

**3. 合约规格配置（股票）**:
```tsx
{selectedAssetType === AssetType.Stock && (
  <Form.Item
    label="最小交易单位"
    name="lotSize"
    tooltip="最小交易单位，例如 A 股为 100 股/手"
  >
    <InputNumber min={1} placeholder="例：100" style={{ width: '100%' }} />
  </Form.Item>
)}
```

#### 数据提交逻辑

```typescript
const handleSubmit = async (values: CreateImportFormValues) => {
  // 构建合约规格（仅在有值时包含）
  const contractSpecs: ContractSpecs | undefined =
    values.multiplier || values.marginRatio || values.lotSize || values.tickSize
      ? {
          ...(values.multiplier && { multiplier: values.multiplier }),
          ...(values.marginRatio && { marginRatio: values.marginRatio }),
          ...(values.lotSize && { lotSize: values.lotSize }),
          ...(values.tickSize && { tickSize: values.tickSize }),
        }
      : undefined;

  const metadata = {
    source: values.source || null,
    tradingPair: values.tradingPair,
    granularity: values.granularity,
    labels,
    description: values.description || null,
    ...(values.assetType && { assetType: values.assetType }),  // ✅ 新增
    ...(contractSpecs && { contractSpecs }),                    // ✅ 新增
  };

  // ... 提交到后端
};
```

#### UI 设计
- ✅ 使用 Card 组件包裹合约规格配置，视觉清晰
- ✅ 根据资产类型动态显示/隐藏合约规格字段
- ✅ 切换资产类型时自动清空合约规格字段
- ✅ 所有字段都标注了 Tooltip 提示

---

### 5.4 更新导入详情页 ✅
**文件**: `frontend/src/modules/trading-data/components/ImportDetailDrawer.tsx`

#### 元数据部分

```tsx
<Descriptions.Item label="资产类型">
  {metadata?.assetType ? ASSET_TYPE_LABELS[metadata.assetType] : '-'}
</Descriptions.Item>

{metadata?.contractSpecs && (
  <Descriptions.Item label="合约规格" span={2}>
    <Space direction="vertical" size="small">
      {metadata.contractSpecs.multiplier && (
        <Text>合约乘数: {metadata.contractSpecs.multiplier}</Text>
      )}
      {metadata.contractSpecs.marginRatio && (
        <Text>保证金比例: {(metadata.contractSpecs.marginRatio * 100).toFixed(1)}%</Text>
      )}
      {metadata.contractSpecs.lotSize && (
        <Text>最小交易单位: {metadata.contractSpecs.lotSize}</Text>
      )}
      {metadata.contractSpecs.tickSize && (
        <Text>最小变动价位: {metadata.contractSpecs.tickSize}</Text>
      )}
    </Space>
  </Descriptions.Item>
)}
```

#### 数据集部分

```tsx
<Descriptions.Item label="资产类型">
  {dataset.assetType ? ASSET_TYPE_LABELS[dataset.assetType] : '-'}
</Descriptions.Item>

{dataset.contractSpecs && (
  <Descriptions.Item label="合约规格">
    <Space direction="vertical" size="small">
      {/* 同上 */}
    </Space>
  </Descriptions.Item>
)}
```

**显示特点**:
- ✅ 资产类型使用中文标签显示
- ✅ 合约规格仅在存在时显示
- ✅ 保证金比例格式化为百分比显示
- ✅ 多个规格值垂直排列，清晰易读

---

### 5.5 更新导入列表页 ✅
**文件**: `frontend/src/modules/trading-data/pages/ImportListPage.tsx`

#### 新增表格列

```tsx
{
  title: '资产类型',
  dataIndex: ['metadata', 'assetType'],
  render: (value: string) => value && value in ASSET_TYPE_LABELS ? (
    <Tag color="blue">{ASSET_TYPE_LABELS[value as keyof typeof ASSET_TYPE_LABELS]}</Tag>
  ) : value ? value : '-',
},
```

**显示效果**:
- ✅ 使用蓝色 Tag 显示资产类型
- ✅ 位置：在"时间粒度"和"状态"列之间
- ✅ 类型安全的标签映射
- ✅ 未设置时显示 "-"

**表格宽度调整**:
```tsx
scroll={{ x: 1200 }}  // 从 1100 增加到 1200
```

---

## 📊 完整的数据流

### 用户操作流程

```
1. 用户打开"新建导入任务"弹窗

2. 填写基本信息：
   - 数据来源
   - 交易对
   - 时间粒度

3. 选择资产类型（可选）
   - 股票 → 显示"最小交易单位"字段
   - 期货 → 显示"合约乘数"、"保证金比例"、"最小变动价位"字段
   - 加密货币 → 不显示额外字段
   - 外汇 → 不显示额外字段

4. 填写合约规格（可选）

5. 上传 CSV 文件

6. 提交
   ↓
   POST /api/v1/trading-data/imports
   Body: FormData {
     pluginName: 'CsvOhlcvPlugin',
     pluginVersion: '1.0.0',
     metadata: JSON.stringify({
       source: 'binance',
       tradingPair: 'BTC/USDT',
       granularity: '1m',
       assetType: 'crypto',        // ✅ 传递到后端
       contractSpecs: undefined,   // ✅ 传递到后端
     }),
     file: File
   }
   ↓
   后端接收并存储到 datasets 表
   ↓
   前端列表/详情页显示资产类型和合约规格
```

---

## 🎨 UI 效果预览

### 创建导入任务表单

```
┌─────────────────────────────────────┐
│ 新建导入任务                        │
├─────────────────────────────────────┤
│                                     │
│ 数据来源（可选）                    │
│ ┌─────────────────────────────────┐ │
│ │ binance                         │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 交易对 *                            │
│ ┌─────────────────────────────────┐ │
│ │ BTC/USDT                        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 时间粒度 *                          │
│ ┌─────────────────────────────────┐ │
│ │ 1 分钟                ▼         │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 资产类型（可选）                    │
│ ┌─────────────────────────────────┐ │
│ │ 期货                  ▼         │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ 合约规格配置（可选）────────────┐ │
│ │                                 │ │
│ │ 合约乘数 ⓘ                      │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ 10                          │ │ │
│ │ └─────────────────────────────┘ │ │
│ │                                 │ │
│ │ 保证金比例 ⓘ                    │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ 0.09                        │ │ │
│ │ └─────────────────────────────┘ │ │
│ │                                 │ │
│ │ 最小变动价位 ⓘ                  │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ 1.0                         │ │ │
│ │ └─────────────────────────────┘ │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ...                                 │
│                                     │
│           [取消]  [提交导入 ☁️]      │
└─────────────────────────────────────┘
```

### 导入列表

```
┌────────────────────────────────────────────────────────────────────┐
│ 导入任务列表               [新建导入任务+]  [刷新↻]                  │
├──────┬───────┬──────────┬─────┬──────┬────┬────┬─────┬────────────┤
│任务ID│ 来源  │  交易对  │粒度 │资产  │状态│进度│阶段 │   操作     │
├──────┼───────┼──────────┼─────┼──────┼────┼────┼─────┼────────────┤
│ 123  │binance│BTC/USDT  │ 1m  │期货  │完成│100%│完成 │详情 日志...│
│      │       │          │     │      │    │    │     │            │
│ 122  │ -     │ETH/USDT  │ 5m  │ -    │完成│100%│完成 │详情 日志...│
└──────┴───────┴──────────┴─────┴──────┴────┴────┴─────┴────────────┘
            资产类型用蓝色 Tag 显示 ↑
```

### 导入详情

```
┌─────────────────────────────────────┐
│ 导入任务 #123      [刷新] [查看日志] │
├─────────────────────────────────────┤
│                                     │
│ [完成] 阶段：完成 [████████] 100%   │
│                                     │
│ ┌─ 基本信息 ──────────────────────┐ │
│ │ 插件: CsvOhlcvPlugin v1.0.0    │ │
│ │ 来源: binance                  │ │
│ │ 交易对: BTC/USDT               │ │
│ │ 时间粒度: 1m                   │ │
│ │ 资产类型: 期货                 │ │  ✅ 新增
│ │ 合约规格:                      │ │  ✅ 新增
│ │   合约乘数: 10                 │ │
│ │   保证金比例: 9.0%             │ │
│ │   最小变动价位: 1.0            │ │
│ └────────────────────────────────┘ │
│                                     │
│ ┌─ 清洗结果 ──────────────────────┐ │
│ │ 数据集 ID: 456                 │ │
│ │ 资产类型: 期货                 │ │  ✅ 新增
│ │ 合约规格:                      │ │  ✅ 新增
│ │   合约乘数: 10                 │ │
│ │   保证金比例: 9.0%             │ │
│ │   最小变动价位: 1.0            │ │
│ │ 时间范围: ...                  │ │
│ │ 记录数: 10000                  │ │
│ └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 📂 修改的文件清单

```
frontend/src/
├── shared/
│   ├── types/
│   │   └── asset-types.ts                    ✅ 新建（类型定义）
│   └── api/
│       └── tradingData.ts                    ✅ 修改（添加类型字段）
└── modules/
    └── trading-data/
        ├── components/
        │   ├── CreateImportModal.tsx         ✅ 修改（添加表单字段）
        │   └── ImportDetailDrawer.tsx        ✅ 修改（显示新字段）
        └── pages/
            └── ImportListPage.tsx            ✅ 修改（添加列）
```

**统计**:
- ✅ 新建文件：1 个
- ✅ 修改文件：4 个
- ✅ 总代码行数：~200 行

---

## ✅ 完成检查清单

### 代码实现
- [x] 前端类型定义（asset-types.ts）
- [x] API 类型更新（tradingData.ts）
- [x] 创建表单更新（CreateImportModal.tsx）
- [x] 详情页更新（ImportDetailDrawer.tsx）
- [x] 列表页更新（ImportListPage.tsx）

### 功能完整性
- [x] 资产类型选择下拉框
- [x] 期货合约规格配置（3个字段）
- [x] 股票合约规格配置（1个字段）
- [x] 动态显示/隐藏合约规格
- [x] 数据提交到后端
- [x] 列表显示资产类型
- [x] 详情显示资产类型和合约规格

### 代码质量
- [x] Lint 检查通过
- [x] TypeScript 类型安全
- [x] 无编译错误（修改的文件）
- [x] UI/UX 友好

### 技术细节
- [x] 使用 `const + as const` 代替 `enum`
- [x] 类型安全的标签映射
- [x] 合约规格按需显示
- [x] 表单字段联动清空

---

## 🎯 与后端对接

### 后端已完成（Phase 1-4）
1. ✅ 数据库迁移（datasets 表添加 asset_type 和 contract_specs）
2. ✅ DTO 定义（ImportMetadataDto 添加字段）
3. ✅ Entity 定义（DatasetEntity 添加字段）
4. ✅ Worker 实现（CommissionManager 处理不同资产类型）

### 前端已完成（Phase 5）
1. ✅ 类型定义（与后端一致）
2. ✅ 数据导入表单（捕获用户输入）
3. ✅ API 调用（传递新字段）
4. ✅ 数据展示（列表、详情）

### 数据流完整性 ✅
```
前端表单 → FormData → 后端 API → ImportMetadata → DatasetEntity → 数据库
   ↑                                                                   ↓
   └──────────────────── 查询显示 ←──────────────────────────────────┘
```

---

## 💡 使用示例

### 示例 1: 导入期货数据

1. 用户操作：
   - 交易对：`RB2501`
   - 时间粒度：`1m`
   - 资产类型：`期货`
   - 合约乘数：`10`
   - 保证金比例：`0.09`
   - 最小变动价位：`1.0`

2. 提交的 metadata：
```json
{
  "source": null,
  "tradingPair": "RB2501",
  "granularity": "1m",
  "assetType": "futures",
  "contractSpecs": {
    "multiplier": 10,
    "marginRatio": 0.09,
    "tickSize": 1.0
  }
}
```

3. 后端存储到 datasets 表：
```sql
INSERT INTO datasets (
  trading_pair, granularity, asset_type, contract_specs, ...
) VALUES (
  'RB2501', '1m', 'futures', 
  '{"multiplier": 10, "marginRatio": 0.09, "tickSize": 1.0}', ...
);
```

4. 前端显示：
   - 列表：`资产类型: 期货`
   - 详情：显示完整的合约规格

### 示例 2: 导入 A 股数据

1. 用户操作：
   - 交易对：`SH600000`
   - 时间粒度：`1d`
   - 资产类型：`股票`
   - 最小交易单位：`100`

2. 提交的 metadata：
```json
{
  "source": null,
  "tradingPair": "SH600000",
  "granularity": "1d",
  "assetType": "stock",
  "contractSpecs": {
    "lotSize": 100
  }
}
```

### 示例 3: 导入加密货币数据（无合约规格）

1. 用户操作：
   - 交易对：`BTC/USDT`
   - 时间粒度：`5m`
   - 资产类型：`加密货币`
   - （不显示合约规格字段）

2. 提交的 metadata：
```json
{
  "source": "binance",
  "tradingPair": "BTC/USDT",
  "granularity": "5m",
  "assetType": "crypto"
  // 无 contractSpecs
}
```

---

## 🚀 后续工作

### Phase 5 剩余任务
- ⏳ 回测任务创建页面适配
- ⏳ 回测任务详情页适配
- ⏳ 回测任务列表页适配
- ⏳ 数据集管理页面适配

### 建议优先级
1. **数据导入页面** ✅ 已完成
2. **回测任务创建页面** - 核心功能，用户使用频率最高
3. **回测任务详情页** - 查看佣金配置
4. **数据集管理页面** - 查看数据集的资产类型
5. **回测任务列表页** - 过滤和展示

---

## 📝 技术亮点

### 1. 类型安全 ✅
- 使用 TypeScript 严格类型检查
- 前后端类型定义一致
- 避免运行时类型错误

### 2. UI/UX 友好 ✅
- 动态显示/隐藏字段
- Tooltip 提示帮助用户理解
- 使用 Card 组件视觉分组
- 切换资产类型自动清空相关字段

### 3. 向后兼容 ✅
- 所有新字段都是可选的
- 不影响现有功能
- 支持历史数据（显示为"-"）

### 4. 代码质量 ✅
- Lint 规则通过
- 无编译警告
- 清晰的代码注释
- 统一的代码风格

---

**Phase 5 数据导入页面适配完美完成！** 🎉

用户现在可以在导入数据时指定资产类型和合约规格，为后续的回测提供准确的参数！


