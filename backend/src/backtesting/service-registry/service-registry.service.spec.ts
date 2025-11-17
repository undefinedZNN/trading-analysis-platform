import { ServiceRegistryService } from './service-registry.service';

describe('ServiceRegistryService', () => {
  let service: ServiceRegistryService;

  beforeEach(() => {
    service = new ServiceRegistryService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('registers and selects workers', () => {
    service.register({
      workerId: 'worker-1',
      host: 'localhost',
      port: 3100,
      capabilities: {
        maxConcurrentTasks: 2,
        supportedStrategies: ['*'],
      },
    });

    const worker = service.selectWorker();
    expect(worker?.workerId).toBe('worker-1');
  });

  it('filters workers by supported strategies', () => {
    service.register({
      workerId: 'worker-a',
      host: 'localhost',
      port: 3101,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedStrategies: ['strategy-a'],
      },
    });

    service.register({
      workerId: 'worker-b',
      host: 'localhost',
      port: 3102,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedStrategies: ['strategy-b'],
      },
    });

    const worker = service.selectWorker({ strategyId: 'strategy-b' });
    expect(worker?.workerId).toBe('worker-b');
  });

  it('updates worker load on heartbeat', () => {
    service.register({
      workerId: 'worker-load',
      host: 'localhost',
      port: 3103,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedStrategies: ['*'],
      },
    });

    service.heartbeat({
      workerId: 'worker-load',
      status: 'busy',
      currentLoad: 1,
      metrics: { runningTasks: 1 },
    });

    const worker = service.getWorker('worker-load');
    expect(worker?.currentLoad).toBe(1);
    expect(worker?.status).toBe('busy');
  });
});
