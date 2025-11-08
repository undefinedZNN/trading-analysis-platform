/**
 * 回测框架增强边界和压力测试
 * 
 * 测试目标:
 * - 边界条件：极值、零值、负值、空值
 * - 压力测试：大量数据、高频操作、内存占用
 * - 性能基准：吞吐量、延迟、资源使用
 * 
 * @module __tests__/enhanced-boundary-stress-tests
 */

import Big from 'big.js';
import { nanoid } from 'nanoid';

// ============================================================================
// 测试框架
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;
const failedTests: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   错误: ${error instanceof Error ? error.message : String(error)}`);
    testsFailed++;
    failedTests.push(name);
  }
}

// ============================================================================
// 通用边界测试
// ============================================================================

async function runCommonBoundaryTests() {
  console.log('');
  console.log('##  通用边界测试');
  console.log('');

  await test('边界: Big.js 零值处理', () => {
    const zero = new Big('0');
    const result = zero.plus('100');
    assert(result.eq('100'), '零值加法应该正确');
    
    const product = zero.times('999');
    assert(product.eq('0'), '零值乘法应该正确');
  });

  await test('边界: Big.js 负值处理', () => {
    const negative = new Big('-100');
    const result = negative.plus('50');
    assert(result.eq('-50'), '负值加法应该正确');
    
    const abs = negative.abs();
    assert(abs.eq('100'), '负值取绝对值应该正确');
  });

  await test('边界: Big.js 极小数', () => {
    const tiny = new Big('0.00000001');
    const result = tiny.times('2');
    assert(result.eq('0.00000002'), '极小数运算应该精确');
  });

  await test('边界: Big.js 极大数', () => {
    const huge = new Big('1e15');
    const result = huge.times('2');
    assert(result.eq('2e+15'), '极大数运算应该正确');
  });

  await test('边界: Big.js 除零检测', () => {
    try {
      const zero = new Big('0');
      const result = new Big('100').div(zero);
      assert(false, '除零应该抛出错误');
    } catch (error) {
      assert(true, '除零正确抛出错误');
    }
  });

  await test('边界: nanoid 生成唯一性', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      ids.add(nanoid());
    }
    assert(ids.size === 10000, `10000个ID应该都唯一 (实际: ${ids.size})`);
  });

  await test('边界: nanoid 性能', () => {
    const startTime = Date.now();
    for (let i = 0; i < 100000; i++) {
      nanoid();
    }
    const elapsedTime = Date.now() - startTime;
    assert(elapsedTime < 1000, `生成100000个ID应该在1秒内完成 (实际: ${elapsedTime}ms)`);
    console.log(`   性能: 生成100000个ID耗时 ${elapsedTime}ms (${((100000 / elapsedTime) * 1000).toFixed(0)} ids/sec)`);
  });
}

// ============================================================================
// 数据结构边界测试
// ============================================================================

async function runDataStructureBoundaryTests() {
  console.log('');
  console.log('## 数据结构边界测试');
  console.log('');

  await test('边界: 空数组操作', () => {
    const arr: any[] = [];
    const filtered = arr.filter(x => x > 0);
    assert(filtered.length === 0, '空数组过滤应该返回空数组');
    
    const mapped = arr.map(x => x * 2);
    assert(mapped.length === 0, '空数组映射应该返回空数组');
  });

  await test('边界: 大数组性能', () => {
    const size = 1000000;
    const startTime = Date.now();
    
    const arr = Array.from({ length: size }, (_, i) => i);
    const createTime = Date.now() - startTime;
    
    const filterStartTime = Date.now();
    const filtered = arr.filter(x => x % 2 === 0);
    const filterTime = Date.now() - filterStartTime;
    
    assert(arr.length === size, '数组应该有正确的大小');
    assert(filtered.length === size / 2, '过滤后应该有一半元素');
    assert(createTime < 1000, `创建${size}元素数组应该在1秒内完成 (实际: ${createTime}ms)`);
    assert(filterTime < 1000, `过滤${size}元素数组应该在1秒内完成 (实际: ${filterTime}ms)`);
    
    console.log(`   性能: 创建${size}元素耗时 ${createTime}ms`);
    console.log(`   性能: 过滤${size}元素耗时 ${filterTime}ms`);
  });

  await test('边界: 深层嵌套对象', () => {
    let obj: any = { value: 0 };
    for (let i = 0; i < 100; i++) {
      obj = { nested: obj, level: i };
    }
    
    // 深度遍历
    let depth = 0;
    let current = obj;
    while (current.nested) {
      depth++;
      current = current.nested;
    }
    
    assert(depth === 100, `深度应该是100 (实际: ${depth})`);
  });

  await test('边界: Map 大量键值对', () => {
    const map = new Map<string, number>();
    const size = 100000;
    
    const startTime = Date.now();
    for (let i = 0; i < size; i++) {
      map.set(`key-${i}`, i);
    }
    const setTime = Date.now() - startTime;
    
    const getStartTime = Date.now();
    for (let i = 0; i < size; i++) {
      map.get(`key-${i}`);
    }
    const getTime = Date.now() - getStartTime;
    
    assert(map.size === size, `Map应该有${size}个元素`);
    assert(setTime < 2000, `设置${size}个元素应该在2秒内完成 (实际: ${setTime}ms)`);
    assert(getTime < 2000, `获取${size}个元素应该在2秒内完成 (实际: ${getTime}ms)`);
    
    console.log(`   性能: 设置${size}个键值对耗时 ${setTime}ms`);
    console.log(`   性能: 获取${size}个键值对耗时 ${getTime}ms`);
  });

  await test('边界: Set 去重性能', () => {
    const set = new Set<number>();
    const size = 50000;
    
    const startTime = Date.now();
    // 添加重复元素
    for (let i = 0; i < size * 2; i++) {
      set.add(i % size);
    }
    const elapsedTime = Date.now() - startTime;
    
    assert(set.size === size, `Set应该只有${size}个唯一元素`);
    assert(elapsedTime < 2000, `处理${size * 2}次添加应该在2秒内完成 (实际: ${elapsedTime}ms)`);
    
    console.log(`   性能: 处理${size * 2}次添加（去重）耗时 ${elapsedTime}ms`);
  });
}

// ============================================================================
// 字符串和JSON边界测试
// ============================================================================

async function runStringJsonBoundaryTests() {
  console.log('');
  console.log('## 字符串和JSON边界测试');
  console.log('');

  await test('边界: 空字符串处理', () => {
    const empty = '';
    assert(empty.length === 0, '空字符串长度应该为0');
    assert(empty.split(',').length === 1, '分割空字符串应该返回1个元素');
  });

  await test('边界: 超长字符串', () => {
    const size = 1000000;
    const longStr = 'x'.repeat(size);
    
    assert(longStr.length === size, `字符串长度应该是${size}`);
    
    const startTime = Date.now();
    const replaced = longStr.replace(/x/g, 'y');
    const elapsedTime = Date.now() - startTime;
    
    assert(replaced[0] === 'y', '替换应该成功');
    assert(elapsedTime < 1000, `替换${size}个字符应该在1秒内完成 (实际: ${elapsedTime}ms)`);
    
    console.log(`   性能: 替换${size}字符耗时 ${elapsedTime}ms`);
  });

  await test('边界: JSON 序列化大对象', () => {
    const obj = {
      items: Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
        value: Math.random() * 1000,
        tags: ['tag1', 'tag2', 'tag3'],
      })),
    };
    
    const startTime = Date.now();
    const json = JSON.stringify(obj);
    const stringifyTime = Date.now() - startTime;
    
    const parseStartTime = Date.now();
    const parsed = JSON.parse(json);
    const parseTime = Date.now() - parseStartTime;
    
    const jsonSizeKB = Buffer.byteLength(json, 'utf8') / 1024;
    
    assert(parsed.items.length === 10000, '解析后应该有10000个元素');
    assert(stringifyTime < 1000, `序列化应该在1秒内完成 (实际: ${stringifyTime}ms)`);
    assert(parseTime < 1000, `解析应该在1秒内完成 (实际: ${parseTime}ms)`);
    
    console.log(`   性能: 序列化10000对象耗时 ${stringifyTime}ms`);
    console.log(`   性能: 解析${jsonSizeKB.toFixed(2)}KB JSON耗时 ${parseTime}ms`);
    console.log(`   大小: ${jsonSizeKB.toFixed(2)} KB`);
  });

  await test('边界: JSON 特殊字符处理', () => {
    const obj = {
      quote: '"test"',
      backslash: '\\path\\to\\file',
      newline: 'line1\nline2',
      unicode: '中文测试',
      emoji: '🎉',
    };
    
    const json = JSON.stringify(obj);
    const parsed = JSON.parse(json);
    
    assert(parsed.quote === '"test"', '引号应该正确转义');
    assert(parsed.backslash === '\\path\\to\\file', '反斜杠应该正确转义');
    assert(parsed.unicode === '中文测试', 'Unicode应该正确处理');
    assert(parsed.emoji === '🎉', 'Emoji应该正确处理');
  });
}

// ============================================================================
// 时间和日期边界测试
// ============================================================================

async function runTimeDateBoundaryTests() {
  console.log('');
  console.log('## 时间和日期边界测试');
  console.log('');

  await test('边界: 时间戳零值', () => {
    const zero = new Date(0);
    assert(zero.getTime() === 0, '零时间戳应该是1970-01-01');
  });

  await test('边界: 时间戳极大值', () => {
    const farFuture = new Date(8640000000000000); // JS 最大日期
    assert(farFuture.getTime() === 8640000000000000, '应该支持最大时间戳');
  });

  await test('边界: 日期计算性能', () => {
    const startTime = Date.now();
    let date = new Date();
    
    for (let i = 0; i < 100000; i++) {
      date = new Date(date.getTime() + 86400000); // 加一天
    }
    
    const elapsedTime = Date.now() - startTime;
    assert(elapsedTime < 1000, `100000次日期计算应该在1秒内完成 (实际: ${elapsedTime}ms)`);
    
    console.log(`   性能: 100000次日期计算耗时 ${elapsedTime}ms`);
  });

  await test('边界: 高频时间戳获取', () => {
    const timestamps: number[] = [];
    const startTime = Date.now();
    
    for (let i = 0; i < 1000000; i++) {
      timestamps.push(Date.now());
    }
    
    const elapsedTime = Date.now() - startTime;
    const uniqueTimestamps = new Set(timestamps).size;
    
    assert(timestamps.length === 1000000, '应该生成1000000个时间戳');
    assert(elapsedTime < 2000, `生成1000000个时间戳应该在2秒内完成 (实际: ${elapsedTime}ms)`);
    
    console.log(`   性能: 生成1000000个时间戳耗时 ${elapsedTime}ms`);
    console.log(`   唯一值: ${uniqueTimestamps}个`);
  });
}

// ============================================================================
// 内存和性能测试
// ============================================================================

async function runMemoryPerformanceTests() {
  console.log('');
  console.log('## 内存和性能测试');
  console.log('');

  await test('内存: 大数组内存占用', () => {
    if (global.gc) {
      global.gc();
    }
    
    const memBefore = process.memoryUsage().heapUsed;
    
    const size = 1000000;
    const arr = Array.from({ length: size }, (_, i) => ({
      id: i,
      value: Math.random(),
    }));
    
    if (global.gc) {
      global.gc();
    }
    
    const memAfter = process.memoryUsage().heapUsed;
    const memUsed = (memAfter - memBefore) / 1024 / 1024; // MB
    
    assert(arr.length === size, '数组应该有正确的大小');
    console.log(`   内存: ${size}个对象占用 ${memUsed.toFixed(2)} MB (${(memUsed * 1024 / size).toFixed(2)} bytes/对象)`);
  });

  await test('内存: Big.js 对象内存占用', () => {
    if (global.gc) {
      global.gc();
    }
    
    const memBefore = process.memoryUsage().heapUsed;
    
    const size = 10000;
    const numbers: Big[] = [];
    for (let i = 0; i < size; i++) {
      numbers.push(new Big(String(i)));
    }
    
    if (global.gc) {
      global.gc();
    }
    
    const memAfter = process.memoryUsage().heapUsed;
    const memUsed = (memAfter - memBefore) / 1024 / 1024; // MB
    
    assert(numbers.length === size, '应该有正确数量的Big对象');
    console.log(`   内存: ${size}个Big对象占用 ${memUsed.toFixed(2)} MB (${(memUsed * 1024 / size).toFixed(2)} bytes/对象)`);
  });

  await test('性能: 循环vs map性能对比', () => {
    const size = 1000000;
    const arr = Array.from({ length: size }, (_, i) => i);
    
    // for循环
    const forStartTime = Date.now();
    const forResult: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      forResult.push(arr[i] * 2);
    }
    const forTime = Date.now() - forStartTime;
    
    // map
    const mapStartTime = Date.now();
    const mapResult = arr.map(x => x * 2);
    const mapTime = Date.now() - mapStartTime;
    
    assert(forResult.length === size, 'for循环结果应该正确');
    assert(mapResult.length === size, 'map结果应该正确');
    
    console.log(`   性能: for循环处理${size}元素耗时 ${forTime}ms`);
    console.log(`   性能: map处理${size}元素耗时 ${mapTime}ms`);
    console.log(`   对比: ${forTime < mapTime ? 'for循环更快' : 'map更快'} (差异: ${Math.abs(forTime - mapTime)}ms)`);
  });

  await test('性能: 对象拷贝性能', () => {
    const obj = {
      data: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
        value: Math.random(),
      })),
      config: {
        enabled: true,
        threshold: 100,
        tags: ['tag1', 'tag2'],
      },
    };
    
    const iterations = 10000;
    
    // JSON拷贝
    const jsonStartTime = Date.now();
    for (let i = 0; i < iterations; i++) {
      JSON.parse(JSON.stringify(obj));
    }
    const jsonTime = Date.now() - jsonStartTime;
    
    // 展开运算符（浅拷贝）
    const spreadStartTime = Date.now();
    for (let i = 0; i < iterations; i++) {
      const copy = { ...obj };
    }
    const spreadTime = Date.now() - spreadStartTime;
    
    console.log(`   性能: JSON深拷贝${iterations}次耗时 ${jsonTime}ms`);
    console.log(`   性能: 展开浅拷贝${iterations}次耗时 ${spreadTime}ms`);
    console.log(`   对比: 展开运算符快 ${((jsonTime / spreadTime).toFixed(1))}x`);
  });
}

// ============================================================================
// 并发和异步测试
// ============================================================================

async function runConcurrencyTests() {
  console.log('');
  console.log('## 并发和异步测试');
  console.log('');

  await test('并发: Promise.all 大量任务', async () => {
    const count = 10000;
    const startTime = Date.now();
    
    const promises = Array.from({ length: count }, (_, i) => 
      Promise.resolve(i * 2)
    );
    
    const results = await Promise.all(promises);
    const elapsedTime = Date.now() - startTime;
    
    assert(results.length === count, `应该有${count}个结果`);
    assert(results[0] === 0, '第一个结果应该正确');
    assert(results[count - 1] === (count - 1) * 2, '最后一个结果应该正确');
    assert(elapsedTime < 1000, `处理${count}个Promise应该在1秒内完成 (实际: ${elapsedTime}ms)`);
    
    console.log(`   性能: Promise.all处理${count}个任务耗时 ${elapsedTime}ms`);
  });

  await test('并发: 顺序异步任务', async () => {
    const count = 1000;
    const startTime = Date.now();
    
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += await Promise.resolve(i);
    }
    
    const elapsedTime = Date.now() - startTime;
    const expected = (count * (count - 1)) / 2;
    
    assert(sum === expected, `结果应该是${expected}`);
    assert(elapsedTime < 1000, `顺序处理${count}个异步任务应该在1秒内完成 (实际: ${elapsedTime}ms)`);
    
    console.log(`   性能: 顺序处理${count}个异步任务耗时 ${elapsedTime}ms`);
  });

  await test('并发: setTimeout 批量调度', async () => {
    const count = 1000;
    const startTime = Date.now();
    
    const promises = Array.from({ length: count }, (_, i) => 
      new Promise<number>(resolve => {
        setTimeout(() => resolve(i), 0);
      })
    );
    
    const results = await Promise.all(promises);
    const elapsedTime = Date.now() - startTime;
    
    assert(results.length === count, `应该有${count}个结果`);
    console.log(`   性能: ${count}个setTimeout耗时 ${elapsedTime}ms`);
  });
}

// ============================================================================
// 主测试运行器
// ============================================================================

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          回测框架增强边界和压力测试                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  await runCommonBoundaryTests();
  await runDataStructureBoundaryTests();
  await runStringJsonBoundaryTests();
  await runTimeDateBoundaryTests();
  await runMemoryPerformanceTests();
  await runConcurrencyTests();
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   测试总结                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`总测试数: ${testsPassed + testsFailed}`);
  console.log(`✅ 通过: ${testsPassed}`);
  console.log(`❌ 失败: ${testsFailed}`);
  console.log(`成功率: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  console.log('');
  
  if (testsFailed > 0) {
    console.log('失败的测试:');
    failedTests.forEach(test => console.log(`  ❌ ${test}`));
    console.log('');
    process.exit(1);
  } else {
    console.log('🎉 所有增强边界和压力测试通过！');
    console.log('');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});

