/**
 * AutoSubscribeEventBus 测试
 */

import { AutoSubscribeEventBus } from './auto-subscribe-bus';
import { SimpleEventStore } from './simple-bus';

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
  console.log('║          AutoSubscribeEventBus 测试套件                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // =====================================================================
  // 基础功能测试
  // =====================================================================
  
  console.log('## 基础功能测试\n');

  await test('默认启用自动订阅', () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store);
    
    assert(bus.isAutoSubscribeEnabled(), 'Should enable auto-subscribe by default');
    assert(bus.isKeepAliveActive(), 'Keep-alive should be active');
    
    bus.destroy();
    store.destroy();
  });

  await test('显式启用自动订阅', () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    assert(bus.isAutoSubscribeEnabled(), 'Should enable auto-subscribe');
    assert(bus.isKeepAliveActive(), 'Keep-alive should be active');
    
    bus.destroy();
    store.destroy();
  });

  await test('禁用自动订阅', () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: false });
    
    assert(!bus.isAutoSubscribeEnabled(), 'Should disable auto-subscribe');
    assert(!bus.isKeepAliveActive(), 'Keep-alive should not be active');
    
    bus.destroy();
    store.destroy();
  });

  // =====================================================================
  // 事件处理测试
  // =====================================================================
  
  console.log('\n## 事件处理测试\n');

  await test('自动订阅时事件正常存储', async () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    bus.start();
    
    // 发布事件，无需手动订阅
    bus.publish({
      type: 'market.bar',
      timestamp: Date.now(),
      payload: { price: 50000 },
    });
    
    // 等待异步处理
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(store.getEventCount() === 1, `Should store 1 event, got ${store.getEventCount()}`);
    
    bus.destroy();
    store.destroy();
  });

  await test('自动订阅时可以发布多个事件', async () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    bus.start();
    
    // 发布10个事件
    for (let i = 0; i < 10; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(store.getEventCount() === 10, `Should store 10 events, got ${store.getEventCount()}`);
    
    bus.destroy();
    store.destroy();
  });

  await test('禁用自动订阅时事件不会存储（除非手动订阅）', async () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: false });
    
    bus.start();
    
    // 发布事件，没有订阅者
    bus.publish({
      type: 'market.bar',
      timestamp: Date.now(),
      payload: {},
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(store.getEventCount() === 0, `Should store 0 events without subscription, got ${store.getEventCount()}`);
    
    bus.destroy();
    store.destroy();
  });

  await test('禁用自动订阅后手动订阅仍然工作', async () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: false });
    
    // 手动创建订阅
    const sub = bus.event$.subscribe();
    
    bus.start();
    
    bus.publish({
      type: 'market.bar',
      timestamp: Date.now(),
      payload: {},
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(store.getEventCount() === 1, `Should store 1 event with manual subscription, got ${store.getEventCount()}`);
    
    sub.unsubscribe();
    bus.destroy();
    store.destroy();
  });

  // =====================================================================
  // 生命周期测试
  // =====================================================================
  
  console.log('\n## 生命周期测试\n');

  await test('destroy 时自动清理订阅', () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    assert(bus.isKeepAliveActive(), 'Keep-alive should be active');
    
    bus.destroy();
    
    assert(!bus.isKeepAliveActive(), 'Keep-alive should be inactive after destroy');
    
    store.destroy();
  });

  await test('重新激活保活订阅', () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    assert(bus.isKeepAliveActive(), 'Keep-alive should be active initially');
    
    // 模拟订阅被取消（在实际场景中不应该发生）
    // 这里我们通过重新激活来测试
    bus.reactivateKeepAlive();
    
    assert(bus.isKeepAliveActive(), 'Keep-alive should still be active after reactivate');
    
    bus.destroy();
    store.destroy();
  });

  await test('禁用自动订阅时无法重新激活', () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: false });
    
    assert(!bus.isKeepAliveActive(), 'Keep-alive should not be active');
    
    // 尝试重新激活（应该失败）
    bus.reactivateKeepAlive();
    
    assert(!bus.isKeepAliveActive(), 'Keep-alive should still be inactive');
    
    bus.destroy();
    store.destroy();
  });

  // =====================================================================
  // 指标测试
  // =====================================================================
  
  console.log('\n## 指标测试\n');

  await test('自动订阅时指标正常更新', async () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    bus.start();
    
    // 发布5个事件
    for (let i = 0; i < 5; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const metrics = bus.getMetrics();
    assert(metrics.totalEvents === 5, `Should have 5 events in metrics, got ${metrics.totalEvents}`);
    assert(metrics.throughput > 0, 'Throughput should be > 0');
    
    bus.destroy();
    store.destroy();
  });

  // =====================================================================
  // 压力测试
  // =====================================================================
  
  console.log('\n## 压力测试\n');

  await test('自动订阅时处理1000个事件', async () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    bus.start();
    
    console.log('   发布 1000 个事件...');
    const startTime = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const duration = Date.now() - startTime;
    const metrics = bus.getMetrics();
    
    console.log(`   处理耗时: ${duration}ms`);
    console.log(`   吞吐量: ${metrics.throughput.toFixed(0)} events/sec`);
    console.log(`   存储事件: ${store.getEventCount()}`);
    
    assert(store.getEventCount() === 1000, `Should store 1000 events, got ${store.getEventCount()}`);
    
    bus.destroy();
    store.destroy();
  });

  // =====================================================================
  // 兼容性测试
  // =====================================================================
  
  console.log('\n## 兼容性测试\n');

  await test('完全兼容 SimpleEventBus API', async () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    // 测试所有标准 API
    bus.start();
    assert(bus.getStatus() === 'running', 'Should be running');
    
    bus.pause();
    assert(bus.getStatus() === 'paused', 'Should be paused');
    
    bus.resume();
    assert(bus.getStatus() === 'running', 'Should be running again');
    
    bus.stop();
    assert(bus.getStatus() === 'stopped', 'Should be stopped');
    
    // 测试订阅
    const sub = bus.subscribe('test').subscribe(() => {});
    sub.unsubscribe();
    
    // 测试指标
    const metrics = bus.getMetrics();
    assert(metrics !== null, 'Should have metrics');
    
    bus.destroy();
    store.destroy();
  });

  await test('可以与其他订阅者共存', async () => {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
    
    let receivedEvents = 0;
    
    // 添加业务订阅者
    const sub = bus.subscribe('market.bar').subscribe(() => {
      receivedEvents++;
    });
    
    bus.start();
    
    // 发布事件
    for (let i = 0; i < 5; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(receivedEvents === 5, `Should receive 5 events, got ${receivedEvents}`);
    assert(store.getEventCount() === 5, `Should store 5 events, got ${store.getEventCount()}`);
    
    sub.unsubscribe();
    bus.destroy();
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

