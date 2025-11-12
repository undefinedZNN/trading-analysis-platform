import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BacktestTasksService } from './backtest-tasks.service';
import { BacktestTaskEntity, BacktestTaskStatus } from './entities';
import { CreateBacktestTaskDto, UpdateBacktestTaskDto, SortField, SortOrder } from './dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  createQueryBuilder?: jest.Mock;
};

const createMockRepository = (): MockRepository => {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn(async () => [[], 0]),
  };

  return {
    create: jest.fn((input) => ({
      ...input,
      taskId: 'task-id-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    save: jest.fn(async (entity) => entity),
    findOne: jest.fn(),
    remove: jest.fn(async (entity) => entity),
    createQueryBuilder: jest.fn(() => qb),
  };
};

describe('BacktestTasksService', () => {
  let service: BacktestTasksService;
  let repository: MockRepository<BacktestTaskEntity>;

  const mockTask: BacktestTaskEntity = {
    taskId: 'task-id-123',
    taskName: 'Test Task',
    taskDescription: 'Test Description',
    strategyId: 'strategy-id-456',
    scriptVersionId: 'version-id-789',
    datasetId: 1,
    strategyParams: { fastPeriod: 10, slowPeriod: 30 },
    executionConfig: {
      initialCapital: 10000,
      leverage: 1,
      slippage: 0,
      fees: { makerFee: 0.0002, takerFee: 0.0005 },
    },
    dataConfig: {
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' },
      timeframe: '1h',
    },
    status: BacktestTaskStatus.PENDING,
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as BacktestTaskEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BacktestTasksService,
        {
          provide: getRepositoryToken(BacktestTaskEntity),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get(BacktestTasksService);
    repository = module.get(getRepositoryToken(BacktestTaskEntity)) as MockRepository<BacktestTaskEntity>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('应该成功创建回测任务', async () => {
      const createDto: CreateBacktestTaskDto = {
        taskName: 'Test Task',
        taskDescription: 'Test Description',
        strategyId: 'strategy-id-456',
        scriptVersionId: 'version-id-789',
        datasetId: 1,
        strategyParams: { fastPeriod: 10, slowPeriod: 30 },
        executionConfig: {
          initialCapital: 10000,
          leverage: 1,
          slippage: 0,
          fees: { makerFee: 0.0002, takerFee: 0.0005 },
        },
        dataConfig: {
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' },
          timeframe: '1h',
        },
      };

      repository.save!.mockResolvedValue(mockTask);

      const result = await service.create(createDto, 'user-123');

      expect(repository.create).toHaveBeenCalledWith({
        ...createDto,
        status: BacktestTaskStatus.PENDING,
        progress: 0,
        createdBy: 'user-123',
        updatedBy: 'user-123',
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result.taskId).toBe('task-id-123');
      expect(result.status).toBe(BacktestTaskStatus.PENDING);
    });

    it('应该创建没有userId的任务', async () => {
      const createDto: CreateBacktestTaskDto = {
        taskName: 'Test Task',
        strategyId: 'strategy-id-456',
        scriptVersionId: 'version-id-789',
        datasetId: 1,
        strategyParams: {},
        executionConfig: {
          initialCapital: 10000,
          leverage: 1,
          slippage: 0,
          fees: { makerFee: 0.0002, takerFee: 0.0005 },
        },
        dataConfig: {
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' },
          timeframe: '1h',
        },
      };

      repository.save!.mockResolvedValue(mockTask);

      await service.create(createDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: undefined,
          updatedBy: undefined,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('应该返回任务列表和分页信息', async () => {
      const tasks = [mockTask];
      const qb = repository.createQueryBuilder!();
      qb.getManyAndCount.mockResolvedValue([tasks, 1]);

      const result = await service.findAll({
        page: 1,
        pageSize: 20,
      });

      expect(result.tasks).toEqual(tasks);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('应该支持关键词搜索', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        keyword: 'test',
        page: 1,
        pageSize: 20,
      });

      expect(qb.where).toHaveBeenCalledWith(
        '(task.task_name ILIKE :keyword OR task.task_description ILIKE :keyword)',
        { keyword: '%test%' },
      );
    });

    it('应该支持按strategyId筛选', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        strategyId: 'strategy-id-456',
        page: 1,
        pageSize: 20,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('task.strategy_id = :strategyId', {
        strategyId: 'strategy-id-456',
      });
    });

    it('应该支持按状态筛选', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        status: BacktestTaskStatus.RUNNING,
        page: 1,
        pageSize: 20,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('task.status = :status', {
        status: BacktestTaskStatus.RUNNING,
      });
    });

    it('应该支持排序', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        sortBy: SortField.CREATED_AT,
        sortOrder: SortOrder.DESC,
        page: 1,
        pageSize: 20,
      });

      expect(qb.orderBy).toHaveBeenCalledWith('task.createdAt', 'DESC');
    });

    it('应该支持分页', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        page: 2,
        pageSize: 10,
      });

      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
    });
  });

  describe('findOne', () => {
    it('应该返回任务详情', async () => {
      repository.findOne!.mockResolvedValue(mockTask);

      const result = await service.findOne('task-id-123');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { taskId: 'task-id-123' },
      });
      expect(result).toEqual(mockTask);
    });

    it('任务不存在时应该抛出NotFoundException', async () => {
      repository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('not-exist')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('not-exist')).rejects.toThrow(
        'Backtest task with ID not-exist not found',
      );
    });
  });

  describe('update', () => {
    it('应该成功更新任务', async () => {
      const updateDto: UpdateBacktestTaskDto = {
        taskName: 'Updated Task Name',
        taskDescription: 'Updated Description',
      };

      repository.findOne!.mockResolvedValue({ ...mockTask });
      repository.save!.mockResolvedValue({ ...mockTask, ...updateDto });

      const result = await service.update('task-id-123', updateDto, 'user-456');

      expect(repository.findOne).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          taskName: 'Updated Task Name',
          taskDescription: 'Updated Description',
          updatedBy: 'user-456',
        }),
      );
    });

    it('更新不存在的任务时应该抛出NotFoundException', async () => {
      repository.findOne!.mockResolvedValue(null);

      await expect(
        service.update('not-exist', { taskName: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('应该更新任务状态为RUNNING并设置startedAt', async () => {
      repository.findOne!.mockResolvedValue(mockTask);
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.updateStatus('task-id-123', BacktestTaskStatus.RUNNING);

      expect(result.status).toBe(BacktestTaskStatus.RUNNING);
      expect(result.startedAt).toBeDefined();
    });

    it('应该更新任务状态为COMPLETED并设置completedAt', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.RUNNING,
        startedAt: new Date(),
      });
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.updateStatus('task-id-123', BacktestTaskStatus.COMPLETED);

      expect(result.status).toBe(BacktestTaskStatus.COMPLETED);
      expect(result.completedAt).toBeDefined();
    });

    it('应该更新任务状态为FAILED并设置completedAt', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.RUNNING,
      });
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.updateStatus(
        'task-id-123',
        BacktestTaskStatus.FAILED,
        {
          errorMessage: 'Test error',
          errorStack: 'Error stack trace',
        },
      );

      expect(result.status).toBe(BacktestTaskStatus.FAILED);
      expect(result.completedAt).toBeDefined();
      expect(result.errorMessage).toBe('Test error');
      expect(result.errorStack).toBe('Error stack trace');
    });

    it('不应该重复设置startedAt', async () => {
      const existingStartedAt = new Date('2024-01-01');
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.RUNNING,
        startedAt: existingStartedAt,
      });
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.updateStatus('task-id-123', BacktestTaskStatus.RUNNING);

      expect(result.startedAt).toEqual(existingStartedAt);
    });
  });

  describe('updateProgress', () => {
    it('应该更新任务进度', async () => {
      repository.findOne!.mockResolvedValue(mockTask);
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.updateProgress('task-id-123', 50);

      expect(result.progress).toBe(50);
    });

    it('进度小于0时应该抛出BadRequestException', async () => {
      repository.findOne!.mockResolvedValue(mockTask);

      await expect(service.updateProgress('task-id-123', -1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateProgress('task-id-123', -1)).rejects.toThrow(
        'Progress must be between 0 and 100',
      );
    });

    it('进度大于100时应该抛出BadRequestException', async () => {
      repository.findOne!.mockResolvedValue(mockTask);

      await expect(service.updateProgress('task-id-123', 101)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('进度为0时应该成功', async () => {
      repository.findOne!.mockResolvedValue(mockTask);
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.updateProgress('task-id-123', 0);

      expect(result.progress).toBe(0);
    });

    it('进度为100时应该成功', async () => {
      repository.findOne!.mockResolvedValue(mockTask);
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.updateProgress('task-id-123', 100);

      expect(result.progress).toBe(100);
    });
  });

  describe('cancel', () => {
    it('应该成功取消PENDING状态的任务', async () => {
      repository.findOne!.mockResolvedValue(mockTask);
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.cancel('task-id-123');

      expect(result.status).toBe(BacktestTaskStatus.CANCELLED);
    });

    it('应该成功取消RUNNING状态的任务', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.RUNNING,
      });
      repository.save!.mockImplementation(async (entity) => entity);

      const result = await service.cancel('task-id-123');

      expect(result.status).toBe(BacktestTaskStatus.CANCELLED);
    });

    it('取消COMPLETED状态的任务时应该抛出异常', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.COMPLETED,
      });

      await expect(service.cancel('task-id-123')).rejects.toThrow(BadRequestException);
      await expect(service.cancel('task-id-123')).rejects.toThrow(
        'Cannot cancel task in completed status',
      );
    });

    it('取消FAILED状态的任务时应该抛出异常', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.FAILED,
      });

      await expect(service.cancel('task-id-123')).rejects.toThrow(BadRequestException);
    });

    it('取消CANCELLED状态的任务时应该抛出异常', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.CANCELLED,
      });

      await expect(service.cancel('task-id-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('应该成功删除PENDING状态的任务', async () => {
      repository.findOne!.mockResolvedValue(mockTask);
      repository.remove!.mockResolvedValue(mockTask);

      await service.remove('task-id-123');

      expect(repository.remove).toHaveBeenCalledWith(mockTask);
    });

    it('应该成功删除COMPLETED状态的任务', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.COMPLETED,
      });
      repository.remove!.mockResolvedValue(mockTask);

      await service.remove('task-id-123');

      expect(repository.remove).toHaveBeenCalled();
    });

    it('删除RUNNING状态的任务时应该抛出异常', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.RUNNING,
      });

      await expect(service.remove('task-id-123')).rejects.toThrow(BadRequestException);
      await expect(service.remove('task-id-123')).rejects.toThrow(
        'Cannot delete a running task',
      );
    });
  });

  describe('copyTaskConfig', () => {
    it('应该返回任务配置副本', async () => {
      repository.findOne!.mockResolvedValue({ ...mockTask });

      const result = await service.copyTaskConfig('task-id-123');

      expect(result.taskName).toBe('Test Task (Copy)');
      expect(result.strategyId).toBe(mockTask.strategyId);
      expect(result.scriptVersionId).toBe(mockTask.scriptVersionId);
      expect(result.datasetId).toBe(mockTask.datasetId);
      expect(result.strategyParams).toEqual(mockTask.strategyParams);
    });
  });

  describe('retry', () => {
    it('应该为FAILED状态的任务创建重试任务', async () => {
      const failedTask: BacktestTaskEntity = {
        ...mockTask,
        taskName: 'Test Task',
        status: BacktestTaskStatus.FAILED,
        errorMessage: 'Previous error',
      };

      repository.findOne!.mockResolvedValue({ ...failedTask });
      repository.save!.mockImplementation(async (entity) => ({
        ...entity,
        taskId: 'new-task-id',
      }));

      const result = await service.retry('task-id-123', 'user-789');

      expect(result.taskName).toBe('Test Task (Retry)');
      expect(result.status).toBe(BacktestTaskStatus.PENDING);
      expect(result.errorMessage).toBeUndefined();
    });

    it('重试非FAILED状态的任务时应该抛出异常', async () => {
      repository.findOne!.mockResolvedValue({
        ...mockTask,
        status: BacktestTaskStatus.COMPLETED,
      });

      await expect(service.retry('task-id-123')).rejects.toThrow(BadRequestException);
      await expect(service.retry('task-id-123')).rejects.toThrow(
        'Only failed tasks can be retried',
      );
    });

    it('重试PENDING状态的任务时应该抛出异常', async () => {
      repository.findOne!.mockResolvedValue(mockTask);

      await expect(service.retry('task-id-123')).rejects.toThrow(BadRequestException);
    });
  });
});

