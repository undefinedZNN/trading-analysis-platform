/**
 * FeatureCatalogGenerator - 特征目录生成器
 * 
 * 负责生成供前端和分析模块使用的特征元数据目录
 */

import { ResolvedFeature, FeatureCatalog, FeatureDefinition } from './interfaces';

/**
 * 特征目录生成器实现
 */
export class FeatureCatalogGenerator {
  /**
   * 生成特征目录
   * 
   * @param resolvedFeatures 已解析的特征列表
   * @param sessionId 可选的会话ID
   * @returns 特征目录
   */
  generate(
    resolvedFeatures: ResolvedFeature[],
    sessionId?: string
  ): FeatureCatalog {
    return {
      features: resolvedFeatures.map(rf => ({
        featureId: rf.definition.id,
        outputId: rf.outputId,
        label: this.getLabel(rf.definition, rf.params),
        valueType: rf.definition.valueType || 'number',
        unit: rf.definition.unit,
        supportedOperators: rf.definition.supportedOperators || [
          '=',
          '!=',
          '>',
          '>=',
          '<',
          '<=',
        ],
        domain: rf.definition.domain,
        range: rf.definition.range,
        isImplicit: rf.isImplicit || false,
        params: rf.params,
      })),
      generatedAt: new Date().toISOString(),
      sessionId,
    };
  }

  /**
   * 获取特征的显示标签
   * 
   * @param definition 特征定义
   * @param params 参数
   * @returns 显示标签
   */
  private getLabel(
    definition: FeatureDefinition,
    params: Record<string, unknown>
  ): string {
    // 如果 displayName 是函数，调用它生成标签
    if (typeof definition.displayName === 'function') {
      return definition.displayName(params);
    }

    // 如果是字符串，直接使用
    if (typeof definition.displayName === 'string') {
      return definition.displayName;
    }

    // 否则，使用 ID 作为标签
    return definition.id;
  }

  /**
   * 生成特征的详细描述
   * 
   * @param resolvedFeature 已解析的特征
   * @returns 描述字符串
   */
  getFeatureDescription(resolvedFeature: ResolvedFeature): string {
    const def = resolvedFeature.definition;
    const parts: string[] = [];

    parts.push(def.description);

    // 添加参数信息
    const paramStrings = Object.entries(resolvedFeature.params).map(
      ([key, value]) => `${key}=${value}`
    );
    if (paramStrings.length > 0) {
      parts.push(`Parameters: ${paramStrings.join(', ')}`);
    }

    // 添加依赖信息
    if (resolvedFeature.dependencies.length > 0) {
      parts.push(`Depends on: ${resolvedFeature.dependencies.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * 将目录导出为JSON
   * 
   * @param catalog 特征目录
   * @returns JSON字符串
   */
  toJSON(catalog: FeatureCatalog): string {
    return JSON.stringify(catalog, null, 2);
  }

  /**
   * 从JSON导入目录
   * 
   * @param json JSON字符串
   * @returns 特征目录
   */
  fromJSON(json: string): FeatureCatalog {
    return JSON.parse(json);
  }

  /**
   * 验证目录格式
   * 
   * @param catalog 特征目录
   * @returns 是否有效
   */
  validate(catalog: FeatureCatalog): boolean {
    if (!catalog.features || !Array.isArray(catalog.features)) {
      return false;
    }

    if (!catalog.generatedAt) {
      return false;
    }

    for (const feature of catalog.features) {
      if (!feature.featureId || !feature.outputId || !feature.label) {
        return false;
      }
    }

    return true;
  }

  /**
   * 生成目录摘要
   * 
   * @param catalog 特征目录
   * @returns 摘要字符串
   */
  getSummary(catalog: FeatureCatalog): string {
    const total = catalog.features.length;
    const explicit = catalog.features.filter(f => !f.isImplicit).length;
    const implicit = catalog.features.filter(f => f.isImplicit).length;

    const typeCount = catalog.features.reduce((acc, f) => {
      acc[f.valueType] = (acc[f.valueType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const lines = [
      `Feature Catalog Summary`,
      `Generated: ${catalog.generatedAt}`,
      catalog.sessionId ? `Session: ${catalog.sessionId}` : null,
      `Total features: ${total}`,
      `  - Explicit: ${explicit}`,
      `  - Implicit: ${implicit}`,
      `Value types:`,
    ];

    for (const [type, count] of Object.entries(typeCount)) {
      lines.push(`  - ${type}: ${count}`);
    }

    return lines.filter(Boolean).join('\n');
  }
}

/**
 * 创建特征目录生成器实例
 */
export function createFeatureCatalogGenerator(): FeatureCatalogGenerator {
  return new FeatureCatalogGenerator();
}

