/**
 * 三连K动量策略
 *
 * 策略逻辑：
 * - 观察最近若干根K线（默认3根），若全部为阳线则认定为持续动量
 * - 在最后一根K线收盘价买入
 * - 止损放在第一根K线的极值（最低价），并按照1R的距离设置止盈
 *
 * 该策略适合在震荡中寻找短线动量爆发，提供比双均线更多的入场机会
 */

import Big from 'big.js';

export const parameters = {
  consecutiveBars: {
    type: 'integer' as const,
    default: 3,
    min: 2,
    max: 6,
    description: '触发信号所需的同向K线数量',
  },
  takeProfitMultiple: {
    type: 'number' as const,
    default: 1,
    min: 0.5,
    max: 3,
    description: '目标盈利倍数（以R为单位）',
  },
  positionSize: {
    type: 'number' as const,
    default: 0.5,
    min: 0.1,
    max: 1.0,
    description: '仓位大小（占用权益百分比）',
  },
  stopBufferPercent: {
    type: 'number' as const,
    default: 0,
    min: 0,
    max: 0.02,
    description: '止损缓冲（相对入场价百分比，可选）',
  },
};

export const features: any[] = [];

type CandleDirection = 'bullish' | 'bearish' | 'neutral';

interface CandleSnapshot {
  timestamp: string;
  direction: CandleDirection;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ActiveTrade {
  entryPrice: string;
  stopPrice: string;
  targetPrice: string;
  riskPerUnit: string;
  entryTimestamp: string;
}

interface StrategyState {
  position: 'none' | 'long';
  recentBars: CandleSnapshot[];
  activeTrade: ActiveTrade | null;
}

export class ThreeLineMomentumStrategy {
  private state: StrategyState;
  private params: any;
  private context: any;

  constructor(params: any, context: any) {
    this.params = params;
    this.context = context;
    this.state = {
      position: 'none',
      recentBars: [],
      activeTrade: null,
    };

    this.context.log('info', 'Three Line Momentum Strategy initialized', {
      consecutiveBars: params.consecutiveBars,
      takeProfitMultiple: params.takeProfitMultiple,
      positionSize: params.positionSize,
      stopBufferPercent: params.stopBufferPercent,
    });
  }

  onInit(): void {
    this.context.log('info', 'Strategy started');
  }

  onBar(bar: any): void {
    this.handleActiveTrade(bar);

    const candle = this.toSnapshot(bar);
    this.state.recentBars.push(candle);
    this.trimRecentBars();

    this.context.metrics('three_line_momentum_bar', {
      direction: candle.direction,
      close: bar.close,
      position: this.state.position,
      activeTrade: this.state.activeTrade,
    });

    if (this.state.position === 'none') {
      this.tryOpenPosition(bar);
    }
  }

  private handleActiveTrade(bar: any): void {
    if (!this.state.activeTrade) {
      return;
    }

    const high = new Big(bar.high);
    const low = new Big(bar.low);
    const close = new Big(bar.close);
    const target = new Big(this.state.activeTrade.targetPrice);
    const stop = new Big(this.state.activeTrade.stopPrice);

    const hitStop = low.lte(stop);
    const hitTarget = high.gte(target);

    if (!hitStop && !hitTarget) {
      return;
    }

    const reason = hitStop ? 'stop_loss' : 'take_profit';
    const referencePrice = hitStop ? stop : target;

    this.context.log(hitStop ? 'warn' : 'info', 'Three Line Momentum exit', {
      reason,
      referencePrice: referencePrice.toFixed(4),
      close: close.toFixed(4),
      entryPrice: this.state.activeTrade.entryPrice,
      targetPrice: this.state.activeTrade.targetPrice,
      stopPrice: this.state.activeTrade.stopPrice,
    });

    const tradePlan = {
      entryPrice: this.state.activeTrade.entryPrice,
      exitPrice: referencePrice.toFixed(6),
      stopPrice: this.state.activeTrade.stopPrice,
      targetPrice: this.state.activeTrade.targetPrice,
      barTimestamp: bar.timestamp,
    };

    this.context.publishIntent({
      type: 'market',
      side: 'sell',
      quantity: 'all',
      reason,
      metadata: {
        tradePlan,
      },
    });

    this.state.position = 'none';
    this.state.activeTrade = null;
  }

  private tryOpenPosition(bar: any): void {
    const required = Math.max(2, Number(this.params.consecutiveBars ?? 3));
    if (this.state.recentBars.length < required) {
      return;
    }

    const sequence = this.state.recentBars.slice(-required);
    const isBullishSequence = sequence.every((item) => item.direction === 'bullish');
    if (!isBullishSequence) {
      return;
    }

    const firstBar = sequence[0];
    const entryPrice = new Big(bar.close);
    const baseStop = new Big(firstBar.low);
    const bufferPercent = Math.max(0, Number(this.params.stopBufferPercent ?? 0));
    const bufferedStop = bufferPercent > 0 ? baseStop.minus(entryPrice.times(bufferPercent)) : baseStop;
    const stopPrice = bufferedStop.gt(0) ? bufferedStop : baseStop;
    const riskPerUnit = entryPrice.minus(stopPrice);
    if (riskPerUnit.lte(0)) {
      return;
    }

    const targetPrice = entryPrice.plus(riskPerUnit.times(Number(this.params.takeProfitMultiple ?? 1)));
    const equity = new Big(this.context.getEquity() ?? '0');
    const positionFraction = Math.min(Math.max(Number(this.params.positionSize ?? 0.5), 0), 1);
    if (positionFraction <= 0) {
      return;
    }

    const positionValue = equity.times(positionFraction);
    if (positionValue.lte(0)) {
      return;
    }

    const quantity = positionValue.div(entryPrice);
    if (quantity.lte(0)) {
      return;
    }

    this.context.log('info', 'Three Line Momentum entry', {
      entryPrice: entryPrice.toFixed(4),
      stopPrice: stopPrice.toFixed(4),
      targetPrice: targetPrice.toFixed(4),
      quantity: quantity.toFixed(8),
      sequenceStartsAt: firstBar.timestamp,
    });

    const tradePlan = {
      entryPrice: entryPrice.toFixed(6),
      stopPrice: stopPrice.toFixed(6),
      targetPrice: targetPrice.toFixed(6),
      barTimestamp: bar.timestamp,
    };

    this.context.publishIntent({
      type: 'market',
      side: 'buy',
      quantity: quantity.toFixed(8),
      reason: 'three_line_momentum_entry',
      metadata: {
        tradePlan,
      },
    });

    this.state.position = 'long';
    this.state.activeTrade = {
      entryPrice: entryPrice.toFixed(6),
      stopPrice: stopPrice.toFixed(6),
      targetPrice: targetPrice.toFixed(6),
      riskPerUnit: riskPerUnit.toFixed(6),
      entryTimestamp: bar.timestamp,
    };
  }

  private trimRecentBars(): void {
    const limit = Math.max(5, Number(this.params.consecutiveBars ?? 3) + 2);
    while (this.state.recentBars.length > limit) {
      this.state.recentBars.shift();
    }
  }

  private toSnapshot(bar: any): CandleSnapshot {
    return {
      timestamp: bar.timestamp,
      direction: this.getDirection(bar),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
    };
  }

  private getDirection(bar: any): CandleDirection {
    const open = new Big(bar.open);
    const close = new Big(bar.close);
    if (close.gt(open)) {
      return 'bullish';
    }
    if (close.lt(open)) {
      return 'bearish';
    }
    return 'neutral';
  }

  onSnapshot(): any {
    return JSON.parse(JSON.stringify(this.state));
  }

  onRestore(snapshot: any): void {
    this.state = snapshot;
    this.context.log('info', 'Strategy restored from snapshot', snapshot);
  }
}

export default {
  name: 'Three Line Momentum',
  version: '1.0.0',
  description: '三连K动量策略 - 三根同方向K线后入场，以第一根K线极值为止损、1R为止盈',
  parameters,
  features,
  Strategy: ThreeLineMomentumStrategy,
};
