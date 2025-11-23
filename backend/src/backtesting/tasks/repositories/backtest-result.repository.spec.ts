import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BacktestResultRepository } from './backtest-result.repository';
import { BacktestResultEntity } from '../entities/backtest-result.entity';
import { CreateBacktestResultDto } from '../dto';

describe('BacktestResultRepository', () => {
  let repository: BacktestResultRepository;
  let typeormRepository: Repository<BacktestResultEntity>;

  const mockTypeormRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    merge: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BacktestResultRepository,
        {
          provide: getRepositoryToken(BacktestResultEntity),
          useValue: mockTypeormRepository,
        },
      ],
    }).compile();

    repository = module.get<BacktestResultRepository>(BacktestResultRepository);
    typeormRepository = module.get<Repository<BacktestResultEntity>>(
      getRepositoryToken(BacktestResultEntity),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new backtest result', async () => {
      const createDto: CreateBacktestResultDto = {
        taskId: 'task-123',
        resultName: '全量数据',
        isPrimary: true,
        tradesCountTotal: 100,
        tradesCountFiltered: 100,
        initialCash: 100000,
        finalValue: 120000,
        totalPnl: 20000,
        totalReturnPct: 20,
        totalTrades: 100,
        winningTrades: 60,
        losingTrades: 40,
        winRate: 60,
        avgProfitPerTrade: 200,
      };

      const mockResult = { resultId: 'result-123', ...createDto };
      mockTypeormRepository.create.mockReturnValue(mockResult);
      mockTypeormRepository.save.mockResolvedValue(mockResult);

      const result = await repository.create(createDto);

      expect(result).toEqual(mockResult);
      expect(mockTypeormRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockTypeormRepository.save).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('findById', () => {
    it('should return a result when found', async () => {
      const mockResult = { resultId: 'result-123', resultName: '全量数据' };
      mockTypeormRepository.findOne.mockResolvedValue(mockResult);

      const result = await repository.findById('result-123');

      expect(result).toEqual(mockResult);
      expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
        where: { resultId: 'result-123' },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      mockTypeormRepository.findOne.mockResolvedValue(null);

      await expect(repository.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a result', async () => {
      const mockResult = {
        resultId: 'result-123',
        isPrimary: false,
        resultName: '旧名称',
      };
      const updateDto = { resultName: '新名称' };

      mockTypeormRepository.findOne.mockResolvedValue(mockResult);
      mockTypeormRepository.merge.mockImplementation((target, source) => {
        Object.assign(target, source);
        return target;
      });
      mockTypeormRepository.save.mockResolvedValue({
        ...mockResult,
        ...updateDto,
      });

      const result = await repository.update('result-123', updateDto);

      expect(result.resultName).toBe('新名称');
      expect(mockTypeormRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when result not found', async () => {
      mockTypeormRepository.findOne.mockResolvedValue(null);

      await expect(
        repository.update('non-existent', { resultName: '新名称' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when updating primary result', async () => {
      const mockResult = {
        resultId: 'result-123',
        isPrimary: true,
      };
      mockTypeormRepository.findOne.mockResolvedValue(mockResult);

      await expect(
        repository.update('result-123', { resultName: '新名称' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete a non-primary result', async () => {
      const mockResult = {
        resultId: 'result-123',
        isPrimary: false,
      };
      mockTypeormRepository.findOne.mockResolvedValue(mockResult);
      mockTypeormRepository.delete.mockResolvedValue({ affected: 1 });

      await repository.delete('result-123');

      expect(mockTypeormRepository.delete).toHaveBeenCalledWith('result-123');
    });

    it('should throw BadRequestException when deleting primary result', async () => {
      const mockResult = {
        resultId: 'result-123',
        isPrimary: true,
      };
      mockTypeormRepository.findOne.mockResolvedValue(mockResult);

      await expect(repository.delete('result-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findPrimaryByTaskId', () => {
    it('should return primary result when exists', async () => {
      const mockResult = {
        resultId: 'result-123',
        taskId: 'task-123',
        isPrimary: true,
      };
      mockTypeormRepository.findOne.mockResolvedValue(mockResult);

      const result = await repository.findPrimaryByTaskId('task-123');

      expect(result).toEqual(mockResult);
      expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
        where: { taskId: 'task-123', isPrimary: true },
      });
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated results', async () => {
      const mockResults = [
        { resultId: 'result-1', taskId: 'task-123' },
        { resultId: 'result-2', taskId: 'task-123' },
      ];
      mockTypeormRepository.findAndCount.mockResolvedValue([mockResults, 10]);

      const result = await repository.findWithPagination({
        taskId: 'task-123',
        page: 1,
        limit: 2,
      });

      expect(result).toEqual({
        results: mockResults,
        total: 10,
        page: 1,
        pageSize: 2,
      });
    });
  });

  describe('hasPrimaryResult', () => {
    it('should return true when primary result exists', async () => {
      mockTypeormRepository.count.mockResolvedValue(1);

      const result = await repository.hasPrimaryResult('task-123');

      expect(result).toBe(true);
    });

    it('should return false when no primary result', async () => {
      mockTypeormRepository.count.mockResolvedValue(0);

      const result = await repository.hasPrimaryResult('task-123');

      expect(result).toBe(false);
    });
  });
});

