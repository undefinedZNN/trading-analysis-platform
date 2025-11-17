import axios from 'axios';
import { ServiceRegistryService } from '../service-registry/service-registry.service';
import { WorkerClientService } from '../worker-client/worker-client.service';
import { ExecuteTaskDto } from '@trading-platform/backtesting-contracts';

class TaskCallbackStore {
  private readonly progresses = new Map<string, any[]>();
  private readonly results = new Map<string, any>();

  recordProgress(taskId: string, payload: any) {
    const events = this.progresses.get(taskId) ?? [];
    events.push(payload);
    this.progresses.set(taskId, events);
  }

  recordResult(taskId: string, payload: any) {
    this.results.set(taskId, payload);
  }

  getProgress(taskId: string) {
    return this.progresses.get(taskId) ?? [];
  }

  getResult(taskId: string) {
    return this.results.get(taskId);
  }
}

interface WorkerServerOptions {
  workerId: string;
  host: string;
  port: number;
  heartbeatInterval?: number;
  progressInterval?: number;
  capabilities?: {
    maxConcurrentTasks: number;
    supportedStrategies: string[];
  };
}

interface WorkerTaskState {
  status: 'running' | 'completed' | 'cancelled';
  progress: number;
  timer?: NodeJS.Timeout;
}

class TestWorkerServer {
  private readonly endpoint: string;
  private readonly tasks = new Map<string, WorkerTaskState>();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    private readonly options: WorkerServerOptions,
    private readonly registry: ServiceRegistryService,
    private readonly callbacks: TaskCallbackStore,
    private readonly router: Map<string, TestWorkerServer>,
  ) {
    this.endpoint = `http://${options.host}:${options.port}`;
  }

  async start() {
    this.router.set(this.endpoint, this);
    this.registry.register({
      workerId: this.options.workerId,
      host: this.options.host,
      port: this.options.port,
      capabilities: this.options.capabilities ?? {
        maxConcurrentTasks: 1,
        supportedStrategies: ['*'],
      },
    });
    this.startHeartbeats();
  }

  async stop() {
    this.router.delete(this.endpoint);
    this.stopHeartbeats();
    this.registry.deregister(this.options.workerId, 'shutdown');
    this.tasks.forEach((task) => task.timer && clearTimeout(task.timer));
    this.tasks.clear();
  }

  stopHeartbeats() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private startHeartbeats() {
    const interval = this.options.heartbeatInterval ?? 200;
    this.heartbeatTimer = setInterval(() => {
      this.registry.heartbeat({
        workerId: this.options.workerId,
        status: this.tasks.size === 0 ? 'idle' : 'busy',
        currentLoad: this.tasks.size,
        metrics: {
          runningTasks: this.tasks.size,
          lastUpdated: new Date().toISOString(),
        },
      });
    }, interval);
  }

  handlePost(path: string, body: any) {
    if (path === '/execute') {
      const taskId = body.taskId;
      this.startTask(taskId);
      return {
        taskId,
        workerId: this.options.workerId,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      };
    }

    if (path.endsWith('/cancel')) {
      const taskId = path.split('/')[2];
      this.cancelTask(taskId);
      return { taskId, status: 'cancelled' };
    }

    throw new Error(`Unhandled POST ${path}`);
  }

  handleGet(path: string) {
    if (path.startsWith('/tasks/') && path.endsWith('/status')) {
      const taskId = path.split('/')[2];
      const task = this.tasks.get(taskId);
      return {
        taskId,
        status: task?.status ?? 'completed',
        progress: task?.progress ?? 1,
      };
    }

    throw new Error(`Unhandled GET ${path}`);
  }

  private startTask(taskId: string) {
    const state: WorkerTaskState = { status: 'running', progress: 0 };
    this.tasks.set(taskId, state);

    const tick = () => {
      if (!this.tasks.has(taskId) || state.status !== 'running') {
        return;
      }
      state.progress = Math.min(1, state.progress + 0.2);
      this.callbacks.recordProgress(taskId, {
        taskId,
        workerId: this.options.workerId,
        progress: state.progress,
        metrics: {
          runningTasks: this.tasks.size,
          updatedAt: new Date().toISOString(),
        },
      });
      if (state.progress >= 1) {
        state.status = 'completed';
        this.tasks.delete(taskId);
        this.callbacks.recordResult(taskId, {
          taskId,
          workerId: this.options.workerId,
          status: 'completed',
          metrics: { runningTasks: this.tasks.size },
        });
      } else {
        state.timer = setTimeout(tick, this.options.progressInterval ?? 150);
      }
    };

    state.timer = setTimeout(tick, this.options.progressInterval ?? 150);
  }

  private cancelTask(taskId: string) {
    const state = this.tasks.get(taskId);
    if (state?.timer) {
      clearTimeout(state.timer);
    }
    if (state) {
      state.status = 'cancelled';
      this.tasks.delete(taskId);
    }
    this.callbacks.recordResult(taskId, {
      taskId,
      workerId: this.options.workerId,
      status: 'cancelled',
      metrics: { runningTasks: this.tasks.size },
    });
  }
}

function buildTask(taskId: string): ExecuteTaskDto {
  return {
    taskId,
    config: {
      strategyId: 'demo',
      datasetId: 'dataset',
      timeframe: '1m',
      timeRange: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-02T00:00:00Z',
      },
      parameters: {},
    },
  };
}

async function waitFor(condition: () => boolean, timeout = 5000, interval = 50) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

describe('Multi worker orchestration e2e (in-process)', () => {
  let registry: ServiceRegistryService;
  let workerClient: WorkerClientService;
  let store: TaskCallbackStore;
  const router = new Map<string, TestWorkerServer>();
  const workers: TestWorkerServer[] = [];
  let axiosPostSpy: jest.SpyInstance;
  let axiosGetSpy: jest.SpyInstance;

  beforeAll(() => {
    process.env.BACKTEST_WORKER_ENABLED = 'true';
  });

  beforeEach(() => {
    registry = new ServiceRegistryService();
    workerClient = new WorkerClientService(registry);
    store = new TaskCallbackStore();

    axiosPostSpy = jest.spyOn(axios, 'post').mockImplementation(async (url, data) => {
      const parsed = new URL(url);
      const endpoint = `${parsed.protocol}//${parsed.host}`;
      const worker = router.get(endpoint);
      if (!worker) {
        throw new Error(`No worker handler for ${url}`);
      }
      const result = worker.handlePost(parsed.pathname, data);
      return { data: result };
    });

    axiosGetSpy = jest.spyOn(axios, 'get').mockImplementation(async (url) => {
      const parsed = new URL(url);
      const endpoint = `${parsed.protocol}//${parsed.host}`;
      const worker = router.get(endpoint);
      if (!worker) {
        throw new Error(`No worker handler for ${url}`);
      }
      const result = worker.handleGet(parsed.pathname);
      return { data: result };
    });
  });

  afterEach(async () => {
    for (const worker of workers.splice(0, workers.length)) {
      await worker.stop();
    }
    axiosPostSpy.mockRestore();
    axiosGetSpy.mockRestore();
    registry.onModuleDestroy();
  });

  afterAll(() => {
    delete process.env.BACKTEST_WORKER_ENABLED;
  });

  it('dispatches tasks, handles heartbeat timeout and cancellation', async () => {
    const workerA = new TestWorkerServer(
      { workerId: 'worker-a', host: 'worker-a', port: 3000 },
      registry,
      store,
      router,
    );
    const workerB = new TestWorkerServer(
      { workerId: 'worker-b', host: 'worker-b', port: 3000 },
      registry,
      store,
      router,
    );
    workers.push(workerA, workerB);
    await workerA.start();
    await workerB.start();

    await waitFor(() => registry.listWorkers().length === 2);

    const firstTask = buildTask('task-e2e-1');
    const dispatch1 = await workerClient.dispatchTask(firstTask);
    expect(['worker-a', 'worker-b']).toContain(dispatch1.workerId);
    await waitFor(() => store.getProgress('task-e2e-1').length > 0);

    const downWorkerId = dispatch1.workerId!;
    const downInfo = registry.getWorker(downWorkerId);
    if (downInfo) {
      downInfo.lastHeartbeat = Date.now() - 60_000;
      downInfo.status = 'down';
    }

    const secondTask = buildTask('task-e2e-2');
    const dispatch2 = await workerClient.dispatchTask(secondTask);
    expect(dispatch2.workerId).not.toBe(downWorkerId);
    await waitFor(() => store.getProgress('task-e2e-2').length > 0);

    await workerClient.cancelTask(secondTask.taskId, dispatch2.workerId);
    await waitFor(
      () => store.getResult('task-e2e-2')?.status === 'cancelled',
    );
    await waitFor(
      () => store.getResult('task-e2e-1')?.status === 'completed',
    );
  }, 10000);
});
