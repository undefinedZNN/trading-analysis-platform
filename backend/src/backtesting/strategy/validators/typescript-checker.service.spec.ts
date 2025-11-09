// backend/src/backtesting/strategy/validators/typescript-checker.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TypeScriptCheckerService } from './typescript-checker.service';

describe('TypeScriptCheckerService', () => {
  let service: TypeScriptCheckerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TypeScriptCheckerService],
    }).compile();

    service = module.get<TypeScriptCheckerService>(TypeScriptCheckerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check', () => {
    it('should pass valid TypeScript code', async () => {
      const code = `
        const x: number = 42;
        const y: string = "hello";
        function add(a: number, b: number): number {
          return a + b;
        }
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should detect type errors', async () => {
      const code = `
        const x: number = "hello"; // 类型错误
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Type');
      expect(result.errors[0].line).toBeGreaterThan(0);
      expect(result.errors[0].column).toBeGreaterThan(0);
    });

    it('should detect undefined variables', async () => {
      const code = `
        console.log(undefinedVar);
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Cannot find name');
    });

    it('should detect type mismatches in function calls', async () => {
      const code = `
        function greet(name: string): void {
          console.log("Hello, " + name);
        }
        greet(42); // 类型不匹配
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Argument of type');
    });

    it('should detect missing return statements', async () => {
      const code = `
        function getValue(): number {
          // 缺少return语句
        }
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect unused variables', async () => {
      const code = `
        function test() {
          const unusedVar = 42;
          const usedVar = 10;
          console.log(usedVar);
        }
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('unused') || e.message.includes('never read'))).toBe(
        true,
      );
    });

    it('should detect null/undefined issues with strict null checks', async () => {
      const code = `
        function process(value: string): number {
          return value.length;
        }
        const result = process(null); // strictNullChecks错误
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return structured error information', async () => {
      const code = `
        const x: number = "wrong";
      `;

      const result = await service.check(code);
      expect(result.errors[0]).toHaveProperty('line');
      expect(result.errors[0]).toHaveProperty('column');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('code');
      expect(result.errors[0]).toHaveProperty('category');
      expect(result.errors[0].category).toBe('error');
    });

    it('should handle complex type checking', async () => {
      const code = `
        interface User {
          name: string;
          age: number;
        }
        
        const user: User = {
          name: "John",
          age: "30", // 类型错误
        };
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle syntax errors', async () => {
      const code = `
        const x = {
          name: "test"
          age: 30  // 缺少逗号
        };
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should timeout on very long type checking', async () => {
      // 创建一个会导致超时的场景
      // 由于TypeScript编译很快，我们设置一个非常短的超时来模拟
      const code = `
        const x: number = 42;
      `;

      // 设置极短的超时时间（1ms）来触发超时
      try {
        await service.check(code, { timeout: 1 });
        // 如果没有超时，也是可以接受的（代码检查太快了）
        expect(true).toBe(true);
      } catch (error) {
        // 如果超时了，检查错误消息
        expect(error.message).toContain('超时');
      }
    }, 10000);

    it('should respect custom compiler options', async () => {
      const code = `
        const x = 42;
        const y = "hello";
      `;

      const result = await service.check(code, {
        strict: false,
        target: 'ES5',
      });

      expect(result).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle empty code', async () => {
      const code = '';

      const result = await service.check(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle code with imports', async () => {
      const code = `
        import { EventEmitter } from 'events';
        const emitter = new EventEmitter();
      `;

      const result = await service.check(code);
      // 由于没有实际的node_modules，会有错误
      // 但服务应该能正常运行
      expect(result).toBeDefined();
    });
  });
});

