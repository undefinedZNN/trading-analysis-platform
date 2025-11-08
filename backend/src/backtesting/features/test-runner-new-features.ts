/**
 * 新增特征测试运行器
 * 
 * 测试 MACD, Bollinger Bands, Stochastic 三个新特征
 */

import { of } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { createFeatureRegistry } from './registry';
import {
  MACDFeature,
  BollingerBandsFeature,
  StochasticFeature,
  BUILT_IN_FEATURES,
} from './built-in';
import { BarEvent } from '../data/timeframe/interfaces';

// 简单的断言函数
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
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

// 创建递增价格的测试数据
function createTrendingBars(count: number, startPrice: number = 100, trend: 'up' | 'down' | 'sideways' = 'up'): BarEvent[] {
  const bars: BarEvent[] = [];
  let price = startPrice;
  
  for (let i = 0; i < count; i++) {
    let change = 0;
    if (trend === 'up') {
      change = Math.random() * 2;
    } else if (trend === 'down') {
      change = -Math.random() * 2;
    } else {
      change = (Math.random() - 0.5) * 1;
    }
    
    price = price + change;
    const high = price + Math.random() * 2;
    const low = price - Math.random() * 2;
    
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

// ========================================
// 测试组 1: MACD 特征
// ========================================
console.log('\n📋 测试组 1: MACD 特征\n');

runTest('MACD 特征计算', async () => {
  const testBars = createTrendingBars(50, 100, 'up');
  const stream = of(...testBars);
  
  const result = await MACDFeature.compute(stream, {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
  }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 50, 'Should have 50 bars');
  
  // 所有bar都应该有MACD值（从第一个bar开始计算）
  let foundMACD = false;
  for (let i = 0; i < result!.length; i++) {
    const macdLine = result![i].features?.MACD_Line;
    const macdSignal = result![i].features?.MACD_Signal;
    const macdHist = result![i].features?.MACD_Histogram;
    
    if (macdLine && macdSignal && macdHist) {
      foundMACD = true;
      
      const line = parseFloat(macdLine as string);
      const signal = parseFloat(macdSignal as string);
      const hist = parseFloat(macdHist as string);
      
      // 验证 Histogram = Line - Signal
      const calculatedHist = line - signal;
      assert(
        Math.abs(hist - calculatedHist) < 0.01,
        `Histogram should equal Line - Signal, got ${hist}, expected ${calculatedHist}`
      );
      
      break;
    }
  }
  
  assert(foundMACD, 'Should have MACD values');
});

runTest('MACD 上涨趋势测试', async () => {
  const testBars = createTrendingBars(50, 100, 'up');
  const stream = of(...testBars);
  
  const result = await MACDFeature.compute(stream).pipe(toArray()).toPromise();
  
  // 上涨趋势中，后期的 MACD Line 应该偏正
  let positiveCount = 0;
  for (let i = 30; i < result!.length; i++) {
    const macdLine = result![i].features?.MACD_Line;
    if (macdLine) {
      const line = parseFloat(macdLine as string);
      if (line > 0) {
        positiveCount++;
      }
    }
  }
  
  // 至少一半应该是正值
  assert(positiveCount > 10, `In uptrend, MACD Line should be mostly positive, got ${positiveCount}/20`);
});

// ========================================
// 测试组 2: Bollinger Bands 特征
// ========================================
console.log('\n📋 测试组 2: Bollinger Bands 特征\n');

runTest('Bollinger Bands 特征计算', async () => {
  const testBars = createTrendingBars(50, 100, 'sideways');
  const stream = of(...testBars);
  
  const result = await BollingerBandsFeature.compute(stream, {
    period: 20,
    multiplier: 2,
  }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 50, 'Should have 50 bars');
  
  // 前20个bar没有足够数据
  for (let i = 0; i < 19; i++) {
    assert(
      !result![i].features?.BB_Upper,
      `Bar ${i} should not have BB values`
    );
  }
  
  // 后续bar应该有BB值
  for (let i = 20; i < 50; i++) {
    const upper = result![i].features?.BB_Upper;
    const middle = result![i].features?.BB_Middle;
    const lower = result![i].features?.BB_Lower;
    const percentB = result![i].features?.BB_PercentB;
    const bandwidth = result![i].features?.BB_Bandwidth;
    
    assert(upper !== undefined, `Bar ${i} should have BB_Upper`);
    assert(middle !== undefined, `Bar ${i} should have BB_Middle`);
    assert(lower !== undefined, `Bar ${i} should have BB_Lower`);
    assert(percentB !== undefined, `Bar ${i} should have BB_PercentB`);
    assert(bandwidth !== undefined, `Bar ${i} should have BB_Bandwidth`);
    
    // 验证 Upper > Middle > Lower
    const u = parseFloat(upper as string);
    const m = parseFloat(middle as string);
    const l = parseFloat(lower as string);
    
    assert(u > m, `Upper (${u}) should be > Middle (${m})`);
    assert(m > l, `Middle (${m}) should be > Lower (${l})`);
    
    // %B 应该在合理范围内（通常 -0.5 到 1.5）
    const pb = parseFloat(percentB as string);
    assert(pb >= -1 && pb <= 2, `%B should be in reasonable range, got ${pb}`);
  }
});

runTest('Bollinger Bands 价格在范围内', async () => {
  const testBars = createTrendingBars(30, 100, 'sideways');
  const stream = of(...testBars);
  
  const result = await BollingerBandsFeature.compute(stream, {
    period: 20,
    multiplier: 2,
  }).pipe(toArray()).toPromise();
  
  // 检查价格是否大多数时候在带内
  let withinBands = 0;
  let total = 0;
  
  for (let i = 20; i < result!.length; i++) {
    const close = parseFloat(result![i].close as string);
    const upper = parseFloat(result![i].features?.BB_Upper as string);
    const lower = parseFloat(result![i].features?.BB_Lower as string);
    
    if (close >= lower && close <= upper) {
      withinBands++;
    }
    total++;
  }
  
  // 在正常市场中，95%的价格应该在2倍标准差内
  const percentage = (withinBands / total) * 100;
  console.log(`   价格在带内比例: ${percentage.toFixed(1)}%`);
  assert(percentage > 70, `Most prices should be within bands, got ${percentage}%`);
});

// ========================================
// 测试组 3: Stochastic 特征
// ========================================
console.log('\n📋 测试组 3: Stochastic 特征\n');

runTest('Stochastic 特征计算', async () => {
  const testBars = createTrendingBars(50, 100, 'sideways');
  const stream = of(...testBars);
  
  const result = await StochasticFeature.compute(stream, {
    kPeriod: 14,
    dPeriod: 3,
    smoothK: 3,
  }).pipe(toArray()).toPromise();
  
  assert(result !== undefined, 'Should get result');
  assert(result!.length === 50, 'Should have 50 bars');
  
  // 前14个bar没有足够数据
  for (let i = 0; i < 13; i++) {
    assert(
      !result![i].features?.Stochastic_K,
      `Bar ${i} should not have Stochastic values`
    );
  }
  
  // 后续bar应该有%K值
  for (let i = 14; i < 50; i++) {
    const k = result![i].features?.Stochastic_K;
    
    assert(k !== undefined, `Bar ${i} should have Stochastic_K`);
    
    const kValue = parseFloat(k as string);
    assert(kValue >= 0 && kValue <= 100, `%K should be 0-100, got ${kValue}`);
  }
  
  // 检查是否有%D值（需要足够的%K值）
  let foundD = false;
  for (let i = 20; i < 50; i++) {
    const d = result![i].features?.Stochastic_D;
    if (d) {
      foundD = true;
      const dValue = parseFloat(d as string);
      assert(dValue >= 0 && dValue <= 100, `%D should be 0-100, got ${dValue}`);
    }
  }
  
  assert(foundD, 'Should have Stochastic_D values');
});

runTest('Stochastic 超买超卖检测', async () => {
  // 创建明显的超买条件（持续上涨到高位）
  const bars: BarEvent[] = [];
  let price = 100;
  
  for (let i = 0; i < 30; i++) {
    // 持续上涨
    price = price + 1;
    
    bars.push({
      sequenceId: `test-${i}`,
      timestamp: new Date(Date.now() + i * 60000).toISOString(),
      symbol: 'TEST-USDT',
      timeframe: '1m',
      open: (price - 0.5).toFixed(2),
      high: (price + 0.5).toFixed(2),
      low: (price - 0.5).toFixed(2),
      close: price.toFixed(2),
      volume: '1000.00',
      source: 'test',
    });
  }
  
  const stream = of(...bars);
  const result = await StochasticFeature.compute(stream, {
    kPeriod: 14,
    dPeriod: 3,
    smoothK: 1,
  }).pipe(toArray()).toPromise();
  
  // 持续上涨应该导致%K接近100
  const lastK = result![result!.length - 1].features?.Stochastic_K;
  if (lastK) {
    const kValue = parseFloat(lastK as string);
    console.log(`   持续上涨后的 %K: ${kValue}`);
    assert(kValue > 70, `In strong uptrend, %K should be > 70, got ${kValue}`);
  }
});

// ========================================
// 测试组 4: 特征组合测试
// ========================================
console.log('\n📋 测试组 4: 特征组合测试\n');

runTest('注册所有新特征', () => {
  const registry = createFeatureRegistry();
  registry.registerBatch([
    MACDFeature,
    BollingerBandsFeature,
    StochasticFeature,
  ]);
  
  assert(registry.getFeatureCount() === 3, 'Should have 3 features');
  assert(registry.has('MACD'), 'Should have MACD');
  assert(registry.has('BollingerBands'), 'Should have BollingerBands');
  assert(registry.has('Stochastic'), 'Should have Stochastic');
});

runTest('验证所有13个内置特征', () => {
  const registry = createFeatureRegistry();
  registry.registerBatch(BUILT_IN_FEATURES);
  
  assert(registry.getFeatureCount() === 13, 'Should have 13 features total');
  
  const definitions = registry.listDefinitions();
  
  // 统计分类
  const categories = definitions.reduce((acc, def) => {
    const cat = def.category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('   特征分类统计:', categories);
  
  assert(categories['trend'] >= 3, 'Should have trend indicators');
  assert(categories['momentum'] >= 2, 'Should have momentum indicators');
  assert(categories['volatility'] >= 2, 'Should have volatility indicators');
  assert(categories['price_pattern'] >= 2, 'Should have price pattern indicators');
});

// ========================================
// 测试总结
// ========================================
setTimeout(() => {
  console.log('\n==================================================');
  console.log('📊 新增特征测试结果总结');
  console.log('==================================================');
  console.log(`✅ 通过: ${passedTests}`);
  console.log(`❌ 失败: ${failedTests}`);
  console.log(`📈 通过率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  console.log('==================================================\n');

  if (failedTests === 0) {
    console.log('🎉 所有新增特征测试通过！\n');
    console.log('✅ 新增特征列表:');
    console.log('   1. MACD - 指数平滑异同移动平均线');
    console.log('   2. Bollinger Bands - 布林带');
    console.log('   3. Stochastic - 随机指标\n');
    console.log('📊 总计: 11个内置特征 (原8个 + 新3个)\n');
    process.exit(0);
  } else {
    console.log('⚠️  存在失败的测试，请检查错误信息\n');
    process.exit(1);
  }
}, 2000);

