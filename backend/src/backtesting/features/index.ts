/**
 * FeatureRegistry 模块导出
 */

// 接口
export * from './interfaces';

// 核心类
export {
  FeatureRegistryImpl,
  createFeatureRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
} from './registry';

export {
  ParameterValidator,
  createParameterValidator,
} from './parameter-validator';

export {
  DependencyResolver,
  createDependencyResolver,
} from './dependency-resolver';

export {
  FeatureCatalogGenerator,
  createFeatureCatalogGenerator,
} from './catalog-generator';

