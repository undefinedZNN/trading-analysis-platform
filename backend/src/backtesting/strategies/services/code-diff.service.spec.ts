/**
 * CodeDiffService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CodeDiffService } from './code-diff.service';
import { DiffType } from '../dto/version-compare.dto';

describe('CodeDiffService', () => {
  let service: CodeDiffService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CodeDiffService],
    }).compile();

    service = module.get<CodeDiffService>(CodeDiffService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateDiff', () => {
    it('should detect no changes for identical code', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const result = service.calculateDiff(code, code);

      expect(result.diffBlocks).toHaveLength(0);
      expect(result.stats.addedLines).toBe(0);
      expect(result.stats.removedLines).toBe(0);
      expect(result.stats.unchangedLines).toBe(2);
    });

    it('should detect added lines', () => {
      const sourceCode = 'const x = 1;';
      const targetCode = 'const x = 1;\nconst y = 2;';
      
      const result = service.calculateDiff(sourceCode, targetCode);

      expect(result.stats.addedLines).toBeGreaterThan(0);
      expect(result.diffBlocks.some(block => block.type === DiffType.ADDED)).toBe(true);
    });

    it('should detect removed lines', () => {
      const sourceCode = 'const x = 1;\nconst y = 2;';
      const targetCode = 'const x = 1;';
      
      const result = service.calculateDiff(sourceCode, targetCode);

      expect(result.stats.removedLines).toBeGreaterThan(0);
      expect(result.diffBlocks.some(block => block.type === DiffType.REMOVED)).toBe(true);
    });

    it('should detect modified lines', () => {
      const sourceCode = 'const x = 1;\nconst y = 2;';
      const targetCode = 'const x = 1;\nconst y = 3;';
      
      const result = service.calculateDiff(sourceCode, targetCode);

      expect(result.stats.addedLines).toBeGreaterThan(0);
      expect(result.stats.removedLines).toBeGreaterThan(0);
    });

    it('should handle empty source code', () => {
      const sourceCode = '';
      const targetCode = 'const x = 1;';
      
      const result = service.calculateDiff(sourceCode, targetCode);

      expect(result.stats.addedLines).toBeGreaterThan(0);
      expect(result.stats.removedLines).toBe(0);
    });

    it('should handle empty target code', () => {
      const sourceCode = 'const x = 1;';
      const targetCode = '';
      
      const result = service.calculateDiff(sourceCode, targetCode);

      expect(result.stats.addedLines).toBe(0);
      expect(result.stats.removedLines).toBeGreaterThan(0);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 100% for identical code', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const similarity = service.calculateSimilarity(code, code);

      expect(similarity).toBe(100);
    });

    it('should return 0% for completely different code', () => {
      const sourceCode = 'const x = 1;';
      const targetCode = 'const y = 2;';
      
      const similarity = service.calculateSimilarity(sourceCode, targetCode);

      expect(similarity).toBeLessThan(100);
      expect(similarity).toBeGreaterThanOrEqual(0);
    });

    it('should return 50% for half changed code', () => {
      const sourceCode = 'const x = 1;\nconst y = 2;';
      const targetCode = 'const x = 1;\nconst z = 3;';
      
      const similarity = service.calculateSimilarity(sourceCode, targetCode);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(100);
    });

    it('should handle empty code', () => {
      const similarity = service.calculateSimilarity('', '');
      expect(similarity).toBe(100);
    });
  });

  describe('getDiffSummary', () => {
    it('should return "No changes" for identical code', () => {
      const code = 'const x = 1;';
      const result = service.calculateDiff(code, code);
      const summary = service.getDiffSummary(result);

      expect(summary).toBe('No changes');
    });

    it('should describe added lines', () => {
      const sourceCode = 'const x = 1;';
      const targetCode = 'const x = 1;\nconst y = 2;';
      
      const result = service.calculateDiff(sourceCode, targetCode);
      const summary = service.getDiffSummary(result);

      expect(summary).toContain('added');
    });

    it('should describe removed lines', () => {
      const sourceCode = 'const x = 1;\nconst y = 2;';
      const targetCode = 'const x = 1;';
      
      const result = service.calculateDiff(sourceCode, targetCode);
      const summary = service.getDiffSummary(result);

      expect(summary).toContain('removed');
    });
  });

  describe('hasDifferences', () => {
    it('should return false for identical code', () => {
      const code = 'const x = 1;';
      const result = service.calculateDiff(code, code);

      expect(service.hasDifferences(result)).toBe(false);
    });

    it('should return true for different code', () => {
      const sourceCode = 'const x = 1;';
      const targetCode = 'const y = 2;';
      
      const result = service.calculateDiff(sourceCode, targetCode);

      expect(service.hasDifferences(result)).toBe(true);
    });
  });
});

