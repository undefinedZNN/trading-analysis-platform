/**
 * ExecutionEngine 单元测试
 * 
 * 测试：
 * - 执行引擎核心功能
 * - 撮合器
 * - 滑点和手续费模型
 * - 完整订单流程
 */

import { createExecutionEngine } from '../engine';
import { MarketOrderMatcher, LimitOrderMatcher } from '../matchers';
import { FixedSpreadSlippage, ZeroSlippageModel } from '../models/slippage.models';
import { FixedRateFeeModel, ZeroFeeModel } from '../models/fee.models';
import type { OrderIntentPayload, BarEvent } from '../interfaces';

// ============================================================================
// 测试工具函数
// ============================================================================

let testCount = 0;
let passCount = 0;
let failCount = 0;

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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ============================================================================
// 测试夹具
// ============================================================================

function createMockIntent(overrides?: Partial<OrderIntentPayload>): OrderIntentPayload {
  return {
    intentId: 'intent-001',
    strategyId: 'strategy-001',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'market',
    quantity: '1.0',
    ...overrides,
  };
}

function createMockBar(overrides?: Partial<BarEvent>): BarEvent {
  return {
    symbol: 'BTC/USDT',
    timestamp: new Date().toISOString(),
    open: '50000',
    high: '51000',
    low: '49000',
    close: '50500',
    volume: '100',
    ...overrides,
  };
}

// ============================================================================
// 测试套件
// ============================================================================

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          ExecutionEngine 单元测试                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ------------------------------------------------------------------------
  // ExecutionEngine 核心测试
  // ------------------------------------------------------------------------

  console.log('## ExecutionEngine 核心测试\n');

  await test('ExecutionEngine 初始化', () => {
    const engine = createExecutionEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    assert(engine !== null, 'Engine should be created');
    assert(engine.getAllOrders().length === 0, 'Should have no orders initially');
  });

  await test('提交市价单', async () => {
    const engine = createExecutionEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const intent = createMockIntent();
    const orderId = await engine.submit(intent);
    
    assert(orderId !== '', 'Should return orderId');
    assert(engine.getAllOrders().length === 1, 'Should have 1 order');
    
    const order = engine.getOrder(orderId);
    assert(order !== undefined, 'Order should exist');
    assert(order.status === 'new', 'Order status should be new');
  });

  await test('市价单立即成交', async () => {
    const engine = createExecutionEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      slippageModel: new ZeroSlippageModel(),
      feeModel: new ZeroFeeModel(),
    });
    
    const intent = createMockIntent({ type: 'market' });
    const orderId = await engine.submit(intent);
    
    // 处理行情，触发成交
    const bar = createMockBar();
    await engine.processBars([bar]);
    
    const order = engine.getOrder(orderId);
    assert(order?.status === 'filled', 'Market order should be filled');
    assert(order.fills.length === 1, 'Should have 1 fill');
    assert(order.remaining === '0', 'Remaining should be 0');
  });

  await test('限价单在触及价格时成交', async () => {
    const engine = createExecutionEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      slippageModel: new ZeroSlippageModel(),
      feeModel: new ZeroFeeModel(),
    });
    
    const intent = createMockIntent({ 
      type: 'limit', 
      price: '49500' // 限价低于当前价
    });
    const orderId = await engine.submit(intent);
    
    // 价格下跌，触及限价
    const bar = createMockBar({ low: '49000' });
    await engine.processBars([bar]);
    
    const order = engine.getOrder(orderId);
    assert(order?.status === 'filled', 'Limit order should be filled');
    assert(order.fills[0].price === '49500', 'Should fill at limit price');
  });

  await test('限价单未触及价格时不成交', async () => {
    const engine = createExecutionEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const intent = createMockIntent({ 
      type: 'limit', 
      price: '48000' // 限价远低于当前价
    });
    const orderId = await engine.submit(intent);
    
    // 价格未触及限价
    const bar = createMockBar({ low: '49000' });
    await engine.processBars([bar]);
    
    const order = engine.getOrder(orderId);
    assert(order?.status === 'new', 'Limit order should remain new');
    assert(order.fills.length === 0, 'Should have no fills');
  });

  await test('取消订单', async () => {
    const engine = createExecutionEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const intent = createMockIntent({ type: 'limit', price: '48000' });
    const orderId = await engine.submit(intent);
    
    await engine.cancel(orderId, 'Test cancellation');
    
    const order = engine.getOrder(orderId);
    assert(order?.status === 'cancelled', 'Order should be cancelled');
    assert(engine.getActiveOrders().length === 0, 'Should have no active orders');
  });

  // ------------------------------------------------------------------------
  // 撮合器测试
  // ------------------------------------------------------------------------

  console.log('\n## 撮合器测试\n');

  await test('MarketOrderMatcher - 按收盘价成交', () => {
    const matcher = new MarketOrderMatcher('close');
    const order: any = { 
      side: 'buy',
      remaining: '1.0',
      type: 'market',
    };
    const bar = createMockBar();
    
    const result = matcher.match(order, bar);
    assert(result !== null, 'Should match');
    assert(result!.fillPrice === '50500', 'Should fill at close price');
    assert(result!.liquidity === 'taker', 'Should be taker');
  });

  await test('LimitOrderMatcher - 买单触及', () => {
    const matcher = new LimitOrderMatcher();
    const order: any = { 
      side: 'buy',
      limitPrice: '49500',
      remaining: '1.0',
      type: 'limit',
    };
    const bar = createMockBar({ low: '49000' });
    
    const result = matcher.match(order, bar);
    assert(result !== null, 'Should match');
    assert(result!.fillPrice === '49500', 'Should fill at limit price');
    assert(result!.liquidity === 'maker', 'Should be maker');
  });

  await test('LimitOrderMatcher - 卖单未触及', () => {
    const matcher = new LimitOrderMatcher();
    const order: any = { 
      side: 'sell',
      limitPrice: '52000',
      remaining: '1.0',
      type: 'limit',
    };
    const bar = createMockBar({ high: '51000' });
    
    const result = matcher.match(order, bar);
    assert(result === null, 'Should not match');
  });

  // ------------------------------------------------------------------------
  // 滑点模型测试
  // ------------------------------------------------------------------------

  console.log('\n## 滑点模型测试\n');

  await test('ZeroSlippageModel - 无滑点', () => {
    const model = new ZeroSlippageModel();
    const price = model.apply({
      basePrice: '50000',
      side: 'buy',
      quantity: '1.0',
      liquidity: 'taker',
    });
    
    assert(price === '50000', 'Should have no slippage');
  });

  await test('FixedSpreadSlippage - 买入滑点', () => {
    const model = new FixedSpreadSlippage(10); // 10 bps = 0.1%
    const price = model.apply({
      basePrice: '50000',
      side: 'buy',
      quantity: '1.0',
      liquidity: 'taker',
    });
    
    // 50000 * (1 + 0.001) = 50050
    assert(price === '50050', 'Should add slippage for buy');
  });

  await test('FixedSpreadSlippage - 卖出滑点', () => {
    const model = new FixedSpreadSlippage(10); // 10 bps
    const price = model.apply({
      basePrice: '50000',
      side: 'sell',
      quantity: '1.0',
      liquidity: 'taker',
    });
    
    // 50000 * (1 - 0.001) = 49950
    assert(price === '49950', 'Should subtract slippage for sell');
  });

  // ------------------------------------------------------------------------
  // 手续费模型测试
  // ------------------------------------------------------------------------

  console.log('\n## 手续费模型测试\n');

  await test('ZeroFeeModel - 无手续费', () => {
    const model = new ZeroFeeModel();
    const fee = model.compute({
      price: '50000',
      quantity: '1.0',
      side: 'buy',
      liquidity: 'taker',
    });
    
    assert(fee.amount === '0', 'Should have no fee');
  });

  await test('FixedRateFeeModel - Taker费率', () => {
    const model = new FixedRateFeeModel(0.02, 0.05); // 0.02% maker, 0.05% taker
    const fee = model.compute({
      price: '50000',
      quantity: '1.0',
      side: 'buy',
      liquidity: 'taker',
    });
    
    // 50000 * 0.05% = 25
    assert(fee.amount === '25', 'Should calculate taker fee correctly');
  });

  await test('FixedRateFeeModel - Maker费率', () => {
    const model = new FixedRateFeeModel(0.02, 0.05);
    const fee = model.compute({
      price: '50000',
      quantity: '1.0',
      side: 'buy',
      liquidity: 'maker',
    });
    
    // 50000 * 0.02% = 10
    assert(fee.amount === '10', 'Should calculate maker fee correctly');
  });

  // ------------------------------------------------------------------------
  // 快照测试
  // ------------------------------------------------------------------------

  console.log('\n## 快照测试\n');

  await test('创建和恢复快照', async () => {
    const engine = createExecutionEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    // 提交几个订单
    await engine.submit(createMockIntent());
    await engine.submit(createMockIntent({ intentId: 'intent-002' }));
    
    // 创建快照
    const snapshot = engine.createSnapshot();
    assert(snapshot.orders.length === 2, 'Snapshot should have 2 orders');
    
    // 重置引擎
    engine.reset();
    assert(engine.getAllOrders().length === 0, 'Should have no orders after reset');
    
    // 恢复快照
    engine.restoreSnapshot(snapshot);
    assert(engine.getAllOrders().length === 2, 'Should restore 2 orders');
  });

  // ------------------------------------------------------------------------
  // 测试总结
  // ------------------------------------------------------------------------

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   测试总结                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`总测试数: ${testCount}`);
  console.log(`✅ 通过: ${passCount}`);
  console.log(`❌ 失败: ${failCount}`);
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

