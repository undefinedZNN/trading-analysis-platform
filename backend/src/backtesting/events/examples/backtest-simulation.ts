/**
 * EventBus 回测模拟示例
 * 
 * 演示完整的事件驱动回测流程：
 * market.bar → strategy.intent → risk.decision → execution.order → portfolio.update
 */

import { SimpleEventBus, SimpleEventStore } from '../simple-bus';

console.log('=== EventBus 回测模拟示例 ===\n');

const store = new SimpleEventStore();
const bus = new SimpleEventBus(store);

// 简单策略状态
let position = 0; // 当前持仓：0=空仓, 1=多头, -1=空头
let capital = 100000; // 初始资金
let entryPrice = 0; // 入场价格

console.log('初始状态:');
console.log(`  资金: $${capital.toLocaleString()}`);
console.log(`  持仓: ${position}`);
console.log('');

// 1. 市场数据处理器：分析价格，产生交易信号
bus.subscribe('market.bar').subscribe({
  next: (event) => {
    const { symbol, close } = event.payload;
    const price = parseFloat(close);

    console.log(`\n[Market] ${symbol} @ $${price.toLocaleString()}`);

    // 简单趋势策略
    if (position === 0) {
      // 空仓时，价格 > 50000 买入
      if (price > 50000) {
        bus.publish({
          type: 'strategy.intent',
          timestamp: Date.now(),
          payload: {
            action: 'OPEN_LONG',
            symbol,
            reason: 'Price above 50000',
            targetPrice: price,
          },
        });
      }
    } else if (position === 1) {
      // 持有多头时，价格 < 48000 卖出
      if (price < 48000) {
        bus.publish({
          type: 'strategy.intent',
          timestamp: Date.now(),
          payload: {
            action: 'CLOSE_LONG',
            symbol,
            reason: 'Price below 48000',
            targetPrice: price,
          },
        });
      }
    }
  },
});

// 2. 策略信号处理器：进行风控检查
bus.subscribe('strategy.intent').subscribe({
  next: (event) => {
    const { action, symbol, reason, targetPrice } = event.payload;

    console.log(`  [Strategy] Intent: ${action} (${reason})`);

    // 简单风控：检查资金是否充足
    const orderSize = capital * 0.9; // 使用90%资金
    const canTrade = capital >= orderSize;

    bus.publish({
      type: 'risk.decision',
      timestamp: Date.now(),
      payload: {
        action,
        symbol,
        targetPrice,
        orderSize,
        approved: canTrade,
        reason: canTrade ? 'Risk check passed' : 'Insufficient capital',
      },
    });
  },
});

// 3. 风控决策处理器：执行订单
bus.subscribe('risk.decision').subscribe({
  next: (event) => {
    const { action, symbol, targetPrice, orderSize, approved, reason } = event.payload;

    console.log(`  [Risk] Decision: ${approved ? '✅ Approved' : '❌ Rejected'} (${reason})`);

    if (approved) {
      bus.publish({
        type: 'execution.order',
        timestamp: Date.now(),
        payload: {
          action,
          symbol,
          price: targetPrice,
          size: orderSize,
          status: 'FILLED',
        },
      });
    }
  },
});

// 4. 订单执行处理器：更新持仓
bus.subscribe('execution.order').subscribe({
  next: (event) => {
    const { action, symbol, price, size, status } = event.payload;

    if (status === 'FILLED') {
      console.log(`  [Execution] Order ${action} filled at $${price.toLocaleString()}`);

      // 更新持仓和资金
      if (action === 'OPEN_LONG') {
        position = 1;
        entryPrice = price;
        capital -= size;
      } else if (action === 'CLOSE_LONG') {
        const pnl = ((price - entryPrice) / entryPrice) * size;
        capital += size + pnl;
        position = 0;

        console.log(`  💰 P&L: $${pnl.toFixed(2)} (${((pnl / size) * 100).toFixed(2)}%)`);
      }

      // 发布持仓更新事件
      bus.publish({
        type: 'portfolio.update',
        timestamp: Date.now(),
        payload: {
          symbol,
          position,
          capital,
          entryPrice: position !== 0 ? entryPrice : 0,
        },
      });
    }
  },
});

// 5. 持仓更新处理器：记录状态
bus.subscribe('portfolio.update').subscribe({
  next: (event) => {
    const { symbol, position, capital, entryPrice } = event.payload;

    console.log(`  [Portfolio] Updated:`);
    console.log(`    Capital: $${capital.toFixed(2)}`);
    console.log(`    Position: ${position} @ $${entryPrice > 0 ? entryPrice.toFixed(2) : '-'}`);
  },
});

// 启动总线
bus.start();

// 模拟市场数据
const marketData = [
  { time: 0, symbol: 'BTC/USDT', close: '49000' },
  { time: 100, symbol: 'BTC/USDT', close: '50500' }, // 触发开仓
  { time: 200, symbol: 'BTC/USDT', close: '51000' },
  { time: 300, symbol: 'BTC/USDT', close: '50800' },
  { time: 400, symbol: 'BTC/USDT', close: '49500' },
  { time: 500, symbol: 'BTC/USDT', close: '47500' }, // 触发平仓
  { time: 600, symbol: 'BTC/USDT', close: '47000' },
];

console.log('开始回测...');
console.log('');

marketData.forEach((data) => {
  setTimeout(() => {
    bus.publish({
      type: 'market.bar',
      timestamp: Date.now(),
      payload: data,
    });
  }, data.time);
});

// 最终统计
setTimeout(() => {
  console.log('\n' + '='.repeat(60));
  console.log('回测完成');
  console.log('='.repeat(60));

  const finalCapital = capital;
  const initialCapital = 100000;
  const totalReturn = finalCapital - initialCapital;
  const returnPct = (totalReturn / initialCapital) * 100;

  console.log('\n最终结果:');
  console.log(`  初始资金: $${initialCapital.toLocaleString()}`);
  console.log(`  最终资金: $${finalCapital.toFixed(2).toLocaleString()}`);
  console.log(`  总收益: $${totalReturn.toFixed(2)} (${returnPct.toFixed(2)}%)`);

  const metrics = bus.getMetrics();
  console.log('\n事件统计:');
  console.log(`  总事件数: ${metrics.totalEvents}`);
  console.log(`  处理时长: ${(metrics.uptime / 1000).toFixed(2)}s`);
  console.log(`  吞吐量: ${metrics.throughput.toFixed(2)} events/sec`);

  // 按类型统计事件
  const eventsByType: Record<string, number> = {};
  store.getAll().forEach((event) => {
    eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
  });

  console.log('\n事件类型分布:');
  Object.entries(eventsByType)
    .sort(([, a], [, b]) => b - a)
    .forEach(([type, count]) => {
      console.log(`  ${type.padEnd(20)} ${count}`);
    });

  // 清理
  bus.destroy();
  store.destroy();

  console.log('\n✅ 回测模拟完成');
  console.log('');
}, 1000);

