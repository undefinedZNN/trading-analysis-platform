/**
 * Fee Models - 手续费模型
 * 
 * 提供多种手续费计算策略：
 * - 零手续费
 * - 固定费率
 * - 分级费率
 * 
 * @module execution/models/fee
 */

import Big from 'big.js';
import { FeeModel, FeeInput, FeeAmount } from '../interfaces';

/**
 * 零手续费模型（用于测试）
 */
export class ZeroFeeModel implements FeeModel {
  getName(): string {
    return 'ZeroFee';
  }

  compute(input: FeeInput): FeeAmount {
    return {
      amount: '0',
      asset: 'USDT',
    };
  }
}

/**
 * 固定费率手续费模型
 */
export class FixedRateFeeModel implements FeeModel {
  constructor(
    private makerRate: number,
    private takerRate: number,
    private feeAsset: string = 'USDT'
  ) {}

  getName(): string {
    return `FixedRate(maker:${this.makerRate}%, taker:${this.takerRate}%)`;
  }

  compute(input: FeeInput): FeeAmount {
    const price = new Big(input.price);
    const quantity = new Big(input.quantity);
    const notional = price.times(quantity);

    const rate = input.liquidity === 'maker' ? this.makerRate : this.takerRate;
    const fee = notional.times(rate).div(100);

    return {
      amount: fee.toFixed(),
      asset: this.feeAsset,
    };
  }
}

/**
 * 分级费率手续费模型
 */
export class TieredFeeModel implements FeeModel {
  constructor(
    private tiers: Array<{
      threshold: string;
      makerRate: number;
      takerRate: number;
    }>,
    private feeAsset: string = 'USDT'
  ) {
    // 按阈值排序
    this.tiers.sort((a, b) => new Big(a.threshold).minus(b.threshold).toNumber());
  }

  getName(): string {
    return `TieredFee(${this.tiers.length} tiers)`;
  }

  compute(input: FeeInput): FeeAmount {
    const price = new Big(input.price);
    const quantity = new Big(input.quantity);
    const notional = price.times(quantity);

    // 找到适用的费率层级
    let makerRate = this.tiers[0].makerRate;
    let takerRate = this.tiers[0].takerRate;

    for (const tier of this.tiers) {
      if (notional.gte(tier.threshold)) {
        makerRate = tier.makerRate;
        takerRate = tier.takerRate;
      } else {
        break;
      }
    }

    const rate = input.liquidity === 'maker' ? makerRate : takerRate;
    const fee = notional.times(rate).div(100);

    return {
      amount: fee.toFixed(),
      asset: this.feeAsset,
    };
  }
}

