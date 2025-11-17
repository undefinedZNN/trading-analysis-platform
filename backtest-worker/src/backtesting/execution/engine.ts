/**
 * ExecutionEngine - 执行撮合引擎核心
 * 
 * 负责：
 * - 订单生命周期管理
 * - 撮合逻辑
 * - 滑点和手续费计算
 * - 仓位更新
 * - 快照恢复
 * 
 * @module execution/engine
 */

import { nanoid } from 'nanoid';
import Big from 'big.js';
import {
  ExecutionEngine,
  ExecutionEngineConfig,
  OrderEntry,
  OrderIntentPayload,
  BarEvent,
  ExecutionFill,
  ExecutionSnapshot,
  ExecutionStats,
  MatchingEngine,
  SlippageModel,
  FeeModel,
  PortfolioStore,
  ExecutionReportPayload,
  PortfolioUpdatePayload,
  MatchResult,
} from './interfaces';
import { MarketOrderMatcher, LimitOrderMatcher, StopOrderMatcher } from './matchers';
import { ZeroSlippageModel, FixedSpreadSlippage } from './models/slippage.models';
import { ZeroFeeModel, FixedRateFeeModel } from './models/fee.models';
import { SimplePortfolioStore } from './portfolio-store';

/**
 * 执行引擎实现
 */
export class ExecutionEngineImpl implements ExecutionEngine {
  private orders = new Map<string, OrderEntry>();
  private activeOrderIds = new Set<string>();
  private portfolioStore: PortfolioStore;
  private slippageModel: SlippageModel;
  private feeModel: FeeModel;
  private marketMatcher: MatchingEngine;
  private limitMatcher: MatchingEngine;
  private stopMatcher: MatchingEngine;
  private latestBar: BarEvent | null = null;
  private stats: ExecutionStats;
  private config: ExecutionEngineConfig;

  // 事件发布回调
  private onExecutionReport?: (report: ExecutionReportPayload) => void;
  private onPortfolioUpdate?: (update: PortfolioUpdatePayload) => void;

  constructor(config: ExecutionEngineConfig) {
    this.config = config;

    // 初始化组件
    this.portfolioStore = new SimplePortfolioStore();
    this.slippageModel = config.slippageModel || new ZeroSlippageModel();
    this.feeModel = config.feeModel || new ZeroFeeModel();
    this.marketMatcher = new MarketOrderMatcher(config.marketFillPolicy || 'close');
    this.limitMatcher = new LimitOrderMatcher();
    this.stopMatcher = new StopOrderMatcher();

    // 初始化统计
    this.stats = {
      totalOrders: 0,
      filledOrders: 0,
      cancelledOrders: 0,
      totalVolume: '0',
      totalFees: '0',
      avgSlippageBps: 0,
    };

    // 初始化余额
    if (this.portfolioStore instanceof SimplePortfolioStore) {
      this.portfolioStore.initializeBalance(config.strategyId, 'USDT', '10000');
    }

    this.log('info', 'ExecutionEngine initialized', {
      sessionId: config.sessionId,
      strategyId: config.strategyId,
    });
  }

  /**
   * 提交订单
   */
  async submit(intent: OrderIntentPayload): Promise<string> {
    try {
      // 1. 创建订单
      const order: OrderEntry = {
        orderId: nanoid(),
        intentId: intent.intentId,
        strategyId: intent.strategyId,
        symbol: intent.symbol,
        side: intent.side,
        type: intent.type,
        tif: intent.tif || 'GTC',
        limitPrice: intent.price,
        stopPrice: intent.stopPrice,
        quantity: intent.quantity,
        remaining: intent.quantity,
        createdAt: new Date().toISOString(),
        status: 'new',
        fills: [],
        metadata: intent.metadata,
      };

      // 2. 存储订单
      this.orders.set(order.orderId, order);
      this.activeOrderIds.add(order.orderId);
      this.stats.totalOrders++;

      this.log('info', `Order submitted: ${order.orderId}`, {
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
      });

      // 3. 发布执行回报（new状态）
      this.publishExecutionReport(order);

      // 4. 如果是市价单且有最新行情，立即尝试撮合
      if (order.type === 'market' && this.latestBar && this.latestBar.symbol === order.symbol) {
        await this.tryMatch(order, this.latestBar);
      }

      return order.orderId;

    } catch (error: any) {
      this.log('error', `Error submitting order: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * 取消订单
   */
  async cancel(orderId: string, reason?: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) {
      this.log('warn', `Order not found: ${orderId}`);
      return;
    }

    if (order.status === 'filled' || order.status === 'cancelled') {
      this.log('warn', `Order cannot be cancelled: ${orderId} (status: ${order.status})`);
      return;
    }

    order.status = 'cancelled';
    order.updatedAt = new Date().toISOString();
    this.activeOrderIds.delete(orderId);
    this.stats.cancelledOrders++;

    this.log('info', `Order cancelled: ${orderId}`, { orderId, reason });
    this.publishExecutionReport(order);
  }

  /**
   * 处理行情（触发撮合）
   */
  async processBars(bars: BarEvent[]): Promise<void> {
    for (const bar of bars) {
      this.latestBar = bar;

      // 对所有活跃订单尝试撮合
      const activeOrders = Array.from(this.activeOrderIds)
        .map(id => this.orders.get(id)!)
        .filter(order => order.symbol === bar.symbol);

      for (const order of activeOrders) {
        await this.tryMatch(order, bar);
      }
    }
  }

  /**
   * 查询订单
   */
  getOrder(orderId: string): OrderEntry | undefined {
    return this.orders.get(orderId);
  }

  /**
   * 获取活跃订单
   */
  getActiveOrders(): OrderEntry[] {
    return Array.from(this.activeOrderIds)
      .map(id => this.orders.get(id)!)
      .filter(order => order !== undefined);
  }

  /**
   * 获取所有订单
   */
  getAllOrders(): OrderEntry[] {
    return Array.from(this.orders.values());
  }

  /**
   * 获取统计信息
   */
  getStats(): ExecutionStats {
    return { ...this.stats };
  }

  /**
   * 创建快照
   */
  createSnapshot(): ExecutionSnapshot {
    return {
      snapshotId: nanoid(),
      sessionId: this.config.sessionId,
      orders: Array.from(this.orders.values()),
      activeOrderIds: Array.from(this.activeOrderIds),
      stats: { ...this.stats },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 恢复快照
   */
  restoreSnapshot(snapshot: ExecutionSnapshot): void {
    this.orders.clear();
    this.activeOrderIds.clear();

    for (const order of snapshot.orders) {
      this.orders.set(order.orderId, { ...order });
    }

    for (const orderId of snapshot.activeOrderIds) {
      this.activeOrderIds.add(orderId);
    }

    this.stats = { ...snapshot.stats };

    this.log('info', 'Snapshot restored', { snapshotId: snapshot.snapshotId });
  }

  /**
   * 重置
   */
  reset(): void {
    this.orders.clear();
    this.activeOrderIds.clear();
    this.latestBar = null;
    this.stats = {
      totalOrders: 0,
      filledOrders: 0,
      cancelledOrders: 0,
      totalVolume: '0',
      totalFees: '0',
      avgSlippageBps: 0,
    };
    this.log('info', 'ExecutionEngine reset');
  }

  /**
   * 设置事件回调
   */
  setEventCallbacks(callbacks: {
    onExecutionReport?: (report: ExecutionReportPayload) => void;
    onPortfolioUpdate?: (update: PortfolioUpdatePayload) => void;
  }): void {
    this.onExecutionReport = callbacks.onExecutionReport;
    this.onPortfolioUpdate = callbacks.onPortfolioUpdate;
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 尝试撮合订单
   */
  private async tryMatch(order: OrderEntry, bar: BarEvent): Promise<void> {
    let lastMatch: MatchResult | null = null;
    try {
      // 1. 选择匹配引擎
      const matcher = this.getMatcherForOrder(order);

      this.log('info', '尝试撮合订单', {  bar });
      // 2. 尝试撮合
      lastMatch = matcher.match(order, bar);
      if (!lastMatch) {
        return; // 未触及
      }

      // 3. 应用滑点
      const fillPrice = this.slippageModel.apply({
        basePrice: lastMatch.fillPrice,
        side: order.side,
        quantity: lastMatch.fillQuantity,
        liquidity: lastMatch.liquidity,
      });

      // 4. 计算手续费
      const fee = this.feeModel.compute({
        price: fillPrice,
        quantity: lastMatch.fillQuantity,
        side: order.side,
        liquidity: lastMatch.liquidity,
      });

      // 5. 创建成交记录
      const fill: ExecutionFill = {
        fillId: nanoid(),
        quantity: lastMatch.fillQuantity,
        price: fillPrice,
        fee,
        liquidity: lastMatch.liquidity,
        timestamp: bar.timestamp,
      };

      order.fills.push(fill);

      // 6. 更新剩余数量
      order.remaining = new Big(order.remaining).minus(fill.quantity).toFixed();

      // 7. 更新状态
      if (new Big(order.remaining).eq(0)) {
        order.status = 'filled';
        this.activeOrderIds.delete(order.orderId);
        this.stats.filledOrders++;
      } else {
        order.status = 'partially_filled';

        // 检查 TIF
        if (order.tif === 'IOC' || order.tif === 'FOK') {
          await this.cancel(order.orderId, `${order.tif} not fully filled`);
          return;
        }
      }

      order.updatedAt = new Date().toISOString();

      // 8. 更新统计
      const volume = new Big(fill.quantity).times(fill.price);
      this.stats.totalVolume = new Big(this.stats.totalVolume).plus(volume).toFixed();
      this.stats.totalFees = new Big(this.stats.totalFees).plus(fee.amount).toFixed();

      this.log('info', `Order matched: ${order.orderId}`, {
        orderId: order.orderId,
        fillQuantity: fill.quantity,
        fillPrice: fill.price,
        status: order.status,
      });

      // 9. 发布执行回报
      this.publishExecutionReport(order);

      // 10. 更新仓位
      if (this.config.trackPositions !== false) {
        this.updatePosition(order, fill, bar);
      }

    } catch (error: any) {
      this.log('error', `Error matching order ${order.orderId}: ${error.message}`, {
        error,
        orderId: order.orderId,
        orderQuantity: order.quantity,
        orderRemaining: order.remaining,
        orderType: order.type,
        barTimestamp: bar.timestamp,
        barClose: bar.close,
        matchResult: lastMatch,
      });
    }
  }

  /**
   * 获取订单的匹配引擎
   */
  private getMatcherForOrder(order: OrderEntry): MatchingEngine {
    switch (order.type) {
      case 'market':
        return this.marketMatcher;
      case 'limit':
      case 'stop-limit':
        return this.limitMatcher;
      case 'stop':
        return this.stopMatcher;
      default:
        return this.marketMatcher;
    }
  }

  /**
   * 更新仓位
   */
  private updatePosition(order: OrderEntry, fill: ExecutionFill, bar: BarEvent): void {
    let position = this.portfolioStore.getPosition(order.strategyId, order.symbol);

    if (!position) {
      // 创建新仓位
      position = {
        symbol: order.symbol,
        side: order.side === 'buy' ? 'long' : 'short',
        quantity: '0',
        avgEntryPrice: '0',
        unrealizedPnl: '0',
        realizedPnl: '0',
      };
    }

    const fillQty = new Big(fill.quantity);
    const fillPrice = new Big(fill.price);
    const currentQty = new Big(position.quantity);

    if (order.side === 'buy') {
      // 买入
      const newQty = currentQty.plus(fillQty);
      const currentCost = currentQty.times(position.avgEntryPrice);
      const fillCost = fillQty.times(fillPrice);
      const newAvgPrice = newQty.eq(0) ? '0' : currentCost.plus(fillCost).div(newQty).toFixed();

      position.quantity = newQty.toFixed();
      position.avgEntryPrice = newAvgPrice;
      position.side = 'long';
    } else {
      // 卖出
      const newQty = currentQty.minus(fillQty);

      if (newQty.gte(0)) {
        position.quantity = newQty.toFixed();
        if (newQty.eq(0)) {
          position.side = 'flat';
        }
      } else {
        // 反向开仓
        position.quantity = newQty.abs().toFixed();
        position.avgEntryPrice = fillPrice.toFixed();
        position.side = 'short';
      }
    }

    // 计算未实现盈亏
    const currentPrice = new Big(bar.close);
    const posQty = new Big(position.quantity);
    const avgPrice = new Big(position.avgEntryPrice);

    if (position.side === 'long') {
      position.unrealizedPnl = currentPrice.minus(avgPrice).times(posQty).toFixed();
    } else if (position.side === 'short') {
      position.unrealizedPnl = avgPrice.minus(currentPrice).times(posQty).toFixed();
    } else {
      position.unrealizedPnl = '0';
    }

    position.currentPrice = bar.close;

    this.portfolioStore.updatePosition(order.strategyId, position);

    // 发布组合更新
    this.publishPortfolioUpdate(order.strategyId);
  }

  /**
   * 发布执行回报
   */
  private publishExecutionReport(order: OrderEntry): void {
    const totalFees = order.fills.reduce(
      (sum, fill) => sum.plus(fill.fee?.amount || '0'),
      new Big(0)
    );

    const filledQty = order.fills.reduce(
      (sum, fill) => sum.plus(fill.quantity),
      new Big(0)
    );

    const avgPrice = filledQty.eq(0)
      ? '0'
      : order.fills
        .reduce((sum, fill) => sum.plus(new Big(fill.price).times(fill.quantity)), new Big(0))
        .div(filledQty)
        .toFixed();

    const report: ExecutionReportPayload = {
      orderId: order.orderId,
      intentId: order.intentId,
      strategyId: order.strategyId,
      symbol: order.symbol,
      side: order.side,
      status: order.status,
      quantity: order.quantity,
      remaining: order.remaining,
      filledQty: filledQty.toFixed(),
      avgFillPrice: avgPrice,
      lastFill: order.fills[order.fills.length - 1],
      totalFee: totalFees.toFixed(),
      feeCurrency: order.fills[0]?.fee?.asset || 'USDT',
      timestamp: order.updatedAt || order.createdAt,
      metadata: order.metadata,
    };

    if (this.onExecutionReport) {
      this.onExecutionReport(report);
    }
  }

  /**
   * 发布组合更新
   */
  private publishPortfolioUpdate(strategyId: string): void {
    const portfolio = this.portfolioStore.getPortfolio(strategyId);
    if (!portfolio) {
      return;
    }

    const positions = Object.values(portfolio.positions).map(pos => ({
      symbol: pos.symbol,
      side: pos.side,
      quantity: pos.quantity,
      avgEntryPrice: pos.avgEntryPrice,
      unrealizedPnl: pos.unrealizedPnl,
      realizedPnl: pos.realizedPnl,
    }));

    const update: PortfolioUpdatePayload = {
      strategyId,
      balances: portfolio.balances,
      positions,
      equity: portfolio.equity,
      marginUsage: portfolio.marginUsage,
      timestamp: portfolio.timestamp,
    };

    if (this.onPortfolioUpdate) {
      this.onPortfolioUpdate(update);
    }
  }

  /**
   * 日志记录
   */
  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    if (this.config.logger) {
      this.config.logger(level, message, meta);
    } else {
      const prefix = `[ExecutionEngine:${this.config.strategyId}]`;
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`${prefix} [${level.toUpperCase()}] ${message}${metaStr}`);
    }
  }
}

/**
 * 创建执行引擎
 */
export function createExecutionEngine(config: ExecutionEngineConfig): ExecutionEngine {
  return new ExecutionEngineImpl(config);
}
