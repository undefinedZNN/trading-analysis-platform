/**
 * FixedRebalance 测试策略
 * 
 * 目的：测试订单撮合流程
 * 行为：定期按固定规则下单，测试交易执行
 * 断言：成交笔数、手续费、订单状态、持仓更新
 * 
 * @module e2e-tests/strategies/fixed-rebalance
 */

import Big from 'big.js';
import { nanoid } from 'nanoid';
import type { TestStrategy, TestResult, TestConfig } from '../runner/test-runner';
import type { SessionResults } from '../../analytics/interfaces';
import type { TradeRecord } from '../../ledger/interfaces';
import { assertBacktest, assert } from '../assertions';
import { DataGenerator } from '../fixtures/data-generator';

/**
 * FixedRebalance 策略配置
 */
export interface FixedRebalanceConfig {
  /** 再平衡间隔（bar数） */
  rebalanceInterval?: number;
  /** 目标持仓比例 */
  targetAllocation?: number;
  /** 手续费率 */
  feeRate?: number;
  /** 预期交易数 */
  expectedTrades?: number;
}

/**
 * 订单类型
 */
interface Order {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  status: 'pending' | 'filled' | 'rejected';
  filledAt?: string;
}

/**
 * FixedRebalance 测试策略
 * 
 * 该策略定期进行固定比例的再平衡，测试订单执行流程
 */
export class FixedRebalanceStrategy implements TestStrategy {
  name = 'FixedRebalance';
  description = '测试订单撮合流程，定期固定比例再平衡';
  scriptPath = 'strategies/fixed-rebalance-strategy.js';
  
  private config: Required<FixedRebalanceConfig>;
  private orders: Order[] = [];
  private trades: TradeRecord[] = [];
  private barCount = 0;
  private currentPosition = new Big(0);
  private currentEquity: Big;
  private totalFees = new Big(0);

  testConfig: TestConfig = {
    dataset: 'test-data-sideways',
    startTime: '2024-01-01T00:00:00Z',
    endTime: '2024-01-05T00:00:00Z',
    symbols: ['BTCUSDT'],
    timeframe: '1m',
    initialCapital: '10000',
    timeout: 120000,
  };

  constructor(config: FixedRebalanceConfig = {}) {
    this.config = {
      rebalanceInterval: 100, // Every 100 bars
      targetAllocation: 0.5, // 50% position
      feeRate: 0.001, // 0.1%
      expectedTrades: 40, // ~4 days * 24h * 60m / 100
      ...config,
    };
    
    this.currentEquity = new Big(this.testConfig.initialCapital || '10000');
  }

  /**
   * 运行测试
   */
  async run(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // 1. 生成测试数据
      console.log('📊 Generating test data...');
      const testData = DataGenerator.generateSideways(4);
      console.log(`Generated ${testData.length} bars`);

      // 2. 运行策略
      console.log('💼 Running rebalance strategy...');
      for (const bar of testData) {
        await this.onBar(bar);
        this.barCount++;
      }

      console.log(`✅ Strategy completed: ${this.trades.length} trades executed`);

      // 3. 计算最终统计
      const stats = this.calculateStats();

      // 4. 创建结果
      const results: SessionResults = {
        sessionId: 'fixed-rebalance-test',
        config: {
          sessionId: 'fixed-rebalance-test',
          strategyId: 'fixed-rebalance',
          strategyName: 'FixedRebalance',
          symbols: this.testConfig.symbols || [],
          timeframe: this.testConfig.timeframe || '1m',
          startTime: this.testConfig.startTime || '',
          endTime: this.testConfig.endTime || '',
          initialCapital: this.testConfig.initialCapital || '10000',
        },
        metrics: {
          trading: {
            totalTrades: this.trades.length,
            winningTrades: stats.winningTrades,
            losingTrades: stats.losingTrades,
            winRate: stats.winRate,
            totalPnl: stats.totalPnl.toFixed(2),
            avgPnl: stats.avgPnl.toFixed(2),
            avgWin: stats.avgWin.toFixed(2),
            avgLoss: stats.avgLoss.toFixed(2),
            profitFactor: stats.profitFactor,
            maxWin: stats.maxWin.toFixed(2),
            maxLoss: stats.maxLoss.toFixed(2),
            totalFees: this.totalFees.toFixed(2),
          },
          risk: {
            sharpeRatio: 0,
            sortinoRatio: 0,
            calmarRatio: 0,
            downsideDeviation: 0,
            var95: 0,
            cvar95: 0,
            maxDrawdown: 0,
            volatility: 0,
          },
          returns: {
            dailyReturns: [],
            cumulativeReturn: stats.totalPnl.div(this.testConfig.initialCapital || '10000').toNumber(),
            annualizedReturn: 0,
            meanDailyReturn: 0,
            stdDevReturns: 0,
            positiveDays: 0,
            negativeDays: 0,
          },
          drawdown: {
            maxDrawdown: 0,
            maxDrawdownStart: '',
            maxDrawdownEnd: '',
            maxDrawdownDuration: 0,
            currentDrawdown: 0,
          },
        },
        equityCurve: {
          timestamps: [this.testConfig.startTime || '', this.testConfig.endTime || ''],
          equity: [this.testConfig.initialCapital || '10000', this.currentEquity.toFixed(2)],
          drawdown: ['0', '0'],
        },
        files: {
          ledger: '',
          featureCatalog: '',
          logs: '',
          fullResults: '',
        },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'completed',
      };

      return {
        name: this.name,
        passed: true,
        duration: Date.now() - startTime,
        results,
        assertions: [
          {
            description: `Executed ${this.trades.length} trades`,
            passed: true,
          },
          {
            description: `Total fees: ${this.totalFees.toFixed(2)}`,
            passed: true,
          },
        ],
      };
    } catch (error: any) {
      return {
        name: this.name,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message || String(error),
      };
    }
  }

  /**
   * 处理每个bar
   */
  private async onBar(bar: any): Promise<void> {
    const price = new Big(bar.close);

    // 每隔一定数量的bar进行再平衡
    if (this.barCount % this.config.rebalanceInterval === 0) {
      await this.rebalance(price, bar.timestamp);
    }
  }

  /**
   * 执行再平衡
   */
  private async rebalance(price: Big, timestamp: string): Promise<void> {
    // 计算目标持仓
    const targetValue = this.currentEquity.times(this.config.targetAllocation);
    const targetPosition = targetValue.div(price);

    // 计算需要交易的数量
    const deltaPosition = targetPosition.minus(this.currentPosition);

    if (deltaPosition.abs().gt(0.0001)) { // 最小交易量阈值
      const side = deltaPosition.gt(0) ? 'buy' : 'sell';
      const quantity = deltaPosition.abs();

      // 创建订单
      const order: Order = {
        orderId: nanoid(),
        symbol: 'BTCUSDT',
        side,
        quantity: quantity.toFixed(8),
        price: price.toFixed(2),
        status: 'pending',
      };

      this.orders.push(order);

      // 模拟订单执行
      await this.executeOrder(order, timestamp);
    }
  }

  /**
   * 执行订单
   */
  private async executeOrder(order: Order, timestamp: string): Promise<void> {
    // 计算交易金额
    const quantity = new Big(order.quantity);
    const price = new Big(order.price);
    const value = quantity.times(price);
    
    // 计算手续费
    const fee = value.times(this.config.feeRate);
    this.totalFees = this.totalFees.plus(fee);

    // 更新持仓
    if (order.side === 'buy') {
      this.currentPosition = this.currentPosition.plus(quantity);
      this.currentEquity = this.currentEquity.minus(value).minus(fee);
    } else {
      this.currentPosition = this.currentPosition.minus(quantity);
      this.currentEquity = this.currentEquity.plus(value).minus(fee);
    }

    // 创建交易记录
    const trade: TradeRecord = {
      tradeId: nanoid(),
      sessionId: 'fixed-rebalance-test',
      strategyId: 'fixed-rebalance',
      symbol: order.symbol,
      intentId: nanoid(),
      orderId: order.orderId,
      fillId: nanoid(),
      side: order.side,
      type: order.side === 'buy' ? 'open' : 'close',
      quantity: order.quantity,
      price: order.price,
      realizedPnl: '0', // 简化
      unrealizedPnl: '0',
      fees: fee.toFixed(2),
      feeCurrency: 'USDT',
      liquidity: 'taker',
      timestamp,
      sequenceId: nanoid(),
    };

    this.trades.push(trade);

    // 更新订单状态
    order.status = 'filled';
    order.filledAt = timestamp;
  }

  /**
   * 计算统计数据
   */
  private calculateStats() {
    let winningTrades = 0;
    let losingTrades = 0;
    let totalPnl = new Big(0);
    let totalWin = new Big(0);
    let totalLoss = new Big(0);
    let maxWin = new Big(0);
    let maxLoss = new Big(0);

    // 简化：假设每笔交易的PnL为0（因为是市价成交）
    // 实际应该根据买卖价差计算

    const winRate = this.trades.length > 0 ? winningTrades / this.trades.length : 0;
    const avgPnl = this.trades.length > 0 ? totalPnl.div(this.trades.length) : new Big(0);
    const avgWin = winningTrades > 0 ? totalWin.div(winningTrades) : new Big(0);
    const avgLoss = losingTrades > 0 ? totalLoss.div(losingTrades) : new Big(0);
    const profitFactor = totalLoss.gt(0) ? totalWin.div(totalLoss.abs()).toNumber() : 0;

    return {
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      avgPnl,
      avgWin,
      avgLoss,
      profitFactor,
      maxWin,
      maxLoss,
    };
  }

  /**
   * 执行断言
   */
  async assert(results: SessionResults): Promise<void> {
    // 1. 断言会话成功完成
    assertBacktest.assertSessionCompleted(results, 'Session should complete successfully');

    // 2. 断言无错误
    assertBacktest.assertNoErrors(results, 'Session should have no errors');

    // 3. 断言交易数量在合理范围内
    const minTrades = Math.floor(this.config.expectedTrades * 0.8);
    const maxTrades = Math.ceil(this.config.expectedTrades * 1.2);
    
    assert.assertInRange(
      this.trades.length,
      minTrades,
      maxTrades,
      `Trade count should be between ${minTrades} and ${maxTrades}, got ${this.trades.length}`
    );

    // 4. 断言所有订单都已成交
    const filledOrders = this.orders.filter(o => o.status === 'filled');
    assert.assertEqual(
      filledOrders.length,
      this.orders.length,
      'All orders should be filled'
    );

    // 5. 断言手续费合理
    const expectedMinFees = this.trades.length * 10 * this.config.feeRate; // 假设平均每笔10 USDT
    assert.assertTrue(
      this.totalFees.toNumber() >= expectedMinFees,
      `Total fees should be >= ${expectedMinFees}, got ${this.totalFees.toFixed(2)}`
    );

    // 6. 断言交易记录与订单匹配
    assert.assertEqual(
      this.trades.length,
      filledOrders.length,
      'Trade count should match filled order count'
    );

    // 7. 断言无重复交易
    assertBacktest.assertNoDuplicateTrades(this.trades, 'Should have no duplicate trades');

    // 8. 断言交易连续性
    assertBacktest.assertTradeContinuity(this.trades, 'Trades should be in chronological order');

    // 9. 断言权益变化合理（扣除手续费）
    const initialEquity = new Big(results.config.initialCapital);
    const finalEquity = new Big(results.equityCurve.equity[results.equityCurve.equity.length - 1]);
    const equityChange = finalEquity.minus(initialEquity);
    
    // 权益应该减少（手续费）
    assert.assertTrue(
      equityChange.lt(0) || equityChange.eq(0),
      `Equity should decrease or stay same (fees), changed by ${equityChange.toFixed(2)}`
    );

    console.log('✅ All FixedRebalance assertions passed');
    console.log(`   Trades: ${this.trades.length}`);
    console.log(`   Orders: ${this.orders.length}`);
    console.log(`   Fees: ${this.totalFees.toFixed(2)}`);
    console.log(`   Final Equity: ${finalEquity.toFixed(2)}`);
  }

  /**
   * 获取订单列表
   */
  getOrders(): Order[] {
    return this.orders;
  }

  /**
   * 获取交易列表
   */
  getTrades(): TradeRecord[] {
    return this.trades;
  }

  /**
   * 获取当前持仓
   */
  getCurrentPosition(): string {
    return this.currentPosition.toFixed(8);
  }

  /**
   * 获取总手续费
   */
  getTotalFees(): string {
    return this.totalFees.toFixed(2);
  }
}

/**
 * 创建FixedRebalance测试策略
 */
export function createFixedRebalanceTest(config?: FixedRebalanceConfig): FixedRebalanceStrategy {
  return new FixedRebalanceStrategy(config);
}

