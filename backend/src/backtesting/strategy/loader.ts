/**
 * 策略加载器
 * 
 * 负责加载、编译、校验策略脚本
 */

import type {
  StrategyLoader,
  StrategyInstance,
  StrategyLifecycle,
  StrategyManifest,
  ParametersDefinition,
  CustomFeatureDefinition,
} from './interfaces';
import { validateParameters } from './utils';
import { StrategyCompilerService } from './compiler.service';

/**
 * 简化的策略加载器实现
 * 
 * 注意：这是一个简化版本，用于测试和演示
 * 生产环境需要使用更安全的沙箱加载机制
 */
export class SimpleStrategyLoader implements StrategyLoader {
  private compiler: StrategyCompilerService;

  constructor() {
    this.compiler = new StrategyCompilerService();
  }

  /**
   * 从策略对象加载（用于测试）
   * @param strategyModule 策略模块对象
   * @param manifest Manifest
   */
  loadFromObject(
    strategyModule: {
      default: StrategyLifecycle;
      parameters?: ParametersDefinition;
      customFeatures?: CustomFeatureDefinition[];
    },
    manifest: StrategyManifest
  ): StrategyInstance {
    // 1. 提取导出
    const lifecycle = strategyModule.default;
    const parameters = strategyModule.parameters || {};
    const customFeatures = strategyModule.customFeatures;

    // 2. 校验生命周期接口
    this.validateLifecycle(lifecycle);

    // 3. 校验参数定义
    if (Object.keys(parameters).length > 0) {
      this.validateParameterDefinition(parameters, manifest);
    }

    // 4. 创建策略实例
    return {
      lifecycle,
      manifest,
      parameters,
      customFeatures,
    };
  }

  /**
   * 从脚本内容加载
   * @param scriptContent 脚本内容
   * @param manifest Manifest
   */
  async load(
    scriptContent: string,
    manifest: StrategyManifest
  ): Promise<StrategyInstance> {
    // 1. 编译脚本
    const compileResult = await this.compiler.compile(scriptContent, {
      timeout: 10000, // 10秒超时
      removeComments: false,
    });

    if (!compileResult.success) {
      throw new Error(
        'Strategy compilation failed:\n' +
        (compileResult.errors || []).join('\n')
      );
    }

    // 2. 验证导出
    const validation = this.compiler.validateExports(compileResult.exports);
    if (!validation.valid) {
      throw new Error(
        'Invalid strategy exports:\n' +
        validation.errors.join('\n')
      );
    }

    // 3. 提取导出
    const lifecycle = compileResult.exports.default;
    const parameters = compileResult.exports.parameters || {};
    const customFeatures = compileResult.exports.customFeatures;

    // 4. 校验生命周期接口
    this.validateLifecycle(lifecycle);

    // 5. 校验参数定义
    if (Object.keys(parameters).length > 0) {
      this.validateParameterDefinition(parameters, manifest);
    }

    // 6. 创建策略实例
    return {
      lifecycle,
      manifest,
      parameters,
      customFeatures,
    };
  }

  /**
   * 校验生命周期接口
   * @param lifecycle 生命周期对象
   * @private
   */
  private validateLifecycle(lifecycle: StrategyLifecycle): void {
    if (!lifecycle || typeof lifecycle !== 'object') {
      throw new Error('Strategy lifecycle must be an object');
    }

    // 检查至少有一个生命周期钩子
    const hooks = [
      'onInit',
      'onWarmup',
      'onBar',
      'onAuxStream',
      'onExecutionReport',
      'onRiskDecision',
      'onControl',
      'onSnapshot',
      'onRestore',
      'onStop',
      'onError',
    ];

    const hasAnyHook = hooks.some(
      (hook) => hook in lifecycle && typeof (lifecycle as any)[hook] === 'function'
    );

    if (!hasAnyHook) {
      throw new Error('Strategy must implement at least one lifecycle hook');
    }

    // 检查常用钩子
    if (!lifecycle.onBar && !lifecycle.onInit) {
      console.warn('Strategy does not implement onBar or onInit');
    }
  }

  /**
   * 校验参数定义
   * @param parameters 参数定义
   * @param manifest Manifest
   * @private
   */
  private validateParameterDefinition(
    parameters: ParametersDefinition,
    manifest: StrategyManifest
  ): void {
    // 校验默认参数是否符合定义
    const result = validateParameters(manifest.defaultParameters, parameters);
    
    if (!result.valid) {
      throw new Error(
        `Invalid default parameters:\n` +
        result.errors.map((e) => `  - ${e}`).join('\n')
      );
    }
  }
}

/**
 * 创建策略加载器
 */
export function createStrategyLoader(): StrategyLoader {
  return new SimpleStrategyLoader();
}

