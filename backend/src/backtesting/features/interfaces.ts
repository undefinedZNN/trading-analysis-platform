/**
 * FeatureRegistry 核心接口定义
 * 
 * 本模块定义了特征注册、管理、计算的统一接口，
 * 支持内置技术指标和自定义特征的注册与使用。
 */

import { Observable } from 'rxjs';
import { BarEvent } from '../data/timeframe/interfaces';

/**
 * 参数类型
 */
export type ParameterType = 'number' | 'integer' | 'string' | 'boolean' | 'enum';

/**
 * 特征值类型
 */
export type ValueType = 'number' | 'integer' | 'boolean' | 'string' | 'enum';

/**
 * 依赖类型
 */
export type DependencyType = 'field' | 'feature';

/**
 * 支持的比较运算符
 */
export type SupportedOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'between' | 'in';

/**
 * 参数 Schema 定义
 */
export interface ParameterSchema {
  /** 参数类型 */
  type: ParameterType;
  
  /** 是否必需 */
  required?: boolean;
  
  /** 默认值 */
  default?: unknown;
  
  /** 最小值（数值类型） */
  min?: number;
  
  /** 最大值（数值类型） */
  max?: number;
  
  /** 枚举值列表 */
  enum?: Array<string | number>;
  
  /** 参数描述 */
  description?: string;
}

/**
 * 特征依赖定义
 */
export interface FeatureDependency {
  /** 依赖的字段或特征ID */
  ref: string;
  
  /** 依赖类型：字段或特征 */
  type: DependencyType;
  
  /** 是否可选 */
  optional?: boolean;
}

/**
 * 特征定义
 */
export interface FeatureDefinition {
  /** 特征唯一标识 */
  id: string;
  
  /** 特征描述 */
  description: string;
  
  /** 特征分类（如 'trend', 'momentum', 'volatility', 'price_pattern' 等） */
  category?: string;
  
  /** 特征版本 */
  version?: string;
  
  /** 依赖的字段或其他特征 */
  dependsOn?: FeatureDependency[];
  
  /** 显示名称（可以是函数，根据参数动态生成） */
  displayName?: string | ((params?: Record<string, unknown>) => string);
  
  /** 输出值类型 */
  valueType?: ValueType;
  
  /** 单位（如 'pct', 'bps', 'usd'） */
  unit?: string;
  
  /** 支持的比较运算符 */
  supportedOperators?: SupportedOperator[];
  
  /** 枚举值候选（用于 enum 类型） */
  domain?: Array<string | number>;
  
  /** 数值范围（用于 number 类型） */
  range?: { min?: number; max?: number };
  
  /** 默认参数 */
  defaultParams?: Record<string, unknown>;
  
  /** 参数 Schema */
  paramSchema?: Record<string, ParameterSchema>;
  
  /** 计算函数 */
  compute(
    stream: Observable<BarEvent>,
    params?: Record<string, unknown>
  ): Observable<BarEvent>;
}

/**
 * 特征配置
 */
export interface FeatureConfig {
  /** 特征ID */
  id: string;
  
  /** 参数 */
  params?: Record<string, unknown>;
  
  /** 输出ID（用于区分同一特征的不同配置） */
  outputId?: string;
  
  /** 标签 */
  label?: string;
}

/**
 * 已解析的特征
 */
export interface ResolvedFeature {
  /** 特征定义 */
  definition: FeatureDefinition;
  
  /** 输出ID */
  outputId: string;
  
  /** 合并后的参数 */
  params: Record<string, unknown>;
  
  /** 依赖的特征ID列表 */
  dependencies: string[];
  
  /** 拓扑排序后的执行顺序 */
  order: number;
  
  /** 是否为隐式依赖 */
  isImplicit?: boolean;
}

/**
 * 特征元数据（用于列表展示）
 */
export interface FeatureMetadata {
  /** 特征ID */
  id: string;
  
  /** 描述 */
  description: string;
  
  /** 特征分类 */
  category?: string;
  
  /** 特征版本 */
  version?: string;
  
  /** 显示名称 */
  displayName: string;
  
  /** 值类型 */
  valueType: ValueType;
  
  /** 单位 */
  unit?: string;
  
  /** 默认参数 */
  defaultParams?: Record<string, unknown>;
  
  /** 参数Schema */
  paramSchema?: Record<string, ParameterSchema>;
  
  /** 依赖 */
  dependsOn?: FeatureDependency[];
}

/**
 * 特征目录（供前端和分析使用）
 */
export interface FeatureCatalog {
  /** 特征列表 */
  features: Array<{
    /** 特征ID */
    featureId: string;
    
    /** 输出ID */
    outputId: string;
    
    /** 标签 */
    label: string;
    
    /** 值类型 */
    valueType: string;
    
    /** 单位 */
    unit?: string;
    
    /** 支持的运算符 */
    supportedOperators: string[];
    
    /** 枚举候选值 */
    domain?: Array<string | number>;
    
    /** 数值范围 */
    range?: { min?: number; max?: number };
    
    /** 是否为隐式依赖 */
    isImplicit: boolean;
    
    /** 参数 */
    params: Record<string, unknown>;
  }>;
  
  /** 生成时间 */
  generatedAt: string;
  
  /** 会话ID */
  sessionId?: string;
}

/**
 * 参数校验结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  
  /** 错误信息列表 */
  errors: string[];
  
  /** 警告信息列表 */
  warnings?: string[];
}

/**
 * 特征注册表接口
 */
export interface FeatureRegistry {
  /**
   * 注册特征
   * @param feature 特征定义
   */
  register(feature: FeatureDefinition): void;
  
  /**
   * 获取特征定义
   * @param id 特征ID
   * @returns 特征定义，如果不存在则返回 undefined
   */
  get(id: string): FeatureDefinition | undefined;
  
  /**
   * 解析特征集合（包含依赖解析和拓扑排序）
   * @param featureSet 特征配置列表
   * @returns 已解析的特征列表（按执行顺序）
   */
  resolve(featureSet: Array<string | FeatureConfig>): ResolvedFeature[];
  
  /**
   * 列出所有已注册的特征
   * @returns 特征元数据列表
   */
  listDefinitions(): FeatureMetadata[];
  
  /**
   * 校验特征参数
   * @param id 特征ID
   * @param params 参数
   * @returns 校验结果
   */
  validateParams(id: string, params: Record<string, unknown>): ValidationResult;
  
  /**
   * 生成特征目录
   * @param resolvedFeatures 已解析的特征列表
   * @param sessionId 会话ID（可选）
   * @returns 特征目录
   */
  generateCatalog(
    resolvedFeatures: ResolvedFeature[],
    sessionId?: string
  ): FeatureCatalog;
  
  /**
   * 检查特征是否已注册
   * @param id 特征ID
   * @returns 是否已注册
   */
  has(id: string): boolean;
  
  /**
   * 获取已注册特征的数量
   * @returns 特征数量
   */
  getFeatureCount(): number;
  
  /**
   * 批量注册特征
   * @param features 特征定义数组
   */
  registerBatch(features: FeatureDefinition[]): void;
  
  /**
   * 清空所有特征（通常用于测试）
   */
  clear(): void;
  
  /**
   * 获取特征的所有依赖（包括间接依赖）
   * @param featureId 特征ID
   * @returns 依赖的特征ID列表
   */
  getAllDependencies(featureId: string): string[];
}

/**
 * 依赖图节点
 */
export interface DependencyNode {
  /** 节点ID */
  id: string;
  
  /** 特征配置 */
  config: FeatureConfig;
  
  /** 依赖的节点ID列表 */
  dependencies: string[];
}

/**
 * 依赖图
 */
export interface DependencyGraph {
  /** 节点映射 */
  nodes: Map<string, DependencyNode>;
  
  /** 邻接表（节点ID -> 依赖它的节点ID列表） */
  adjacencyList: Map<string, string[]>;
}

