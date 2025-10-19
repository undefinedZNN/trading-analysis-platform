import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradingDataService } from './trading-data.service';
import { DatasetEntity } from './entities/dataset.entity';
import { ImportTaskEntity, ImportStatus } from './entities/import-task.entity';
import { BadRequestException } from '@nestjs/common';
import { ImportProcessingService } from './services/import-processing.service';
import { resolveDatasetPath } from '../config/storage.config';
import { dirname, join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { ParquetWriter, ParquetSchema } from 'parquetjs-lite';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockRepository = (): MockRepository => ({
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
});

describe('TradingDataService', () => {
  let service: TradingDataService;
  let datasetRepository: jest.Mocked<MockRepository<DatasetEntity>>;
  let importRepository: jest.Mocked<MockRepository<ImportTaskEntity>>;
  let importProcessingService: {
    scheduleProcessing: jest.Mock;
  };

  beforeEach(async () => {
    importProcessingService = {
      scheduleProcessing: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradingDataService,
        {
          provide: getRepositoryToken(DatasetEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(ImportTaskEntity),
          useValue: createMockRepository(),
        },
        {
          provide: ImportProcessingService,
          useValue: importProcessingService,
        },
      ],
    }).compile();

    service = module.get<TradingDataService>(TradingDataService);
    datasetRepository = module.get(getRepositoryToken(DatasetEntity));
    importRepository = module.get(getRepositoryToken(ImportTaskEntity));

    datasetRepository.save!.mockImplementation(async (entity) => entity);
    importRepository.save!.mockImplementation(async (entity) => entity);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    rmSync(resolveDatasetPath('test'), { recursive: true, force: true });
  });

  it('更新数据集标签时会去重、裁剪并限制数量', async () => {
    const dataset = {
      datasetId: 1,
      labels: [],
    } as DatasetEntity;
    datasetRepository.findOne!.mockResolvedValue(dataset);

    const result = await service.updateDatasetMetadata(1, {
      labels: ['  Foo  ', 'Foo', 'Bar'.repeat(10)],
    });

    expect(result.labels).toEqual(['Foo', 'Bar'.repeat(10).slice(0, 25)]);
    expect(datasetRepository.save).toHaveBeenCalledTimes(1);
  });

  it('标签数量超过上限时抛出异常', async () => {
    const dataset = {
      datasetId: 1,
      labels: [],
    } as DatasetEntity;
    datasetRepository.findOne!.mockResolvedValue(dataset);

    const labels = Array.from({ length: 21 }, (_, index) => `tag-${index}`);

    await expect(
      service.updateDatasetMetadata(1, { labels }),
    ).rejects.toThrow(BadRequestException);
  });

  it('导入任务状态非法流转时抛出异常', async () => {
    const importTask = {
      importId: 1,
      status: ImportStatus.Completed,
      progress: 100,
    } as ImportTaskEntity;
    importRepository.findOne!.mockResolvedValue(importTask);

    await expect(
      service.updateImportStatus({
        importId: 1,
        status: ImportStatus.Processing,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('导入任务标记完成时自动补全进度与结束时间', async () => {
    const importTask = {
      importId: 1,
      status: ImportStatus.Processing,
      progress: 50,
    } as ImportTaskEntity;
    importRepository.findOne!.mockResolvedValue(importTask);

    const result = await service.updateImportStatus({
      importId: 1,
      status: ImportStatus.Completed,
    });

    expect(result.progress).toBe(100);
    expect(result.finishedAt).toBeInstanceOf(Date);
    expect(result.stage).toBe('completed');
  });

  it('软删除已删除的数据集会提示错误', async () => {
    const dataset = {
      datasetId: 1,
      deletedAt: new Date(),
    } as DatasetEntity;
    datasetRepository.findOne!.mockResolvedValue(dataset);

    await expect(service.softDeleteDataset(1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('恢复已删除的数据集时清空 deletedAt 并记录操作人', async () => {
    const dataset = {
      datasetId: 1,
      deletedAt: new Date(),
    } as DatasetEntity;
    datasetRepository.findOne!.mockResolvedValue(dataset);

    datasetRepository.restore!.mockResolvedValue({});

    const result = await service.restoreDataset(1, 'tester');

    expect(datasetRepository.restore).toHaveBeenCalledWith({ datasetId: 1 });
    expect(result.deletedAt).toBeNull();
    expect(result.updatedBy).toBe('tester');
  });

  it('分页查询导入任务并按条件过滤', async () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest
        .fn()
        .mockResolvedValue([[{ importId: 1 } as ImportTaskEntity], 1]),
    };

    importRepository.createQueryBuilder!.mockReturnValue(qb);

    const result = await service.listImports({
      page: 2,
      pageSize: 5,
      status: ImportStatus.Completed,
      source: 'binance',
      tradingPair: 'BTC/USDT',
      keyword: 'error',
    });

    expect(importRepository.createQueryBuilder).toHaveBeenCalledWith('import');
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result.total).toBe(1);
    expect(result.items[0].importId).toBe(1);
  });

  it('重试失败导入任务会复用原始文件并重置状态', async () => {
    const importTask = {
      importId: 10,
      status: ImportStatus.Failed,
      storedFilePath: '10/data.csv',
      sourceFile: 'data.csv',
      metadata: {
        tradingPair: 'BTC/USDT',
        granularity: '1m',
        labels: ['crypto'],
      },
      createdBy: 'tester',
    } as unknown as ImportTaskEntity;

    importRepository.findOne!.mockResolvedValue(importTask);
    importRepository.update!.mockResolvedValue(undefined);
    importRepository.findOneOrFail!.mockResolvedValue(importTask);

    await service.retryImport(importTask.importId, {
      reuseOriginalFile: true,
    });

    expect(importRepository.update).toHaveBeenCalledWith(importTask.importId, expect.any(Object));
    expect(importProcessingService.scheduleProcessing).toHaveBeenCalledWith(
      importTask,
      expect.objectContaining({ tradingPair: 'BTC/USDT', granularity: '1m' }),
    );
  });

  it('按更大粒度聚合 K 线数据', async () => {
    const relativePath = join(
      'test',
      'btc',
      'usdt',
      'dt=2022-01-01',
      'hour=00',
      'batch_1.parquet',
    );
    const absolutePath = resolveDatasetPath(relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });

    const rows = [
      ['2022-01-01T00:00:00Z', 10, 11, 9, 10.5, 1],
      ['2022-01-01T00:00:01Z', 10.5, 12, 10, 11, 2],
      ['2022-01-01T00:00:02Z', 11, 11.5, 10.8, 11.2, 3],
      ['2022-01-01T00:00:03Z', 11.2, 12, 11, 11.8, 4],
      ['2022-01-01T00:00:04Z', 11.8, 12.5, 11.5, 12, 5],
      ['2022-01-01T00:00:05Z', 12, 13, 11.8, 12.5, 6],
    ];
    const schema = new ParquetSchema({
      timestamp: { type: 'TIMESTAMP_MILLIS' },
      open: { type: 'DOUBLE' },
      high: { type: 'DOUBLE' },
      low: { type: 'DOUBLE' },
      close: { type: 'DOUBLE' },
      volume: { type: 'DOUBLE' },
    });
    const writer = await ParquetWriter.openFile(schema, absolutePath);
    for (const row of rows) {
      await writer.appendRow({
        timestamp: new Date(row[0]).getTime(),
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[5],
      });
    }
    await writer.close();

    expect(existsSync(absolutePath)).toBe(true);

    const dataset: DatasetEntity = {
      datasetId: 1,
      source: 'test',
      tradingPair: 'BTC/USDT',
      granularity: '1s',
      path: 'test/btc/usdt',
      timeStart: new Date('2022-01-01T00:00:00Z'),
      timeEnd: new Date('2022-01-01T00:00:05Z'),
      rowCount: 6,
      checksum: 'checksum',
      labels: [],
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      importTasks: [],
      batches: [
        {
          path: relativePath,
          datasetId: 1,
          importId: 999,
          timeStart: new Date('2022-01-01T00:00:00Z'),
          timeEnd: new Date('2022-01-01T00:00:05Z'),
          rowCount: 6,
          checksum: 'checksum',
          datasetBatchId: 1,
          createdAt: new Date(),
        } as any,
      ],
    };

    datasetRepository.findOne!.mockResolvedValue(dataset);

    const result = await service.getDatasetCandles(dataset.datasetId, {
      resolution: '3s',
    });

    expect(result.candles).toHaveLength(2);
    expect(result.candles[0]).toMatchObject({
      time: Math.floor(new Date('2022-01-01T00:00:00Z').getTime() / 1000),
      open: 10,
      high: 12,
      low: 9,
      close: 11.2,
      volume: 6,
    });
    expect(result.candles[1]).toMatchObject({
      time: Math.floor(new Date('2022-01-01T00:00:03Z').getTime() / 1000),
      open: 11.2,
      high: 13,
      low: 11,
      close: 12.5,
      volume: 15,
    });
  });
});
