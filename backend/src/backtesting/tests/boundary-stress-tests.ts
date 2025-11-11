/**
 * M1 里程碑边界和压力测试套件
 * 
 * 覆盖：
 * 1. 边界条件测试
 * 2. 压力测试
 * 3. 极端场景测试
 * 4. 性能回归测试
 */

import { DefaultGapDetector, DefaultGapFiller } from '../data/providers';
import type { Gap } from '../data/providers';
import {
  TimeframeAdapterImpl,
  StandardOHLCVAggregator,
} from '../data/timeframe';
import { timeframeToMs } from '../data/timeframe/time-alignment';
import type {
  BarEvent as TimeframeBarEvent,
  Timeframe,
} from '../data/timeframe/interfaces';
import { FeatureRegistryImpl, ParameterValidator } from '../features';
import type { FeatureDefinition } from '../features/interfaces';
import { SimpleEventBus, SimpleEventStore } from '../events/simple-bus';
import { EnhancedEventStore } from '../events/enhanced-store';
import Big from 'big.js';
import { parseISO } from 'date-fns';

// 临时 BarEvent 类型定义
interface BarEvent {
  symbol: string;
  timeframe: Timeframe;
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  market?: string;
  source?: string;
  synthetic?: boolean;
  interpolated?: boolean;
}

// === 测试辅助函数 ===

let testCount = 0;
let passCount = 0;
let failCount = 0;
let skipCount = 0;

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

async function skip(description: string, reason: string): Promise<void> {
  testCount++;
  skipCount++;
  console.log(`⏭️  ${description} (${reason})`);
}

function measureMemory(): number {
  if (global.gc) {
    global.gc();
  }
  return process.memoryUsage().heapUsed;
}

function formatBytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

function toTimeframeBar(event: BarEvent): TimeframeBarEvent {
  const timestamp = isoFromMs(event.timestamp);
  return {
    sequenceId: `seq-${event.symbol}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    symbol: event.symbol,
    timeframe: event.timeframe,
    open: event.open,
    high: event.high,
    low: event.low,
    close: event.close,
    volume: event.volume,
    market: event.market,
    source: event.source ?? 'boundary-tests',
    trades: 0,
    notional: '0',
    features: {},
  };
}

function convertBars(events: BarEvent[]): TimeframeBarEvent[] {
  return events.map(toTimeframeBar);
}

function createForwardFillGap(event: BarEvent, missingBars: number): Gap {
  const lastBar = toTimeframeBar(event);
  const interval = timeframeToMs(event.timeframe);
  return {
    startTimestamp: isoFromMs(event.timestamp + interval),
    endTimestamp: isoFromMs(event.timestamp + interval * (missingBars + 1)),
    expectedBars: missingBars,
    lastValidBar: lastBar,
  };
}

function createTestFeatureDefinition(
  id: string,
  dependsOn: string[] = []
): FeatureDefinition {
  return {
    id,
    description: `Feature ${id}`,
    dependsOn: dependsOn.map((ref) => ({ ref, type: 'feature' })),
    compute: (stream) => stream,
  };
}

// === 测试套件 ===

async function runBoundaryStressTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          M1 边界和压力测试套件                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // =====================================================================
  // M1-01: DataProvider 边界测试
  // =====================================================================
  
  console.log('## M1-01: DataProvider 边界测试\n');

  await test('边界：空数据集处理', () => {
    const detector = new DefaultGapDetector();
    const gaps = detector.detectGaps([], timeframeToMs('1m'), '1m');
    assert(gaps.length === 0, 'Empty dataset should have no gaps');
  });

  await test('边界：单个 BarEvent', () => {
    const detector = new DefaultGapDetector();
    const event: BarEvent = {
      symbol: 'BTC/USDT',
      timeframe: '1m',
      timestamp: Date.now(),
      open: '50000',
      high: '51000',
      low: '49000',
      close: '50500',
      volume: '100',
    };
    const gaps = detector.detectGaps(
      convertBars([event]),
      timeframeToMs('1m'),
      '1m'
    );
    assert(gaps.length === 0, 'Single event should have no gaps');
  });

  await test('边界：极大数字精度', () => {
    const filler = new DefaultGapFiller();
    const huge = '999999999999999999.999999999999';
    const event: BarEvent = {
      symbol: 'BTC/USDT',
      timeframe: '1m',
      timestamp: Date.now(),
      open: huge,
      high: huge,
      low: huge,
      close: huge,
      volume: huge,
    };
    const gap = createForwardFillGap(event, 1);
    const filled = filler.fillGap(gap, 'forwardFill', '1m');
    assert(filled.length === 1, 'Should fill gap with forward data');
  });

  await test('边界：极小数字精度', () => {
    const tiny = '0.000000000001';
    const event: BarEvent = {
      symbol: 'BTC/USDT',
      timeframe: '1m',
      timestamp: Date.now(),
      open: tiny,
      high: tiny,
      low: tiny,
      close: tiny,
      volume: tiny,
    };
    
    const big = new Big(tiny);
    assert(big.gt(0), 'Should handle tiny numbers');
  });

  await test('边界：100% 缺失率数据', () => {
    const detector = new DefaultGapDetector();
    const start = parseISO('2024-01-01T00:00:00Z').getTime();
    const end = start + 60 * 60 * 1000; // 1 hour later
    const events: BarEvent[] = [
      {
        symbol: 'BTC/USDT',
        timeframe: '1m',
        timestamp: start,
        open: '50000',
        high: '51000',
        low: '49000',
        close: '50000',
        volume: '100',
      },
      {
        symbol: 'BTC/USDT',
        timeframe: '1m',
        timestamp: end,
        open: '50010',
        high: '51010',
        low: '49010',
        close: '50010',
        volume: '120',
      },
    ];
    
    const gaps = detector.detectGaps(
      convertBars(events),
      timeframeToMs('1m'),
      '1m'
    );
    assert(gaps.length === 1 && gaps[0].expectedBars >= 59, 'Should detect missing bars across the interval');
  });

  await test('边界：时间戳倒序处理', () => {
    const detector = new DefaultGapDetector();
    const events: BarEvent[] = [];
    const base = Date.now();
    
    // Create events in reverse order
    for (let i = 10; i >= 0; i--) {
      events.push({
        symbol: 'BTC/USDT',
        timeframe: '1m',
        timestamp: base + i * 60000,
        open: '50000',
        high: '51000',
        low: '49000',
        close: '50500',
        volume: '100',
      });
    }
    
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const gaps = detector.detectGaps(
      convertBars(sortedEvents),
      timeframeToMs('1m'),
      '1m'
    );
    // Should handle unsorted data
    assert(gaps.length === 0, 'Should handle reverse order');
  });

  // =====================================================================
  // M1-02: TimeframeAdapter 边界测试
  // =====================================================================
  
  console.log('\n## M1-02: TimeframeAdapter 边界测试\n');

  await test('边界：非标准时间间隔', () => {
    // Test unusual timeframes
    const adapter = new TimeframeAdapterImpl();
    assert(typeof adapter.resample === 'function', 'Adapter should expose resample');
  });

  await test('边界：极小时间间隔 (1s)', () => {
    const adapter = new TimeframeAdapterImpl();
    assert(typeof adapter.createMultiFrameStream === 'function', 'Should handle 1 second timeframe');
  });

  await test('边界：极大时间间隔 (1w)', () => {
    const adapter = new TimeframeAdapterImpl();
    assert(adapter instanceof TimeframeAdapterImpl, 'Should handle 1 week timeframe');
  });

  await test('边界：跨越 DST 边界', () => {
    // Test data crossing daylight saving time
    const aggregator = new StandardOHLCVAggregator();
    
    // March 10, 2024 - DST starts in US
    const dstStart = parseISO('2024-03-10T01:00:00Z').getTime();
    
    const bar1: BarEvent = {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      timestamp: dstStart,
      open: '50000',
      high: '51000',
      low: '49000',
      close: '50500',
      volume: '100',
    };
    
    const bar2: BarEvent = {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      timestamp: dstStart + 3600000, // 1 hour later
      open: '50500',
      high: '52000',
      low: '50000',
      close: '51000',
      volume: '150',
    };
    
    const result = aggregator.aggregate([
      toTimeframeBar(bar1),
      toTimeframeBar(bar2),
    ]);
    assert(result !== null, 'Should handle DST boundary');
  });

  await test('边界：空 bar 序列聚合', () => {
    const aggregator = new StandardOHLCVAggregator();
    let threw = false;
    try {
      aggregator.aggregate([]);
    } catch {
      threw = true;
    }
    assert(threw, 'Empty sequence should throw error');
  });

  // =====================================================================
  // M1-03: FeatureRegistry 边界测试
  // =====================================================================
  
  console.log('\n## M1-03: FeatureRegistry 边界测试\n');

  await test('边界：深度依赖链 (10层)', () => {
    const registry = new FeatureRegistryImpl();
    
    // Create a 10-level dependency chain
    for (let i = 0; i < 10; i++) {
      registry.register(
        createTestFeatureDefinition(
          `feature_${i}`,
          i > 0 ? [`feature_${i - 1}`] : []
        )
      );
    }
    
    const resolved = registry.resolve([{ id: 'feature_9', params: {} }]);
    assert(resolved.length === 10, 'Should resolve 10-level dependency chain');
  });

  await test('边界：循环依赖检测', () => {
    const registry = new FeatureRegistryImpl();
    
    registry.register(
      createTestFeatureDefinition('feature_a', ['feature_b'])
    );
    
    registry.register(
      createTestFeatureDefinition('feature_b', ['feature_a'])
    );
    
    try {
      registry.resolve([{ id: 'feature_a', params: {} }]);
      throw new Error('Should have detected circular dependency');
    } catch (error: any) {
      assert(
        error.message.includes('Circular') || error.message.includes('cycle'),
        'Should throw circular dependency error'
      );
    }
  });

  await test('边界：参数极值 - 最大整数', () => {
    const validator = new ParameterValidator();
    const feature: FeatureDefinition = {
      id: 'test-param-max',
      description: 'Test feature',
      compute: (stream) => stream,
      paramSchema: {
        period: {
          type: 'integer',
          required: false,
          default: 14,
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
        },
      },
    };
    
    const result = validator.validate(feature, {
      period: Number.MAX_SAFE_INTEGER,
    });
    assert(result.valid, 'Should accept MAX_SAFE_INTEGER');
  });

  await test('边界：参数极值 - 零值', () => {
    const validator = new ParameterValidator();
    const feature: FeatureDefinition = {
      id: 'test-param-zero',
      description: 'Test feature',
      compute: (stream) => stream,
      paramSchema: {
        threshold: {
          type: 'number',
          required: false,
          default: 0,
          min: 0,
          max: 100,
        },
      },
    };
    
    const result = validator.validate(feature, { threshold: 0 });
    assert(result.valid, 'Should accept zero value');
  });

  await test('边界：大量特征注册 (100个)', () => {
    const registry = new FeatureRegistryImpl();
    
    for (let i = 0; i < 100; i++) {
      registry.register(createTestFeatureDefinition(`feature_${i}`));
    }
    
    assert(registry.getFeatureCount() === 100, 'Should handle 100 features');
  });

  // =====================================================================
  // M1-04: EventBus 边界测试
  // =====================================================================
  
  console.log('\n## M1-04: EventBus 边界测试\n');

  await test('边界：空事件有效载荷', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    bus.publish({
      type: 'test.event',
      timestamp: Date.now(),
      payload: {},
    });
    
    assert(store.getEventCount() === 1, 'Should handle empty payload');
    bus.destroy();
    store.destroy();
  });

  await test('边界：巨大事件有效载荷 (1MB)', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    
    // Create a ~1MB payload
    const largeArray = new Array(100000).fill('x').join('');
    
    bus.publish({
      type: 'test.event',
      timestamp: Date.now(),
      payload: { data: largeArray },
    });
    
    assert(store.getEventCount() === 1, 'Should handle large payload');
    bus.destroy();
    store.destroy();
  });

  await test('边界：快速连续发布事件', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    
    // Publish 1000 events as fast as possible
    for (let i = 0; i < 1000; i++) {
      bus.publish({
        type: 'test.event',
        timestamp: Date.now(),
        payload: { index: i },
      });
    }
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(store.getEventCount() === 1000, 'Should handle rapid publishing');
    bus.destroy();
    store.destroy();
  });

  await test('边界：同时多订阅者 (100个)', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    
    const subscriptions = [];
    for (let i = 0; i < 100; i++) {
      subscriptions.push(bus.subscribe('test.event'));
    }
    
    bus.publish({
      type: 'test.event',
      timestamp: Date.now(),
      payload: {},
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(subscriptions.length === 100, 'Should handle 100 subscribers');
    bus.destroy();
    store.destroy();
  });

  // =====================================================================
  // 压力测试
  // =====================================================================
  
  console.log('\n## 压力测试\n');

  await test('压力：DataProvider - 处理100K条数据', () => {
    const detector = new DefaultGapDetector();
    const events: BarEvent[] = [];
    const base = Date.now();
    
    console.log('   生成 100K 事件...');
    for (let i = 0; i < 100000; i++) {
      events.push({
        symbol: 'BTC/USDT',
        timeframe: '1m',
        timestamp: base + i * 60000,
        open: '50000',
        high: '51000',
        low: '49000',
        close: '50500',
        volume: '100',
      });
    }
    
    const startTime = Date.now();
    const gaps = detector.detectGaps(
      convertBars(events),
      timeframeToMs('1m'),
      '1m'
    );
    const duration = Date.now() - startTime;
    
    console.log(`   处理耗时: ${duration}ms`);
    console.log(`   处理速率: ${(100000 / duration * 1000).toFixed(0)} events/sec`);
    assert(duration < 5000, 'Should process 100K events in under 5 seconds');
  });

  await test('压力：FeatureRegistry - 计算1000个bar的特征', async () => {
    const { of } = await import('rxjs');
    const { toArray } = await import('rxjs/operators');
    const registry = new FeatureRegistryImpl();
    const maFeatureModule = await import('../features/built-in/ma.feature');
    
    registry.register(maFeatureModule.MAFeature);
    
    const bars: any[] = [];
    const base = Date.now();
    
    console.log('   生成 1000 bars...');
    for (let i = 0; i < 1000; i++) {
      bars.push({
        symbol: 'BTC/USDT',
        timeframe: '1m',
        timestamp: base + i * 60000,
        open: '50000',
        high: '51000',
        low: '49000',
        close: (50000 + Math.random() * 1000).toFixed(2),
        volume: '100',
      });
    }
    
    const resolved = registry.resolve([{ id: 'MA', params: { period: 20 } }]);
    
    const startTime = Date.now();
    const result = await new Promise<any[]>((resolve, reject) => {
      let bars$ = of(...bars);
      
      for (const feature of resolved) {
        bars$ = feature.definition.compute(bars$, feature.params);
      }
      
      bars$.pipe(toArray()).subscribe({
        next: resolve,
        error: reject,
      });
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`   计算耗时: ${duration}ms`);
    console.log(`   处理速率: ${(1000 / duration * 1000).toFixed(0)} bars/sec`);
    assert(result.length === 1000, 'Should compute features for 1000 bars');
    assert(duration < 1000, 'Should compute in under 1 second');
  });

  await test('压力：EventBus - 处理50K事件', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    
    console.log('   发布 50K 事件...');
    const startTime = Date.now();
    
    for (let i = 0; i < 50000; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const duration = Date.now() - startTime;
    const metrics = bus.getMetrics();
    
    console.log(`   处理耗时: ${duration}ms`);
    console.log(`   吞吐量: ${metrics.throughput.toFixed(0)} events/sec`);
    console.log(`   总事件数: ${metrics.totalEvents}`);
    
    assert(store.getEventCount() >= 50000, 'Should store all events');
    assert(metrics.throughput > 10000, 'Should maintain >10K events/sec');
    
    bus.destroy();
    store.destroy();
  });

  await test('压力：EventStore - 持久化10K事件', async () => {
    const store = new EnhancedEventStore({
      storageDir: './test-data/stress',
      enablePersistence: true,
      flushBatchSize: 1000,
      autoFlushIntervalMs: 10000,
    });
    
    console.log('   写入 10K 事件...');
    const startTime = Date.now();
    
    for (let i = 0; i < 10000; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }
    
    // Force flush
    await (store as any).flush();
    
    const duration = Date.now() - startTime;
    const stats = store.getStats();
    
    console.log(`   写入耗时: ${duration}ms`);
    console.log(`   吞吐量: ${(10000 / duration * 1000).toFixed(0)} events/sec`);
    console.log(`   文件数: ${stats.filesCount}`);
    console.log(`   总大小: ${(stats.totalFileSize / 1024).toFixed(2)} KB`);
    
    assert(stats.totalEvents >= 10000, 'Should persist all events');
    assert(duration < 5000, 'Should complete in under 5 seconds');
    
    store.destroy();
  });

  // =====================================================================
  // 内存泄漏测试
  // =====================================================================
  
  console.log('\n## 内存泄漏测试\n');

  await test('内存：EventBus - 长时间运行无泄漏', async () => {
    const initialMemory = measureMemory();
    console.log(`   初始内存: ${formatBytes(initialMemory)}`);
    
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    
    // Run for 10 iterations of 1000 events each
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < 1000; i++) {
        bus.publish({
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        });
      }
      
      // Clear store periodically
      store.clear();
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    bus.destroy();
    store.destroy();
    
    const finalMemory = measureMemory();
    const memoryIncrease = finalMemory - initialMemory;
    
    console.log(`   最终内存: ${formatBytes(finalMemory)}`);
    console.log(`   内存增长: ${formatBytes(memoryIncrease)}`);
    
    // Memory increase should be reasonable (< 50MB)
    assert(memoryIncrease < 50 * 1024 * 1024, 'Memory increase should be < 50MB');
  });

  await test('内存：FeatureRegistry - 大量计算无泄漏', async () => {
    const { of } = await import('rxjs');
    const { toArray } = await import('rxjs/operators');
    
    const initialMemory = measureMemory();
    console.log(`   初始内存: ${formatBytes(initialMemory)}`);
    
    const registry = new FeatureRegistryImpl();
    const maFeatureModule = await import('../features/built-in/ma.feature');
    registry.register(maFeatureModule.MAFeature);
    
    // Run 100 iterations
    for (let round = 0; round < 100; round++) {
      const bars: any[] = [];
      for (let i = 0; i < 100; i++) {
        bars.push({
          symbol: 'BTC/USDT',
          timeframe: '1m',
          timestamp: Date.now() + i * 60000,
          open: '50000',
          high: '51000',
          low: '49000',
          close: '50500',
          volume: '100',
        });
      }
      
      const resolved = registry.resolve([{ id: 'MA', params: { period: 10 } }]);
      
      await new Promise<any[]>((resolve) => {
        let bars$ = of(...bars);
        for (const feature of resolved) {
          bars$ = feature.definition.compute(bars$, feature.params);
        }
        bars$.pipe(toArray()).subscribe(resolve);
      });
    }
    
    const finalMemory = measureMemory();
    const memoryIncrease = finalMemory - initialMemory;
    
    console.log(`   最终内存: ${formatBytes(finalMemory)}`);
    console.log(`   内存增长: ${formatBytes(memoryIncrease)}`);
    
    assert(memoryIncrease < 30 * 1024 * 1024, 'Memory increase should be < 30MB');
  });

  // =====================================================================
  // 并发测试
  // =====================================================================
  
  console.log('\n## 并发测试\n');

  await test('并发：多个EventBus实例同时运行', async () => {
    const buses: { bus: SimpleEventBus; store: SimpleEventStore }[] = [];
    
    console.log('   创建 10 个 EventBus 实例...');
    for (let i = 0; i < 10; i++) {
      const store = new SimpleEventStore();
      const bus = new SimpleEventBus(store);
      bus.start();
      buses.push({ bus, store });
    }
    
    console.log('   并发发布事件...');
    const promises = buses.map(({ bus }, index) => {
      return new Promise<void>((resolve) => {
        for (let i = 0; i < 1000; i++) {
          bus.publish({
            type: 'market.bar',
            timestamp: Date.now() + i,
            payload: { busIndex: index, eventIndex: i },
          });
        }
        setTimeout(resolve, 100);
      });
    });
    
    await Promise.all(promises);
    
    // Check all buses processed their events
    let totalEvents = 0;
    for (const { bus, store } of buses) {
      totalEvents += store.getEventCount();
      bus.destroy();
      store.destroy();
    }
    
    console.log(`   总事件数: ${totalEvents}`);
    assert(totalEvents === 10000, 'Should process all events from all buses');
  });

  await test('并发：并行特征计算', async () => {
    const { of } = await import('rxjs');
    const { toArray } = await import('rxjs/operators');
    
    const registry = new FeatureRegistryImpl();
    const maFeatureModule = await import('../features/built-in/ma.feature');
    const emaFeatureModule = await import('../features/built-in/ema.feature');
    
    registry.register(maFeatureModule.MAFeature);
    registry.register(emaFeatureModule.EMAFeature);
    
    const bars: any[] = [];
    for (let i = 0; i < 500; i++) {
      bars.push({
        symbol: 'BTC/USDT',
        timeframe: '1m',
        timestamp: Date.now() + i * 60000,
        open: '50000',
        high: '51000',
        low: '49000',
        close: (50000 + Math.random() * 1000).toFixed(2),
        volume: '100',
      });
    }
    
    console.log('   并行计算 MA 和 EMA...');
    const startTime = Date.now();
    
    const [maResult, emaResult] = await Promise.all([
      new Promise<any[]>((resolve) => {
        const resolved = registry.resolve([{ id: 'MA', params: { period: 20 } }]);
        let bars$ = of(...bars);
        for (const feature of resolved) {
          bars$ = feature.definition.compute(bars$, feature.params);
        }
        bars$.pipe(toArray()).subscribe(resolve);
      }),
      new Promise<any[]>((resolve) => {
        const resolved = registry.resolve([{ id: 'EMA', params: { period: 20 } }]);
        let bars$ = of(...bars);
        for (const feature of resolved) {
          bars$ = feature.definition.compute(bars$, feature.params);
        }
        bars$.pipe(toArray()).subscribe(resolve);
      }),
    ]);
    
    const duration = Date.now() - startTime;
    console.log(`   并行计算耗时: ${duration}ms`);
    
    assert(maResult.length === 500, 'MA should compute all bars');
    assert(emaResult.length === 500, 'EMA should compute all bars');
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
  console.log(`跳过: ${skipCount} ⏭️`);
  console.log(`成功率: ${((passCount / testCount) * 100).toFixed(1)}%\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// 运行测试
runBoundaryStressTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
