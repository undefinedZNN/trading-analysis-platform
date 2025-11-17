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
    // 添加到缓冲区
    this.buffer.push(trade);
    this.trades.push(trade);

    // 更新统计
    this.updateStats(trade);

    this.log('debug', `Trade recorded: ${trade.tradeId}`, {
      tradeId: trade.tradeId,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
    });

    // 自动刷新
    if (this.config.autoFlush && this.buffer.length >= (this.config.bufferSize || 1000)) {
      await this.flush();
    }
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

/**
 * 创建账簿服务
 */
export function createLedgerService(config: LedgerServiceConfig): LedgerService {
  return new LedgerServiceImpl(config);
}

