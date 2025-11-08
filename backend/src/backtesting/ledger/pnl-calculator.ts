/**
 * PnL Calculator - 盈亏计算引擎
 * 
 * 负责计算：
 * - 已实现盈亏（平仓时）
 * - 未实现盈亏（持仓中）
 * - 仓位更新
 * 
 * @module ledger/pnl-calculator
 */

import Big from 'big.js';
import { PnLCalculator, PnLResult, TradeSide } from './interfaces';

/**
 * 简单 PnL 计算器实现
 */
export class SimplePnLCalculator implements PnLCalculator {
  calculate(
    trade: {
      side: TradeSide;
      quantity: string;
      price: string;
      fees: string;
    },
    position?: {
      quantity: string;
      avgEntryPrice: string;
      side: 'long' | 'short' | 'flat';
    }
  ): PnLResult {
    const tradeQty = new Big(trade.quantity);
    const tradePrice = new Big(trade.price);
    const fees = new Big(trade.fees);

    // 如果没有仓位，创建新仓位
    if (!position || position.side === 'flat' || new Big(position.quantity).eq(0)) {
      return {
        realizedPnl: new Big(0).minus(fees).toFixed(), // 开仓只有手续费
        unrealizedPnl: '0',
        newPosition: {
          quantity: tradeQty.toFixed(),
          avgEntryPrice: tradePrice.toFixed(),
          side: trade.side === 'buy' ? 'long' : 'short',
        },
      };
    }

    const posQty = new Big(position.quantity);
    const posAvgPrice = new Big(position.avgEntryPrice);

    // 判断是加仓还是平仓
    const isAddingPosition =
      (position.side === 'long' && trade.side === 'buy') ||
      (position.side === 'short' && trade.side === 'sell');

    if (isAddingPosition) {
      // 加仓：计算新的平均入场价
      const currentCost = posQty.times(posAvgPrice);
      const newCost = tradeQty.times(tradePrice);
      const totalQty = posQty.plus(tradeQty);
      const newAvgPrice = currentCost.plus(newCost).div(totalQty);

      return {
        realizedPnl: new Big(0).minus(fees).toFixed(), // 加仓只有手续费
        unrealizedPnl: '0',
        newPosition: {
          quantity: totalQty.toFixed(),
          avgEntryPrice: newAvgPrice.toFixed(),
          side: position.side,
        },
      };
    } else {
      // 平仓：计算已实现盈亏
      let realizedPnl: Big;
      
      if (position.side === 'long') {
        // 多头平仓（卖出）
        realizedPnl = tradePrice.minus(posAvgPrice).times(tradeQty);
      } else {
        // 空头平仓（买入）
        realizedPnl = posAvgPrice.minus(tradePrice).times(tradeQty);
      }

      // 减去手续费
      realizedPnl = realizedPnl.minus(fees);

      const newQty = posQty.minus(tradeQty);

      // 完全平仓
      if (newQty.lte(0)) {
        return {
          realizedPnl: realizedPnl.toFixed(),
          unrealizedPnl: '0',
          newPosition: {
            quantity: '0',
            avgEntryPrice: '0',
            side: 'flat',
          },
        };
      }

      // 部分平仓
      return {
        realizedPnl: realizedPnl.toFixed(),
        unrealizedPnl: '0',
        newPosition: {
          quantity: newQty.toFixed(),
          avgEntryPrice: posAvgPrice.toFixed(),
          side: position.side,
        },
      };
    }
  }

  /**
   * 计算未实现盈亏
   */
  calculateUnrealizedPnl(
    position: {
      quantity: string;
      avgEntryPrice: string;
      side: 'long' | 'short' | 'flat';
    },
    currentPrice: string
  ): string {
    if (position.side === 'flat' || new Big(position.quantity).eq(0)) {
      return '0';
    }

    const qty = new Big(position.quantity);
    const avgPrice = new Big(position.avgEntryPrice);
    const curPrice = new Big(currentPrice);

    if (position.side === 'long') {
      return curPrice.minus(avgPrice).times(qty).toFixed();
    } else {
      return avgPrice.minus(curPrice).times(qty).toFixed();
    }
  }
}

