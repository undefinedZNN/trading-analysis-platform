// frontend/src/modules/backtesting/templates/defaultStrategyTemplate.ts

/**
 * 默认策略脚本模板
 * 基于后端 StrategySandbox 架构的双均线交叉策略
 */
export const defaultStrategyTemplate = `/**
 * 双均线交叉策略 (Moving Average Crossover Strategy)
 * 
 * 策略说明:
 * - 当短期均线上穿长期均线时，产生买入信号
 * - 当短期均线下穿长期均线时，产生卖出信号
 * 
 * @author 系统默认
 * @version 1.0.0
 */

import type {
  StrategyLifecycle,
  StrategyContext,
  MarketBarPayload,
} from '@/backtesting/strategy/interfaces';
import { defineParameters } from '@/backtesting/strategy/utils';

// ==================== 策略参数定义 ====================
export const parameters = defineParameters({
  shortPeriod: {
    type: 'number',
    title: '短期均线周期',
    default: 10,
    minimum: 2,
    maximum: 50,
    description: '用于计算短期移动平均线的K线数量',
  },
  longPeriod: {
    type: 'number',
    title: '长期均线周期',
    default: 30,
    minimum: 10,
    maximum: 200,
    description: '用于计算长期移动平均线的K线数量',
  },
  quantity: {
    type: 'number',
    title: '交易数量',
    default: 1,
    minimum: 0.1,
    maximum: 100,
    description: '每次交易的数量',
  },
  stopLossPercent: {
    type: 'number',
    title: '止损百分比',
    default: 2.0,
    minimum: 0.5,
    maximum: 10.0,
    description: '触发止损的价格下跌百分比',
  },
  takeProfitPercent: {
    type: 'number',
    title: '止盈百分比',
    default: 5.0,
    minimum: 1.0,
    maximum: 20.0,
    description: '触发止盈的价格上涨百分比',
  },
});

// ==================== 策略状态（私有） ====================
let lastShortMA: number | undefined;
let lastLongMA: number | undefined;
let entryPrice: number | undefined;

// ==================== 策略生命周期实现 ====================

/**
 * 策略初始化
 * 在策略开始运行时调用一次
 */
function onInit(ctx: StrategyContext): void {
  const params = ctx.getParameters<{
    shortPeriod: number;
    longPeriod: number;
    quantity: number;
    stopLossPercent: number;
    takeProfitPercent: number;
  }>();

  ctx.log('info', '双均线交叉策略初始化', {
    shortPeriod: params.shortPeriod,
    longPeriod: params.longPeriod,
    quantity: params.quantity,
    stopLoss: params.stopLossPercent + '%',
    takeProfit: params.takeProfitPercent + '%',
  });

  // 重置状态
  lastShortMA = undefined;
  lastLongMA = undefined;
  entryPrice = undefined;

  ctx.metrics.increment('strategy.init');
}

/**
 * Bar数据处理
 * 在每个Bar数据到来时调用
 */
function onBar(ctx: StrategyContext, bar: MarketBarPayload): void {
  // 获取参数
  const params = ctx.getParameters<{
    shortPeriod: number;
    longPeriod: number;
    quantity: number;
    stopLossPercent: number;
    takeProfitPercent: number;
  }>();

  // 获取均线特征
  const shortMA = ctx.getFeature(bar, \`MA_\${params.shortPeriod}\`);
  const longMA = ctx.getFeature(bar, \`MA_\${params.longPeriod}\`);

  // 等待特征计算完成
  if (shortMA === undefined || longMA === undefined) {
    ctx.log('debug', '等待均线特征计算...', {
      timestamp: bar.timestamp,
      symbol: bar.symbol,
    });
    return;
  }

  // 转换为数字类型
  const currentShortMA = typeof shortMA === 'number' ? shortMA : parseFloat(shortMA as string);
  const currentLongMA = typeof longMA === 'number' ? longMA : parseFloat(longMA as string);
  const currentPrice = parseFloat(bar.close);

  // 获取当前仓位
  const position = ctx.getPosition(bar.symbol);
  const hasPosition = position && parseFloat(position.quantity) > 0;

  // 记录均线指标
  ctx.metrics.gauge('ma.short', currentShortMA, { symbol: bar.symbol });
  ctx.metrics.gauge('ma.long', currentLongMA, { symbol: bar.symbol });

  // 检查止损止盈
  if (hasPosition && entryPrice) {
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

    // 止损
    if (pnlPercent <= -params.stopLossPercent) {
      ctx.log('warn', '🛑 触发止损', {
        entryPrice,
        currentPrice,
        pnl: pnlPercent.toFixed(2) + '%',
      });

      ctx.publishIntent({
        intentId: \`stop_loss_\${Date.now()}\`,
        strategyId: ctx.strategyId,
        symbol: bar.symbol,
        side: 'sell',
        type: 'market',
        quantity: position!.quantity,
      });

      ctx.metrics.increment('signals.stop_loss', 1, { symbol: bar.symbol });
      entryPrice = undefined;
      lastShortMA = currentShortMA;
      lastLongMA = currentLongMA;
      return;
    }

    // 止盈
    if (pnlPercent >= params.takeProfitPercent) {
      ctx.log('success', '🎯 触发止盈', {
        entryPrice,
        currentPrice,
        pnl: pnlPercent.toFixed(2) + '%',
      });

      ctx.publishIntent({
        intentId: \`take_profit_\${Date.now()}\`,
        strategyId: ctx.strategyId,
        symbol: bar.symbol,
        side: 'sell',
        type: 'market',
        quantity: position!.quantity,
      });

      ctx.metrics.increment('signals.take_profit', 1, { symbol: bar.symbol });
      entryPrice = undefined;
      lastShortMA = currentShortMA;
      lastLongMA = currentLongMA;
      return;
    }
  }

  // 交叉检测
  if (lastShortMA !== undefined && lastLongMA !== undefined) {
    // 金叉：短期均线上穿长期均线（买入信号）
    if (lastShortMA <= lastLongMA && currentShortMA > currentLongMA && !hasPosition) {
      ctx.log('info', '📈 金叉买入信号', {
        shortMA: currentShortMA.toFixed(2),
        longMA: currentLongMA.toFixed(2),
        price: currentPrice.toFixed(2),
      });

      ctx.publishIntent({
        intentId: \`buy_\${Date.now()}\`,
        strategyId: ctx.strategyId,
        symbol: bar.symbol,
        side: 'buy',
        type: 'market',
        quantity: params.quantity.toString(),
      });

      ctx.metrics.increment('signals.buy', 1, { symbol: bar.symbol });
      entryPrice = currentPrice;
    }

    // 死叉：短期均线下穿长期均线（卖出信号）
    if (lastShortMA >= lastLongMA && currentShortMA < currentLongMA && hasPosition) {
      ctx.log('info', '📉 死叉卖出信号', {
        shortMA: currentShortMA.toFixed(2),
        longMA: currentLongMA.toFixed(2),
        price: currentPrice.toFixed(2),
      });

      ctx.publishIntent({
        intentId: \`sell_\${Date.now()}\`,
        strategyId: ctx.strategyId,
        symbol: bar.symbol,
        side: 'sell',
        type: 'market',
        quantity: position!.quantity,
      });

      ctx.metrics.increment('signals.sell', 1, { symbol: bar.symbol });
      entryPrice = undefined;
    }
  }

  // 保存当前均线值供下次使用
  lastShortMA = currentShortMA;
  lastLongMA = currentLongMA;
}

/**
 * 策略停止
 * 在策略停止运行时调用
 */
function onStop(ctx: StrategyContext, reason: string): void {
  ctx.log('info', \`策略停止: \${reason}\`);

  // 获取最终投资组合状态
  const portfolio = ctx.getPortfolio();
  ctx.log('info', '最终投资组合', {
    cash: portfolio.cash,
    positions: portfolio.positions.length,
  });

  ctx.metrics.increment('strategy.stop');
}

/**
 * 错误处理
 * 当策略执行出错时调用
 */
function onError(ctx: StrategyContext, error: Error): void {
  ctx.log('error', '策略执行错误', {
    message: error.message,
    stack: error.stack,
  });

  ctx.metrics.increment('strategy.error');
}

// ==================== 导出策略 ====================
const strategy: StrategyLifecycle = {
  onInit,
  onBar,
  onStop,
  onError,
};

export default strategy;
`;

/**
 * 简化版策略模板（用于快速开始）
 */
export const simpleStrategyTemplate = `/**
 * 简单策略模板
 * 
 * 这是一个最简单的策略模板，包含基本的结构
 */

import type {
  StrategyLifecycle,
  StrategyContext,
  MarketBarPayload,
} from '@/backtesting/strategy/interfaces';
import { defineParameters } from '@/backtesting/strategy/utils';

// 策略参数
export const parameters = defineParameters({
  period: {
    type: 'number',
    title: '周期',
    default: 20,
    minimum: 5,
    maximum: 100,
    description: '指标计算周期',
  },
});

// 初始化
function onInit(ctx: StrategyContext): void {
  ctx.log('info', '策略初始化');
}

// 处理Bar数据
function onBar(ctx: StrategyContext, bar: MarketBarPayload): void {
  const params = ctx.getParameters<{ period: number }>();
  
  // 在这里实现你的策略逻辑
  ctx.log('debug', 'Processing bar', {
    symbol: bar.symbol,
    close: bar.close,
    period: params.period,
  });
}

// 策略停止
function onStop(ctx: StrategyContext, reason: string): void {
  ctx.log('info', \`策略停止: \${reason}\`);
}

// 导出策略
const strategy: StrategyLifecycle = {
  onInit,
  onBar,
  onStop,
};

export default strategy;
`;

/**
 * 获取默认策略模板
 * @param type 'full' | 'simple'
 */
export function getDefaultStrategyTemplate(type: 'full' | 'simple' = 'full'): string {
  return type === 'full' ? defaultStrategyTemplate : simpleStrategyTemplate;
}
