import { Test, TestingModule } from '@nestjs/testing';
import { BacktestResultsController } from './backtest-results.controller';
import { BacktestResultService } from '../services/backtest-result.service';
import { BacktestResultEntity } from '../entities/backtest-result.entity';

describe('BacktestResultsController', () => {
  let controller: BacktestResultsController;
  let service: BacktestResultService;

  const mockBacktestResultService = {
    getResultsByTaskId: jest.fn(),
    getPrimaryResult: jest.fn(),
    getResultById: jest.fn(),
    createFilteredResult: jest.fn(),
    deleteResult: jest.fn(),
    getResultsSummary: jest.fn(),
    compareResults: jest.fn(),
    getTradesData: jest.fn(),
    getEquityData: jest.fn(),
    getResultsWithPagination: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BacktestResultsController],
      providers: [
        {
          provide: BacktestResultService,
          useValue: mockBacktestResultService,
        },
      ],
    }).compile();

    controller = module.get<BacktestResultsController>(
      BacktestResultsController,
    );
    service = module.get<BacktestResultService>(BacktestResultService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getResultsByTaskId', () => {
    it('should return all results for a task', async () => {
      const mockResults = [
        {
          resultId: 'result-1',
          taskId: 'task-123',
          resultName: '全量数据',
          isPrimary: true,
        },
        {
          resultId: 'result-2',
          taskId: 'task-123',
          resultName: 'RSI过滤',
          isPrimary: false,
        },
      ];

      mockBacktestResultService.getResultsByTaskId.mockResolvedValue(
        mockResults,
      );

      const result = await controller.getResultsByTaskId('task-123', {});

      expect(result).toEqual({
        results: mockResults,
        total: 2,
        page: 1,
        pageSize: 2,
      });
      expect(service.getResultsByTaskId).toHaveBeenCalledWith('task-123');
    });

    it('should return paginated results when pagination params provided', async () => {
      const mockPaginatedResults = {
        results: [{ resultId: 'result-1' }],
        total: 10,
        page: 2,
        pageSize: 5,
      };

      mockBacktestResultService.getResultsWithPagination.mockResolvedValue(
        mockPaginatedResults,
      );

      const result = await controller.getResultsByTaskId('task-123', {
        page: 2,
        limit: 5,
      });

      expect(result).toEqual(mockPaginatedResults);
      expect(service.getResultsWithPagination).toHaveBeenCalledWith(
        'task-123',
        { page: 2, limit: 5 },
      );
    });
  });

  describe('getPrimaryResult', () => {
    it('should return primary result', async () => {
      const mockResult: Partial<BacktestResultEntity> = {
        resultId: 'result-123',
        taskId: 'task-123',
        resultName: '全量数据',
        isPrimary: true,
      };

      mockBacktestResultService.getPrimaryResult.mockResolvedValue(mockResult);

      const result = await controller.getPrimaryResult('task-123');

      expect(result).toEqual(mockResult);
      expect(service.getPrimaryResult).toHaveBeenCalledWith('task-123');
    });
  });

  describe('getResultById', () => {
    it('should return result by id', async () => {
      const mockResult: Partial<BacktestResultEntity> = {
        resultId: 'result-123',
        resultName: '全量数据',
      };

      mockBacktestResultService.getResultById.mockResolvedValue(mockResult);

      const result = await controller.getResultById('result-123');

      expect(result).toEqual(mockResult);
      expect(service.getResultById).toHaveBeenCalledWith('result-123');
    });
  });

  describe('createFilteredResult', () => {
    it('should create a filtered result', async () => {
      const createDto = {
        resultName: 'RSI过滤',
        filterConditions: {
          factors: { rsi: { min: 30, max: 70 } },
        },
      };

      const mockCreatedResult: Partial<BacktestResultEntity> = {
        resultId: 'result-456',
        taskId: 'task-123',
        resultName: 'RSI过滤',
        isPrimary: false,
      };

      mockBacktestResultService.createFilteredResult.mockResolvedValue(
        mockCreatedResult,
      );

      const result = await controller.createFilteredResult('task-123', createDto);

      expect(result).toEqual(mockCreatedResult);
      expect(service.createFilteredResult).toHaveBeenCalledWith(
        'task-123',
        'RSI过滤',
        createDto.filterConditions,
        undefined,
      );
    });
  });

  describe('deleteResult', () => {
    it('should delete a result', async () => {
      mockBacktestResultService.deleteResult.mockResolvedValue(undefined);

      await controller.deleteResult('result-123');

      expect(service.deleteResult).toHaveBeenCalledWith('result-123', undefined);
    });
  });

  describe('getResultsSummary', () => {
    it('should return results summary', async () => {
      const mockSummary = {
        total: 5,
        hasPrimary: true,
        topByReturn: { resultId: 'result-1', totalReturnPct: 25 },
        topBySharpe: { resultId: 'result-2', sharpeRatio: 2.5 },
      };

      mockBacktestResultService.getResultsSummary.mockResolvedValue(
        mockSummary,
      );

      const result = await controller.getResultsSummary('task-123');

      expect(result).toEqual(mockSummary);
      expect(service.getResultsSummary).toHaveBeenCalledWith('task-123');
    });
  });

  describe('compareResults', () => {
    it('should compare multiple results', async () => {
      const resultIds = ['result-1', 'result-2', 'result-3'];
      const mockComparison = {
        results: [
          { resultId: 'result-1', totalReturnPct: 20 },
          { resultId: 'result-2', totalReturnPct: 25 },
          { resultId: 'result-3', totalReturnPct: 15 },
        ],
        comparison: {
          bestReturn: 'result-2',
          bestSharpe: 'result-1',
          lowestDrawdown: 'result-3',
        },
      };

      mockBacktestResultService.compareResults.mockResolvedValue(
        mockComparison,
      );

      const result = await controller.compareResults({ resultIds });

      expect(result).toEqual(mockComparison);
      expect(service.compareResults).toHaveBeenCalledWith(resultIds);
    });
  });

  describe('getTradesData', () => {
    it('should return trades data', async () => {
      const mockTrades = [
        {
          entry_time: '2022-12-15T10:00:00',
          entry_price: 4100,
          exit_time: '2022-12-15T14:00:00',
          exit_price: 4120,
          size: 1,
          direction: 'long',
          pnl: 20,
          commission: 1,
        },
      ];

      mockBacktestResultService.getTradesData.mockResolvedValue(mockTrades);

      const result = await controller.getTradesData('task-123', {});

      expect(result.trades).toEqual(mockTrades);
      expect(result.total).toBe(1);
      expect(service.getTradesData).toHaveBeenCalledWith(
        'task-123',
        undefined,
        undefined,
      );
    });

    it('should handle pagination', async () => {
      const mockTrades = Array.from({ length: 100 }, (_, i) => ({
        entry_time: `2022-12-15T${10 + i}:00:00`,
        pnl: i,
      }));

      mockBacktestResultService.getTradesData.mockResolvedValue(mockTrades);

      const result = await controller.getTradesData('task-123', {
        page: 2,
        limit: 10,
      });

      expect(result.trades.length).toBe(10);
      expect(result.total).toBe(100);
      expect(result.page).toBe(2);
    });
  });

  describe('getEquityData', () => {
    it('should return equity curve data', async () => {
      const mockEquity = [
        { datetime: '2022-12-15T09:00:00', value: 100000, cash: 100000 },
        { datetime: '2022-12-15T10:00:00', value: 100100, cash: 95900 },
      ];

      mockBacktestResultService.getEquityData.mockResolvedValue(mockEquity);

      const result = await controller.getEquityData('task-123');

      expect(result).toEqual(mockEquity);
      expect(service.getEquityData).toHaveBeenCalledWith('task-123', undefined);
    });
  });
});

