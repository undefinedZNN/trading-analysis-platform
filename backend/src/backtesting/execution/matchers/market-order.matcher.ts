/**
 * MarketOrderMatcher - 市价单撮合引擎
 * 
 * 市价单立即按当前市价成交
 * 
 * @module execution/matchers/market-order
 */

import Big from 'big.js';
import { MatchingEngine, OrderEntry, BarEvent, MatchResult } from '../interfaces';

/**
 * 市价单成交策略
 */
export type MarketFillPolicy = 'open' | 'close' | 'mid';

/**
 * 市价单撮合器
 */
export class MarketOrderMatcher implements MatchingEngine {
  constructor(private fillPolicy: MarketFillPolicy = 'close') {}

  match(order: OrderEntry, bar: BarEvent): MatchResult | null {
    // 市价单立即成交
    const fillPrice = this.getFillPrice(bar, order.side);
    
    return {
      fillQuantity: order.remaining,
      fillPrice,
      liquidity: 'taker', // 市价单总是taker
      timestamp: bar.timestamp,
    };
  }

  /**
   * 根据策略获取成交价格
   */
  private getFillPrice(bar: BarEvent, side: 'buy' | 'sell'): string {
    switch (this.fillPolicy) {
      case 'open':
        return bar.open;
        
      case 'close':
        return bar.close;
        
      case 'mid':
        // 使用高低价中间值
        const high = new Big(bar.high);
        const low = new Big(bar.low);
        return high.plus(low).div(2).toFixed();
        
      default:
        return bar.close;
    }
  }
}

