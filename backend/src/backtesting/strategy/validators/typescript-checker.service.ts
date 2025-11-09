// backend/src/backtesting/strategy/validators/typescript-checker.service.ts

import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';
import {
  TypeScriptCheckResult,
  TypeScriptError,
  TypeScriptCheckerOptions,
} from './typescript-checker.types';

@Injectable()
export class TypeScriptCheckerService {
  private readonly defaultOptions: TypeScriptCheckerOptions = {
    timeout: 3000,
    strict: true,
    target: 'ES2020',
    lib: ['ES2020'],
  };

  /**
   * 检查TypeScript代码的类型正确性
   */
  async check(
    code: string,
    options?: TypeScriptCheckerOptions,
  ): Promise<TypeScriptCheckResult> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    try {
      // 使用Promise.race实现超时控制
      const result = await Promise.race([
        this.performCheck(code, opts),
        this.createTimeoutPromise(opts.timeout),
      ]);

      const executionTime = Date.now() - startTime;
      return { ...result, executionTime };
    } catch (error) {
      if (error.message === 'TypeScript check timeout') {
        throw new Error(`类型检查超时（>${opts.timeout}ms）`);
      }
      throw error;
    }
  }

  /**
   * 执行实际的类型检查
   */
  private async performCheck(
    code: string,
    options: TypeScriptCheckerOptions,
  ): Promise<Omit<TypeScriptCheckResult, 'executionTime'>> {
    // 创建虚拟文件名
    const fileName = 'strategy.ts';

    // 配置编译选项
    const compilerOptions: ts.CompilerOptions = {
      target: this.getScriptTarget(options.target),
      module: ts.ModuleKind.CommonJS,
      strict: options.strict,
      noImplicitAny: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      strictBindCallApply: true,
      strictPropertyInitialization: true,
      noImplicitThis: true,
      alwaysStrict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      lib: options.lib.map((lib) => `lib.${lib.toLowerCase()}.d.ts`),
    };

    // 创建虚拟文件系统
    const host = this.createCompilerHost(code, fileName, compilerOptions);

    // 创建Program
    const program = ts.createProgram([fileName], compilerOptions, host);

    // 获取诊断信息
    const diagnostics = [
      ...program.getSyntacticDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getDeclarationDiagnostics(),
    ];

    // 格式化诊断信息
    const errors: TypeScriptError[] = [];
    const warnings: TypeScriptError[] = [];

    for (const diagnostic of diagnostics) {
      const formatted = this.formatDiagnostic(diagnostic, fileName);
      if (formatted.category === 'error') {
        errors.push(formatted);
      } else if (formatted.category === 'warning') {
        warnings.push(formatted);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 创建虚拟编译器主机
   */
  private createCompilerHost(
    code: string,
    fileName: string,
    options: ts.CompilerOptions,
  ): ts.CompilerHost {
    const host = ts.createCompilerHost(options);

    // 重写文件读取方法
    const originalGetSourceFile = host.getSourceFile;
    host.getSourceFile = (
      name: string,
      languageVersion: ts.ScriptTarget,
      onError?: (message: string) => void,
      shouldCreateNewSourceFile?: boolean,
    ) => {
      // 如果是我们的虚拟文件，返回代码内容
      if (name === fileName) {
        return ts.createSourceFile(name, code, languageVersion, true);
      }
      // 否则使用默认行为（读取lib文件等）
      return originalGetSourceFile(
        name,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
    };

    // 重写文件存在检查
    const originalFileExists = host.fileExists;
    host.fileExists = (name: string) => {
      if (name === fileName) {
        return true;
      }
      return originalFileExists ? originalFileExists(name) : false;
    };

    // 重写文件读取
    const originalReadFile = host.readFile;
    host.readFile = (name: string) => {
      if (name === fileName) {
        return code;
      }
      return originalReadFile ? originalReadFile(name) : undefined;
    };

    return host;
  }

  /**
   * 格式化诊断信息
   */
  private formatDiagnostic(
    diagnostic: ts.Diagnostic,
    fileName: string,
  ): TypeScriptError {
    let line = 0;
    let column = 0;
    let length = 0;

    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line: l, character: c } =
        diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      line = l + 1; // TypeScript从0开始，我们从1开始
      column = c + 1;
      length = diagnostic.length || 0;
    }

    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    );

    return {
      line,
      column,
      message,
      code: diagnostic.code,
      category: this.getCategoryName(diagnostic.category),
      file: diagnostic.file?.fileName === fileName ? fileName : undefined,
      length,
    };
  }

  /**
   * 获取类别名称
   */
  private getCategoryName(
    category: ts.DiagnosticCategory,
  ): 'error' | 'warning' | 'suggestion' | 'message' {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return 'error';
      case ts.DiagnosticCategory.Warning:
        return 'warning';
      case ts.DiagnosticCategory.Suggestion:
        return 'suggestion';
      case ts.DiagnosticCategory.Message:
        return 'message';
      default:
        return 'error';
    }
  }

  /**
   * 获取脚本目标
   */
  private getScriptTarget(target: string): ts.ScriptTarget {
    const targetMap: Record<string, ts.ScriptTarget> = {
      ES3: ts.ScriptTarget.ES3,
      ES5: ts.ScriptTarget.ES5,
      ES2015: ts.ScriptTarget.ES2015,
      ES2016: ts.ScriptTarget.ES2016,
      ES2017: ts.ScriptTarget.ES2017,
      ES2018: ts.ScriptTarget.ES2018,
      ES2019: ts.ScriptTarget.ES2019,
      ES2020: ts.ScriptTarget.ES2020,
      ES2021: ts.ScriptTarget.ES2021,
      ES2022: ts.ScriptTarget.ES2022,
      ESNext: ts.ScriptTarget.ESNext,
    };
    return targetMap[target] || ts.ScriptTarget.ES2020;
  }

  /**
   * 创建超时Promise
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('TypeScript check timeout'));
      }, timeout);
    });
  }
}

