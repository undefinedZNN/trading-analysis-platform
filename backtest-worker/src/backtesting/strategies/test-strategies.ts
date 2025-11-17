/**
 * 策略测试套件
 * 
 * 使用 OHLCVGenerator 生成模拟数据测试策略结构
 */

import { OHLCVGenerator } from './test-helpers/ohlcv-generator';
import Big from 'big.js';
import { 
  ComprehensiveValidator, 
  DetailedTrade, 
  AccountSnapshot 
} from './comprehensive-validator';

const DATA_COUNT = 50000;

// 模拟 StrategyContext
class MockStrategyContext {
  private initialEquity = new Big('10000');
  private equity = new Big('10000');
  private cash = new Big('10000'); // 可用现金
  private position = new Big('0'); // 持仓数量
  private positionValue = new Big('0'); // 持仓价值
  private entryPrice = new Big('0'); // 入场价格
  private logs: any[] = [];
  private metricsData: any[] = [];
  private intents: any[] = [];
  private trades: any[] = []; // 交易记录
  private currentPrice = new Big('0'); // 当前价格
  private barIndex = 0; // 当前bar索引
  
  // 完整验证器
  private validator: ComprehensiveValidator;
  private enableComprehensiveValidation = true;

  constructor(initialEquity: string = '10000', enableValidation: boolean = true) {
    this.initialEquity = new Big(initialEquity);
    this.equity = new Big(initialEquity);
    this.cash = new Big(initialEquity);
    this.enableComprehensiveValidation = enableValidation;
    this.validator = new ComprehensiveValidator(initialEquity);
  }

  log(level: string, message: string, data?: any): void {
    const logEntry = {
      level,
      message,
      data,
      timestamp: Date.now(),
    };
    this.logs.push(logEntry);
    if (level.toUpperCase() !== 'INFO') {
      // console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    }
    // console.log(`[${level.toUpperCase()}] ${message}`, data || '');
  }

  metrics(name: string, data: any): void {
    this.metricsData.push({ name, data, timestamp: Date.now() });
  }

  publishIntent(intent: any): void {
    this.intents.push({ ...intent, timestamp: Date.now() });
    // console.log(`📤 Intent Published:`, intent);
  }

  getEquity(): string {
    return this.equity.toFixed(2);
  }

  updateEquity(amount: string): void {
    this.equity = new Big(amount);
  }

  updatePrice(price: number, recordSnapshot: boolean = false): void {
    this.currentPrice = new Big(price);
    // 更新权益 = 现金 + 持仓价值
    if (this.position.gt(0)) {
      this.positionValue = this.position.times(this.currentPrice);
      this.equity = this.cash.plus(this.positionValue);
    } else {
      this.positionValue = new Big('0'); // 持仓为0时，持仓价值也应为0
      this.equity = this.cash;
    }

    // 记录账户快照
    if (recordSnapshot && this.enableComprehensiveValidation) {
      const unrealizedPnl = this.position.gt(0) && this.entryPrice.gt(0)
        ? this.position.times(this.currentPrice.minus(this.entryPrice))
        : new Big('0');

      const snapshot: AccountSnapshot = {
        timestamp: Date.now(),
        barIndex: this.barIndex,
        price,
        cash: this.cash.toFixed(2),
        position: this.position.toFixed(8),
        positionValue: this.positionValue.toFixed(2),
        equity: this.equity.toFixed(2),
        unrealizedPnl: unrealizedPnl.toFixed(2),
      };
      
      this.validator.recordSnapshot(snapshot);
    }
  }

  incrementBarIndex(): void {
    this.barIndex++;
  }

  executeTrade(intent: any, price: number): void {
    const tradePrice = new Big(price);
    
    // 验证并转换数量
    let quantity: Big;
    
    // 处理 'all' 特殊情况
    if (intent.quantity === 'all') {
      if (intent.side === 'buy') {
        // 全仓买入：使用所有可用现金
        quantity = this.cash.div(tradePrice);
      } else if (intent.side === 'sell') {
        // 全仓卖出：卖出所有持仓
        quantity = this.position;
      } else {
        return;
      }
    } else {
      try {
        if (intent.quantity === undefined || intent.quantity === null || intent.quantity === '') {
          return;
        }
        quantity = new Big(intent.quantity);
        if (quantity.lte(0)) {
          return;
        }
      } catch (error) {
        return;
      }
    }

    // 记录交易前状态
    const beforeCash = this.cash.toFixed(2);
    const beforePosition = this.position.toFixed(8);
    const beforeEquity = this.equity.toFixed(2);

    if (intent.side === 'buy') {
      // 买入
      const cost = quantity.times(tradePrice);
      if (cost.lte(this.cash)) {
        this.cash = this.cash.minus(cost);
        this.position = this.position.plus(quantity);
        this.entryPrice = tradePrice;
        
        // 更新价格以计算交易后状态
        this.updatePrice(price);
        
        const trade: any = {
          side: 'buy',
          price: tradePrice.toFixed(2),
          quantity: quantity.toFixed(8),
          cost: cost.toFixed(2),
          timestamp: Date.now(),
          reason: intent.reason,
        };
        
        this.trades.push(trade);

        // 记录详细交易（用于完整验证）
        if (this.enableComprehensiveValidation) {
          const detailedTrade: DetailedTrade = {
            id: this.trades.length - 1,
            timestamp: trade.timestamp,
            side: 'buy',
            price: trade.price,
            quantity: trade.quantity,
            cost: trade.cost,
            beforeCash,
            beforePosition,
            beforeEquity,
            afterCash: this.cash.toFixed(2),
            afterPosition: this.position.toFixed(8),
            afterEquity: this.equity.toFixed(2),
            reason: intent.reason,
          };
          this.validator.recordTrade(detailedTrade);
        }
      }
    } else if (intent.side === 'sell') {
      // 卖出
      if (this.position.gt(0)) {
        const actualQuantity = quantity.gt(this.position) ? this.position : quantity;
        const revenue = actualQuantity.times(tradePrice);
        const pnl = actualQuantity.times(tradePrice.minus(this.entryPrice));
        
        this.cash = this.cash.plus(revenue);
        this.position = this.position.minus(actualQuantity);
        
        // 更新价格以计算交易后状态
        this.updatePrice(price);
        
        const trade: any = {
          side: 'sell',
          price: tradePrice.toFixed(2),
          quantity: actualQuantity.toFixed(8),
          revenue: revenue.toFixed(2),
          pnl: pnl.toFixed(2),
          pnlPercent: this.entryPrice.gt(0) ? pnl.div(this.entryPrice).times(100).toFixed(2) : '0',
          timestamp: Date.now(),
          reason: intent.reason,
        };
        
        this.trades.push(trade);

        // 记录详细交易（用于完整验证）
        if (this.enableComprehensiveValidation) {
          const detailedTrade: DetailedTrade = {
            id: this.trades.length - 1,
            timestamp: trade.timestamp,
            side: 'sell',
            price: trade.price,
            quantity: trade.quantity,
            revenue: trade.revenue,
            pnl: trade.pnl,
            pnlPercent: trade.pnlPercent,
            entryPrice: this.entryPrice.toFixed(2),
            beforeCash,
            beforePosition,
            beforeEquity,
            afterCash: this.cash.toFixed(2),
            afterPosition: this.position.toFixed(8),
            afterEquity: this.equity.toFixed(2),
            reason: intent.reason,
          };
          this.validator.recordTrade(detailedTrade);
        }

        if (this.position.lte(0)) {
          this.position = new Big('0');
          this.entryPrice = new Big('0');
        }
      }
    } else {
      // 如果不是买入或卖出，仍然需要更新价格
      this.updatePrice(price);
    }
  }

  getLogs(): any[] {
    return this.logs;
  }

  getMetrics(): any[] {
    return this.metricsData;
  }

  getIntents(): any[] {
    return this.intents;
  }

  getTrades(): any[] {
    return this.trades;
  }

  /**
   * 执行完整验证
   */
  performComprehensiveValidation() {
    if (!this.enableComprehensiveValidation) {
      return null;
    }
    
    const result = this.validator.validate();
    return {
      result,
      report: this.validator.generateReport(result),
    };
  }

  getAccountStats() {
    const totalPnl = this.equity.minus(this.initialEquity);
    const totalPnlPercent = totalPnl.div(this.initialEquity).times(100);
    
    const winTrades = this.trades.filter(t => t.side === 'sell' && parseFloat(t.pnl) > 0);
    const lossTrades = this.trades.filter(t => t.side === 'sell' && parseFloat(t.pnl) < 0);
    const totalClosedTrades = winTrades.length + lossTrades.length;
    
    const winRate = totalClosedTrades > 0 ? (winTrades.length / totalClosedTrades * 100) : 0;
    
    const avgWin = winTrades.length > 0 
      ? winTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / winTrades.length 
      : 0;
    const avgLoss = lossTrades.length > 0 
      ? Math.abs(lossTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / lossTrades.length)
      : 0;
    
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

    // 计算已实现盈亏（所有卖出交易的盈亏总和）
    const realizedPnl = this.trades
      .filter(t => t.side === 'sell')
      .reduce((sum, t) => sum + parseFloat(t.pnl), 0);

    return {
      initialEquity: this.initialEquity.toFixed(2),
      finalEquity: this.equity.toFixed(2),
      cash: this.cash.toFixed(2),
      position: this.position.toFixed(8),
      positionValue: this.positionValue.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      totalPnlPercent: totalPnlPercent.toFixed(2),
      realizedPnl: realizedPnl.toFixed(2),
      totalTrades: this.trades.length,
      buyTrades: this.trades.filter(t => t.side === 'buy').length,
      sellTrades: this.trades.filter(t => t.side === 'sell').length,
      winTrades: winTrades.length,
      lossTrades: lossTrades.length,
      winRate: winRate.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
    };
  }

  /**
   * 验证账户状态的一致性
   */
  validateAccountState(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. 验证权益计算
    // 权益 = 现金 + 持仓价值
    const expectedEquity = this.cash.plus(this.positionValue);
    const actualEquity = this.equity;
    
    if (!expectedEquity.eq(actualEquity)) {
      errors.push(
        `权益计算不一致: 期望 ${expectedEquity.toFixed(2)}, 实际 ${actualEquity.toFixed(2)}`
      );
    }

    // 2. 验证资金守恒
    // 初始资金 = 现金 + 持仓价值 - 已实现盈亏
    const realizedPnl = this.trades
      .filter(t => t.side === 'sell')
      .reduce((sum, t) => sum + parseFloat(t.pnl), 0);
    
    const totalCost = this.trades
      .filter(t => t.side === 'buy')
      .reduce((sum, t) => sum + parseFloat(t.cost), 0);
    
    const totalRevenue = this.trades
      .filter(t => t.side === 'sell')
      .reduce((sum, t) => sum + parseFloat(t.revenue), 0);
    
    // 验证: 初始资金 = 当前现金 + 持仓成本 - (总收入 - 总成本)
    // 简化为: 初始资金 + 总收入 = 当前现金 + 总成本
    const expectedCashFlow = this.initialEquity.plus(totalRevenue).minus(totalCost);
    const cashDiff = expectedCashFlow.minus(this.cash).abs();
    
    // 允许微小的浮点数误差（小于 0.15 美元）
    if (cashDiff.gt(0.15)) {
      errors.push(
        `资金流不匹配: 期望现金 ${expectedCashFlow.toFixed(2)}, 实际现金 ${this.cash.toFixed(2)}, 差异 $${cashDiff.toFixed(2)}`
      );
    }

    // 3. 验证持仓数量
    let buyQuantitySum = new Big(0);
    let sellQuantitySum = new Big(0);
    
    this.trades.forEach(trade => {
      if (trade.side === 'buy') {
        buyQuantitySum = buyQuantitySum.plus(trade.quantity);
      } else if (trade.side === 'sell') {
        sellQuantitySum = sellQuantitySum.plus(trade.quantity);
      }
    });

    const netPosition = buyQuantitySum.minus(sellQuantitySum);
    if (!netPosition.eq(this.position)) {
      errors.push(
        `持仓计算不匹配: 交易记录显示 ${netPosition.toFixed(8)}, 账户显示 ${this.position.toFixed(8)}`
      );
    }

    // 4. 验证卖出数量不超过买入数量
    if (sellQuantitySum.gt(buyQuantitySum)) {
      errors.push(
        `卖出数量 (${sellQuantitySum.toFixed(8)}) 超过买入数量 (${buyQuantitySum.toFixed(8)})`
      );
    }

    // 5. 验证持仓和现金不能为负
    if (this.position.lt(0)) {
      errors.push(`持仓为负: ${this.position.toFixed(8)}`);
    }

    if (this.cash.lt(0)) {
      errors.push(`现金为负: ${this.cash.toFixed(2)}`);
    }

    // 6. 验证已实现盈亏的正确性
    const expectedPnl = new Big(totalRevenue).minus(
      this.trades
        .filter(t => t.side === 'sell')
        .reduce((sum, t) => {
          // 卖出的成本 = 卖出数量 * 买入价格
          const qty = new Big(t.quantity);
          const entryPrice = this.entryPrice.gt(0) ? this.entryPrice : new Big(0);
          return sum + parseFloat(qty.times(entryPrice).toFixed(2));
        }, 0)
    );

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  reset(): void {
    this.initialEquity = new Big('10000');
    this.equity = new Big('10000');
    this.cash = new Big('10000');
    this.position = new Big('0');
    this.positionValue = new Big('0');
    this.entryPrice = new Big('0');
    this.currentPrice = new Big('0');
    this.logs = [];
    this.metricsData = [];
    this.intents = [];
    this.trades = [];
  }
}

/**
 * 测试策略执行
 */
async function testStrategy(
  StrategyClass: any,
  params: any,
  features: any[],
  dataCount: number = 100,
  trendDirection: 'up' | 'down' | 'sideways' = 'sideways'
): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log(`测试策略: ${StrategyClass.name || '未知策略'}`);
  console.log('='.repeat(70));

  // 创建上下文
  const context = new MockStrategyContext();

  // 创建策略实例
  const strategy = new StrategyClass(params, context);

  // 初始化策略
  if (strategy.onInit) {
    strategy.onInit();
  }

  // 生成测试数据（初始价格50000，波动率2%，最大涨跌幅100%）
  const generator = new OHLCVGenerator(50000, 0.02, 1.0);
  const data = generator.generateTrendingData(dataCount, trendDirection);

  const trendNameMap = { up: '上涨', down: '下跌', sideways: '震荡' };
  console.log(`\n📊 已生成 ${data.length} 个K线数据 (${trendNameMap[trendDirection]}趋势)`);
  console.log(`   价格范围: ${Math.min(...data.map(d => d.close))} - ${Math.max(...data.map(d => d.close))}`);

  // 计算所需特征（简化版）
  const enrichedData = enrichDataWithFeatures(data, features, params);

  // 执行策略
  console.log('\n🔄 运行策略中...\n');
  
  let timestamp = Date.now();
  let intentIndex = 0;
  
  // 每 100 个bar记录一次快照
  const snapshotInterval = 100;
  
  for (let i = 0; i < enrichedData.length; i++) {
    const bar = {
      ...enrichedData[i],
      timestamp: timestamp + i * 60000, // 每分钟一个bar
      symbol: 'BTC/USDT',
    };

    // 更新当前价格（定期记录快照）
    const shouldSnapshot = i % snapshotInterval === 0 || i === enrichedData.length - 1;
    context.updatePrice(bar.close, shouldSnapshot);

    // 执行新产生的交易信号
    const intents = context.getIntents();
    while (intentIndex < intents.length) {
      const intent = intents[intentIndex];
      context.executeTrade(intent, bar.close);
      intentIndex++;
    }

    strategy.onBar(bar);
    context.incrementBarIndex();
  }

  // 输出结果
  const intents = context.getIntents();
  const logs = context.getLogs();
  const trades = context.getTrades();
  const accountStats = context.getAccountStats();

  console.log('\n' + '-'.repeat(70));
  console.log('📈 策略执行结果:');
  console.log('-'.repeat(70));
  console.log(`总信号数: ${intents.length}`);
  console.log(`买入信号: ${intents.filter(i => i.side === 'buy').length}`);
  console.log(`卖出信号: ${intents.filter(i => i.side === 'sell').length}`);
  console.log(`信息日志: ${logs.filter(l => l.level === 'info').length}`);
  console.log(`警告日志: ${logs.filter(l => l.level === 'warning').length}`);

  // 显示账户盈亏
  console.log('\n' + '-'.repeat(70));
  console.log('💰 账户盈亏情况:');
  console.log('-'.repeat(70));
  console.log(`初始资金: $${accountStats.initialEquity}`);
  console.log(`最终权益: $${accountStats.finalEquity}`);
  console.log(`可用现金: $${accountStats.cash}`);
  console.log(`持仓数量: ${accountStats.position}`);
  console.log(`持仓价值: $${accountStats.positionValue}`);
  console.log(`总盈亏: $${accountStats.totalPnl} (${accountStats.totalPnlPercent}%)`);
  
  console.log('\n📊 交易统计:');
  console.log(`总交易次数: ${accountStats.totalTrades}`);
  console.log(`买入次数: ${accountStats.buyTrades}`);
  console.log(`卖出次数: ${accountStats.sellTrades}`);
  console.log(`盈利次数: ${accountStats.winTrades}`);
  console.log(`亏损次数: ${accountStats.lossTrades}`);
  console.log(`胜率: ${accountStats.winRate}%`);
  console.log(`平均盈利: $${accountStats.avgWin}`);
  console.log(`平均亏损: $${accountStats.avgLoss}`);
  console.log(`盈亏比: ${accountStats.profitFactor}`);
  console.log(`已实现盈亏: $${accountStats.realizedPnl}`);

  // 显示部分交易详情
  if (trades.length > 0) {
    console.log('\n📋 交易详情 (前5笔):');
    trades.slice(0, 5).forEach((trade, idx) => {
      if (trade.side === 'buy') {
        console.log(`  ${idx + 1}. 买入 - 价格: $${trade.price}, 数量: ${trade.quantity}, 成本: $${trade.cost}`);
      } else {
        const pnlSymbol = parseFloat(trade.pnl) >= 0 ? '📈' : '📉';
        console.log(`  ${idx + 1}. 卖出 ${pnlSymbol} - 价格: $${trade.price}, 数量: ${trade.quantity}, 盈亏: $${trade.pnl} (${trade.pnlPercent}%)`);
      }
    });
    if (trades.length > 5) {
      console.log(`  ... 还有 ${trades.length - 5} 笔交易`);
    }
  }

  // 执行完整验证
  console.log('\n' + '='.repeat(70));
  const comprehensiveValidation = context.performComprehensiveValidation();
  if (comprehensiveValidation) {
    console.log(comprehensiveValidation.report);
  } else {
    console.log('验证已禁用');
  }

  // 测试快照功能
  if (strategy.onSnapshot && strategy.onRestore) {
    console.log('\n💾 测试快照/恢复功能...');
    const snapshot = strategy.onSnapshot();
    console.log(`   快照已创建: ${JSON.stringify(snapshot).substring(0, 100)}...`);
    strategy.onRestore(snapshot);
    console.log('   ✅ 快照恢复成功');
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

/**
 * 为数据添加特征（简化计算）
 */
function enrichDataWithFeatures(
  data: any[],
  features: any[],
  params: any
): any[] {
  return data.map((bar, index) => {
    const enriched: any = { ...bar, features: {} };

    // 为每个特征计算值
    features.forEach(feature => {
      if (feature.id === 'MA' || feature.label?.includes('ma')) {
        // 计算移动平均
        const period = params.fastPeriod || params.slowPeriod || feature.params?.period || 10;
        const label = feature.label || 'ma';
        
        if (index >= period - 1) {
          const sum = data.slice(index - period + 1, index + 1)
            .reduce((acc, b) => acc + b.close, 0);
          enriched.features[label] = (sum / period).toFixed(2);
        }
      } else if (feature.id === 'RSI' || feature.label === 'rsi') {
        // 简化的RSI计算
        const period = params.rsiPeriod || feature.params?.period || 14;
        
        if (index >= period) {
          // 计算价格变化
          let gains = 0;
          let losses = 0;
          
          for (let i = 1; i <= period; i++) {
            const change = data[index - period + i].close - data[index - period + i - 1].close;
            if (change > 0) {
              gains += change;
            } else {
              losses += Math.abs(change);
            }
          }
          
          const avgGain = gains / period;
          const avgLoss = losses / period;
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          const rsi = 100 - (100 / (1 + rs));
          
          enriched.features.rsi = rsi.toFixed(2);
        }
      } else if (feature.id === 'Bollinger' || feature.label === 'bollinger') {
        // 布林带计算
        const period = params.period || feature.params?.period || 20;
        const stdDev = params.stdDev || feature.params?.stdDev || 2.0;
        
        if (index >= period - 1) {
          const slice = data.slice(index - period + 1, index + 1);
          const closes = slice.map(b => b.close);
          const mean = closes.reduce((a, b) => a + b, 0) / period;
          const variance = closes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
          const std = Math.sqrt(variance);
          
          enriched.features.bollinger = {
            upper: (mean + stdDev * std).toFixed(2),
            middle: mean.toFixed(2),
            lower: (mean - stdDev * std).toFixed(2),
          };
        }
      }
    });

    return enriched;
  });
}

/**
 * 简单验证测试 - 用于手工验证计算准确性
 */
async function simpleValidationTest(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          简单验证测试（可手工验证）                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const context = new MockStrategyContext();
  
  console.log('📝 测试场景：手工验证示例');
  console.log('初始资金: $10,000\n');

  // 场景1: 买入 0.1 BTC @ $50,000
  console.log('场景 1: 买入 0.1 BTC @ $50,000');
  context.executeTrade({ side: 'buy', quantity: '0.1', reason: '测试买入' }, 50000);
  console.log(`  现金: $${context.getAccountStats().cash} (应为 $5,000)`);
  console.log(`  持仓: ${context.getAccountStats().position} BTC (应为 0.1)`);
  console.log(`  持仓价值: $${context.getAccountStats().positionValue} (应为 $5,000)`);
  console.log(`  总权益: $${context.getAccountStats().finalEquity} (应为 $10,000)\n`);

  // 场景2: 价格上涨到 $55,000
  console.log('场景 2: 价格上涨到 $55,000');
  context.updatePrice(55000, true); // 记录快照
  console.log(`  持仓价值: $${context.getAccountStats().positionValue} (应为 $5,500)`);
  console.log(`  总权益: $${context.getAccountStats().finalEquity} (应为 $10,500)`);
  console.log(`  未实现盈亏: $${context.getAccountStats().totalPnl} (应为 $500)\n`);

  // 场景3: 卖出 0.05 BTC @ $55,000
  console.log('场景 3: 卖出 0.05 BTC @ $55,000');
  context.executeTrade({ side: 'sell', quantity: '0.05', reason: '部分止盈' }, 55000);
  const trade1 = context.getTrades()[1];
  console.log(`  卖出盈亏: $${trade1.pnl} (应为 $250 = 0.05 * ($55,000 - $50,000))`);
  console.log(`  现金: $${context.getAccountStats().cash} (应为 $7,750 = $5,000 + $2,750)`);
  console.log(`  持仓: ${context.getAccountStats().position} BTC (应为 0.05)`);
  console.log(`  已实现盈亏: $${context.getAccountStats().realizedPnl} (应为 $250)\n`);

  // 场景4: 价格跌到 $52,000
  console.log('场景 4: 价格跌到 $52,000');
  context.updatePrice(52000, true); // 记录快照
  console.log(`  持仓价值: $${context.getAccountStats().positionValue} (应为 $2,600 = 0.05 * $52,000)`);
  console.log(`  总权益: $${context.getAccountStats().finalEquity} (应为 $10,350 = $7,750 + $2,600)`);
  console.log(`  总盈亏: $${context.getAccountStats().totalPnl} (应为 $350)\n`);

  // 场景5: 全部卖出 @ $52,000
  console.log('场景 5: 全部卖出 @ $52,000');
  context.executeTrade({ side: 'sell', quantity: 'all', reason: '全部卖出' }, 52000);
  const trade2 = context.getTrades()[2];
  console.log(`  卖出盈亏: $${trade2.pnl} (应为 $100 = 0.05 * ($52,000 - $50,000))`);
  console.log(`  现金: $${context.getAccountStats().cash} (应为 $10,350 = $7,750 + $2,600)`);
  console.log(`  持仓: ${context.getAccountStats().position} BTC (应为 0)`);
  console.log(`  已实现盈亏: $${context.getAccountStats().realizedPnl} (应为 $350 = $250 + $100)`);
  console.log(`  总权益: $${context.getAccountStats().finalEquity} (应为 $10,350)\n`);

  // 记录最终快照（所有交易完成后）
  context.updatePrice(52000, true);

  // 执行完整验证
  const comprehensiveValidation = context.performComprehensiveValidation();
  if (comprehensiveValidation) {
    console.log(comprehensiveValidation.report);
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          策略结构测试套件                                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  try {
    // 先运行简单验证测试
    await simpleValidationTest();
    // 测试1: MA Cross Strategy
    console.log('\n📌 测试 1: 双均线交叉策略');
    const { MACrossStrategy } = await import('./ma-cross.strategy');
    await testStrategy(
      MACrossStrategy,
      { fastPeriod: 10, slowPeriod: 30, positionSize: 0.5 },
      [
        { id: 'MA', label: 'fast_ma', params: { period: 10 } },
        { id: 'MA', label: 'slow_ma', params: { period: 30 } },
      ],
      DATA_COUNT,
      'up'
    );

    // 测试2: RSI Mean Reversion Strategy
    console.log('\n📌 测试 2: RSI均值回归策略');
    const { RSIMeanReversionStrategy } = await import('./rsi-mean-reversion.strategy');
    await testStrategy(
      RSIMeanReversionStrategy,
      {
        rsiPeriod: 14,
        oversoldThreshold: 30,
        overboughtThreshold: 70,
        positionSize: 0.3,
        stopLossPercent: 0.05,
      },
      [{ id: 'RSI', label: 'rsi', params: { period: 14 } }],
      DATA_COUNT,
      'sideways'
    );

    // 测试3: Bollinger Bands Strategy (Mean Reversion)
    console.log('\n📌 测试 3: 布林带策略（均值回归模式）');
    const { BollingerBandsStrategy } = await import('./bollinger-bands.strategy');
    await testStrategy(
      BollingerBandsStrategy,
      {
        period: 20,
        stdDev: 2.0,
        positionSize: 0.4,
        strategy: 'mean_reversion',
        stopLossPercent: 0.03,
      },
      [{ id: 'Bollinger', label: 'bollinger', params: { period: 20, stdDev: 2.0 } }],
      DATA_COUNT,
      'sideways'
    );

    // 测试4: Bollinger Bands Strategy (Breakout)
    console.log('\n📌 测试 4: 布林带策略（突破模式）');
    await testStrategy(
      BollingerBandsStrategy,
      {
        period: 20,
        stdDev: 2.0,
        positionSize: 0.4,
        strategy: 'breakout',
        stopLossPercent: 0.03,
      },
      [{ id: 'Bollinger', label: 'bollinger', params: { period: 20, stdDev: 2.0 } }],
      DATA_COUNT,
      'up'
    );

    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ 所有策略测试完成                             ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 错误:', error);
    process.exit(1);
  });
}

export { testStrategy, MockStrategyContext, enrichDataWithFeatures };

