/**
 * EventBus 端到端集成测试
 * 
 * 测试完整的事件处理管道：
 * 1. EventBus 发布/订阅
 * 2. ControlEventHandler 状态管理
 * 3. DeadLetterQueue 错误处理
 * 4. EnhancedEventStore 持久化
 * 5. 事件重放
 * 
 * @module IntegrationTest
 */

import { SimpleEventBus, SimpleEventStore } from './simple-bus';
import { EnhancedEventStore } from './enhanced-store';
import { ControlEventHandler } from './control-handler';
import { DeadLetterQueue } from './dead-letter-queue';
import { take, toArray } from 'rxjs';
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

const testDir = './test-data/integration';

function cleanupTestDirs(): void {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// === 测试套件 ===

async function runTests(): Promise<void> {
  console.log('\n=== EventBus 端到端集成测试 ===\n');

  cleanupTestDirs();

  // === 测试1: 完整事件管道 ===

  await test('完整事件管道：发布 → 订阅 → 处理', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    let receivedEvents = 0;

    bus.subscribe('market.bar').subscribe({
      next: () => {
        receivedEvents++;
      },
    });

    bus.start();

    // 发布10个事件
    for (let i = 0; i < 10; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    // 等待处理完成
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert(receivedEvents === 10, `Should receive 10 events, got ${receivedEvents}`);
    assert(bus.getMetrics().totalEvents === 10, 'Bus should have 10 events');

    bus.destroy();
    store.destroy();
  });

  // === 测试2: 状态控制集成 ===

  await test('状态控制集成：START → PAUSE → RESUME → STOP', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    const handler = new ControlEventHandler();

    const states: string[] = [];
    let currentState = { status: 'idle' as any, eventCount: 0, errorCount: 0, bufferUsage: 0, backpressure: false };

    bus.state$.subscribe((state) => {
      states.push(state.status);
      currentState = state;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // START
    handler.handle(
      { type: 'START', timestamp: Date.now() },
      currentState,
      () => bus.start()
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    // PAUSE
    handler.handle(
      { type: 'PAUSE', timestamp: Date.now() },
      currentState,
      () => bus.pause()
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    // RESUME
    handler.handle(
      { type: 'RESUME', timestamp: Date.now() },
      currentState,
      () => bus.resume()
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    // STOP
    handler.handle(
      { type: 'STOP', timestamp: Date.now() },
      currentState,
      () => bus.stop()
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert(states.includes('running'), 'Should have running state');
    assert(states.includes('paused'), 'Should have paused state');
    assert(states.includes('stopped'), 'Should have stopped state');

    const handlerStats = handler.getStats();
    assert(handlerStats.totalEvents === 4, 'Should have 4 control events');
    assert(handlerStats.successRate === 1, 'All control events should succeed');

    bus.destroy();
    store.destroy();
    handler.destroy();
  });

  // === 测试3: 死信队列集成 ===

  await test('死信队列集成：失败事件 → 死信 → 重试', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    const dlq = new DeadLetterQueue({
      storageDir: `${testDir}/dlq`,
      enablePersistence: false,
    });

    let processCount = 0;
    let failCount = 0;

    bus.subscribe('market.bar').subscribe({
      next: (event) => {
        processCount++;
        // 模拟前3次失败
        if (processCount <= 3) {
          failCount++;
          dlq.add(event, new Error('Temporary failure'), 'test-sub');
        }
      },
    });

    bus.start();

    // 发布5个事件
    for (let i = 0; i < 5; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert(processCount === 5, `Should process 5 events, got ${processCount}`);
    assert(failCount === 3, `Should have 3 failures, got ${failCount}`);
    assert(dlq.getSize() === 3, `DLQ should have 3 events, got ${dlq.getSize()}`);

    // 重试失败事件
    let retrySuccess = 0;
    const result = await dlq.retryAll(async () => {
      retrySuccess++;
      // 模拟成功
    });

    assert(result.success === 3, `Should retry 3 events successfully, got ${result.success}`);
    assert(dlq.getSize() === 0, 'DLQ should be empty after successful retry');

    bus.destroy();
    store.destroy();
    dlq.destroy();
  });

  // === 测试4: 持久化集成 ===

  await test('持久化集成：事件 → Parquet → 统计', async () => {
    const store = new EnhancedEventStore({
      storageDir: `${testDir}/events`,
      enablePersistence: true,
      flushBatchSize: 10,
      enableCompression: true,
    });

    // 追加20个事件（触发2次刷盘）
    for (let i = 0; i < 20; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i, price: 50000 + i * 100 },
      });
    }

    // 等待刷盘完成
    await new Promise((resolve) => setTimeout(resolve, 200));

    const stats = store.getStats();
    assert(stats.totalEvents === 20, `Should have 20 events, got ${stats.totalEvents}`);
    assert(stats.filesCount >= 2, `Should have at least 2 files, got ${stats.filesCount}`);
    assert(stats.totalFileSize > 0, 'Should have files on disk');

    const files = store.getFiles();
    assert(files.length >= 2, `Should have 2 file metadata, got ${files.length}`);

    console.log(`   持久化统计:`);
    console.log(`     事件数: ${stats.totalEvents}`);
    console.log(`     文件数: ${stats.filesCount}`);
    console.log(`     文件大小: ${(stats.totalFileSize / 1024).toFixed(2)} KB`);

    store.destroy();
  });

  // === 测试5: 检查点和恢复 ===

  await test('检查点和恢复：状态保存 → 恢复', async () => {
    const store = new EnhancedEventStore({
      storageDir: `${testDir}/checkpoint`,
      enablePersistence: true,
    });

    // 追加10个事件
    for (let i = 0; i < 10; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    // 创建检查点
    const meta1 = store.checkpoint('cp1');
    assert(meta1.checkpointId === 'cp1', 'Checkpoint ID should match');

    // 追加更多事件
    for (let i = 10; i < 20; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    // 创建第二个检查点
    const meta2 = store.checkpoint('cp2');

    // 恢复到第一个检查点
    const snapshot1 = store.restore('cp1');
    assert(snapshot1.checkpointId === 'cp1', 'Restored checkpoint should match');
    assert(snapshot1.eventCount === 10, 'Should have 10 events at cp1');

    // 恢复到第二个检查点
    const snapshot2 = store.restore('cp2');
    assert(snapshot2.eventCount === 20, 'Should have 20 events at cp2');

    const checkpoints = store.listCheckpoints();
    assert(checkpoints.length === 2, `Should have 2 checkpoints, got ${checkpoints.length}`);

    store.destroy();
  });

  // === 测试6: 多订阅者模式 ===

  await test('多订阅者模式：广播事件到多个订阅者', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    const received = {
      sub1: 0,
      sub2: 0,
      sub3: 0,
    };

    // 订阅者1
    bus.subscribe('market.bar').subscribe(() => {
      received.sub1++;
    });

    // 订阅者2
    bus.subscribe('market.bar').subscribe(() => {
      received.sub2++;
    });

    // 订阅者3（订阅多种类型）
    bus.subscribe(['market.bar', 'strategy.intent']).subscribe((event) => {
      received.sub3++;
    });

    bus.start();

    // 发布市场数据
    for (let i = 0; i < 5; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    // 发布策略信号
    for (let i = 0; i < 3; i++) {
      bus.publish({
        type: 'strategy.intent',
        timestamp: Date.now() + i,
        payload: { action: 'BUY' },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert(received.sub1 === 5, `Sub1 should receive 5 events, got ${received.sub1}`);
    assert(received.sub2 === 5, `Sub2 should receive 5 events, got ${received.sub2}`);
    assert(received.sub3 === 8, `Sub3 should receive 8 events, got ${received.sub3}`);

    bus.destroy();
    store.destroy();
  });

  // === 测试7: 高负载测试 ===

  await test('高负载测试：处理大量事件', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store, {
      bufferSize: 1000,
      backpressureThreshold: 0.8,
    });

    let processedEvents = 0;

    bus.subscribe('market.bar').subscribe(() => {
      processedEvents++;
    });

    bus.start();

    // 发布大量事件
    const totalEvents = 500;
    for (let i = 0; i < totalEvents; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert(processedEvents === totalEvents, `Should process ${totalEvents} events, got ${processedEvents}`);

    const metrics = bus.getMetrics();
    assert(metrics.totalEvents === totalEvents, `Metrics should show ${totalEvents} events`);

    console.log(`   高负载指标:`);
    console.log(`     处理事件数: ${processedEvents}`);
    console.log(`     总事件数: ${metrics.totalEvents}`);
    console.log(`     吞吐量: ${metrics.throughput.toFixed(2)} events/sec`);

    bus.destroy();
    store.destroy();
  });

  // === 测试8: 完整回测模拟 ===

  await test('完整回测模拟：市场数据 → 策略 → 风控 → 执行', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    const pipeline = {
      marketEvents: 0,
      strategySignals: 0,
      riskDecisions: 0,
      executionOrders: 0,
    };

    // 策略订阅者：市场数据 → 策略信号
    bus.subscribe('market.bar').subscribe((event) => {
      pipeline.marketEvents++;
      const price = parseFloat(event.payload.close);

      if (price > 50000) {
        bus.publish({
          type: 'strategy.intent',
          timestamp: Date.now(),
          payload: { action: 'BUY', symbol: event.payload.symbol },
        });
      }
    });

    // 风控订阅者：策略信号 → 风控决策
    bus.subscribe('strategy.intent').subscribe((event) => {
      pipeline.strategySignals++;

      bus.publish({
        type: 'risk.decision',
        timestamp: Date.now(),
        payload: { approved: true, action: event.payload.action },
      });
    });

    // 执行订阅者：风控决策 → 订单执行
    bus.subscribe('risk.decision').subscribe((event) => {
      pipeline.riskDecisions++;

      if (event.payload.approved) {
        bus.publish({
          type: 'execution.order',
          timestamp: Date.now(),
          payload: { status: 'FILLED' },
        });
      }
    });

    // 账簿订阅者：订单执行 → 记录
    bus.subscribe('execution.order').subscribe(() => {
      pipeline.executionOrders++;
    });

    bus.start();

    // 发布市场数据
    const prices = [49000, 50500, 51000, 49500, 50800];
    for (let i = 0; i < prices.length; i++) {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { symbol: 'BTC/USDT', close: prices[i].toString() },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert(pipeline.marketEvents === 5, `Should process 5 market events, got ${pipeline.marketEvents}`);
    assert(pipeline.strategySignals === 3, `Should generate 3 strategy signals, got ${pipeline.strategySignals}`);
    assert(pipeline.riskDecisions === 3, `Should make 3 risk decisions, got ${pipeline.riskDecisions}`);
    assert(pipeline.executionOrders === 3, `Should execute 3 orders, got ${pipeline.executionOrders}`);

    console.log(`   回测管道统计:`);
    console.log(`     市场事件: ${pipeline.marketEvents}`);
    console.log(`     策略信号: ${pipeline.strategySignals}`);
    console.log(`     风控决策: ${pipeline.riskDecisions}`);
    console.log(`     执行订单: ${pipeline.executionOrders}`);

    const metrics = bus.getMetrics();
    console.log(`     总事件数: ${metrics.totalEvents}`);
    console.log(`     吞吐量: ${metrics.throughput.toFixed(2)} events/sec`);

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

