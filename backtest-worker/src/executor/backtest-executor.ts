import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskConfigDto } from '@trading-platform/backtesting-contracts';
import { TaskStatusStore } from './task-status.store';
import { HistoricalDataLoader } from './data-loader';
import { ProgressReporter } from './progress-reporter';
import { StrategyRunner, StrategyRunResult, StrategyResultMetrics } from './strategy-runner';
import { MemoryManager } from './memory-manager';
import { WorkerRegistrationService } from '../registration/worker-registration.service';
import { MainServiceReporter } from './main-service-reporter';
import { WorkerMetricsService } from '../monitoring/worker-metrics.service';
import { TradeRecord } from '../backtesting/ledger/interfaces';
import * as duckdb from 'duckdb';
import * as path from 'path';
import { promises as fs } from 'fs';

@Injectable()
export class BacktestExecutor {
  private readonly logger = new Logger(BacktestExecutor.name);
  private readonly runningTasks = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();

  private readonly resultsAbsoluteBase: string;
  private readonly resultsRelativeBase: string;

  constructor(
    private readonly dataLoader: HistoricalDataLoader,
    private readonly taskStatusStore: TaskStatusStore,
    private readonly progressReporter: ProgressReporter,
    private readonly strategyRunner: StrategyRunner,
    private readonly memoryManager: MemoryManager,
    private readonly registration: WorkerRegistrationService,
    private readonly mainServiceReporter: MainServiceReporter,
    private readonly workerMetrics: WorkerMetricsService,
    private readonly configService: ConfigService,
  ) {
    this.resultsAbsoluteBase =
      this.configService.get<string>(
        'worker.results.absoluteBasePath',
        path.resolve(process.cwd(), '../backend/storage/backtests'),
      ) ?? path.resolve(process.cwd(), '../backend/storage/backtests');
    this.resultsRelativeBase =
      this.configService.get<string>(
        'worker.results.relativeBasePath',
        'backend/storage/backtests',
      ) ?? 'backend/storage/backtests';
  }

  async execute(taskId: string, config: TaskConfigDto): Promise<void> {
    if (this.runningTasks.has(taskId)) {
      throw new Error(`Task ${taskId} is already running`);
    }

    this.logger.log(`Task ${taskId} accepted for strategy ${config.strategyId}`);

    const controller = new AbortController();
    const totalBars = this.dataLoader.estimateTotalBars(config);
    this.taskStatusStore.start(taskId, this.registration.workerId);

    this.workerMetrics.taskStarted(taskId, totalBars);

    const promise = this.runTask(taskId, config, controller.signal, totalBars).finally(() => {
      this.runningTasks.delete(taskId);
    });

    this.runningTasks.set(taskId, { controller, promise });

    promise.catch((error) => {
      this.logger.error(`Task ${taskId} failed`, error.stack || error);
    });
  }

  cancel(taskId: string) {
    const task = this.runningTasks.get(taskId);
    if (task) {
      this.logger.warn(`Cancelling running task ${taskId}`);
      task.controller.abort();
    } else {
      this.logger.warn(`Task ${taskId} is not running, marking as cancelled`);
      this.taskStatusStore.cancel(taskId);
    }
  }

  getTaskStatus(taskId: string) {
    return this.taskStatusStore.getTaskStatus(taskId);
  }

  getRunningTaskCount(): number {
    return this.runningTasks.size;
  }

  async waitForTasksToComplete(timeoutMs = 30_000) {
    const tasks = Array.from(this.runningTasks.values()).map((t) => t.promise);
    if (tasks.length === 0) return;

    await Promise.race([
      Promise.allSettled(tasks),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for tasks to finish')), timeoutMs),
      ),
    ]);
  }

  private async runTask(
    taskId: string,
    config: TaskConfigDto,
    signal: AbortSignal,
    totalBars: number,
  ) {
    const startedAt = Date.now();
    let processed = 0;

    let finalStatus: 'completed' | 'failed' | 'cancelled' = 'completed';

    try {
      for await (const chunk of this.dataLoader.stream(config, signal)) {
        this.memoryManager.trackChunk(chunk.length);
        await this.strategyRunner.runChunk(taskId, config, chunk);
        processed += chunk.length;

        const metrics = {
          processedBars: processed,
          totalBars,
          throughput: this.computeThroughput(processed, startedAt),
          memoryUsed: this.memoryManager.getUsageMB(),
        };

        this.progressReporter.report(taskId, metrics);
        this.workerMetrics.taskProgress(taskId, processed, totalBars);
        this.mainServiceReporter.reportProgress(taskId, {
          progress: totalBars === 0 ? 0 : processed / totalBars,
          metrics,
        });
      }

      this.taskStatusStore.complete(taskId);
      this.logger.log(`Task ${taskId} completed`, { processed, totalBars });
      this.workerMetrics.taskCompleted(taskId);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        this.logger.warn(`Task ${taskId} cancelled`);
        this.taskStatusStore.cancel(taskId);
        this.workerMetrics.taskCancelled(taskId);
        finalStatus = 'cancelled';
      } else {
        this.taskStatusStore.fail(taskId, error);
        this.workerMetrics.taskFailed(taskId);
        finalStatus = 'failed';
        throw error;
      }
    } finally {
      const result = await this.strategyRunner.complete(taskId);
      this.updateMetricsWithStats(taskId, result?.metrics);
      const summary =
        finalStatus === 'completed' && result
          ? await this.buildSummary(taskId, config, result)
          : undefined;

      await this.mainServiceReporter.reportResult(taskId, {
        status: finalStatus,
        metrics: result?.metrics,
        summary,
      });
    }
  }

  private computeThroughput(processedBars: number, startedAt: number) {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    return elapsedSeconds <= 0 ? processedBars : processedBars / elapsedSeconds;
  }

  private updateMetricsWithStats(taskId: string, stats?: StrategyResultMetrics) {
    if (!stats) {
      return;
    }

    const current = this.taskStatusStore.getTaskStatus(taskId);
    this.taskStatusStore.update(taskId, {
      metrics: {
        ...current.metrics,
        totalOrders: stats.execution.totalOrders,
        filledOrders: stats.execution.filledOrders,
        cancelledOrders: stats.execution.cancelledOrders,
        totalVolume: Number(stats.execution.totalVolume),
        totalFees: Number(stats.execution.totalFees),
        avgSlippageBps: stats.execution.avgSlippageBps,
        totalTrades: stats.trades.totalTrades,
        totalPnl: Number(stats.trades.totalPnl ?? 0),
        winRate: stats.trades.winRate,
        profitFactor: stats.trades.profitFactor,
        maxDrawdown: Number(stats.trades.maxDrawdown ?? 0),
        cash: stats.account.cash,
        positionQty: stats.account.positionQty,
        avgEntryPrice: stats.account.avgEntryPrice,
        realizedPnl: stats.account.realizedPnl,
        equity: stats.account.equity,
      },
    });
  }

  private async buildSummary(
    taskId: string,
    config: TaskConfigDto,
    result: StrategyRunResult,
  ): Promise<Record<string, unknown>> {
    const tradesPath = await this.writeTradesParquet(taskId, result.trades);
    const initialCapital = Number(config.parameters?.initialCapital ?? 10000);
    const endingEquity = result.metrics.account.equity;
    const returnPct =
      initialCapital > 0 ? (endingEquity - initialCapital) / initialCapital : 0;

    const artifacts = tradesPath
      ? [
          {
            type: 'trades/parquet',
            path: tradesPath,
          },
        ]
      : [];

    const totalTrades = result.metrics.trades.totalTrades;
    const winningTrades = result.metrics.trades.winningTrades;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const totalPnl = Number(result.metrics.trades.totalPnl ?? endingEquity - initialCapital);
    const totalFees = Number(result.metrics.execution.totalFees ?? 0);
    const profitFactor = result.metrics.trades.profitFactor;
    const totalReturnPercent = returnPct * 100;
    const winRatePercent = winRate * 100;

    return {
      taskId,
      strategyId: config.strategyId,
      scriptVersionId:
        (config.parameters?.scriptVersionId as string | undefined) ??
        ((config as any)?.script?.scriptVersionId as string | undefined) ??
        null,
      initialCapital,
      endingEquity,
      returnPct,
      totalTrades,
      winningTrades,
      winRate: winRatePercent,
      totalPnl,
      profitFactor,
      totalFees,
      finalCapital: endingEquity,
      totalReturn: totalReturnPercent,
      maxDrawdown: result.metrics.trades.maxDrawdown ?? 0,
      profitLossRatio: result.metrics.trades.profitFactor ?? 0,
      artifacts,
    };
  }

  private async writeTradesParquet(taskId: string, trades: TradeRecord[]): Promise<string> {
    const relativePath = path.posix.join(this.resultsRelativeBase, taskId, 'trades.parquet');
    const absolutePath = path.resolve(this.resultsAbsoluteBase, taskId, 'trades.parquet');

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    const db = new duckdb.Database(':memory:');
    const connection = db.connect();

    await this.execDuckDb(
      connection,
      `
        CREATE TABLE trades (
          task_id VARCHAR,
          session_id VARCHAR,
          strategy_id VARCHAR,
          script_version_id VARCHAR,
          symbol VARCHAR,
          side VARCHAR,
          trade_type VARCHAR,
          quantity DOUBLE,
          price DOUBLE,
          realized_pnl DOUBLE,
          unrealized_pnl DOUBLE,
          fees DOUBLE,
          fee_currency VARCHAR,
          liquidity VARCHAR,
          ts TIMESTAMP,
          sequence_id VARCHAR,
          position_qty DOUBLE,
          position_avg_entry DOUBLE,
          position_side VARCHAR,
          reason VARCHAR,
          factor_system VARCHAR,
          factor_custom VARCHAR,
          entry_price DOUBLE,
          exit_price DOUBLE,
          stop_price DOUBLE,
          target_price DOUBLE,
          bar_ts TIMESTAMP,
          context_json VARCHAR
        )
      `,
    );

    if (trades.length > 0) {
      const insertSql = `
        INSERT INTO trades VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `;
      const stmt = connection.prepare(insertSql);
      for (const trade of trades) {
        const row = this.mapTradeToRow(trade);
        await this.runStatement(stmt, row);
      }
      stmt.finalize();
    }

    const escapedPath = absolutePath.replace(/'/g, "''");
    await this.execDuckDb(
      connection,
      `COPY trades TO '${escapedPath}' (FORMAT 'parquet', COMPRESSION 'SNAPPY')`,
    );

    connection.close();
    db.close();

    return relativePath;
  }

  private mapTradeToRow(trade: TradeRecord): any[] {
    const toNumber = (input: any) => {
      if (input === null || input === undefined || input === '') {
        return null;
      }
      const num = typeof input === 'number' ? input : Number(input);
      return Number.isFinite(num) ? num : null;
    };

    const quantity = toNumber(trade.quantity);
    const price = toNumber(trade.price);
    const realized = toNumber(trade.realizedPnl);
    const unrealized = toNumber(trade.unrealizedPnl);
    const fees = toNumber(trade.fees);
    const positionQty = trade.position ? toNumber(trade.position.quantity) : null;
    const avgEntry = trade.position ? toNumber(trade.position.avgEntryPrice) : null;
    const factorSystem = trade.factorSnapshot?.system
      ? JSON.stringify(trade.factorSnapshot.system)
      : null;
    const factorCustom = trade.factorSnapshot?.custom
      ? JSON.stringify(trade.factorSnapshot.custom)
      : null;
    const entryPrice = toNumber(trade.entryPrice);
    const exitPrice = toNumber(trade.exitPrice);
    const stopPrice = toNumber(trade.stopPrice);
    const targetPrice = toNumber(trade.targetPrice);
    const barTimestamp = trade.barTimestamp ?? null;
    const contextJson = trade.context ? JSON.stringify(trade.context) : null;

    return [
      trade.taskId,
      trade.sessionId,
      trade.strategyId,
      trade.scriptVersionId ?? null,
      trade.symbol,
      trade.side,
      trade.type,
      quantity,
      price,
      realized,
      unrealized,
      fees,
      trade.feeCurrency,
      trade.liquidity,
      trade.timestamp,
      trade.sequenceId,
      positionQty,
      avgEntry,
      trade.position?.side ?? null,
      trade.reason ?? null,
      factorSystem,
      factorCustom,
      entryPrice,
      exitPrice,
      stopPrice,
      targetPrice,
      barTimestamp,
      contextJson,
    ];
  }

  private execDuckDb(connection: duckdb.Connection, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private runStatement(statement: duckdb.Statement, params: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      statement.run(...params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
