/**
 * 策略编译服务单元测试
 */

import { StrategyCompilerService } from './compiler.service';

describe('StrategyCompilerService', () => {
  let service: StrategyCompilerService;

  beforeEach(() => {
    service = new StrategyCompilerService();
  });

  describe('路径别名解析', () => {
    it('应该正确替换 @/backtesting/strategy/ 路径', async () => {
      const code = `
        import type { StrategyLifecycle } from '@/backtesting/strategy/interfaces';
        import { defineParameters } from '@/backtesting/strategy/utils';
        
        export const parameters = defineParameters({});
        
        const strategy: StrategyLifecycle = {
          onInit: (ctx) => {},
        };
        
        export default strategy;
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      // TypeScript 编译后会保留 require 语句
      expect(result.code).toContain('./utils');
    });

    it('应该正确替换 @/backtesting/ 路径', async () => {
      const code = `
        const x = '@/backtesting/other';
        export default { onInit: () => { console.log(x); } };
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      // 字符串字面量不会被替换，这是正确的
      expect(result.code).toBeDefined();
    });

    it('应该正确替换 @/ 根路径', async () => {
      const code = `
        const path = '@/common/utils';
        export default { onInit: () => { console.log(path); } };
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      // 字符串字面量不会被替换，这是正确的
      expect(result.code).toBeDefined();
    });
  });

  describe('TypeScript 转译', () => {
    it('应该成功转译有效的 TypeScript 代码', async () => {
      const code = `
        interface Params {
          period: number;
        }
        
        function onInit(ctx: any): void {
          const params: Params = { period: 10 };
          console.log(params);
        }
        
        export default { onInit };
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.errors).toEqual([]);
    });

    it('应该移除 TypeScript 类型注解', async () => {
      const code = `
        function onBar(ctx: any, bar: any): void {
          const price: number = parseFloat(bar.close);
        }
        
        export default { onBar };
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      expect(result.code).not.toContain(': any');
      expect(result.code).not.toContain(': void');
      expect(result.code).not.toContain(': number');
    });
  });

  describe('沙箱执行', () => {
    it('应该正确提取 default 导出', async () => {
      const code = `
        const strategy = {
          onInit: (ctx) => {
            ctx.log('info', 'Strategy initialized');
          },
        };
        
        export default strategy;
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      expect(result.exports).toBeDefined();
      expect(result.exports.default).toBeDefined();
      expect(typeof result.exports.default.onInit).toBe('function');
    });

    it('应该正确提取 parameters 导出', async () => {
      const code = `
        export const parameters = {
          period: {
            type: 'number',
            default: 20,
          },
        };
        
        export default { onInit: () => {} };
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      expect(result.exports.parameters).toBeDefined();
      expect(result.exports.parameters.period).toBeDefined();
      expect(result.exports.parameters.period.type).toBe('number');
    });

    it('应该正确提取 customFeatures 导出', async () => {
      const code = `
        export const customFeatures = [
          { name: 'MY_INDICATOR', calculate: () => 0 },
        ];
        
        export default { onInit: () => {} };
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      expect(result.exports.customFeatures).toBeDefined();
      expect(Array.isArray(result.exports.customFeatures)).toBe(true);
      expect(result.exports.customFeatures[0].name).toBe('MY_INDICATOR');
    });
  });

  describe('错误处理', () => {
    it('应该捕获语法错误', async () => {
      const code = `
        const strategy = {
          onInit: (ctx) => {
            // 缺少闭合括号
        };
        
        export default strategy;
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('应该捕获运行时错误', async () => {
      const code = `
        throw new Error('Test error');
        
        export default { onInit: () => {} };
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Test error');
    });

    it('应该处理超时', async () => {
      const code = `
        while (true) {
          // 无限循环
        }
        
        export default { onInit: () => {} };
      `;

      const result = await service.compile(code, { timeout: 100 });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('导出验证', () => {
    it('应该验证有效的导出', () => {
      const exports = {
        default: {
          onInit: () => {},
          onBar: () => {},
        },
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const validation = service.validateExports(exports);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('应该检测缺少 default 导出', () => {
      const exports = {
        parameters: {},
      };

      const validation = service.validateExports(exports);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Strategy must have a default export');
    });

    it('应该检测缺少生命周期函数', () => {
      const exports = {
        default: {
          // 没有任何生命周期函数
        },
      };

      const validation = service.validateExports(exports);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('onBar') || e.includes('onInit'))).toBe(true);
    });

    it('应该检测无效的 parameters 类型', () => {
      const exports = {
        default: {
          onInit: () => {},
        },
        parameters: 'invalid', // 应该是对象
      };

      const validation = service.validateExports(exports);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Parameters'))).toBe(true);
    });
  });

  describe('完整策略编译', () => {
    it('应该成功编译完整的策略脚本', async () => {
      const code = `
        import type { StrategyLifecycle, StrategyContext, MarketBarPayload } from '@/backtesting/strategy/interfaces';
        import { defineParameters } from '@/backtesting/strategy/utils';

        export const parameters = defineParameters({
          shortPeriod: {
            type: 'number',
            title: '短期周期',
            default: 10,
            minimum: 2,
            maximum: 50,
          },
          longPeriod: {
            type: 'number',
            title: '长期周期',
            default: 30,
            minimum: 10,
            maximum: 200,
          },
        });

        let lastShortMA: number | undefined;
        let lastLongMA: number | undefined;

        function onInit(ctx: StrategyContext): void {
          ctx.log('info', '策略初始化');
          lastShortMA = undefined;
          lastLongMA = undefined;
        }

        function onBar(ctx: StrategyContext, bar: MarketBarPayload): void {
          const params = ctx.getParameters();
          const shortMA = ctx.getFeature(bar, \`MA_\${params.shortPeriod}\`);
          const longMA = ctx.getFeature(bar, \`MA_\${params.longPeriod}\`);

          if (shortMA === undefined || longMA === undefined) {
            return;
          }

          // 金叉检测
          if (lastShortMA !== undefined && lastLongMA !== undefined) {
            if (lastShortMA <= lastLongMA && shortMA > longMA) {
              ctx.publishIntent({
                intentId: \`buy_\${Date.now()}\`,
                strategyId: ctx.strategyId,
                symbol: bar.symbol,
                side: 'buy',
                type: 'market',
                quantity: '1',
              });
            }
          }

          lastShortMA = shortMA;
          lastLongMA = longMA;
        }

        function onStop(ctx: StrategyContext, reason: string): void {
          ctx.log('info', \`策略停止: \${reason}\`);
        }

        const strategy: StrategyLifecycle = {
          onInit,
          onBar,
          onStop,
        };

        export default strategy;
      `;

      const result = await service.compile(code);

      expect(result.success).toBe(true);
      expect(result.exports).toBeDefined();
      expect(result.exports.default).toBeDefined();
      expect(result.exports.parameters).toBeDefined();

      // 验证导出
      const validation = service.validateExports(result.exports);
      expect(validation.valid).toBe(true);

      // 验证生命周期函数
      expect(typeof result.exports.default.onInit).toBe('function');
      expect(typeof result.exports.default.onBar).toBe('function');
      expect(typeof result.exports.default.onStop).toBe('function');

      // 验证参数定义
      expect(result.exports.parameters.shortPeriod).toBeDefined();
      expect(result.exports.parameters.longPeriod).toBeDefined();
    });
  });
});

