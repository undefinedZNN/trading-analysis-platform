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

