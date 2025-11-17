import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkerModule } from '../src/worker.module';
import { TasksController } from '../src/controllers/tasks.controller';
import { TaskStatus } from '@trading-platform/backtesting-contracts';

describe('TasksController', () => {
  let app: INestApplication;
  let controller: TasksController;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    controller = app.get(TasksController);
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts execute requests and exposes task status', async () => {
    await controller.execute({
      taskId: 'task-e2e-1',
      config: {
        strategyId: 'demo-strategy',
        datasetId: 'ds-1',
        timeframe: '1m',
        timeRange: {
          start: '2023-01-01T00:00:00Z',
          end: '2023-01-02T00:00:00Z',
        },
        parameters: {},
      },
    });

    let status: ReturnType<typeof controller.getStatus> | undefined;
    for (let i = 0; i < 20; i++) {
      status = controller.getStatus('task-e2e-1');
      if (status.status === TaskStatus.Completed) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(status?.taskId).toBe('task-e2e-1');
    expect(status?.status).toBe(TaskStatus.Completed);
    expect(status?.progress).toBe(1);
  });
});
