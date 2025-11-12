import { Test, TestingModule } from '@nestjs/testing';
import { BacktestTasksController } from './backtest-tasks.controller';
import { BacktestTasksService } from './backtest-tasks.service';
import { TaskLogsService } from './task-logs.service';
import { BacktestTaskEntity, BacktestTaskStatus, TaskLogEntity, LogLevel } from './entities';
import { CreateBacktestTaskDto, ListBacktestTasksDto, ListTaskLogsDto } from './dto';

describe('BacktestTasksController', () => {
  let controller: BacktestTasksController;
  let backtestTasksService: jest.Mocked<BacktestTasksService>;
  let taskLogsService: jest.Mocked<TaskLogsService>;

  const mockTask: BacktestTaskEntity = {
    taskId: 'task-id-123',
    taskName: 'Test Task',
    taskDescription: 'Test Description',
    strategyId: 'strategy-id-456',
    scriptVersionId: 'version-id-789',
    datasetId: 1,
    strategyParams: { fastPeriod: 10 },
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

  const mockLog: TaskLogEntity = {
    logId: '1',
    taskId: 'task-id-123',
    level: LogLevel.INFO,
    message: 'Test log',
    loggedAt: new Date(),
  } as TaskLogEntity;

  beforeEach(async () => {
    const backtestTasksServiceMock: Partial<jest.Mocked<BacktestTasksService>> = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      retry: jest.fn(),
      copyTaskConfig: jest.fn(),
      remove: jest.fn(),
    };

    const taskLogsServiceMock: Partial<jest.Mocked<TaskLogsService>> = {
      findByTask: jest.fn(),
      countByLevel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BacktestTasksController],
      providers: [
        { provide: BacktestTasksService, useValue: backtestTasksServiceMock },
        { provide: TaskLogsService, useValue: taskLogsServiceMock },
      ],
    }).compile();

    controller = module.get(BacktestTasksController);
    backtestTasksService = module.get(BacktestTasksService) as jest.Mocked<BacktestTasksService>;
    taskLogsService = module.get(TaskLogsService) as jest.Mocked<TaskLogsService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('应该调用service.create创建任务', async () => {
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

      backtestTasksService.create.mockResolvedValue(mockTask);

      const result = await controller.create(createDto);

      expect(backtestTasksService.create).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(mockTask);
    });
  });

  describe('findAll', () => {
    it('应该调用service.findAll查询任务列表', async () => {
      const listDto: ListBacktestTasksDto = {
        page: 1,
        pageSize: 20,
      };

      const expectedResult = {
        tasks: [mockTask],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      backtestTasksService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(listDto);

      expect(backtestTasksService.findAll).toHaveBeenCalledWith(listDto);
      expect(result).toEqual(expectedResult);
    });

    it('应该支持筛选参数', async () => {
      const listDto: ListBacktestTasksDto = {
        strategyId: 'strategy-id-456',
        status: BacktestTaskStatus.RUNNING,
        page: 1,
        pageSize: 20,
      };

      backtestTasksService.findAll.mockResolvedValue({
        tasks: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      await controller.findAll(listDto);

      expect(backtestTasksService.findAll).toHaveBeenCalledWith(listDto);
    });
  });

  describe('findOne', () => {
    it('应该调用service.findOne查询任务详情', async () => {
      backtestTasksService.findOne.mockResolvedValue(mockTask);

      const result = await controller.findOne('task-id-123');

      expect(backtestTasksService.findOne).toHaveBeenCalledWith('task-id-123');
      expect(result).toEqual(mockTask);
    });
  });

  describe('update', () => {
    it('应该调用service.update更新任务', async () => {
      const updateDto = {
        taskName: 'Updated Task',
        taskDescription: 'Updated Description',
      };

      const updatedTask = { ...mockTask, ...updateDto };
      backtestTasksService.update.mockResolvedValue(updatedTask);

      const result = await controller.update('task-id-123', updateDto);

      expect(backtestTasksService.update).toHaveBeenCalledWith('task-id-123', updateDto);
      expect(result.taskName).toBe('Updated Task');
    });
  });

  describe('cancel', () => {
    it('应该调用service.cancel取消任务', async () => {
      const cancelledTask = {
        ...mockTask,
        status: BacktestTaskStatus.CANCELLED,
      };

      backtestTasksService.cancel.mockResolvedValue(cancelledTask);

      const result = await controller.cancel('task-id-123');

      expect(backtestTasksService.cancel).toHaveBeenCalledWith('task-id-123');
      expect(result.status).toBe(BacktestTaskStatus.CANCELLED);
    });
  });

  describe('retry', () => {
    it('应该调用service.retry重试任务', async () => {
      const newTask = {
        ...mockTask,
        taskId: 'new-task-id',
        taskName: 'Test Task (Retry)',
      };

      backtestTasksService.retry.mockResolvedValue(newTask);

      const result = await controller.retry('task-id-123');

      expect(backtestTasksService.retry).toHaveBeenCalledWith('task-id-123');
      expect(result.taskId).toBe('new-task-id');
      expect(result.taskName).toBe('Test Task (Retry)');
    });
  });

  describe('copyConfig', () => {
    it('应该调用service.copyTaskConfig复制配置', async () => {
      const config: CreateBacktestTaskDto = {
        taskName: 'Test Task (Copy)',
        strategyId: 'strategy-id-456',
        scriptVersionId: 'version-id-789',
        datasetId: 1,
        strategyParams: { fastPeriod: 10 },
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

      backtestTasksService.copyTaskConfig.mockResolvedValue(config);

      const result = await controller.copyConfig('task-id-123');

      expect(backtestTasksService.copyTaskConfig).toHaveBeenCalledWith('task-id-123');
      expect(result.taskName).toBe('Test Task (Copy)');
    });
  });

  describe('remove', () => {
    it('应该调用service.remove删除任务', async () => {
      backtestTasksService.remove.mockResolvedValue(undefined);

      await controller.remove('task-id-123');

      expect(backtestTasksService.remove).toHaveBeenCalledWith('task-id-123');
    });
  });

  describe('getLogs', () => {
    it('应该调用taskLogsService.findByTask查询日志', async () => {
      const listDto: ListTaskLogsDto = {
        limit: 100,
      };

      const expectedResult = {
        logs: [mockLog],
        hasMore: false,
      };

      taskLogsService.findByTask.mockResolvedValue(expectedResult);

      const result = await controller.getLogs('task-id-123', listDto);

      expect(taskLogsService.findByTask).toHaveBeenCalledWith('task-id-123', listDto);
      expect(result).toEqual(expectedResult);
    });

    it('应该支持日志筛选参数', async () => {
      const listDto: ListTaskLogsDto = {
        level: LogLevel.ERROR,
        keyword: 'error',
        before: '100',
        limit: 50,
      };

      taskLogsService.findByTask.mockResolvedValue({
        logs: [],
        hasMore: false,
      });

      await controller.getLogs('task-id-123', listDto);

      expect(taskLogsService.findByTask).toHaveBeenCalledWith('task-id-123', listDto);
    });
  });

  describe('getLogStats', () => {
    it('应该调用taskLogsService.countByLevel查询日志统计', async () => {
      const stats = {
        total: 100,
        debug: 20,
        info: 50,
        warn: 25,
        error: 5,
      };

      taskLogsService.countByLevel.mockResolvedValue(stats);

      const result = await controller.getLogStats('task-id-123');

      expect(taskLogsService.countByLevel).toHaveBeenCalledWith('task-id-123');
      expect(result).toEqual(stats);
    });

    it('没有日志时应该返回0', async () => {
      const stats = {
        total: 0,
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      };

      taskLogsService.countByLevel.mockResolvedValue(stats);

      const result = await controller.getLogStats('task-id-123');

      expect(result.total).toBe(0);
    });
  });
});

