# 创建回测任务 - 交互流程设计

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**状态**: 🟡 待确认

---

## 📋 功能概述

用户可以从策略列表页快速发起回测，通过弹窗表单配置回测参数，系统自动使用策略的参数Schema动态生成配置表单。

---

## 1. 交互流程

### 1.1 入口

**位置**: 策略列表页 (`/backtesting/strategies`)

**触发方式**:
- 策略列表每行添加"开始回测"按钮
- 策略详情页也提供"开始回测"按钮

**按钮样式**:
```tsx
<Button type="primary" icon={<RocketOutlined />}>
  开始回测
</Button>
```

---

### 1.2 弹窗表单结构

#### 弹窗设计
```tsx
<Modal
  title="创建回测任务"
  width={800}
  open={visible}
  onOk={handleSubmit}
  onCancel={handleCancel}
>
  <Form layout="vertical">
    {/* 表单内容 */}
  </Form>
</Modal>
```

---

## 2. 表单字段详细设计

### 步骤1：基本信息

#### 2.1 策略信息（只读展示）
```tsx
<Descriptions bordered size="small">
  <Descriptions.Item label="策略名称">
    {strategy.name}
  </Descriptions.Item>
  <Descriptions.Item label="当前版本">
    <Tag color="blue">{scriptVersion.versionName}</Tag>
    {scriptVersion.isMaster && <Tag color="green">Master</Tag>}
  </Descriptions.Item>
</Descriptions>
```

**字段说明**:
- **策略名称**: 只读，显示当前选中的策略
- **脚本版本**: 
  - 默认选中 `master` 版本
  - 提供版本切换下拉框（可选其他版本）
  - 显示版本号和master标记

```tsx
<Form.Item label="脚本版本" name="scriptVersionId">
  <Select 
    defaultValue={masterVersion?.scriptVersionId}
    placeholder="选择脚本版本"
  >
    {scriptVersions.map(v => (
      <Select.Option key={v.scriptVersionId} value={v.scriptVersionId}>
        {v.versionName} {v.isMaster && '(Master)'}
      </Select.Option>
    ))}
  </Select>
</Form.Item>
```

#### 2.2 任务名称
```tsx
<Form.Item 
  label="任务名称" 
  name="taskName"
  rules={[{ required: true, message: '请输入任务名称' }]}
  initialValue={`${strategy.name}-回测-${dayjs().format('YYYY-MM-DD')}`}
>
  <Input placeholder="请输入任务名称" maxLength={100} />
</Form.Item>
```

**字段说明**:
- 必填
- 默认值：`{策略名称}-回测-{当前日期}`
- 最大长度：100字符

#### 2.3 任务描述（可选）
```tsx
<Form.Item label="任务描述" name="taskDescription">
  <Input.TextArea 
    placeholder="请输入任务描述（可选）" 
    rows={2}
    maxLength={500}
  />
</Form.Item>
```

---

### 步骤2：数据集配置

#### 2.4 选择数据集
```tsx
<Form.Item 
  label="数据集" 
  name="datasetId"
  rules={[{ required: true, message: '请选择数据集' }]}
>
  <Select
    showSearch
    placeholder="请选择数据集"
    filterOption={(input, option) =>
      option?.label?.toLowerCase().includes(input.toLowerCase())
    }
    onChange={handleDatasetChange}
    options={datasets.map(d => ({
        label: `${d.description || d.tradingPair} (${d.tradingPair})`,
        value: d.datasetId,
        dataset: d
      }))}
  />
</Form.Item>
```

**数据集信息展示**（选择后显示）:
```tsx
{selectedDataset && (
  <Alert
    message="数据集信息"
    description={
      <Descriptions size="small" column={2}>
        <Descriptions.Item label="交易对">
          {selectedDataset.tradingPair}
        </Descriptions.Item>
        <Descriptions.Item label="时间周期">
          {selectedDataset.granularity}
        </Descriptions.Item>
        <Descriptions.Item label="数据范围">
          {dayjs(selectedDataset.timeStart).format('YYYY-MM-DD')} 至 
          {dayjs(selectedDataset.timeEnd).format('YYYY-MM-DD')}
        </Descriptions.Item>
        <Descriptions.Item label="数据量">
          {selectedDataset.rowCount?.toLocaleString()} 条
        </Descriptions.Item>
      </Descriptions>
    }
    type="info"
    style={{ marginTop: 8 }}
  />
)}
```

**字段说明**:
- 必选
- 显示所有有效数据集（`deletedAt` 为 null）
- 支持搜索（按描述和交易对）
- 选择后显示数据集详情

**数据集实体字段（来自 dataset.entity.ts）**:
```typescript
interface DatasetEntity {
  datasetId: number;           // 数据集ID（自增主键）
  source?: string | null;      // 数据来源渠道
  tradingPair: string;         // 交易对或标的符号（如BTC/USDT）
  granularity: string;         // 时间粒度（如1m, 5m, 1h, 1d）
  path: string;                // 数据集根目录或主文件的相对路径
  timeStart: Date;             // 数据集中最早一条记录的时间（UTC）
  timeEnd: Date;               // 数据集中最新一条记录的时间（UTC）
  rowCount: number;            // 数据集中包含的记录条数
  checksum: string;            // 清洗结果文件的校验值（如MD5）
  labels: string[];            // 自定义标签集合
  description?: string | null; // 数据集描述或备注信息
  deletedAt?: Date | null;     // 软删除标记时间
  createdAt: Date;             // 创建时间
  updatedAt: Date;             // 更新时间
}
```

#### 2.5 时间范围
```tsx
<Form.Item 
  label="回测时间范围" 
  name="timeRange"
  rules={[{ required: true, message: '请选择时间范围' }]}
  initialValue={selectedDataset ? [
    dayjs(selectedDataset.timeStart),
    dayjs(selectedDataset.timeEnd)
  ] : undefined}
>
  <RangePicker 
    showTime
    format="YYYY-MM-DD HH:mm:ss"
    style={{ width: '100%' }}
    disabledDate={(current) => {
      if (!selectedDataset) return true;
      return current < dayjs(selectedDataset.timeStart) || 
             current > dayjs(selectedDataset.timeEnd);
    }}
  />
</Form.Item>

{selectedDataset && (
  <Alert
    message={`数据集时间范围：${dayjs(selectedDataset.timeStart).format('YYYY-MM-DD HH:mm')} 至 ${dayjs(selectedDataset.timeEnd).format('YYYY-MM-DD HH:mm')}`}
    type="info"
    showIcon
    style={{ marginBottom: 16 }}
  />
)}
```

**字段说明**:
- 默认使用数据集时间范围（`timeStart` ~ `timeEnd`）
- 用户可以修改时间范围，但必须限制在数据集时间范围内
- 日期选择器自动禁用超出范围的日期

#### 2.6 交易时间周期
```tsx
<Form.Item 
  label="交易时间周期" 
  name="timeframe"
  tooltip="最小时间颗粒度为数据集的时间周期"
  initialValue={selectedDataset?.granularity}
>
  <Select 
    placeholder="选择时间周期"
    disabled={!selectedDataset}
  >
    {getAvailableTimeframes(selectedDataset?.granularity).map(tf => (
      <Select.Option key={tf.value} value={tf.value}>
        {tf.label}
      </Select.Option>
    ))}
  </Select>
</Form.Item>
```

**时间周期逻辑**:
```typescript
// 根据数据集的granularity确定可用的时间周期
const getAvailableTimeframes = (granularity: string) => {
  const allTimeframes = [
    { value: '1m', label: '1分钟', minutes: 1 },
    { value: '5m', label: '5分钟', minutes: 5 },
    { value: '15m', label: '15分钟', minutes: 15 },
    { value: '30m', label: '30分钟', minutes: 30 },
    { value: '1h', label: '1小时', minutes: 60 },
    { value: '4h', label: '4小时', minutes: 240 },
    { value: '1d', label: '1天', minutes: 1440 },
  ];
  
  // 找到数据集的时间周期
  const datasetTf = allTimeframes.find(tf => tf.value === granularity);
  if (!datasetTf) return allTimeframes;
  
  // 只返回大于等于数据集时间周期的选项
  return allTimeframes.filter(tf => tf.minutes >= datasetTf.minutes);
};
```

**字段说明**:
- 默认值：数据集的 `granularity`
- 可选值：大于等于数据集时间颗粒度的选项
- 例如：数据集是1分钟数据，可选1m/5m/15m/30m/1h/4h/1d

---

### 步骤3：交易配置

#### 2.7 初始资金
```tsx
<Form.Item 
  label="初始资金" 
  name="initialCapital"
  rules={[
    { required: true, message: '请输入初始资金' },
    { type: 'number', min: 1, message: '初始资金必须大于0' }
  ]}
  initialValue={10000}
>
  <InputNumber
    style={{ width: '100%' }}
    min={1}
    max={10000000}
    step={1000}
    formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
    parser={value => value!.replace(/\$\s?|(,*)/g, '')}
  />
</Form.Item>
```

**字段说明**:
- 必填
- 默认值：10000
- 范围：1 - 10,000,000
- 格式化显示：美元符号和千位分隔符

#### 2.8 手续费设置
```tsx
<Form.Item label="手续费设置">
  <Row gutter={16}>
    <Col span={12}>
      <Form.Item 
        label="Maker费率" 
        name={['fees', 'makerFee']}
        initialValue={0.0002}
        rules={[{ required: true }]}
      >
        <InputNumber
          style={{ width: '100%' }}
          min={0}
          max={0.01}
          step={0.0001}
          formatter={value => `${(value * 100).toFixed(3)}%`}
          parser={value => value!.replace('%', '') / 100}
        />
      </Form.Item>
    </Col>
    <Col span={12}>
      <Form.Item 
        label="Taker费率" 
        name={['fees', 'takerFee']}
        initialValue={0.0005}
        rules={[{ required: true }]}
      >
        <InputNumber
          style={{ width: '100%' }}
          min={0}
          max={0.01}
          step={0.0001}
          formatter={value => `${(value * 100).toFixed(3)}%`}
          parser={value => value!.replace('%', '') / 100}
        />
      </Form.Item>
    </Col>
  </Row>
</Form.Item>
```

**字段说明**:
- Maker费率：默认 0.02%（0.0002）
- Taker费率：默认 0.05%（0.0005）

#### 2.9 高级配置（折叠面板）

```tsx
<Collapse ghost>
  <Collapse.Panel header="高级配置（可选）" key="advanced">
    {/* 交易时段 */}
    <Form.Item label="交易时段">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Checkbox 
          checked={enableTradingHours}
          onChange={(e) => setEnableTradingHours(e.target.checked)}
        >
          限制交易时段
        </Checkbox>
        
        {enableTradingHours && (
          <Space>
            <Form.Item name={['tradingHours', 'start']} noStyle>
              <TimePicker format="HH:mm" placeholder="开始时间" />
            </Form.Item>
            <span>至</span>
            <Form.Item name={['tradingHours', 'end']} noStyle>
              <TimePicker format="HH:mm" placeholder="结束时间" />
            </Form.Item>
          </Space>
        )}
      </Space>
    </Form.Item>
  </Collapse.Panel>
</Collapse>
```

**字段说明**:
- 可选功能，放在折叠面板中
- 交易时段：默认不启用（24小时交易）
- 启用后选择开始和结束时间

---

### 步骤4：策略参数

#### 2.12 动态策略参数
```tsx
<Divider>策略参数</Divider>

{/* 根据策略的parameterSchema动态渲染 */}
<SchemaFormRenderer 
  schema={scriptVersion.parameterSchema}
  formInstance={form}
  fieldPrefix="strategyParams"
/>
```

**Schema渲染逻辑**:
```tsx
const SchemaFormRenderer = ({ schema, formInstance, fieldPrefix }) => {
  if (!schema || schema.length === 0) {
    return <Empty description="该策略没有可配置参数" />;
  }
  
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {schema.map(field => (
        <Form.Item
          key={field.key}
          label={field.label || field.key}
          name={[fieldPrefix, field.key]}
          rules={[
            { required: field.required, message: `请输入${field.label}` },
            ...(field.validator ? [field.validator] : [])
          ]}
          initialValue={field.defaultValue}
          tooltip={field.desc}
        >
          {renderFormControl(field)}
        </Form.Item>
      ))}
    </Space>
  );
};

const renderFormControl = (field: SchemaField) => {
  switch (field.type) {
    case 'number':
    case 'integer':
      return (
        <InputNumber
          style={{ width: '100%' }}
          min={field.min}
          max={field.max}
          step={field.step || 1}
        />
      );
    
    case 'string':
      return <Input maxLength={field.maxLength} />;
    
    case 'boolean':
      return <Switch />;
    
    case 'enum':
      return (
        <Select>
          {field.enumOptions?.map(opt => (
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
      );
    
    default:
      return <Input />;
  }
};
```

**字段说明**:
- 根据策略的 `parameterSchema` 动态生成表单字段
- 支持的类型：number、integer、string、boolean、enum
- 自动应用默认值、校验规则、最小最大值等
- 显示字段描述（tooltip）

---

## 3. 表单提交

### 3.1 数据结构
```typescript
{
  taskName: string;
  taskDescription?: string;
  strategyId: string;
  scriptVersionId: string;
  datasetId: string;
  
  // 数据配置
  dataConfig: {
    timeRange?: {
      start: string;  // ISO 8601
      end: string;
    };
    timeframe: string;
  };
  
  // 策略参数
  strategyParams: Record<string, any>;
  
  // 执行配置
  executionConfig: {
    initialCapital: number;
    leverage: number;           // 本期默认传1（不实现杠杆功能）
    slippage: number;            // 本期默认传0（不实现滑点功能）
    fees: {
      makerFee: number;
      takerFee: number;
    };
    tradingHours?: {
      start: string;  // HH:mm
      end: string;
    };
  };
}
```

### 3.2 提交逻辑
```typescript
const handleSubmit = async () => {
  try {
    const values = await form.validateFields();
    
    // 构造请求数据
    const payload = {
      taskName: values.taskName,
      taskDescription: values.taskDescription,
      strategyId: strategy.strategyId,
      scriptVersionId: values.scriptVersionId,
      datasetId: values.datasetId,
      
      dataConfig: {
        timeRange: {
          start: values.timeRange[0].toISOString(),
          end: values.timeRange[1].toISOString(),
        },
        timeframe: values.timeframe,
      },
      
      strategyParams: values.strategyParams || {},
      
      executionConfig: {
        initialCapital: values.initialCapital,
        leverage: 1,              // MVP阶段固定传1
        slippage: 0,              // MVP阶段固定传0
        fees: values.fees,
        tradingHours: enableTradingHours ? values.tradingHours : undefined,
      },
    };
    
    // 调用API
    const result = await createBacktestTask(payload);
    
    // 成功提示
    message.success('回测任务创建成功');
    
    // 跳转到任务详情页
    navigate(`/backtesting/tasks/${result.taskId}`);
    
  } catch (error) {
    message.error('创建失败：' + error.message);
  }
};
```

---

## 4. 用户体验优化

### 4.1 表单验证
- 实时验证（onChange）
- 提交前整体验证
- 清晰的错误提示

### 4.2 数据联动
- 选择数据集后自动显示数据集信息
- 时间范围限制在数据集范围内
- 时间周期选项根据数据集granularity动态调整

### 4.3 默认值
- 任务名称：自动生成有意义的名称
- 脚本版本：默认master
- 时间范围：默认使用数据集全部时间
- 时间周期：默认使用数据集的granularity
- 交易配置：提供合理的默认值

### 4.4 帮助提示
- 关键字段提供tooltip说明
- 数据集选择后显示详细信息
- 参数字段显示描述和默认值

---

## 5. 需要确认的问题

### 已确认决策

#### ✅ 脚本版本
- 默认选中 master 版本
- 允许用户切换到其他版本

#### ✅ 时间范围
- 默认使用数据集全部时间（`timeStart` ~ `timeEnd`）
- 用户可修改，但限制在数据集时间范围内

#### ✅ 时间周期
- 最小颗粒度为数据集的 `granularity`
- 可选择更大的时间周期（如数据是1m，可选5m/1h等）

#### ✅ MVP功能范围
- **杠杆倍数**：本期不实现UI，后端固定传 `leverage: 1`
- **滑点设置**：本期不实现UI，后端固定传 `slippage: 0`

#### ✅ 交易时段
- 放在"高级配置"折叠面板中
- 可选功能，默认24小时交易

#### ✅ 数据集筛选
- 通过搜索框按数据集名称（description）过滤
- 显示所有未删除的数据集（`deletedAt` 为 null）

#### ⏳ 待确认
- 任务提交后的行为（跳转到任务详情页 vs 任务列表页）

---

## 6. 界面原型

```
┌─────────────────────────────────────────────────────────┐
│  创建回测任务                                      ✕    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [策略信息]                                              │
│  策略名称: 双均线策略                                    │
│  脚本版本: [v1.2.0 (Master) ▼]                          │
│                                                         │
│  任务名称: [双均线策略-回测-2024-11-12              ]   │
│  任务描述: [                                        ]   │
│           [                                        ]   │
│                                                         │
│  ──────────────────────────────────────────────────    │
│                                                         │
│  数据集:   [BTCUSDT-2024 (BTCUSDT) ▼               ]   │
│                                                         │
│  ℹ️ 数据集信息                                           │
│  交易对: BTCUSDT  |  时间周期: 1m                        │
│  数据范围: 2024-01-01 至 2024-12-31                     │
│  数据量: 525,600 条                                     │
│                                                         │
│  回测时间范围:                                          │
│  ⦿ 使用数据集全部时间                                   │
│  ○ 自定义时间范围                                       │
│                                                         │
│  交易时间周期: [1m ▼]                                   │
│                                                         │
│  ──────────────────────────────────────────────────    │
│                                                         │
│  初始资金: [$ 10,000                               ]   │
│  杠杆倍数: [1                                      ]   │
│                                                         │
│  滑点设置: [固定 ▼] [0.10%                         ]   │
│                                                         │
│  手续费设置:                                            │
│    Maker费率: [0.020%]    Taker费率: [0.050%]          │
│                                                         │
│  □ 限制交易时段                                         │
│                                                         │
│  ──────────────────────────────────────────────────    │
│  策略参数                                               │
│                                                         │
│  快速周期: [10                                     ]   │
│  慢速周期: [30                                     ]   │
│  仓位大小: [0.5                                    ]   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                          [取消]  [开始回测]              │
└─────────────────────────────────────────────────────────┘
```

---

## 7. 总结

### 核心特性
1. ✅ 从策略列表快速发起
2. ✅ 弹窗表单，一站式配置
3. ✅ 默认master版本，可切换
4. ✅ 数据集联动，智能默认值
5. ✅ 时间范围灵活配置
6. ✅ 交易参数完整配置
7. ✅ 动态策略参数渲染

### 待确认项
- [ ] 是否允许切换脚本版本
- [ ] 交易时段是否必填
- [ ] 是否需要高级配置折叠区

---

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**状态**: 🟡 待确认  
**维护者**: Development Team

