import { Injectable, Logger } from '@nestjs/common';
import { TaskConfigDto } from '@trading-platform/backtesting-contracts';
import { TaskStatusStore } from './task-status.store';
import { HistoricalDataLoader } from './data-loader';
import { ProgressReporter } from './progress-reporter';
import { StrategyRunner, StrategyResultMetrics } from './strategy-runner';
import { MemoryManager } from './memory-manager';
import { WorkerRegistrationService } from '../registration/worker-registration.service';
import { MainServiceReporter } from './main-service-reporter';
import { WorkerMetricsService } from '../monitoring/worker-metrics.service';

@Injectable()
export class BacktestExecutor {
  private readonly logger = new Logger(BacktestExecutor.name);
  private readonly runningTasks = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();

  constructor(
    private readonly dataLoader: HistoricalDataLoader,
    private readonly taskStatusStore: TaskStatusStore,
    private readonly progressReporter: ProgressReporter,
    private readonly strategyRunner: StrategyRunner,
    private readonly memoryManager: MemoryManager,
    private readonly registration: WorkerRegistrationService,
    private readonly mainServiceReporter: MainServiceReporter,
    private readonly workerMetrics: WorkerMetricsService,
  ) {}

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
      const stats = this.strategyRunner.complete(taskId);
      this.updateMetricsWithStats(taskId, stats);
      await this.mainServiceReporter.reportResult(taskId, {
        status: finalStatus,
        metrics: stats,
        summary: finalStatus === 'completed' ? stats : undefined,
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
}
