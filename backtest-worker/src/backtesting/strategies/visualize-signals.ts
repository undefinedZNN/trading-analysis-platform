/**
 * 策略信号可视化
 * 
 * 用ASCII图表展示策略的买卖信号
 */

import { OHLCVGenerator } from './test-helpers/ohlcv-generator';
import { enrichDataWithFeatures } from './test-strategies';
import Big from 'big.js';

// 简化的上下文用于信号收集
class SignalCollector {
  private signals: Array<{ bar: number; type: 'buy' | 'sell'; price: string; reason: string }> = [];
  
  log(level: string, message: string, data?: any): void {
    // 静默
  }
  
  metrics(name: string, data: any): void {
    // 静默
  }
  
  publishIntent(intent: any): void {
    this.signals.push({
      bar: this.currentBar,
      type: intent.side,
      price: this.currentPrice,
      reason: intent.reason,
    });
  }
  
  getEquity(): string {
    return '10000';
  }
  
  private currentBar = 0;
  private currentPrice = '';
  
  setCurrentBar(bar: number, price: string): void {
    this.currentBar = bar;
    this.currentPrice = price;
  }
  
  getSignals() {
    return this.signals;
  }
  
  reset(): void {
    this.signals = [];
    this.currentBar = 0;
    this.currentPrice = '';
  }
}

/**
 * 绘制价格图表和信号
 */
function drawPriceChart(
  prices: number[],
  signals: Array<{ bar: number; type: 'buy' | 'sell'; price: string; reason: string }>,
  strategyName: string,
  width = 80,
  height = 20
): void {
  console.log(`\n${'='.repeat(width)}`);
  console.log(`  ${strategyName} - 价格走势与交易信号`);
  console.log('='.repeat(width));
  
  // 计算价格范围
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  
  // 创建画布
  const canvas: string[][] = Array(height).fill(null).map(() => Array(width).fill(' '));
  
  // 绘制价格线
  for (let i = 0; i < prices.length && i < width; i++) {
    const normalizedPrice = (prices[i] - minPrice) / priceRange;
    const y = Math.floor((height - 1) * (1 - normalizedPrice));
    
    if (y >= 0 && y < height) {
      canvas[y][i] = '─';
    }
  }
  
  // 标记信号
  const buySignals = signals.filter(s => s.type === 'buy');
  const sellSignals = signals.filter(s => s.type === 'sell');
  
  buySignals.forEach(signal => {
    if (signal.bar < width) {
      const price = parseFloat(signal.price);
      const normalizedPrice = (price - minPrice) / priceRange;
      const y = Math.floor((height - 1) * (1 - normalizedPrice));
      
      if (y >= 0 && y < height && signal.bar >= 0) {
        canvas[y][signal.bar] = '▲'; // 买入信号
      }
    }
  });
  
  sellSignals.forEach(signal => {
    if (signal.bar < width) {
      const price = parseFloat(signal.price);
      const normalizedPrice = (price - minPrice) / priceRange;
      const y = Math.floor((height - 1) * (1 - normalizedPrice));
      
      if (y >= 0 && y < height && signal.bar >= 0) {
        canvas[y][signal.bar] = '▼'; // 卖出信号
      }
    }
  });
  
  // 打印画布
  console.log(`\n  价格: ${maxPrice.toFixed(2)}`);
  for (let y = 0; y < height; y++) {
    console.log('  ' + canvas[y].join(''));
  }
  console.log(`  价格: ${minPrice.toFixed(2)}`);
  console.log(`  ${'─'.repeat(width)}`);
  console.log(`  Bar:  0${' '.repeat(Math.floor(width / 2) - 5)}${Math.floor(width / 2)}${' '.repeat(Math.floor(width / 2) - 10)}${width}\n`);
  
  // 打印信号统计
  console.log('  信号统计:');
  console.log(`    ▲ 买入信号: ${buySignals.length}`);
  console.log(`    ▼ 卖出信号: ${sellSignals.length}`);
  console.log('');
  
  // 打印详细信号
  if (signals.length > 0) {
    console.log('  信号详情:');
    signals.forEach((signal, idx) => {
      const symbol = signal.type === 'buy' ? '▲' : '▼';
      const color = signal.type === 'buy' ? '\x1b[32m' : '\x1b[31m'; // 绿色买入，红色卖出
      const reset = '\x1b[0m';
      console.log(`    ${color}${idx + 1}. ${symbol} Bar ${signal.bar}: ${signal.type.toUpperCase()} @ ${signal.price} (${signal.reason})${reset}`);
    });
  }
  
  console.log('='.repeat(width) + '\n');
}

/**
 * 可视化策略
 */
async function visualizeStrategy(
  StrategyClass: any,
  strategyName: string,
  params: any,
  features: any[],
  trendDirection: 'up' | 'down' | 'sideways' = 'sideways'
): Promise<void> {
  const collector = new SignalCollector();
  const strategy = new StrategyClass(params, collector);
  
  if (strategy.onInit) {
    strategy.onInit();
  }
  
  // 生成数据（初始价格50000，波动率1.5%，最大涨跌幅100%）
  const generator = new OHLCVGenerator(50000, 0.015, 1.0);
  const data = generator.generateTrendingData(80, trendDirection); // 80个bar适合屏幕宽度
  const enrichedData = enrichDataWithFeatures(data, features, params);
  
  // 运行策略
  let timestamp = Date.now();
  for (let i = 0; i < enrichedData.length; i++) {
    const bar = {
      ...enrichedData[i],
      timestamp: timestamp + i * 60000,
      symbol: 'BTC/USDT',
    };
    
    collector.setCurrentBar(i, bar.close.toString());
    strategy.onBar(bar);
  }
  
  // 可视化
  const prices = data.map(d => d.close);
  const signals = collector.getSignals();
  
  drawPriceChart(prices, signals, strategyName);
}

/**
 * 主函数
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         策略信号可视化工具                                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('  图例:');
  console.log('    ─  价格走势');
  console.log('    ▲  买入信号 (绿色)');
  console.log('    ▼  卖出信号 (红色)\n');
  
  try {
    // 1. MA Cross - 上涨趋势
    const { MACrossStrategy } = await import('./ma-cross.strategy');
    await visualizeStrategy(
      MACrossStrategy,
      'MA Cross (上涨趋势)',
      { fastPeriod: 5, slowPeriod: 15, positionSize: 0.5 },
      [
        { id: 'MA', label: 'fast_ma', params: { period: 5 } },
        { id: 'MA', label: 'slow_ma', params: { period: 15 } },
      ],
      'up'
    );
    
    // 2. RSI - 震荡市场
    const { RSIMeanReversionStrategy } = await import('./rsi-mean-reversion.strategy');
    await visualizeStrategy(
      RSIMeanReversionStrategy,
      'RSI Mean Reversion (震荡市场)',
      {
        rsiPeriod: 14,
        oversoldThreshold: 30,
        overboughtThreshold: 70,
        positionSize: 0.3,
        stopLossPercent: 0.05,
      },
      [{ id: 'RSI', label: 'rsi', params: { period: 14 } }],
      'sideways'
    );
    
    // 3. Bollinger Bands - 均值回归
    const { BollingerBandsStrategy } = await import('./bollinger-bands.strategy');
    await visualizeStrategy(
      BollingerBandsStrategy,
      'Bollinger Bands - Mean Reversion (震荡市场)',
      {
        period: 20,
        stdDev: 2.0,
        positionSize: 0.4,
        strategy: 'mean_reversion',
        stopLossPercent: 0.03,
      },
      [{ id: 'Bollinger', label: 'bollinger', params: { period: 20, stdDev: 2.0 } }],
      'sideways'
    );
    
    // 4. Bollinger Bands - 突破
    await visualizeStrategy(
      BollingerBandsStrategy,
      'Bollinger Bands - Breakout (上涨趋势)',
      {
        period: 20,
        stdDev: 2.0,
        positionSize: 0.4,
        strategy: 'breakout',
        stopLossPercent: 0.03,
      },
      [{ id: 'Bollinger', label: 'bollinger', params: { period: 20, stdDev: 2.0 } }],
      'up'
    );
    
    console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                              ✅ 可视化完成                                     ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');
    
  } catch (error) {
    console.error('\n❌ 可视化失败:', error);
    process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { visualizeStrategy, drawPriceChart };

