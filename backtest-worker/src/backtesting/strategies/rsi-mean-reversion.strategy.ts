/**
 * RSI 均值回归策略
 * 
 * 策略逻辑:
 * - 当RSI低于超卖阈值时买入（价格被低估）
 * - 当RSI高于超买阈值时卖出（价格被高估）
 * - 适合震荡市场，不适合强趋势市场
 */

import Big from 'big.js';

/**
 * 策略参数定义
 */
export const parameters = {
  rsiPeriod: {
    type: 'integer' as const,
    default: 14,
    min: 2,
    max: 50,
    description: 'RSI周期',
  },
  oversoldThreshold: {
    type: 'number' as const,
    default: 30,
    min: 10,
    max: 40,
    description: 'RSI超卖阈值',
  },
  overboughtThreshold: {
    type: 'number' as const,
    default: 70,
    min: 60,
    max: 90,
    description: 'RSI超买阈值',
  },
  positionSize: {
    type: 'number' as const,
    default: 0.3,
    min: 0.1,
    max: 1.0,
    description: '仓位大小（占总资金比例）',
  },
  stopLossPercent: {
    type: 'number' as const,
    default: 0.05,
    min: 0.01,
    max: 0.2,
    description: '止损百分比',
  },
};

/**
 * 策略依赖的特征
 */
export const features = [
  {
    id: 'RSI',
    label: 'rsi',
    params: { period: 14 }, // 将被参数覆盖
  },
];

/**
 * 策略状态
 */
interface StrategyState {
  position: 'none' | 'long';
  entryPrice: string | null;
  entryTime: number | null;
  stopLossPrice: string | null;
  highestPrice: string | null;
}

/**
 * RSI均值回归策略类
 */
export class RSIMeanReversionStrategy {
  private state: StrategyState;
  private params: any;
  private context: any;

  constructor(params: any, context: any) {
    this.params = params;
    this.context = context;
    this.state = {
      position: 'none',
      entryPrice: null,
      entryTime: null,
      stopLossPrice: null,
      highestPrice: null,
    };

    this.context.log('info', 'RSI Mean Reversion Strategy initialized', {
      rsiPeriod: params.rsiPeriod,
      oversold: params.oversoldThreshold,
      overbought: params.overboughtThreshold,
      positionSize: params.positionSize,
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
    const rsi = bar.features?.rsi;

    // 检查特征是否可用
    if (rsi === undefined || rsi === null) {
      return;
    }

    const rsiValue = parseFloat(rsi);

    // 记录指标
    this.context.metrics('rsi_metrics', {
      rsi: rsiValue,
      price: close.toFixed(2),
      position: this.state.position,
    });

    // 检查止损
    if (this.state.position === 'long') {
      this.checkStopLoss(close);
      this.updateTrailingStop(close);
    }

    // 生成交易信号
    if (this.state.position === 'none' && rsiValue < this.params.oversoldThreshold) {
      // RSI超卖：买入
      this.generateBuySignal(bar, close, rsiValue);
    } else if (this.state.position === 'long' && rsiValue > this.params.overboughtThreshold) {
      // RSI超买：卖出
      this.generateSellSignal(bar, close, rsiValue, 'overbought');
    }
  }

  /**
   * 检查止损
   */
  private checkStopLoss(currentPrice: Big): void {
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

      this.context.publishIntent({
        type: 'market',
        side: 'sell',
        quantity: 'all',
        reason: 'stop_loss',
      });

      this.state.position = 'none';
      this.state.entryPrice = null;
      this.state.stopLossPrice = null;
      this.state.highestPrice = null;
    }
  }

  /**
   * 更新移动止损
   */
  private updateTrailingStop(currentPrice: Big): void {
    if (!this.state.highestPrice || !this.state.entryPrice) {
      return;
    }

    const highest = new Big(this.state.highestPrice);
    
    // 更新最高价
    if (currentPrice.gt(highest)) {
      this.state.highestPrice = currentPrice.toFixed(2);
      
      // 计算新的止损价格（从最高点回撤stopLossPercent）
      const newStopLoss = currentPrice.times(1 - this.params.stopLossPercent);
      const entryPrice = new Big(this.state.entryPrice);
      
      // 止损价格不能低于入场价格
      if (newStopLoss.gt(entryPrice)) {
        this.state.stopLossPrice = newStopLoss.toFixed(2);
        
        this.context.log('debug', 'Trailing Stop Updated', {
          highestPrice: this.state.highestPrice,
          stopLossPrice: this.state.stopLossPrice,
        });
      }
    }
  }

  /**
   * 生成买入信号
   */
  private generateBuySignal(bar: any, price: Big, rsi: number): void {
    const equity = this.context.getEquity();
    const positionValue = new Big(equity).times(this.params.positionSize);
    const quantity = positionValue.div(price);

    // 计算止损价格
    const stopLoss = price.times(1 - this.params.stopLossPercent);
    const tradePlan = {
      entryPrice: price.toFixed(6),
      stopPrice: stopLoss.toFixed(6),
      barTimestamp: bar.timestamp,
    };

    this.context.log('info', 'RSI Oversold - Buy Signal', {
      rsi: rsi.toFixed(2),
      price: price.toFixed(2),
      quantity: quantity.toFixed(8),
      stopLoss: stopLoss.toFixed(2),
    });

    this.context.publishIntent({
      type: 'market',
      side: 'buy',
      quantity: quantity.toFixed(8),
      reason: 'rsi_oversold',
      metadata: {
        tradePlan,
      },
    });

    this.state.position = 'long';
    this.state.entryPrice = price.toFixed(2);
    this.state.entryTime = bar.timestamp;
    this.state.stopLossPrice = stopLoss.toFixed(2);
    this.state.highestPrice = price.toFixed(2);
  }

  /**
   * 生成卖出信号
   */
  private generateSellSignal(bar: any, price: Big, rsi: number, reason: string): void {
    if (!this.state.entryPrice) {
      return;
    }

    const entryPrice = new Big(this.state.entryPrice);
    const pnl = price.minus(entryPrice).div(entryPrice).times(100);
    const holdingTime = bar.timestamp - (this.state.entryTime || 0);
    const tradePlan = {
      entryPrice: this.state.entryPrice ?? undefined,
      exitPrice: price.toFixed(6),
      stopPrice: this.state.stopLossPrice ?? undefined,
      barTimestamp: bar.timestamp,
    };

    this.context.log('info', 'RSI Overbought - Sell Signal', {
      rsi: rsi.toFixed(2),
      entryPrice: this.state.entryPrice,
      exitPrice: price.toFixed(2),
      pnl: pnl.toFixed(2) + '%',
      holdingTime: Math.floor(holdingTime / 60000) + ' minutes',
    });

    this.context.publishIntent({
      type: 'market',
      side: 'sell',
      quantity: 'all',
      reason: reason,
      metadata: {
        tradePlan,
      },
    });

    this.state.position = 'none';
    this.state.entryPrice = null;
    this.state.entryTime = null;
    this.state.stopLossPrice = null;
    this.state.highestPrice = null;
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
  name: 'RSI Mean Reversion',
  version: '1.0.0',
  description: 'RSI均值回归策略 - 适合震荡市场',
  parameters,
  features,
  Strategy: RSIMeanReversionStrategy,
};
