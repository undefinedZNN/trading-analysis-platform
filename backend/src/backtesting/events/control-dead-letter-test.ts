/**
 * 控制事件处理器 & 死信队列 测试运行器
 */

import { ControlEventHandler } from './control-handler';
import { DeadLetterQueue } from './dead-letter-queue';
import { SimpleEventBus, SimpleEventStore, SimpleRunStatus } from './simple-bus';
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

const testDLQDir = './test-data/dead-letter';

function cleanupTestDirs(): void {
  if (fs.existsSync(testDLQDir)) {
    fs.rmSync(testDLQDir, { recursive: true, force: true });
  }
}

// === 测试套件 ===

async function runTests(): Promise<void> {
  console.log('\n=== 控制事件处理器 & 死信队列 测试 ===\n');

  cleanupTestDirs();

  // === ControlEventHandler 测试 ===

  console.log('## ControlEventHandler 测试\n');

  await test('可以创建控制事件处理器', () => {
    const handler = new ControlEventHandler();
    assert(handler.getStats().totalEvents === 0, 'Total events should be 0');
    handler.destroy();
  });

  await test('可以处理 START 控制事件', () => {
    const handler = new ControlEventHandler();
    const state = { status: 'idle' as SimpleRunStatus, eventCount: 0, errorCount: 0, bufferUsage: 0, backpressure: false };

    let executed = false;
    const result = handler.handle(
      { type: 'START', timestamp: Date.now() },
      state,
      () => { executed = true; }
    );

    assert(result.success, 'Result should be successful');
    assert(result.previousStatus === 'idle', 'Previous status should be idle');
    assert(result.newStatus === 'running', 'New status should be running');
    assert(executed, 'Action should be executed');

    handler.destroy();
  });

  await test('可以验证非法状态转换', () => {
    const handler = new ControlEventHandler({ strictMode: true });
    const state = { status: 'idle' as SimpleRunStatus, eventCount: 0, errorCount: 0, bufferUsage: 0, backpressure: false };

    try {
      handler.handle(
        { type: 'PAUSE', timestamp: Date.now() }, // 不能从 idle 转换到 paused
        state,
        () => {}
      );
      throw new Error('Should have thrown error');
    } catch (error: any) {
      assert(
        error.message.includes('Invalid state transition'),
        'Should throw Invalid state transition error'
      );
    }

    handler.destroy();
  });

  await test('可以记录控制事件历史', () => {
    const handler = new ControlEventHandler();
    const state = { status: 'idle' as SimpleRunStatus, eventCount: 0, errorCount: 0, bufferUsage: 0, backpressure: false };

    // 执行多个控制事件
    handler.handle({ type: 'START', timestamp: Date.now() }, state, () => {});
    state.status = 'running';
    handler.handle({ type: 'PAUSE', timestamp: Date.now() }, state, () => {});
    state.status = 'paused';
    handler.handle({ type: 'RESUME', timestamp: Date.now() }, state, () => {});

    const history = handler.getHistory();
    assert(history.length === 3, 'History should have 3 entries');
    assert(history[0].event.type === 'START', 'First event should be START');
    assert(history[1].event.type === 'PAUSE', 'Second event should be PAUSE');
    assert(history[2].event.type === 'RESUME', 'Third event should be RESUME');

    handler.destroy();
  });

  await test('可以获取统计信息', () => {
    const handler = new ControlEventHandler();
    const state = { status: 'idle' as SimpleRunStatus, eventCount: 0, errorCount: 0, bufferUsage: 0, backpressure: false };

    // 成功事件
    handler.handle({ type: 'START', timestamp: Date.now() }, state, () => {});

    // 失败事件（忽略错误）
    try {
      handler.handle({ type: 'PAUSE', timestamp: Date.now() }, state, () => {});
    } catch {}

    const stats = handler.getStats();
    assert(stats.totalEvents === 2, 'Total events should be 2');
    assert(stats.successCount === 1, 'Success count should be 1');
    assert(stats.errorCount === 1, 'Error count should be 1');
    assert(stats.successRate === 0.5, 'Success rate should be 0.5');

    handler.destroy();
  });

  // === DeadLetterQueue 测试 ===

  console.log('\n## DeadLetterQueue 测试\n');

  await test('可以创建死信队列', () => {
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    assert(dlq.getSize() === 0, 'Queue should be empty');
    dlq.destroy();
  });

  await test('可以添加死信事件', () => {
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    const event = {
      type: 'market.bar',
      timestamp: Date.now(),
      payload: { symbol: 'BTC/USDT' },
    };

    dlq.add(event, new Error('Processing failed'), 'test-subscription');

    assert(dlq.getSize() === 1, 'Queue should have 1 event');

    const events = dlq.getAll();
    assert(events[0].originalEvent.type === 'market.bar', 'Event type should match');
    assert(events[0].error === 'Processing failed', 'Error message should match');
    assert(events[0].subscription === 'test-subscription', 'Subscription should match');

    dlq.destroy();
  });

  await test('可以判断错误是否可重试', () => {
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    const strategy = {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffFactor: 2,
      retryableErrors: [/timeout/i, /network/i],
    };

    assert(dlq.isRetryable('Connection timeout', strategy), 'Timeout error should be retryable');
    assert(dlq.isRetryable('Network error', strategy), 'Network error should be retryable');
    assert(!dlq.isRetryable('Invalid data', strategy), 'Invalid data error should not be retryable');

    dlq.destroy();
  });

  await test('可以计算重试延迟', () => {
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    const strategy = {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffFactor: 2,
    };

    const delay0 = dlq.calculateRetryDelay(0, strategy);
    const delay1 = dlq.calculateRetryDelay(1, strategy);
    const delay2 = dlq.calculateRetryDelay(2, strategy);

    assert(delay0 === 100, 'First delay should be 100ms');
    assert(delay1 === 200, 'Second delay should be 200ms');
    assert(delay2 === 400, 'Third delay should be 400ms');

    // 测试最大延迟
    const delay10 = dlq.calculateRetryDelay(10, strategy);
    assert(delay10 === 1000, 'Delay should be capped at maxDelayMs');

    dlq.destroy();
  });

  await test('可以重试单个事件', async () => {
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    const event = {
      type: 'market.bar',
      timestamp: Date.now(),
      payload: { symbol: 'BTC/USDT' },
    };

    dlq.add(event, new Error('Temporary failure'), 'test');

    let handlerCalled = false;
    const handler = async () => {
      handlerCalled = true;
      // 模拟成功
    };

    const deadEvent = dlq.getAll()[0];
    const result = await dlq.retry(deadEvent, handler, {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffFactor: 2,
    });

    assert(result, 'Retry should be successful');
    assert(handlerCalled, 'Handler should be called');
    assert(dlq.getSize() === 0, 'Event should be removed from queue after successful retry');

    dlq.destroy();
  });

  await test('重试失败后应更新重试次数', async () => {
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    const event = {
      type: 'market.bar',
      timestamp: Date.now(),
      payload: { symbol: 'BTC/USDT' },
    };

    dlq.add(event, new Error('Persistent failure'), 'test');

    const handler = async () => {
      throw new Error('Still failing');
    };

    const deadEvent = dlq.getAll()[0];
    const originalRetryCount = deadEvent.retryCount;

    const result = await dlq.retry(deadEvent, handler, {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffFactor: 2,
    });

    assert(!result, 'Retry should fail');
    assert(deadEvent.retryCount === originalRetryCount + 1, 'Retry count should be incremented');
    assert(dlq.getSize() === 1, 'Event should remain in queue after failed retry');

    dlq.destroy();
  });

  await test('可以按订阅者筛选', () => {
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    dlq.add({ type: 'event1', timestamp: Date.now(), payload: {} }, 'Error 1', 'sub1');
    dlq.add({ type: 'event2', timestamp: Date.now(), payload: {} }, 'Error 2', 'sub2');
    dlq.add({ type: 'event3', timestamp: Date.now(), payload: {} }, 'Error 3', 'sub1');

    const sub1Events = dlq.getBySubscription('sub1');
    assert(sub1Events.length === 2, 'Should have 2 events for sub1');

    dlq.destroy();
  });

  await test('可以获取统计信息', () => {
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    dlq.add({ type: 'event1', timestamp: Date.now(), payload: {} }, 'Error: timeout', 'sub1');
    dlq.add({ type: 'event2', timestamp: Date.now(), payload: {} }, 'Error: network', 'sub2');
    dlq.add({ type: 'event3', timestamp: Date.now(), payload: {} }, 'Error: timeout', 'sub1');

    const stats = dlq.getStats();
    assert(stats.totalEvents === 3, 'Total events should be 3');
    assert(stats.bySubscription['sub1'] === 2, 'sub1 should have 2 events');
    assert(stats.bySubscription['sub2'] === 1, 'sub2 should have 1 event');
    assert(stats.byErrorType['Error'] === 3, 'Should have 3 Error type events');

    dlq.destroy();
  });

  // === 集成测试 ===

  console.log('\n## 集成测试\n');

  await test('EventBus + ControlEventHandler + DeadLetterQueue 集成', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);
    const controlHandler = new ControlEventHandler();
    const dlq = new DeadLetterQueue({
      storageDir: testDLQDir,
      enablePersistence: false,
    });

    // 订阅控制结果
    let controlResultReceived = false;
    controlHandler.result$.subscribe((result) => {
      controlResultReceived = true;
    });

    // 订阅死信事件
    let deadLetterReceived = false;
    dlq.event$.subscribe((event) => {
      deadLetterReceived = true;
    });

    // 启动总线
    bus.start();

    // 发布事件
    bus.publish({
      type: 'market.bar',
      timestamp: Date.now(),
      payload: { symbol: 'BTC/USDT' },
    });

    // 模拟失败事件
    dlq.add(
      { type: 'failed.event', timestamp: Date.now(), payload: {} },
      'Processing error'
    );

    // 等待异步操作
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert(bus.getStatus() === 'running', 'Bus should be running');
    assert(dlq.getSize() === 1, 'DLQ should have 1 event');

    bus.destroy();
    store.destroy();
    controlHandler.destroy();
    dlq.destroy();
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

