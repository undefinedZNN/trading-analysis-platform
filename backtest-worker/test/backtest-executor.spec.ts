import 'reflect-metadata';
import { TaskConfigDto, TaskStatus } from '@trading-platform/backtesting-contracts';
import { BacktestExecutor } from '../src/executor/backtest-executor';
import { TaskStatusStore } from '../src/executor/task-status.store';
import { ProgressReporter } from '../src/executor/progress-reporter';
import { MemoryManager } from '../src/executor/memory-manager';
import { WorkerRegistrationService } from '../src/registration/worker-registration.service';

describe('BacktestExecutor', () => {
  const config: TaskConfigDto = {
    strategyId: 'demo',
    datasetId: 'ds',
    timeframe: '1m',
    timeRange: {
      start: '2023-01-01T00:00:00Z',
      end: '2023-01-01T02:00:00Z',
    },
    parameters: {},
  };

  const createExecutor = () => {
    const dataLoader = {
      estimateTotalBars: () => 10,
      stream: async function* () {
        yield new Array(5).fill(0).map((_, idx) => ({
          timestamp: new Date(Date.now() + idx * 1000).toISOString(),
          open: 1,
          high: 1.2,
          low: 0.8,
          close: 1,
          volume: 1,
        }));
        await new Promise((resolve) => setTimeout(resolve, 5));
        yield new Array(5).fill(0).map((_, idx) => ({
          timestamp: new Date(Date.now() + idx * 1000).toISOString(),
          open: 1,
          high: 1.2,
          low: 0.8,
          close: 1,
          volume: 1,
        }));
      },
    } as any;
    const statusStore = new TaskStatusStore();
    const progressReporter = new ProgressReporter(statusStore);
    const strategyRunner = {
      runChunk: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockReturnValue({
        execution: {
          totalOrders: 2,
          filledOrders: 2,
          cancelledOrders: 0,
          totalVolume: '10',
          totalFees: '0.1',
          avgSlippageBps: 1,
        },
        trades: {
          totalTrades: 2,
          totalPnl: '5',
          totalFees: '0.1',
          winningTrades: 2,
          losingTrades: 0,
          winRate: 1,
          avgPnl: '2.5',
          avgWin: '2.5',
          avgLoss: '0',
          profitFactor: 5,
          maxWin: '3',
          maxLoss: '0',
          maxDrawdown: '1',
        },
        account: {
          cash: 10005,
          positionQty: 0,
          avgEntryPrice: 0,
          realizedPnl: 5,
          equity: 10005,
        },
      }),
    } as any;
    const memoryManager = { trackChunk: jest.fn(), getUsageMB: () => 10 } as unknown as MemoryManager;
    const registration = { workerId: 'worker-test' } as WorkerRegistrationService;
    const reporter = { reportProgress: jest.fn(), reportResult: jest.fn() } as any;
    const metrics = {
      taskStarted: jest.fn(),
      taskProgress: jest.fn(),
      taskCompleted: jest.fn(),
      taskFailed: jest.fn(),
      taskCancelled: jest.fn(),
    };

    const executor = new BacktestExecutor(
      dataLoader,
      statusStore,
      progressReporter,
      strategyRunner,
      memoryManager,
      registration,
      reporter,
      metrics as any,
    );

    return { executor, statusStore, strategyRunner };
  };

  it('completes task and updates status', async () => {
    const { executor, statusStore } = createExecutor();

    await executor.execute('task-1', config);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const status = statusStore.getTaskStatus('task-1');
    expect(status.status).toBe(TaskStatus.Completed);
    expect(status.progress).toBe(1);
    expect(status.metrics?.processedBars).toBe(10);
    expect(status.metrics?.totalOrders).toBe(2);
    expect(status.metrics?.equity).toBe(10005);
  });

  it('cancels task via abort controller', async () => {
    const dataLoader = {
      estimateTotalBars: () => 10,
      stream: async function* (_: TaskConfigDto, signal?: AbortSignal) {
        let count = 0;
        while (count < 10) {
          if (signal?.aborted) {
            const error = new Error('Task cancelled');
            error.name = 'AbortError';
            throw error;
          }
          yield [
            {
              timestamp: new Date().toISOString(),
              open: 1,
              high: 1.2,
              low: 0.8,
              close: 1,
              volume: 1,
            },
          ];
          count++;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      },
    } as any;

    const statusStore = new TaskStatusStore();
    const progressReporter = new ProgressReporter(statusStore);
    const strategyRunner = {
      runChunk: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockReturnValue({
        execution: {
          totalOrders: 0,
          filledOrders: 0,
          cancelledOrders: 0,
          totalVolume: '0',
          totalFees: '0',
          avgSlippageBps: 0,
        },
        trades: {
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
        },
        account: {
          cash: 10000,
          positionQty: 0,
          avgEntryPrice: 0,
          realizedPnl: 0,
          equity: 10000,
        },
      }),
    } as any;
    const memoryManager = { trackChunk: jest.fn(), getUsageMB: () => 10 } as unknown as MemoryManager;
    const registration = { workerId: 'worker-test' } as WorkerRegistrationService;
    const reporter = { reportProgress: jest.fn(), reportResult: jest.fn() } as any;
    const metrics = {
      taskStarted: jest.fn(),
      taskProgress: jest.fn(),
      taskCompleted: jest.fn(),
      taskFailed: jest.fn(),
      taskCancelled: jest.fn(),
    };

    const executor = new BacktestExecutor(
      dataLoader,
      statusStore,
      progressReporter,
      strategyRunner,
      memoryManager,
      registration,
      reporter,
      metrics as any,
    );

    await executor.execute('task-2', config);
    executor.cancel('task-2');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(statusStore.getTaskStatus('task-2').status).toBe(TaskStatus.Cancelled);
  });
});
