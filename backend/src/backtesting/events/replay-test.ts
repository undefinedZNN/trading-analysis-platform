/**
 * 事件重放 & 性能基准测试
 */

import { EventReplay } from './replay';
import { SimpleEventBus, SimpleEventStore } from './simple-bus';
import * as fs from 'fs';

// === 测试辅助函数 ===

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function test(
  description: string,
  fn: () => void | Promise<void>
): Promise<void> {
  testCount++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
    passCount++;
    console.log(`✅ ${description}`);
  } catch (error: any) {
    failCount++;
    console.error(`❌ ${description}`);
    console.error(`   Error: ${error.message}`);
  }
}

// === 清理测试目录 ===

const testDir = './test-data/replay';

function cleanupTestDirs(): void {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// === 测试套件 ===

async function runTests(): Promise<void> {
  console.log('\n=== 事件重放 & 性能基准测试 ===\n');

  cleanupTestDirs();

  // === 测试1: 基本重放 ===

  await test('基本重放：重放所有事件', async () => {
    const store = new SimpleEventStore();

    // 追加10个事件
    for (let i = 0; i < 10; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i * 1000,
        payload: { index: i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    // 调试：检查 store 中的事件数
    const allEvents = store.getAll();
    console.log(`   [DEBUG] Store has ${allEvents.length} events`);

    const replay = new EventReplay({
      speedMode: 'fast',
    });

    let receivedEvents = 0;
    replay.event$.subscribe(() => {
      receivedEvents++;
    });

    await replay.replay(store);

    assert(receivedEvents === 10, `Should replay 10 events, got ${receivedEvents} (store has ${allEvents.length})`);

    const metrics = replay.getMetrics();
    assert(metrics.playedEvents === 10, 'Metrics should show 10 played events');
    assert(metrics.skippedEvents === 0, 'Should skip 0 events');

    replay.destroy();
    store.destroy();
  });

  // === 测试2: 按类型过滤 ===

  await test('按类型过滤：只重放特定类型事件', async () => {
    const store = new SimpleEventStore();

    // 追加不同类型的事件
    for (let i = 0; i < 5; i++) {
      store.append({ type: 'market.bar', timestamp: Date.now() + i, payload: {} });
      store.append({ type: 'strategy.intent', timestamp: Date.now() + i + 100, payload: {} });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const replay = new EventReplay({
      speedMode: 'fast',
      eventTypes: ['market.bar'],
    });

    let receivedEvents = 0;
    const types: string[] = [];

    replay.event$.subscribe((event) => {
      receivedEvents++;
      types.push(event.type);
    });

    await replay.replay(store);

    assert(receivedEvents === 5, `Should replay 5 events, got ${receivedEvents}`);
    assert(types.every((t) => t === 'market.bar'), 'All events should be market.bar');

    const metrics = replay.getMetrics();
    assert(metrics.skippedEvents === 5, 'Should skip 5 strategy.intent events');

    replay.destroy();
    store.destroy();
  });

  // === 测试3: 按时间范围过滤 ===

  await test('按时间范围过滤：只重放指定时间段事件', async () => {
    const store = new SimpleEventStore();

    const baseTime = Date.now();

    // 追加20个事件
    for (let i = 0; i < 20; i++) {
      store.append({
        type: 'market.bar',
        timestamp: baseTime + i * 1000,
        payload: { index: i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const replay = new EventReplay({
      speedMode: 'fast',
      startTime: baseTime + 5000,
      endTime: baseTime + 14999,
    });

    let receivedEvents = 0;
    replay.event$.subscribe(() => {
      receivedEvents++;
    });

    await replay.replay(store);

    // 应该重放索引 5-14 的事件（10个）
    assert(receivedEvents === 10, `Should replay 10 events, got ${receivedEvents}`);

    replay.destroy();
    store.destroy();
  });

  // === 测试4: 慢速重放 ===

  await test('慢速重放：固定延迟重放', async () => {
    const store = new SimpleEventStore();

    // 追加5个事件
    for (let i = 0; i < 5; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const replay = new EventReplay({
      speedMode: 'slow',
      fixedDelayMs: 50,
    });

    const timestamps: number[] = [];
    replay.event$.subscribe(() => {
      timestamps.push(Date.now());
    });

    const startTime = Date.now();
    await replay.replay(store);
    const duration = Date.now() - startTime;

    // 5个事件，4个间隔，每个50ms，总共约200ms
    assert(duration >= 180 && duration <= 300, `Duration should be ~200ms, got ${duration}ms`);

    replay.destroy();
    store.destroy();
  });

  // === 测试5: 暂停/恢复 ===

  await test('暂停/恢复：中途暂停后继续', async () => {
    const store = new SimpleEventStore();

    // 追加10个事件
    for (let i = 0; i < 10; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const replay = new EventReplay({
      speedMode: 'slow',
      fixedDelayMs: 50,
    });

    let receivedEvents = 0;

    replay.event$.subscribe(() => {
      receivedEvents++;
      
      // 收到第3个事件后暂停
      if (receivedEvents === 3) {
        replay.pause();
        
        // 200ms后恢复
        setTimeout(() => {
          replay.resume();
        }, 200);
      }
    });

    const startTime = Date.now();
    await replay.replay(store);
    const duration = Date.now() - startTime;

    assert(receivedEvents === 10, `Should replay 10 events, got ${receivedEvents}`);
    // 应该比正常时间（9*50=450ms）多至少200ms
    assert(duration >= 600, `Duration should be >= 650ms (with pause), got ${duration}ms`);

    replay.destroy();
    store.destroy();
  });

  // === 测试6: 进度追踪 ===

  await test('进度追踪：监控重放进度', async () => {
    const store = new SimpleEventStore();

    // 追加10个事件
    for (let i = 0; i < 10; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const replay = new EventReplay({
      speedMode: 'fast',
    });

    const progressHistory: number[] = [];

    replay.state$.subscribe((state) => {
      progressHistory.push(state.progress);
    });

    await replay.replay(store);

    assert(progressHistory.length > 0, 'Should have progress updates');
    assert(progressHistory[progressHistory.length - 1] === 1, 'Final progress should be 1');

    replay.destroy();
    store.destroy();
  });

  // === 性能测试 ===

  console.log('\n## 性能基准测试\n');

  await test('性能测试1：1000事件快速重放', async () => {
    const store = new SimpleEventStore();

    for (let i = 0; i < 1000; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { price: 50000 + i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    const replay = new EventReplay({
      speedMode: 'fast',
    });

    let receivedEvents = 0;
    replay.event$.subscribe(() => {
      receivedEvents++;
    });

    const startTime = Date.now();
    await replay.replay(store);
    const duration = Date.now() - startTime;

    const speed = (1000 / duration) * 1000;

    console.log(`   1000事件性能:`);
    console.log(`     耗时: ${duration}ms`);
    console.log(`     速度: ${speed.toFixed(2)} events/sec`);
    console.log(`     已重放: ${receivedEvents} 事件`);

    assert(receivedEvents === 1000, 'Should replay 1000 events');
    assert(speed > 1000, `Speed should be > 1000 events/sec, got ${speed.toFixed(2)}`);

    replay.destroy();
    store.destroy();
  });

  await test('性能测试2：10000事件快速重放', async () => {
    const store = new SimpleEventStore();

    for (let i = 0; i < 10000; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { price: 50000 + i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    const replay = new EventReplay({
      speedMode: 'fast',
    });

    let receivedEvents = 0;
    replay.event$.subscribe(() => {
      receivedEvents++;
    });

    const startTime = Date.now();
    await replay.replay(store);
    const duration = Date.now() - startTime;

    const speed = (10000 / duration) * 1000;

    console.log(`   10000事件性能:`);
    console.log(`     耗时: ${duration}ms`);
    console.log(`     速度: ${speed.toFixed(2)} events/sec`);
    console.log(`     已重放: ${receivedEvents} 事件`);

    assert(receivedEvents === 10000, 'Should replay 10000 events');
    assert(speed > 1000, `Speed should be > 1000 events/sec, got ${speed.toFixed(2)}`);

    replay.destroy();
    store.destroy();
  });

  await test('性能测试3：EventBus 10000+ 吞吐量测试', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    let receivedEvents = 0;

    bus.subscribe('market.bar').subscribe(() => {
      receivedEvents++;
    });

    bus.start();

    const totalEvents = 10000;
    const startTime = Date.now();

    for (let i = 0; i < totalEvents; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { price: 50000 + i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const duration = Date.now() - startTime;
    const throughput = (receivedEvents / duration) * 1000;

    console.log(`   EventBus 吞吐量:`);
    console.log(`     处理事件: ${receivedEvents}/${totalEvents}`);
    console.log(`     耗时: ${duration}ms`);
    console.log(`     吞吐量: ${throughput.toFixed(2)} events/sec`);

    assert(receivedEvents === totalEvents, `Should process all ${totalEvents} events`);
    assert(throughput > 10000, `Throughput should be > 10000 events/sec, got ${throughput.toFixed(2)}`);

    bus.destroy();
    store.destroy();
  });

  // === 清理 ===
  cleanupTestDirs();

  // === 测试总结 ===
  console.log('\n=== 测试总结 ===\n');
  console.log(`总测试数: ${testCount}`);
  console.log(`通过: ${passCount}`);
  console.log(`失败: ${failCount}`);
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

