import React from 'react';
import { Form, Input, InputNumber, Switch, Select, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

/**
 * 参数Schema定义（与后端保持一致）
 */
export interface ParamSchema {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  component: 'text' | 'number' | 'switch' | 'select';
  defaultValue?: any;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: any }>;
  description?: string;
  placeholder?: string;
}

interface DynamicParamsFormProps {
  /**
   * 参数Schema数组
   */
  parameterSchema: ParamSchema[];
  /**
   * 表单前缀（用于Form.Item的name）
   */
  namePrefix?: string[];
  /**
   * 是否禁用
   */
  disabled?: boolean;
}

/**
 * 动态参数表单组件
 * 
 * 根据策略的参数Schema动态渲染表单字段
 */
export const DynamicParamsForm: React.FC<DynamicParamsFormProps> = ({
  parameterSchema,
  namePrefix = ['strategyParams'],
  disabled = false,
}) => {
  /**
   * 渲染表单项
   */
  const renderFormItem = (param: ParamSchema) => {
    const label = (
      <span>
        {param.label}
        {param.description && (
          <Tooltip title={param.description}>
            <QuestionCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
          </Tooltip>
        )}
      </span>
    );

    const rules = [
      {
        required: param.required ?? true,
        message: `请输入${param.label}`,
      },
    ];

    // 根据类型渲染不同的输入组件
    let inputComponent: React.ReactNode;

    switch (param.component) {
      case 'number':
        inputComponent = (
          <InputNumber
            style={{ width: '100%' }}
            min={param.min}
            max={param.max}
            step={param.step ?? 1}
            placeholder={param.placeholder || `请输入${param.label}`}
            disabled={disabled}
          />
        );
        break;

      case 'switch':
        inputComponent = (
          <Switch
            checkedChildren="是"
            unCheckedChildren="否"
            disabled={disabled}
          />
        );
        break;

      case 'select':
        inputComponent = (
          <Select
            placeholder={param.placeholder || `请选择${param.label}`}
            options={param.options || []}
            disabled={disabled}
          />
        );
        break;

      case 'text':
      default:
        inputComponent = (
          <Input
            placeholder={param.placeholder || `请输入${param.label}`}
            disabled={disabled}
          />
        );
        break;
    }

    return (
      <Form.Item
        key={param.key}
        name={[...namePrefix, param.key]}
        label={label}
        rules={rules}
        initialValue={param.defaultValue}
        valuePropName={param.component === 'switch' ? 'checked' : 'value'}
      >
        {inputComponent}
      </Form.Item>
    );
  };

  if (!parameterSchema || parameterSchema.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: '#999' }}>
        该策略暂无自定义参数
      </div>
    );
  }

  return (
    <div>
      {parameterSchema.map((param) => renderFormItem(param))}
    </div>
  );
};

export default DynamicParamsForm;

