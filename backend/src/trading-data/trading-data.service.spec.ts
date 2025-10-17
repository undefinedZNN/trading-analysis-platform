import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradingDataService } from './trading-data.service';
import { DatasetEntity } from './entities/dataset.entity';
import { ImportTaskEntity, ImportStatus } from './entities/import-task.entity';
import { BadRequestException } from '@nestjs/common';
import { ImportProcessingService } from './services/import-processing.service';

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
});
