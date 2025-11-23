import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BacktestResultRepository } from '../repositories/backtest-result.repository';
import { ParquetStorageService, TradeData, EquityPoint, FilterConditions } from './parquet-storage.service';
import { BacktestResultEntity } from '../entities/backtest-result.entity';
import { BacktestTaskEntity } from '../entities/backtest-task.entity';
import { CreateBacktestResultDto } from '../dto/create-backtest-result.dto';

/**
 * 计算的指标数据
 */
export interface CalculatedMetrics {
  // 收益指标
  initialCash: number;
  finalValue: number;
  totalPnl: number;
  totalReturnPct: number;
  annualizedReturnPct?: number;

  // 交易统计
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgProfitPerTrade?: number;
  profitFactor?: number;
  expectancy?: number;

  // 风险指标
  sharpeRatio?: number;
  sortinoRatio?: number;
  calmarRatio?: number;
  maxDrawdownPct?: number;
  maxDrawdownValue?: number;
  annualizedVolatilityPct?: number;

  // 持仓统计
  avgHoldingBars?: number;
  maxHoldingBars?: number;
  minHoldingBars?: number;

  // 其他
  tradesCountTotal?: number;
  tradesCountFiltered?: number;
}

/**
 * 回测分析服务
 * 负责从 Parquet 文件计算统计指标并生成回测结果
 */
@Injectable()
export class BacktestAnalysisService {
  private readonly logger = new Logger(BacktestAnalysisService.name);

  constructor(
    private readonly parquetStorage: ParquetStorageService,
    private readonly resultRepository: BacktestResultRepository,
  ) {}

  /**
   * 计算统计指标
   * @param tradesFilePath 交易文件路径
   * @param equityFilePath 权益曲线文件路径
   * @param filterConditions 过滤条件（可选）
   * @returns 计算的指标
   */
  async calculateMetrics(
    tradesFilePath: string,
    equityFilePath: string,
    filterConditions?: FilterConditions,
  ): Promise<CalculatedMetrics> {
    this.logger.log('Calculating metrics from Parquet files');

    try {
      // 读取交易数据
      const allTrades = await this.parquetStorage.loadTradesWithFactors(tradesFilePath);
      const filteredTrades = filterConditions
        ? await this.parquetStorage.loadTradesWithFactors(tradesFilePath, filterConditions)
        : allTrades;

      // 读取权益曲线
      const equityCurve = await this.parquetStorage.loadEquityCurve(equityFilePath);

      // 计算各项指标
      const basicMetrics = this.calculateBasicMetrics(filteredTrades, equityCurve);
      const riskMetrics = this.calculateRiskMetrics(filteredTrades, equityCurve);
      const holdingMetrics = this.calculateHoldingMetrics(filteredTrades);

      return {
        tradesCountTotal: allTrades.length,
        tradesCountFiltered: filteredTrades.length,
        initialCash: basicMetrics.initialCash!,
        finalValue: basicMetrics.finalValue!,
        totalPnl: basicMetrics.totalPnl!,
        totalReturnPct: basicMetrics.totalReturnPct!,
        totalTrades: basicMetrics.totalTrades!,
        winningTrades: basicMetrics.winningTrades!,
        losingTrades: basicMetrics.losingTrades!,
        winRate: basicMetrics.winRate!,
        ...basicMetrics,
        ...riskMetrics,
        ...holdingMetrics,
      };
    } catch (error) {
      this.logger.error('Failed to calculate metrics:', error);
      throw error;
    }
  }

  /**
   * 生成主结果
   * 回测完成后自动调用，生成基于全量数据的主结果
   * @param task 回测任务
   * @returns 主结果实体
   */
  async generatePrimaryResult(task: BacktestTaskEntity): Promise<BacktestResultEntity> {
    this.logger.log(`Generating primary result for task ${task.taskId}`);

    try {
      // 检查是否已存在主结果
      const existingPrimary = await this.resultRepository.findPrimaryByTaskId(task.taskId);
      if (existingPrimary) {
        this.logger.warn(`Primary result already exists for task ${task.taskId}`);
        return existingPrimary;
      }

      // 检查文件路径
      if (!task.tradesFilePath || !task.equityFilePath) {
        throw new Error('Task does not have trades or equity file paths');
      }

      // 计算指标
      const metrics = await this.calculateMetrics(
        task.tradesFilePath,
        task.equityFilePath,
      );

      // 创建主结果 DTO
      const createDto: CreateBacktestResultDto = {
        taskId: task.taskId,
        resultName: '全量数据',
        isPrimary: true,
        filterConditions: undefined,
        tradesCountTotal: metrics.tradesCountTotal,
        tradesCountFiltered: metrics.tradesCountFiltered,
        initialCash: metrics.initialCash,
        finalValue: metrics.finalValue,
        totalPnl: metrics.totalPnl,
        totalReturnPct: metrics.totalReturnPct,
        annualizedReturnPct: metrics.annualizedReturnPct,
        totalTrades: metrics.totalTrades,
        winningTrades: metrics.winningTrades,
        losingTrades: metrics.losingTrades,
        winRate: metrics.winRate,
        avgProfitPerTrade: metrics.avgProfitPerTrade,
        profitFactor: metrics.profitFactor,
        expectancy: metrics.expectancy,
        sharpeRatio: metrics.sharpeRatio,
        sortinoRatio: metrics.sortinoRatio,
        calmarRatio: metrics.calmarRatio,
        maxDrawdownPct: metrics.maxDrawdownPct,
        maxDrawdownValue: metrics.maxDrawdownValue,
        annualizedVolatilityPct: metrics.annualizedVolatilityPct,
        avgHoldingBars: metrics.avgHoldingBars,
        maxHoldingBars: metrics.maxHoldingBars,
        minHoldingBars: metrics.minHoldingBars,
        tradesFilePath: task.tradesFilePath,
        equityFilePath: task.equityFilePath,
      };

      // 保存到数据库
      const result = await this.resultRepository.create(createDto);

      this.logger.log(`Primary result created: ${result.resultId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to generate primary result for task ${task.taskId}:`, error);
      throw error;
    }
  }

  /**
   * 生成过滤结果
   * 用户手动触发，基于过滤条件生成派生结果
   * @param task 回测任务
   * @param resultName 结果名称
   * @param filterConditions 过滤条件
   * @returns 过滤结果实体
   */
  async generateFilteredResult(
    task: BacktestTaskEntity,
    resultName: string,
    filterConditions: FilterConditions,
  ): Promise<BacktestResultEntity> {
    this.logger.log(`Generating filtered result for task ${task.taskId}: ${resultName}`);

    try {
      // 检查文件路径
      if (!task.tradesFilePath || !task.equityFilePath) {
        throw new Error('Task does not have trades or equity file paths');
      }

      // 计算指标（带过滤条件）
      const metrics = await this.calculateMetrics(
        task.tradesFilePath,
        task.equityFilePath,
        filterConditions,
      );

      // 创建过滤结果 DTO
      const createDto: CreateBacktestResultDto = {
        taskId: task.taskId,
        resultName,
        isPrimary: false,
        filterConditions,
        tradesCountTotal: metrics.tradesCountTotal,
        tradesCountFiltered: metrics.tradesCountFiltered,
        initialCash: metrics.initialCash,
        finalValue: metrics.finalValue,
        totalPnl: metrics.totalPnl,
        totalReturnPct: metrics.totalReturnPct,
        annualizedReturnPct: metrics.annualizedReturnPct,
        totalTrades: metrics.totalTrades,
        winningTrades: metrics.winningTrades,
        losingTrades: metrics.losingTrades,
        winRate: metrics.winRate,
        avgProfitPerTrade: metrics.avgProfitPerTrade,
        profitFactor: metrics.profitFactor,
        expectancy: metrics.expectancy,
        sharpeRatio: metrics.sharpeRatio,
        sortinoRatio: metrics.sortinoRatio,
        calmarRatio: metrics.calmarRatio,
        maxDrawdownPct: metrics.maxDrawdownPct,
        maxDrawdownValue: metrics.maxDrawdownValue,
        annualizedVolatilityPct: metrics.annualizedVolatilityPct,
        avgHoldingBars: metrics.avgHoldingBars,
        maxHoldingBars: metrics.maxHoldingBars,
        minHoldingBars: metrics.minHoldingBars,
        // 使用与主结果相同的文件路径
        tradesFilePath: task.tradesFilePath,
        equityFilePath: task.equityFilePath,
      };

      // 保存到数据库
      const result = await this.resultRepository.create(createDto);

      this.logger.log(`Filtered result created: ${result.resultId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to generate filtered result for task ${task.taskId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 计算基础指标
   */
  private calculateBasicMetrics(
    trades: TradeData[],
    equityCurve: EquityPoint[],
  ): Partial<CalculatedMetrics> {
    if (equityCurve.length === 0) {
      throw new Error('Equity curve is empty');
    }

    const initialCash = equityCurve[0].value;
    const finalValue = equityCurve[equityCurve.length - 1].value;
    const totalPnl = finalValue - initialCash;
    const totalReturnPct = (totalPnl / initialCash) * 100;

    // 计算年化收益率（假设365天为一年）
    const startTime = new Date(equityCurve[0].datetime);
    const endTime = new Date(equityCurve[equityCurve.length - 1].datetime);
    const daysDiff = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);
    const years = daysDiff / 365;
    const annualizedReturnPct = years > 0
      ? (Math.pow(finalValue / initialCash, 1 / years) - 1) * 100
      : undefined;

    // 交易统计
    const totalTrades = trades.length;
    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const losingTrades = trades.filter((t) => t.pnl < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    // 平均每笔交易盈亏
    const avgProfitPerTrade = totalTrades > 0
      ? totalPnl / totalTrades
      : undefined;

    // 盈亏比
    const grossProfit = trades
      .filter((t) => t.pnl > 0)
      .reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(
      trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0),
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : undefined;

    // 期望值
    const expectancy = totalTrades > 0
      ? (winRate / 100) * (grossProfit / (winningTrades || 1)) -
        ((100 - winRate) / 100) * (grossLoss / (losingTrades || 1))
      : undefined;

    return {
      initialCash,
      finalValue,
      totalPnl,
      totalReturnPct,
      annualizedReturnPct,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      avgProfitPerTrade,
      profitFactor,
      expectancy,
    };
  }

  /**
   * 计算风险指标
   */
  private calculateRiskMetrics(
    trades: TradeData[],
    equityCurve: EquityPoint[],
  ): Partial<CalculatedMetrics> {
    if (equityCurve.length === 0) {
      return {};
    }

    // 计算日收益率
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const ret = (equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value;
      returns.push(ret);
    }

    // 计算平均收益和标准差
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // 年化波动率（假设252个交易日）
    const annualizedVolatilityPct = stdDev * Math.sqrt(252) * 100;

    // 夏普比率（无风险利率假设为0）
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : undefined;

    // Sortino 比率（只考虑下行波动）
    const downReturns = returns.filter((r) => r < 0);
    const downVariance = downReturns.length > 0
      ? downReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downReturns.length
      : 0;
    const downStdDev = Math.sqrt(downVariance);
    const sortinoRatio = downStdDev > 0 ? (avgReturn / downStdDev) * Math.sqrt(252) : undefined;

    // 最大回撤
    let maxDrawdownPct = 0;
    let maxDrawdownValue = 0;
    let peak = equityCurve[0].value;

    for (const point of equityCurve) {
      if (point.value > peak) {
        peak = point.value;
      }
      const drawdown = peak - point.value;
      const drawdownPct = (drawdown / peak) * 100;
      
      if (drawdownPct > maxDrawdownPct) {
        maxDrawdownPct = drawdownPct;
        maxDrawdownValue = drawdown;
      }
    }

    // Calmar 比率
    const startTime = new Date(equityCurve[0].datetime);
    const endTime = new Date(equityCurve[equityCurve.length - 1].datetime);
    const daysDiff = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);
    const years = daysDiff / 365;
    const initialValue = equityCurve[0].value;
    const finalValue = equityCurve[equityCurve.length - 1].value;
    const annualizedReturn = years > 0
      ? (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100
      : 0;
    const calmarRatio = maxDrawdownPct > 0 ? annualizedReturn / maxDrawdownPct : undefined;

    return {
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxDrawdownPct,
      maxDrawdownValue,
      annualizedVolatilityPct,
    };
  }

  /**
   * 计算持仓统计
   */
  private calculateHoldingMetrics(trades: TradeData[]): Partial<CalculatedMetrics> {
    if (trades.length === 0) {
      return {};
    }

    // 计算每笔交易的持仓K线数（简化：使用时间差的小时数）
    const holdingBars = trades.map((trade) => {
      const entryTime = new Date(trade.entry_time);
      const exitTime = new Date(trade.exit_time);
      const hours = (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60);
      return Math.max(1, Math.floor(hours)); // 至少1个周期
    });

    const avgHoldingBars = Math.round(
      holdingBars.reduce((sum, bars) => sum + bars, 0) / holdingBars.length,
    );
    const maxHoldingBars = Math.max(...holdingBars);
    const minHoldingBars = Math.min(...holdingBars);

    return {
      avgHoldingBars,
      maxHoldingBars,
      minHoldingBars,
    };
  }
}

