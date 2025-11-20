/**
 * LedgerService - 交易账簿服务
 * 
 * 负责：
 * - 记录所有交易
 * - 计算 PnL
 * - 统计分析
 * - 导出数据
 * 
 * @module ledger/service
 */

import { nanoid } from 'nanoid';
import Big from 'big.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  LedgerService,
  LedgerServiceConfig,
  TradeRecord,
  TradeFilter,
  TradeStats,
  PnLCalculator,
  TradeSide,
} from './interfaces';
import { SimplePnLCalculator } from './pnl-calculator';

/**
 * 账簿服务实现
 */
export class LedgerServiceImpl implements LedgerService {
  private trades: TradeRecord[] = [];
  private buffer: TradeRecord[] = [];
  private config: LedgerServiceConfig;
  private pnlCalculator: PnLCalculator;
  private stats: TradeStats;
  private activePosition: AggregatedPosition | null = null;
  private readonly epsilon = 1e-8;

  constructor(config: LedgerServiceConfig) {
    this.config = {
      bufferSize: 1000,
      autoFlush: true,
      ...config,
    };
    
    this.pnlCalculator = config.pnlCalculator || new SimplePnLCalculator();
    
    this.stats = {
      totalTrades: 0,
      totalPnl: '0',
      totalFees: '0',
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgPnl: '0',
      avgWin: '0',
      avgLoss: '0',
      profitFactor: 0,
      maxWin: '0',
      maxLoss: '0',
      maxDrawdown: '0',
    };
    
    this.log('info', 'LedgerService initialized', {
      sessionId: config.sessionId,
      strategyId: config.strategyId,
    });
  }

  /**
   * 记录交易
   */
  async recordTrade(trade: TradeRecord): Promise<void> {
    this.processTrade(trade);
  }

  /**
   * 刷新缓冲区
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    this.log('info', `Flushing ${this.buffer.length} trades`);
    
    // 清空缓冲区（实际写入在导出时进行）
    this.buffer = [];
  }

  /**
   * 查询交易
   */
  async getTrades(filter?: TradeFilter): Promise<TradeRecord[]> {
    this.flushDanglingPosition();
    if (!filter) {
      return [...this.trades];
    }

    return this.trades.filter(trade => {
      if (filter.strategyId && trade.strategyId !== filter.strategyId) {
        return false;
      }
      if (filter.symbol && trade.symbol !== filter.symbol) {
        return false;
      }
      if (filter.side && trade.side !== filter.side) {
        return false;
      }
      if (filter.startTime && trade.timestamp < filter.startTime) {
        return false;
      }
      if (filter.endTime && trade.timestamp > filter.endTime) {
        return false;
      }
      if (filter.minPnl) {
        const pnl = new Big(trade.realizedPnl);
        const minPnl = new Big(filter.minPnl);
        if (pnl.lt(minPnl)) {
          return false;
        }
      }
      if (filter.maxPnl) {
        const pnl = new Big(trade.realizedPnl);
        const maxPnl = new Big(filter.maxPnl);
        if (pnl.gt(maxPnl)) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * 获取统计信息
   */
  getStats(): TradeStats {
    return { ...this.stats };
  }

  /**
   * 导出为 Parquet
   */
  async exportToParquet(outputPath: string): Promise<void> {
    await this.flush();

    // 注意：Parquet 导出需要 parquetjs 库，这里提供接口
    // 实际实现可以在需要时添加
    this.log('info', `Parquet export to ${outputPath} - Not implemented yet`);
    
    // TODO: 实现 Parquet 导出
    throw new Error('Parquet export not implemented yet');
  }

  /**
   * 导出为 JSON
   */
  async exportToJSON(outputPath: string): Promise<void> {
    await this.flush();
    this.flushDanglingPosition();

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    const data = {
      sessionId: this.config.sessionId,
      strategyId: this.config.strategyId,
      stats: this.stats,
      trades: this.trades,
      exportedAt: new Date().toISOString(),
    };

    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
    
    this.log('info', `Exported ${this.trades.length} trades to JSON: ${outputPath}`);
  }

  /**
   * 导出为 CSV
   */
  async exportToCSV(outputPath: string): Promise<void> {
    await this.flush();
    this.flushDanglingPosition();

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    // CSV 头
    const headers = [
      'trade_id',
      'session_id',
      'strategy_id',
      'symbol',
      'intent_id',
      'order_id',
      'fill_id',
      'side',
      'type',
      'quantity',
      'price',
      'realized_pnl',
      'unrealized_pnl',
      'fees',
      'fee_currency',
      'liquidity',
      'timestamp',
      'sequence_id',
    ];

    const lines = [headers.join(',')];

    for (const trade of this.trades) {
      const row = [
        trade.tradeId,
        trade.sessionId,
        trade.strategyId,
        trade.symbol,
        trade.intentId,
        trade.orderId,
        trade.fillId,
        trade.side,
        trade.type,
        trade.quantity,
        trade.price,
        trade.realizedPnl,
        trade.unrealizedPnl,
        trade.fees,
        trade.feeCurrency,
        trade.liquidity,
        trade.timestamp,
        trade.sequenceId,
      ];
      lines.push(row.join(','));
    }

    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    
    this.log('info', `Exported ${this.trades.length} trades to CSV: ${outputPath}`);
  }

  /**
   * 重置
   */
  reset(): void {
    this.trades = [];
    this.buffer = [];
    this.activePosition = null;
    this.stats = {
      totalTrades: 0,
      totalPnl: '0',
      totalFees: '0',
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgPnl: '0',
      avgWin: '0',
      avgLoss: '0',
      profitFactor: 0,
      maxWin: '0',
      maxLoss: '0',
      maxDrawdown: '0',
    };
    this.log('info', 'LedgerService reset');
  }

  // ========================================================================
  // 私有方法
  // ========================================================================
  private processTrade(trade: TradeRecord) {
    if (trade.type === 'open') {
      this.applyOpen(trade);
    } else if (trade.type === 'close') {
      this.applyClose(trade);
    } else {
      this.log('warn', `Unsupported trade type ${trade.type}, skipping aggregation`, {
        tradeId: trade.tradeId,
      });
    }
  }

  private applyOpen(trade: TradeRecord) {
    const quantity = this.toNumber(trade.quantity);
    const fees = this.toNumber(trade.fees);
    if (!this.activePosition) {
      this.activePosition = this.createPosition(trade, quantity, fees);
      return;
    }

    if (this.activePosition.side === trade.side) {
      const position = this.activePosition;
      const totalQty = position.totalQuantity + quantity;
      const avg =
        (position.avgEntryPrice * position.totalQuantity + this.toNumber(trade.price) * quantity) /
        Math.max(this.epsilon, totalQty);
      position.totalQuantity = totalQty;
      position.remainingQuantity += quantity;
      position.avgEntryPrice = avg;
      position.fees += fees;
      position.entryTrade = position.entryTrade || trade;
      position.stopPrice = position.stopPrice ?? this.toNumber(trade.stopPrice);
      position.targetPrice = position.targetPrice ?? this.toNumber(trade.targetPrice);
      return;
    }

    // 方向不同，先强制平掉当前仓位，再创建新仓位
    this.forceClosePosition(trade);
    this.activePosition = this.createPosition(trade, quantity, fees);
  }

  private applyClose(trade: TradeRecord) {
    if (!this.activePosition) {
      this.activePosition = this.createSyntheticPositionFromClose(trade);
    }

    const position = this.activePosition!;
    const quantity = this.toNumber(trade.quantity);
    const segmentQty = Math.min(quantity, position.remainingQuantity);
    position.remainingQuantity = Math.max(0, position.remainingQuantity - segmentQty);
    position.realizedPnl += this.toNumber(trade.realizedPnl);
    position.fees += this.toNumber(trade.fees);
    position.exitPrice = this.toNumber(trade.price);
    position.exitTimestamp = trade.timestamp;
    position.exitBarTimestamp = trade.barTimestamp ?? position.exitBarTimestamp;
    position.lastReason = trade.reason ?? position.lastReason;
    position.exitSegments.push({
      price: this.toNumber(trade.price),
      quantity: segmentQty,
      timestamp: trade.timestamp,
      barTimestamp: trade.barTimestamp,
      reason: trade.reason,
    });

    if (position.remainingQuantity <= this.epsilon) {
      const aggregated = this.buildAggregatedTrade(position);
      this.trades.push(aggregated);
      this.updateStats(aggregated);
      this.activePosition = null;
    }
  }

  private createPosition(trade: TradeRecord, quantity: number, fees: number): AggregatedPosition {
    const entryPrice = this.toNumber(trade.entryPrice ?? trade.price);
    return {
      id: nanoid(),
      entryTrade: trade,
      side: trade.side,
      totalQuantity: quantity,
      remainingQuantity: quantity,
      avgEntryPrice: entryPrice,
      entryTimestamp: trade.timestamp,
      entryBarTimestamp: trade.barTimestamp,
      stopPrice: this.toNumber(trade.stopPrice),
      targetPrice: this.toNumber(trade.targetPrice),
      realizedPnl: 0,
      fees,
      exitSegments: [],
      lastReason: trade.reason,
    };
  }

  private createSyntheticPositionFromClose(trade: TradeRecord): AggregatedPosition {
    const syntheticOpen: TradeRecord = {
      ...trade,
      tradeId: `synthetic-${trade.tradeId}`,
      type: 'open',
      side: trade.side === 'buy' ? 'sell' : ('buy' as TradeSide),
      price: trade.price,
      quantity: trade.quantity,
      realizedPnl: '0',
      fees: '0',
    };
    return this.createPosition(syntheticOpen, this.toNumber(trade.quantity), 0);
  }

  private buildAggregatedTrade(position: AggregatedPosition): TradeRecord {
    const entryTrade = position.entryTrade;
    const exitPrice = position.exitPrice ?? position.avgEntryPrice;
    return {
      taskId: entryTrade.taskId,
      tradeId: position.id,
      sessionId: entryTrade.sessionId,
      strategyId: entryTrade.strategyId,
      scriptVersionId: entryTrade.scriptVersionId,
      symbol: entryTrade.symbol,
      intentId: entryTrade.intentId,
      orderId: entryTrade.orderId,
      fillId: entryTrade.fillId,
      side: entryTrade.side,
      type: 'close',
      quantity: position.totalQuantity.toFixed(8),
      price: position.avgEntryPrice.toFixed(8),
      realizedPnl: position.realizedPnl.toFixed(8),
      unrealizedPnl: '0',
      fees: position.fees.toFixed(8),
      feeCurrency: entryTrade.feeCurrency,
      liquidity: entryTrade.liquidity,
      timestamp: position.exitTimestamp ?? entryTrade.timestamp,
      sequenceId: entryTrade.sequenceId,
      position: {
        quantity: '0',
        avgEntryPrice: position.avgEntryPrice.toFixed(8),
        side: entryTrade.side === 'buy' ? 'long' : 'short',
      },
      factorSnapshot: entryTrade.factorSnapshot,
      reason: entryTrade.reason,
      entryPrice: entryTrade.entryPrice ?? entryTrade.price,
      exitPrice: exitPrice.toFixed(8),
      stopPrice: entryTrade.stopPrice,
      targetPrice: entryTrade.targetPrice,
      barTimestamp: position.exitBarTimestamp ?? entryTrade.barTimestamp,
      context: {
        exitSegments: position.exitSegments,
        status: this.resolveTradeStatus(position),
        entryTimestamp: position.entryTimestamp,
        entryBarTimestamp: position.entryBarTimestamp,
        exitTimestamp: position.exitTimestamp ?? entryTrade.timestamp,
        exitBarTimestamp: position.exitBarTimestamp ?? entryTrade.barTimestamp,
      },
    };
  }

  private resolveTradeStatus(position: AggregatedPosition): string {
    const reason = position.lastReason?.toLowerCase();
    if (reason?.includes('take_profit')) {
      return 'take_profit';
    }
    if (reason?.includes('stop_loss')) {
      return 'stop_loss';
    }
    if (Math.abs(position.realizedPnl) <= this.epsilon) {
      return 'break_even';
    }
    return position.realizedPnl > 0 ? 'profit' : 'loss';
  }

  private flushDanglingPosition() {
    if (!this.activePosition) {
      return;
    }
    const aggregated = this.buildAggregatedTrade(this.activePosition);
    this.trades.push(aggregated);
    this.updateStats(aggregated);
    this.activePosition = null;
  }

  private forceClosePosition(trade: TradeRecord) {
    if (!this.activePosition) {
      return;
    }
    const aggregated = this.buildAggregatedTrade(this.activePosition);
    this.trades.push(aggregated);
    this.updateStats(aggregated);
    this.activePosition = null;
  }

  private toNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * 更新统计信息
   */
  private updateStats(trade: TradeRecord): void {
    this.stats.totalTrades++;

    const pnl = new Big(trade.realizedPnl);
    const fees = new Big(trade.fees);

    // 总盈亏
    this.stats.totalPnl = new Big(this.stats.totalPnl).plus(pnl).toFixed();
    
    // 总手续费
    this.stats.totalFees = new Big(this.stats.totalFees).plus(fees).toFixed();

    // 盈利/亏损交易
    if (pnl.gt(0)) {
      this.stats.winningTrades++;
      
      // 最大盈利
      if (pnl.gt(this.stats.maxWin || '0')) {
        this.stats.maxWin = pnl.toFixed();
      }
    } else if (pnl.lt(0)) {
      this.stats.losingTrades++;
      
      // 最大亏损
      if (pnl.lt(this.stats.maxLoss || '0')) {
        this.stats.maxLoss = pnl.toFixed();
      }
    }

    // 胜率
    if (this.stats.totalTrades > 0) {
      this.stats.winRate = this.stats.winningTrades / this.stats.totalTrades;
    }

    // 平均盈亏
    if (this.stats.totalTrades > 0) {
      this.stats.avgPnl = new Big(this.stats.totalPnl)
        .div(this.stats.totalTrades)
        .toFixed();
    }

    // 平均盈利
    if (this.stats.winningTrades > 0) {
      const totalWin = this.trades
        .filter(t => new Big(t.realizedPnl).gt(0))
        .reduce((sum, t) => sum.plus(t.realizedPnl), new Big(0));
      this.stats.avgWin = totalWin.div(this.stats.winningTrades).toFixed();
    }

    // 平均亏损
    if (this.stats.losingTrades > 0) {
      const totalLoss = this.trades
        .filter(t => new Big(t.realizedPnl).lt(0))
        .reduce((sum, t) => sum.plus(t.realizedPnl), new Big(0));
      this.stats.avgLoss = totalLoss.div(this.stats.losingTrades).toFixed();
    }

    // 盈亏比
    if (this.stats.losingTrades > 0 && new Big(this.stats.avgLoss).lt(0)) {
      this.stats.profitFactor = new Big(this.stats.avgWin)
        .div(new Big(this.stats.avgLoss).abs())
        .toNumber();
    }

    // 计算最大回撤（简化版）
    let peak = new Big(0);
    let cumPnl = new Big(0);
    let maxDD = new Big(0);

    for (const t of this.trades) {
      cumPnl = cumPnl.plus(t.realizedPnl);
      if (cumPnl.gt(peak)) {
        peak = cumPnl;
      }
      const drawdown = peak.minus(cumPnl);
      if (drawdown.gt(maxDD)) {
        maxDD = drawdown;
      }
    }

    this.stats.maxDrawdown = maxDD.neg().toFixed();
  }

  /**
   * 日志记录
   */
  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    if (this.config.logger) {
      this.config.logger(level, message, meta);
    } else {
      const prefix = `[LedgerService:${this.config.strategyId}]`;
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`${prefix} [${level.toUpperCase()}] ${message}${metaStr}`);
    }
  }
}

interface ExitSegment {
  price: number;
  quantity: number;
  timestamp: string;
  barTimestamp?: string;
  reason?: string;
}

interface AggregatedPosition {
  id: string;
  entryTrade: TradeRecord;
  side: TradeSide;
  totalQuantity: number;
  remainingQuantity: number;
  avgEntryPrice: number;
  entryTimestamp: string;
  entryBarTimestamp?: string;
  stopPrice?: number;
  targetPrice?: number;
  realizedPnl: number;
  fees: number;
  exitPrice?: number;
  exitTimestamp?: string;
  exitBarTimestamp?: string;
  exitSegments: ExitSegment[];
  lastReason?: string;
}

/**
 * 创建账簿服务
 */
export function createLedgerService(config: LedgerServiceConfig): LedgerService {
  return new LedgerServiceImpl(config);
}
