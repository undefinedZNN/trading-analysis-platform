/**
 * StopOrderMatcher - 止损单撮合引擎
 * 
 * 止损单在价格触及止损价后转为市价单
 * 
 * @module execution/matchers/stop-order
 */

import Big from 'big.js';
import { MatchingEngine, OrderEntry, BarEvent, MatchResult } from '../interfaces';

/**
 * 止损单撮合器
 */
export class StopOrderMatcher implements MatchingEngine {
  private triggeredOrders = new Set<string>();

  match(order: OrderEntry, bar: BarEvent): MatchResult | null {
    if (!order.stopPrice) {
      return null; // 没有止损价，不能撮合
    }

    const stopPrice = new Big(order.stopPrice);
    const high = new Big(bar.high);
    const low = new Big(bar.low);

    // 检查是否触发止损
    let triggered = this.triggeredOrders.has(order.orderId);

    if (!triggered) {
      // 买单止损：价格上涨到止损价以上
      if (order.side === 'buy' && high.gte(stopPrice)) {
        triggered = true;
        this.triggeredOrders.add(order.orderId);
      }

      // 卖单止损：价格下跌到止损价以下
      if (order.side === 'sell' && low.lte(stopPrice)) {
        triggered = true;
        this.triggeredOrders.add(order.orderId);
      }
    }

    if (!triggered) {
      return null; // 未触发
    }

    // 触发后按市价成交（使用收盘价）
    return {
      fillQuantity: order.remaining,
      fillPrice: bar.close,
      liquidity: 'taker', // 止损单触发后是taker
      timestamp: bar.timestamp,
    };
  }

  /**
   * 重置触发状态（用于测试）
   */
  reset(): void {
    this.triggeredOrders.clear();
  }
}

