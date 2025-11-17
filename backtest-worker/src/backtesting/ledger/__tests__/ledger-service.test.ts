/**
 * LedgerService 单元测试
 * 
 * 测试：
 * - PnL 计算引擎
 * - 账簿服务核心
 * - 统计计算
 * - 导出功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createLedgerService } from '../service';
import { SimplePnLCalculator } from '../pnl-calculator';
import type { TradeRecord } from '../interfaces';

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

function createMockTrade(overrides?: Partial<TradeRecord>): TradeRecord {
  return {
    tradeId: 'trade-001',
    sessionId: 'session-001',
    strategyId: 'strategy-001',
    symbol: 'BTC/USDT',
    intentId: 'intent-001',
    orderId: 'order-001',
    fillId: 'fill-001',
    side: 'buy',
    type: 'open',
    quantity: '1.0',
    price: '50000',
    realizedPnl: '0',
    unrealizedPnl: '0',
    fees: '50',
    feeCurrency: 'USDT',
    liquidity: 'taker',
    timestamp: new Date().toISOString(),
    sequenceId: 'seq-001',
    ...overrides,
  };
}

// ============================================================================
// 测试套件
// ============================================================================

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          LedgerService 单元测试                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ------------------------------------------------------------------------
  // PnL 计算引擎测试
  // ------------------------------------------------------------------------

  console.log('## PnL 计算引擎测试\n');

  await test('开仓 - 买入', () => {
    const calculator = new SimplePnLCalculator();
    const result = calculator.calculate(
      {
        side: 'buy',
        quantity: '1.0',
        price: '50000',
        fees: '50',
      }
    );

    assert(result.realizedPnl === '-50', 'Realized PnL should be -50 (fees only)');
    assert(result.newPosition.quantity === '1', 'Position quantity should be 1');
    assert(result.newPosition.avgEntryPrice === '50000', 'Avg entry price should be 50000');
    assert(result.newPosition.side === 'long', 'Position side should be long');
  });

  await test('加仓 - 买入', () => {
    const calculator = new SimplePnLCalculator();
    const result = calculator.calculate(
      {
        side: 'buy',
        quantity: '1.0',
        price: '51000',
        fees: '51',
      },
      {
        quantity: '1.0',
        avgEntryPrice: '50000',
        side: 'long',
      }
    );

    assert(result.realizedPnl === '-51', 'Realized PnL should be -51 (fees only)');
    assert(result.newPosition.quantity === '2', 'Position quantity should be 2');
    assert(result.newPosition.avgEntryPrice === '50500', 'Avg entry price should be 50500');
  });

  await test('平仓 - 盈利', () => {
    const calculator = new SimplePnLCalculator();
    const result = calculator.calculate(
      {
        side: 'sell',
        quantity: '1.0',
        price: '51000',
        fees: '51',
      },
      {
        quantity: '1.0',
        avgEntryPrice: '50000',
        side: 'long',
      }
    );

    // PnL = (51000 - 50000) * 1.0 - 51 = 949
    assert(result.realizedPnl === '949', 'Realized PnL should be 949');
    assert(result.newPosition.quantity === '0', 'Position should be closed');
    assert(result.newPosition.side === 'flat', 'Position side should be flat');
  });

  await test('平仓 - 亏损', () => {
    const calculator = new SimplePnLCalculator();
    const result = calculator.calculate(
      {
        side: 'sell',
        quantity: '1.0',
        price: '49000',
        fees: '49',
      },
      {
        quantity: '1.0',
        avgEntryPrice: '50000',
        side: 'long',
      }
    );

    // PnL = (49000 - 50000) * 1.0 - 49 = -1049
    assert(result.realizedPnl === '-1049', 'Realized PnL should be -1049');
    assert(result.newPosition.side === 'flat', 'Position side should be flat');
  });

  await test('部分平仓', () => {
    const calculator = new SimplePnLCalculator();
    const result = calculator.calculate(
      {
        side: 'sell',
        quantity: '0.5',
        price: '51000',
        fees: '25.5',
      },
      {
        quantity: '1.0',
        avgEntryPrice: '50000',
        side: 'long',
      }
    );

    // PnL = (51000 - 50000) * 0.5 - 25.5 = 474.5
    assert(result.realizedPnl === '474.5', 'Realized PnL should be 474.5');
    assert(result.newPosition.quantity === '0.5', 'Position quantity should be 0.5');
    assert(result.newPosition.avgEntryPrice === '50000', 'Avg entry price should remain 50000');
  });

  await test('计算未实现盈亏 - 多头', () => {
    const calculator = new SimplePnLCalculator();
    const unrealizedPnl = calculator.calculateUnrealizedPnl(
      {
        quantity: '1.0',
        avgEntryPrice: '50000',
        side: 'long',
      },
      '51000' // 当前价格
    );

    assert(unrealizedPnl === '1000', 'Unrealized PnL should be 1000');
  });

  await test('计算未实现盈亏 - 空头', () => {
    const calculator = new SimplePnLCalculator();
    const unrealizedPnl = calculator.calculateUnrealizedPnl(
      {
        quantity: '1.0',
        avgEntryPrice: '50000',
        side: 'short',
      },
      '49000' // 当前价格
    );

    assert(unrealizedPnl === '1000', 'Unrealized PnL should be 1000');
  });

  // ------------------------------------------------------------------------
  // LedgerService 核心测试
  // ------------------------------------------------------------------------

  console.log('\n## LedgerService 核心测试\n');

  await test('LedgerService 初始化', () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
    });

    assert(service !== null, 'Service should be created');
    const stats = service.getStats();
    assert(stats.totalTrades === 0, 'Should have no trades initially');
  });

  await test('记录交易', async () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      autoFlush: false,
    });

    const trade = createMockTrade();
    await service.recordTrade(trade);

    const trades = await service.getTrades();
    assert(trades.length === 1, 'Should have 1 trade');
    assert(trades[0].tradeId === 'trade-001', 'Trade ID should match');
  });

  await test('查询交易 - 过滤条件', async () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      autoFlush: false,
    });

    await service.recordTrade(createMockTrade({ tradeId: 'trade-001', symbol: 'BTC/USDT' }));
    await service.recordTrade(createMockTrade({ tradeId: 'trade-002', symbol: 'ETH/USDT' }));
    await service.recordTrade(createMockTrade({ tradeId: 'trade-003', symbol: 'BTC/USDT', side: 'sell' }));

    const btcTrades = await service.getTrades({ symbol: 'BTC/USDT' });
    assert(btcTrades.length === 2, 'Should have 2 BTC trades');

    const sellTrades = await service.getTrades({ side: 'sell' });
    assert(sellTrades.length === 1, 'Should have 1 sell trade');
  });

  await test('统计计算 - 基础指标', async () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      autoFlush: false,
    });

    await service.recordTrade(createMockTrade({ realizedPnl: '1000', fees: '10' }));
    await service.recordTrade(createMockTrade({ realizedPnl: '-500', fees: '5' }));
    await service.recordTrade(createMockTrade({ realizedPnl: '300', fees: '3' }));

    const stats = service.getStats();
    assert(stats.totalTrades === 3, 'Should have 3 trades');
    assert(stats.totalPnl === '800', 'Total PnL should be 800');
    assert(stats.totalFees === '18', 'Total fees should be 18');
    assert(stats.winningTrades === 2, 'Should have 2 winning trades');
    assert(stats.losingTrades === 1, 'Should have 1 losing trade');
    assert(stats.winRate === 2/3, 'Win rate should be 2/3');
  });

  await test('统计计算 - 平均盈亏', async () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      autoFlush: false,
    });

    await service.recordTrade(createMockTrade({ realizedPnl: '1000' }));
    await service.recordTrade(createMockTrade({ realizedPnl: '-500' }));
    await service.recordTrade(createMockTrade({ realizedPnl: '500' }));

    const stats = service.getStats();
    assert(parseFloat(stats.avgPnl).toFixed(2) === '333.33', 'Average PnL should be ~333.33');
    assert(stats.avgWin === '750', 'Average win should be 750');
    assert(stats.avgLoss === '-500', 'Average loss should be -500');
  });

  await test('统计计算 - 盈亏比', async () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      autoFlush: false,
    });

    await service.recordTrade(createMockTrade({ realizedPnl: '1500' }));
    await service.recordTrade(createMockTrade({ realizedPnl: '-500' }));

    const stats = service.getStats();
    assert(stats.profitFactor === 3, 'Profit factor should be 3');
  });

  // ------------------------------------------------------------------------
  // 导出功能测试
  // ------------------------------------------------------------------------

  console.log('\n## 导出功能测试\n');

  await test('导出 JSON', async () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      autoFlush: false,
    });

    await service.recordTrade(createMockTrade({ tradeId: 'trade-001' }));
    await service.recordTrade(createMockTrade({ tradeId: 'trade-002' }));

    const outputPath = path.join(__dirname, 'test-output', 'ledger.json');
    await service.exportToJSON(outputPath);

    const content = await fs.readFile(outputPath, 'utf-8');
    const data = JSON.parse(content);

    assert(data.trades.length === 2, 'JSON should have 2 trades');
    assert(data.sessionId === 'session-001', 'Session ID should match');

    // 清理
    await fs.rm(path.join(__dirname, 'test-output'), { recursive: true, force: true });
  });

  await test('导出 CSV', async () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      autoFlush: false,
    });

    await service.recordTrade(createMockTrade({ tradeId: 'trade-001' }));
    await service.recordTrade(createMockTrade({ tradeId: 'trade-002' }));

    const outputPath = path.join(__dirname, 'test-output', 'ledger.csv');
    await service.exportToCSV(outputPath);

    const content = await fs.readFile(outputPath, 'utf-8');
    const lines = content.split('\n');

    assert(lines.length === 3, 'CSV should have 3 lines (header + 2 trades)'); // header + 2 trades
    assert(lines[0].includes('trade_id'), 'First line should be header');

    // 清理
    await fs.rm(path.join(__dirname, 'test-output'), { recursive: true, force: true });
  });

  await test('重置服务', async () => {
    const service = createLedgerService({
      sessionId: 'session-001',
      strategyId: 'strategy-001',
      autoFlush: false,
    });

    await service.recordTrade(createMockTrade());
    await service.recordTrade(createMockTrade());

    let stats = service.getStats();
    assert(stats.totalTrades === 2, 'Should have 2 trades before reset');

    service.reset();

    stats = service.getStats();
    assert(stats.totalTrades === 0, 'Should have 0 trades after reset');

    const trades = await service.getTrades();
    assert(trades.length === 0, 'Should have no trades after reset');
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

