import { BadRequestException, Injectable } from '@nestjs/common';
import * as ts from 'typescript';
import { Script, createContext } from 'vm';

const DEFAULT_COMPONENT_MAP: Record<string, string> = {
  string: 'input',
  number: 'number',
  boolean: 'switch',
  enum: 'select',
};

type RawField = Record<string, any>;

interface ParsedField {
  key: string;
  label: string;
  desc?: string | null;
  type: string;
  component: string;
  defaultValue?: unknown;
  required?: boolean;
  validator?: unknown;
  enumOptions?: Array<{ label: string; value: unknown }>;
  uiProps?: Record<string, unknown>;
}

interface ParsedStrategySchema {
  parameters: ParsedField[];
  factors: ParsedField[];
}

@Injectable()
export class StrategyScriptParser {
  parse(sourceCode: string): ParsedStrategySchema {
    try {
      // 预处理：替换路径别名
      const processedCode = this.preprocessImports(sourceCode);
      
      const transpiled = ts.transpileModule(processedCode, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2019,
          module: ts.ModuleKind.CommonJS,
          isolatedModules: true,
          strict: false,
        },
      });

      const collected: {
        parameters: ParsedField[];
        factors: ParsedField[];
      } = {
        parameters: [],
        factors: [],
      };

      const sdkStub = this.createSdkStub(collected);

      const moduleExports: Record<string, any> = {};
      const context = createContext({
        exports: moduleExports,
        module: { exports: moduleExports },
        require: (moduleName: string) => {
          // 旧 SDK 模块
          if (
            moduleName === '@platform/backtesting-sdk' ||
            moduleName === '@backtesting/sdk'
          ) {
            return sdkStub;
          }
          // 新策略框架模块 (已经被预处理为相对路径)
          if (
            moduleName === './interfaces' ||
            moduleName === './utils' ||
            moduleName === './context'
          ) {
            return sdkStub; // 返回相同的 stub
          }
          throw new Error(
            `不允许在回测脚本中引用模块：${moduleName}`,
          );
        },
        console: {
          log: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
        setTimeout,
        clearTimeout,
      });

      const script = new Script(transpiled.outputText, {
        filename: 'strategy-script.js',
      });

      script.runInContext(context, { timeout: 3000 });

      const exported =
        (context.module?.exports as any) ??
        (context.exports as any);
      const resolved =
        exported?.default ?? exported?.strategy ?? exported;

      // 检查是否是新的策略框架格式 (有生命周期钩子)
      const isNewFormat = resolved && typeof resolved === 'object' && (
        typeof resolved.onInit === 'function' ||
        typeof resolved.onBar === 'function' ||
        typeof resolved.onStop === 'function'
      );

      // 检查是否是旧的策略框架格式 (有 run 函数)
      const isOldFormat = resolved && typeof resolved === 'object' && typeof resolved.run === 'function';

      if (!resolved || typeof resolved !== 'object' || (!isNewFormat && !isOldFormat)) {
        throw new Error(
          '策略脚本需要导出包含生命周期函数(onInit/onBar/onStop)或run函数的对象。',
        );
      }

      this.ensureUniqueKeys(collected.parameters, '自定义参数');
      this.ensureUniqueKeys(collected.factors, '自定义因子');

      return {
        parameters: collected.parameters,
        factors: collected.factors,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '脚本解析失败';
      console.error('[StrategyScriptParser] 解析失败:', error);
      throw new BadRequestException(message);
    }
  }

  /**
   * 预处理导入语句，替换路径别名
   * 与 compiler.service.ts 和 validator.ts 中的实现保持一致
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

  private createSdkStub(target: {
    parameters: ParsedField[];
    factors: ParsedField[];
  }) {
    const normalizeField = (
      raw: RawField,
      kind: 'parameter' | 'factor',
      defaultType: string,
    ): ParsedField => {
      if (!raw || typeof raw !== 'object') {
        throw new Error(`${kind} 定义必须是对象。`);
      }
      const key = `${raw.key ?? raw.id ?? ''}`.trim();
      if (!key) {
        throw new Error(`${kind} 定义缺少 key。`);
      }

      const label =
        typeof raw.label === 'string' && raw.label.trim().length > 0
          ? raw.label.trim()
          : key;
      const desc =
        typeof raw.desc === 'string'
          ? raw.desc
          : typeof raw.description === 'string'
          ? raw.description
          : null;
      const type =
        typeof raw.type === 'string' && raw.type.length > 0
          ? raw.type
          : defaultType;
      const component =
        typeof raw.component === 'string' && raw.component.length > 0
          ? raw.component
          : DEFAULT_COMPONENT_MAP[type] ??
            DEFAULT_COMPONENT_MAP[defaultType] ??
            'input';

      const enumOptionsRaw =
        raw.enumOptions ?? raw.options ?? raw.choices ?? null;
      const enumOptions = this.normalizeEnumOptions(enumOptionsRaw);

      const uiProps =
        typeof raw.uiProps === 'object' && raw.uiProps !== null
          ? raw.uiProps
          : undefined;

      return {
        key,
        label,
        desc,
        type,
        component,
        defaultValue: raw.defaultValue,
        required:
          typeof raw.required === 'boolean'
            ? raw.required
            : kind === 'parameter'
            ? true
            : false,
        validator: raw.validator,
        enumOptions,
        uiProps,
      };
    };

    const buildParameter =
      (type: string, defaultComponent: string) =>
      (key: string, options: RawField = {}) =>
        normalizeField(
          { ...options, key, type, component: options.component ?? defaultComponent },
          'parameter',
          type,
        );

    const buildFactor =
      (type: string, defaultComponent: string) =>
      (key: string, options: RawField = {}) =>
        normalizeField(
          { ...options, key, type, component: options.component ?? defaultComponent },
          'factor',
          type,
        );

    const parameterFactories = {
      string: buildParameter('string', 'input'),
      number: buildParameter('number', 'number'),
      boolean: buildParameter('boolean', 'switch'),
      enum: buildParameter('enum', 'select'),
      select: buildParameter('enum', 'select'),
    };

    const factorFactories = {
      string: buildFactor('string', 'input'),
      number: buildFactor('number', 'number'),
      boolean: buildFactor('boolean', 'switch'),
      enum: buildFactor('enum', 'select'),
      custom: buildFactor('custom', 'input'),
    };

    const defineStrategy = (config: Record<string, any>) => {
      if (!config || typeof config !== 'object') {
        throw new Error('defineStrategy 需要接收配置对象。');
      }
      const parameters: RawField[] = Array.isArray(config.parameters)
        ? config.parameters
        : [];
      const factors: RawField[] = Array.isArray(config.factors)
        ? config.factors
        : [];

      target.parameters = parameters.map((item) =>
        normalizeField(item, 'parameter', item?.type ?? 'string'),
      );
      target.factors = factors.map((item) =>
        normalizeField(item, 'factor', item?.type ?? 'number'),
      );

      return config;
    };

    // 新策略框架的 defineParameters 函数
    const defineParameters = (params: Record<string, any>) => {
      // 新格式的参数定义不需要收集到 target.parameters
      // 因为新格式使用不同的参数结构
      // 这里只是返回参数定义,不做收集
      return params;
    };

    return {
      // 旧格式
      defineStrategy,
      parameter: parameterFactories,
      factor: factorFactories,
      // 新格式
      defineParameters,
    };
  }

  private normalizeEnumOptions(input: any): Array<{ label: string; value: unknown }> | undefined {
    if (!input) {
      return undefined;
    }
    const arr = Array.isArray(input) ? input : [input];
    const result: Array<{ label: string; value: unknown }> = [];
    for (const item of arr) {
      if (item === undefined || item === null) {
        continue;
      }
      if (typeof item === 'object') {
        const label =
          typeof item.label === 'string'
            ? item.label
            : `${item.value ?? item.key ?? ''}`;
        const value =
          item.value !== undefined
            ? item.value
            : item.key !== undefined
            ? item.key
            : label;
        result.push({ label, value });
      } else {
        const value = item;
        result.push({ label: String(item), value });
      }
    }
    return result.length > 0 ? result : undefined;
  }

  private ensureUniqueKeys(fields: ParsedField[], name: string) {
    const set = new Set<string>();
    for (const field of fields) {
      if (set.has(field.key)) {
        throw new Error(`${name} 中存在重复 key：${field.key}`);
      }
      set.add(field.key);
    }
  }
}
