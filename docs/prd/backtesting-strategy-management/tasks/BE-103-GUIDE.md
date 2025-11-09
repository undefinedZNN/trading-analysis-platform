# BE-103: Schema解析与校验 - 开发指南

> **任务ID**: BE-103  
> **负责人**: 你自己  
> **开始时间**: 2024-11-09 20:30  
> **预估工时**: 0.5天  
> **状态**: 🔄 进行中

---

## 📋 任务目标

实现参数Schema和因子Schema的解析与校验逻辑，用于验证策略脚本中定义的参数和因子是否符合规范。

---

## 🎯 验收标准

- [ ] 能够解析策略导出的Schema
- [ ] 校验必填字段（key, label, type）
- [ ] 检查字段唯一性
- [ ] 验证type与component的匹配
- [ ] 单元测试覆盖率 ≥ 80%

---

## 📁 文件结构

```
backend/src/backtesting/strategy/validators/
├── schema-validator.service.ts      # 主要实现文件
├── schema-validator.spec.ts         # 单元测试
├── schema.types.ts                  # TypeScript类型定义
└── README.md                        # 使用文档
```

---

## 💻 实现步骤

### Step 1: 定义Schema类型（10分钟）

创建 `schema.types.ts`:

```typescript
// backend/src/backtesting/strategy/validators/schema.types.ts

export type FieldType = 'number' | 'string' | 'boolean' | 'array' | 'object';
export type ComponentType = 'input' | 'number' | 'select' | 'checkbox' | 'radio' | 'date' | 'range';

export interface FieldSchema {
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

export interface ValidatorRule {
  min?: number;
  max?: number;
  pattern?: RegExp;
  message?: string;
  custom?: (value: any) => boolean | string;
}

export interface SchemaValidationError {
  field: string;
  message: string;
  code: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}
```

---

### Step 2: 实现Schema校验器（30分钟）

创建 `schema-validator.service.ts`:

```typescript
// backend/src/backtesting/strategy/validators/schema-validator.service.ts

import { Injectable } from '@nestjs/common';
import {
  FieldSchema,
  SchemaValidationResult,
  SchemaValidationError,
  FieldType,
  ComponentType,
} from './schema.types';

@Injectable()
export class SchemaValidatorService {
  /**
   * 校验参数或因子Schema
   */
  validate(schema: Record<string, FieldSchema>): SchemaValidationResult {
    const errors: SchemaValidationError[] = [];

    // 1. 检查Schema是否为空
    if (!schema || Object.keys(schema).length === 0) {
      errors.push({
        field: 'schema',
        message: 'Schema不能为空',
        code: 'SCHEMA_EMPTY',
      });
      return { valid: false, errors };
    }

    // 2. 检查每个字段
    const keys = new Set<string>();
    for (const [key, field] of Object.entries(schema)) {
      // 2.1 检查key是否重复
      if (keys.has(key)) {
        errors.push({
          field: key,
          message: `字段key重复: ${key}`,
          code: 'DUPLICATE_KEY',
        });
      }
      keys.add(key);

      // 2.2 检查必填字段
      const requiredFields = this.validateRequiredFields(key, field);
      errors.push(...requiredFields);

      // 2.3 检查type与component的匹配
      const typeMatch = this.validateTypeComponentMatch(key, field);
      if (typeMatch) {
        errors.push(typeMatch);
      }

      // 2.4 检查enumOptions
      if (field.component === 'select' || field.component === 'radio') {
        const enumError = this.validateEnumOptions(key, field);
        if (enumError) {
          errors.push(enumError);
        }
      }

      // 2.5 检查validator规则
      if (field.validator) {
        const validatorError = this.validateValidatorRule(key, field);
        if (validatorError) {
          errors.push(validatorError);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 校验必填字段
   */
  private validateRequiredFields(
    key: string,
    field: FieldSchema,
  ): SchemaValidationError[] {
    const errors: SchemaValidationError[] = [];
    const requiredFields = ['key', 'label', 'type', 'component'];

    for (const reqField of requiredFields) {
      if (!field[reqField]) {
        errors.push({
          field: key,
          message: `缺少必填字段: ${reqField}`,
          code: 'MISSING_REQUIRED_FIELD',
        });
      }
    }

    // 检查key是否与字段名一致
    if (field.key && field.key !== key) {
      errors.push({
        field: key,
        message: `字段key不匹配: ${field.key} !== ${key}`,
        code: 'KEY_MISMATCH',
      });
    }

    return errors;
  }

  /**
   * 校验type与component的匹配
   */
  private validateTypeComponentMatch(
    key: string,
    field: FieldSchema,
  ): SchemaValidationError | null {
    const typeComponentMap: Record<FieldType, ComponentType[]> = {
      number: ['number', 'range'],
      string: ['input', 'select', 'radio', 'date'],
      boolean: ['checkbox'],
      array: ['select'], // 多选
      object: ['input'], // JSON输入
    };

    const allowedComponents = typeComponentMap[field.type];
    if (allowedComponents && !allowedComponents.includes(field.component)) {
      return {
        field: key,
        message: `type "${field.type}" 与 component "${field.component}" 不匹配`,
        code: 'TYPE_COMPONENT_MISMATCH',
      };
    }

    return null;
  }

  /**
   * 校验enumOptions
   */
  private validateEnumOptions(
    key: string,
    field: FieldSchema,
  ): SchemaValidationError | null {
    if (!field.enumOptions || field.enumOptions.length === 0) {
      return {
        field: key,
        message: `component "${field.component}" 需要提供 enumOptions`,
        code: 'MISSING_ENUM_OPTIONS',
      };
    }

    // 检查enumOptions格式
    for (const option of field.enumOptions) {
      if (!option.label || option.value === undefined) {
        return {
          field: key,
          message: 'enumOptions格式错误，需要包含label和value',
          code: 'INVALID_ENUM_OPTIONS',
        };
      }
    }

    return null;
  }

  /**
   * 校验validator规则
   */
  private validateValidatorRule(
    key: string,
    field: FieldSchema,
  ): SchemaValidationError | null {
    const { validator } = field;

    // 检查min/max的合理性
    if (validator.min !== undefined && validator.max !== undefined) {
      if (validator.min > validator.max) {
        return {
          field: key,
          message: `validator.min (${validator.min}) 不能大于 validator.max (${validator.max})`,
          code: 'INVALID_VALIDATOR_RANGE',
        };
      }
    }

    return null;
  }

  /**
   * 解析策略脚本导出的Schema
   */
  async parseSchemaFromScript(scriptCode: string): Promise<{
    parameters: Record<string, FieldSchema>;
    factors: Record<string, FieldSchema>;
  }> {
    // TODO: 在沙箱环境中执行脚本，提取parameters和factors
    // 这部分需要与StrategySandbox集成
    
    // 临时实现：假设脚本导出了parameters和factors
    try {
      // 使用vm模块在隔离环境中执行
      const vm = require('vm');
      const sandbox = {
        defineParameters: (params: Record<string, FieldSchema>) => params,
        defineFactors: (factors: Record<string, FieldSchema>) => factors,
        exports: {},
      };
      
      vm.createContext(sandbox);
      vm.runInContext(scriptCode, sandbox, { timeout: 3000 });
      
      return {
        parameters: sandbox.exports.parameters || {},
        factors: sandbox.exports.factors || {},
      };
    } catch (error) {
      throw new Error(`解析Schema失败: ${error.message}`);
    }
  }
}
```

---

### Step 3: 编写单元测试（20分钟）

创建 `schema-validator.spec.ts`:

```typescript
// backend/src/backtesting/strategy/validators/schema-validator.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { SchemaValidatorService } from './schema-validator.service';
import { FieldSchema } from './schema.types';

describe('SchemaValidatorService', () => {
  let service: SchemaValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaValidatorService],
    }).compile();

    service = module.get<SchemaValidatorService>(SchemaValidatorService);
  });

  describe('validate', () => {
    it('应该通过有效的Schema', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          type: 'number',
          component: 'number',
          defaultValue: 20,
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该拒绝空Schema', () => {
      const result = service.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('SCHEMA_EMPTY');
    });

    it('应该检测重复的key', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          type: 'number',
          component: 'number',
        },
        period2: {
          key: 'period', // 重复的key
          label: '周期2',
          type: 'number',
          component: 'number',
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'KEY_MISMATCH')).toBe(true);
    });

    it('应该检测缺少必填字段', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          // 缺少type和component
        } as any,
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });

    it('应该检测type与component不匹配', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          type: 'number',
          component: 'checkbox', // number不应该用checkbox
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('TYPE_COMPONENT_MISMATCH');
    });

    it('应该检测select缺少enumOptions', () => {
      const schema: Record<string, FieldSchema> = {
        direction: {
          key: 'direction',
          label: '方向',
          type: 'string',
          component: 'select',
          // 缺少enumOptions
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MISSING_ENUM_OPTIONS');
    });

    it('应该检测validator范围错误', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          type: 'number',
          component: 'number',
          validator: {
            min: 100,
            max: 10, // min > max
          },
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_VALIDATOR_RANGE');
    });
  });
});
```

---

### Step 4: 编写README文档（10分钟）

创建 `README.md`:

```markdown
# Schema Validator Service

## 功能

验证策略脚本中定义的参数Schema和因子Schema是否符合规范。

## 使用方法

\`\`\`typescript
import { SchemaValidatorService } from './schema-validator.service';

const validator = new SchemaValidatorService();

// 校验Schema
const result = validator.validate(schema);
if (!result.valid) {
  console.error('Schema校验失败:', result.errors);
}

// 从脚本解析Schema
const { parameters, factors } = await validator.parseSchemaFromScript(scriptCode);
\`\`\`

## Schema规范

### 必填字段
- `key`: 字段唯一标识
- `label`: 字段标签
- `type`: 数据类型
- `component`: 渲染组件

### type与component的匹配规则
- `number`: 可用 `number`, `range`
- `string`: 可用 `input`, `select`, `radio`, `date`
- `boolean`: 可用 `checkbox`
- `array`: 可用 `select`（多选）
- `object`: 可用 `input`（JSON输入）

### 特殊要求
- `select`和`radio`必须提供`enumOptions`
- `validator.min`不能大于`validator.max`
- 字段`key`必须唯一

## 错误码

- `SCHEMA_EMPTY`: Schema为空
- `DUPLICATE_KEY`: 字段key重复
- `MISSING_REQUIRED_FIELD`: 缺少必填字段
- `KEY_MISMATCH`: 字段key不匹配
- `TYPE_COMPONENT_MISMATCH`: type与component不匹配
- `MISSING_ENUM_OPTIONS`: 缺少enumOptions
- `INVALID_ENUM_OPTIONS`: enumOptions格式错误
- `INVALID_VALIDATOR_RANGE`: validator范围错误
```

---

## ✅ 完成检查清单

### 代码实现
- [ ] 创建 `schema.types.ts` 并定义类型
- [ ] 创建 `schema-validator.service.ts` 并实现校验逻辑
- [ ] 实现 `validate()` 方法
- [ ] 实现 `parseSchemaFromScript()` 方法（可先简化）

### 测试
- [ ] 创建 `schema-validator.spec.ts`
- [ ] 编写至少7个单元测试
- [ ] 运行测试确保全部通过
- [ ] 测试覆盖率 ≥ 80%

### 文档
- [ ] 创建 README.md
- [ ] 添加代码注释

### 集成
- [ ] 在 `validators` 模块中注册服务
- [ ] 确保可以被其他模块导入使用

---

## 🚀 快速开始

### 1. 创建文件
```bash
cd backend/src/backtesting/strategy
mkdir -p validators
cd validators
touch schema.types.ts schema-validator.service.ts schema-validator.spec.ts README.md
```

### 2. 复制代码
将上面的代码复制到对应文件中

### 3. 运行测试
```bash
cd backend
npm test -- schema-validator.spec.ts
```

### 4. 检查覆盖率
```bash
npm test -- --coverage schema-validator.spec.ts
```

---

## 📊 预计时间分配

- Step 1: 定义类型 (10分钟)
- Step 2: 实现校验器 (30分钟)
- Step 3: 编写测试 (20分钟)
- Step 4: 编写文档 (10分钟)
- 总计: **70分钟** (约0.5天)

---

## 💡 提示

### 简化版本
如果时间紧张，可以先实现核心功能：
1. 必填字段校验
2. 字段唯一性校验
3. type与component匹配校验

其他功能可以后续迭代。

### 测试驱动开发（TDD）
建议先写测试，再写实现：
1. 写一个测试
2. 运行测试（应该失败）
3. 写最少的代码让测试通过
4. 重复

---

## 🎯 完成后

完成这个任务后，在 `TASK-TRACKER.md` 中：
1. 将任务从 "In Progress" 移到 "Done"
2. 勾选所有验收标准
3. 记录实际工时
4. 更新进度统计

然后告诉我："BE-103完成"，我会指导你进行下一个任务！

---

**祝你开发顺利！** 🚀

