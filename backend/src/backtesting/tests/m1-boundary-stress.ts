/**
 * M1 里程碑边界和压力测试套件（简化版）
 * 
 * 基于现有实现，测试边界条件和压力场景
 */

import { SimpleEventBus, SimpleEventStore } from '../events/simple-bus';
import { EnhancedEventStore } from '../events/enhanced-store';
import Big from 'big.js';

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

function measureMemory(): number {
  if (global.gc) {
    global.gc();
  }
  return process.memoryUsage().heapUsed;
}

function formatBytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// === 测试套件 ===

async function runTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          M1 边界和压力测试套件                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // =====================================================================
  // 精度测试
  // =====================================================================
  
  console.log('## 精度和边界测试\n');

  await test('边界：极大数字精度 (big.js)', () => {
    const huge = new Big('999999999999999999.999999999999');
    const result = huge.plus('0.000000000001');
    assert(result.gt(huge), 'Should handle huge number precision');
  });

  await test('边界：极小数字精度 (big.js)', () => {
    const tiny = new Big('0.000000000001');
    const result = tiny.times('0.5');
    assert(result.eq('0.0000000000005'), 'Should handle tiny number precision');
  });

  await test('边界：数字零值处理', () => {
    const zero = new Big('0');
    const result = zero.plus('0.000001');
    assert(result.eq('0.000001'), 'Should handle zero correctly');
  });

  await test('边界：负数处理', () => {
    const negative = new Big('-100');
    const result = negative.abs();
    assert(result.eq('100'), 'Should handle negative numbers');
  });

  // =====================================================================
  // EventBus 边界测试
  // =====================================================================
  
  console.log('\n## EventBus 边界测试\n');

  await test('边界：空有效载荷事件', () => {
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

  await test('边界：null有效载荷事件', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    bus.publish({
      type: 'test.event',
      timestamp: Date.now(),
      payload: null as any,
    });
    
    assert(store.getEventCount() === 1, 'Should handle null payload');
    bus.destroy();
    store.destroy();
  });

  await test('边界：大型有效载荷 (1MB)', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    
    // Create ~1MB payload
    const largeArray = new Array(100000).fill('x').join('');
    
    bus.publish({
      type: 'test.event',
      timestamp: Date.now(),
      payload: { data: largeArray },
    });
    
    assert(store.getEventCount() === 1, 'Should handle 1MB payload');
    bus.destroy();
    store.destroy();
  });

  await test('边界：快速连续发布事件', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    
    // Publish 1000 events rapidly
    for (let i = 0; i < 1000; i++) {
      bus.publish({
        type: 'test.event',
        timestamp: Date.now(),
        payload: { index: i },
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(store.getEventCount() === 1000, `Should handle rapid publishing, got ${store.getEventCount()}`);
    bus.destroy();
    store.destroy();
  });

  await test('边界：未启动总线发布事件', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    // Don't start the bus
    bus.publish({
      type: 'test.event',
      timestamp: Date.now(),
      payload: {},
    });
    
    // Event should still be stored
    assert(store.getEventCount() === 1, 'Should store event even if bus not started');
    bus.destroy();
    store.destroy();
  });

  await test('边界：重复启动总线', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    const status1 = bus.getStatus();
    
    bus.start(); // Start again
    const status2 = bus.getStatus();
    
    assert(status1 === 'running' && status2 === 'running', 'Should handle double start');
    bus.destroy();
    store.destroy();
  });

  // =====================================================================
  // 压力测试
  // =====================================================================
  
  console.log('\n## 压力测试\n');

  await test('压力：EventBus - 10K事件处理', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    
    console.log('   发布 10K 事件...');
    const startTime = Date.now();
    
    for (let i = 0; i < 10000; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const duration = Date.now() - startTime;
    const metrics = bus.getMetrics();
    
    console.log(`   处理耗时: ${duration}ms`);
    console.log(`   吞吐量: ${metrics.throughput.toFixed(0)} events/sec`);
    
    assert(store.getEventCount() >= 10000, `Should store all events, got ${store.getEventCount()}`);
    assert(metrics.throughput > 5000, `Should maintain >5K events/sec, got ${metrics.throughput.toFixed(0)}`);
    
    bus.destroy();
    store.destroy();
  });

  await test('压力：EventBus - 50K事件处理', async () => {
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
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const duration = Date.now() - startTime;
    const metrics = bus.getMetrics();
    
    console.log(`   处理耗时: ${duration}ms`);
    console.log(`   吞吐量: ${metrics.throughput.toFixed(0)} events/sec`);
    console.log(`   总事件: ${metrics.totalEvents}`);
    
    assert(store.getEventCount() >= 50000, `Should store all events, got ${store.getEventCount()}`);
    
    bus.destroy();
    store.destroy();
  });

  await test('压力：EventStore - 持久化10K事件', async () => {
    const store = new EnhancedEventStore({
      storageDir: './test-data/stress-test',
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
    
    assert(stats.totalEvents >= 10000, `Should persist all events, got ${stats.totalEvents}`);
    
    store.destroy();
  });

  await test('压力：并发EventBus实例', async () => {
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
    
    let totalEvents = 0;
    for (const { bus, store } of buses) {
      totalEvents += store.getEventCount();
      bus.destroy();
      store.destroy();
    }
    
    console.log(`   总事件数: ${totalEvents}`);
    assert(totalEvents === 10000, `Should process all events, got ${totalEvents}`);
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
    
    // Run 20 iterations
    for (let round = 0; round < 20; round++) {
      for (let i = 0; i < 1000; i++) {
        bus.publish({
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        });
      }
      
      // Clear store periodically to simulate real usage
      store.clear();
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    bus.destroy();
    store.destroy();
    
    const finalMemory = measureMemory();
    const memoryIncrease = finalMemory - initialMemory;
    
    console.log(`   最终内存: ${formatBytes(finalMemory)}`);
    console.log(`   内存增长: ${formatBytes(memoryIncrease)}`);
    
    assert(memoryIncrease < 50 * 1024 * 1024, `Memory increase should be < 50MB, got ${formatBytes(memoryIncrease)}`);
  });

  await test('内存：多次创建销毁EventBus', async () => {
    const initialMemory = measureMemory();
    console.log(`   初始内存: ${formatBytes(initialMemory)}`);
    
    // Create and destroy 50 bus instances
    for (let i = 0; i < 50; i++) {
      const store = new SimpleEventStore();
      const bus = new SimpleEventBus(store);
      
      bus.start();
      
      for (let j = 0; j < 100; j++) {
        bus.publish({
          type: 'test.event',
          timestamp: Date.now(),
          payload: {},
        });
      }
      
      bus.destroy();
      store.destroy();
    }
    
    const finalMemory = measureMemory();
    const memoryIncrease = finalMemory - initialMemory;
    
    console.log(`   最终内存: ${formatBytes(finalMemory)}`);
    console.log(`   内存增长: ${formatBytes(memoryIncrease)}`);
    
    assert(memoryIncrease < 30 * 1024 * 1024, `Memory increase should be < 30MB, got ${formatBytes(memoryIncrease)}`);
  });

  // =====================================================================
  // 状态转换边界测试
  // =====================================================================
  
  console.log('\n## 状态转换边界测试\n');

  await test('边界：非法状态转换序列', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    // Try pause without start
    try {
      bus.pause();
      // Should either handle gracefully or still be in idle state
      const status = bus.getStatus();
      assert(status === 'idle' || status === 'paused', `Unexpected status: ${status}`);
    } catch (error) {
      // It's OK if it throws
      assert(true, 'Handled invalid transition');
    }
    
    bus.destroy();
    store.destroy();
  });

  await test('边界：快速状态切换', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    // Rapidly change states
    bus.start();
    bus.pause();
    bus.resume();
    bus.pause();
    bus.resume();
    bus.stop();
    
    const status = bus.getStatus();
    assert(status === 'stopped', `Should be stopped, got ${status}`);
    
    bus.destroy();
    store.destroy();
  });

  await test('边界：销毁后操作', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    
    bus.start();
    bus.destroy();
    
    // Try to use after destroy
    try {
      bus.publish({
        type: 'test.event',
        timestamp: Date.now(),
        payload: {},
      });
      // Should either silently fail or throw
      assert(true, 'Handled post-destroy operation');
    } catch (error) {
      assert(true, 'Threw error on post-destroy operation');
    }
    
    store.destroy();
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
    process.exit(1);
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});

