// backend/src/backtesting/strategy/validators/eslint-checker.service.ts

import { Injectable } from '@nestjs/common';
import { ESLint } from 'eslint';
import {
  ESLintCheckResult,
  ESLintError,
  ESLintCheckerOptions,
} from './eslint-checker.types';

@Injectable()
export class ESLintCheckerService {
  private eslint: ESLint;

  constructor() {
    // 创建ESLint实例
    this.eslint = new ESLint({
      overrideConfigFile: null,
      overrideConfig: this.getDefaultConfig(),
    });
  }

  /**
   * 检查代码的规范性
   */
  async check(
    code: string,
    options?: ESLintCheckerOptions,
  ): Promise<ESLintCheckResult> {
    const startTime = Date.now();

    try {
      // 如果有自定义选项，创建新的ESLint实例
      const eslint = options
        ? new ESLint({
            overrideConfigFile: null,
            overrideConfig: this.mergeConfig(options),
          })
        : this.eslint;

      // 执行lint
      const results = await eslint.lintText(code, {
        filePath: 'strategy.ts',
      });

      // 格式化结果
      const errors: ESLintError[] = [];
      const warnings: ESLintError[] = [];
      let fixableErrorCount = 0;
      let fixableWarningCount = 0;

      if (results.length > 0) {
        const result = results[0];

        for (const message of result.messages) {
          const error: ESLintError = {
            line: message.line,
            column: message.column,
            endLine: message.endLine,
            endColumn: message.endColumn,
            message: message.message,
            ruleId: message.ruleId,
            severity: message.severity === 2 ? 'error' : 'warning',
            fixable: message.fix !== undefined,
          };

          if (error.severity === 'error') {
            errors.push(error);
            if (error.fixable) {
              fixableErrorCount++;
            }
          } else {
            warnings.push(error);
            if (error.fixable) {
              fixableWarningCount++;
            }
          }
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        fixableErrorCount,
        fixableWarningCount,
        executionTime,
      };
    } catch (error) {
      throw new Error(`ESLint检查失败: ${error.message}`);
    }
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): any {
    return {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: null, // 不使用tsconfig
      },
      plugins: ['@typescript-eslint'],
      env: {
        es2020: true,
        node: true,
      },
      rules: {
        // 变量相关
        'no-unused-vars': 'off', // 关闭JS规则
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
          },
        ],
        'no-undef': 'error',

        // 代码质量
        'no-console': 'warn',
        'no-debugger': 'error',
        'no-alert': 'error',

        // TypeScript特定
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-inferrable-types': 'warn',

        // 最佳实践
        eqeqeq: ['error', 'always'],
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',

        // 代码风格
        semi: ['error', 'always'],
        quotes: ['error', 'single', { avoidEscape: true }],
        indent: ['error', 2, { SwitchCase: 1 }],
        'comma-dangle': ['error', 'always-multiline'],
        'no-trailing-spaces': 'error',
        'eol-last': ['error', 'always'],
      },
    };
  }

  /**
   * 合并配置
   */
  private mergeConfig(options: ESLintCheckerOptions): any {
    const defaultConfig = this.getDefaultConfig();

    return {
      ...defaultConfig,
      env: {
        ...defaultConfig.env,
        ...options.env,
      },
      globals: options.globals,
      rules: {
        ...defaultConfig.rules,
        ...options.rules,
      },
    };
  }
}

