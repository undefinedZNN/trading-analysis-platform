import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskLogsService } from './task-logs.service';
import { TaskLogEntity, LogLevel } from './entities';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  createQueryBuilder?: jest.Mock;
};

const createMockRepository = (): MockRepository => {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    getMany: jest.fn(async () => []),
    getRawMany: jest.fn(async () => []),
    delete: jest.fn(() => qb),
    execute: jest.fn(async () => ({ affected: 0 })),
  };

  return {
    create: jest.fn((input) => ({
      ...input,
      logId: '1',
      loggedAt: new Date(),
    })),
    save: jest.fn(async (entity) => entity),
    find: jest.fn(),
    delete: jest.fn(async () => ({ affected: 0 })),
    createQueryBuilder: jest.fn(() => qb),
  };
};

describe('TaskLogsService', () => {
  let service: TaskLogsService;
  let repository: MockRepository<TaskLogEntity>;

  const mockLog: TaskLogEntity = {
    logId: '1',
    taskId: 'task-id-123',
    level: LogLevel.INFO,
    message: 'Test log message',
    module: 'Orchestrator',
    metadata: { eventType: 'BAR', price: 50000 },
    loggedAt: new Date('2024-01-01T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskLogsService,
        {
          provide: getRepositoryToken(TaskLogEntity),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get(TaskLogsService);
    repository = module.get(getRepositoryToken(TaskLogEntity)) as MockRepository<TaskLogEntity>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('应该成功创建日志记录', async () => {
      repository.save!.mockResolvedValue(mockLog);

      const result = await service.create(
        'task-id-123',
        LogLevel.INFO,
        'Test message',
        'Orchestrator',
        { key: 'value' },
      );

      expect(repository.create).toHaveBeenCalledWith({
        taskId: 'task-id-123',
        level: LogLevel.INFO,
        message: 'Test message',
        module: 'Orchestrator',
        metadata: { key: 'value' },
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockLog);
    });

    it('应该创建没有module和metadata的日志', async () => {
      repository.save!.mockResolvedValue(mockLog);

      await service.create('task-id-123', LogLevel.ERROR, 'Error message');

      expect(repository.create).toHaveBeenCalledWith({
        taskId: 'task-id-123',
        level: LogLevel.ERROR,
        message: 'Error message',
        module: undefined,
        metadata: undefined,
      });
    });
  });

  describe('createBatch', () => {
    it('应该批量创建日志记录', async () => {
      const logs = [
        {
          taskId: 'task-id-123',
          level: LogLevel.INFO,
          message: 'Message 1',
        },
        {
          taskId: 'task-id-123',
          level: LogLevel.DEBUG,
          message: 'Message 2',
          module: 'StrategySandbox',
        },
      ];

      const savedLogs = logs.map((log, idx) => ({
        ...log,
        logId: String(idx + 1),
        loggedAt: new Date(),
      }));

      repository.save!.mockResolvedValue(savedLogs);

      const result = await service.createBatch(logs);

      expect(repository.create).toHaveBeenCalledTimes(2);
      expect(repository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ message: 'Message 1' }),
          expect.objectContaining({ message: 'Message 2' }),
        ]),
      );
    });
  });

  describe('findByTask', () => {
    it('应该返回任务的日志列表', async () => {
      const logs = [mockLog];
      const qb = repository.createQueryBuilder!();
      qb.getMany.mockResolvedValue(logs);

      const result = await service.findByTask('task-id-123', { limit: 100 });

      expect(qb.where).toHaveBeenCalledWith('log.task_id = :taskId', {
        taskId: 'task-id-123',
      });
      expect(qb.orderBy).toHaveBeenCalledWith('log.logged_at', 'DESC');
      expect(qb.limit).toHaveBeenCalledWith(101); // limit + 1
      expect(result.logs).toEqual(logs);
      expect(result.hasMore).toBe(false);
    });

    it('应该支持日志级别筛选', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findByTask('task-id-123', {
        level: LogLevel.ERROR,
        limit: 100,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('log.level = :level', {
        level: LogLevel.ERROR,
      });
    });

    it('应该支持关键词搜索', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findByTask('task-id-123', {
        keyword: 'error',
        limit: 100,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('log.message ILIKE :keyword', {
        keyword: '%error%',
      });
    });

    it('应该支持下拉加载（before参数）', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findByTask('task-id-123', {
        before: '100',
        limit: 100,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('log.log_id < :before', {
        before: '100',
      });
    });

    it('应该正确判断是否有更多数据', async () => {
      const logs = Array(101).fill(mockLog); // 101条数据
      const qb = repository.createQueryBuilder!();
      qb.getMany.mockResolvedValue(logs);

      const result = await service.findByTask('task-id-123', { limit: 100 });

      expect(result.logs).toHaveLength(100); // 移除多余的一条
      expect(result.hasMore).toBe(true);
    });

    it('没有更多数据时hasMore应该为false', async () => {
      const logs = Array(50).fill(mockLog);
      const qb = repository.createQueryBuilder!();
      qb.getMany.mockResolvedValue(logs);

      const result = await service.findByTask('task-id-123', { limit: 100 });

      expect(result.logs).toHaveLength(50);
      expect(result.hasMore).toBe(false);
    });

    it('应该使用自定义limit', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findByTask('task-id-123', { limit: 50 });

      expect(qb.limit).toHaveBeenCalledWith(51);
    });
  });

  describe('findLatest', () => {
    it('应该返回最新的日志', async () => {
      const logs = [mockLog];
      repository.find!.mockResolvedValue(logs);

      const result = await service.findLatest('task-id-123', 100);

      expect(repository.find).toHaveBeenCalledWith({
        where: { taskId: 'task-id-123' },
        order: { loggedAt: 'DESC' },
        take: 100,
      });
      expect(result).toEqual(logs);
    });

    it('应该使用默认limit', async () => {
      repository.find!.mockResolvedValue([]);

      await service.findLatest('task-id-123');

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });

    it('应该使用自定义limit', async () => {
      repository.find!.mockResolvedValue([]);

      await service.findLatest('task-id-123', 50);

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });
  });

  describe('countByLevel', () => {
    it('应该返回各级别的日志数量', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getRawMany.mockResolvedValue([
        { level: 'info', count: '10' },
        { level: 'error', count: '5' },
        { level: 'warn', count: '3' },
        { level: 'debug', count: '2' },
      ]);

      const result = await service.countByLevel('task-id-123');

      expect(qb.where).toHaveBeenCalledWith('log.task_id = :taskId', {
        taskId: 'task-id-123',
      });
      expect(qb.groupBy).toHaveBeenCalledWith('log.level');
      expect(result).toEqual({
        total: 20,
        info: 10,
        error: 5,
        warn: 3,
        debug: 2,
      });
    });

    it('没有日志时应该返回0', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getRawMany.mockResolvedValue([]);

      const result = await service.countByLevel('task-id-123');

      expect(result).toEqual({
        total: 0,
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      });
    });

    it('部分级别有日志时应该正确统计', async () => {
      const qb = repository.createQueryBuilder!();
      qb.getRawMany.mockResolvedValue([
        { level: 'info', count: '15' },
        { level: 'error', count: '1' },
      ]);

      const result = await service.countByLevel('task-id-123');

      expect(result).toEqual({
        total: 16,
        info: 15,
        error: 1,
        warn: 0,
        debug: 0,
      });
    });
  });

  describe('removeByTask', () => {
    it('应该删除任务的所有日志', async () => {
      repository.delete!.mockResolvedValue({ affected: 42 } as any);

      const result = await service.removeByTask('task-id-123');

      expect(repository.delete).toHaveBeenCalledWith({ taskId: 'task-id-123' });
      expect(result).toBe(42);
    });

    it('没有日志时应该返回0', async () => {
      repository.delete!.mockResolvedValue({ affected: 0 } as any);

      const result = await service.removeByTask('task-id-123');

      expect(result).toBe(0);
    });
  });

  describe('cleanOldLogs', () => {
    it('应该清理指定日期之前的日志', async () => {
      const beforeDate = new Date('2024-01-01T00:00:00Z');
      const qb = repository.createQueryBuilder!();
      qb.execute.mockResolvedValue({ affected: 100 });

      const result = await service.cleanOldLogs(beforeDate);

      expect(qb.delete).toHaveBeenCalled();
      expect(qb.where).toHaveBeenCalledWith('logged_at < :beforeDate', { beforeDate });
      expect(result).toBe(100);
    });

    it('没有旧日志时应该返回0', async () => {
      const qb = repository.createQueryBuilder!();
      qb.execute.mockResolvedValue({ affected: 0 });

      const result = await service.cleanOldLogs(new Date());

      expect(result).toBe(0);
    });
  });

  describe('便捷方法', () => {
    beforeEach(() => {
      repository.save!.mockResolvedValue(mockLog);
    });

    it('debug() 应该创建DEBUG级别日志', async () => {
      await service.debug('task-id', 'Debug message', 'TestModule', { key: 'val' });

      expect(repository.create).toHaveBeenCalledWith({
        taskId: 'task-id',
        level: LogLevel.DEBUG,
        message: 'Debug message',
        module: 'TestModule',
        metadata: { key: 'val' },
      });
    });

    it('info() 应该创建INFO级别日志', async () => {
      await service.info('task-id', 'Info message');

      expect(repository.create).toHaveBeenCalledWith({
        taskId: 'task-id',
        level: LogLevel.INFO,
        message: 'Info message',
        module: undefined,
        metadata: undefined,
      });
    });

    it('warn() 应该创建WARN级别日志', async () => {
      await service.warn('task-id', 'Warning message', 'RiskEngine');

      expect(repository.create).toHaveBeenCalledWith({
        taskId: 'task-id',
        level: LogLevel.WARN,
        message: 'Warning message',
        module: 'RiskEngine',
        metadata: undefined,
      });
    });

    it('error() 应该创建ERROR级别日志', async () => {
      await service.error('task-id', 'Error message', 'Orchestrator', {
        errorCode: 500,
      });

      expect(repository.create).toHaveBeenCalledWith({
        taskId: 'task-id',
        level: LogLevel.ERROR,
        message: 'Error message',
        module: 'Orchestrator',
        metadata: { errorCode: 500 },
      });
    });
  });
});

