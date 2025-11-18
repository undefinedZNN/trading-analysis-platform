import { Injectable, Logger } from '@nestjs/common';
import { Script, createContext } from 'vm';

export interface LoadedDynamicStrategy {
  run: (ctx: Record<string, unknown>) => any;
  onInit?: (ctx: Record<string, unknown>) => any;
}

@Injectable()
export class DynamicStrategyExecutor {
  private readonly logger = new Logger(DynamicStrategyExecutor.name);

  load(compiledCode: string): LoadedDynamicStrategy {
    try {
      const moduleExports: Record<string, any> = {};
      const sandbox = {
        exports: moduleExports,
        module: { exports: moduleExports },
        require: (name: string) => this.resolveRequire(name),
        console,
        setTimeout,
        clearTimeout,
      };

      const context = createContext(sandbox);
      const script = new Script(compiledCode, {
        filename: 'dynamic-strategy.js',
        lineOffset: 0,
      });

      script.runInContext(context, { timeout: 3000 });

      const exported =
        (context.module?.exports as any) ??
        (context.exports as any);
      const resolved =
        exported?.default ?? exported?.strategy ?? exported;

      if (
        !resolved ||
        typeof resolved !== 'object' ||
        typeof resolved.run !== 'function'
      ) {
        throw new Error(
          '动态策略脚本需要导出包含 run(ctx) 方法的对象。',
        );
      }

      return resolved;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to load dynamic strategy: ${message}`,
      );
      throw error;
    }
  }

  private resolveRequire(moduleName: string) {
    if (
      moduleName === '@platform/backtesting-sdk' ||
      moduleName === '@backtesting/sdk'
    ) {
      return this.createSdkRuntime();
    }
    throw new Error(`回测脚本不支持引入模块：${moduleName}`);
  }

  private createSdkRuntime() {
    const defineStrategy = (config: Record<string, any>) => config;

    const buildFactory =
      (type: string) =>
      (key: string, options: Record<string, any> = {}) => ({
        key,
        type,
        ...options,
      });

    const parameter = {
      string: buildFactory('string'),
      number: buildFactory('number'),
      boolean: buildFactory('boolean'),
      select: buildFactory('select'),
      group: (label: string, fields: any[]) => ({ label, fields }),
    };

    const factor = {
      number: buildFactory('number'),
      custom: buildFactory('custom'),
    };

    return {
      defineStrategy,
      parameter,
      factor,
    };
  }
}
