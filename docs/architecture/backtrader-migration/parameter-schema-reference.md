# ParameterSchema 字段参考

**版本**: v1.0  
**更新时间**: 2025-11-20

---

## 📋 完整字段说明

### StrategyParameter 接口

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `name` | `string` | ✅ | 参数名称（必须与 Python 代码中一致） | `"fast_period"` |
| `type` | `'int' \| 'float' \| 'bool' \| 'str'` | ✅ | 参数数据类型 | `"int"` |
| `defaultValue` | `number \| string \| boolean` | ✅ | 默认值 | `10` |
| `description` | `string` | ❌ | 参数描述（前端显示） | `"快速均线周期"` |
| `required` | `boolean` | ❌ | 是否必填（默认 false） | `true` |
| `componentType` | `ParameterComponentType` | ❌ | 表单组件类型 | `"input_number"` |
| `constraints` | `ParameterConstraints` | ❌ | 约束条件 | `{min: 1, max: 100}` |
| `componentProps` | `Record<string, any>` | ❌ | 组件额外属性 | `{placeholder: "请输入"}` |
| `order` | `number` | ❌ | 显示顺序 | `0` |

---

## 🎨 componentType - 表单组件类型

### 支持的组件类型

| 组件类型 | 枚举值 | 适用数据类型 | 前端组件 | 说明 |
|---------|--------|------------|---------|------|
| 数字输入框 | `input_number` | `int`, `float` | `InputNumber` | 默认的数字输入 |
| 滑块 | `slider` | `int`, `float` | `Slider` | 可视化拖动选择 |
| 开关 | `switch` | `bool` | `Switch` | 布尔值开关 |
| 下拉选择 | `select` | `str` | `Select` | 从列表中选择 |
| 单选按钮 | `radio` | `str` | `Radio.Group` | 单选按钮组 |
| 文本输入 | `input` | `str` | `Input` | 单行文本输入 |
| 多行文本 | `textarea` | `str` | `Input.TextArea` | 多行文本输入 |
| 日期选择 | `date_picker` | `str` | `DatePicker` | 日期选择器 |
| 时间选择 | `time_picker` | `str` | `TimePicker` | 时间选择器 |

### 默认组件映射规则

如果不指定 `componentType`，系统会根据 `type` 和 `constraints` 自动推断：

| 条件 | 默认组件 |
|------|---------|
| `type: 'bool'` | `switch` |
| `type: 'int' or 'float'` | `input_number` |
| `type: 'str'` + `constraints.options` 存在 | `select` |
| `type: 'str'` | `input` |

---

## ⚙️ constraints - 约束条件

### 约束字段说明

| 字段 | 类型 | 适用类型 | 说明 | 示例 |
|------|------|---------|------|------|
| `min` | `number` | `int`, `float` | 最小值 | `1` |
| `max` | `number` | `int`, `float` | 最大值 | `100` |
| `step` | `number` | `int`, `float` | 步长 | `1` 或 `0.01` |
| `options` | `string[]` | `str` | 可选值列表 | `["long", "short"]` |
| `maxLength` | `number` | `str` | 最大长度 | `50` |
| `pattern` | `string` | `str` | 正则表达式 | `"^[a-zA-Z0-9_]+$"` |
| `patternMessage` | `string` | `str` | 正则校验失败提示 | `"只能包含字母数字下划线"` |

---

## 📝 完整示例

### 示例 1: 数字输入框（必填）

```json
{
  "name": "fast_period",
  "type": "int",
  "defaultValue": 10,
  "description": "快速均线周期",
  "required": true,
  "componentType": "input_number",
  "constraints": {
    "min": 1,
    "max": 100,
    "step": 1
  },
  "order": 0
}
```

**前端效果**：
```
快速均线周期 * (必填)
[  10  ] ▲▼
范围: 1 - 100，步长: 1
```

---

### 示例 2: 滑块（选填）

```json
{
  "name": "slow_period",
  "type": "int",
  "defaultValue": 20,
  "description": "慢速均线周期",
  "required": false,
  "componentType": "slider",
  "constraints": {
    "min": 10,
    "max": 200,
    "step": 5
  },
  "componentProps": {
    "marks": {
      "10": "10",
      "100": "100",
      "200": "200"
    }
  },
  "order": 1
}
```

**前端效果**：
```
慢速均线周期
10 ●━━━━━━━━━━━━━━━━━━━━━━━ 100 ━━━━━━━━━━ 200
          ↑ 当前值: 20
```

---

### 示例 3: 开关

```json
{
  "name": "enable_trailing",
  "type": "bool",
  "defaultValue": true,
  "description": "是否启用移动止损",
  "required": false,
  "componentType": "switch",
  "order": 2
}
```

**前端效果**：
```
是否启用移动止损
[●━━] 已开启
```

---

### 示例 4: 单选按钮组（必填）

```json
{
  "name": "side",
  "type": "str",
  "defaultValue": "long",
  "description": "交易方向",
  "required": true,
  "componentType": "radio",
  "constraints": {
    "options": ["long", "short", "both"]
  },
  "order": 3
}
```

**前端效果**：
```
交易方向 * (必填)
◉ 做多 (long)    ○ 做空 (short)    ○ 双向 (both)
```

---

### 示例 5: 下拉选择

```json
{
  "name": "timeframe",
  "type": "str",
  "defaultValue": "1d",
  "description": "时间周期",
  "required": true,
  "componentType": "select",
  "constraints": {
    "options": ["1m", "5m", "15m", "1h", "4h", "1d"]
  },
  "componentProps": {
    "placeholder": "请选择时间周期"
  },
  "order": 4
}
```

**前端效果**：
```
时间周期 * (必填)
[ 1d ▼ ]
```

---

### 示例 6: 文本输入（带正则校验）

```json
{
  "name": "strategy_name",
  "type": "str",
  "defaultValue": "",
  "description": "策略名称",
  "required": true,
  "componentType": "input",
  "constraints": {
    "maxLength": 50,
    "pattern": "^[a-zA-Z0-9_]+$",
    "patternMessage": "只能包含字母、数字和下划线"
  },
  "componentProps": {
    "placeholder": "请输入策略名称"
  },
  "order": 5
}
```

**前端效果**：
```
策略名称 * (必填)
[ my_strategy_01           ]
只能包含字母、数字和下划线，最多50个字符
```

---

### 示例 7: 多行文本

```json
{
  "name": "remarks",
  "type": "str",
  "defaultValue": "",
  "description": "备注说明",
  "required": false,
  "componentType": "textarea",
  "constraints": {
    "maxLength": 500
  },
  "componentProps": {
    "rows": 4,
    "placeholder": "请输入备注说明"
  },
  "order": 6
}
```

**前端效果**：
```
备注说明
┌────────────────────────────┐
│                            │
│                            │
│                            │
│                            │
└────────────────────────────┘
0 / 500 字符
```

---

## ✅ required - 必填标识

### 必填验证

当 `required: true` 时：

1. **前端验证**：
   - 字段标签显示红色星号 `*`
   - 提交前检查是否为空
   - 为空时显示错误提示

2. **Backend 验证**：
   ```typescript
   if (param.required && (value === null || value === undefined || value === '')) {
     throw new BadRequestException(`Parameter '${param.name}' is required`);
   }
   ```

3. **Worker 校验**：
   - Worker 端会再次校验必填参数
   - 确保数据完整性

### 必填 vs 默认值

```json
// 必填参数（用户必须输入）
{
  "name": "symbol",
  "type": "str",
  "defaultValue": "",
  "required": true
}

// 选填参数（可以使用默认值）
{
  "name": "stop_loss",
  "type": "float",
  "defaultValue": 0.05,
  "required": false
}
```

---

## 🎨 componentProps - 组件额外属性

### 常用属性示例

#### InputNumber
```json
{
  "componentProps": {
    "placeholder": "请输入数值",
    "formatter": "value => `${value}%`",
    "parser": "value => value.replace('%', '')"
  }
}
```

#### Slider
```json
{
  "componentProps": {
    "marks": {
      "0": "0",
      "50": "50",
      "100": "100"
    },
    "tooltipVisible": true
  }
}
```

#### Select
```json
{
  "componentProps": {
    "placeholder": "请选择",
    "showSearch": true,
    "allowClear": true
  }
}
```

#### Input / TextArea
```json
{
  "componentProps": {
    "placeholder": "请输入文本",
    "showCount": true,
    "allowClear": true
  }
}
```

---

## 💾 完整配置示例

```json
[
  {
    "name": "fast_period",
    "type": "int",
    "defaultValue": 10,
    "description": "快速均线周期",
    "required": true,
    "componentType": "input_number",
    "constraints": {"min": 1, "max": 100, "step": 1},
    "order": 0
  },
  {
    "name": "slow_period",
    "type": "int",
    "defaultValue": 20,
    "description": "慢速均线周期",
    "required": true,
    "componentType": "slider",
    "constraints": {"min": 10, "max": 200, "step": 5},
    "componentProps": {"marks": {"10": "10", "100": "100", "200": "200"}},
    "order": 1
  },
  {
    "name": "stop_loss",
    "type": "float",
    "defaultValue": 0.05,
    "description": "止损比例",
    "required": false,
    "componentType": "input_number",
    "constraints": {"min": 0, "max": 1, "step": 0.01},
    "order": 2
  },
  {
    "name": "enable_trailing",
    "type": "bool",
    "defaultValue": true,
    "description": "是否启用移动止损",
    "required": false,
    "componentType": "switch",
    "order": 3
  },
  {
    "name": "side",
    "type": "str",
    "defaultValue": "long",
    "description": "交易方向",
    "required": true,
    "componentType": "radio",
    "constraints": {"options": ["long", "short", "both"]},
    "order": 4
  }
]
```

---

## 📚 类型定义文件

完整的 TypeScript 类型定义：

**文件位置**: `backend/src/backtesting/types/parameter-schema.types.ts`

已包含：
- ✅ `ParameterComponentType` 枚举
- ✅ `ParameterValueType` 类型
- ✅ `ParameterConstraints` 接口
- ✅ `StrategyParameter` 接口
- ✅ `ParameterSchema` 类型
- ✅ `ParameterValues` 类型

---

## 🔗 相关文档

- [策略参数实现方案](./strategy-parameters-implementation.md)
- [快速指南](./strategy-parameters-quick-guide.md)

