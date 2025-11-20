/**
 * 双均线交叉策略
 * 
 * 策略逻辑:
 * - 当快速均线上穿慢速均线时，产生买入信号
 * - 当快速均线下穿慢速均线时，产生卖出信号
 * 
 * 这是最经典的趋势跟踪策略之一
 */

import Big from 'big.js';

/**
 * 策略参数定义
 */
export const parameters = {
  fastPeriod: {
    type: 'integer' as const,
    default: 10,
    min: 2,
    max: 100,
    description: '快速均线周期',
  },
  slowPeriod: {
    type: 'integer' as const,
    default: 30,
    min: 5,
    max: 200,
    description: '慢速均线周期',
  },
  positionSize: {
    type: 'number' as const,
    default: 0.5,
    min: 0.1,
    max: 1.0,
    description: '仓位大小（占总资金比例）',
  },
};

/**
 * 策略依赖的特征
 */
export const features = [
  {
    id: 'MA',
    label: 'fast_ma',
    params: { period: 10 }, // 将被参数覆盖
  },
  {
    id: 'MA',
    label: 'slow_ma',
    params: { period: 30 }, // 将被参数覆盖
  },
];

/**
 * 策略状态
 */
interface StrategyState {
  position: 'none' | 'long' | 'short';
  entryPrice: string | null;
  lastFastMA: string | null;
  lastSlowMA: string | null;
  crossoverType: 'none' | 'golden' | 'death'; // golden=金叉, death=死叉
}

/**
 * 策略类
 */
export class MACrossStrategy {
  private state: StrategyState;
  private params: any;
  private context: any;

  constructor(params: any, context: any) {
    this.params = params;
    this.context = context;
    this.state = {
      position: 'none',
      entryPrice: null,
      lastFastMA: null,
      lastSlowMA: null,
      crossoverType: 'none',
    };

    this.context.log('info', 'MA Cross Strategy initialized', {
      fastPeriod: params.fastPeriod,
      slowPeriod: params.slowPeriod,
      positionSize: params.positionSize,
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
    const fastMA = bar.features?.fast_ma;
    const slowMA = bar.features?.slow_ma;

    // 检查特征是否可用
    if (!fastMA || !slowMA) {
      return;
    }

    const fastMABig = new Big(fastMA);
    const slowMABig = new Big(slowMA);

    // 检测交叉
    const crossover = this.detectCrossover(fastMABig, slowMABig);

    // 记录指标
    this.context.metrics('ma_cross', {
      fast_ma: fastMA,
      slow_ma: slowMA,
      crossover: crossover,
      position: this.state.position,
    });

    // 生成交易信号
    if (crossover === 'golden' && this.state.position !== 'long') {
      // 金叉：买入
      this.generateBuySignal(bar, close);
    } else if (crossover === 'death' && this.state.position === 'long') {
      // 死叉：卖出
      this.generateSellSignal(bar, close);
    }

    // 更新状态
    this.state.lastFastMA = fastMA;
    this.state.lastSlowMA = slowMA;
  }

  /**
   * 检测均线交叉
   */
  private detectCrossover(fastMA: Big, slowMA: Big): 'golden' | 'death' | 'none' {
    if (!this.state.lastFastMA || !this.state.lastSlowMA) {
      return 'none';
    }

    const lastFast = new Big(this.state.lastFastMA);
    const lastSlow = new Big(this.state.lastSlowMA);

    // 金叉：快线从下方穿越慢线
    if (lastFast.lte(lastSlow) && fastMA.gt(slowMA)) {
      return 'golden';
    }

    // 死叉：快线从上方穿越慢线
    if (lastFast.gte(lastSlow) && fastMA.lt(slowMA)) {
      return 'death';
    }

    return 'none';
  }

  /**
   * 生成买入信号
   */
  private generateBuySignal(bar: any, price: Big): void {
    const equity = this.context.getEquity();
    const positionValue = new Big(equity).times(this.params.positionSize);
    const quantity = positionValue.div(price);
    const entryPrice = price.toFixed(6);

    this.context.log('debug', 'Golden Cross - Buy Signal', {
      price: price.toFixed(2),
      quantity: quantity.toFixed(8),
      fast_ma: this.state.lastFastMA,
      slow_ma: this.state.lastSlowMA,
    });

    this.context.publishIntent({
      type: 'market',
      side: 'buy',
      quantity: quantity.toFixed(8),
      reason: 'golden_cross',
      metadata: {
        tradePlan: {
          entryPrice,
          barTimestamp: bar.timestamp,
        },
      },
    });

    this.state.position = 'long';
    this.state.entryPrice = price.toFixed(2);
  }

  /**
   * 生成卖出信号
   */
  private generateSellSignal(bar: any, price: Big): void {
    if (!this.state.entryPrice) {
      return;
    }

    const entryPrice = new Big(this.state.entryPrice);
    const pnl = price.minus(entryPrice).div(entryPrice).times(100);
    const exitPrice = price.toFixed(6);

    this.context.log('debug', 'Death Cross - Sell Signal', {
      entryPrice: this.state.entryPrice,
      exitPrice: price.toFixed(2),
      pnl: pnl.toFixed(2) + '%',
    });

    this.context.publishIntent({
      type: 'market',
      side: 'sell',
      quantity: 'all', // 全部卖出
      reason: 'death_cross',
      metadata: {
        tradePlan: {
          entryPrice: this.state.entryPrice,
          exitPrice,
          barTimestamp: bar.timestamp,
        },
      },
    });

    this.state.position = 'none';
    this.state.entryPrice = null;
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
  name: 'MA Cross',
  version: '1.0.0',
  description: '双均线交叉策略 - 经典趋势跟踪',
  parameters,
  features,
  Strategy: MACrossStrategy,
};
