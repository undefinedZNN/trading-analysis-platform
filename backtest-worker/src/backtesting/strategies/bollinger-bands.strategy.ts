/**
 * 布林带策略
 * 
 * 策略逻辑:
 * - 当价格触及下轨时买入（价格超卖）
 * - 当价格触及上轨时卖出（价格超买）
 * - 当价格突破上轨时，可以追涨（突破策略变体）
 * 
 * 布林带由三条线组成：
 * - 中轨：n日移动平均线
 * - 上轨：中轨 + k * 标准差
 * - 下轨：中轨 - k * 标准差
 */

import Big from 'big.js';

/**
 * 策略参数定义
 */
export const parameters = {
  period: {
    type: 'integer' as const,
    default: 20,
    min: 5,
    max: 100,
    description: '布林带周期',
  },
  stdDev: {
    type: 'number' as const,
    default: 2.0,
    min: 1.0,
    max: 3.0,
    description: '标准差倍数',
  },
  positionSize: {
    type: 'number' as const,
    default: 0.4,
    min: 0.1,
    max: 1.0,
    description: '仓位大小（占总资金比例）',
  },
  strategy: {
    type: 'enum' as const,
    default: 'mean_reversion',
    options: ['mean_reversion', 'breakout'],
    description: '策略类型：均值回归 or 突破',
  },
  stopLossPercent: {
    type: 'number' as const,
    default: 0.03,
    min: 0.01,
    max: 0.1,
    description: '止损百分比',
  },
};

/**
 * 策略依赖的特征
 */
export const features = [
  {
    id: 'Bollinger',
    label: 'bollinger',
    params: { period: 20, stdDev: 2.0 },
  },
];

/**
 * 策略状态
 */
interface StrategyState {
  position: 'none' | 'long';
  entryPrice: string | null;
  stopLossPrice: string | null;
  entryReason: string | null;
}

/**
 * 布林带策略类
 */
export class BollingerBandsStrategy {
  private state: StrategyState;
  private params: any;
  private context: any;

  constructor(params: any, context: any) {
    this.params = params;
    this.context = context;
    this.state = {
      position: 'none',
      entryPrice: null,
      stopLossPrice: null,
      entryReason: null,
    };

    this.context.log('info', 'Bollinger Bands Strategy initialized', {
      period: params.period,
      stdDev: params.stdDev,
      positionSize: params.positionSize,
      strategy: params.strategy,
      stopLoss: params.stopLossPercent,
    });
  }

  /**
   * 策略初始化
   */
  onInit(): void {
    this.context.log('info', 'Strategy started');
  }

  /**
   * 处理每个bar
   */
  onBar(bar: any): void {
    const close = new Big(bar.close);
    const bollinger = bar.features?.bollinger;

    // 检查特征是否可用
    if (!bollinger || !bollinger.upper || !bollinger.middle || !bollinger.lower) {
      return;
    }

    const upper = new Big(bollinger.upper);
    const middle = new Big(bollinger.middle);
    const lower = new Big(bollinger.lower);
    const bandwidth = upper.minus(lower).div(middle).times(100);

    // 计算价格相对位置
    const percentB = close.minus(lower).div(upper.minus(lower));

    // 记录指标
    this.context.metrics('bollinger_metrics', {
      price: close.toFixed(2),
      upper: upper.toFixed(2),
      middle: middle.toFixed(2),
      lower: lower.toFixed(2),
      bandwidth: bandwidth.toFixed(2),
      percentB: percentB.toFixed(4),
      position: this.state.position,
    });

    // 检查止损
    if (this.state.position === 'long') {
      this.checkStopLoss(bar, close);
    }

    // 生成交易信号
    if (this.params.strategy === 'mean_reversion') {
      this.handleMeanReversionStrategy(bar, close, lower, upper, percentB);
    } else {
      this.handleBreakoutStrategy(bar, close, upper, lower, percentB);
    }
  }

  /**
   * 均值回归策略
   */
  private handleMeanReversionStrategy(
    bar: any,
    close: Big,
    lower: Big,
    upper: Big,
    percentB: Big
  ): void {
    // 触及下轨（超卖）：买入
    if (this.state.position === 'none' && close.lte(lower)) {
      this.generateBuySignal(bar, close, percentB, 'touched_lower_band');
    }
    // 触及上轨（超买）：卖出
    else if (this.state.position === 'long' && close.gte(upper)) {
      this.generateSellSignal(bar, close, percentB, 'touched_upper_band');
    }
  }

  /**
   * 突破策略
   */
  private handleBreakoutStrategy(
    bar: any,
    close: Big,
    upper: Big,
    lower: Big,
    percentB: Big
  ): void {
    // 突破上轨：买入（追涨）
    if (this.state.position === 'none' && close.gt(upper)) {
      this.generateBuySignal(bar, close, percentB, 'breakout_upper');
    }
    // 跌破下轨：卖出（止损或反转）
    else if (this.state.position === 'long' && close.lt(lower)) {
      this.generateSellSignal(bar, close, percentB, 'breakdown_lower');
    }
  }

  /**
   * 检查止损
   */
  private checkStopLoss(bar: any, currentPrice: Big): void {
    if (!this.state.stopLossPrice) {
      return;
    }

    const stopLoss = new Big(this.state.stopLossPrice);

    if (currentPrice.lte(stopLoss)) {
      this.context.log('warning', 'Stop Loss Triggered', {
        currentPrice: currentPrice.toFixed(2),
        stopLossPrice: this.state.stopLossPrice,
        entryPrice: this.state.entryPrice,
      });

      const tradePlan = {
        entryPrice: this.state.entryPrice ?? undefined,
        exitPrice: currentPrice.toFixed(6),
        stopPrice: this.state.stopLossPrice ?? undefined,
        barTimestamp: bar.timestamp,
      };

      this.context.publishIntent({
        type: 'market',
        side: 'sell',
        quantity: 'all',
        reason: 'stop_loss',
        metadata: {
          tradePlan,
        },
      });

      this.resetPosition();
    }
  }

  /**
   * 生成买入信号
   */
  private generateBuySignal(bar: any, price: Big, percentB: Big, reason: string): void {
    const equity = this.context.getEquity();
    const positionValue = new Big(equity).times(this.params.positionSize);
    const quantity = positionValue.div(price);
    const stopLoss = price.times(1 - this.params.stopLossPercent);
    const tradePlan = {
      entryPrice: price.toFixed(6),
      stopPrice: stopLoss.toFixed(6),
      barTimestamp: bar.timestamp,
    };

    this.context.log('info', 'Bollinger Buy Signal', {
      reason,
      price: price.toFixed(2),
      percentB: percentB.toFixed(4),
      quantity: quantity.toFixed(8),
      stopLoss: stopLoss.toFixed(2),
    });

    this.context.publishIntent({
      type: 'market',
      side: 'buy',
      quantity: quantity.toFixed(8),
      reason,
      metadata: {
        tradePlan,
      },
    });

    this.state.position = 'long';
    this.state.entryPrice = price.toFixed(2);
    this.state.stopLossPrice = stopLoss.toFixed(2);
    this.state.entryReason = reason;
  }

  /**
   * 生成卖出信号
   */
  private generateSellSignal(bar: any, price: Big, percentB: Big, reason: string): void {
    if (!this.state.entryPrice) {
      return;
    }

    const entryPrice = new Big(this.state.entryPrice);
    const pnl = price.minus(entryPrice).div(entryPrice).times(100);
    const tradePlan = {
      entryPrice: this.state.entryPrice ?? undefined,
      exitPrice: price.toFixed(6),
      stopPrice: this.state.stopLossPrice ?? undefined,
      barTimestamp: bar.timestamp,
    };

    this.context.log('info', 'Bollinger Sell Signal', {
      reason,
      entryReason: this.state.entryReason,
      entryPrice: this.state.entryPrice,
      exitPrice: price.toFixed(2),
      percentB: percentB.toFixed(4),
      pnl: pnl.toFixed(2) + '%',
    });

    this.context.publishIntent({
      type: 'market',
      side: 'sell',
      quantity: 'all',
      reason,
      metadata: {
        tradePlan,
      },
    });

    this.resetPosition();
  }

  /**
   * 重置持仓状态
   */
  private resetPosition(): void {
    this.state.position = 'none';
    this.state.entryPrice = null;
    this.state.stopLossPrice = null;
    this.state.entryReason = null;
  }

  /**
   * 创建快照
   */
  onSnapshot(): any {
    return { ...this.state };
  }

  /**
   * 恢复快照
   */
  onRestore(snapshot: any): void {
    this.state = snapshot;
    this.context.log('info', 'Strategy restored from snapshot', snapshot);
  }
}

/**
 * 策略导出
 */
export default {
  name: 'Bollinger Bands',
  version: '1.0.0',
  description: '布林带策略 - 均值回归或突破',
  parameters,
  features,
  Strategy: BollingerBandsStrategy,
};
