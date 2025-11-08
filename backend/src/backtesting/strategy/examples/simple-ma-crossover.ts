/**
 * 简单均线交叉策略示例
 * 
 * 策略逻辑：
 * - 当短期均线上穿长期均线时买入
 * - 当短期均线下穿长期均线时卖出
 */

import type {
  StrategyLifecycle,
  StrategyContext,
  MarketBarPayload,
} from '../interfaces';
import { defineParameters } from '../utils';

// 定义策略参数
export const parameters = defineParameters({
  shortPeriod: {
    type: 'number',
    title: '短期均线周期',
    default: 10,
    minimum: 2,
    maximum: 50,
    description: 'Short-term moving average period',
  },
  longPeriod: {
    type: 'number',
    title: '长期均线周期',
    default: 30,
    minimum: 10,
    maximum: 200,
    description: 'Long-term moving average period',
  },
  quantity: {
    type: 'number',
    title: '交易数量',
    default: 1,
    minimum: 0.1,
    maximum: 100,
    description: 'Trade quantity',
  },
});

// 策略生命周期实现
const strategy: StrategyLifecycle = {
  onInit(ctx: StrategyContext): void {
    ctx.log('info', 'MA Crossover Strategy initialized', {
      shortPeriod: ctx.getParameter('shortPeriod'),
      longPeriod: ctx.getParameter('longPeriod'),
    });
  },

  onBar(ctx: StrategyContext, bar: MarketBarPayload): void {
    // 获取参数
    const params = ctx.getParameters<{
      shortPeriod: number;
      longPeriod: number;
      quantity: number;
    }>();

    // 获取均线特征
    const shortMA = ctx.getFeature(bar, `MA_${params.shortPeriod}`);
    const longMA = ctx.getFeature(bar, `MA_${params.longPeriod}`);

    if (shortMA === undefined || longMA === undefined) {
      ctx.log('debug', 'Waiting for MA features...');
      return;
    }

    // 获取当前仓位
    const position = ctx.getPosition(bar.symbol);
    const hasPosition = position && parseFloat(position.quantity) > 0;

    // 交叉检测（简化版，实际需要保存上一根bar的MA）
    if (typeof shortMA === 'number' && typeof longMA === 'number') {
      // 上穿：买入信号
      if (shortMA > longMA && !hasPosition) {
        ctx.log('info', '📈 Buy signal: MA crossover', {
          shortMA,
          longMA,
          price: bar.close,
        });

        ctx.publishIntent({
          intentId: `buy_${Date.now()}`,
          strategyId: ctx.strategyId,
          symbol: bar.symbol,
          side: 'buy',
          type: 'market',
          quantity: params.quantity.toString(),
        });

        ctx.metrics.increment('signals.buy');
      }

      // 下穿：卖出信号
      if (shortMA < longMA && hasPosition) {
        ctx.log('info', '📉 Sell signal: MA crossover', {
          shortMA,
          longMA,
          price: bar.close,
        });

        ctx.publishIntent({
          intentId: `sell_${Date.now()}`,
          strategyId: ctx.strategyId,
          symbol: bar.symbol,
          side: 'sell',
          type: 'market',
          quantity: position!.quantity,
        });

        ctx.metrics.increment('signals.sell');
      }
    }

    // 记录指标
    ctx.metrics.gauge('ma.short', shortMA as number);
    ctx.metrics.gauge('ma.long', longMA as number);
  },

  onStop(ctx: StrategyContext, reason: string): void {
    ctx.log('info', `Strategy stopped: ${reason}`);
  },
};

export default strategy;

