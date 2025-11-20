/**
 * DataProvider 测试运行器
 * 
 * 由于 Jest 配置问题，使用自定义测试运行器执行单元测试
 */

import { DefaultGapDetector } from './gap-detector';
import { DefaultGapFiller } from './gap-filler';
import { DefaultDuckDBQueryBuilder } from './query-builder';
import { BarEvent } from '../timeframe/interfaces';
import { Gap } from './interfaces';
import { formatISO, addSeconds } from 'date-fns';

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

// Helper functions
function createBarEvent(timestamp: string, symbol: string, close: string = '50000.00'): BarEvent {
  return {
    sequenceId: `test-${timestamp}`,
    timestamp,
    symbol,
    timeframe: '1m',
    open: close,
    high: close,
    low: close,
    close,
    volume: '100.00',
    source: 'test',
  };
}

function createContinuousEvents(count: number, intervalMs: number): BarEvent[] {
  const events: BarEvent[] = [];
  const baseTime = new Date('2024-01-01T00:00:00.000Z');
  
  for (let i = 0; i < count; i++) {
    const timestamp = formatISO(addSeconds(baseTime, (i * intervalMs) / 1000));
    events.push(createBarEvent(timestamp, 'BTC-USDT'));
  }
  
  return events;
}

// 测试计数器
let passedTests = 0;
let failedTests = 0;

function runTest(name: string, testFn: () => void): void {
  try {
    testFn();
    console.log(`✅ ${name}`);
    passedTests++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   ${error}`);
    failedTests++;
  }
}

// ========================================
// GapDetector 测试
// ========================================
console.log('\n📋 测试组 1: GapDetector\n');

const detector = new DefaultGapDetector();

runTest('检测连续数据（无缺口）', () => {
  const events = createContinuousEvents(10, 60000);
  const gaps = detector.detectGaps(events, 60000, '1m');
  assertEquals(gaps.length, 0);
});

runTest('检测单个缺口', () => {
  const events: BarEvent[] = [
    createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT'),
  ];
  const gaps = detector.detectGaps(events, 60000, '1m');
  assertEquals(gaps.length, 1);
  assertEquals(gaps[0].expectedBars, 1);
});

runTest('检测多个缺口', () => {
  const events: BarEvent[] = [
    createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:04:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:07:00.000Z', 'BTC-USDT'),
  ];
  const gaps = detector.detectGaps(events, 60000, '1m');
  assertEquals(gaps.length, 2);
});

runTest('检测大缺口', () => {
  const events: BarEvent[] = [
    createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:12:00.000Z', 'BTC-USDT'),
  ];
  const gaps = detector.detectGaps(events, 60000, '1m');
  assertEquals(gaps.length, 1);
  assertEquals(gaps[0].expectedBars, 10);
});

runTest('验证完整数据', () => {
  const events = createContinuousEvents(100, 60000);
  const report = detector.validateIntegrity(events, 60000);
  assertEquals(report.totalRecords, 100);
  assertEquals(report.gapCount, 0);
  assert(report.completeness >= 95, 'completeness should be >= 95%');
  assert(report.isValid, 'report should be valid');
});

runTest('检测不完整数据', () => {
  const events: BarEvent[] = [
    createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:04:00.000Z', 'BTC-USDT'),
  ];
  const report = detector.validateIntegrity(events, 60000);
  assertEquals(report.totalRecords, 4);
  assertEquals(report.gapCount, 1);
  assertEquals(report.missingRecords, 1);
});

runTest('统计缺口信息', () => {
  const events: BarEvent[] = [
    createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:04:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:08:00.000Z', 'BTC-USDT'),
  ];
  const gaps = detector.detectGaps(events, 60000, '1m');
  const stats = detector.getGapStatistics(gaps);
  assertEquals(stats.totalGaps, 2);
  assertEquals(stats.totalMissingBars, 4);
});

// ========================================
// GapFiller 测试
// ========================================
console.log('\n📋 测试组 2: GapFiller\n');

const filler = new DefaultGapFiller();

runTest('前向填充缺口', () => {
  const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
  const nextBar = createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT', '50200.00');
  const gap: Gap = {
    startTimestamp: '2024-01-01T00:01:00.000Z',
    endTimestamp: '2024-01-01T00:03:00.000Z',
    expectedBars: 2,
    lastValidBar: lastBar,
    nextValidBar: nextBar,
  };
  const filled = filler.forwardFill(gap, '1m');
  assertEquals(filled.length, 2);
  assertEquals(filled[0].timestamp, '2024-01-01T00:01:00.000Z');
  assertEquals(filled[1].timestamp, '2024-01-01T00:02:00.000Z');
  filled.forEach(bar => {
    assertEquals(bar.open, '50000.00');
    assertEquals(bar.close, '50000.00');
    assertEquals(bar.volume, '0');
  });
});

runTest('前向填充标记合成数据', () => {
  const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT');
  const gap: Gap = {
    startTimestamp: '2024-01-01T00:01:00.000Z',
    endTimestamp: '2024-01-01T00:02:00.000Z',
    expectedBars: 1,
    lastValidBar: lastBar,
  };
  const filled = filler.forwardFill(gap, '1m');
  assert(filled[0].source.includes('synthetic'), 'source should contain synthetic');
  assertEquals(filled[0].context?.qualityFlag, 'synthetic');
});

runTest('线性插值填充', () => {
  const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT', '50000.00');
  const nextBar = createBarEvent('2024-01-01T00:03:00.000Z', 'BTC-USDT', '50300.00');
  const gap: Gap = {
    startTimestamp: '2024-01-01T00:01:00.000Z',
    endTimestamp: '2024-01-01T00:03:00.000Z',
    expectedBars: 2,
    lastValidBar: lastBar,
    nextValidBar: nextBar,
  };
  const filled = filler.linearFill(gap, '1m');
  assertEquals(filled.length, 2);
  // 检查插值价格在合理范围内
  const price1 = parseFloat(filled[0].close);
  const price2 = parseFloat(filled[1].close);
  assert(price1 >= 50000 && price1 <= 50300, 'price1 should be in range');
  assert(price2 >= 50000 && price2 <= 50300, 'price2 should be in range');
  assert(price2 > price1, 'price2 should be > price1');
});

runTest('线性插值标记为interpolated', () => {
  const lastBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT');
  const nextBar = createBarEvent('2024-01-01T00:02:00.000Z', 'BTC-USDT');
  const gap: Gap = {
    startTimestamp: '2024-01-01T00:01:00.000Z',
    endTimestamp: '2024-01-01T00:02:00.000Z',
    expectedBars: 1,
    lastValidBar: lastBar,
    nextValidBar: nextBar,
  };
  const filled = filler.linearFill(gap, '1m');
  assertEquals(filled[0].context?.qualityFlag, 'interpolated');
});

runTest('合并原始和填充数据', () => {
  const original: BarEvent[] = [
    createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT'),
    createBarEvent('2024-01-01T00:04:00.000Z', 'BTC-USDT'),
  ];
  const gap: Gap = {
    startTimestamp: '2024-01-01T00:02:00.000Z',
    endTimestamp: '2024-01-01T00:04:00.000Z',
    expectedBars: 2,
    lastValidBar: original[1],
    nextValidBar: original[2],
  };
  const merged = filler.mergeWithFilled(original, [gap], 'forwardFill', '1m');
  assertEquals(merged.length, 5);
});

runTest('识别合成数据', () => {
  const syntheticBar = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT');
  syntheticBar.context = { qualityFlag: 'synthetic' };
  assert(filler.isSynthetic(syntheticBar), 'should identify synthetic data');
});

runTest('过滤合成数据', () => {
  const original = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT');
  const synthetic = createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT');
  synthetic.context = { qualityFlag: 'synthetic' };
  const events = [original, synthetic];
  const filtered = filler.filterSynthetic(events);
  assertEquals(filtered.length, 1);
});

runTest('统计合成数据', () => {
  const original = createBarEvent('2024-01-01T00:00:00.000Z', 'BTC-USDT');
  const synthetic = createBarEvent('2024-01-01T00:01:00.000Z', 'BTC-USDT');
  synthetic.context = { qualityFlag: 'synthetic' };
  const events = [original, synthetic];
  const stats = filler.getSyntheticStatistics(events);
  assertEquals(stats.total, 2);
  assertEquals(stats.synthetic, 1);
  assertEquals(stats.original, 1);
  assertEquals(stats.syntheticPercentage, 50);
});

// ========================================
// QueryBuilder 测试
// ========================================
console.log('\n📋 测试组 3: QueryBuilder\n');

const builder = new DefaultDuckDBQueryBuilder('../backend/storage/datasets');

runTest('构建范围查询', () => {
  const sql = builder.buildRangeQuery(
    {
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T01:00:00.000Z',
      baseTimeframe: '1m',
    },
    {
      batchIndex: 0,
      startTime: '',
      endTime: '',
      expectedRows: 100,
      offset: 0,
      limit: 100,
    }
  );
  assert(sql.includes('SELECT'), 'should contain SELECT');
  assert(sql.includes('FROM read_parquet'), 'should contain FROM read_parquet');
  assert(sql.includes('WHERE timestamp >='), 'should contain WHERE clause');
  assert(sql.includes('ORDER BY timestamp ASC'), 'should contain ORDER BY');
  assert(sql.includes('LIMIT 100 OFFSET 0'), 'should contain LIMIT and OFFSET');
});

runTest('构建计数查询', () => {
  const sql = builder.buildCountQuery({
    symbol: 'BTC-USDT',
    start: '2024-01-01T00:00:00.000Z',
    end: '2024-01-01T01:00:00.000Z',
    baseTimeframe: '1m',
  });
  assert(sql.includes('COUNT(*)'), 'should contain COUNT(*)');
  assert(sql.includes('FROM read_parquet'), 'should contain FROM read_parquet');
});

runTest('构建元数据查询', () => {
  const sql = builder.buildMetadataQuery('BTC-USDT', '1m');
  assert(sql.includes('COUNT(*) AS total_records'), 'should contain total_records');
  assert(sql.includes('MIN(timestamp) AS start_time'), 'should contain start_time');
  assert(sql.includes('MAX(timestamp) AS end_time'), 'should contain end_time');
});

runTest('构建批次数组', () => {
  const batches = builder.buildBatches(
    {
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T01:00:00.000Z',
      baseTimeframe: '1m',
      batchSize: 100,
      overlapSize: 0,
    },
    250
  );
  assertEquals(batches.length, 3);
  assertEquals(batches[0].offset, 0);
  assertEquals(batches[0].limit, 100);
  assertEquals(batches[1].offset, 100);
  assertEquals(batches[2].offset, 200);
});

runTest('批次重叠处理', () => {
  const batches = builder.buildBatches(
    {
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T01:00:00.000Z',
      baseTimeframe: '1m',
      batchSize: 100,
      overlapSize: 10,
    },
    200
  );
  assert(batches.length >= 2, 'should create at least 2 batches');
  // 第2个批次的起始位置应该是 100 - 10 = 90
  if (batches.length >= 2) {
    assert(batches[1].offset === 90, `batch[1].offset should be 90, but got ${batches[1].offset}`);
  }
});

runTest('构建缺口检测查询', () => {
  const sql = builder.buildGapDetectionQuery({
    symbol: 'BTC-USDT',
    start: '2024-01-01T00:00:00.000Z',
    end: '2024-01-01T01:00:00.000Z',
    baseTimeframe: '1m',
  });
  assert(sql.includes('LAG(timestamp)'), 'should contain LAG function');
  assert(sql.includes('EXTRACT(EPOCH'), 'should contain EXTRACT');
});

// ========================================
// 测试总结
// ========================================
console.log('\n==================================================');
console.log('📊 测试结果总结');
console.log('==================================================');
console.log(`✅ 通过: ${passedTests}`);
console.log(`❌ 失败: ${failedTests}`);
console.log(`📈 通过率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
console.log('==================================================\n');

if (failedTests === 0) {
  console.log('🎉 所有测试通过！DataProvider 工作正常！\n');
  process.exit(0);
} else {
  console.log('⚠️  存在失败的测试，请检查错误信息\n');
  process.exit(1);
}

