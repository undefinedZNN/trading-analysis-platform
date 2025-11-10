/**
 * Schema差异分析服务
 * 
 * 分析两个版本的参数Schema和因子Schema的差异
 * 
 * @module strategies/services/schema-diff
 */

import { Injectable } from '@nestjs/common';
import {
  SchemaDiffResult,
  SchemaFieldDiff,
  DiffType,
} from '../dto/version-compare.dto';

/**
 * Schema差异分析服务
 */
@Injectable()
export class SchemaDiffService {
  /**
   * 比较两个Schema
   * 
   * @param sourceSchema 源Schema
   * @param targetSchema 目标Schema
   * @returns Schema差异结果
   */
  compareSchemas(
    sourceSchema: { parameters?: any; factors?: any },
    targetSchema: { parameters?: any; factors?: any },
  ): SchemaDiffResult {
    return {
      parameters: this.compareObjects(
        sourceSchema.parameters || {},
        targetSchema.parameters || {},
      ),
      factors: this.compareObjects(
        sourceSchema.factors || {},
        targetSchema.factors || {},
      ),
    };
  }

  /**
   * 比较两个对象
   * 
   * @param sourceObj 源对象
   * @param targetObj 目标对象
   * @returns 字段差异列表
   */
  private compareObjects(
    sourceObj: Record<string, any>,
    targetObj: Record<string, any>,
  ): {
    added: SchemaFieldDiff[];
    removed: SchemaFieldDiff[];
    modified: SchemaFieldDiff[];
  } {
    const added: SchemaFieldDiff[] = [];
    const removed: SchemaFieldDiff[] = [];
    const modified: SchemaFieldDiff[] = [];

    const sourceKeys = new Set(Object.keys(sourceObj));
    const targetKeys = new Set(Object.keys(targetObj));

    // 查找新增的字段
    for (const key of targetKeys) {
      if (!sourceKeys.has(key)) {
        added.push({
          fieldName: key,
          type: DiffType.ADDED,
          targetValue: targetObj[key],
          description: this.getFieldDescription(key, targetObj[key]),
        });
      }
    }

    // 查找删除的字段
    for (const key of sourceKeys) {
      if (!targetKeys.has(key)) {
        removed.push({
          fieldName: key,
          type: DiffType.REMOVED,
          sourceValue: sourceObj[key],
          description: this.getFieldDescription(key, sourceObj[key]),
        });
      }
    }

    // 查找修改的字段
    for (const key of sourceKeys) {
      if (targetKeys.has(key)) {
        const sourceValue = sourceObj[key];
        const targetValue = targetObj[key];

        if (!this.deepEqual(sourceValue, targetValue)) {
          modified.push({
            fieldName: key,
            type: DiffType.MODIFIED,
            sourceValue,
            targetValue,
            description: this.getChangeDescription(key, sourceValue, targetValue),
          });
        }
      }
    }

    return { added, removed, modified };
  }

  /**
   * 深度比较两个值是否相等
   * 
   * @param a 值A
   * @param b 值B
   * @returns 是否相等
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) return false;

      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!this.deepEqual(a[key], b[key])) return false;
      }

      return true;
    }

    return false;
  }

  /**
   * 获取字段描述
   * 
   * @param fieldName 字段名
   * @param value 字段值
   * @returns 描述文本
   */
  private getFieldDescription(fieldName: string, value: any): string {
    if (value && typeof value === 'object') {
      if (value.type) {
        return `${fieldName}: ${value.type}${value.title ? ` (${value.title})` : ''}`;
      }
      return `${fieldName}: object`;
    }
    return `${fieldName}: ${typeof value}`;
  }

  /**
   * 获取变化描述
   * 
   * @param fieldName 字段名
   * @param sourceValue 源值
   * @param targetValue 目标值
   * @returns 变化描述
   */
  private getChangeDescription(
    fieldName: string,
    sourceValue: any,
    targetValue: any,
  ): string {
    const changes: string[] = [];

    if (typeof sourceValue === 'object' && typeof targetValue === 'object') {
      // 比较对象属性
      if (sourceValue.type !== targetValue.type) {
        changes.push(`type: ${sourceValue.type} → ${targetValue.type}`);
      }
      if (sourceValue.title !== targetValue.title) {
        changes.push(`title: "${sourceValue.title}" → "${targetValue.title}"`);
      }
      if (sourceValue.default !== targetValue.default) {
        changes.push(`default: ${sourceValue.default} → ${targetValue.default}`);
      }
      if (sourceValue.minimum !== targetValue.minimum) {
        changes.push(`minimum: ${sourceValue.minimum} → ${targetValue.minimum}`);
      }
      if (sourceValue.maximum !== targetValue.maximum) {
        changes.push(`maximum: ${sourceValue.maximum} → ${targetValue.maximum}`);
      }
    } else {
      changes.push(`${sourceValue} → ${targetValue}`);
    }

    return changes.join(', ');
  }

  /**
   * 检查是否有差异
   * 
   * @param result Schema差异结果
   * @returns 是否有差异
   */
  hasDifferences(result: SchemaDiffResult): boolean {
    return (
      result.parameters.added.length > 0 ||
      result.parameters.removed.length > 0 ||
      result.parameters.modified.length > 0 ||
      result.factors.added.length > 0 ||
      result.factors.removed.length > 0 ||
      result.factors.modified.length > 0
    );
  }

  /**
   * 获取差异摘要
   * 
   * @param result Schema差异结果
   * @returns 差异摘要
   */
  getDiffSummary(result: SchemaDiffResult): string {
    const parts: string[] = [];

    const paramChanges =
      result.parameters.added.length +
      result.parameters.removed.length +
      result.parameters.modified.length;

    const factorChanges =
      result.factors.added.length +
      result.factors.removed.length +
      result.factors.modified.length;

    if (paramChanges > 0) {
      parts.push(`${paramChanges} parameter changes`);
    }
    if (factorChanges > 0) {
      parts.push(`${factorChanges} factor changes`);
    }

    return parts.length > 0 ? parts.join(', ') : 'No schema changes';
  }
}

