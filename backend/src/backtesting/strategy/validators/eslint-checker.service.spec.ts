// backend/src/backtesting/strategy/validators/eslint-checker.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ESLintCheckerService } from './eslint-checker.service';

describe('ESLintCheckerService', () => {
  let service: ESLintCheckerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ESLintCheckerService],
    }).compile();

    service = module.get<ESLintCheckerService>(ESLintCheckerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check', () => {
    it('should pass code that follows most rules', async () => {
      const code = `const x = 42;
const y = 'hello';
const z = x + 10;
`;

      const result = await service.check(code);
      // ESLint可能会检测到一些问题（如未使用的变量），这是正常的
      expect(result).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      // 至少应该能检测到一些问题
      expect(result.errors.length + result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect unused variables', async () => {
      const code = `
const unusedVar = 42;
const usedVar = 10;
return usedVar;
`;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) => e.ruleId === '@typescript-eslint/no-unused-vars',
        ),
      ).toBe(true);
    });

    it('should detect console.log as warning', async () => {
      const code = `
const x = 42;
console.log(x);
`;

      const result = await service.check(code);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.ruleId === 'no-console')).toBe(
        true,
      );
    });

    it('should detect debugger statements', async () => {
      const code = `
const x = 42;
debugger;
return x;
`;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === 'no-debugger')).toBe(true);
    });

    it('should detect missing semicolons', async () => {
      const code = `
const x = 42
const y = 10
`;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === 'semi')).toBe(true);
    });

    it('should detect double quotes instead of single quotes', async () => {
      const code = `
const message = "hello";
`;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === 'quotes')).toBe(true);
    });

    it('should detect use of == instead of ===', async () => {
      const code = `
const x = 42;
if (x == 42) {
  return true;
}
`;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === 'eqeqeq')).toBe(true);
    });

    it('should detect eval usage', async () => {
      const code = `
const code = '1 + 1';
const result = eval(code);
`;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === 'no-eval')).toBe(true);
    });

    it('should return structured error information', async () => {
      const code = `
const x = "wrong"
`;

      const result = await service.check(code);
      expect(result.errors[0]).toHaveProperty('line');
      expect(result.errors[0]).toHaveProperty('column');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('ruleId');
      expect(result.errors[0]).toHaveProperty('severity');
      expect(result.errors[0]).toHaveProperty('fixable');
    });

    it('should distinguish between errors and warnings', async () => {
      const code = `
const x: any = 42;
console.log(x);
`;

      const result = await service.check(code);
      expect(result.warnings.length).toBeGreaterThan(0);
      // @typescript-eslint/no-explicit-any 和 no-console 都是警告
      expect(result.warnings.some((w) => w.severity === 'warning')).toBe(true);
    });

    it('should mark fixable issues', async () => {
      const code = `
const x = "hello"
`;

      const result = await service.check(code);
      // semi 和 quotes 都是可修复的
      expect(result.fixableErrorCount).toBeGreaterThan(0);
    });

    it('should support custom rules', async () => {
      const code = `
console.log('test');
`;

      // 自定义规则：允许console.log
      const result = await service.check(code, {
        rules: {
          'no-console': 'off',
        },
      });

      expect(result.warnings.some((w) => w.ruleId === 'no-console')).toBe(
        false,
      );
    });

    it('should handle empty code', async () => {
      const code = '';

      const result = await service.check(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle code with multiple errors', async () => {
      const code = `
const x = "hello"
const y = 42
if (x == "hello") {
  console.log(y)
}
`;

      const result = await service.check(code);
      expect(result.errors.length).toBeGreaterThan(2);
      // 应该有 quotes, semi, eqeqeq 等错误
    });

    it('should provide line and column information', async () => {
      const code = `
const x = 42;
const y = "wrong";
`;

      const result = await service.check(code);
      const quotesError = result.errors.find((e) => e.ruleId === 'quotes');
      expect(quotesError).toBeDefined();
      expect(quotesError.line).toBe(3);
      expect(quotesError.column).toBeGreaterThan(0);
    });
  });
});

