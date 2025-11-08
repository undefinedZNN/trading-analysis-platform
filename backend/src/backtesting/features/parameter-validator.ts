/**
 * ParameterValidator - 参数校验器
 * 
 * 负责校验特征参数的类型、范围、必需性等
 */

import {
  FeatureDefinition,
  ParameterSchema,
  ValidationResult,
} from './interfaces';

/**
 * 参数校验器实现
 */
export class ParameterValidator {
  /**
   * 校验参数
   * 
   * @param definition 特征定义
   * @param params 要校验的参数
   * @returns 校验结果
   */
  validate(
    definition: FeatureDefinition,
    params: Record<string, unknown>
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const schema = definition.paramSchema || {};

    // 检查必需参数
    for (const [key, paramDef] of Object.entries(schema)) {
      if (paramDef.required && !(key in params)) {
        errors.push(`Missing required parameter: ${key}`);
      }
    }

    // 检查参数类型和范围
    for (const [key, value] of Object.entries(params)) {
      const paramDef = schema[key];
      
      if (!paramDef) {
        warnings.push(`Unknown parameter: ${key} (will be ignored)`);
        continue;
      }

      // 类型检查
      if (!this.checkType(value, paramDef.type)) {
        errors.push(
          `Invalid type for parameter '${key}': expected ${paramDef.type}, got ${typeof value}`
        );
        continue; // 类型错误时跳过其他检查
      }

      // 范围检查（数值类型）
      if (paramDef.type === 'number' || paramDef.type === 'integer') {
        const numValue = value as number;
        
        if (paramDef.min !== undefined && numValue < paramDef.min) {
          errors.push(
            `Parameter '${key}' must be >= ${paramDef.min}, got ${numValue}`
          );
        }
        
        if (paramDef.max !== undefined && numValue > paramDef.max) {
          errors.push(
            `Parameter '${key}' must be <= ${paramDef.max}, got ${numValue}`
          );
        }
        
        // 整数检查
        if (paramDef.type === 'integer' && !Number.isInteger(numValue)) {
          errors.push(`Parameter '${key}' must be an integer, got ${numValue}`);
        }
      }

      // 枚举检查
      if (paramDef.enum && !paramDef.enum.includes(value as any)) {
        errors.push(
          `Parameter '${key}' must be one of: ${paramDef.enum.join(', ')}, got ${value}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 合并默认参数和用户参数
   * 
   * @param definition 特征定义
   * @param params 用户参数
   * @returns 合并后的参数
   */
  mergeWithDefaults(
    definition: FeatureDefinition,
    params?: Record<string, unknown>
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    const schema = definition.paramSchema || {};

    // 先应用默认参数
    if (definition.defaultParams) {
      Object.assign(merged, definition.defaultParams);
    }

    // 应用schema中的默认值
    for (const [key, paramDef] of Object.entries(schema)) {
      if (paramDef.default !== undefined && !(key in merged)) {
        merged[key] = paramDef.default;
      }
    }

    // 应用用户参数（会覆盖默认值）
    if (params) {
      Object.assign(merged, params);
    }

    return merged;
  }

  /**
   * 检查值的类型
   * 
   * @param value 值
   * @param expectedType 期望的类型
   * @returns 是否匹配
   */
  private checkType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      
      case 'string':
        return typeof value === 'string';
      
      case 'boolean':
        return typeof value === 'boolean';
      
      case 'enum':
        // 枚举类型可以是字符串或数字
        return typeof value === 'string' || typeof value === 'number';
      
      default:
        return false;
    }
  }

  /**
   * 获取参数的简短描述
   * 
   * @param paramDef 参数定义
   * @returns 描述字符串
   */
  getParameterDescription(paramDef: ParameterSchema): string {
    const parts: string[] = [];

    parts.push(`type: ${paramDef.type}`);

    if (paramDef.required) {
      parts.push('required');
    }

    if (paramDef.default !== undefined) {
      parts.push(`default: ${paramDef.default}`);
    }

    if (paramDef.min !== undefined) {
      parts.push(`min: ${paramDef.min}`);
    }

    if (paramDef.max !== undefined) {
      parts.push(`max: ${paramDef.max}`);
    }

    if (paramDef.enum) {
      parts.push(`enum: [${paramDef.enum.join(', ')}]`);
    }

    if (paramDef.description) {
      parts.push(paramDef.description);
    }

    return parts.join(', ');
  }
}

/**
 * 创建参数校验器实例
 */
export function createParameterValidator(): ParameterValidator {
  return new ParameterValidator();
}

