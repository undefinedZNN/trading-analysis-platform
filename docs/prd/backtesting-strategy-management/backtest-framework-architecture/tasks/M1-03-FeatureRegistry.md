# M1-03: FeatureRegistry 特征注册表

**任务ID**: M1-03  
**里程碑**: M1 - 数据/特征与事件总线基线  
**状态**: 🔴 Pending  
**负责人**: _待分配_  
**预计工期**: 10天  
**优先级**: 🔥 高  
**依赖**: M1-01 (需要 `BarEvent` 定义)

---

## 📋 任务概述

实现特征注册与管理系统，支持内置技术指标（MA、EMA、RSI、ATR 等）和自定义特征的注册、参数校验、依赖解析，以及 `featureCatalog` 元数据的生成和输出。

## 🎯 核心目标

1. **特征注册机制** - 提供统一的特征定义和注册接口
2. **参数校验** - 验证特征参数的类型、范围和依赖关系
3. **依赖拓扑** - 自动解析特征依赖，生成正确的计算顺序
4. **featureCatalog 输出** - 生成供前端和分析模块使用的特征元数据

## 📐 设计要求

### 核心接口定义

```typescript
interface FeatureDefinition {
  id: string;                    // 特征类型标识，如 'EMA', 'RSI'
  description: string;
  dependsOn?: Array<{
    ref: string;
    type: 'field' | 'feature';
    optional?: boolean;
  }>;
  displayName?: string | ((params?: Record<string, unknown>) => string);
  valueType?: 'number' | 'integer' | 'boolean' | 'string' | 'enum';
  unit?: string;                 // 如 'pct', 'bps', 'usd'
  supportedOperators?: Array<'=' | '!=' | '>' | '>=' | '<' | '<=' | 'between' | 'in'>;
  domain?: Array<string | number>; // 枚举值候选
  range?: { min?: number; max?: number };
  defaultParams?: Record<string, unknown>;
  paramSchema?: Record<string, ParameterSchema>; // 参数定义
  compute(stream: Observable<BarEvent>, params?: Record<string, unknown>): Observable<BarEvent>;
}

interface ParameterSchema {
  type: 'number' | 'integer' | 'string' | 'boolean' | 'enum';
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  enum?: Array<string | number>;
  description?: string;
}

interface FeatureRegistry {
  register(feature: FeatureDefinition): void;
  get(id: string): FeatureDefinition | undefined;
  resolve(featureSet: Array<string | FeatureConfig>): ResolvedFeature[];
  listDefinitions(): FeatureMetadata[];
  validateParams(id: string, params: Record<string, unknown>): ValidationResult;
}

interface FeatureConfig {
  id: string;
  params?: Record<string, unknown>;
  outputId?: string;
  label?: string;
}

interface ResolvedFeature {
  definition: FeatureDefinition;
  outputId: string;
  params: Record<string, unknown>;
  dependencies: string[];
  order: number;                 // 拓扑排序后的顺序
}

interface FeatureCatalog {
  features: Array<{
    featureId: string;
    outputId: string;
    label: string;
    valueType: string;
    unit?: string;
    supportedOperators: string[];
    domain?: Array<string | number>;
    range?: { min?: number; max?: number };
    isImplicit: boolean;         // 是否为隐式依赖
    params: Record<string, unknown>;
  }>;
  generatedAt: string;
  sessionId?: string;
}
```

### 内置特征定义

需要实现以下内置特征：

| Feature ID | 描述 | 默认参数 | 依赖字段 |
|------------|------|----------|----------|
| `MA` | 简单移动平均 | `window=20, source='close'` | `close` |
| `EMA10` | 指数移动平均10 | `window=10, source='close'` | `close` |
| `EMA20` | 指数移动平均20 | `window=20, source='close'` | `close` |
| `RSI14` | 相对强弱指标 | `window=14, source='close'` | `close` |
| `ATR14` | 平均真实波动 | `window=14` | `high`, `low`, `close` |
| `IBS` | 内部柱强度指数 | - | `high`, `low`, `close` |
| `Overlap5` | K线重叠度5 | `window=5` | `high`, `low` |
| `Overlap10` | K线重叠度10 | `window=10` | `high`, `low` |
| `Overlap15` | K线重叠度15 | `window=15` | `high`, `low` |
| `Overlap20` | K线重叠度20 | `window=20` | `high`, `low` |

## 🔧 实现要点

### 1. 特征注册

```typescript
class FeatureRegistryImpl implements FeatureRegistry {
  private features = new Map<string, FeatureDefinition>();
  
  register(feature: FeatureDefinition): void {
    // 1. 校验 ID 唯一性
    if (this.features.has(feature.id)) {
      throw new Error(`Feature ${feature.id} already registered`);
    }
    
    // 2. 校验依赖存在性（如果依赖其他特征）
    this.validateDependencies(feature);
    
    // 3. 校验参数 schema
    this.validateParamSchema(feature.paramSchema);
    
    // 4. 注册
    this.features.set(feature.id, feature);
  }
}
```

### 2. 依赖解析与拓扑排序

```typescript
class DependencyResolver {
  resolve(featureConfigs: FeatureConfig[]): ResolvedFeature[] {
    // 1. 展开所有特征，包括隐式依赖
    const allFeatures = this.expandDependencies(featureConfigs);
    
    // 2. 构建依赖图
    const graph = this.buildDependencyGraph(allFeatures);
    
    // 3. 检测循环依赖
    this.detectCycles(graph);
    
    // 4. 拓扑排序
    return this.topologicalSort(graph);
  }
  
  private expandDependencies(configs: FeatureConfig[]): FeatureConfig[] {
    const expanded = new Map<string, FeatureConfig>();
    const queue = [...configs];
    
    while (queue.length > 0) {
      const config = queue.shift()!;
      const definition = this.registry.get(config.id);
      
      if (!expanded.has(config.outputId || config.id)) {
        expanded.set(config.outputId || config.id, config);
        
        // 添加依赖的特征
        definition?.dependsOn
          ?.filter(dep => dep.type === 'feature')
          .forEach(dep => {
            if (!expanded.has(dep.ref)) {
              queue.push({ id: dep.ref });
            }
          });
      }
    }
    
    return Array.from(expanded.values());
  }
}
```

### 3. 参数校验

```typescript
class ParameterValidator {
  validate(
    definition: FeatureDefinition,
    params: Record<string, unknown>
  ): ValidationResult {
    const errors: string[] = [];
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
        errors.push(`Unknown parameter: ${key}`);
        continue;
      }
      
      // 类型检查
      if (!this.checkType(value, paramDef.type)) {
        errors.push(`Invalid type for ${key}: expected ${paramDef.type}`);
      }
      
      // 范围检查
      if (paramDef.type === 'number' || paramDef.type === 'integer') {
        if (paramDef.min !== undefined && (value as number) < paramDef.min) {
          errors.push(`${key} must be >= ${paramDef.min}`);
        }
        if (paramDef.max !== undefined && (value as number) > paramDef.max) {
          errors.push(`${key} must be <= ${paramDef.max}`);
        }
      }
      
      // 枚举检查
      if (paramDef.enum && !paramDef.enum.includes(value as any)) {
        errors.push(`${key} must be one of: ${paramDef.enum.join(', ')}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### 4. featureCatalog 生成

```typescript
class FeatureCatalogGenerator {
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
        supportedOperators: rf.definition.supportedOperators || ['=', '!=', '>', '<'],
        domain: rf.definition.domain,
        range: rf.definition.range,
        isImplicit: rf.isImplicit || false,
        params: rf.params
      })),
      generatedAt: new Date().toISOString(),
      sessionId
    };
  }
  
  private getLabel(
    definition: FeatureDefinition,
    params: Record<string, unknown>
  ): string {
    if (typeof definition.displayName === 'function') {
      return definition.displayName(params);
    }
    return definition.displayName || definition.id;
  }
}
```

## 📦 交付物清单

### 必需交付物

- [ ] **设计文档** (`docs/design/feature-registry-design.md`)
  - 特征注册机制说明
  - 依赖解析算法
  - featureCatalog 格式定义
  
- [ ] **接口定义** (`backend/src/backtesting/features/interfaces.ts`)
  - `FeatureDefinition` 接口
  - `FeatureRegistry` 接口
  - `FeatureCatalog` 类型
  
- [ ] **实现代码**
  - `FeatureRegistry` 类 (`backend/src/backtesting/features/registry.ts`)
  - 依赖解析器 (`backend/src/backtesting/features/dependency-resolver.ts`)
  - 参数校验器 (`backend/src/backtesting/features/parameter-validator.ts`)
  - Catalog 生成器 (`backend/src/backtesting/features/catalog-generator.ts`)
  - 内置特征实现 (`backend/src/backtesting/features/built-in/`)
    - `ma.feature.ts`
    - `ema.feature.ts`
    - `rsi.feature.ts`
    - `atr.feature.ts`
    - `ibs.feature.ts`
    - `overlap.feature.ts`
  
- [ ] **模块 README** (`backend/src/backtesting/features/README.md`)
  - 快速开始
  - 内置特征列表
  - 自定义特征开发指南
  - API 文档

### 测试要求

- [ ] **单元测试** (`backend/src/backtesting/features/__tests__/`)
  - `registry.spec.ts`
    - ✓ 特征注册
    - ✓ 获取特征定义
    - ✓ 重复注册检测
  - `dependency-resolver.spec.ts`
    - ✓ 简单依赖解析
    - ✓ 多层依赖解析
    - ✓ 循环依赖检测
    - ✓ 拓扑排序正确性
  - `parameter-validator.spec.ts`
    - ✓ 类型校验
    - ✓ 范围校验
    - ✓ 必需参数检查
    - ✓ 未知参数检测
  - `catalog-generator.spec.ts`
    - ✓ Catalog 格式正确
    - ✓ 标签生成
  - 内置特征测试 (`built-in/*.spec.ts`)
    - ✓ 每个特征的计算正确性
  - 覆盖率要求：≥ 85%

- [ ] **集成测试** (`backend/src/backtesting/features/__tests__/integration/`)
  - `feature-pipeline.integration.spec.ts`
    - ✓ featureSet 配置 → catalog 生成
    - ✓ 特征计算管道端到端
    - ✓ 与 DataProvider 集成

## 🔗 依赖关系

### 上游依赖
- M1-01: DataProvider（需要 `BarEvent` 定义）

### 下游依赖
- M2-01: StrategySandbox（使用特征数据）
- M3-03: Analytics Output（使用 featureCatalog）

### 外部依赖
- `rxjs` ^8.0.0
- `big.js` ^6.0.0
- 技术指标库（如 `technicalindicators` 或自研）

## 📚 参考文档

- [技术架构设计](../backtest-framework-architecture.md) 第 31-39, 53-59 行
- [共识纪要 - 特征工程](../backtest-framework-consensus.md) 第 60-257 行

## ✅ 验收标准

### 功能验收
1. ✅ 能够注册内置和自定义特征
2. ✅ 正确解析特征依赖，生成拓扑顺序
3. ✅ 参数校验准确，错误信息清晰
4. ✅ 生成的 featureCatalog 格式符合规范
5. ✅ 所有内置特征计算正确

### 测试验收
1. ✅ 单元测试覆盖率 ≥ 85%
2. ✅ 所有集成测试通过
3. ✅ 每个内置特征有完整的测试用例

### 文档验收
1. ✅ 设计文档完整
2. ✅ README 包含使用示例和API文档
3. ✅ 自定义特征开发指南清晰

## 🚨 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 循环依赖检测算法复杂 | 中 | 使用成熟的图算法库 |
| 技术指标计算精度 | 高 | 严格测试，使用 big.js |
| 特征计算性能问题 | 中 | 进行性能基准测试，必要时优化 |
| featureCatalog 格式变更 | 低 | 版本化管理，保持向后兼容 |

## 📝 开发笔记

### 实现顺序建议
1. 先实现基础的注册和获取功能
2. 实现参数校验
3. 实现依赖解析和拓扑排序
4. 实现 featureCatalog 生成
5. 实现内置特征（从简单到复杂）
6. 集成测试和性能优化

### 技术要点
- 使用 RxJS 的 `scan` 操作符实现滚动窗口计算
- 考虑使用缓存优化重复计算
- 参数校验可考虑使用 JSON Schema 或 Zod

---

**创建时间**: 2025-11-07  
**最后更新**: 2025-11-07  
**下一步行动**: 分配负责人，开始设计阶段

