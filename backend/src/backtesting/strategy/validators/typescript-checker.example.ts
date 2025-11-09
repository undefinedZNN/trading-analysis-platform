// backend/src/backtesting/strategy/validators/typescript-checker.example.ts

/**
 * TypeScriptChecker使用示例
 * 
 * 本文件展示如何使用TypeScriptCheckerService来检查策略脚本的类型正确性
 */

import { TypeScriptCheckerService } from './typescript-checker.service';

// 创建服务实例
const checker = new TypeScriptCheckerService();

// ============================================
// 示例1: 检查简单的TypeScript代码
// ============================================

console.log('\n=== 示例1: 检查简单的TypeScript代码 ===\n');

const simpleCode = `
  const x: number = 42;
  const y: string = "hello";
  
  function add(a: number, b: number): number {
    return a + b;
  }
  
  const result = add(x, 10);
`;

(async () => {
  const result = await checker.check(simpleCode);
  console.log('检查结果:', result.valid ? '✅ 通过' : '❌ 失败');
  console.log('执行时间:', result.executionTime, 'ms');
  if (!result.valid) {
    console.log('错误:', result.errors);
  }
})();

// ============================================
// 示例2: 检测类型错误
// ============================================

console.log('\n=== 示例2: 检测类型错误 ===\n');

const errorCode = `
  const x: number = "hello"; // 类型错误
  const y: string = 123;     // 类型错误
`;

(async () => {
  const result = await checker.check(errorCode);
  console.log('检查结果:', result.valid ? '✅ 通过' : '❌ 失败');
  console.log('发现的错误:');
  result.errors.forEach((error, index) => {
    console.log(`  ${index + 1}. 第${error.line}行第${error.column}列: ${error.message}`);
  });
})();

// ============================================
// 示例3: 检查策略脚本
// ============================================

console.log('\n=== 示例3: 检查策略脚本 ===\n');

const strategyCode = `
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

(async () => {
  const result = await checker.check(strategyCode);
  console.log('策略脚本检查结果:', result.valid ? '✅ 通过' : '❌ 失败');
  console.log('执行时间:', result.executionTime, 'ms');
})();

// ============================================
// 示例4: 使用自定义选项
// ============================================

console.log('\n=== 示例4: 使用自定义选项 ===\n');

const codeWithOptions = `
  const x = 42;
  const y = "hello";
`;

(async () => {
  const result = await checker.check(codeWithOptions, {
    timeout: 5000,      // 5秒超时
    strict: false,      // 非严格模式
    target: 'ES2015',   // 编译目标ES2015
    lib: ['ES2015', 'DOM'], // 包含DOM库
  });
  
  console.log('检查结果:', result.valid ? '✅ 通过' : '❌ 失败');
})();

// ============================================
// 示例5: 处理错误
// ============================================

console.log('\n=== 示例5: 处理错误 ===\n');

const complexErrorCode = `
  interface User {
    name: string;
    age: number;
  }
  
  const user: User = {
    name: "John",
    age: "30", // 类型错误
  };
  
  function greet(user: User): void {
    console.log(undefinedVar); // 未定义变量
  }
`;

(async () => {
  const result = await checker.check(complexErrorCode);
  console.log('检查结果:', result.valid ? '✅ 通过' : '❌ 失败');
  console.log(`\n发现 ${result.errors.length} 个错误:\n`);
  
  result.errors.forEach((error, index) => {
    console.log(`错误 ${index + 1}:`);
    console.log(`  位置: 第${error.line}行第${error.column}列`);
    console.log(`  消息: ${error.message}`);
    console.log(`  代码: TS${error.code}`);
    console.log(`  类别: ${error.category}`);
    console.log('');
  });
})();

// ============================================
// 示例6: 在NestJS Controller中使用
// ============================================

console.log('\n=== 示例6: 在NestJS Controller中使用 ===\n');

/**
 * 在Controller中使用TypeScriptChecker的示例代码:
 * 
 * ```typescript
 * import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
 * import { TypeScriptCheckerService } from './validators/typescript-checker.service';
 * 
 * @Controller('strategies')
 * export class StrategiesController {
 *   constructor(
 *     private readonly typeScriptChecker: TypeScriptCheckerService,
 *   ) {}
 * 
 *   @Post()
 *   async createStrategy(@Body() dto: CreateStrategyDto) {
 *     // 1. 检查TypeScript类型
 *     const typeCheckResult = await this.typeScriptChecker.check(dto.scriptCode);
 *     
 *     if (!typeCheckResult.valid) {
 *       throw new BadRequestException({
 *         message: 'TypeScript类型检查失败',
 *         errors: typeCheckResult.errors,
 *       });
 *     }
 *     
 *     // 2. 保存策略
 *     return this.strategiesService.create(dto);
 *   }
 * 
 *   @Post(':id/validate')
 *   async validateStrategy(@Param('id') id: string) {
 *     const strategy = await this.strategiesService.findOne(id);
 *     
 *     const result = await this.typeScriptChecker.check(strategy.scriptCode);
 *     
 *     return {
 *       valid: result.valid,
 *       errors: result.errors,
 *       warnings: result.warnings,
 *       executionTime: result.executionTime,
 *     };
 *   }
 * }
 * ```
 */

console.log('请参考上面的代码注释，了解如何在Controller中使用TypeScriptChecker');

// ============================================
// 示例7: 批量检查多个脚本
// ============================================

console.log('\n=== 示例7: 批量检查多个脚本 ===\n');

const scripts = [
  { name: 'script1', code: 'const x: number = 42;' },
  { name: 'script2', code: 'const y: string = "hello";' },
  { name: 'script3', code: 'const z: number = "wrong";' },
];

(async () => {
  console.log('批量检查3个脚本...\n');
  
  for (const script of scripts) {
    const result = await checker.check(script.code);
    console.log(`${script.name}: ${result.valid ? '✅ 通过' : '❌ 失败'}`);
    if (!result.valid) {
      console.log(`  错误: ${result.errors[0].message}`);
    }
  }
})();

// ============================================
// 示例8: 性能测试
// ============================================

console.log('\n=== 示例8: 性能测试 ===\n');

const performanceTestCode = `
  interface Data {
    id: number;
    value: string;
  }
  
  function process(data: Data[]): number {
    return data.reduce((sum, item) => sum + item.id, 0);
  }
  
  const testData: Data[] = [
    { id: 1, value: "a" },
    { id: 2, value: "b" },
    { id: 3, value: "c" },
  ];
  
  const result = process(testData);
`;

(async () => {
  const iterations = 5;
  const times: number[] = [];
  
  console.log(`运行${iterations}次检查...\n`);
  
  for (let i = 0; i < iterations; i++) {
    const result = await checker.check(performanceTestCode);
    times.push(result.executionTime);
    console.log(`第${i + 1}次: ${result.executionTime}ms`);
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`\n平均执行时间: ${avgTime.toFixed(2)}ms`);
})();

// ============================================
// 示例9: 超时处理
// ============================================

console.log('\n=== 示例9: 超时处理 ===\n');

(async () => {
  const code = 'const x: number = 42;';
  
  try {
    // 设置非常短的超时时间
    const result = await checker.check(code, { timeout: 1 });
    console.log('检查完成（未超时）');
  } catch (error) {
    console.log('检查超时:', error.message);
  }
})();

// ============================================
// 示例10: 检查类和接口
// ============================================

console.log('\n=== 示例10: 检查类和接口 ===\n');

const classCode = `
  interface Strategy {
    onInit(): void;
    onBar(bar: any): void;
  }
  
  class MyStrategy implements Strategy {
    private period: number;
    
    constructor(period: number) {
      this.period = period;
    }
    
    onInit(): void {
      console.log('Strategy initialized');
    }
    
    onBar(bar: any): void {
      console.log('Bar received:', bar);
    }
  }
  
  const strategy = new MyStrategy(20);
`;

(async () => {
  const result = await checker.check(classCode);
  console.log('类定义检查结果:', result.valid ? '✅ 通过' : '❌ 失败');
})();

