/**
 * 简单单元测试
 * 
 * 验证策略沙箱核心功能
 */

import {
  StrategyContextImpl,
  SimpleStrategyLoader,
  StrategySandbox,
  defineParameters,
} from '../';
import type {
  StrategyLifecycle,
  StrategyManifest,
  PortfolioStore,
  PositionSnapshot,
  PortfolioUpdatePayload,
  BaseEvent,
} from '../interfaces';

// === Mock EventBus ===
class MockEventBus {
  publishedEvents: BaseEvent<any>[] = [];

  publish<T>(event: BaseEvent<T>): void {
    this.publishedEvents.push(event);
  }

  getEventsByType(type: string): BaseEvent<any>[] {
    return this.publishedEvents.filter((e) => e.eventType === type);
  }
}

// === Mock PortfolioStore ===
class MockPortfolioStore implements PortfolioStore {
  private positions: Map<string, Map<string, PositionSnapshot>> = new Map();

  getPosition(strategyId: string, symbol: string): PositionSnapshot | undefined {
    return this.positions.get(strategyId)?.get(symbol);
  }

  getPortfolio(strategyId: string): PortfolioUpdatePayload {
    const positions = this.positions.get(strategyId) || new Map();
    const positionsRecord: Record<string, PositionSnapshot> = {};
    positions.forEach((pos, symbol) => {
      positionsRecord[symbol] = pos;
    });

    return {
      strategyId,
      cash: '10000',
      equity: '10000',
      positions: positionsRecord,
      timestamp: Date.now(),
    };
  }

  updatePosition(strategyId: string, symbol: string, position: PositionSnapshot): void {
    if (!this.positions.has(strategyId)) {
      this.positions.set(strategyId, new Map());
    }
    this.positions.get(strategyId)!.set(symbol, position);
  }
}

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
  console.log('║          StrategySandbox 单元测试                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ===== 工具函数测试 =====
  console.log('## 工具函数测试\n');

  await test('defineParameters 基本功能', () => {
    const params = defineParameters({
      period: {
        type: 'number',
        title: 'Period',
        default: 20,
        minimum: 1,
        maximum: 100,
      },
    });

    assert(params.period.type === 'number', 'Type should be number');
    assert(params.period.default === 20, 'Default should be 20');
  });

  // ===== 策略上下文测试 =====
  console.log('\n## 策略上下文测试\n');

  await test('StrategyContext 初始化', () => {
    const eventBus = new MockEventBus();
    const portfolioStore = new MockPortfolioStore();
    const manifest: StrategyManifest = {
      strategyId: 'test-strategy',
      name: 'Test Strategy',
      version: '1.0.0',
      description: 'Test',
      author: 'Test',
      requiredTimeframe: '1m',
      featureDeps: [],
      dataDeps: [{ symbol: 'BTC/USDT' }],
      defaultParameters: {},
    };

    const context = new StrategyContextImpl(
      'session-1',
      'test-strategy',
      manifest,
      eventBus,
      portfolioStore
    );

    assert(context.sessionId === 'session-1', 'Session ID should match');
    assert(context.strategyId === 'test-strategy', 'Strategy ID should match');
    assert(context.now() !== '', 'Now should return timestamp');
  });

  await test('StrategyContext 日志发布', () => {
    const eventBus = new MockEventBus();
    const portfolioStore = new MockPortfolioStore();
    const manifest: StrategyManifest = {
      strategyId: 'test-strategy',
      name: 'Test',
      version: '1.0.0',
      description: '',
      author: '',
      requiredTimeframe: '1m',
      featureDeps: [],
      dataDeps: [],
      defaultParameters: {},
    };

    const context = new StrategyContextImpl(
      'session-1',
      'test-strategy',
      manifest,
      eventBus,
      portfolioStore
    );

    context.log('info', 'Test message');

    const logEvents = eventBus.getEventsByType('strategy.log');
    assert(logEvents.length === 1, `Should have 1 log event, got ${logEvents.length}`);
    assert(logEvents[0].payload.message === 'Test message', 'Message should match');
  });

  await test('StrategyContext 参数访问', () => {
    const eventBus = new MockEventBus();
    const portfolioStore = new MockPortfolioStore();
    const manifest: StrategyManifest = {
      strategyId: 'test-strategy',
      name: 'Test',
      version: '1.0.0',
      description: '',
      author: '',
      requiredTimeframe: '1m',
      featureDeps: [],
      dataDeps: [],
      defaultParameters: { period: 20, threshold: 1.5 },
    };

    const context = new StrategyContextImpl(
      'session-1',
      'test-strategy',
      manifest,
      eventBus,
      portfolioStore
    );

    const params = context.getParameters();
    assert(params.period === 20, 'Period should be 20');
    assert(params.threshold === 1.5, 'Threshold should be 1.5');
  });

  // ===== 策略加载器测试 =====
  console.log('\n## 策略加载器测试\n');

  await test('SimpleStrategyLoader 加载策略', () => {
    const loader = new SimpleStrategyLoader();
    
    const lifecycle: StrategyLifecycle = {
      onInit(ctx) {
        ctx.log('info', 'Init');
      },
      onBar(ctx, bar) {
        // do nothing
      },
    };

    const manifest: StrategyManifest = {
      strategyId: 'test-strategy',
      name: 'Test',
      version: '1.0.0',
      description: '',
      author: '',
      requiredTimeframe: '1m',
      featureDeps: [],
      dataDeps: [],
      defaultParameters: {},
    };

    const instance = loader.loadFromObject({ default: lifecycle }, manifest);

    assert(instance.lifecycle === lifecycle, 'Lifecycle should match');
    assert(instance.manifest === manifest, 'Manifest should match');
  });

  // ===== 沙箱测试 =====
  console.log('\n## 沙箱测试\n');

  await test('StrategySandbox 初始化', () => {
    const eventBus = new MockEventBus();
    const portfolioStore = new MockPortfolioStore();
    const loader = new SimpleStrategyLoader();

    const lifecycle: StrategyLifecycle = {
      onInit(ctx) {
        ctx.log('info', 'Strategy initialized');
      },
    };

    const manifest: StrategyManifest = {
      strategyId: 'test-strategy',
      name: 'Test',
      version: '1.0.0',
      description: '',
      author: '',
      requiredTimeframe: '1m',
      featureDeps: [],
      dataDeps: [],
      defaultParameters: {},
    };

    const instance = loader.loadFromObject({ default: lifecycle }, manifest);
    const context = new StrategyContextImpl(
      'session-1',
      'test-strategy',
      manifest,
      eventBus,
      portfolioStore
    );

    const sandbox = new StrategySandbox(instance, context);

    assert(sandbox.getStatus() === 'idle', 'Initial status should be idle');
  });

  await test('StrategySandbox 启动和停止', async () => {
    const eventBus = new MockEventBus();
    const portfolioStore = new MockPortfolioStore();
    const loader = new SimpleStrategyLoader();

    let initCalled = false;
    let stopCalled = false;

    const lifecycle: StrategyLifecycle = {
      onInit(ctx) {
        initCalled = true;
        ctx.log('info', 'Init');
      },
      onStop(ctx, reason) {
        stopCalled = true;
        ctx.log('info', `Stop: ${reason}`);
      },
    };

    const manifest: StrategyManifest = {
      strategyId: 'test-strategy',
      name: 'Test',
      version: '1.0.0',
      description: '',
      author: '',
      requiredTimeframe: '1m',
      featureDeps: [],
      dataDeps: [],
      defaultParameters: {},
    };

    const instance = loader.loadFromObject({ default: lifecycle }, manifest);
    const context = new StrategyContextImpl(
      'session-1',
      'test-strategy',
      manifest,
      eventBus,
      portfolioStore
    );

    const sandbox = new StrategySandbox(instance, context);

    await sandbox.start(eventBus);
    assert(sandbox.getStatus() === 'running', 'Status should be running after start');
    assert(initCalled, 'onInit should be called');

    await sandbox.stop('test');
    assert(sandbox.getStatus() === 'stopped', 'Status should be stopped after stop');
    assert(stopCalled, 'onStop should be called');
  });

  // ===== 测试总结 =====
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

