/**
 * MaxOrderSize Rule - 最大订单规模规则
 * 
 * 限制单笔订单的：
 * - 数量
 * - 名义价值
 * 
 * @module risk/rules/max-order-size
 */

import Big from 'big.js';
import { RiskRule, RiskRuleContext, RiskDecisionResult, RiskRuleConfig } from '../interfaces';

/**
 * MaxOrderSize 规则配置
 */
export interface MaxOrderSizeParams extends RiskRuleConfig {
  /** 最大订单数量 */
  maxQuantity?: string;
  
  /** 最大名义价值 */
  maxNotional?: string;
  
  /** 监控的交易对（为空则监控所有） */
  symbols?: string[];
}

/**
 * 最大订单规模规则
 */
export class MaxOrderSizeRule implements RiskRule {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  enabled: boolean;

  constructor(private params: MaxOrderSizeParams) {
    this.id = params.id || 'MaxOrderSizeRule';
    this.name = params.name || '最大订单规模';
    this.priority = params.priority ?? 10;
    this.enabled = params.enabled ?? true;
  }

  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null {
    // 检查标的是否在监控范围
    if (this.params.symbols && this.params.symbols.length > 0) {
      if (!this.params.symbols.includes(ctx.currentIntent.symbol)) {
        return null; // 不处理
      }
    }

    // 检查数量限制
    if (this.params.maxQuantity) {
      const qty = new Big(ctx.currentIntent.quantity);
      const maxQty = new Big(this.params.maxQuantity);
      
      if (qty.gt(maxQty)) {
        return {
          decision: 'reject',
          reason: {
            code: 'MAX_ORDER_SIZE_EXCEEDED',
            message: `订单数量 ${qty.toFixed()} 超过限制 ${maxQty.toFixed()}`,
            details: {
              quantity: qty.toFixed(),
              maxQuantity: maxQty.toFixed(),
              symbol: ctx.currentIntent.symbol,
            },
          },
          ruleId: this.id,
          severity: 'warning',
        };
      }
    }

    // 检查名义价值限制
    if (this.params.maxNotional && ctx.currentIntent.price) {
      const qty = new Big(ctx.currentIntent.quantity);
      const price = new Big(ctx.currentIntent.price);
      const notional = qty.times(price);
      const maxNotional = new Big(this.params.maxNotional);
      
      if (notional.gt(maxNotional)) {
        // 计算允许的最大数量
        const allowedQty = maxNotional.div(price);
        
        return {
          decision: 'modify',
          modifiedIntent: {
            quantity: allowedQty.toFixed(),
          },
          reason: {
            code: 'MAX_NOTIONAL_EXCEEDED',
            message: `订单名义价值 ${notional.toFixed(2)} 超限，调整至 ${maxNotional.toFixed(2)}`,
            details: {
              originalQty: qty.toFixed(),
              modifiedQty: allowedQty.toFixed(),
              originalNotional: notional.toFixed(2),
              maxNotional: maxNotional.toFixed(2),
            },
          },
          ruleId: this.id,
          severity: 'info',
        };
      }
    }

    return null; // 通过
  }
}

