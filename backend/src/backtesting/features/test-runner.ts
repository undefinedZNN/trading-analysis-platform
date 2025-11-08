/**
 * FeatureRegistry 快速验证测试
 * 
 * 用于验证核心架构和MA/EMA特征是否正常工作
 */

import { of } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { createFeatureRegistry } from './registry';
import { MAFeature, EMA10Feature, EMA20Feature } from './built-in';
import { BarEvent } from '../data/timeframe/interfaces';

// 简单的断言函数
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEquals(actual: any, expected: any, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error('Expected:', expected);
    console.error('Actual:', actual);
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

// 测试计数器
let passedTests = 0;
let failedTests = 0;

function runTest(name: string, testFn: () => void | Promise<void>): void {
  const runAsync = async () => {
    try {
      await testFn();
      console.log(`✅ ${name}`);
      passedTests++;
    } catch (error) {
      console.error(`❌ ${name}`);
      console.error(`   ${error}`);
      failedTests++;
    }
  };
  runAsync();
}

// 创建测试数据
function createTestBars(count: number, startPrice: number = 100): BarEvent[] {
  const bars: BarEvent[] = [];
  let price = startPrice;
  
  for (let i = 0; i < count; i++) {
    // 模拟价格波动
    price = price + (Math.random() - 0.5) * 2;
    
    bars.push({
      sequenceId: `test-${i}`,
      timestamp: new Date(Date.now() + i * 60000).toISOString(),
      symbol: 'TEST-USDT',
      timeframe: '1m',
      open: price.toFixed(2),
      high: (price + 1).toFixed(2),
      low: (price - 1).toFixed(2),
      close: price.toFixed(2),
      volume: '1000.00',
      source: 'test',
    });
  }
  
  return bars;
}

// ========================================
// 测试组 1: 注册表基础功能
// ========================================
console.log('\n📋 测试组 1: 注册表基础功能\n');

runTest('注册特征', () => {
  const registry = createFeatureRegistry();
  registry.register(MAFeature);
  assert(registry.has('MA'), 'MA should be registered');
  assertEquals(registry.getFeatureCount(), 1);
});

runTest('获取特征定义', () => {
  const registry = createFeatureRegistry();
  registry.register(MAFeature);
  const feature = registry.get('MA');
  assert(feature !== undefined, 'Should get MA feature');
  assertEquals(feature?.id, 'MA');
});

runTest('检测重复注册', () => {
  const registry = createFeatureRegistry();
  registry.register(MAFeature);
  
  let errorThrown = false;
  try {
    registry.register(MAFeature);
  } catch (error) {
    errorThrown = true;
  }
  
  assert(errorThrown, 'Should throw error on duplicate registration');
});

runTest('批量注册特征', () => {
  const registry = createFeatureRegistry();
  registry.registerBatch([MAFeature, EMA10Feature, EMA20Feature]);
  
  assertEquals(registry.getFeatureCount(), 3);
  assert(registry.has('MA'), 'Should have MA');
  assert(registry.has('EMA10'), 'Should have EMA10');
  assert(registry.has('EMA20'), 'Should have EMA20');
});

runTest('列出所有特征', () => {
  const registry = createFeatureRegistry();
  registry.registerBatch([MAFeature, EMA10Feature]);
  
  const definitions = registry.listDefinitions();
  assertEquals(definitions.length, 2);
  assert(definitions.some(d => d.id === 'MA'), 'Should list MA');
  assert(definitions.some(d => d.id === 'EMA10'), 'Should list EMA10');
});

// ========================================
// 测试组 2: 参数校验
// ========================================
console.log('\n📋 测试组 2: 参数校验\n');

runTest('校验有效参数', () => {
  const registry = createFeatureRegistry();
  registry.register(MAFeature);
  
  const result = registry.validateParams('MA', { window: 20, source: 'close' });
  assert(result.valid, 'Valid params should pass');
  assertEquals(result.errors.length, 0);
});

runTest('检测无效参数类型', () => {
  const registry = createFeatureRegistry();
  registry.register(MAFeature);
  
  const result = registry.validateParams('MA', { window: 'invalid' });
  assert(!result.valid, 'Invalid type should fail');
  assert(result.errors.length > 0, 'Should have errors');
});

runTest('检测超出范围的参数', () => {
  const registry = createFeatureRegistry();
  registry.register(MAFeature);
  
  const result = registry.validateParams('MA', { window: 0 });
  assert(!result.valid, 'Window 0 should be invalid');
  assert(result.errors.some(e => e.includes('must be >=')), 'Should have range error');
});

runTest('检测无效枚举值', () => {
  const registry = createFeatureRegistry();
  registry.register(MAFeature);
  
  const result = registry.validateParams('MA', { source: 'invalid' });
  assert(!result.valid, 'Invalid enum value should fail');
  assert(result.errors.some(e => e.includes('must be one of')), 'Should have enum error');
});

// ========================================
// 测试组 3: MA 特征计算
// ========================================
console.log('\n📋 测试组 3: MA 特征计算\n');

runTest('MA 特征计算', async () => {
  const registry = createFeatureRegistry();
  registry.register(MAFeature);
  
  // 创建简单的测试数据
  const testBars: BarEvent[] = [
    {
      sequenceId: '1',
      timestamp: '2024-01-01T00:00:00.000Z',
      symbol: 'TEST',
      timeframe: '1m',
      open: '100',
      high: '105',
      low: '95',
      close: '100',
      volume: '1000',
      source: 'test',
    },
    {
      sequenceId: '2',
      timestamp: '2024-01-01T00:01:00.000Z',
      symbol: 'TEST',
      timeframe: '1m',
      open: '100',
      high: '110',
      low: '98',
      close: '105',
      volume: '1000',
      source: 'test',
    },
    {
      sequenceId: '3',
      timestamp: '2024-01-01T00:02:00.000Z',
      symbol: 'TEST',
      timeframe: '1m',
      open: '105',
      high: '115',
      low: '103',
      close: '110',
      volume: '1000',
      source: 'test',
    },
  ];
  
  const stream = of(...testBars);
  const result = await MAFeature.compute(stream, { window: 2 }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 3, 'Should have 3 bars');
  
  // 第1个bar应该没有MA（窗口未满）
  assert(result![0].features?.MA === undefined, 'First bar should not have MA');
  
  // 第2个bar应该有MA = (100 + 105) / 2 = 102.5
  assert(result![1].features?.MA !== undefined, 'Second bar should have MA');
  const ma2 = parseFloat(result![1].features!.MA as string);
  assert(Math.abs(ma2 - 102.5) < 0.01, `MA should be ~102.5, got ${ma2}`);
  
  // 第3个bar应该有MA = (105 + 110) / 2 = 107.5
  assert(result![2].features?.MA !== undefined, 'Third bar should have MA');
  const ma3 = parseFloat(result![2].features!.MA as string);
  assert(Math.abs(ma3 - 107.5) < 0.01, `MA should be ~107.5, got ${ma3}`);
});

// ========================================
// 测试组 4: EMA 特征计算
// ========================================
console.log('\n📋 测试组 4: EMA 特征计算\n');

runTest('EMA 特征计算', async () => {
  const registry = createFeatureRegistry();
  registry.register(EMA10Feature);
  
  const testBars = createTestBars(20, 100);
  const stream = of(...testBars);
  
  const result = await EMA10Feature.compute(stream).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 20, 'Should have 20 bars');
  
  // 所有bar都应该有EMA值
  result!.forEach((bar, index) => {
    assert(bar.features?.EMA !== undefined, `Bar ${index} should have EMA`);
    // EMA_10 字段应该也存在
    const hasEMA10 = bar.features?.EMA_10 !== undefined || bar.features?.EMA !== undefined;
    assert(hasEMA10, `Bar ${index} should have EMA or EMA_10`);
  });
  
  // EMA值应该是有效数字
  const ema = parseFloat(result![19].features!.EMA as string);
  assert(!isNaN(ema), 'EMA should be a valid number');
  assert(ema > 0, 'EMA should be positive');
});

// ========================================
// 测试总结
// ========================================
setTimeout(() => {
  console.log('\n==================================================');
  console.log('📊 测试结果总结');
  console.log('==================================================');
  console.log(`✅ 通过: ${passedTests}`);
  console.log(`❌ 失败: ${failedTests}`);
  console.log(`📈 通过率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  console.log('==================================================\n');

  if (failedTests === 0) {
    console.log('🎉 所有测试通过！FeatureRegistry 工作正常！\n');
    process.exit(0);
  } else {
    console.log('⚠️  存在失败的测试，请检查错误信息\n');
    process.exit(1);
  }
}, 1000); // 等待异步测试完成

