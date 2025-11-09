import { Injectable } from '@nestjs/common';
import { Linter } from 'eslint';
import * as ts from 'typescript';
import * as tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import * as path from 'path';

export interface ScriptValidationMessage {
  type: 'typescript' | 'eslint';
  severity: 'error' | 'warning';
  message: string;
  line?: number;
  column?: number;
  ruleId?: string;
}

export interface ScriptValidationResult {
  errors: ScriptValidationMessage[];
  warnings: ScriptValidationMessage[];
}

const STRATEGY_FILE_NAME = 'strategy.ts';
const SDK_MODULE_NAME = '@platform/backtesting-sdk';
const SDK_ALT_MODULE_NAME = '@backtesting/sdk';
const SDK_DECLARATION_FILE =
  'node_modules/@platform/backtesting-sdk/index.d.ts';

// 新策略框架的模块路径
const STRATEGY_INTERFACES_FILE = './interfaces.d.ts';
const STRATEGY_UTILS_FILE = './utils.d.ts';

@Injectable()
export class StrategyScriptValidator {
  private readonly linter: Linter;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tsParser = require('@typescript-eslint/parser');
    this.linter = new Linter();
    this.linter.defineParser('@typescript-eslint/parser', tsParser);

    const pluginRules = (tsEslintPlugin.rules as Record<string, unknown>) ?? {};
    Object.entries(pluginRules).forEach(([ruleName, rule]) => {
      this.linter.defineRule(
        `@typescript-eslint/${ruleName}`,
        rule as any,
      );
    });
  }

  async validate(sourceCode: string): Promise<ScriptValidationResult> {
    // 预处理：替换路径别名
    const processedCode = this.preprocessImports(sourceCode);
    
    const tsResult = this.runTypeScriptDiagnostics(processedCode);
    const eslintResult = await this.runLintDiagnostics(processedCode);

    return {
      errors: [...tsResult.errors, ...eslintResult.errors],
      warnings: [...tsResult.warnings, ...eslintResult.warnings],
    };
  }

  /**
   * 预处理导入语句，替换路径别名
   * 与 compiler.service.ts 中的实现保持一致
   */
  private preprocessImports(code: string): string {
    // 替换 @/backtesting/strategy/ 为相对路径
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

  private runTypeScriptDiagnostics(
    sourceCode: string,
  ): ScriptValidationResult {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      strict: true,
      esModuleInterop: true,
      noEmit: true,
      skipLibCheck: true,
      allowSyntheticDefaultImports: true,
    };

    const files = new Map<string, string>([
      [STRATEGY_FILE_NAME, sourceCode],
      [
        SDK_DECLARATION_FILE,
        `
export interface StrategyContext {
  [key: string]: unknown;
}

export interface ParameterFactory {
  [key: string]: (...args: any[]) => Record<string, unknown>;
}

export interface FactorFactory {
  [key: string]: (...args: any[]) => Record<string, unknown>;
}

export interface StrategyDefinition {
  parameters?: Array<Record<string, unknown>>;
  factors?: Array<Record<string, unknown>>;
  run(ctx: StrategyContext): Promise<void> | void;
}

export declare function defineStrategy(
  definition: StrategyDefinition,
): StrategyDefinition;

export const parameter: ParameterFactory;
export const factor: FactorFactory;
`,
      ],
      [
        STRATEGY_INTERFACES_FILE,
        `
// 策略接口类型声明
export interface StrategyContext {
  strategyId: string;
  getParameters<T = any>(): T;
  getFeature(bar: any, featureId: string): any;
  getPosition(symbol: string): any;
  getPortfolio(): any;
  publishIntent(intent: any): void;
  log(level: string, message: string, meta?: any): void;
  metrics: {
    increment(name: string, value?: number, tags?: any): void;
    gauge(name: string, value: number, tags?: any): void;
  };
}

export interface MarketBarPayload {
  timestamp: string;
  symbol: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface StrategyLifecycle {
  onInit?(ctx: StrategyContext): void;
  onBar?(ctx: StrategyContext, bar: MarketBarPayload): void;
  onStop?(ctx: StrategyContext, reason: string): void;
  onError?(ctx: StrategyContext, error: Error): void;
}
`,
      ],
      [
        STRATEGY_UTILS_FILE,
        `
// 策略工具函数类型声明
export declare function defineParameters(params: Record<string, any>): Record<string, any>;
`,
      ],
    ]);

    const defaultHost = ts.createCompilerHost(compilerOptions, true);
    const defaultReadFile = defaultHost.readFile.bind(defaultHost);
    const defaultFileExists = defaultHost.fileExists.bind(defaultHost);
    const defaultGetSourceFile = defaultHost.getSourceFile?.bind(
      defaultHost,
    );

    const host: ts.CompilerHost = {
      ...defaultHost,
      getSourceFile: (
        fileName,
        languageVersion,
        onError,
        shouldCreateNewFile,
      ) => {
        if (files.has(fileName)) {
          return ts.createSourceFile(
            fileName,
            files.get(fileName)!,
            languageVersion,
            true,
          );
        }
        return defaultGetSourceFile
          ? defaultGetSourceFile(
              fileName,
              languageVersion,
              onError,
              shouldCreateNewFile,
            )
          : undefined;
      },
      readFile: (fileName) =>
        files.get(fileName) ?? defaultReadFile(fileName),
      fileExists: (fileName) =>
        files.has(fileName) || defaultFileExists(fileName),
      resolveModuleNames: (moduleNames, containingFile) =>
        moduleNames.map((moduleName) => {
          // 旧 SDK 模块
          if (
            moduleName === SDK_MODULE_NAME ||
            moduleName === SDK_ALT_MODULE_NAME
          ) {
            return {
              resolvedFileName: SDK_DECLARATION_FILE,
              extension: ts.Extension.Dts,
              isExternalLibraryImport: false,
            };
          }

          // 新策略框架模块
          if (moduleName === './interfaces') {
            return {
              resolvedFileName: STRATEGY_INTERFACES_FILE,
              extension: ts.Extension.Dts,
              isExternalLibraryImport: false,
            };
          }

          if (moduleName === './utils') {
            return {
              resolvedFileName: STRATEGY_UTILS_FILE,
              extension: ts.Extension.Dts,
              isExternalLibraryImport: false,
            };
          }

          const resolution = ts.resolveModuleName(
            moduleName,
            containingFile,
            compilerOptions,
            defaultHost,
          );
          return resolution.resolvedModule ?? {
            resolvedFileName: moduleName,
            extension: ts.Extension.Dts,
          };
        }),
      writeFile: () => undefined,
    };

    const program = ts.createProgram(
      [STRATEGY_FILE_NAME],
      compilerOptions,
      host,
    );

    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.category !== ts.DiagnosticCategory.Message);

    const result: ScriptValidationResult = {
      errors: [],
      warnings: [],
    };

    for (const diagnostic of diagnostics) {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      );
      const location = this.extractLocation(diagnostic);
      const payload: ScriptValidationMessage = {
        type: 'typescript',
        severity:
          diagnostic.category === ts.DiagnosticCategory.Error
            ? 'error'
            : 'warning',
        message,
        ...location,
      };
      if (payload.severity === 'error') {
        result.errors.push(payload);
      } else {
        result.warnings.push(payload);
      }
    }

    return result;
  }

  private async runLintDiagnostics(
    sourceCode: string,
  ): Promise<ScriptValidationResult> {
    const result: ScriptValidationResult = {
      errors: [],
      warnings: [],
    };

    const messages = this.linter.verify(
      sourceCode,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: 'module',
        },
        env: {
          es2021: true,
          node: true,
        },
        rules: {
          '@typescript-eslint/no-unused-vars': [
            'error',
            { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
          ],
          '@typescript-eslint/no-explicit-any': 'warn',
        },
      },
      STRATEGY_FILE_NAME,
    );

    for (const message of messages) {
      const payload: ScriptValidationMessage = {
        type: 'eslint',
        severity: message.severity === 2 ? 'error' : 'warning',
        message: message.message,
        line: message.line,
        column: message.column,
        ruleId: message.ruleId ?? undefined,
      };
      if (payload.severity === 'error') {
        result.errors.push(payload);
      } else {
        result.warnings.push(payload);
      }
    }

    return result;
  }

  private extractLocation(diagnostic: ts.Diagnostic) {
    if (diagnostic.file && typeof diagnostic.start === 'number') {
      const { line, character } =
        diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return {
        line: line + 1,
        column: character + 1,
      };
    }
    return {};
  }
}
