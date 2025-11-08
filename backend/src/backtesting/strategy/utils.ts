/**
 * 策略工具函数
 * 
 * 提供 defineParameters 和 defineFeatures 等辅助函数
 */

import type {
  ParametersDefinition,
  ParameterSchema,
  CustomFeatureDefinition,
} from './interfaces';

/**
 * 定义策略参数
 * 
 * @param definition 参数定义
 * @returns 参数定义对象
 * 
 * @example
 * ```typescript
 * export const parameters = defineParameters({
 *   period: {
 *     type: 'number',
 *     title: 'MA Period',
 *     default: 20,
 *     minimum: 1,
 *     maximum: 200
 *   }
 * });
 * ```
 */
export function defineParameters(definition: ParametersDefinition): ParametersDefinition {
  // 验证参数定义
  for (const [key, schema] of Object.entries(definition)) {
    validateParameterSchema(key, schema);
  }
  
  return definition;
}

/**
 * 定义自定义特征
 * 
 * @param features 特征定义数组
 * @returns 特征定义数组
 * 
 * @example
 * ```typescript
 * export const customFeatures = defineFeatures([
 *   {
 *     id: 'custom-signal',
 *     label: 'Custom Signal',
 *     valueType: 'enum',
 *     domain: ['buy', 'sell', 'neutral'],
 *     compute(stream) {
 *       return stream.pipe(...);
 *     }
 *   }
 * ]);
 * ```
 */
export function defineFeatures(
  features: CustomFeatureDefinition[]
): CustomFeatureDefinition[] {
  // 验证特征定义
  for (const feature of features) {
    validateFeatureDefinition(feature);
  }
  
  return features;
}

/**
 * 验证参数模式
 * @param key 参数键
 * @param schema 参数模式
 * @private
 */
function validateParameterSchema(key: string, schema: ParameterSchema): void {
  if (!schema.type) {
    throw new Error(`Parameter "${key}": type is required`);
  }

  const validTypes = ['number', 'string', 'boolean', 'enum'];
  if (!validTypes.includes(schema.type)) {
    throw new Error(`Parameter "${key}": invalid type "${schema.type}"`);
  }

  if (schema.type === 'enum' && !schema.enum) {
    throw new Error(`Parameter "${key}": enum type requires enum values`);
  }

  if (schema.type === 'number') {
    if (schema.minimum !== undefined && schema.maximum !== undefined) {
      if (schema.minimum > schema.maximum) {
        throw new Error(
          `Parameter "${key}": minimum (${schema.minimum}) > maximum (${schema.maximum})`
        );
      }
    }

    if (schema.default !== undefined) {
      const defaultValue = schema.default as number;
      if (schema.minimum !== undefined && defaultValue < schema.minimum) {
        throw new Error(
          `Parameter "${key}": default (${defaultValue}) < minimum (${schema.minimum})`
        );
      }
      if (schema.maximum !== undefined && defaultValue > schema.maximum) {
        throw new Error(
          `Parameter "${key}": default (${defaultValue}) > maximum (${schema.maximum})`
        );
      }
    }
  }
}

/**
 * 验证特征定义
 * @param feature 特征定义
 * @private
 */
function validateFeatureDefinition(feature: CustomFeatureDefinition): void {
  if (!feature.id) {
    throw new Error('Feature: id is required');
  }

  if (!feature.label) {
    throw new Error(`Feature "${feature.id}": label is required`);
  }

  if (!feature.valueType) {
    throw new Error(`Feature "${feature.id}": valueType is required`);
  }

  const validTypes = ['number', 'string', 'boolean', 'enum'];
  if (!validTypes.includes(feature.valueType)) {
    throw new Error(`Feature "${feature.id}": invalid valueType "${feature.valueType}"`);
  }

  if (feature.valueType === 'enum' && !feature.domain) {
    throw new Error(`Feature "${feature.id}": enum type requires domain`);
  }

  if (!feature.compute || typeof feature.compute !== 'function') {
    throw new Error(`Feature "${feature.id}": compute function is required`);
  }
}

/**
 * 生成唯一 ID
 * @param prefix 前缀
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 验证参数值
 * @param params 参数值
 * @param definition 参数定义
 */
export function validateParameters(
  params: Record<string, unknown>,
  definition: ParametersDefinition
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查必需参数
  for (const [key, schema] of Object.entries(definition)) {
    if (schema.required && !(key in params)) {
      errors.push(`Required parameter "${key}" is missing`);
      continue;
    }

    const value = params[key];
    if (value === undefined) {
      continue;
    }

    // 类型检查
    switch (schema.type) {
      case 'number':
        if (typeof value !== 'number') {
          errors.push(`Parameter "${key}": expected number, got ${typeof value}`);
        } else {
          if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push(`Parameter "${key}": value ${value} < minimum ${schema.minimum}`);
          }
          if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push(`Parameter "${key}": value ${value} > maximum ${schema.maximum}`);
          }
        }
        break;

      case 'string':
        if (typeof value !== 'string') {
          errors.push(`Parameter "${key}": expected string, got ${typeof value}`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Parameter "${key}": expected boolean, got ${typeof value}`);
        }
        break;

      case 'enum':
        if (schema.enum && !schema.enum.includes(value)) {
          errors.push(`Parameter "${key}": value "${value}" not in enum [${schema.enum.join(', ')}]`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 合并参数（默认值 + 用户值）
 * @param defaultParams 默认参数
 * @param userParams 用户参数
 * @param definition 参数定义
 */
export function mergeParameters(
  defaultParams: Record<string, unknown>,
  userParams: Record<string, unknown>,
  definition: ParametersDefinition
): Record<string, unknown> {
  const merged = { ...defaultParams };

  for (const [key, schema] of Object.entries(definition)) {
    if (key in userParams) {
      merged[key] = userParams[key];
    } else if (schema.default !== undefined) {
      merged[key] = schema.default;
    }
  }

  return merged;
}

