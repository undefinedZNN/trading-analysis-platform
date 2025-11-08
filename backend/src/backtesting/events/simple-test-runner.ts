/**
 * 简化版 EventBus 测试运行器（修复版）
 */

import {
  SimpleEventBus,
  SimpleEventStore,
  SimpleStateMachine,
} from './simple-bus';
import { take, toArray } from 'rxjs';

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
  console.log('\n=== 简化版 EventBus 测试 ===\n');

  // === SimpleStateMachine 测试 ===

  console.log('## SimpleStateMachine 测试\n');

  await test('初始状态应为 idle', () => {
    const sm = new SimpleStateMachine();
    assert(sm.getStatus() === 'idle', 'Status should be idle');
  });

  await test('可以从 idle 转换到 running', () => {
    const sm = new SimpleStateMachine();
    assert(sm.canTransition('start'), 'Should be able to start');
    sm.transition('start');
    assert(sm.getStatus() === 'running', 'Status should be running');
  });

  await test('可以从 running 转换到 paused', () => {
    const sm = new SimpleStateMachine();
    sm.transition('start');
    sm.transition('pause');
    assert(sm.getStatus() === 'paused', 'Status should be paused');
  });

  await test('可以从 paused 转换到 running', () => {
    const sm = new SimpleStateMachine();
    sm.transition('start');
    sm.transition('pause');
    sm.transition('resume');
    assert(sm.getStatus() === 'running', 'Status should be running');
  });

  await test('可以从 running 转换到 stopped', () => {
    const sm = new SimpleStateMachine();
    sm.transition('start');
    sm.transition('stop');
    assert(sm.getStatus() === 'stopped', 'Status should be stopped');
  });

  await test('可以从 stopped 转换到 idle', () => {
    const sm = new SimpleStateMachine();
    sm.transition('start');
    sm.transition('stop');
    sm.transition('reset');
    assert(sm.getStatus() === 'idle', 'Status should be idle');
  });

  await test('非法转换应抛出错误', () => {
    const sm = new SimpleStateMachine();
    try {
      sm.transition('pause'); // 从 idle 不能 pause
      throw new Error('Should have thrown error');
    } catch (error: any) {
      assert(
        error.message.includes('Invalid transition'),
        'Should throw Invalid transition error'
      );
    }
  });

  // === SimpleEventStore 测试 ===

  console.log('\n## SimpleEventStore 测试\n');

  await test('可以追加事件', () => {
    const store = new SimpleEventStore();
    const event = {
      type: 'market.bar',
      timestamp: Date.now(),
      payload: { symbol: 'BTC/USDT' },
    };

    store.append(event);
    assert(store.getEventCount() === 1, 'Event count should be 1');

    const events = store.getAll();
    assert(events.length === 1, 'Should have 1 event');
    assert(events[0].eventId === 0, 'First event ID should be 0');

    store.destroy();
  });

  await test('可以追加多个事件', () => {
    const store = new SimpleEventStore();

    for (let i = 0; i < 10; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    assert(store.getEventCount() === 10, 'Event count should be 10');

    const events = store.getAll();
    assert(events.length === 10, 'Should have 10 events');
    assert(events[0].eventId === 0, 'First event ID should be 0');
    assert(events[9].eventId === 9, 'Last event ID should be 9');

    store.destroy();
  });

  await test('可以按范围查询事件', () => {
    const store = new SimpleEventStore();

    for (let i = 0; i < 10; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    const events = store.getRange(2, 5);
    assert(events.length === 4, 'Should have 4 events in range');
    assert(events[0].eventId === 2, 'First event ID should be 2');
    assert(events[3].eventId === 5, 'Last event ID should be 5');

    store.destroy();
  });

  await test('可以创建检查点', () => {
    const store = new SimpleEventStore();

    for (let i = 0; i < 5; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    const meta = store.checkpoint('cp1');
    assert(meta.checkpointId === 'cp1', 'Checkpoint ID should be cp1');
    assert(meta.eventId === 4, 'Last event ID should be 4');

    store.destroy();
  });

  await test('可以恢复检查点', () => {
    const store = new SimpleEventStore();

    for (let i = 0; i < 5; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    store.checkpoint('cp1');
    const snapshot = store.restore('cp1');

    assert(snapshot.checkpointId === 'cp1', 'Checkpoint ID should match');
    assert(snapshot.eventCount === 5, 'Event count should be 5');

    store.destroy();
  });

  await test('可以清空事件', () => {
    const store = new SimpleEventStore();

    for (let i = 0; i < 5; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    assert(store.getEventCount() === 5, 'Event count should be 5');

    store.clear();

    assert(store.getEventCount() === 0, 'Event count should be 0 after clear');
    assert(store.getAll().length === 0, 'Should have no events');

    store.destroy();
  });

  // === SimpleEventBus 测试 ===

  console.log('\n## SimpleEventBus 测试\n');

  await test('初始状态应为 idle', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    assert(bus.getStatus() === 'idle', 'Status should be idle');

    const metrics = bus.getMetrics();
    assert(metrics.totalEvents === 0, 'Total events should be 0');
    assert(metrics.errorCount === 0, 'Error count should be 0');

    bus.destroy();
    store.destroy();
  });

  await test('可以启动总线', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    bus.start();
    assert(bus.getStatus() === 'running', 'Status should be running');

    bus.destroy();
    store.destroy();
  });

  await test('可以发布和订阅事件', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    bus.start();

    const promise = new Promise<void>((resolve, reject) => {
      bus
        .subscribe('market.bar')
        .pipe(take(1))
        .subscribe({
          next: (event) => {
            try {
              assert(event.type === 'market.bar', 'Event type should match');
              assert(
                event.payload?.symbol === 'BTC/USDT',
                'Payload should match'
              );
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          error: reject,
        });

      bus.publish({
        type: 'market.bar',
        timestamp: Date.now(),
        payload: { symbol: 'BTC/USDT' },
      });
    });

    await promise;

    bus.destroy();
    store.destroy();
  });

  await test('可以订阅多个事件类型', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    bus.start();

    const promise = new Promise<void>((resolve, reject) => {
      const eventTypes = new Set<string>();

      bus
        .subscribe(['market.bar', 'strategy.intent'])
        .pipe(take(2))
        .subscribe({
          next: (event) => {
            eventTypes.add(event.type);
          },
          complete: () => {
            try {
              assert(eventTypes.size === 2, 'Should have 2 event types');
              assert(eventTypes.has('market.bar'), 'Should have market.bar');
              assert(
                eventTypes.has('strategy.intent'),
                'Should have strategy.intent'
              );
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          error: reject,
        });

      bus.publish({
        type: 'market.bar',
        timestamp: Date.now(),
        payload: {},
      });

      bus.publish({
        type: 'strategy.intent',
        timestamp: Date.now(),
        payload: {},
      });
    });

    await promise;

    bus.destroy();
    store.destroy();
  });

  await test('可以控制总线状态', () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    bus.start();
    assert(bus.getStatus() === 'running', 'Should be running');

    bus.pause();
    assert(bus.getStatus() === 'paused', 'Should be paused');

    bus.resume();
    assert(bus.getStatus() === 'running', 'Should be running again');

    bus.stop();
    assert(bus.getStatus() === 'stopped', 'Should be stopped');

    bus.destroy();
    store.destroy();
  });

  await test('可以创建检查点', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    bus.start();

    const promise = new Promise<void>((resolve, reject) => {
      bus.event$.pipe(take(5), toArray()).subscribe({
        next: () => {
          try {
            bus.checkpoint('cp1');
            const checkpoints = store.listCheckpoints();
            assert(checkpoints.length === 1, 'Should have 1 checkpoint');
            assert(
              checkpoints[0].checkpointId === 'cp1',
              'Checkpoint ID should match'
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: reject,
      });

      for (let i = 0; i < 5; i++) {
        bus.publish({
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        });
      }
    });

    await promise;

    bus.destroy();
    store.destroy();
  });

  await test('可以跟踪度量统计', async () => {
    const store = new SimpleEventStore();
    const bus = new SimpleEventBus(store);

    bus.start();

    const promise = new Promise<void>((resolve, reject) => {
      bus.event$.pipe(take(10), toArray()).subscribe({
        next: () => {
          try {
            // 等待一小段时间确保metrics更新
            setTimeout(() => {
              const metrics = bus.getMetrics();
              assert(metrics.totalEvents === 10, `Should have 10 events, got ${metrics.totalEvents}`);
              assert(metrics.throughput > 0, `Throughput should be > 0, got ${metrics.throughput}`);
              assert(metrics.uptime > 0, `Uptime should be > 0, got ${metrics.uptime}`);
              resolve();
            }, 100);
          } catch (error) {
            reject(error);
          }
        },
        error: reject,
      });

      for (let i = 0; i < 10; i++) {
        bus.publish({
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        });
      }
    });

    await promise;

    bus.destroy();
    store.destroy();
  });

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

