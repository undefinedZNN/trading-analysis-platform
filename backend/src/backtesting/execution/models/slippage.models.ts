/**
 * Slippage Models - 滑点模型
 * 
 * 提供多种滑点模拟策略：
 * - 零滑点
 * - 固定点差
 * - 比例滑点
 * - 市场冲击
 * 
 * @module execution/models/slippage
 */

import Big from 'big.js';
import { SlippageModel, SlippageInput } from '../interfaces';

/**
 * 零滑点模型（用于测试）
 */
export class ZeroSlippageModel implements SlippageModel {
  getName(): string {
    return 'ZeroSlippage';
  }

  apply(input: SlippageInput): string {
    return input.basePrice; // 无滑点
  }
}

/**
 * 固定点差滑点模型
 */
export class FixedSpreadSlippage implements SlippageModel {
  constructor(private bps: number) {} // 基点 (1 bps = 0.01%)

  getName(): string {
    return `FixedSpread(${this.bps}bps)`;
  }

  apply(input: SlippageInput): string {
    const price = new Big(input.basePrice);
    const slippage = price.times(this.bps).div(10000);

    // 买入时价格上升，卖出时价格下降
    if (input.side === 'buy') {
      return price.plus(slippage).toFixed();
    } else {
      return price.minus(slippage).toFixed();
    }
  }
}

/**
 * 比例滑点模型
 */
export class ProportionalSlippage implements SlippageModel {
  constructor(
    private takerBps: number,
    private makerBps: number = 0
  ) {}

  getName(): string {
    return `Proportional(taker:${this.takerBps}bps, maker:${this.makerBps}bps)`;
  }

  apply(input: SlippageInput): string {
    const price = new Big(input.basePrice);
    const bps = input.liquidity === 'taker' ? this.takerBps : this.makerBps;
    const slippage = price.times(bps).div(10000);

    if (input.side === 'buy') {
      return price.plus(slippage).toFixed();
    } else {
      return price.minus(slippage).toFixed();
    }
  }
}

/**
 * 市场冲击滑点模型
 */
export class MarketImpactSlippage implements SlippageModel {
  constructor(
    private baseBps: number,
    private impactFactor: number = 0.1 // 冲击系数
  ) {}

  getName(): string {
    return `MarketImpact(base:${this.baseBps}bps, factor:${this.impactFactor})`;
  }

  apply(input: SlippageInput): string {
    const price = new Big(input.basePrice);
    const quantity = new Big(input.quantity);

    // 基础滑点
    let totalBps = this.baseBps;

    // 根据订单大小增加滑点（市场冲击）
    const marketDepth = input.marketDepth ? new Big(input.marketDepth) : new Big(1000);
    const impact = quantity.div(marketDepth).times(this.impactFactor * 10000);
    totalBps += impact.toNumber();

    const slippage = price.times(totalBps).div(10000);

    if (input.side === 'buy') {
      return price.plus(slippage).toFixed();
    } else {
      return price.minus(slippage).toFixed();
    }
  }
}

