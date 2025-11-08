/**
 * MaxLeverage Rule - 最大杠杆率规则
 * 
 * 限制：
 * - 账户总杠杆率
 * - 单个标的敞口
 * - 总敞口
 * 
 * @module risk/rules/max-leverage
 */

import Big from 'big.js';
import { RiskRule, RiskRuleContext, RiskDecisionResult, RiskRuleConfig } from '../interfaces';

/**
 * MaxLeverage 规则配置
 */
export interface MaxLeverageParams extends RiskRuleConfig {
  /** 最大杠杆率 */
  maxLeverage: number;
  
  /** 单个标的最大敞口 */
  maxExposurePerSymbol?: string;
  
  /** 总最大敞口 */
  maxExposureTotal?: string;
}

/**
 * 最大杠杆率规则
 */
export class MaxLeverageRule implements RiskRule {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  enabled: boolean;

  constructor(private params: MaxLeverageParams) {
    this.id = params.id || 'MaxLeverageRule';
    this.name = params.name || '最大杠杆率';
    this.priority = params.priority ?? 20;
    this.enabled = params.enabled ?? true;
  }

  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null {
    // 1. 计算新订单的敞口
    const orderExposure = this.calculateOrderExposure(ctx);
    
    // 2. 检查单个标的敞口限制
    if (this.params.maxExposurePerSymbol) {
      const currentSymbolExposure = this.getSymbolExposure(ctx, ctx.currentIntent.symbol);
      const newSymbolExposure = currentSymbolExposure.plus(orderExposure);
      const maxExposure = new Big(this.params.maxExposurePerSymbol);
      
      if (newSymbolExposure.gt(maxExposure)) {
        return {
          decision: 'reject',
          reason: {
            code: 'MAX_EXPOSURE_PER_SYMBOL_EXCEEDED',
            message: `标的 ${ctx.currentIntent.symbol} 敞口 ${newSymbolExposure.toFixed(2)} 超过限制 ${maxExposure.toFixed(2)}`,
            details: {
              symbol: ctx.currentIntent.symbol,
              currentExposure: currentSymbolExposure.toFixed(2),
              orderExposure: orderExposure.toFixed(2),
              newExposure: newSymbolExposure.toFixed(2),
              maxExposure: maxExposure.toFixed(2),
            },
          },
          ruleId: this.id,
          severity: 'warning',
        };
      }
    }
    
    // 3. 检查总敞口限制
    if (this.params.maxExposureTotal) {
      const currentTotalExposure = this.getTotalExposure(ctx);
      const newTotalExposure = currentTotalExposure.plus(orderExposure);
      const maxExposure = new Big(this.params.maxExposureTotal);
      
      if (newTotalExposure.gt(maxExposure)) {
        return {
          decision: 'reject',
          reason: {
            code: 'MAX_EXPOSURE_TOTAL_EXCEEDED',
            message: `总敞口 ${newTotalExposure.toFixed(2)} 超过限制 ${maxExposure.toFixed(2)}`,
            details: {
              currentTotalExposure: currentTotalExposure.toFixed(2),
              orderExposure: orderExposure.toFixed(2),
              newTotalExposure: newTotalExposure.toFixed(2),
              maxExposure: maxExposure.toFixed(2),
            },
          },
          ruleId: this.id,
          severity: 'critical',
        };
      }
    }
    
    // 4. 检查杠杆率
    const currentTotalExposure = this.getTotalExposure(ctx);
    const newTotalExposure = currentTotalExposure.plus(orderExposure);
    const equity = new Big(ctx.portfolio.equity);
    
    if (equity.lte(0)) {
      return {
        decision: 'reject',
        reason: {
          code: 'ZERO_EQUITY',
          message: `账户权益为零或负数，无法开仓`,
        },
        ruleId: this.id,
        severity: 'critical',
      };
    }
    
    const newLeverage = newTotalExposure.div(equity).toNumber();
    
    if (newLeverage > this.params.maxLeverage) {
      return {
        decision: 'reject',
        reason: {
          code: 'MAX_LEVERAGE_EXCEEDED',
          message: `杠杆率 ${newLeverage.toFixed(2)}x 超过限制 ${this.params.maxLeverage}x`,
          details: {
            newLeverage: newLeverage.toFixed(2),
            maxLeverage: this.params.maxLeverage,
            totalExposure: newTotalExposure.toFixed(2),
            equity: equity.toFixed(2),
          },
        },
        ruleId: this.id,
        severity: 'critical',
      };
    }
    
    return null; // 通过
  }

  /**
   * 计算订单敞口
   */
  private calculateOrderExposure(ctx: RiskRuleContext): Big {
    const qty = new Big(ctx.currentIntent.quantity);
    
    if (ctx.currentIntent.price) {
      const price = new Big(ctx.currentIntent.price);
      return qty.times(price);
    }
    
    // 如果没有价格，使用市价估算（从市场快照或持仓）
    if (ctx.marketSnapshot && ctx.marketSnapshot.symbol === ctx.currentIntent.symbol) {
      const price = new Big(ctx.marketSnapshot.close);
      return qty.times(price);
    }
    
    // 从现有持仓估算
    const position = ctx.portfolio.positions[ctx.currentIntent.symbol];
    if (position) {
      const price = new Big(position.avgEntryPrice);
      return qty.times(price);
    }
    
    // 无法估算，返回 0（保守处理）
    return new Big(0);
  }

  /**
   * 获取特定标的的当前敞口
   */
  private getSymbolExposure(ctx: RiskRuleContext, symbol: string): Big {
    const position = ctx.portfolio.positions[symbol];
    if (!position) {
      return new Big(0);
    }
    
    const qty = new Big(position.quantity);
    const price = new Big(position.avgEntryPrice);
    return qty.times(price).abs();
  }

  /**
   * 获取总敞口
   */
  private getTotalExposure(ctx: RiskRuleContext): Big {
    let totalExposure = new Big(0);
    
    for (const symbol of Object.keys(ctx.portfolio.positions)) {
      const exposure = this.getSymbolExposure(ctx, symbol);
      totalExposure = totalExposure.plus(exposure);
    }
    
    return totalExposure;
  }
}

