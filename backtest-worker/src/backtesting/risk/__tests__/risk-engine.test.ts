/**
 * RiskEngine 单元测试
 * 
 * 测试：
 * - 引擎核心功能
 * - 各个风控规则
 * - 快照恢复
 */

import { createRiskEngine } from '../engine';
import { MaxOrderSizeRule } from '../rules/max-order-size.rule';
import { MaxLeverageRule } from '../rules/max-leverage.rule';
import { PnLDailyLimitRule } from '../rules/pnl-daily-limit.rule';
import { StopLossRule } from '../rules/stop-loss.rule';
import type { OrderIntentPayload, PortfolioUpdatePayload } from '../interfaces';

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
    quantity: '1.0',
    price: '50000',
    orderType: 'limit',
    timeInForce: 'GTC',
    ...overrides,
  };
}

function createMockPortfolioUpdate(): PortfolioUpdatePayload {
  return {
    strategyId: 'strategy-001',
    balances: { USDT: '10000' },
    positions: [],
    equity: '10000',
    marginUsage: '0',
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// 测试套件
// ============================================================================

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          RiskEngine 单元测试                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ------------------------------------------------------------------------
  // RiskEngine 核心测试
  // ------------------------------------------------------------------------

  console.log('## RiskEngine 核心测试\n');

  await test('RiskEngine 初始化', () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    assert(engine !== null, 'Engine should be created');
    assert(engine.getRules().length === 0, 'Should have no rules initially');
  });

  await test('注册规则', () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const rule = new MaxOrderSizeRule({ maxQuantity: '10' });
    engine.registerRule(rule);
    
    assert(engine.getRules().length === 1, 'Should have 1 rule');
    assert(engine.getRules()[0].id === 'MaxOrderSizeRule', 'Rule should be MaxOrderSizeRule');
  });

  await test('空规则列表时批准订单', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const intent = createMockIntent();
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'approve', 'Should approve when no rules');
    assert(result.ruleId === 'all-passed', 'Should have all-passed ruleId');
  });

  await test('创建和恢复快照', () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const portfolioUpdate = createMockPortfolioUpdate();
    engine.updatePortfolio(portfolioUpdate);
    
    const snapshot = engine.createSnapshot();
    assert(snapshot.snapshotId !== '', 'Snapshot should have ID');
    assert(snapshot.state.portfolio.equity === '10000', 'Snapshot should preserve equity');
    
    // 修改状态
    const newUpdate = { ...portfolioUpdate, equity: '5000' };
    engine.updatePortfolio(newUpdate);
    
    const currentState = engine.getState();
    assert(currentState.portfolio.equity === '5000', 'Equity should be updated');
    
    // 恢复快照
    engine.restoreSnapshot(snapshot);
    
    const restoredState = engine.getState();
    assert(restoredState.portfolio.equity === '10000', 'Equity should be restored');
  });

  // ------------------------------------------------------------------------
  // MaxOrderSizeRule 测试
  // ------------------------------------------------------------------------

  console.log('\n## MaxOrderSizeRule 测试\n');

  await test('超过最大数量时拒绝', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const rule = new MaxOrderSizeRule({ maxQuantity: '0.5' });
    engine.registerRule(rule);
    
    const intent = createMockIntent({ quantity: '1.0' });
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'reject', 'Should reject when quantity exceeds');
    assert(result.reason?.code === 'MAX_ORDER_SIZE_EXCEEDED', 'Should have correct error code');
  });

  await test('超过最大名义价值时修改', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const rule = new MaxOrderSizeRule({ maxNotional: '10000' });
    engine.registerRule(rule);
    
    const intent = createMockIntent({ quantity: '1.0', price: '50000' }); // 名义价值 50000
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'modify', 'Should modify when notional exceeds');
    assert(result.reason?.code === 'MAX_NOTIONAL_EXCEEDED', 'Should have correct error code');
    assert(result.modifiedIntent?.quantity !== undefined, 'Should provide modified quantity');
  });

  await test('在最大数量内时通过', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    const rule = new MaxOrderSizeRule({ maxQuantity: '10.0' });
    engine.registerRule(rule);
    
    const intent = createMockIntent({ quantity: '1.0' });
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'approve', 'Should approve when within limit');
  });

  // ------------------------------------------------------------------------
  // MaxLeverageRule 测试
  // ------------------------------------------------------------------------

  console.log('\n## MaxLeverageRule 测试\n');

  await test('超过最大杠杆率时拒绝', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    // 设置组合：权益 10000
    engine.updatePortfolio(createMockPortfolioUpdate());
    
    // 最大杠杆率 2x
    const rule = new MaxLeverageRule({ maxLeverage: 2 });
    engine.registerRule(rule);
    
    // 订单名义价值 30000，杠杆率 3x
    const intent = createMockIntent({ quantity: '0.6', price: '50000' });
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'reject', 'Should reject when leverage exceeds');
    assert(result.reason?.code === 'MAX_LEVERAGE_EXCEEDED', 'Should have correct error code');
  });

  // ------------------------------------------------------------------------
  // PnLDailyLimitRule 测试
  // ------------------------------------------------------------------------

  console.log('\n## PnLDailyLimitRule 测试\n');

  await test('达到日内亏损限制时暂停', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    // 设置初始状态
    engine.updatePortfolio(createMockPortfolioUpdate());
    
    // 注意：由于 getState() 返回副本，我们需要通过快照来修改状态
    const snapshot = engine.createSnapshot();
    snapshot.state.stats.pnlToday = '-1500'; // 模拟亏损 1500
    engine.restoreSnapshot(snapshot);
    
    const rule = new PnLDailyLimitRule({ dailyLossLimit: '-1000' });
    engine.registerRule(rule);
    
    const intent = createMockIntent();
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'halt', 'Should halt when loss limit reached');
    assert(result.reason?.code === 'DAILY_LOSS_LIMIT_REACHED', 'Should have correct error code');
    assert(result.followUp !== undefined, 'Should have follow-up actions');
  });

  await test('达到日内盈利目标时拒绝', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    engine.updatePortfolio(createMockPortfolioUpdate());
    
    // 通过快照修改状态
    const snapshot = engine.createSnapshot();
    snapshot.state.stats.pnlToday = '2000'; // 模拟盈利 2000
    engine.restoreSnapshot(snapshot);
    
    const rule = new PnLDailyLimitRule({ 
      dailyLossLimit: '-1000',
      dailyProfitLock: '1500',
    });
    engine.registerRule(rule);
    
    const intent = createMockIntent();
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'reject', 'Should reject when profit locked');
    assert(result.reason?.code === 'DAILY_PROFIT_LOCKED', 'Should have correct error code');
  });

  // ------------------------------------------------------------------------
  // StopLossRule 测试
  // ------------------------------------------------------------------------

  console.log('\n## StopLossRule 测试\n');

  await test('超过最大回撤时触发止损', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    // 权益 10000，最大回撤 -2000 (20%)
    engine.updatePortfolio({
      ...createMockPortfolioUpdate(),
      equity: '10000',
    });
    
    // 通过快照修改状态
    const snapshot = engine.createSnapshot();
    snapshot.state.stats.maxDrawdown = '-2000';
    engine.restoreSnapshot(snapshot);
    
    // 最大回撤 10%
    const rule = new StopLossRule({ 
      maxDrawdownPct: 0.1, 
      forceClose: false,
    });
    engine.registerRule(rule);
    
    const intent = createMockIntent();
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'reject', 'Should reject when drawdown exceeds');
    assert(result.reason?.code === 'STOP_LOSS_TRIGGERED', 'Should have correct error code');
  });

  await test('超过最大回撤且forceClose时暂停并平仓', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    engine.updatePortfolio({
      ...createMockPortfolioUpdate(),
      equity: '10000',
    });
    
    // 通过快照修改状态
    const snapshot = engine.createSnapshot();
    snapshot.state.stats.maxDrawdown = '-2000';
    engine.restoreSnapshot(snapshot);
    
    const rule = new StopLossRule({ 
      maxDrawdownPct: 0.1, 
      forceClose: true,
    });
    engine.registerRule(rule);
    
    const intent = createMockIntent();
    const result = await engine.evaluate(intent);
    
    assert(result.decision === 'halt', 'Should halt when forceClose is true');
    assert(result.followUp !== undefined, 'Should have follow-up actions');
    assert(result.followUp[0].type === 'force-close', 'Should include force-close action');
  });

  // ------------------------------------------------------------------------
  // 规则优先级测试
  // ------------------------------------------------------------------------

  console.log('\n## 规则优先级测试\n');

  await test('优先级低的规则先执行', async () => {
    const engine = createRiskEngine({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });
    
    // Priority 10 的规则
    const rule1 = new MaxOrderSizeRule({ 
      maxQuantity: '0.5',
      priority: 10,
    });
    
    // Priority 20 的规则
    const rule2 = new MaxLeverageRule({ 
      maxLeverage: 1,
      priority: 20,
    });
    
    engine.registerRule(rule2);
    engine.registerRule(rule1); // 先注册 rule2，再注册 rule1
    
    const intent = createMockIntent({ quantity: '1.0' }); // 两个规则都会拒绝
    const result = await engine.evaluate(intent);
    
    // 应该被 rule1 拒绝（优先级更高）
    assert(result.decision === 'reject', 'Should be rejected');
    assert(result.reason?.code === 'MAX_ORDER_SIZE_EXCEEDED', 'Should be rejected by rule1');
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

