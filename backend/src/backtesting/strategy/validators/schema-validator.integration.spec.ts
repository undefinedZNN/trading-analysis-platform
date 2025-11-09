// backend/src/backtesting/strategy/validators/schema-validator.integration.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { SchemaValidatorService } from './schema-validator.service';
import { FieldSchema } from './schema.types';

describe('SchemaValidatorService Integration Tests', () => {
  let service: SchemaValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaValidatorService],
    }).compile();

    service = module.get<SchemaValidatorService>(SchemaValidatorService);
  });

  describe('Real-world Schema Examples', () => {
    it('should validate MA crossover strategy parameters', () => {
      const schema: Record<string, FieldSchema> = {
        fastPeriod: {
          key: 'fastPeriod',
          label: '快线周期',
          desc: '快速移动平均线的周期',
          type: 'number',
          component: 'number',
          defaultValue: 5,
          required: true,
          validator: {
            min: 1,
            max: 50,
            message: '快线周期必须在1-50之间',
          },
        },
        slowPeriod: {
          key: 'slowPeriod',
          label: '慢线周期',
          desc: '慢速移动平均线的周期',
          type: 'number',
          component: 'number',
          defaultValue: 20,
          required: true,
          validator: {
            min: 2,
            max: 200,
            message: '慢线周期必须在2-200之间',
          },
        },
        maType: {
          key: 'maType',
          label: 'MA类型',
          desc: '移动平均线的计算方式',
          type: 'string',
          component: 'select',
          defaultValue: 'SMA',
          enumOptions: [
            { label: '简单移动平均(SMA)', value: 'SMA' },
            { label: '指数移动平均(EMA)', value: 'EMA' },
            { label: '加权移动平均(WMA)', value: 'WMA' },
          ],
        },
        enableStopLoss: {
          key: 'enableStopLoss',
          label: '启用止损',
          type: 'boolean',
          component: 'checkbox',
          defaultValue: true,
        },
        stopLossPercent: {
          key: 'stopLossPercent',
          label: '止损百分比',
          desc: '止损触发的百分比',
          type: 'number',
          component: 'range',
          defaultValue: 2,
          validator: {
            min: 0.1,
            max: 10,
            message: '止损百分比必须在0.1%-10%之间',
          },
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate factor schema with multiple types', () => {
      const schema: Record<string, FieldSchema> = {
        ma5: {
          key: 'ma5',
          label: 'MA5',
          desc: '5日移动平均',
          type: 'number',
          component: 'number',
        },
        ma20: {
          key: 'ma20',
          label: 'MA20',
          desc: '20日移动平均',
          type: 'number',
          component: 'number',
        },
        volume: {
          key: 'volume',
          label: '成交量',
          type: 'number',
          component: 'number',
        },
        trend: {
          key: 'trend',
          label: '趋势方向',
          desc: '当前趋势方向：上涨/下跌/震荡',
          type: 'string',
          component: 'select',
          enumOptions: [
            { label: '上涨', value: 'up' },
            { label: '下跌', value: 'down' },
            { label: '震荡', value: 'sideways' },
          ],
        },
        isGoldenCross: {
          key: 'isGoldenCross',
          label: '金叉信号',
          desc: '是否出现金叉',
          type: 'boolean',
          component: 'checkbox',
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid real-world schema', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'wrongKey', // key不匹配
          label: '周期',
          type: 'number',
          component: 'number',
        },
        strategy: {
          key: 'strategy',
          label: '策略类型',
          type: 'string',
          component: 'select',
          // 缺少enumOptions
        },
        threshold: {
          key: 'threshold',
          label: '阈值',
          type: 'number',
          component: 'number',
          validator: {
            min: 100,
            max: 10, // min > max
          },
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // 检查所有错误类型
      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain('KEY_MISMATCH');
      expect(errorCodes).toContain('MISSING_ENUM_OPTIONS');
      expect(errorCodes).toContain('INVALID_VALIDATOR_RANGE');
    });
  });

  describe('parseSchemaFromScript Integration', () => {
    it('should parse complete strategy script', async () => {
      const scriptCode = `
        // 策略参数定义
        exports.parameters = {
          fastPeriod: {
            key: 'fastPeriod',
            label: '快线周期',
            type: 'number',
            component: 'number',
            defaultValue: 5,
            validator: { min: 1, max: 50 },
          },
          slowPeriod: {
            key: 'slowPeriod',
            label: '慢线周期',
            type: 'number',
            component: 'number',
            defaultValue: 20,
            validator: { min: 2, max: 200 },
          },
        };
        
        // 因子定义
        exports.factors = {
          ma_fast: {
            key: 'ma_fast',
            label: '快线MA',
            type: 'number',
            component: 'number',
          },
          ma_slow: {
            key: 'ma_slow',
            label: '慢线MA',
            type: 'number',
            component: 'number',
          },
          signal: {
            key: 'signal',
            label: '交易信号',
            type: 'string',
            component: 'select',
            enumOptions: [
              { label: '买入', value: 'buy' },
              { label: '卖出', value: 'sell' },
              { label: '持有', value: 'hold' },
            ],
          },
        };
      `;

      const result = await service.parseSchemaFromScript(scriptCode);
      
      // 验证参数
      expect(result.parameters).toBeDefined();
      expect(Object.keys(result.parameters)).toHaveLength(2);
      expect(result.parameters.fastPeriod).toBeDefined();
      expect(result.parameters.slowPeriod).toBeDefined();
      
      // 验证因子
      expect(result.factors).toBeDefined();
      expect(Object.keys(result.factors)).toHaveLength(3);
      expect(result.factors.ma_fast).toBeDefined();
      expect(result.factors.ma_slow).toBeDefined();
      expect(result.factors.signal).toBeDefined();
      
      // 验证解析出的schema是否有效
      const paramValidation = service.validate(result.parameters);
      expect(paramValidation.valid).toBe(true);
      
      const factorValidation = service.validate(result.factors);
      expect(factorValidation.valid).toBe(true);
    });

    it('should handle complex nested schema', async () => {
      const scriptCode = `
        exports.parameters = {
          riskManagement: {
            key: 'riskManagement',
            label: '风险管理',
            type: 'object',
            component: 'input',
            defaultValue: {
              maxDrawdown: 0.1,
              maxPositionSize: 0.2,
            },
          },
          tradingHours: {
            key: 'tradingHours',
            label: '交易时段',
            type: 'array',
            component: 'select',
            enumOptions: [
              { label: '早盘', value: 'morning' },
              { label: '午盘', value: 'afternoon' },
              { label: '尾盘', value: 'closing' },
            ],
          },
        };
        
        exports.factors = {};
      `;

      const result = await service.parseSchemaFromScript(scriptCode);
      expect(result.parameters.riskManagement).toBeDefined();
      expect(result.parameters.tradingHours).toBeDefined();
    });

    it('should handle script with syntax errors gracefully', async () => {
      const scriptCode = `
        exports.parameters = {
          period: {
            key: 'period',
            label: '周期',
            type: 'number',
            component: 'number',
          }
        }; // 缺少逗号
        
        this is invalid syntax
      `;

      await expect(service.parseSchemaFromScript(scriptCode)).rejects.toThrow();
    });

    it('should timeout on infinite loop scripts', async () => {
      const scriptCode = `
        while(true) {
          // infinite loop
        }
        exports.parameters = {};
        exports.factors = {};
      `;

      await expect(service.parseSchemaFromScript(scriptCode)).rejects.toThrow();
    }, 5000); // 5秒超时
  });

  describe('End-to-End Workflow', () => {
    it('should validate complete strategy workflow', async () => {
      // 1. 解析脚本
      const scriptCode = `
        exports.parameters = {
          period: {
            key: 'period',
            label: '周期',
            type: 'number',
            component: 'number',
            defaultValue: 20,
            validator: { min: 1, max: 200 },
          },
        };
        
        exports.factors = {
          ma: {
            key: 'ma',
            label: '移动平均',
            type: 'number',
            component: 'number',
          },
        };
      `;

      const parsed = await service.parseSchemaFromScript(scriptCode);
      
      // 2. 校验参数schema
      const paramResult = service.validate(parsed.parameters);
      expect(paramResult.valid).toBe(true);
      
      // 3. 校验因子schema
      const factorResult = service.validate(parsed.factors);
      expect(factorResult.valid).toBe(true);
      
      // 4. 验证可以正确访问schema属性
      expect(parsed.parameters.period.defaultValue).toBe(20);
      expect(parsed.parameters.period.validator.min).toBe(1);
      expect(parsed.factors.ma.label).toBe('移动平均');
    });
  });
});

