/**
 * StopLoss Rule - 止损规则
 * 
 * 基于最大回撤触发止损：
 * - 拒绝新订单
 * - 或强制平仓
 * 
 * @module risk/rules/stop-loss
 */

import Big from 'big.js';
import { RiskRule, RiskRuleContext, RiskDecisionResult, RiskRuleConfig } from '../interfaces';

/**
 * StopLoss 规则配置
 */
export interface StopLossParams extends RiskRuleConfig {
  /** 最大回撤百分比（0.1 表示 10%） */
  maxDrawdownPct: number;
  
  /** 是否强制平仓 */
  forceClose: boolean;
  
  /** 宽限期（bar数，可选） */
  graceBars?: number;
}

/**
 * 止损规则
 */
export class StopLossRule implements RiskRule {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  enabled: boolean;
  
  private graceCounter: number = 0;

  constructor(private params: StopLossParams) {
    this.id = params.id || 'StopLossRule';
    this.name = params.name || '止损规则';
    this.priority = params.priority ?? 40;
    this.enabled = params.enabled ?? true;
  }

  evaluate(ctx: RiskRuleContext): RiskDecisionResult | null {
    const maxDrawdown = new Big(ctx.historicalStats.maxDrawdown);
    const equity = new Big(ctx.portfolio.equity);
    
    // 计算回撤阈值
    const threshold = equity.times(this.params.maxDrawdownPct);
    
    // 检查回撤是否超限（maxDrawdown 为负数）
    if (maxDrawdown.abs().gt(threshold)) {
      // 如果设置了宽限期
      if (this.params.graceBars && this.params.graceBars > 0) {
        this.graceCounter++;
        
        if (this.graceCounter < this.params.graceBars) {
          // 还在宽限期内，仅警告
          return {
            decision: 'reject',
            reason: {
              code: 'STOP_LOSS_GRACE_PERIOD',
              message: `回撤超限，宽限期 ${this.graceCounter}/${this.params.graceBars}`,
              details: {
                maxDrawdown: maxDrawdown.toFixed(2),
                threshold: threshold.toFixed(2),
                graceCounter: this.graceCounter,
                graceBars: this.params.graceBars,
              },
            },
            ruleId: this.id,
            severity: 'warning',
          };
        }
      }
      
      // 超过宽限期或无宽限期
      if (this.params.forceClose) {
        // 强制平仓模式
        return {
          decision: 'halt',
          reason: {
            code: 'STOP_LOSS_TRIGGERED',
            message: `回撤 ${maxDrawdown.toFixed(2)} 超过阈值 ${threshold.toFixed(2)}，触发强制平仓`,
            details: {
              maxDrawdown: maxDrawdown.toFixed(2),
              threshold: threshold.toFixed(2),
              maxDrawdownPct: this.params.maxDrawdownPct,
              equity: equity.toFixed(2),
            },
          },
          followUp: [{
            type: 'force-close',
            payload: { 
              symbol: ctx.currentIntent.symbol,
              reason: 'stop_loss_triggered',
            },
          }],
          ruleId: this.id,
          severity: 'critical',
        };
      } else {
        // 仅拒绝新订单
        return {
          decision: 'reject',
          reason: {
            code: 'STOP_LOSS_TRIGGERED',
            message: `回撤超限，拒绝新订单`,
            details: {
              maxDrawdown: maxDrawdown.toFixed(2),
              threshold: threshold.toFixed(2),
              maxDrawdownPct: this.params.maxDrawdownPct,
            },
          },
          ruleId: this.id,
          severity: 'warning',
        };
      }
    } else {
      // 未超限，重置宽限计数器
      this.graceCounter = 0;
    }
    
    return null; // 通过
  }
}

