/**
 * FeatureRegistry - 特征注册表
 * 
 * 核心注册表实现，整合参数校验、依赖解析、目录生成等功能
 */

import {
  FeatureDefinition,
  FeatureRegistry,
  FeatureConfig,
  ResolvedFeature,
  FeatureMetadata,
  ValidationResult,
  FeatureCatalog,
} from './interfaces';
import { ParameterValidator } from './parameter-validator';
import { DependencyResolver } from './dependency-resolver';
import { FeatureCatalogGenerator } from './catalog-generator';

/**
 * 特征注册表实现
 */
export class FeatureRegistryImpl implements FeatureRegistry {
  private features = new Map<string, FeatureDefinition>();
  private validator: ParameterValidator;
  private resolver: DependencyResolver;
  private catalogGenerator: FeatureCatalogGenerator;

  constructor() {
    this.validator = new ParameterValidator();
    this.resolver = new DependencyResolver((id) => this.get(id));
    this.catalogGenerator = new FeatureCatalogGenerator();
  }

  /**
   * 注册特征
   */
  register(feature: FeatureDefinition): void {
    // 1. 校验 ID 唯一性
    if (this.features.has(feature.id)) {
      throw new Error(`Feature '${feature.id}' is already registered`);
    }

    // 2. 校验特征ID格式
    if (!this.validateFeatureId(feature.id)) {
      throw new Error(`Invalid feature ID: '${feature.id}'`);
    }

    // 3. 校验依赖存在性（如果依赖其他特征）
    this.validateDependencies(feature);

    // 4. 校验参数 schema
    this.validateParamSchema(feature.paramSchema);

    // 5. 注册
    this.features.set(feature.id, feature);
  }

  /**
   * 获取特征定义
   */
  get(id: string): FeatureDefinition | undefined {
    return this.features.get(id);
  }

  /**
   * 解析特征集合
   */
  resolve(featureSet: Array<string | FeatureConfig>): ResolvedFeature[] {
    // 标准化为 FeatureConfig 数组
    const configs: FeatureConfig[] = featureSet.map(item => {
      if (typeof item === 'string') {
        return { id: item };
      }
      return item;
    });

    // 使用解析器进行依赖解析和拓扑排序
    return this.resolver.resolve(configs, (def, params) =>
      this.validator.mergeWithDefaults(def, params)
    );
  }

  /**
   * 列出所有已注册的特征
   */
  listDefinitions(): FeatureMetadata[] {
    return Array.from(this.features.values()).map(def => ({
      id: def.id,
      description: def.description,
      category: def.category,
      version: def.version,
      displayName: typeof def.displayName === 'string' 
        ? def.displayName 
        : def.id,
      valueType: def.valueType || 'number',
      unit: def.unit,
      defaultParams: def.defaultParams,
      paramSchema: def.paramSchema,
      dependsOn: def.dependsOn,
    }));
  }

  /**
   * 校验特征参数
   */
  validateParams(id: string, params: Record<string, unknown>): ValidationResult {
    const definition = this.get(id);
    
    if (!definition) {
      return {
        valid: false,
        errors: [`Feature '${id}' not found`],
      };
    }

    return this.validator.validate(definition, params);
  }

  /**
   * 生成特征目录
   */
  generateCatalog(
    resolvedFeatures: ResolvedFeature[],
    sessionId?: string
  ): FeatureCatalog {
    return this.catalogGenerator.generate(resolvedFeatures, sessionId);
  }

  /**
   * 校验特征ID格式
   */
  private validateFeatureId(id: string): boolean {
    // 特征ID应该是非空字符串，可以包含字母、数字、下划线和连字符
    return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id);
  }

  /**
   * 校验特征的依赖
   */
  private validateDependencies(feature: FeatureDefinition): void {
    if (!feature.dependsOn) {
      return;
    }

    for (const dep of feature.dependsOn) {
      if (dep.type === 'feature') {
        // 检查依赖的特征是否已注册
        const depFeature = this.get(dep.ref);
        if (!depFeature && !dep.optional) {
          throw new Error(
            `Feature '${feature.id}' depends on '${dep.ref}', but it is not registered`
          );
        }
      }
      // 字段依赖不需要在这里校验，因为字段来自BarEvent
    }
  }

  /**
   * 校验参数 schema
   */
  private validateParamSchema(
    schema?: Record<string, any>
  ): void {
    if (!schema) {
      return;
    }

    for (const [key, paramDef] of Object.entries(schema)) {
      // 校验参数名
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
        throw new Error(`Invalid parameter name: '${key}'`);
      }

      // 校验参数类型
      const validTypes = ['number', 'integer', 'string', 'boolean', 'enum'];
      if (!validTypes.includes(paramDef.type)) {
        throw new Error(
          `Invalid parameter type for '${key}': '${paramDef.type}'`
        );
      }

      // 校验范围（对于数值类型）
      if ((paramDef.type === 'number' || paramDef.type === 'integer') &&
          paramDef.min !== undefined &&
          paramDef.max !== undefined &&
          paramDef.min > paramDef.max) {
        throw new Error(
          `Invalid range for parameter '${key}': min (${paramDef.min}) > max (${paramDef.max})`
        );
      }

      // 校验枚举值
      if (paramDef.enum && !Array.isArray(paramDef.enum)) {
        throw new Error(`Parameter '${key}' enum must be an array`);
      }
    }
  }

  /**
   * 获取特征数量
   */
  getFeatureCount(): number {
    return this.features.size;
  }

  /**
   * 检查特征是否已注册
   */
  has(id: string): boolean {
    return this.features.has(id);
  }

  /**
   * 清空所有特征（通常用于测试）
   */
  clear(): void {
    this.features.clear();
  }

  /**
   * 批量注册特征
   */
  registerBatch(features: FeatureDefinition[]): void {
    for (const feature of features) {
      this.register(feature);
    }
  }

  /**
   * 获取特征的所有依赖（包括间接依赖）
   */
  getAllDependencies(featureId: string): string[] {
    return this.resolver.getAllDependencies(featureId);
  }
}

/**
 * 创建特征注册表实例
 */
export function createFeatureRegistry(): FeatureRegistry {
  return new FeatureRegistryImpl();
}

/**
 * 全局单例注册表（可选）
 */
let globalRegistry: FeatureRegistry | null = null;

/**
 * 获取或创建全局注册表
 */
export function getGlobalRegistry(): FeatureRegistry {
  if (!globalRegistry) {
    globalRegistry = createFeatureRegistry();
  }
  return globalRegistry;
}

/**
 * 重置全局注册表（用于测试）
 */
export function resetGlobalRegistry(): void {
  globalRegistry = null;
}

