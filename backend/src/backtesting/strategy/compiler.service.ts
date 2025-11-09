/**
 * 策略编译服务
 * 
 * 负责编译策略脚本，处理路径别名和 TypeScript 转译
 */

import * as ts from 'typescript';
import * as path from 'path';
import * as vm from 'vm';

export interface CompileOptions {
  /**
   * 是否启用严格模式
   */
  strict?: boolean;

  /**
   * 超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 是否保留注释
   */
  removeComments?: boolean;
}

export interface CompileResult {
  /**
   * 是否编译成功
   */
  success: boolean;

  /**
   * 编译后的 JavaScript 代码
   */
  code?: string;

  /**
   * 编译后的模块导出
   */
  exports?: any;

  /**
   * 错误信息
   */
  errors?: string[];

  /**
   * 警告信息
   */
  warnings?: string[];
}

/**
 * 策略编译服务
 */
export class StrategyCompilerService {
  private readonly baseDir: string;
  private readonly compilerOptions: ts.CompilerOptions;

  constructor() {
    // 设置基础目录为 backend/src
    this.baseDir = path.resolve(__dirname, '../..');

    // 配置 TypeScript 编译选项
    this.compilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: false,
      skipLibCheck: true,
      noEmit: false,
      declaration: false,
      removeComments: false,
      sourceMap: false,
      // 配置路径映射
      baseUrl: this.baseDir,
      paths: {
        '@/*': ['*'],
        '@backtesting/*': ['backtesting/*'],
        '@config/*': ['config/*'],
        '@modules/*': ['modules/*'],
        '@common/*': ['common/*'],
      },
    };
  }

  /**
   * 编译策略脚本
   * @param scriptContent 策略脚本内容
   * @param options 编译选项
   */
  async compile(
    scriptContent: string,
    options: CompileOptions = {}
  ): Promise<CompileResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. 预处理：替换路径别名为相对路径
      const processedCode = this.preprocessImports(scriptContent);

      // 2. 使用 TypeScript 编译
      const jsCode = this.transpileTypeScript(processedCode, errors);

      if (errors.length > 0) {
        return {
          success: false,
          errors,
          warnings,
        };
      }

      // 3. 在沙箱中执行并获取导出
      const exports = this.executeInSandbox(
        jsCode,
        options.timeout || 5000
      );

      return {
        success: true,
        code: jsCode,
        exports,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : String(error)
      );
      return {
        success: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * 预处理导入语句，替换路径别名
   * @param code 原始代码
   * @private
   */
  private preprocessImports(code: string): string {
    // 替换 @/backtesting/strategy/ 为相对路径
    // 注意：这里假设策略脚本会在 strategy 目录下执行
    let processed = code;

    // 替换导入语句中的路径别名
    const importRegex = /from\s+['"](@\/[^'"]+)['"]/g;
    processed = processed.replace(importRegex, (match, importPath) => {
      // @/backtesting/strategy/interfaces -> ./interfaces
      if (importPath.startsWith('@/backtesting/strategy/')) {
        const relativePath = './' + importPath.replace('@/backtesting/strategy/', '');
        return match.replace(importPath, relativePath);
      }
      // @/backtesting/ -> ../
      if (importPath.startsWith('@/backtesting/')) {
        const relativePath = '../' + importPath.replace('@/backtesting/', '');
        return match.replace(importPath, relativePath);
      }
      // @/ -> ../../
      if (importPath.startsWith('@/')) {
        const relativePath = '../../' + importPath.replace('@/', '');
        return match.replace(importPath, relativePath);
      }
      return match;
    });

    return processed;
  }

  /**
   * 使用 TypeScript 编译器转译代码
   * @param code TypeScript 代码
   * @param errors 错误收集数组
   * @private
   */
  private transpileTypeScript(code: string, errors: string[]): string {
    try {
      // 使用 transpileModule 进行快速转译
      const result = ts.transpileModule(code, {
        compilerOptions: this.compilerOptions,
        reportDiagnostics: true,
      });

      // 收集诊断信息
      if (result.diagnostics && result.diagnostics.length > 0) {
        result.diagnostics.forEach((diagnostic) => {
          const message = ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            '\n'
          );
          
          if (diagnostic.category === ts.DiagnosticCategory.Error) {
            errors.push(`TS${diagnostic.code}: ${message}`);
          }
        });
      }

      return result.outputText;
    } catch (error) {
      errors.push(
        `TypeScript compilation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return '';
    }
  }

  /**
   * 在沙箱环境中执行代码
   * @param code JavaScript 代码
   * @param timeout 超时时间（毫秒）
   * @private
   */
  private executeInSandbox(code: string, timeout: number): any {
    // 创建模块上下文
    const moduleExports = {};
    const moduleObject = {
      exports: moduleExports,
    };

    // 创建沙箱上下文
    const sandbox = {
      module: moduleObject,
      exports: moduleExports,
      require: this.createRequireFunction(),
      console: console, // 允许使用 console
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
      Date: Date,
      Math: Math,
      JSON: JSON,
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      Error: Error,
      TypeError: TypeError,
      RangeError: RangeError,
      // 禁止访问的全局对象
      process: undefined,
      global: undefined,
      __dirname: undefined,
      __filename: undefined,
    };

    try {
      // 在沙箱中执行代码
      vm.runInNewContext(code, sandbox, {
        timeout,
        displayErrors: true,
      });

      // 返回导出的内容
      return moduleObject.exports;
    } catch (error) {
      throw new Error(
        `Script execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 创建受限的 require 函数
   * @private
   */
  private createRequireFunction(): (moduleName: string) => any {
    return (moduleName: string) => {
      // 只允许导入策略相关的模块
      const allowedModules = [
        './interfaces',
        './utils',
        './context',
        '../strategy/interfaces',
        '../strategy/utils',
        '../strategy/context',
      ];

      if (allowedModules.includes(moduleName)) {
        try {
          // 解析相对路径
          const modulePath = path.resolve(__dirname, moduleName);
          return require(modulePath);
        } catch (error) {
          throw new Error(`Failed to load module: ${moduleName}`);
        }
      }

      throw new Error(
        `Module "${moduleName}" is not allowed. ` +
        `Only strategy-related modules can be imported.`
      );
    };
  }

  /**
   * 验证编译后的策略导出
   * @param exports 导出对象
   */
  validateExports(exports: any): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 检查 default 导出
    if (!exports.default) {
      errors.push('Strategy must have a default export');
    } else if (typeof exports.default !== 'object') {
      errors.push('Default export must be an object (StrategyLifecycle)');
    }

    // 检查 parameters 导出（可选）
    if (exports.parameters && typeof exports.parameters !== 'object') {
      errors.push('Parameters export must be an object');
    }

    // 检查生命周期函数
    if (exports.default) {
      const lifecycle = exports.default;
      const requiredHooks = ['onBar', 'onInit'];
      const hasRequiredHook = requiredHooks.some(
        (hook) => typeof lifecycle[hook] === 'function'
      );

      if (!hasRequiredHook) {
        errors.push(
          'Strategy must implement at least one of: onBar, onInit'
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * 创建策略编译服务实例
 */
export function createCompilerService(): StrategyCompilerService {
  return new StrategyCompilerService();
}

