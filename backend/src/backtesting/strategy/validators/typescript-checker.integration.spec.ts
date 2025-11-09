// backend/src/backtesting/strategy/validators/typescript-checker.integration.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TypeScriptCheckerService } from './typescript-checker.service';

describe('TypeScriptCheckerService Integration Tests', () => {
  let service: TypeScriptCheckerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TypeScriptCheckerService],
    }).compile();

    service = module.get<TypeScriptCheckerService>(TypeScriptCheckerService);
  });

  describe('Real-world Strategy Scripts', () => {
    it('should validate MA crossover strategy', async () => {
      const code = `
        interface BarData {
          timestamp: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }
        
        interface StrategyContext {
          parameters: {
            fastPeriod: number;
            slowPeriod: number;
          };
          factors: {
            ma_fast: number;
            ma_slow: number;
          };
          emit: (event: any) => void;
        }
        
        function onBar(ctx: StrategyContext, bar: BarData): void {
          const { ma_fast, ma_slow } = ctx.factors;
          
          if (ma_fast > ma_slow) {
            ctx.emit({ type: 'BUY', price: bar.close });
          } else if (ma_fast < ma_slow) {
            ctx.emit({ type: 'SELL', price: bar.close });
          }
        }
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect errors in strategy implementation', async () => {
      const code = `
        interface BarData {
          timestamp: number;
          close: number;
        }
        
        function onBar(bar: BarData): void {
          // 错误：访问不存在的属性
          console.log(bar.price);
        }
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('price');
    });

    it('should validate complex type definitions', async () => {
      const code = `
        type TradeDirection = 'BUY' | 'SELL';
        type OrderType = 'MARKET' | 'LIMIT' | 'STOP';
        
        interface TradeEvent {
          type: TradeDirection;
          orderType: OrderType;
          price: number;
          quantity: number;
          timestamp: number;
        }
        
        interface Strategy {
          parameters: Record<string, any>;
          factors: Record<string, any>;
          onBar: (bar: any) => void;
        }
        
        const strategy: Strategy = {
          parameters: { period: 20 },
          factors: { ma: 0 },
          onBar: (bar) => {
            console.log(bar);
          },
        };
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect type mismatches in strategy context', async () => {
      const code = `
        interface StrategyContext {
          parameters: {
            period: number;
          };
        }
        
        function init(ctx: StrategyContext): void {
          // 错误：将字符串赋值给number
          ctx.parameters.period = "20";
        }
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate generic types', async () => {
      const code = `
        interface DataPoint<T> {
          value: T;
          timestamp: number;
        }
        
        function processData<T>(data: DataPoint<T>[]): T[] {
          return data.map(d => d.value);
        }
        
        const numbers: DataPoint<number>[] = [
          { value: 1, timestamp: 100 },
          { value: 2, timestamp: 200 },
        ];
        
        const result: number[] = processData(numbers);
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect async/await issues', async () => {
      const code = `
        async function fetchData(): Promise<number> {
          return 42;
        }
        
        function process(): void {
          // 错误：缺少await
          const data: number = fetchData();
        }
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate class-based strategies', async () => {
      const code = `
        class MovingAverageStrategy {
          private period: number;
          private values: number[] = [];
          
          constructor(period: number) {
            this.period = period;
          }
          
          update(value: number): number {
            this.values.push(value);
            if (this.values.length > this.period) {
              this.values.shift();
            }
            return this.calculate();
          }
          
          private calculate(): number {
            const sum = this.values.reduce((a, b) => a + b, 0);
            return sum / this.values.length;
          }
        }
        
        const strategy = new MovingAverageStrategy(20);
        const ma = strategy.update(100);
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing interface implementations', async () => {
      const code = `
        interface Strategy {
          onInit(): void;
          onBar(bar: any): void;
          onTick(tick: any): void;
        }
        
        class MyStrategy implements Strategy {
          onInit(): void {
            console.log('init');
          }
          
          onBar(bar: any): void {
            console.log('bar');
          }
          
          // 错误：缺少onTick实现
        }
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('onTick');
    });
  });

  describe('Performance Tests', () => {
    it('should check small scripts quickly', async () => {
      const code = `
        const x: number = 42;
      `;

      const result = await service.check(code);
      expect(result.executionTime).toBeLessThan(1000); // < 1秒
    });

    it('should check medium scripts within timeout', async () => {
      const code = `
        interface User {
          id: number;
          name: string;
          email: string;
        }
        
        interface Order {
          id: number;
          userId: number;
          items: string[];
          total: number;
        }
        
        function processOrder(order: Order, user: User): boolean {
          if (order.userId !== user.id) {
            return false;
          }
          return order.total > 0 && order.items.length > 0;
        }
        
        const user: User = { id: 1, name: 'John', email: 'john@example.com' };
        const order: Order = { id: 1, userId: 1, items: ['item1'], total: 100 };
        const result = processOrder(order, user);
      `;

      const result = await service.check(code);
      expect(result.executionTime).toBeLessThan(3000); // < 3秒
    });
  });

  describe('Error Reporting', () => {
    it('should provide detailed error locations', async () => {
      const code = `
        const x: number = 42;
        const y: string = "hello";
        const z: boolean = 123; // 错误在第4行
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors[0].line).toBe(4);
      expect(result.errors[0].column).toBeGreaterThan(0);
    });

    it('should report multiple errors', async () => {
      const code = `
        const a: number = "wrong";
        const b: string = 123;
        const c: boolean = "also wrong";
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should include error codes', async () => {
      const code = `
        const x: number = "wrong";
      `;

      const result = await service.check(code);
      expect(result.errors[0].code).toBeGreaterThan(0);
      expect(result.errors[0].category).toBe('error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long variable names', async () => {
      const code = `
        const veryLongVariableNameThatIsStillValid: number = 42;
        console.log(veryLongVariableNameThatIsStillValid);
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const code = `
        const 变量: number = 42;
        const переменная: string = "hello";
        const 変数: boolean = true;
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(true);
    });

    it('should handle comments correctly', async () => {
      const code = `
        // This is a comment
        const x: number = 42;
        
        /* This is a
           multi-line comment */
        const y: string = "hello";
      `;

      const result = await service.check(code);
      expect(result.valid).toBe(true);
    });
  });
});

