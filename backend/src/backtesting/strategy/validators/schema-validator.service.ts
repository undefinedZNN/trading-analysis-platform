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
      const sandbox: any = {
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

