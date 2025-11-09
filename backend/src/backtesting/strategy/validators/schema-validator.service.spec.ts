// backend/src/backtesting/strategy/validators/schema-validator.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { SchemaValidatorService } from './schema-validator.service';
import { FieldSchema } from './schema.types';

describe('SchemaValidatorService', () => {
  let service: SchemaValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaValidatorService],
    }).compile();

    service = module.get<SchemaValidatorService>(SchemaValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate', () => {
    it('should reject empty schema', () => {
      const result = service.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('SCHEMA_EMPTY');
    });

    it('should accept valid schema', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          desc: 'MA周期',
          type: 'number',
          component: 'number',
          defaultValue: 20,
          required: true,
          validator: {
            min: 1,
            max: 200,
            message: '周期必须在1-200之间',
          },
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          // missing type and component
        } as any,
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });

    it('should reject key mismatch', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'wrongKey',
          label: '周期',
          type: 'number',
          component: 'number',
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'KEY_MISMATCH')).toBe(true);
    });

    it('should reject type-component mismatch', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          type: 'number',
          component: 'checkbox', // number不能用checkbox
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'TYPE_COMPONENT_MISMATCH')).toBe(true);
    });

    it('should reject select without enumOptions', () => {
      const schema: Record<string, FieldSchema> = {
        strategy: {
          key: 'strategy',
          label: '策略类型',
          type: 'string',
          component: 'select',
          // missing enumOptions
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_ENUM_OPTIONS')).toBe(true);
    });

    it('should accept select with valid enumOptions', () => {
      const schema: Record<string, FieldSchema> = {
        strategy: {
          key: 'strategy',
          label: '策略类型',
          type: 'string',
          component: 'select',
          enumOptions: [
            { label: '趋势', value: 'trend' },
            { label: '均值回归', value: 'mean-reversion' },
          ],
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid validator range', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
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
      expect(result.errors.some((e) => e.code === 'INVALID_VALIDATOR_RANGE')).toBe(true);
    });

    it('should accept multiple valid fields', () => {
      const schema: Record<string, FieldSchema> = {
        period: {
          key: 'period',
          label: '周期',
          type: 'number',
          component: 'number',
          defaultValue: 20,
        },
        enabled: {
          key: 'enabled',
          label: '启用',
          type: 'boolean',
          component: 'checkbox',
          defaultValue: true,
        },
        strategy: {
          key: 'strategy',
          label: '策略类型',
          type: 'string',
          component: 'select',
          enumOptions: [
            { label: '趋势', value: 'trend' },
            { label: '均值回归', value: 'mean-reversion' },
          ],
        },
      };

      const result = service.validate(schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('parseSchemaFromScript', () => {
    it('should parse parameters and factors from script', async () => {
      const scriptCode = `
        exports.parameters = {
          period: {
            key: 'period',
            label: '周期',
            type: 'number',
            component: 'number',
            defaultValue: 20,
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

      const result = await service.parseSchemaFromScript(scriptCode);
      expect(result.parameters).toBeDefined();
      expect(result.parameters.period).toBeDefined();
      expect(result.factors).toBeDefined();
      expect(result.factors.ma).toBeDefined();
    });

    it('should handle script without exports', async () => {
      const scriptCode = `
        const x = 1;
      `;

      const result = await service.parseSchemaFromScript(scriptCode);
      expect(result.parameters).toEqual({});
      expect(result.factors).toEqual({});
    });

    it('should handle script errors', async () => {
      const scriptCode = `
        throw new Error('Script error');
      `;

      await expect(service.parseSchemaFromScript(scriptCode)).rejects.toThrow();
    });
  });
});

