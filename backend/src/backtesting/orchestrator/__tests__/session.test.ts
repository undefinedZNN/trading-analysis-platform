/**
 * 会话管理单元测试
 * 
 * 测试：
 * - 状态机转换
 * - 会话生命周期
 * - 事件发布
 * - 错误处理
 * 
 * @module orchestrator/__tests__/session.test
 */

import {
  SessionState,
  createStateMachine,
  isValidTransition,
  getAllowedNextStates,
  InvalidStateTransitionError,
  SessionDestroyedError,
  createSession,
  SessionEventType,
} from '../session';

import { createServiceContainer } from '../container';
import type { BacktestSessionConfig } from '../config';

// ============================================================================
// 测试框架
// ============================================================================

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(description: string, fn: () => void | Promise<void>): void {
  testCount++;
  Promise.resolve()
    .then(() => fn())
    .then(() => {
      passCount++;
      console.log(`✅ ${description}`);
    })
    .catch((error: any) => {
      failCount++;
      console.error(`❌ ${description}`);
      console.error(`   Error: ${error.message}`);
    });
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function createMockConfig(): BacktestSessionConfig {
  return {
    sessionId: 'test-session',
    data: {
      source: {
        provider: 'parquet-duckdb' as const,
        path: '/data',
        symbols: ['BTC/USDT'],
        timeRange: { start: '2024-01-01', end: '2024-01-31' },
      },
      timeframe: { primary: '1m' },
    },
    strategy: {
      strategyId: 'test-strategy',
      scriptContent: 'code',
      manifest: {
        strategyId: 'test-strategy',
        version: '1.0.0',
        name: 'Test',
        author: 'Test',
        description: 'Test',
        requiredTimeframe: '1m',
        featureDeps: [],
        dataDeps: [],
        defaultParameters: {},
      },
    },
    execution: { initialCapital: '10000' },
    risk: { rules: [] },
  };
}

// ============================================================================
// 测试套件
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║          M3-01-C: 会话状态机单元测试                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ----------------------------------------------------------------------------
// 状态机基础测试
// ----------------------------------------------------------------------------

console.log('## 状态机基础测试\n');

test('创建状态机 - 默认状态应该是 Idle', () => {
  const sm = createStateMachine();
  assert(sm.getState() === SessionState.Idle, 'Initial state should be Idle');
});

test('创建状态机 - 可以指定初始状态', () => {
  const sm = createStateMachine(SessionState.Running);
  assert(sm.getState() === SessionState.Running, 'Initial state should be Running');
});

test('状态转换 - 有效转换应该成功', () => {
  const sm = createStateMachine();
  sm.transitionTo(SessionState.Initializing);
  assert(sm.getState() === SessionState.Initializing, 'State should be Initializing');
});

test('状态转换 - 无效转换应该抛出异常', () => {
  const sm = createStateMachine();
  
  let thrown = false;
  try {
    sm.transitionTo(SessionState.Completed); // Idle -> Completed 不允许
  } catch (error) {
    thrown = true;
    assert(error instanceof InvalidStateTransitionError, 'Should throw InvalidStateTransitionError');
  }
  
  assert(thrown, 'Should throw exception for invalid transition');
});

test('canTransitionTo - 应该正确判断转换是否允许', () => {
  const sm = createStateMachine();
  
  assert(sm.canTransitionTo(SessionState.Initializing), 'Idle -> Initializing should be allowed');
  assert(!sm.canTransitionTo(SessionState.Completed), 'Idle -> Completed should not be allowed');
});

test('状态历史 - 应该记录所有状态转换', () => {
  const sm = createStateMachine();
  sm.transitionTo(SessionState.Initializing);
  sm.transitionTo(SessionState.Running);
  
  const history = sm.getHistory();
  assert(history.length === 3, 'History should have 3 entries');
  assert(history[0].state === SessionState.Idle, 'First state should be Idle');
  assert(history[1].state === SessionState.Initializing, 'Second state should be Initializing');
  assert(history[2].state === SessionState.Running, 'Third state should be Running');
});

test('getPreviousState - 应该返回之前的状态', () => {
  const sm = createStateMachine();
  sm.transitionTo(SessionState.Initializing);
  sm.transitionTo(SessionState.Running);
  
  const previousState = sm.getPreviousState();
  assert(previousState === SessionState.Initializing, 'Previous state should be Initializing');
});

// ----------------------------------------------------------------------------
// 状态机工具函数测试
// ----------------------------------------------------------------------------

console.log('\n## 状态机工具函数测试\n');

test('isValidTransition - 应该正确验证转换', () => {
  assert(
    isValidTransition(SessionState.Idle, SessionState.Initializing),
    'Idle -> Initializing should be valid'
  );
  assert(
    !isValidTransition(SessionState.Idle, SessionState.Completed),
    'Idle -> Completed should be invalid'
  );
});

test('getAllowedNextStates - 应该返回允许的下一个状态', () => {
  const allowedStates = getAllowedNextStates(SessionState.Idle);
  assert(allowedStates.length === 2, 'Idle should have 2 allowed next states');
  assert(
    allowedStates.includes(SessionState.Initializing),
    'Should include Initializing'
  );
  assert(
    allowedStates.includes(SessionState.Destroyed),
    'Should include Destroyed'
  );
});

// ----------------------------------------------------------------------------
// 会话生命周期测试
// ----------------------------------------------------------------------------

console.log('\n## 会话生命周期测试\n');

test('创建会话 - 应该成功创建', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  assert(session.id === 'test-session', 'Session ID should match');
  assert(session.state === SessionState.Idle, 'Initial state should be Idle');
  assert(session.config === config, 'Config should match');
});

test('initialize - 应该初始化并转换到 Running', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  await session.initialize();
  
  assert(session.state === SessionState.Running, 'State should be Running after initialize');
});

test('start - 从 Idle 状态应该初始化', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  await session.start();
  
  assert(session.state === SessionState.Running, 'State should be Running after start');
});

test('pause - 应该暂停会话', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  await session.initialize();
  await session.pause();
  
  assert(session.state === SessionState.Paused, 'State should be Paused');
});

test('resume - 应该恢复会话', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  await session.initialize();
  await session.pause();
  await session.resume();
  
  assert(session.state === SessionState.Running, 'State should be Running after resume');
});

test('stop - 应该停止会话', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  await session.initialize();
  await session.stop();
  
  assert(session.state === SessionState.Stopped, 'State should be Stopped');
});

test('destroy - 应该销毁会话', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  await session.destroy();
  
  assert(session.state === SessionState.Destroyed, 'State should be Destroyed');
});

test('destroy - 销毁后的操作应该抛出异常', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  await session.destroy();
  
  let thrown = false;
  try {
    await session.initialize();
  } catch (error) {
    thrown = true;
    assert(error instanceof SessionDestroyedError, 'Should throw SessionDestroyedError');
  }
  
  assert(thrown, 'Should throw exception after destroy');
});

// ----------------------------------------------------------------------------
// 事件发布测试
// ----------------------------------------------------------------------------

console.log('\n## 事件发布测试\n');

test('on - 应该订阅事件', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  let eventReceived = false;
  session.on(SessionEventType.Started, () => {
    eventReceived = true;
  });
  
  await session.initialize();
  
  // 等待事件处理
  await new Promise(resolve => setTimeout(resolve, 10));
  
  assert(eventReceived, 'Should receive Started event');
});

test('on - 取消订阅应该停止接收事件', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  let eventCount = 0;
  const unsubscribe = session.on(SessionEventType.StateChanged, () => {
    eventCount++;
  });
  
  await session.initialize(); // 触发状态改变
  unsubscribe(); // 取消订阅
  await session.pause(); // 再次触发状态改变
  
  // 等待事件处理
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // 应该只收到第一次状态改变事件（Idle -> Initializing -> Running）
  assert(eventCount === 2, `Should receive 2 state changed events, got ${eventCount}`);
});

// ----------------------------------------------------------------------------
// 统计信息测试
// ----------------------------------------------------------------------------

console.log('\n## 统计信息测试\n');

test('getStats - 应该返回统计信息', async () => {
  const config = createMockConfig();
  const container = createServiceContainer();
  const session = createSession(config, container);
  
  await session.initialize();
  
  const stats = session.getStats();
  
  assert(stats.sessionId === 'test-session', 'Session ID should match');
  assert(stats.state === SessionState.Running, 'State should be Running');
  assert(stats.uptime >= 0, 'Uptime should be non-negative');
});

// ============================================================================
// 等待所有测试完成
// ============================================================================

setTimeout(() => {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   测试总结                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`总测试数: ${testCount}`);
  console.log(`✅ 通过: ${passCount}`);
  console.log(`❌ 失败: ${failCount}`);
  console.log(`成功率: ${((passCount / testCount) * 100).toFixed(1)}%\n`);
  
  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('🎉 所有会话管理测试通过！\n');
    process.exit(0);
  }
}, 1000); // 等待1秒确保所有异步测试完成

