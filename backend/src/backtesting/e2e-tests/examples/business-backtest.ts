/**
 * 业务化回测脚本示例（大样本）
 *
 * - 策略：价格 <= buyThreshold 时建仓，达到止盈或止损即平仓。
 * - 数据：根据 CYCLE_PATTERN 生成，默认 700 个周期（≈4,201 根 K 线，2,100+ 笔交易）。
 * - 校验：根据理论净收益计算期望资金，运行结果必须一致。
 *
 * 运行方式：
 *   npx ts-node src/backtesting/e2e-tests/examples/business-backtest.ts
 *
 * 可选环境变量：
 *   BUSINESS_CYCLES=800
 */

type PriceBar = {
  timestamp: string;
  close: number;
};

type Trade = {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  reason: 'take-profit' | 'stop-loss' | 'final-close';
  grossPnl: number;
  fees: number;
  netPnl: number;
};

type BacktestConfig = {
  initialCapital: number;
  tradeQty: number;
  buyThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  feeRate: number;
};

type BacktestResult = {
  trades: Trade[];
  finalCapital: number;
  totalFees: number;
  totalNetPnl: number;
};

const CONFIG: BacktestConfig = {
  initialCapital: 10_000,
  tradeQty: 0.1,
  buyThreshold: 101,
  takeProfitPct: 0.04,
  stopLossPct: 0.03,
  feeRate: 0.001,
};

const TOTAL_CYCLES = Number(process.env.BUSINESS_CYCLES ?? 700);
const TRADES_PER_CYCLE = 3;
const CYCLE_PATTERN = [100, 105, 100, 95, 100, 104];
const EPSILON = 1e-6;

function createScenarioBars(cycles: number): PriceBar[] {
  const bars: PriceBar[] = [];
  const interval = 60_000;
  let currentTime = new Date('2024-01-01T00:00:00Z').getTime();

  for (let i = 0; i < cycles; i++) {
    for (const price of CYCLE_PATTERN) {
      bars.push({
        close: price,
        timestamp: new Date(currentTime).toISOString(),
      });
      currentTime += interval;
    }
  }

  // 额外追加 1 根 bar，确保最后持仓平仓
  bars.push({
    close: 103,
    timestamp: new Date(currentTime).toISOString(),
  });

  return bars;
}

function applyFee(notional: number, feeRate: number): number {
  return notional * feeRate;
}

function runBusinessBacktest(bars: PriceBar[], cfg: BacktestConfig): BacktestResult {
  let cash = cfg.initialCapital;
  let position = 0;
  let entryPrice = 0;
  let entryTime = '';
  const trades: Trade[] = [];

  const closePosition = (exitPrice: number, exitTime: string, reason: Trade['reason']) => {
    if (position === 0) {
      return;
    }

    const notional = exitPrice * position;
    const exitFee = applyFee(notional, cfg.feeRate);
    cash += notional - exitFee;

    const entryNotional = entryPrice * position;
    const entryFee = applyFee(entryNotional, cfg.feeRate);
    const grossPnl = (exitPrice - entryPrice) * position;
    const fees = entryFee + exitFee;
    const netPnl = grossPnl - fees;

    trades.push({
      entryTime,
      exitTime,
      entryPrice,
      exitPrice,
      quantity: position,
      reason,
      grossPnl,
      fees,
      netPnl,
    });

    position = 0;
    entryPrice = 0;
    entryTime = '';
  };

  for (const bar of bars) {
    const price = bar.close;

    if (position === 0 && price <= cfg.buyThreshold) {
      const notional = price * cfg.tradeQty;
      const fee = applyFee(notional, cfg.feeRate);
      cash -= notional + fee;
      position = cfg.tradeQty;
      entryPrice = price;
      entryTime = bar.timestamp;
      continue;
    }

    if (position > 0) {
      const takeProfitLevel = entryPrice * (1 + cfg.takeProfitPct);
      const stopLossLevel = entryPrice * (1 - cfg.stopLossPct);

      if (price >= takeProfitLevel) {
        closePosition(price, bar.timestamp, 'take-profit');
        continue;
      }

      if (price <= stopLossLevel) {
        closePosition(price, bar.timestamp, 'stop-loss');
      }
    }
  }

  const lastBar = bars[bars.length - 1];
  closePosition(lastBar.close, lastBar.timestamp, 'final-close');

  const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);
  const totalNetPnl = trades.reduce((sum, t) => sum + t.netPnl, 0);

  return {
    trades,
    finalCapital: cash,
    totalFees,
    totalNetPnl,
  };
}

function printReport(result: BacktestResult): void {
  console.log('\n📊 业务策略回测报告');
  console.log('----------------------------------------');
  console.log(`交易笔数      : ${result.trades.length}`);
  console.log(`总手续费      : ${result.totalFees.toFixed(4)}`);
  console.log(`净收益        : ${result.totalNetPnl.toFixed(4)}`);
  console.log(`最终资金      : ${result.finalCapital.toFixed(4)}`);
  console.log('----------------------------------------\n');

  result.trades.slice(0, 5).forEach((trade, idx) => {
    console.log(
      `样例#${idx + 1} ${trade.reason.padEnd(11)} entry=${trade.entryPrice.toFixed(
        2
      )} exit=${trade.exitPrice.toFixed(2)} net=${trade.netPnl.toFixed(4)}`
    );
  });

  if (result.trades.length > 5) {
    console.log(`...其余 ${result.trades.length - 5} 笔略`);
  }
}

function computeCycleNetPnl(cfg: BacktestConfig): number {
  const calcNet = (entry: number, exit: number): number => {
    const gross = (exit - entry) * cfg.tradeQty;
    const entryFee = entry * cfg.tradeQty * cfg.feeRate;
    const exitFee = exit * cfg.tradeQty * cfg.feeRate;
    return gross - entryFee - exitFee;
  };

  return calcNet(100, 105) + calcNet(100, 95) + calcNet(100, 104);
}

async function main(): Promise<void> {
  const bars = createScenarioBars(TOTAL_CYCLES);
  const result = runBusinessBacktest(bars, CONFIG);

  printReport(result);

  const cycleNet = computeCycleNetPnl(CONFIG);
  const expectedFinal = CONFIG.initialCapital + cycleNet * TOTAL_CYCLES;
  const diff = Math.abs(result.finalCapital - expectedFinal);

  if (diff > EPSILON) {
    console.error(
      `❌ 验证失败：预期 ${expectedFinal.toFixed(4)}，实际 ${result.finalCapital.toFixed(4)}`
    );
    process.exit(1);
  }

  console.log(
    `✅ 回测结果正确：trades=${result.trades.length}, cycles=${TOTAL_CYCLES}, final=${result.finalCapital.toFixed(
      4
    )}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error('运行回测脚本时出现错误:', error);
    process.exit(1);
  });
}

export { main, runBusinessBacktest };
