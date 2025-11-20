import Big from 'big.js';

export const parameters = {
  positionSize: {
    type: 'number' as const,
    default: 0.5,
    min: 0.1,
    max: 1,
    description: '仓位大小（占用权益百分比）',
  },
  shadowGapRatio: {
    type: 'number' as const,
    default: 0,
    min: 0,
    max: 100,
    description: '影线缺口阈值 (%，相对三根K线总波幅)',
  },
  atrRatioTolerance: {
    type: 'number' as const,
    default: 25,
    min: 0,
    max: 1000,
    description: '平均波幅与 ATR 的允许误差 (% )',
  },
  dmiPeriod: {
    type: 'integer' as const,
    default: 14,
    min: 5,
    max: 50,
    description: 'DMI 指标周期',
  },
};

export const features: any[] = [];

interface CandleSnapshot {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

type TrendDirection = 'bullish' | 'bearish';

interface DmiResult {
  plusDI: number;
  minusDI: number;
  atr: number;
  direction: TrendDirection;
}

interface ActiveTrade {
  entryPrice: string;
  stopPrice: string;
  targetPrice: string;
  entryTimestamp: string;
  side: 'long' | 'short';
}

interface StrategyState {
  position: 'none' | 'long' | 'short';
  recentBars: CandleSnapshot[];
  history: CandleSnapshot[];
  activeTrade: ActiveTrade | null;
}

export class ThreeLineDmiStrategy {
  private state: StrategyState;
  private params: any;
  private context: any;

  constructor(params: any, context: any) {
    this.params = params;
    this.context = context;
    this.state = {
      position: 'none',
      recentBars: [],
      history: [],
      activeTrade: null,
    };

    this.context.log('info', 'Three Line DMI Strategy initialized', {
      positionSize: params.positionSize,
      shadowGapRatio: params.shadowGapRatio,
      atrRatioTolerance: params.atrRatioTolerance,
      dmiPeriod: params.dmiPeriod,
    });
  }

  onInit(): void {
    this.context.log('info', 'Strategy started');
  }

  onBar(bar: any): void {
    this.handleActiveTrade(bar);

    const snapshot = this.toSnapshot(bar);
    this.state.recentBars.push(snapshot);
    this.state.history.push(snapshot);
    this.trimBuffers();

    this.tryEnter(snapshot);
    this.context.setState(this.state);
  }

  private handleActiveTrade(bar: any): void {
    if (!this.state.activeTrade) {
      return;
    }

    const high = Number(bar.high);
    const low = Number(bar.low);
    const target = Number(this.state.activeTrade.targetPrice);
    const stop = Number(this.state.activeTrade.stopPrice);
    const side = this.state.activeTrade.side;

    let hitTarget = false;
    let hitStop = false;

    if (side === 'long') {
      hitTarget = high >= target;
      hitStop = low <= stop;
    } else {
      hitTarget = low <= target;
      hitStop = high >= stop;
    }

    if (!hitTarget && !hitStop) {
      return;
    }

    const reason = hitStop ? 'stop_loss' : 'take_profit';
    const exitSide = side === 'long' ? 'sell' : 'buy';
    const exitPrice = hitStop ? stop : target;

    this.context.publishIntent({
      type: 'market',
      side: exitSide,
      quantity: 'all',
      reason,
      metadata: {
        tradePlan: {
          entryPrice: this.state.activeTrade.entryPrice,
          exitPrice: exitPrice.toFixed(6),
          stopPrice: this.state.activeTrade.stopPrice,
          targetPrice: this.state.activeTrade.targetPrice,
          barTimestamp: bar.timestamp,
        },
        positionEffect: side === 'long' ? 'close_long' : 'close_short',
      },
    });

    this.state.position = 'none';
    this.state.activeTrade = null;
  }

  private tryEnter(snapshot: CandleSnapshot): void {
    if (this.state.position !== 'none') {
      return;
    }
    if (this.state.recentBars.length < 3) {
      return;
    }
    const sequence = this.state.recentBars.slice(-3);
    const direction = this.detectSequenceDirection(sequence);
    if (!direction) {
      return;
    }
    if (!this.verifyStructure(sequence, direction)) {
      return;
    }

    const dmi = this.computeDmi();
    if (!dmi || dmi.direction !== direction) {
      return;
    }

    const gapRatio = this.computeShadowGapRatio(sequence, direction);
    if (gapRatio < Number(this.params.shadowGapRatio ?? 0)) {
      return;
    }

    const avgRange = this.averageRange(sequence);
    const atrDeviation = Math.abs(dmi.atr - avgRange) * 100;
    if (atrDeviation > Number(this.params.atrRatioTolerance ?? 25)) {
      return;
    }

    const equity = Number(this.context.getEquity() ?? 0);
    const positionFraction = Math.min(Math.max(Number(this.params.positionSize ?? 0.5), 0), 1);
    if (!Number.isFinite(equity) || equity <= 0 || positionFraction <= 0) {
      return;
    }

    const entryPrice = sequence[2].close;
    const tradePlan = this.buildTradePlan(sequence, direction);
    if (!tradePlan) {
      return;
    }

    const quantity = (equity * positionFraction) / Math.abs(entryPrice);
    if (quantity <= 0) {
      return;
    }

    const customFactors = {
      trendDirection: direction,
      shadowGapRatio: Number(gapRatio.toFixed(4)),
      atrDeviationPercent: Number(atrDeviation.toFixed(4)),
    };

    const side = direction === 'bullish' ? 'buy' : 'sell';
    const positionEffect = direction === 'bullish' ? 'open_long' : 'open_short';

    this.context.publishIntent({
      type: 'market',
      side,
      quantity: quantity.toFixed(8),
      reason: 'three_line_dmi_entry',
      metadata: {
        tradePlan: {
          entryPrice: tradePlan.entryPrice,
          stopPrice: tradePlan.stopPrice,
          targetPrice: tradePlan.targetPrice,
          barTimestamp: snapshot.timestamp,
        },
        customFactors,
        positionEffect,
      },
    });

    this.state.position = direction === 'bullish' ? 'long' : 'short';
    this.state.activeTrade = {
      entryPrice: tradePlan.entryPrice,
      stopPrice: tradePlan.stopPrice,
      targetPrice: tradePlan.targetPrice,
      entryTimestamp: snapshot.timestamp,
      side: this.state.position,
    };
  }

  private buildTradePlan(sequence: CandleSnapshot[], direction: TrendDirection) {
    const entry = new Big(sequence[2].close);
    if (direction === 'bullish') {
      const stop = new Big(sequence[0].low);
      if (entry.lte(stop)) {
        return null;
      }
      const target = entry.plus(entry.minus(stop));
      return {
        entryPrice: entry.toFixed(6),
        stopPrice: stop.toFixed(6),
        targetPrice: target.toFixed(6),
      };
    }
    const stop = new Big(sequence[0].high);
    if (entry.gte(stop)) {
      return null;
    }
    const target = entry.minus(stop.minus(entry));
    return {
      entryPrice: entry.toFixed(6),
      stopPrice: stop.toFixed(6),
      targetPrice: target.toFixed(6),
    };
  }

  private detectSequenceDirection(sequence: CandleSnapshot[]): TrendDirection | null {
    const bullish = sequence.every((bar) => bar.close > bar.open);
    const bearish = sequence.every((bar) => bar.close < bar.open);
    if (bullish) {
      return 'bullish';
    }
    if (bearish) {
      return 'bearish';
    }
    return null;
  }

  private verifyStructure(sequence: CandleSnapshot[], direction: TrendDirection): boolean {
    for (let i = 1; i < sequence.length; i += 1) {
      if (direction === 'bullish') {
        if (sequence[i].high <= sequence[i - 1].high) {
          return false;
        }
        if (sequence[i].low <= sequence[i - 1].low) {
          return false;
        }
      } else {
        if (sequence[i].high >= sequence[i - 1].high) {
          return false;
        }
        if (sequence[i].low >= sequence[i - 1].low) {
          return false;
        }
      }
    }
    return true;
  }

  private computeShadowGapRatio(sequence: CandleSnapshot[], direction: TrendDirection): number {
    const totalRange = sequence.reduce((sum, bar) => sum + (bar.high - bar.low), 0);
    if (totalRange <= 0) {
      return 0;
    }
    let gap = 0;
    if (direction === 'bullish') {
      gap = sequence[2].low - sequence[0].high;
    } else {
      gap = sequence[0].low - sequence[2].high;
    }
    if (gap <= 0) {
      return 0;
    }
    return (gap / totalRange) * 100;
  }

  private averageRange(sequence: CandleSnapshot[]): number {
    const total = sequence.reduce((sum, bar) => sum + (bar.high - bar.low), 0);
    return total / sequence.length;
  }

  private computeDmi(): DmiResult | null {
    const period = Math.max(5, Number(this.params.dmiPeriod ?? 14));
    if (this.state.history.length < period + 1) {
      return null;
    }
    const bars = this.state.history;
    const start = bars.length - period;
    let plusDM = 0;
    let minusDM = 0;
    let trSum = 0;

    for (let i = start + 1; i < bars.length; i += 1) {
      const curr = bars[i];
      const prev = bars[i - 1];
      const upMove = curr.high - prev.high;
      const downMove = prev.low - curr.low;
      plusDM += upMove > 0 && upMove > downMove ? upMove : 0;
      minusDM += downMove > 0 && downMove > upMove ? downMove : 0;
      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close),
      );
      trSum += tr;
    }

    if (trSum <= 0) {
      return null;
    }

    const plusDI = (plusDM / trSum) * 100;
    const minusDI = (minusDM / trSum) * 100;
    return {
      plusDI,
      minusDI,
      atr: trSum / period,
      direction: plusDI >= minusDI ? 'bullish' : 'bearish',
    };
  }

  private trimBuffers(): void {
    const shortBuffer = 10;
    const longBuffer = 300;
    while (this.state.recentBars.length > shortBuffer) {
      this.state.recentBars.shift();
    }
    while (this.state.history.length > longBuffer) {
      this.state.history.shift();
    }
  }

  private toSnapshot(bar: any): CandleSnapshot {
    return {
      timestamp: bar.timestamp,
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
    };
  }
}
