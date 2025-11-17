/**
 * 测试 OHLCVGenerator 的涨跌幅限制功能
 */

import { OHLCVGenerator } from './ohlcv-generator';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║          OHLCV Generator 涨跌幅限制测试                            ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// 测试1: 默认涨跌幅限制（200%）
console.log('📌 测试 1: 默认涨跌幅限制 (200%)');
console.log('─'.repeat(70));
const generator1 = new OHLCVGenerator(100, 0.02);
const range1 = generator1.getPriceRange();
console.log(`初始价格: ${range1.initialPrice}`);
console.log(`最大涨跌幅: ${range1.maxChangePercent * 100}%`);
console.log(`价格下限: ${range1.minPrice} (${range1.initialPrice} * (1 - ${range1.maxChangePercent}))`);
console.log(`价格上限: ${range1.maxPrice} (${range1.initialPrice} * (1 + ${range1.maxChangePercent}))`);

const data1 = generator1.generateTrendingData(10000, 'up');
const prices1 = data1.map(d => d.close);
const minPrice1 = Math.min(...prices1);
const maxPrice1 = Math.max(...prices1);
console.log(`\n实际生成数据:`);
console.log(`  最低价: ${minPrice1.toFixed(2)}`);
console.log(`  最高价: ${maxPrice1.toFixed(2)}`);
console.log(`  价格是否在范围内: ${minPrice1 >= range1.minPrice && maxPrice1 <= range1.maxPrice ? '✅ 是' : '❌ 否'}`);
console.log('');

// 测试2: 涨跌幅限制 100%
console.log('📌 测试 2: 涨跌幅限制 100%');
console.log('─'.repeat(70));
const generator2 = new OHLCVGenerator(100, 0.02, 1.0);
const range2 = generator2.getPriceRange();
console.log(`初始价格: ${range2.initialPrice}`);
console.log(`最大涨跌幅: ${range2.maxChangePercent * 100}%`);
console.log(`价格下限: ${range2.minPrice} (不低于0)`);
console.log(`价格上限: ${range2.maxPrice}`);

const data2 = generator2.generateTrendingData(10000, 'up');
const prices2 = data2.map(d => d.close);
const minPrice2 = Math.min(...prices2);
const maxPrice2 = Math.max(...prices2);
console.log(`\n实际生成数据:`);
console.log(`  最低价: ${minPrice2.toFixed(2)}`);
console.log(`  最高价: ${maxPrice2.toFixed(2)}`);
console.log(`  价格是否在范围内: ${minPrice2 >= range2.minPrice && maxPrice2 <= range2.maxPrice ? '✅ 是' : '❌ 否'}`);
console.log('');

// 测试3: 涨跌幅限制 50%
console.log('📌 测试 3: 涨跌幅限制 50%');
console.log('─'.repeat(70));
const generator3 = new OHLCVGenerator(100, 0.02, 0.5);
const range3 = generator3.getPriceRange();
console.log(`初始价格: ${range3.initialPrice}`);
console.log(`最大涨跌幅: ${range3.maxChangePercent * 100}%`);
console.log(`价格下限: ${range3.minPrice}`);
console.log(`价格上限: ${range3.maxPrice}`);

const data3 = generator3.generateTrendingData(10000, 'up');
const prices3 = data3.map(d => d.close);
const minPrice3 = Math.min(...prices3);
const maxPrice3 = Math.max(...prices3);
console.log(`\n实际生成数据:`);
console.log(`  最低价: ${minPrice3.toFixed(2)}`);
console.log(`  最高价: ${maxPrice3.toFixed(2)}`);
console.log(`  价格是否在范围内: ${minPrice3 >= range3.minPrice && maxPrice3 <= range3.maxPrice ? '✅ 是' : '❌ 否'}`);
console.log('');

// 测试4: 下跌趋势 - 验证不会低于0
console.log('📌 测试 4: 下跌趋势 - 验证不会低于0');
console.log('─'.repeat(70));
const generator4 = new OHLCVGenerator(100, 0.02, 2.0);
const range4 = generator4.getPriceRange();
console.log(`初始价格: ${range4.initialPrice}`);
console.log(`最大涨跌幅: ${range4.maxChangePercent * 100}%`);
console.log(`价格下限: ${range4.minPrice} (最低不会低于0)`);
console.log(`价格上限: ${range4.maxPrice}`);

const data4 = generator4.generateTrendingData(10000, 'down');
const prices4 = data4.map(d => d.close);
const minPrice4 = Math.min(...prices4);
const maxPrice4 = Math.max(...prices4);
console.log(`\n实际生成数据:`);
console.log(`  最低价: ${minPrice4.toFixed(2)}`);
console.log(`  最高价: ${maxPrice4.toFixed(2)}`);
console.log(`  价格是否 >= 0: ${minPrice4 >= 0 ? '✅ 是' : '❌ 否'}`);
console.log(`  价格是否在范围内: ${minPrice4 >= range4.minPrice && maxPrice4 <= range4.maxPrice ? '✅ 是' : '❌ 否'}`);
console.log('');

// 测试5: OHLCV 数据完整性验证
console.log('📌 测试 5: OHLCV 数据完整性验证');
console.log('─'.repeat(70));
const generator5 = new OHLCVGenerator(100, 0.02, 1.0);
const data5 = generator5.generateTrendingData(1000, 'sideways');

let validCount = 0;
let invalidCount = 0;
const errors: string[] = [];

data5.forEach((bar, idx) => {
  const isValid = 
    bar.high >= bar.open &&
    bar.high >= bar.close &&
    bar.low <= bar.open &&
    bar.low <= bar.close &&
    bar.high >= bar.low;
  
  if (isValid) {
    validCount++;
  } else {
    invalidCount++;
    if (errors.length < 5) {
      errors.push(`Bar ${idx}: H=${bar.high} L=${bar.low} O=${bar.open} C=${bar.close}`);
    }
  }
});

console.log(`总记录数: ${data5.length}`);
console.log(`有效记录: ${validCount} (${((validCount / data5.length) * 100).toFixed(2)}%)`);
console.log(`无效记录: ${invalidCount}`);
if (errors.length > 0) {
  console.log(`前 ${errors.length} 个错误:`);
  errors.forEach(err => console.log(`  ${err}`));
}
console.log(`数据完整性: ${invalidCount === 0 ? '✅ 通过' : '❌ 失败'}`);
console.log('');

// 总结
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║                          ✅ 测试完成                               ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

