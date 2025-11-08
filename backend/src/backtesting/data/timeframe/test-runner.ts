/**
 * TimeframeAdapter 测试运行器
 * 
 * 手动运行测试并输出结果
 */

import { from } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { timeframeAdapter } from './adapter';
import { timeAlignment } from './time-alignment';
import { createAggregator } from './aggregator';
import { BarEvent } from './interfaces';

console.log('🧪 开始测试 TimeframeAdapter...\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log('✅', message);
    passedTests++;
  } else {
    console.log('❌', message);
    failedTests++;
  }
}

function assertEquals(actual: any, expected: any, message: string) {
  if (actual === expected) {
    console.log('✅', message);
    passedTests++;
  } else {
    console.log('❌', message);
    console.log(`   期望: ${expected}`);
    console.log(`   实际: ${actual}`);
    failedTests++;
  }
}

// ========== 测试 1: TimeAlignment ==========
console.log('\n📋 测试组 1: 时间对齐工具\n');

// 测试解析时间框架
assertEquals(timeAlignment.parseTimeframe('1s'), 1000, '解析 1s');
assertEquals(timeAlignment.parseTimeframe('1m'), 60 * 1000, '解析 1m');
assertEquals(timeAlignment.parseTimeframe('5m'), 5 * 60 * 1000, '解析 5m');
assertEquals(timeAlignment.parseTimeframe('1h'), 60 * 60 * 1000, '解析 1h');

// 测试时间对齐
const timestamp = '2024-01-01T00:02:30.000Z';
const alignedClose = timeAlignment.alignToTimeframe(timestamp, '5m', 'close');
assertEquals(alignedClose, '2024-01-01T00:05:00.000Z', '对齐到5m边界(close模式)');

const alignedOpen = timeAlignment.alignToTimeframe(timestamp, '5m', 'open');
assertEquals(alignedOpen, '2024-01-01T00:00:00.000Z', '对齐到5m边界(open模式)');

// 测试边界检测
assert(timeAlignment.isOnBoundary('2024-01-01T00:05:00.000Z', '5m'), '检测在边界上');
assert(!timeAlignment.isOnBoundary('2024-01-01T00:02:30.000Z', '5m'), '检测不在边界上');

// 测试倍数关系
assertEquals(timeAlignment.getTimeframeMultiplier('1m', '5m'), 5, '计算时间框架倍数');

// ========== 测试 2: Aggregator ==========
console.log('\n📋 测试组 2: OHLCV 聚合器\n');

const aggregator = createAggregator('standard');

const mockBars: BarEvent[] = [
  {
    sequenceId: 'seq-1',
    timestamp: '2024-01-01T00:00:00.000Z',
    symbol: 'BTC-USDT',
    timeframe: '1m',
    open: '100',
    high: '110',
    low: '95',
    close: '105',
    volume: '1000',
    source: 'test',
  },
  {
    sequenceId: 'seq-2',
    timestamp: '2024-01-01T00:01:00.000Z',
    symbol: 'BTC-USDT',
    timeframe: '1m',
    open: '105',
    high: '115',
    low: '100',
    close: '108',
    volume: '1200',
    source: 'test',
  },
  {
    sequenceId: 'seq-3',
    timestamp: '2024-01-01T00:02:00.000Z',
    symbol: 'BTC-USDT',
    timeframe: '1m',
    open: '108',
    high: '120',
    low: '105',
    close: '112',
    volume: '1500',
    source: 'test',
  },
];

const aggregated = aggregator.aggregate(mockBars);

assertEquals(aggregated.open, '100', '聚合 open 价格');
assertEquals(aggregated.close, '112', '聚合 close 价格');
assertEquals(aggregated.high, '120', '聚合 high 价格');
assertEquals(aggregated.low, '95', '聚合 low 价格');
assertEquals(aggregated.volume, '3700', '聚合 volume');
assertEquals(aggregated.barCount, 3, '聚合 bar 数量');

// ========== 测试 3: 完整重采样 ==========
console.log('\n📋 测试组 3: 完整重采样流程\n');

async function testResampling() {
  // 创建 5 分钟的 1s bars（300个）
  const bars: BarEvent[] = [];
  const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();

  for (let i = 0; i < 300; i++) {
    bars.push({
      sequenceId: `seq-${i}`,
      timestamp: new Date(baseTime + i * 1000).toISOString(),
      symbol: 'BTC-USDT',
      timeframe: '1s',
      open: '100',
      high: '101',
      low: '99',
      close: '100',
      volume: '10',
      source: 'test',
    });
  }

  const source$ = from(bars);
  const resampled$ = timeframeAdapter.resample(source$, '5m', {
    alignmentMode: 'close',
    dropIncomplete: false,
  });

  try {
    const result = await resampled$.pipe(toArray()).toPromise();
    
    assertEquals(result.length, 1, '重采样后产生1个5m bar');
    
    if (result.length > 0) {
      const bar = result[0];
      assertEquals(bar.timeframe, '5m', '时间框架正确');
      assertEquals(bar.timestamp, '2024-01-01T00:05:00.000Z', '时间戳对齐正确');
      assertEquals(bar.volume, '3000', 'Volume 累计正确');
      assertEquals(bar.open, '100', 'Open 价格正确');
      assertEquals(bar.close, '100', 'Close 价格正确');
    }
  } catch (error) {
    console.log('❌ 重采样测试失败:', error);
    failedTests++;
  }
}

async function testMultipleWindows() {
  // 创建 10 分钟的数据（600秒）
  const bars: BarEvent[] = [];
  const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();

  for (let i = 0; i < 600; i++) {
    bars.push({
      sequenceId: `seq-${i}`,
      timestamp: new Date(baseTime + i * 1000).toISOString(),
      symbol: 'BTC-USDT',
      timeframe: '1s',
      open: '100',
      high: '101',
      low: '99',
      close: '100',
      volume: '10',
      source: 'test',
    });
  }

  const source$ = from(bars);
  const resampled$ = timeframeAdapter.resample(source$, '5m');

  try {
    const result = await resampled$.pipe(toArray()).toPromise();
    
    assertEquals(result.length, 2, '产生2个5m bars');
    
    if (result.length === 2) {
      assertEquals(result[0].timestamp, '2024-01-01T00:05:00.000Z', '第1个bar时间戳');
      assertEquals(result[1].timestamp, '2024-01-01T00:10:00.000Z', '第2个bar时间戳');
    }
  } catch (error) {
    console.log('❌ 多窗口测试失败:', error);
    failedTests++;
  }
}

// 运行异步测试
(async () => {
  await testResampling();
  await testMultipleWindows();

  // ========== 测试结果总结 ==========
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果总结');
  console.log('='.repeat(50));
  console.log(`✅ 通过: ${passedTests}`);
  console.log(`❌ 失败: ${failedTests}`);
  console.log(`📈 通过率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  console.log('='.repeat(50));

  if (failedTests === 0) {
    console.log('\n🎉 所有测试通过！TimeframeAdapter 工作正常！\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  有 ${failedTests} 个测试失败，需要修复\n`);
    process.exit(1);
  }
})();

