/**
 * PnLDailyLimit Rule - 日内盈亏限制规则
 * 
 * 限制：
 * - 日内最大亏损
 * - 日内盈利锁定
 * 
 * @module risk/rules/pnl-daily-limit
 */

import Big from 'big.js';
import { RiskRule, RiskRuleContext, RiskDecisionResult, RiskRuleConfig } from '../interfaces';

/**
 * PnLDailyLimit 规则配置
 */
export interface PnLDailyLimitParams extends RiskRuleConfig {
  /** 日内亏损限制（负数） */
  dailyLossLimit: string;
  
  /** 日内盈利锁定（正数，可选） */
  dailyProfitLock?: string;
  
  /** 重置时间（如 "00:00:00Z"，可选） */
  resetAt?: string;
}

/**
 * 日内盈亏限制规则
 */
export class PnLDailyLimitRule implements RiskRule {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  enabled: boolean;

  constructor(private params: PnLDailyLimitParams) {
    this.id = params.id || 'PnLDailyLimitRule';
    this.name = params.name || '日内盈亏限制';
    this.priority = params.priority ?? 30;
    this.enabled = params.enabled ?? true;
  }

  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null {
    const pnlToday = new Big(ctx.historicalStats.pnlToday);
    
    // 1. 检查亏损限制
    const lossLimit = new Big(this.params.dailyLossLimit);
    
    if (pnlToday.lt(lossLimit)) {
      return {
        decision: 'halt',
        reason: {
          code: 'DAILY_LOSS_LIMIT_REACHED',
          message: `日内亏损 ${pnlToday.toFixed(2)} 达到限制 ${lossLimit.toFixed(2)}`,
          details: {
            pnlToday: pnlToday.toFixed(2),
            lossLimit: lossLimit.toFixed(2),
            lastResetAt: ctx.historicalStats.lastResetAt,
          },
        },
        followUp: [{
          type: 'halt-strategy',
          payload: { 
            reason: 'daily_loss_limit',
            pnlToday: pnlToday.toFixed(2),
          },
        }],
        ruleId: this.id,
        severity: 'critical',
      };
    }
    
    // 2. 检查盈利锁定（可选）
    if (this.params.dailyProfitLock) {
      const profitLock = new Big(this.params.dailyProfitLock);
      
      if (pnlToday.gt(profitLock)) {
        return {
          decision: 'reject',
          reason: {
            code: 'DAILY_PROFIT_LOCKED',
            message: `日内盈利 ${pnlToday.toFixed(2)} 已达目标 ${profitLock.toFixed(2)}，锁定利润`,
            details: {
              pnlToday: pnlToday.toFixed(2),
              profitLock: profitLock.toFixed(2),
              lastResetAt: ctx.historicalStats.lastResetAt,
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

