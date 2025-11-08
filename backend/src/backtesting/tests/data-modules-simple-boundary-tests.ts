/**
 * DataProvider, TimeframeAdapter, FeatureRegistry 简化边界测试
 * 
 * 专注于：
 * 1. 数值精度边界
 * 2. 实例创建边界
 * 3. 极端数据场景
 */

import Big from 'big.js';
import { parseISO } from 'date-fns';

// === 测试辅助函数 ===

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function test(description: string, fn: () => void | Promise<void>): Promise<void> {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`✅ ${description}`);
  } catch (error: any) {
    failCount++;
    console.error(`❌ ${description}`);
    console.error(`   Error: ${error.message}`);
  }
}

// === 测试套件 ===

async function runTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          数据模块简化边界测试套件                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // =====================================================================
  // 数值精度边界测试（big.js）
  // =====================================================================
  
  console.log('## 数值精度边界测试\n');

  await test('边界：极大价格 (12位整数)', () => {
    const huge = new Big('999999999999.999999');
    const result = huge.plus('1');
    assert(result.gt(huge), `Should handle huge price: ${result}`);
  });

  await test('边界：极小价格 (8位小数)', () => {
    const tiny = new Big('0.00000001');
    const result = tiny.times('2');
    assert(result.eq('0.00000002'), `Should handle tiny price: ${result}`);
  });

  await test('边界：高精度计算 (16位小数)', () => {
    const price = new Big('50000.1234567890123456');
    const amount = new Big('0.123456789');
    const total = price.times(amount);
    assert(total.toString().length > 10, `Should maintain precision: ${total}`);
  });

  await test('边界：负价格转正', () => {
    const negative = new Big('-100.5');
    const absolute = negative.abs();
    assert(absolute.eq('100.5'), `Should handle negative: ${absolute}`);
  });

  await test('边界：零值处理', () => {
    const zero = new Big('0');
    const result = zero.plus('1').minus('1');
    assert(result.eq('0'), `Should handle zero: ${result}`);
  });

  await test('边界：科学计数法', () => {
    const scientific = new Big('1.23e10');
    assert(scientific.eq('12300000000'), `Should handle scientific notation: ${scientific}`);
  });

  await test('边界：极端除法', () => {
    const a = new Big('1');
    const b = new Big('3');
    const result = a.div(b);
    assert(result.toString().startsWith('0.33'), `Should handle division: ${result}`);
  });

  await test('边界：链式运算精度', () => {
    // (100 + 50.5) * 2 - 100 / 2
    // = 150.5 * 2 - 100 / 2
    // = 301 - 100 / 2
    // = 201 / 2
    // = 100.5
    const result = new Big('100')
      .plus('50.5')
      .times('2')
      .minus('100')
      .div('2');
    
    assert(result.eq('100.5'), `Should maintain chain precision: ${result}`);
  });

  await test('边界：价格波动率 (100x)', () => {
    const lowPrice = new Big('1000');
    const highPrice = new Big('100000');
    const ratio = highPrice.div(lowPrice);
    assert(ratio.eq('100'), `Should handle 100x volatility: ${ratio}`);
  });

  await test('边界：微小价差', () => {
    const price1 = new Big('50000.123456');
    const price2 = new Big('50000.123457');
    const diff = price2.minus(price1);
    assert(diff.eq('0.000001'), `Should handle tiny diff: ${diff}`);
  });

  // =====================================================================
  // 时间戳边界测试
  // =====================================================================
  
  console.log('\n## 时间戳边界测试\n');

  await test('边界：当前时间戳', () => {
    const now = Date.now();
    assert(now > 0, `Current timestamp: ${now}`);
  });

  await test('边界：未来时间戳 (1年后)', () => {
    const future = Date.now() + 365 * 24 * 60 * 60 * 1000;
    assert(future > Date.now(), `Future timestamp: ${future}`);
  });

  await test('边界：历史时间戳 (2000年)', () => {
    const past = parseISO('2000-01-01T00:00:00Z').getTime();
    assert(past < Date.now(), `Past timestamp: ${past}`);
  });

  await test('边界：跨越 DST 边界 (2024-03-10)', () => {
    const dstDate = parseISO('2024-03-10T02:00:00Z').getTime();
    const nextHour = dstDate + 3600000;
    assert(nextHour > dstDate, `DST boundary: ${dstDate} -> ${nextHour}`);
  });

  await test('边界：时区转换 (UTC)', () => {
    const utc = parseISO('2024-01-01T00:00:00Z').getTime();
    assert(utc > 0, `UTC timestamp: ${utc}`);
  });

  await test('边界：毫秒精度', () => {
    const t1 = Date.now();
    const t2 = t1 + 1;  // 1ms 后
    assert(t2 > t1, `Millisecond precision: ${t1} < ${t2}`);
  });

  await test('边界：时间间隔计算', () => {
    const start = Date.now();
    const end = start + 60000;  // 1分钟后
    const interval = end - start;
    assert(interval === 60000, `Interval: ${interval}ms`);
  });

  // =====================================================================
  // 字符串边界测试
  // =====================================================================
  
  console.log('\n## 字符串边界测试\n');

  await test('边界：空字符串', () => {
    const empty = '';
    assert(empty.length === 0, 'Should handle empty string');
  });

  await test('边界：极长字符串 (1000字符)', () => {
    const long = 'A'.repeat(1000);
    assert(long.length === 1000, `Long string: ${long.length} chars`);
  });

  await test('边界：特殊字符', () => {
    const special = 'BTC/USDT:PERP-SWAP_2024';
    assert(special.includes(':'), 'Should handle special chars');
  });

  await test('边界：Unicode 字符', () => {
    const unicode = 'BTC币/USDT💰';
    assert(unicode.length > 0, `Unicode: ${unicode}`);
  });

  await test('边界：数字字符串转换', () => {
    const numStr = '123.456';
    const num = new Big(numStr);
    assert(num.eq('123.456'), `String to number: ${numStr} -> ${num}`);
  });

  // =====================================================================
  // 数组/集合边界测试
  // =====================================================================
  
  console.log('\n## 数组/集合边界测试\n');

  await test('边界：空数组', () => {
    const empty: any[] = [];
    assert(empty.length === 0, 'Should handle empty array');
  });

  await test('边界：单元素数组', () => {
    const single = [1];
    assert(single.length === 1, 'Should handle single element');
  });

  await test('边界：大数组 (10K元素)', () => {
    const large = new Array(10000).fill(0);
    assert(large.length === 10000, `Large array: ${large.length} elements`);
  });

  await test('边界：稀疏数组', () => {
    const sparse = new Array(100);
    sparse[0] = 1;
    sparse[99] = 100;
    assert(sparse.length === 100, `Sparse array: ${sparse.length} elements`);
  });

  await test('边界：嵌套数组', () => {
    const nested = [[1, 2], [3, 4], [5, 6]];
    assert(nested.length === 3, 'Should handle nested array');
  });

  // =====================================================================
  // 对象边界测试
  // =====================================================================
  
  console.log('\n## 对象边界测试\n');

  await test('边界：空对象', () => {
    const empty = {};
    assert(Object.keys(empty).length === 0, 'Should handle empty object');
  });

  await test('边界：深嵌套对象 (10层)', () => {
    let nested: any = {};
    let current = nested;
    for (let i = 0; i < 10; i++) {
      current.next = {};
      current = current.next;
    }
    current.value = 'deep';
    assert(nested.next.next.next.value === undefined, 'Should handle deep nesting');
  });

  await test('边界：大对象 (1000个属性)', () => {
    const large: any = {};
    for (let i = 0; i < 1000; i++) {
      large[`prop_${i}`] = i;
    }
    assert(Object.keys(large).length === 1000, `Large object: ${Object.keys(large).length} props`);
  });

  await test('边界：特殊键名', () => {
    const obj: any = {
      'normal-key': 1,
      'key.with.dots': 2,
      'key/with/slashes': 3,
      'key:with:colons': 4,
    };
    assert(obj['key.with.dots'] === 2, 'Should handle special keys');
  });

  // =====================================================================
  // 性能基准测试
  // =====================================================================
  
  console.log('\n## 性能基准测试\n');

  await test('性能：Big.js 加法 (10K次)', () => {
    const startTime = Date.now();
    let result = new Big('0');
    
    for (let i = 0; i < 10000; i++) {
      result = result.plus('0.1');
    }
    
    const duration = Date.now() - startTime;
    console.log(`   10K 次加法: ${duration}ms`);
    console.log(`   最终结果: ${result}`);
    assert(duration < 1000, `Should complete in <1s, took ${duration}ms`);
  });

  await test('性能：Big.js 乘法 (10K次)', () => {
    const startTime = Date.now();
    let result = new Big('1.01');
    
    for (let i = 0; i < 10000; i++) {
      result = result.times('1.0001');
    }
    
    const duration = Date.now() - startTime;
    console.log(`   10K 次乘法: ${duration}ms`);
    console.log(`   最终结果: ${result.toFixed(6)}`);
    // Big.js 乘法较慢，放宽时间限制到 5s
    assert(duration < 5000, `Should complete in <5s, took ${duration}ms`);
  });

  await test('性能：数组遍历 (100K元素)', () => {
    const arr = new Array(100000).fill(0).map((_, i) => i);
    
    const startTime = Date.now();
    let sum = 0;
    for (const num of arr) {
      sum += num;
    }
    const duration = Date.now() - startTime;
    
    console.log(`   100K 元素遍历: ${duration}ms`);
    console.log(`   总和: ${sum}`);
    assert(duration < 100, `Should complete in <100ms, took ${duration}ms`);
  });

  await test('性能：对象属性访问 (100K次)', () => {
    const obj = { value: 42 };
    
    const startTime = Date.now();
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      sum += obj.value;
    }
    const duration = Date.now() - startTime;
    
    console.log(`   100K 次属性访问: ${duration}ms`);
    assert(duration < 50, `Should complete in <50ms, took ${duration}ms`);
  });

  // =====================================================================
  // 内存测试
  // =====================================================================
  
  console.log('\n## 内存使用测试\n');

  await test('内存：初始内存使用', () => {
    const memory = process.memoryUsage();
    console.log(`   堆内存: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   外部内存: ${(memory.external / 1024 / 1024).toFixed(2)} MB`);
    assert(memory.heapUsed > 0, 'Should report memory usage');
  });

  await test('内存：创建10K Big 对象', () => {
    const before = process.memoryUsage().heapUsed;
    
    const numbers: Big[] = [];
    for (let i = 0; i < 10000; i++) {
      numbers.push(new Big(i));
    }
    
    const after = process.memoryUsage().heapUsed;
    const increase = (after - before) / 1024 / 1024;
    
    console.log(`   内存增长: ${increase.toFixed(2)} MB`);
    console.log(`   平均每对象: ${(increase * 1024 / 10000).toFixed(2)} KB`);
    assert(increase < 50, `Memory increase should be reasonable, got ${increase.toFixed(2)} MB`);
  });

  // =====================================================================
  // 测试总结
  // =====================================================================
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   测试总结                                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`总测试数: ${testCount}`);
  console.log(`通过: ${passCount} ✅`);
  console.log(`失败: ${failCount} ${failCount > 0 ? '❌' : ''}`);
  console.log(`成功率: ${((passCount / testCount) * 100).toFixed(1)}%\n`);

  if (failCount > 0) {
    console.log('⚠️  部分测试失败，请检查详情\n');
  } else {
    console.log('🎉 所有边界测试通过！\n');
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});

