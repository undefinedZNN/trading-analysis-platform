import { DataAggregationService } from './data-aggregation.service';
import { DatasetEntity } from '../entities/dataset.entity';
import {
  DatasetAggregationEntity,
  AggregationStatus,
} from '../entities/dataset-aggregation.entity';
import {
  AggregationTaskEntity,
  AggregationTaskStatus,
  TriggerType,
} from '../entities/aggregation-task.entity';

type RepoMock<T> = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  find: jest.Mock;
  exist: jest.Mock;
};

const createRepoMock = <T>(): RepoMock<T> => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  find: jest.fn(),
  exist: jest.fn(),
});

class TestableDataAggregationService extends DataAggregationService {
  dispatchedTaskIds: number[] = [];

  protected async dispatchTaskExecution(task: AggregationTaskEntity): Promise<void> {
    if (task.taskId) {
      this.dispatchedTaskIds.push(task.taskId);
    }
  }
}

describe('DataAggregationService', () => {
  let datasetRepo: RepoMock<DatasetEntity>;
  let aggregationRepo: RepoMock<DatasetAggregationEntity>;
  let taskRepo: RepoMock<AggregationTaskEntity>;
  let service: TestableDataAggregationService;

  beforeEach(() => {
    datasetRepo = createRepoMock();
    aggregationRepo = createRepoMock();
    taskRepo = createRepoMock();
    service = new TestableDataAggregationService(
      datasetRepo as any,
      aggregationRepo as any,
      taskRepo as any,
    );
  });

  describe('buildAggregationQueryPlan', () => {
    it('should build SQL plan with correct interval and escaping', () => {
      const config = {
        sourceGranularity: '1m',
        targetGranularity: '5m',
        sourcePaths: ['/tmp/a.parquet', '/tmp/b.parquet'],
        outputPath: '/tmp/output.parquet',
        timeStart: new Date('2024-01-01T00:00:00Z'),
        timeEnd: new Date('2024-01-01T01:00:00Z'),
      };

      const plan = service.buildAggregationQueryPlan(config);

      expect(plan.intervalSeconds).toBe(300);
      expect(plan.selectSql).toContain("read_parquet(['/tmp/a.parquet', '/tmp/b.parquet'])");
      expect(plan.selectSql).toContain("timestamp >= TIMESTAMP '2024-01-01T00:00:00.000Z'");
      expect(plan.selectSql).toContain("timestamp < TIMESTAMP '2024-01-01T01:00:00.000Z'");
      expect(plan.exportSql).toContain("COPY (");
      expect(plan.exportSql).toContain("/tmp/output.parquet");
    });

    it('should throw when source paths are empty', () => {
      expect(() =>
        service.buildAggregationQueryPlan({
          sourceGranularity: '1m',
          targetGranularity: '5m',
          sourcePaths: [],
          outputPath: '/tmp/out.parquet',
          timeStart: new Date(),
          timeEnd: new Date(),
        }),
      ).toThrow('缺少聚合源文件，无法生成 SQL');
    });
  });

  describe('createAggregationTasks', () => {
    it('creates tasks for valid granularities and dispatches them', async () => {
      const dataset: DatasetEntity = {
        datasetId: 1,
        granularity: '1m',
        tradingPair: 'BTC/USDT',
        path: 'source/btc/1m',
        checksum: 'abc',
        labels: [],
        timeStart: new Date('2024-01-01T00:00:00Z'),
        timeEnd: new Date('2024-01-01T02:00:00Z'),
        rowCount: 1000,
        source: 'exchange',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as DatasetEntity;

      datasetRepo.findOne.mockResolvedValue(dataset);
      aggregationRepo.findOne.mockResolvedValue(null);
      aggregationRepo.create.mockImplementation((payload) => payload);

      let aggregationIdCounter = 1;
      aggregationRepo.save.mockImplementation(async (entity) => ({
        ...entity,
        aggregationId: aggregationIdCounter++,
      }));

      taskRepo.create.mockImplementation((payload) => payload);
      let taskIdCounter = 1;
      const savedTasks: AggregationTaskEntity[] = [];
      taskRepo.save.mockImplementation(async (entity) => {
        const saved = { ...entity, taskId: taskIdCounter++ } as AggregationTaskEntity;
        savedTasks.push(saved);
        return saved;
      });

      const tasks = await service.createAggregationTasks(dataset.datasetId);

      expect(tasks).toHaveLength(2); // default granularities 5m + 1h
      expect(savedTasks.map((task) => task.targetGranularity)).toEqual(['5m', '1h']);
      expect(service.dispatchedTaskIds).toEqual(savedTasks.map((task) => task.taskId));
      expect(aggregationRepo.create).toHaveBeenCalledTimes(2);
    });
  });
});
