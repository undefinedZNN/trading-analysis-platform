/**
 * LimitOrderMatcher - 限价单撮合引擎
 * 
 * 限价单只有在价格触及限价时才成交
 * 
 * @module execution/matchers/limit-order
 */

import Big from 'big.js';
import { MatchingEngine, OrderEntry, BarEvent, MatchResult } from '../interfaces';

/**
 * 限价单撮合器
 */
export class LimitOrderMatcher implements MatchingEngine {
  match(order: OrderEntry, bar: BarEvent): MatchResult | null {
    if (!order.limitPrice) {
      return null; // 没有限价，不能撮合
    }

    const limitPrice = new Big(order.limitPrice);
    const high = new Big(bar.high);
    const low = new Big(bar.low);

    // 买单：限价 >= 最低价（即市场价跌到限价以下）
    if (order.side === 'buy' && limitPrice.gte(low)) {
      return {
        fillQuantity: order.remaining,
        fillPrice: order.limitPrice, // 按限价成交
        liquidity: 'maker', // 限价单通常是maker
        timestamp: bar.timestamp,
      };
    }

    // 卖单：限价 <= 最高价（即市场价涨到限价以上）
    if (order.side === 'sell' && limitPrice.lte(high)) {
      return {
        fillQuantity: order.remaining,
        fillPrice: order.limitPrice, // 按限价成交
        liquidity: 'maker',
        timestamp: bar.timestamp,
      };
    }

    return null; // 未触及限价
  }
}

