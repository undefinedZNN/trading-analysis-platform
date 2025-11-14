import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { mkdir } from 'fs/promises';
import * as duckdb from 'duckdb';
import { DatasetEntity } from '../entities/dataset.entity';
import { DatasetBatchEntity } from '../entities/dataset-batch.entity';
import {
  DatasetAggregationEntity,
  AggregationStatus,
} from '../entities/dataset-aggregation.entity';
import {
  AggregationTaskEntity,
  AggregationTaskStatus,
} from '../entities/aggregation-task.entity';
import { DataAggregationService } from './data-aggregation.service';
import { TriggerType } from '../entities/aggregation-task.entity';

const tempDatasetsRoot = mkdtempSync(join(tmpdir(), 'aggregation-e2e-'));

jest.mock('../../config/storage.config', () => {
  const original = jest.requireActual('../../config/storage.config');
  return {
    ...original,
    resolveDatasetPath: (relativePath: string) =>
      resolve(tempDatasetsRoot, relativePath),
  };
});

class TestAggregationService extends DataAggregationService {
  private queuedTaskIds: number[] = [];

  async flushQueuedTasks(): Promise<void> {
    while (this.queuedTaskIds.length) {
      const taskId = this.queuedTaskIds.shift();
      if (taskId) {
        await (this as unknown as { executeTask: (id: number) => Promise<void> }).executeTask(
          taskId,
        );
      }
    }
  }

  protected async dispatchTaskExecution(task: AggregationTaskEntity): Promise<void> {
    if (task.taskId) {
      this.queuedTaskIds.push(task.taskId);
    }
  }
}

type RepoMock<T> = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  exist: jest.Mock;
};

const createRepoMock = <T>(): RepoMock<T> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  exist: jest.fn(),
});

async function createSampleBatchParquet(relativePath: string, rows: number): Promise<void> {
  const absolute = resolve(tempDatasetsRoot, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  const db = new duckdb.Database(':memory:');
  const connection = db.connect();
  const createSql = `
    CREATE TABLE candles AS
    SELECT
      TIMESTAMP '2024-01-01 00:00:00' + i * INTERVAL 1 MINUTE AS timestamp,
      100 + i AS open,
      100 + i + 1 AS high,
      100 + i - 1 AS low,
      100 + i + 0.5 AS close,
      10 + i AS volume
    FROM range(${rows}) tbl(i);
  `;
  await exec(connection, createSql);
  await exec(connection, `COPY candles TO '${absolute}' (FORMAT PARQUET);`);
  connection.close();
  db.close();
}

function exec(connection: duckdb.Connection, sql: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    connection.run(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolvePromise();
      }
    });
  });
}

describe('DataAggregationService integration', () => {
  afterAll(() => {
    rmSync(tempDatasetsRoot, { recursive: true, force: true });
  });

  function setupRepositories(batchPath: string, datasetOverrides?: Partial<DatasetEntity>) {
    const datasetRepo = createRepoMock<DatasetEntity>();
    const aggregationRepo = createRepoMock<DatasetAggregationEntity>();
    const taskRepo = createRepoMock<AggregationTaskEntity>();

    const dataset: DatasetEntity = {
      datasetId: 1,
      source: 'exchange',
      tradingPair: 'BTC/USDT',
      granularity: '1m',
      path: 'exchange/BTC_USDT/1m',
      timeStart: new Date('2024-01-01T00:00:00Z'),
      timeEnd: new Date('2024-01-01T04:00:00Z'),
      rowCount: 1000,
      checksum: 'abc',
      labels: [],
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...datasetOverrides,
    };

    const batch: DatasetBatchEntity = {
      datasetBatchId: 1,
      datasetId: dataset.datasetId,
      importId: 1,
      path: batchPath,
      timeStart: dataset.timeStart,
      timeEnd: dataset.timeEnd,
      rowCount: dataset.rowCount,
      checksum: 'batch',
      createdAt: new Date(),
      dataset: undefined as any,
      importTask: undefined as any,
    };

    datasetRepo.findOne.mockImplementation(async (options) => {
      if (options?.relations?.includes('batches')) {
        return { ...dataset, batches: [batch] };
      }
      return { ...dataset };
    });
    datasetRepo.exist.mockResolvedValue(true);

    let savedAggregation: DatasetAggregationEntity | null = null;
    aggregationRepo.findOne.mockImplementation(async ({ where }) => {
      if (
        savedAggregation &&
        ((where?.datasetId === savedAggregation.datasetId &&
          where?.targetGranularity === savedAggregation.targetGranularity) ||
          where?.aggregationId === savedAggregation.aggregationId)
      ) {
        return savedAggregation;
      }
      return null;
    });
    aggregationRepo.create.mockImplementation((payload) => ({
      ...payload,
    }));
    aggregationRepo.save.mockImplementation(async (entity) => {
      savedAggregation = {
        aggregationId: 1,
        ...entity,
      } as DatasetAggregationEntity;
      return savedAggregation;
    });
    aggregationRepo.update.mockImplementation(async (_criteria, payload) => {
      if (savedAggregation) {
        Object.assign(savedAggregation, payload);
      }
    });

    const savedTasks: AggregationTaskEntity[] = [];
    taskRepo.create.mockImplementation((payload) => ({ ...payload }));
    taskRepo.save.mockImplementation(async (entity) => {
      const saved = {
        taskId: savedTasks.length + 1,
        ...entity,
        aggregation: savedAggregation,
      } as AggregationTaskEntity;
      savedTasks.push(saved);
      return saved;
    });
    taskRepo.update.mockImplementation(async (criteria, payload) => {
      const taskId =
        typeof criteria === 'number'
          ? criteria
          : (criteria as { taskId?: number })?.taskId ?? savedTasks[0]?.taskId;
      const target = savedTasks.find((task) => task.taskId === taskId);
      if (target) {
        Object.assign(target, payload);
      }
    });
    taskRepo.findOne.mockImplementation(async (options) => {
      const taskId = options?.where?.taskId;
      const target = savedTasks.find((task) => task.taskId === taskId);
      return target ? { ...target, aggregation: savedAggregation ?? target.aggregation } : null;
    });

    return {
      datasetRepo,
      aggregationRepo,
      taskRepo,
      getAggregation: () => savedAggregation,
      getLatestTask: () => savedTasks[savedTasks.length - 1],
    };
  }

  it('runs end-to-end aggregation and generates parquet output', async () => {
    const batchPath = 'exchange/BTC_USDT/1m/dt=2024-01-01/hour=00/batch.parquet';
    await createSampleBatchParquet(batchPath, 120);

    const repos = setupRepositories(batchPath);
    const service = new TestAggregationService(
      repos.datasetRepo as any,
      repos.aggregationRepo as any,
      repos.taskRepo as any,
    );

    const tasks = await service.createAggregationTasks(1, ['5m'], TriggerType.Manual, 'tester');
    expect(tasks).toHaveLength(1);
    await service.flushQueuedTasks();

    const aggregation = repos.getAggregation();
    expect(aggregation).not.toBeNull();
    expect(aggregation?.status).toBe(AggregationStatus.Completed);
    expect(aggregation?.rowCount).toBeGreaterThan(0);
    expect(aggregation?.checksum).toHaveLength(32);

    const task = repos.getLatestTask();
    expect(task.status).toBe(AggregationTaskStatus.Completed);
    expect(task.progress).toBe(100);
  });

  it('completes aggregation within performance target for medium dataset', async () => {
    const batchPath = 'exchange/BTC_USDT/1m/dt=2024-01-02/hour=00/batch.parquet';
    await createSampleBatchParquet(batchPath, 2000);

    const repos = setupRepositories(batchPath, {
      timeEnd: new Date('2024-01-02T12:00:00Z'),
    });
    const service = new TestAggregationService(
      repos.datasetRepo as any,
      repos.aggregationRepo as any,
      repos.taskRepo as any,
    );

    const tasks = await service.createAggregationTasks(1, ['1h'], TriggerType.Manual, 'perf-test');
    const start = Date.now();
    await service.flushQueuedTasks();
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000); // <5s target for sample dataset
    const aggregation = repos.getAggregation();
    expect(aggregation?.status).toBe(AggregationStatus.Completed);
  });
});
