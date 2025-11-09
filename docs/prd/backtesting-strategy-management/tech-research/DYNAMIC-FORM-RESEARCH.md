# 动态表单渲染器技术预研

> **预研负责人**: 前端负责人  
> **预研时间**: 2024-11-09 ~ 2024-11-11  
> **预研状态**: 📅 待开始  
> **优先级**: 🔥 P0

---

## 📋 预研目标

研究并确定动态表单渲染器的技术方案，用于：
1. 回测任务创建时的参数表单渲染
2. 结果分析时的因子筛选器渲染
3. 确保Schema定义一次即可在多场景复用

---

## 🎯 核心需求

### 1. 功能需求

**基础功能**:
- ✅ 根据JSON Schema动态生成表单
- ✅ 支持多种字段类型（number, string, select, checkbox等）
- ✅ 支持字段校验（必填、范围、正则等）
- ✅ 支持默认值填充
- ✅ 支持字段联动（可选）

**高级功能**:
- ✅ 支持嵌套字段
- ✅ 支持数组字段
- ✅ 支持条件显示
- ✅ 支持自定义组件
- ✅ 支持国际化（预留）

### 2. Schema格式

**参考PRD中的Schema定义**:
```typescript
interface FieldSchema {
  key: string;              // 字段唯一标识
  label: string;            // 字段标签
  desc?: string;            // 字段描述
  type: FieldType;          // 数据类型
  component: ComponentType; // 渲染组件
  defaultValue?: any;       // 默认值
  required?: boolean;       // 是否必填
  validator?: ValidatorRule; // 校验规则
  enumOptions?: Array<{     // 枚举选项
    label: string;
    value: any;
  }>;
  // UI扩展字段（兼容Formily）
  'x-component-props'?: any;
  'x-decorator'?: string;
  'x-reactions'?: any;
}

type FieldType = 'number' | 'string' | 'boolean' | 'array' | 'object';
type ComponentType = 'input' | 'number' | 'select' | 'checkbox' | 'radio' | 'date' | 'range';
```

### 3. 使用场景

**场景1: 回测任务参数表单**
```typescript
// 策略定义的参数Schema
const parameterSchema = {
  period: {
    key: 'period',
    label: '周期',
    desc: 'MA指标的周期参数',
    type: 'number',
    component: 'number',
    defaultValue: 20,
    required: true,
    validator: { min: 1, max: 100 }
  },
  direction: {
    key: 'direction',
    label: '方向',
    type: 'string',
    component: 'select',
    enumOptions: [
      { label: '做多', value: 'long' },
      { label: '做空', value: 'short' },
      { label: '双向', value: 'both' }
    ],
    defaultValue: 'both'
  }
};

// 渲染表单
<DynamicForm
  schema={parameterSchema}
  onSubmit={(values) => console.log(values)}
/>
```

**场景2: 因子筛选器**
```typescript
// 因子Schema
const factorSchema = {
  holdingBars: {
    key: 'holdingBars',
    label: '持仓K线数',
    type: 'number',
    component: 'range',
    validator: { min: 0 }
  },
  tradeTime: {
    key: 'tradeTime',
    label: '交易时段',
    type: 'string',
    component: 'timeRange'
  }
};

// 渲染筛选器
<DynamicFilter
  schema={factorSchema}
  onFilter={(conditions) => console.log(conditions)}
/>
```

---

## 🔬 技术方案对比

### 方案A: Formily

**官网**: https://formilyjs.org/

**优点**:
- ✅ 功能强大，生态完善
- ✅ 支持复杂表单场景
- ✅ 性能优秀（虚拟化）
- ✅ 文档完善
- ✅ 支持Ant Design组件

**缺点**:
- ❌ 学习曲线陡峭
- ❌ 包体积较大（~200KB）
- ❌ 配置复杂
- ❌ 可能过度设计

**适用场景**: 复杂表单，需要高级特性

**示例代码**:
```typescript
import { createForm } from '@formily/core';
import { FormProvider, Field } from '@formily/react';
import { FormItem, Input, NumberPicker } from '@formily/antd';

const form = createForm();

const schema = {
  type: 'object',
  properties: {
    period: {
      type: 'number',
      title: '周期',
      'x-decorator': 'FormItem',
      'x-component': 'NumberPicker',
      'x-component-props': {
        min: 1,
        max: 100
      },
      default: 20
    }
  }
};

<FormProvider form={form}>
  <SchemaField schema={schema} />
</FormProvider>
```

---

### 方案B: React Hook Form + 自定义渲染器

**官网**: https://react-hook-form.com/

**优点**:
- ✅ 轻量级（~9KB）
- ✅ 性能优秀（无重渲染）
- ✅ API简单易用
- ✅ 灵活可控

**缺点**:
- ❌ 需要自己实现Schema渲染逻辑
- ❌ 缺少开箱即用的高级特性
- ❌ 需要自己处理复杂场景

**适用场景**: 简单到中等复杂度表单，注重性能

**示例代码**:
```typescript
import { useForm } from 'react-hook-form';

interface DynamicFormProps {
  schema: Record<string, FieldSchema>;
  onSubmit: (values: any) => void;
}

function DynamicForm({ schema, onSubmit }: DynamicFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm();
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {Object.entries(schema).map(([key, field]) => (
        <div key={key}>
          <label>{field.label}</label>
          {renderField(field, register, errors)}
        </div>
      ))}
      <button type="submit">提交</button>
    </form>
  );
}

function renderField(field: FieldSchema, register: any, errors: any) {
  switch (field.component) {
    case 'number':
      return (
        <InputNumber
          {...register(field.key, {
            required: field.required,
            min: field.validator?.min,
            max: field.validator?.max
          })}
          defaultValue={field.defaultValue}
        />
      );
    case 'select':
      return (
        <Select {...register(field.key)}>
          {field.enumOptions?.map(opt => (
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
      );
    // ... 其他组件类型
  }
}
```

---

### 方案C: 完全自研

**优点**:
- ✅ 完全可控
- ✅ 精简轻量
- ✅ 符合项目需求

**缺点**:
- ❌ 开发成本高
- ❌ 需要处理各种边界情况
- ❌ 维护成本高

**适用场景**: 需求非常特殊，现有方案都不满足

---

## 📊 方案评分

| 维度 | Formily | React Hook Form + 自研 | 完全自研 |
|------|---------|------------------------|----------|
| 功能完整性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 易用性 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| 性能 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 包体积 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 学习成本 | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 开发效率 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| 可维护性 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **总分** | **27/35** | **30/35** | **22/35** |

---

## 🎯 推荐方案

### 初期（MVP）: 方案B - React Hook Form + 自定义渲染器

**理由**:
1. **轻量级**: 包体积小，不影响首屏加载
2. **灵活性**: 完全可控，易于定制
3. **性能优秀**: 无不必要的重渲染
4. **学习成本低**: API简单，团队容易上手
5. **满足需求**: 当前需求不复杂，该方案足够

**实现策略**:
1. 封装`DynamicForm`组件
2. 实现字段渲染器（FieldRenderer）
3. 实现校验器（Validator）
4. 提供组件映射表（ComponentMap）
5. 支持自定义组件扩展

### 中期（扩展）: 评估是否需要升级到Formily

**升级条件**:
- 需要复杂的字段联动
- 需要表单分步向导
- 需要表单数据持久化
- 需要表单版本管理

---

## 💻 技术实现

### 1. 核心组件结构

```typescript
// 动态表单组件
interface DynamicFormProps {
  schema: Record<string, FieldSchema>;
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void;
  onValuesChange?: (values: Record<string, any>) => void;
  layout?: 'horizontal' | 'vertical';
}

function DynamicForm(props: DynamicFormProps) {
  const { schema, initialValues, onSubmit, layout = 'vertical' } = props;
  const form = useForm({ defaultValues: getDefaultValues(schema, initialValues) });
  
  return (
    <Form form={form} onSubmit={handleSubmit(onSubmit)} layout={layout}>
      {Object.entries(schema).map(([key, field]) => (
        <FieldRenderer
          key={key}
          field={field}
          form={form}
        />
      ))}
      <Button type="primary" htmlType="submit">提交</Button>
    </Form>
  );
}
```

### 2. 字段渲染器

```typescript
interface FieldRendererProps {
  field: FieldSchema;
  form: UseFormReturn;
}

function FieldRenderer({ field, form }: FieldRendererProps) {
  const { register, formState: { errors } } = form;
  
  // 获取对应的组件
  const Component = ComponentMap[field.component];
  
  // 构建校验规则
  const rules = buildValidationRules(field);
  
  return (
    <Form.Item
      label={field.label}
      required={field.required}
      help={field.desc}
      validateStatus={errors[field.key] ? 'error' : ''}
      error={errors[field.key]?.message}
    >
      <Component
        {...register(field.key, rules)}
        {...field['x-component-props']}
      />
    </Form.Item>
  );
}
```

### 3. 组件映射表

```typescript
const ComponentMap: Record<ComponentType, React.ComponentType<any>> = {
  input: Input,
  number: InputNumber,
  select: Select,
  checkbox: Checkbox,
  radio: Radio.Group,
  date: DatePicker,
  range: Slider,
  textarea: Input.TextArea,
  switch: Switch,
  // 支持自定义组件
  custom: CustomComponent
};

// 注册自定义组件
function registerComponent(type: string, component: React.ComponentType) {
  ComponentMap[type] = component;
}
```

### 4. 校验规则构建

```typescript
function buildValidationRules(field: FieldSchema): RegisterOptions {
  const rules: RegisterOptions = {};
  
  // 必填校验
  if (field.required) {
    rules.required = `${field.label}不能为空`;
  }
  
  // 类型校验
  if (field.type === 'number') {
    rules.valueAsNumber = true;
  }
  
  // 自定义校验
  if (field.validator) {
    if (typeof field.validator === 'function') {
      rules.validate = field.validator;
    } else {
      // 范围校验
      if (field.validator.min !== undefined) {
        rules.min = {
          value: field.validator.min,
          message: `${field.label}不能小于${field.validator.min}`
        };
      }
      if (field.validator.max !== undefined) {
        rules.max = {
          value: field.validator.max,
          message: `${field.label}不能大于${field.validator.max}`
        };
      }
      // 正则校验
      if (field.validator.pattern) {
        rules.pattern = {
          value: field.validator.pattern,
          message: field.validator.message || `${field.label}格式不正确`
        };
      }
    }
  }
  
  return rules;
}
```

### 5. 默认值处理

```typescript
function getDefaultValues(
  schema: Record<string, FieldSchema>,
  initialValues?: Record<string, any>
): Record<string, any> {
  const defaults: Record<string, any> = {};
  
  Object.entries(schema).forEach(([key, field]) => {
    if (initialValues && key in initialValues) {
      defaults[key] = initialValues[key];
    } else if (field.defaultValue !== undefined) {
      defaults[key] = field.defaultValue;
    }
  });
  
  return defaults;
}
```

---

## 🧪 POC计划

### POC 1: 基础表单渲染
**目标**: 验证能否根据Schema渲染基础表单

**步骤**:
1. 创建简单的Schema（2-3个字段）
2. 实现DynamicForm组件
3. 实现FieldRenderer
4. 测试表单提交

**预期结果**:
- [ ] 能够正确渲染表单
- [ ] 能够获取表单值
- [ ] 基础校验生效

---

### POC 2: 复杂字段类型
**目标**: 验证各种字段类型的渲染

**步骤**:
1. 测试所有ComponentType
2. 测试嵌套字段
3. 测试数组字段
4. 测试条件显示

**预期结果**:
- [ ] 所有字段类型正常工作
- [ ] 复杂场景支持良好

---

### POC 3: 性能测试
**目标**: 验证大表单的性能

**步骤**:
1. 创建50+字段的表单
2. 测试渲染性能
3. 测试交互性能
4. 优化性能瓶颈

**预期结果**:
- [ ] 首次渲染 < 100ms
- [ ] 交互流畅无卡顿
- [ ] 内存占用合理

---

## 📅 预研时间表

| 日期 | 任务 | 产出 |
|------|------|------|
| 2024-11-09 | 方案调研 | 技术方案对比 |
| 2024-11-10 | POC 1 | 基础表单Demo |
| 2024-11-10 | POC 2 | 复杂字段Demo |
| 2024-11-11 | POC 3 | 性能测试报告 |
| 2024-11-11 | 方案设计 | 完整技术方案文档 |

---

## ✅ 交付物

- [ ] 技术预研报告（本文档）
- [ ] POC代码示例
- [ ] 组件API设计文档
- [ ] 性能测试报告
- [ ] 实施计划

---

## 🚀 实施计划

### Phase 1: 核心组件开发（2天）
- [ ] DynamicForm组件
- [ ] FieldRenderer组件
- [ ] 基础字段类型支持
- [ ] 校验规则实现

### Phase 2: 高级特性（1天）
- [ ] 嵌套字段支持
- [ ] 数组字段支持
- [ ] 自定义组件注册
- [ ] 字段联动（可选）

### Phase 3: 测试与文档（0.5天）
- [ ] 单元测试
- [ ] 组件文档
- [ ] 使用示例

---

## 📚 参考资料

- [React Hook Form文档](https://react-hook-form.com/)
- [Formily文档](https://formilyjs.org/)
- [JSON Schema规范](https://json-schema.org/)
- [Ant Design Form](https://ant.design/components/form-cn/)

---

## 📞 联系方式

- **预研负责人**: 前端负责人
- **技术支持**: 前端团队
- **Slack频道**: #trading-backtest-project

---

**文档维护**: 前端负责人  
**最后更新**: 2024-11-09  
**版本**: v1.0

