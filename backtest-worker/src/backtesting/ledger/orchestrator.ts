/**
 * LedgerService Orchestrator - 账簿服务编排器
 * 
 * 负责：
 * - 订阅执行回报事件
 * - 记录交易到账簿
 * - 处理控制事件（刷新）
 * 
 * @module ledger/orchestrator
 */

import { Subscription } from 'rxjs';
import { nanoid } from 'nanoid';
import {
  LedgerService,
  LedgerServiceOrchestrator,
  OrchestratorStats,
  TradeRecord,
  PnLCalculator,
} from './interfaces';
import { SimplePnLCalculator } from './pnl-calculator';

/**
 * 简化的 EventBus 接口
 */
interface IEventBus {
  subscribe(eventType: string, handler: (event: any) => void | Promise<void>): Subscription;
}

/**
 * 账簿服务编排器实现
 */
export class LedgerServiceOrchestratorImpl implements LedgerServiceOrchestrator {
  private subscriptions: Subscription[] = [];
  private stats: OrchestratorStats = {
    processedTrades: 0,
    averageLatencyMs: 0,
  };
  private latencies: number[] = [];
  private isRunning: boolean = false;
  private pnlCalculator: PnLCalculator;
  
  // 缓存仓位信息
  private positions = new Map<string, {
    quantity: string;
    avgEntryPrice: string;
    side: 'long' | 'short' | 'flat';
  }>();

  constructor(
    private sessionId: string,
    pnlCalculator?: PnLCalculator,
    private logger?: (level: string, message: string, meta?: Record<string, unknown>) => void
  ) {
    this.pnlCalculator = pnlCalculator || new SimplePnLCalculator();
  }

  /**
   * 启动编排器
   */
  start(eventBus: IEventBus, ledgerService: LedgerService): void {
    if (this.isRunning) {
      this.log('warn', 'Orchestrator already running');
      return;
    }

    this.log('info', 'Starting LedgerService orchestrator');

    // 订阅执行回报
    const execReportSub = eventBus.subscribe('execution.report', async (event: any) => {
      await this.handleExecutionReport(event, ledgerService);
    });
    this.subscriptions.push(execReportSub);

    // 订阅控制事件
    const controlSub = eventBus.subscribe('control', async (event: any) => {
      await this.handleControlEvent(event, ledgerService);
    });
    this.subscriptions.push(controlSub);

    this.isRunning = true;
    this.log('info', 'Orchestrator started with 2 subscriptions');
  }

  /**
   * 停止编排器
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.log('info', 'Stopping orchestrator');

    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this.positions.clear();

    this.isRunning = false;
    this.log('info', 'Orchestrator stopped');
  }

  /**
   * 获取统计信息
   */
  getStats(): OrchestratorStats {
    return { ...this.stats };
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 处理执行回报
   */
  private async handleExecutionReport(
    event: any,
    ledgerService: LedgerService
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const report = event.payload;

      // 只记录已成交的订单
      if (report.status !== 'filled' && report.status !== 'partially_filled') {
        return;
      }

      // 如果没有最后成交，跳过
      if (!report.lastFill) {
        return;
      }

      const fill = report.lastFill;
      const positionKey = `${report.strategyId}:${report.symbol}`;

      // 获取当前仓位
      const currentPosition = this.positions.get(positionKey) || {
        quantity: '0',
        avgEntryPrice: '0',
        side: 'flat' as const,
      };

      // 计算 PnL
      const pnlResult = this.pnlCalculator.calculate(
        {
          side: report.side,
          quantity: fill.quantity,
          price: fill.price,
          fees: fill.fee?.amount || '0',
        },
        currentPosition
      );

      // 更新仓位缓存
      this.positions.set(positionKey, pnlResult.newPosition);

      // 创建交易记录
      const trade: TradeRecord = {
        taskId: (report as any)?.taskId ?? this.sessionId,
        tradeId: nanoid(),
        sessionId: this.sessionId,
        strategyId: report.strategyId,
        symbol: report.symbol,
        intentId: report.intentId,
        orderId: report.orderId,
        fillId: fill.fillId,
        side: report.side,
        type: pnlResult.newPosition.side === 'flat' ? 'close' : 
              (currentPosition.side === 'flat' ? 'open' : 'adjust'),
        quantity: fill.quantity,
        price: fill.price,
        realizedPnl: pnlResult.realizedPnl,
        unrealizedPnl: pnlResult.unrealizedPnl,
        fees: fill.fee?.amount || '0',
        feeCurrency: fill.fee?.asset || 'USDT',
        liquidity: fill.liquidity,
        timestamp: fill.timestamp,
        sequenceId: event.sequenceId || '',
        position: {
          quantity: pnlResult.newPosition.quantity,
          avgEntryPrice: pnlResult.newPosition.avgEntryPrice,
          side: pnlResult.newPosition.side,
        },
        context: {
          orderStatus: report.status,
          totalFee: report.totalFee,
        },
      };

      // 记录交易
      await ledgerService.recordTrade(trade);
      this.stats.processedTrades++;

      // 更新延迟统计
      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      if (this.latencies.length > 100) {
        this.latencies.shift();
      }
      this.stats.averageLatencyMs =
        this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;

      this.log('debug', `Trade recorded: ${trade.tradeId}`, {
        tradeId: trade.tradeId,
        symbol: trade.symbol,
        realizedPnl: trade.realizedPnl,
      });
      
    } catch (error: any) {
      this.log('error', `Error handling execution report: ${error.message}`, { error });
    }
  }

  /**
   * 处理控制事件
   */
  private async handleControlEvent(
    event: any,
    ledgerService: LedgerService
  ): Promise<void> {
    try {
      const controlType = event.payload.type;

      if (controlType === 'STOP' || controlType === 'CHECKPOINT') {
        this.log('info', `Flushing ledger on ${controlType}`);
        await ledgerService.flush();
      }
      
    } catch (error: any) {
      this.log('error', `Error handling control event: ${error.message}`, { error });
    }
  }

  /**
   * 日志记录
   */
  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    if (this.logger) {
      this.logger(level, message, meta);
    } else {
      const prefix = `[LedgerOrchestrator:${this.sessionId}]`;
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`${prefix} [${level.toUpperCase()}] ${message}${metaStr}`);
    }
  }
}

/**
 * 创建账簿服务编排器
 */
export function createLedgerOrchestrator(
  sessionId: string,
  pnlCalculator?: PnLCalculator,
  logger?: (level: string, message: string, meta?: Record<string, unknown>) => void
): LedgerServiceOrchestrator {
  return new LedgerServiceOrchestratorImpl(sessionId, pnlCalculator, logger);
}
