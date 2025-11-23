import { Test, TestingModule } from '@nestjs/testing';
import { BacktestAnalysisService } from './backtest-analysis.service';
import { ParquetStorageService } from './parquet-storage.service';
import { BacktestResultRepository } from '../repositories/backtest-result.repository';
import { BacktestTaskEntity } from '../entities/backtest-task.entity';

describe('BacktestAnalysisService', () => {
  let service: BacktestAnalysisService;
  let parquetStorage: ParquetStorageService;
  let resultRepository: BacktestResultRepository;

  const mockParquetStorage = {
    loadTradesWithFactors: jest.fn(),
    loadEquityCurve: jest.fn(),
  };

  const mockResultRepository = {
    findPrimaryByTaskId: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BacktestAnalysisService,
        {
          provide: ParquetStorageService,
          useValue: mockParquetStorage,
        },
        {
          provide: BacktestResultRepository,
          useValue: mockResultRepository,
        },
      ],
    }).compile();

    service = module.get<BacktestAnalysisService>(BacktestAnalysisService);
    parquetStorage = module.get<ParquetStorageService>(ParquetStorageService);
    resultRepository = module.get<BacktestResultRepository>(
      BacktestResultRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateMetrics', () => {
    it('should calculate metrics from parquet files', async () => {
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
        {
          entry_time: '2022-12-15T15:00:00',
          entry_price: 4120,
          exit_time: '2022-12-15T16:00:00',
          exit_price: 4110,
          size: 1,
          direction: 'long',
          pnl: -10,
          commission: 1,
        },
      ];

      const mockEquityCurve = [
        {
          datetime: '2022-12-15T09:00:00',
          value: 100000,
          cash: 100000,
        },
        {
          datetime: '2022-12-15T14:00:00',
          value: 100019,
          cash: 95919,
        },
        {
          datetime: '2022-12-15T16:00:00',
          value: 100008,
          cash: 100008,
        },
      ];

      mockParquetStorage.loadTradesWithFactors.mockResolvedValue(mockTrades);
      mockParquetStorage.loadEquityCurve.mockResolvedValue(mockEquityCurve);

      const metrics = await service.calculateMetrics(
        'trades.parquet',
        'equity.parquet',
      );

      expect(metrics).toBeDefined();
      expect(metrics.initialCash).toBe(100000);
      expect(metrics.finalValue).toBe(100008);
      expect(metrics.totalTrades).toBe(2);
      expect(metrics.winningTrades).toBe(1);
      expect(metrics.losingTrades).toBe(1);
      expect(metrics.winRate).toBe(50);
    });

    it('should calculate risk metrics', async () => {
      const mockTrades = [
        {
          entry_time: '2022-12-15T10:00:00',
          entry_price: 4100,
          exit_time: '2022-12-15T14:00:00',
          exit_price: 4120,
          size: 1,
          direction: 'long',
          pnl: 20,
          commission: 0,
        },
      ];

      const mockEquityCurve = [
        { datetime: '2022-12-15T09:00:00', value: 100000, cash: 100000 },
        { datetime: '2022-12-15T10:00:00', value: 100000, cash: 95900 },
        { datetime: '2022-12-15T11:00:00', value: 100010, cash: 95900 },
        { datetime: '2022-12-15T12:00:00', value: 100005, cash: 95900 },
        { datetime: '2022-12-15T13:00:00', value: 100015, cash: 95900 },
        { datetime: '2022-12-15T14:00:00', value: 100020, cash: 100020 },
      ];

      mockParquetStorage.loadTradesWithFactors.mockResolvedValue(mockTrades);
      mockParquetStorage.loadEquityCurve.mockResolvedValue(mockEquityCurve);

      const metrics = await service.calculateMetrics(
        'trades.parquet',
        'equity.parquet',
      );

      expect(metrics.sharpeRatio).toBeDefined();
      expect(metrics.maxDrawdownPct).toBeDefined();
      expect(metrics.annualizedVolatilityPct).toBeDefined();
    });
  });

  describe('generatePrimaryResult', () => {
    it('should generate primary result for a task', async () => {
      const mockTask: Partial<BacktestTaskEntity> = {
        taskId: 'task-123',
        tradesFilePath: 'task-123/trades.parquet',
        equityFilePath: 'task-123/equity.parquet',
      };

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

      const mockEquityCurve = [
        { datetime: '2022-12-15T09:00:00', value: 100000, cash: 100000 },
        { datetime: '2022-12-15T14:00:00', value: 100019, cash: 100019 },
      ];

      const mockCreatedResult = {
        resultId: 'result-123',
        taskId: 'task-123',
        resultName: '全量数据',
        isPrimary: true,
      };

      mockResultRepository.findPrimaryByTaskId.mockResolvedValue(null);
      mockParquetStorage.loadTradesWithFactors.mockResolvedValue(mockTrades);
      mockParquetStorage.loadEquityCurve.mockResolvedValue(mockEquityCurve);
      mockResultRepository.create.mockResolvedValue(mockCreatedResult);

      const result = await service.generatePrimaryResult(
        mockTask as BacktestTaskEntity,
      );

      expect(result).toEqual(mockCreatedResult);
      expect(mockResultRepository.create).toHaveBeenCalled();
    });

    it('should return existing primary result if already exists', async () => {
      const mockTask: Partial<BacktestTaskEntity> = {
        taskId: 'task-123',
      };

      const mockExistingResult = {
        resultId: 'result-123',
        taskId: 'task-123',
        isPrimary: true,
      };

      mockResultRepository.findPrimaryByTaskId.mockResolvedValue(
        mockExistingResult,
      );

      const result = await service.generatePrimaryResult(
        mockTask as BacktestTaskEntity,
      );

      expect(result).toEqual(mockExistingResult);
      expect(mockResultRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('generateFilteredResult', () => {
    it('should generate filtered result with filter conditions', async () => {
      const mockTask: Partial<BacktestTaskEntity> = {
        taskId: 'task-123',
        tradesFilePath: 'task-123/trades.parquet',
        equityFilePath: 'task-123/equity.parquet',
      };

      const filterConditions = {
        factors: { rsi: { min: 30, max: 70 } },
      };

      const mockAllTrades = [
        {
          entry_time: '2022-12-15T10:00:00',
          entry_price: 4100,
          exit_time: '2022-12-15T14:00:00',
          exit_price: 4120,
          size: 1,
          direction: 'long',
          pnl: 20,
          commission: 1,
          entry_factors: { rsi: 40 },
        },
        {
          entry_time: '2022-12-15T15:00:00',
          entry_price: 4120,
          exit_time: '2022-12-15T16:00:00',
          exit_price: 4110,
          size: 1,
          direction: 'long',
          pnl: -10,
          commission: 1,
          entry_factors: { rsi: 80 },
        },
      ];

      const mockFilteredTrades = [mockAllTrades[0]]; // Only the first trade passes filter

      const mockEquityCurve = [
        { datetime: '2022-12-15T09:00:00', value: 100000, cash: 100000 },
        { datetime: '2022-12-15T14:00:00', value: 100019, cash: 100019 },
      ];

      mockParquetStorage.loadTradesWithFactors
        .mockResolvedValueOnce(mockAllTrades)
        .mockResolvedValueOnce(mockFilteredTrades);
      mockParquetStorage.loadEquityCurve.mockResolvedValue(mockEquityCurve);
      mockResultRepository.create.mockResolvedValue({
        resultId: 'result-456',
        resultName: 'RSI过滤',
      });

      const result = await service.generateFilteredResult(
        mockTask as BacktestTaskEntity,
        'RSI过滤',
        filterConditions,
      );

      expect(result).toBeDefined();
      expect(mockResultRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          resultName: 'RSI过滤',
          isPrimary: false,
          filterConditions,
        }),
      );
    });
  });
});

