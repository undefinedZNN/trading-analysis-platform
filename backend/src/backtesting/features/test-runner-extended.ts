/**
 * FeatureRegistry 扩展测试
 * 
 * 用于测试所有内置特征：MA, EMA, RSI, ATR, IBS, ADX, DMI, Overlap
 */

import { of } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { createFeatureRegistry } from './registry';
import {
  MAFeature,
  EMAFeature,
  RSIFeature,
  ATRFeature,
  IBSFeature,
  ADXFeature,
  DMIFeature,
  OverlapFeature,
} from './built-in';
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

// 创建递增价格的测试数据（用于RSI测试）
function createTrendingBars(count: number, startPrice: number = 100, trend: 'up' | 'down' | 'flat' = 'up'): BarEvent[] {
  const bars: BarEvent[] = [];
  let price = startPrice;
  
  for (let i = 0; i < count; i++) {
    let change = 0;
    if (trend === 'up') {
      change = Math.random() * 2; // 上涨
    } else if (trend === 'down') {
      change = -Math.random() * 2; // 下跌
    } else {
      change = (Math.random() - 0.5) * 0.5; // 震荡
    }
    
    price = price + change;
    const high = price + Math.random();
    const low = price - Math.random();
    
    bars.push({
      sequenceId: `test-${i}`,
      timestamp: new Date(Date.now() + i * 60000).toISOString(),
      symbol: 'TEST-USDT',
      timeframe: '1m',
      open: price.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: price.toFixed(2),
      volume: '1000.00',
      source: 'test',
    });
  }
  
  return bars;
}

// 创建具有明显高低点的测试数据（用于ATR测试）
function createVolatileBars(count: number): BarEvent[] {
  const bars: BarEvent[] = [];
  let price = 100;
  
  for (let i = 0; i < count; i++) {
    // 交替产生大波动和小波动
    const volatility = i % 2 === 0 ? 5 : 1;
    const high = price + volatility;
    const low = price - volatility;
    
    bars.push({
      sequenceId: `test-${i}`,
      timestamp: new Date(Date.now() + i * 60000).toISOString(),
      symbol: 'TEST-USDT',
      timeframe: '1m',
      open: price.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: price.toFixed(2),
      volume: '1000.00',
      source: 'test',
    });
    
    price += (Math.random() - 0.5) * 2;
  }
  
  return bars;
}

// ========================================
// 测试组 1: RSI 特征
// ========================================
console.log('\n📋 测试组 1: RSI 特征\n');

runTest('RSI 特征计算 - 上涨趋势', async () => {
  const registry = createFeatureRegistry();
  registry.register(RSIFeature);
  
  const testBars = createTrendingBars(30, 100, 'up');
  const stream = of(...testBars);
  
  const result = await RSIFeature.compute(stream, { period: 14 }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 30, 'Should have 30 bars');
  
  // 前14个bar没有足够数据
  for (let i = 0; i < 14; i++) {
    assert(Object.keys(result![i].features || {}).length === 0, `Bar ${i} should not have RSI`);
  }
  
  // 后续bar应该有RSI
  for (let i = 14; i < 30; i++) {
    const rsi = result![i].features?.RSI_14;
    assert(rsi !== undefined, `Bar ${i} should have RSI_14`);
    const rsiValue = parseFloat(rsi as string);
    assert(rsiValue >= 0 && rsiValue <= 100, `RSI should be 0-100, got ${rsiValue}`);
    // 上涨趋势，RSI应该偏高
    if (i > 20) {
      assert(rsiValue > 40, `RSI in uptrend should be > 40, got ${rsiValue}`);
    }
  }
});

runTest('RSI 特征计算 - 下跌趋势', async () => {
  const testBars = createTrendingBars(30, 100, 'down');
  const stream = of(...testBars);
  
  const result = await RSIFeature.compute(stream, { period: 14 }).pipe(toArray()).toPromise();
  
  // 下跌趋势，RSI应该偏低
  for (let i = 20; i < 30; i++) {
    const rsi = result![i].features?.RSI_14;
    if (rsi) {
      const rsiValue = parseFloat(rsi as string);
      assert(rsiValue < 60, `RSI in downtrend should be < 60, got ${rsiValue}`);
    }
  }
});

// ========================================
// 测试组 2: ATR 特征
// ========================================
console.log('\n📋 测试组 2: ATR 特征\n');

runTest('ATR 特征计算', async () => {
  const testBars = createVolatileBars(30);
  const stream = of(...testBars);
  
  const result = await ATRFeature.compute(stream, { period: 14 }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 30, 'Should have 30 bars');
  
  // 第1个bar没有前一个close
  assert(Object.keys(result![0].features || {}).length === 0, 'First bar should not have ATR');
  
  // 前14个bar没有足够数据
  for (let i = 1; i < 14; i++) {
    assert(Object.keys(result![i].features || {}).length === 0, `Bar ${i} should not have ATR`);
  }
  
  // 后续bar应该有ATR
  for (let i = 14; i < 30; i++) {
    const atr = result![i].features?.ATR_14;
    assert(atr !== undefined, `Bar ${i} should have ATR_14`);
    const atrValue = parseFloat(atr as string);
    assert(atrValue > 0, `ATR should be positive, got ${atrValue}`);
  }
});

// ========================================
// 测试组 3: IBS 特征
// ========================================
console.log('\n📋 测试组 3: IBS 特征\n');

runTest('IBS 特征计算', async () => {
  const testBars: BarEvent[] = [
    {
      sequenceId: '1',
      timestamp: '2024-01-01T00:00:00.000Z',
      symbol: 'TEST',
      timeframe: '1m',
      open: '100',
      high: '110', // high
      low: '90',   // low
      close: '100', // close在中间 -> IBS = (100-90)/(110-90) = 0.5
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
      low: '90',
      close: '110', // close=high -> IBS = 1
      volume: '1000',
      source: 'test',
    },
    {
      sequenceId: '3',
      timestamp: '2024-01-01T00:02:00.000Z',
      symbol: 'TEST',
      timeframe: '1m',
      open: '100',
      high: '110',
      low: '90',
      close: '90', // close=low -> IBS = 0
      volume: '1000',
      source: 'test',
    },
  ];
  
  const stream = of(...testBars);
  const result = await IBSFeature.compute(stream, { precision: 4 }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 3, 'Should have 3 bars');
  
  // 所有bar都应该有IBS
  const ibs1 = parseFloat(result![0].features?.IBS as string);
  const ibs2 = parseFloat(result![1].features?.IBS as string);
  const ibs3 = parseFloat(result![2].features?.IBS as string);
  
  assert(Math.abs(ibs1 - 0.5) < 0.01, `IBS should be 0.5, got ${ibs1}`);
  assert(Math.abs(ibs2 - 1.0) < 0.01, `IBS should be 1.0, got ${ibs2}`);
  assert(Math.abs(ibs3 - 0.0) < 0.01, `IBS should be 0.0, got ${ibs3}`);
});

// ========================================
// 测试组 4: ADX 特征
// ========================================
console.log('\n📋 测试组 4: ADX 特征\n');

runTest('ADX 特征计算', async () => {
  const testBars = createTrendingBars(50, 100, 'up');
  const stream = of(...testBars);
  
  const result = await ADXFeature.compute(stream, { period: 14 }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 50, 'Should have 50 bars');
  
  // 前期没有足够数据
  for (let i = 0; i < 27; i++) { // period * 2 - 1
    const adx = result![i].features?.ADX_14;
    assert(adx === undefined, `Bar ${i} should not have ADX yet`);
  }
  
  // 后续bar应该有ADX
  for (let i = 27; i < 50; i++) {
    const adx = result![i].features?.ADX_14;
    assert(adx !== undefined, `Bar ${i} should have ADX_14`);
    const adxValue = parseFloat(adx as string);
    assert(adxValue >= 0 && adxValue <= 100, `ADX should be 0-100, got ${adxValue}`);
  }
});

// ========================================
// 测试组 5: DMI 特征
// ========================================
console.log('\n📋 测试组 5: DMI 特征\n');

runTest('DMI 特征计算', async () => {
  const testBars = createTrendingBars(30, 100, 'up');
  const stream = of(...testBars);
  
  const result = await DMIFeature.compute(stream, { period: 14 }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 30, 'Should have 30 bars');
  
  // 第1个bar没有数据
  assert(Object.keys(result![0].features || {}).length === 0, 'First bar should not have DMI');
  
  // 前14个bar没有足够数据
  for (let i = 1; i < 14; i++) {
    assert(Object.keys(result![i].features || {}).length === 0, `Bar ${i} should not have DMI`);
  }
  
  // 后续bar应该有+DI和-DI
  for (let i = 14; i < 30; i++) {
    const plusDI = result![i].features?.PLUS_DI_14;
    const minusDI = result![i].features?.MINUS_DI_14;
    
    assert(plusDI !== undefined, `Bar ${i} should have PLUS_DI_14`);
    assert(minusDI !== undefined, `Bar ${i} should have MINUS_DI_14`);
    
    const plusDIValue = parseFloat(plusDI as string);
    const minusDIValue = parseFloat(minusDI as string);
    
    assert(plusDIValue >= 0 && plusDIValue <= 100, `+DI should be 0-100, got ${plusDIValue}`);
    assert(minusDIValue >= 0 && minusDIValue <= 100, `-DI should be 0-100, got ${minusDIValue}`);
    
    // 上涨趋势，+DI应该 > -DI
    if (i > 20) {
      assert(plusDIValue > minusDIValue, `In uptrend, +DI should > -DI, got +DI=${plusDIValue}, -DI=${minusDIValue}`);
    }
  }
});

// ========================================
// 测试组 6: Overlap 特征
// ========================================
console.log('\n📋 测试组 6: Overlap 特征\n');

runTest('Overlap 特征计算 - 完全重叠', async () => {
  const testBars: BarEvent[] = [
    {
      sequenceId: '1',
      timestamp: '2024-01-01T00:00:00.000Z',
      symbol: 'TEST',
      timeframe: '1m',
      open: '100',
      high: '110',
      low: '90',
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
      high: '105', // 完全在前一根K线内
      low: '95',
      close: '100',
      volume: '1000',
      source: 'test',
    },
  ];
  
  const stream = of(...testBars);
  const result = await OverlapFeature.compute(stream, { method: 'relative' }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  
  // 第1个bar没有overlap
  assert(result![0].features?.Overlap === undefined, 'First bar should not have Overlap');
  
  // 第2个bar应该有overlap = (105-95)/(110-90) = 10/20 = 0.5
  const overlap = parseFloat(result![1].features?.Overlap as string);
  assert(Math.abs(overlap - 0.5) < 0.01, `Overlap should be 0.5, got ${overlap}`);
});

runTest('Overlap 特征计算 - 跳空', async () => {
  const testBars: BarEvent[] = [
    {
      sequenceId: '1',
      timestamp: '2024-01-01T00:00:00.000Z',
      symbol: 'TEST',
      timeframe: '1m',
      open: '100',
      high: '110',
      low: '90',
      close: '100',
      volume: '1000',
      source: 'test',
    },
    {
      sequenceId: '2',
      timestamp: '2024-01-01T00:01:00.000Z',
      symbol: 'TEST',
      timeframe: '1m',
      open: '120',
      high: '130', // 完全不重叠
      low: '115',
      close: '125',
      volume: '1000',
      source: 'test',
    },
  ];
  
  const stream = of(...testBars);
  const result = await OverlapFeature.compute(stream, { method: 'relative' }).pipe(toArray()).toPromise();
  
  // 第2个bar应该有overlap = 0（跳空）
  const overlap = parseFloat(result![1].features?.Overlap as string);
  assert(overlap === 0, `Overlap should be 0 (gap), got ${overlap}`);
});

// ========================================
// 测试组 7: 特征组合测试
// ========================================
console.log('\n📋 测试组 7: 特征组合测试\n');

runTest('注册所有特征', () => {
  const registry = createFeatureRegistry();
  registry.registerBatch([
    MAFeature,
    EMAFeature,
    RSIFeature,
    ATRFeature,
    IBSFeature,
    ADXFeature,
    DMIFeature,
    OverlapFeature,
  ]);
  
  assertEquals(registry.getFeatureCount(), 8);
  assert(registry.has('MA'), 'Should have MA');
  assert(registry.has('EMA'), 'Should have EMA');
  assert(registry.has('RSI'), 'Should have RSI');
  assert(registry.has('ATR'), 'Should have ATR');
  assert(registry.has('IBS'), 'Should have IBS');
  assert(registry.has('ADX'), 'Should have ADX');
  assert(registry.has('DMI'), 'Should have DMI');
  assert(registry.has('Overlap'), 'Should have Overlap');
});

runTest('列出所有特征分类', () => {
  const registry = createFeatureRegistry();
  registry.registerBatch([
    MAFeature,
    EMAFeature,
    RSIFeature,
    ATRFeature,
    IBSFeature,
    ADXFeature,
    DMIFeature,
    OverlapFeature,
  ]);
  
  const definitions = registry.listDefinitions();
  
  // 统计分类
  const categories = definitions.reduce((acc, def) => {
    acc[def.category] = (acc[def.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('   特征分类统计:', categories);
  
  assert(categories['trend'] >= 3, 'Should have trend indicators'); // MA, EMA, ADX, DMI
  assert(categories['momentum'] >= 1, 'Should have momentum indicators'); // RSI
  assert(categories['volatility'] >= 1, 'Should have volatility indicators'); // ATR
  assert(categories['price_pattern'] >= 2, 'Should have price pattern indicators'); // IBS, Overlap
});

// ========================================
// 测试总结
// ========================================
setTimeout(() => {
  console.log('\n==================================================');
  console.log('📊 扩展测试结果总结');
  console.log('==================================================');
  console.log(`✅ 通过: ${passedTests}`);
  console.log(`❌ 失败: ${failedTests}`);
  console.log(`📈 通过率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  console.log('==================================================\n');

  if (failedTests === 0) {
    console.log('🎉 所有扩展测试通过！所有内置特征工作正常！\n');
    console.log('✅ 已实现特征列表:');
    console.log('   1. MA - 移动平均');
    console.log('   2. EMA - 指数移动平均');
    console.log('   3. RSI - 相对强弱指标');
    console.log('   4. ATR - 平均真实波动');
    console.log('   5. IBS - 内部柱强度');
    console.log('   6. ADX - 平均趋向指标');
    console.log('   7. DMI - 趋向运动指标');
    console.log('   8. Overlap - K线重叠度\n');
    process.exit(0);
  } else {
    console.log('⚠️  存在失败的测试，请检查错误信息\n');
    process.exit(1);
  }
}, 2000); // 等待异步测试完成

