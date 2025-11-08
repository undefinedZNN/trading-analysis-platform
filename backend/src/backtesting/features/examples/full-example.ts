/**
 * FeatureRegistry 完整使用示例
 * 
 * 演示如何使用特征注册表计算各种技术指标
 */

import { of } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { createFeatureRegistry } from '../registry';
import {
  MAFeature,
  EMAFeature,
  RSIFeature,
  ATRFeature,
  IBSFeature,
  ADXFeature,
  DMIFeature,
  OverlapFeature,
  BUILT_IN_FEATURES,
} from '../built-in';
import { BarEvent } from '../../data/timeframe/interfaces';

/**
 * 创建示例数据
 */
function createSampleData(): BarEvent[] {
  const bars: BarEvent[] = [];
  let price = 50000;
  const startDate = new Date('2024-01-01T00:00:00Z');
  
  for (let i = 0; i < 100; i++) {
    // 模拟价格波动
    const change = (Math.random() - 0.48) * 200; // 轻微上涨趋势
    price = price + change;
    
    const high = price + Math.random() * 100;
    const low = price - Math.random() * 100;
    const open = price + (Math.random() - 0.5) * 50;
    const close = price;
    const volume = 10 + Math.random() * 20;
    
    const timestamp = new Date(startDate.getTime() + i * 3600000); // 每小时
    
    bars.push({
      sequenceId: `bar-${i}`,
      timestamp: timestamp.toISOString(),
      symbol: 'BTC-USDT',
      timeframe: '1h',
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: volume.toFixed(4),
      source: 'example',
    });
  }
  
  return bars;
}

/**
 * 示例 1: 基本特征计算
 */
async function example1_BasicFeatures() {
  console.log('\n=== 示例 1: 基本特征计算 ===\n');
  
  const bars = createSampleData();
  const stream = of(...bars);
  
  // 计算 MA(20)
  const result = await MAFeature.compute(stream, { window: 20 })
    .pipe(toArray())
    .toPromise();
  
  // 显示最后10个结果
  console.log('MA(20) 最后10个值:');
  result!.slice(-10).forEach(bar => {
    const ma = bar.features?.MA;
    if (ma) {
      console.log(`${bar.timestamp}: ${bar.close} -> MA = ${ma}`);
    }
  });
}

/**
 * 示例 2: RSI 超买超卖检测
 */
async function example2_RSIOverboughtOversold() {
  console.log('\n=== 示例 2: RSI 超买超卖检测 ===\n');
  
  const bars = createSampleData();
  const stream = of(...bars);
  
  const result = await RSIFeature.compute(stream, { period: 14 })
    .pipe(toArray())
    .toPromise();
  
  console.log('RSI 超买超卖信号:');
  result!.forEach(bar => {
    const rsi = bar.features?.RSI;
    if (rsi) {
      const rsiValue = parseFloat(rsi as string);
      
      if (rsiValue > 70) {
        console.log(`${bar.timestamp}: RSI = ${rsi} -> 超买 ⚠️`);
      } else if (rsiValue < 30) {
        console.log(`${bar.timestamp}: RSI = ${rsi} -> 超卖 ⚠️`);
      }
    }
  });
}

/**
 * 示例 3: ATR 动态止损
 */
async function example3_ATRDynamicStopLoss() {
  console.log('\n=== 示例 3: ATR 动态止损 ===\n');
  
  const bars = createSampleData();
  const stream = of(...bars);
  
  const result = await ATRFeature.compute(stream, { period: 14 })
    .pipe(toArray())
    .toPromise();
  
  console.log('基于 ATR 的动态止损位 (2倍ATR):');
  result!.slice(-10).forEach(bar => {
    const atr = bar.features?.ATR;
    if (atr) {
      const atrValue = parseFloat(atr as string);
      const close = parseFloat(bar.close);
      const stopLoss = close - (atrValue * 2);
      
      console.log(`${bar.timestamp}: Price = ${close.toFixed(2)}, ATR = ${atr}, Stop Loss = ${stopLoss.toFixed(2)}`);
    }
  });
}

/**
 * 示例 4: IBS 均值回归策略
 */
async function example4_IBSMeanReversion() {
  console.log('\n=== 示例 4: IBS 均值回归策略 ===\n');
  
  const bars = createSampleData();
  const stream = of(...bars);
  
  const result = await IBSFeature.compute(stream, { precision: 4 })
    .pipe(toArray())
    .toPromise();
  
  console.log('IBS 均值回归信号:');
  result!.forEach(bar => {
    const ibs = bar.features?.IBS;
    if (ibs) {
      const ibsValue = parseFloat(ibs as string);
      
      if (ibsValue < 0.2) {
        console.log(`${bar.timestamp}: IBS = ${ibs} -> 可能反弹 📈`);
      } else if (ibsValue > 0.8) {
        console.log(`${bar.timestamp}: IBS = ${ibs} -> 可能回调 📉`);
      }
    }
  });
}

/**
 * 示例 5: DMI 趋势判断
 */
async function example5_DMITrendDetection() {
  console.log('\n=== 示例 5: DMI 趋势判断 ===\n');
  
  const bars = createSampleData();
  const stream = of(...bars);
  
  const result = await DMIFeature.compute(stream, { period: 14 })
    .pipe(toArray())
    .toPromise();
  
  console.log('DMI 趋势信号:');
  result!.slice(-10).forEach(bar => {
    const plusDI = bar.features?.PLUS_DI;
    const minusDI = bar.features?.MINUS_DI;
    
    if (plusDI && minusDI) {
      const plus = parseFloat(plusDI as string);
      const minus = parseFloat(minusDI as string);
      
      const trend = plus > minus ? '上涨趋势 📈' : '下跌趋势 📉';
      const strength = Math.abs(plus - minus).toFixed(2);
      
      console.log(`${bar.timestamp}: +DI = ${plusDI}, -DI = ${minusDI} -> ${trend} (强度: ${strength})`);
    }
  });
}

/**
 * 示例 6: Overlap 跳空检测
 */
async function example6_OverlapGapDetection() {
  console.log('\n=== 示例 6: Overlap 跳空检测 ===\n');
  
  const bars = createSampleData();
  const stream = of(...bars);
  
  const result = await OverlapFeature.compute(stream, { method: 'relative' })
    .pipe(toArray())
    .toPromise();
  
  console.log('K线重叠度分析:');
  result!.forEach(bar => {
    const overlap = bar.features?.Overlap;
    if (overlap !== undefined) {
      const overlapValue = parseFloat(overlap as string);
      
      if (overlapValue === 0) {
        console.log(`${bar.timestamp}: Overlap = ${overlap} -> 跳空缺口 ⚠️`);
      } else if (overlapValue > 0.95) {
        console.log(`${bar.timestamp}: Overlap = ${overlap} -> 高度盘整 📊`);
      }
    }
  });
}

/**
 * 示例 7: 注册表管理
 */
function example7_RegistryManagement() {
  console.log('\n=== 示例 7: 注册表管理 ===\n');
  
  const registry = createFeatureRegistry();
  
  // 批量注册所有内置特征
  registry.registerBatch(BUILT_IN_FEATURES);
  
  console.log(`已注册特征数量: ${registry.getFeatureCount()}`);
  
  // 列出所有特征
  const definitions = registry.listDefinitions();
  
  console.log('\n已注册特征列表:');
  definitions.forEach((def, index) => {
    console.log(`${index + 1}. ${def.id} (${def.category || 'uncategorized'}) - ${def.description}`);
  });
  
  // 按分类统计
  const byCategory = definitions.reduce((acc, def) => {
    const cat = def.category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('\n按分类统计:');
  Object.entries(byCategory).forEach(([category, count]) => {
    console.log(`  ${category}: ${count}`);
  });
}

/**
 * 示例 8: 参数校验
 */
function example8_ParameterValidation() {
  console.log('\n=== 示例 8: 参数校验 ===\n');
  
  const registry = createFeatureRegistry();
  registry.register(RSIFeature);
  
  // 有效参数
  console.log('测试有效参数:');
  const valid = registry.validateParams('RSI', {
    period: 14,
    source: 'close',
  });
  console.log(`  结果: ${valid.valid ? '✅ 通过' : '❌ 失败'}`);
  
  // 无效参数 - 周期过小
  console.log('\n测试无效参数 (period = 0):');
  const invalid1 = registry.validateParams('RSI', {
    period: 0,
    source: 'close',
  });
  console.log(`  结果: ${invalid1.valid ? '✅ 通过' : '❌ 失败'}`);
  console.log(`  错误: ${invalid1.errors.join(', ')}`);
  
  // 无效参数 - 枚举值错误
  console.log('\n测试无效参数 (source = "invalid"):');
  const invalid2 = registry.validateParams('RSI', {
    period: 14,
    source: 'invalid',
  });
  console.log(`  结果: ${invalid2.valid ? '✅ 通过' : '❌ 失败'}`);
  console.log(`  错误: ${invalid2.errors.join(', ')}`);
}

/**
 * 示例 9: 依赖解析
 */
function example9_DependencyResolution() {
  console.log('\n=== 示例 9: 依赖解析 ===\n');
  
  const registry = createFeatureRegistry();
  registry.registerBatch(BUILT_IN_FEATURES);
  
  // 配置需要计算的特征
  const configs = [
    { featureId: 'MA', params: { window: 20 }, outputKey: 'MA_20' },
    { featureId: 'EMA', params: { window: 50 }, outputKey: 'EMA_50' },
    { featureId: 'RSI', params: { period: 14 }, outputKey: 'RSI_14' },
    { featureId: 'ATR', params: { period: 14 }, outputKey: 'ATR_14' },
    { featureId: 'ADX', params: { period: 14 }, outputKey: 'ADX_14' },
  ];
  
  // 解析依赖
  const resolved = registry.resolve(configs);
  
  console.log('特征计算顺序:');
  resolved.forEach((feature, index) => {
    console.log(`${index + 1}. ${feature.id}`);
    console.log(`   参数: ${JSON.stringify(feature.params)}`);
    console.log(`   输出: ${feature.outputKeys.join(', ')}`);
    console.log(`   依赖: ${feature.dependencies.map(d => d.ref).join(', ') || '无'}`);
  });
  
  // 生成特征目录
  const catalog = registry.generateCatalog(resolved);
  
  console.log('\n特征目录:');
  console.log(`  总数: ${catalog.total}`);
  console.log(`  按分类:`);
  Object.entries(catalog.byCategory).forEach(([category, features]) => {
    console.log(`    ${category}: ${features.length} 个`);
  });
}

/**
 * 示例 10: 综合策略
 */
async function example10_ComprehensiveStrategy() {
  console.log('\n=== 示例 10: 综合交易策略 ===\n');
  
  const bars = createSampleData();
  const stream = of(...bars);
  
  // 计算多个特征
  const maResult = await MAFeature.compute(stream, { window: 20 }).pipe(toArray()).toPromise();
  const rsiResult = await RSIFeature.compute(stream, { period: 14 }).pipe(toArray()).toPromise();
  const atrResult = await ATRFeature.compute(stream, { period: 14 }).pipe(toArray()).toPromise();
  
  console.log('综合策略信号 (MA + RSI + ATR):');
  console.log('买入条件: 价格 > MA20 且 RSI < 40');
  console.log('卖出条件: 价格 < MA20 且 RSI > 60');
  console.log('止损: 当前价格 - 2*ATR\n');
  
  // 合并结果
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const ma = maResult![i].features?.MA;
    const rsi = rsiResult![i].features?.RSI;
    const atr = atrResult![i].features?.ATR;
    
    if (ma && rsi && atr) {
      const price = parseFloat(bar.close);
      const maValue = parseFloat(ma as string);
      const rsiValue = parseFloat(rsi as string);
      const atrValue = parseFloat(atr as string);
      
      const stopLoss = price - (atrValue * 2);
      
      // 买入信号
      if (price > maValue && rsiValue < 40) {
        console.log(`${bar.timestamp}: 买入信号 📈`);
        console.log(`  价格: ${price.toFixed(2)}`);
        console.log(`  MA20: ${maValue.toFixed(2)}`);
        console.log(`  RSI: ${rsiValue.toFixed(2)}`);
        console.log(`  止损: ${stopLoss.toFixed(2)}`);
      }
      
      // 卖出信号
      if (price < maValue && rsiValue > 60) {
        console.log(`${bar.timestamp}: 卖出信号 📉`);
        console.log(`  价格: ${price.toFixed(2)}`);
        console.log(`  MA20: ${maValue.toFixed(2)}`);
        console.log(`  RSI: ${rsiValue.toFixed(2)}`);
      }
    }
  }
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   FeatureRegistry 完整使用示例                    ║');
  console.log('╚════════════════════════════════════════════════════╝');
  
  try {
    await example1_BasicFeatures();
    await example2_RSIOverboughtOversold();
    await example3_ATRDynamicStopLoss();
    await example4_IBSMeanReversion();
    await example5_DMITrendDetection();
    await example6_OverlapGapDetection();
    example7_RegistryManagement();
    example8_ParameterValidation();
    example9_DependencyResolution();
    await example10_ComprehensiveStrategy();
    
    console.log('\n\n✅ 所有示例运行完成！');
  } catch (error) {
    console.error('\n\n❌ 示例运行出错:', error);
    process.exit(1);
  }
}

// 运行示例
if (require.main === module) {
  runAllExamples();
}

export {
  example1_BasicFeatures,
  example2_RSIOverboughtOversold,
  example3_ATRDynamicStopLoss,
  example4_IBSMeanReversion,
  example5_DMITrendDetection,
  example6_OverlapGapDetection,
  example7_RegistryManagement,
  example8_ParameterValidation,
  example9_DependencyResolution,
  example10_ComprehensiveStrategy,
};

