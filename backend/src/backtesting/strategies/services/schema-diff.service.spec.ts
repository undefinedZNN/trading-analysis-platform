/**
 * SchemaDiffService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SchemaDiffService } from './schema-diff.service';
import { DiffType } from '../dto/version-compare.dto';

describe('SchemaDiffService', () => {
  let service: SchemaDiffService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaDiffService],
    }).compile();

    service = module.get<SchemaDiffService>(SchemaDiffService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('compareSchemas', () => {
    it('should detect no changes for identical schemas', () => {
      const schema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
        factors: {
          ma: { type: 'number' },
        },
      };

      const result = service.compareSchemas(schema, schema);

      expect(result.parameters.added).toHaveLength(0);
      expect(result.parameters.removed).toHaveLength(0);
      expect(result.parameters.modified).toHaveLength(0);
      expect(result.factors.added).toHaveLength(0);
      expect(result.factors.removed).toHaveLength(0);
      expect(result.factors.modified).toHaveLength(0);
    });

    it('should detect added parameters', () => {
      const sourceSchema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const targetSchema = {
        parameters: {
          period: { type: 'number', default: 10 },
          threshold: { type: 'number', default: 0.5 },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);

      expect(result.parameters.added).toHaveLength(1);
      expect(result.parameters.added[0].fieldName).toBe('threshold');
      expect(result.parameters.added[0].type).toBe(DiffType.ADDED);
    });

    it('should detect removed parameters', () => {
      const sourceSchema = {
        parameters: {
          period: { type: 'number', default: 10 },
          threshold: { type: 'number', default: 0.5 },
        },
      };

      const targetSchema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);

      expect(result.parameters.removed).toHaveLength(1);
      expect(result.parameters.removed[0].fieldName).toBe('threshold');
      expect(result.parameters.removed[0].type).toBe(DiffType.REMOVED);
    });

    it('should detect modified parameters', () => {
      const sourceSchema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const targetSchema = {
        parameters: {
          period: { type: 'number', default: 20 },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);

      expect(result.parameters.modified).toHaveLength(1);
      expect(result.parameters.modified[0].fieldName).toBe('period');
      expect(result.parameters.modified[0].type).toBe(DiffType.MODIFIED);
    });

    it('should detect added factors', () => {
      const sourceSchema = {
        factors: {
          ma: { type: 'number' },
        },
      };

      const targetSchema = {
        factors: {
          ma: { type: 'number' },
          ema: { type: 'number' },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);

      expect(result.factors.added).toHaveLength(1);
      expect(result.factors.added[0].fieldName).toBe('ema');
    });

    it('should handle empty schemas', () => {
      const result = service.compareSchemas({}, {});

      expect(result.parameters.added).toHaveLength(0);
      expect(result.parameters.removed).toHaveLength(0);
      expect(result.parameters.modified).toHaveLength(0);
    });

    it('should handle missing parameters key', () => {
      const sourceSchema = {};
      const targetSchema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);

      expect(result.parameters.added).toHaveLength(1);
    });
  });

  describe('hasDifferences', () => {
    it('should return false for identical schemas', () => {
      const schema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const result = service.compareSchemas(schema, schema);

      expect(service.hasDifferences(result)).toBe(false);
    });

    it('should return true when parameters are added', () => {
      const sourceSchema = {
        parameters: {},
      };

      const targetSchema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);

      expect(service.hasDifferences(result)).toBe(true);
    });

    it('should return true when factors are modified', () => {
      const sourceSchema = {
        factors: {
          ma: { type: 'number' },
        },
      };

      const targetSchema = {
        factors: {
          ma: { type: 'string' },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);

      expect(service.hasDifferences(result)).toBe(true);
    });
  });

  describe('getDiffSummary', () => {
    it('should return "No schema changes" for identical schemas', () => {
      const schema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const result = service.compareSchemas(schema, schema);
      const summary = service.getDiffSummary(result);

      expect(summary).toBe('No schema changes');
    });

    it('should describe parameter changes', () => {
      const sourceSchema = {
        parameters: {},
      };

      const targetSchema = {
        parameters: {
          period: { type: 'number', default: 10 },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);
      const summary = service.getDiffSummary(result);

      expect(summary).toContain('parameter');
    });

    it('should describe factor changes', () => {
      const sourceSchema = {
        factors: {},
      };

      const targetSchema = {
        factors: {
          ma: { type: 'number' },
        },
      };

      const result = service.compareSchemas(sourceSchema, targetSchema);
      const summary = service.getDiffSummary(result);

      expect(summary).toContain('factor');
    });
  });
});

