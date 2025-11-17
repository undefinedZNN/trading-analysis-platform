import { ExecuteTaskDto } from '@trading-platform/backtesting-contracts';
import axios from 'axios';
import { WorkerClientService } from './worker-client.service';
import { ServiceRegistryService } from '../service-registry/service-registry.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WorkerClientService - multi worker contract', () => {
  let registry: ServiceRegistryService;
  let service: WorkerClientService;
  const payload: ExecuteTaskDto = {
    taskId: 'task-1',
    config: {
      strategyId: 'demo',
      datasetId: 'dataset',
      timeframe: '1m',
      timeRange: {
        start: new Date('2024-01-01T00:00:00Z').toISOString(),
        end: new Date('2024-01-02T00:00:00Z').toISOString(),
      },
      parameters: {},
    },
  };

  beforeEach(() => {
    process.env.BACKTEST_WORKER_ENABLED = 'true';
    process.env.BACKTEST_WORKER_ENDPOINTS = '';
    registry = new ServiceRegistryService();
    service = new WorkerClientService(registry);
  });

  afterEach(() => {
    registry.onModuleDestroy();
    jest.resetAllMocks();
    delete process.env.BACKTEST_WORKER_ENABLED;
    delete process.env.BACKTEST_WORKER_ENDPOINTS;
  });

  it('retries on worker failure and重分配到下一个健康节点', async () => {
    registry.register({
      workerId: 'worker-a',
      host: 'worker-a',
      port: 3101,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedStrategies: ['*'],
      },
    });
    registry.register({
      workerId: 'worker-b',
      host: 'worker-b',
      port: 3102,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedStrategies: ['*'],
      },
    });

    mockedAxios.post.mockImplementation((url) => {
      if (url.includes('worker-a')) {
        return Promise.reject(new Error('worker-a offline'));
      }
      return Promise.resolve({
        data: {
          taskId: payload.taskId,
          status: 'accepted',
          workerId: 'worker-b',
        },
      });
    });

    const response = await service.dispatchTask(payload);

    expect(response.workerId).toBe('worker-b');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(registry.getWorker('worker-a')?.currentLoad).toBe(0);
    expect(registry.getWorker('worker-b')?.currentLoad).toBe(1);
  });

  it('跳过心跳超时的 Worker 并派发至健康节点', async () => {
    const stale = registry.register({
      workerId: 'worker-stale',
      host: 'worker-stale',
      port: 3103,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedStrategies: ['*'],
      },
    });
    registry.register({
      workerId: 'worker-fresh',
      host: 'worker-fresh',
      port: 3104,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedStrategies: ['*'],
      },
    });

    stale.lastHeartbeat = Date.now() - 60_000;

    mockedAxios.post.mockResolvedValue({
      data: {
        taskId: payload.taskId,
        status: 'accepted',
        workerId: 'worker-fresh',
      },
    });

    const response = await service.dispatchTask(payload);

    expect(response.workerId).toBe('worker-fresh');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][0]).toContain('worker-fresh');
  });

  it('cancelTask 会调用目标 Worker 的取消接口', async () => {
    registry.register({
      workerId: 'worker-cancel',
      host: 'worker-cancel',
      port: 3110,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedStrategies: ['*'],
      },
    });

    mockedAxios.post.mockResolvedValue({ data: {} });

    await service.cancelTask('task-cancel', 'worker-cancel');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('http://worker-cancel:3110/tasks/task-cancel/cancel'),
      {},
      expect.objectContaining({ timeout: 5000 }),
    );
  });
});
