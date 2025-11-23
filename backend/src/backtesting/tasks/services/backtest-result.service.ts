import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BacktestResultRepository } from '../repositories/backtest-result.repository';
import { BacktestAnalysisService } from './backtest-analysis.service';
import { ParquetStorageService, FilterConditions, TradeData, EquityPoint } from './parquet-storage.service';
import { BacktestResultEntity } from '../entities/backtest-result.entity';
import { BacktestTaskEntity } from '../entities/backtest-task.entity';

/**
 * 回测结果服务
 * 统一的结果管理入口，整合 Repository、Analysis 和 Storage 三层
 */
@Injectable()
export class BacktestResultService {
  private readonly logger = new Logger(BacktestResultService.name);

  constructor(
    @InjectRepository(BacktestTaskEntity)
    private readonly taskRepository: Repository<BacktestTaskEntity>,
    private readonly resultRepository: BacktestResultRepository,
    private readonly analysisService: BacktestAnalysisService,
    private readonly parquetStorage: ParquetStorageService,
  ) {}

  /**
   * 获取任务的所有结果
   * @param taskId 任务ID
   * @returns 结果列表
   */
  async getResultsByTaskId(taskId: string): Promise<BacktestResultEntity[]> {
    this.logger.log(`Getting results for task ${taskId}`);
    
    // 验证任务是否存在
    await this.getTaskOrThrow(taskId);
    
    return await this.resultRepository.findByTaskId(taskId);
  }

  /**
   * 获取主结果
   * @param taskId 任务ID
   * @returns 主结果
   */
  async getPrimaryResult(taskId: string): Promise<BacktestResultEntity> {
    this.logger.log(`Getting primary result for task ${taskId}`);
    
    // 验证任务是否存在
    await this.getTaskOrThrow(taskId);
    
    const primaryResult = await this.resultRepository.findPrimaryByTaskId(taskId);
    
    if (!primaryResult) {
      throw new NotFoundException(`Primary result not found for task ${taskId}`);
    }
    
    return primaryResult;
  }

  /**
   * 获取单个结果
   * @param resultId 结果ID
   * @returns 结果详情
   */
  async getResultById(resultId: string): Promise<BacktestResultEntity> {
    this.logger.log(`Getting result ${resultId}`);
    
    const result = await this.resultRepository.findById(resultId);
    
    if (!result) {
      throw new NotFoundException(`Result ${resultId} not found`);
    }
    
    return result;
  }

  /**
   * 创建过滤结果
   * @param taskId 任务ID
   * @param resultName 结果名称
   * @param filterConditions 过滤条件
   * @param userId 用户ID（用于权限验证）
   * @returns 创建的结果
   */
  async createFilteredResult(
    taskId: string,
    resultName: string,
    filterConditions: FilterConditions,
    userId?: string,
  ): Promise<BacktestResultEntity> {
    this.logger.log(`Creating filtered result for task ${taskId}: ${resultName}`);

    // 验证任务是否存在
    const task = await this.getTaskOrThrow(taskId);

    // 验证任务是否已完成
    if (task.status !== 'completed') {
      throw new BadRequestException('Cannot create filtered result for incomplete task');
    }

    // 验证用户权限（如果提供了 userId）
    if (userId && task.createdBy !== userId) {
      throw new ForbiddenException('You do not have permission to access this task');
    }

    // 检查是否已存在主结果
    const hasPrimary = await this.resultRepository.hasPrimaryResult(taskId);
    if (!hasPrimary) {
      this.logger.warn(`Primary result not found for task ${taskId}, generating it first`);
      await this.analysisService.generatePrimaryResult(task);
    }

    // 生成过滤结果
    return await this.analysisService.generateFilteredResult(
      task,
      resultName,
      filterConditions,
    );
  }

  /**
   * 删除结果
   * @param resultId 结果ID
   * @param userId 用户ID（用于权限验证）
   */
  async deleteResult(resultId: string, userId?: string): Promise<void> {
    this.logger.log(`Deleting result ${resultId}`);

    // 查询结果
    const result = await this.getResultById(resultId);

    // 验证用户权限（如果提供了 userId）
    if (userId) {
      const task = await this.getTaskOrThrow(result.taskId);
      if (task.createdBy !== userId) {
        throw new ForbiddenException('You do not have permission to delete this result');
      }
    }

    // 删除结果（Repository 会自动检查是否为主结果）
    await this.resultRepository.delete(resultId);
  }

  /**
   * 获取交易明细数据
   * @param taskId 任务ID
   * @param filterConditions 过滤条件（可选）
   * @param userId 用户ID（用于权限验证）
   * @returns 交易数据
   */
  async getTradesData(
    taskId: string,
    filterConditions?: FilterConditions,
    userId?: string,
  ): Promise<TradeData[]> {
    this.logger.log(`Getting trades data for task ${taskId}`);

    // 验证任务是否存在和权限
    const task = await this.getTaskOrThrow(taskId);
    if (userId && task.createdBy !== userId) {
      throw new ForbiddenException('You do not have permission to access this task');
    }

    // 检查文件路径
    if (!task.tradesFilePath) {
      throw new NotFoundException('Trades file not found for this task');
    }

    // 读取交易数据
    return await this.parquetStorage.loadTradesWithFactors(
      task.tradesFilePath,
      filterConditions,
    );
  }

  /**
   * 获取权益曲线数据
   * @param taskId 任务ID
   * @param userId 用户ID（用于权限验证）
   * @returns 权益曲线数据
   */
  async getEquityData(taskId: string, userId?: string): Promise<EquityPoint[]> {
    this.logger.log(`Getting equity data for task ${taskId}`);

    // 验证任务是否存在和权限
    const task = await this.getTaskOrThrow(taskId);
    if (userId && task.createdBy !== userId) {
      throw new ForbiddenException('You do not have permission to access this task');
    }

    // 检查文件路径
    if (!task.equityFilePath) {
      throw new NotFoundException('Equity file not found for this task');
    }

    // 读取权益曲线数据
    return await this.parquetStorage.loadEquityCurve(task.equityFilePath);
  }

  /**
   * 获取结果统计摘要
   * @param taskId 任务ID
   * @returns 统计摘要
   */
  async getResultsSummary(taskId: string): Promise<{
    total: number;
    hasPrimary: boolean;
    topByReturn?: BacktestResultEntity;
    topBySharpe?: BacktestResultEntity;
  }> {
    this.logger.log(`Getting results summary for task ${taskId}`);

    // 验证任务是否存在
    await this.getTaskOrThrow(taskId);

    const total = await this.resultRepository.countByTaskId(taskId);
    const hasPrimary = await this.resultRepository.hasPrimaryResult(taskId);
    const topByReturnList = await this.resultRepository.findTopByReturn(taskId, 1);
    const topBySharpeList = await this.resultRepository.findTopBySharpe(taskId, 1);

    return {
      total,
      hasPrimary,
      topByReturn: topByReturnList[0] || undefined,
      topBySharpe: topBySharpeList[0] || undefined,
    };
  }

  /**
   * 分页查询结果
   * @param taskId 任务ID（可选）
   * @param options 查询选项
   * @returns 分页结果
   */
  async getResultsWithPagination(
    taskId?: string,
    options?: {
      isPrimary?: boolean;
      orderBy?: 'createdAt' | 'totalReturnPct' | 'sharpeRatio';
      order?: 'ASC' | 'DESC';
      page?: number;
      limit?: number;
    },
  ): Promise<{
    results: BacktestResultEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    this.logger.log('Getting results with pagination');

    // 映射驼峰命名到下划线命名
    const orderByMap: Record<string, 'created_at' | 'total_return_pct' | 'sharpe_ratio'> = {
      createdAt: 'created_at',
      totalReturnPct: 'total_return_pct',
      sharpeRatio: 'sharpe_ratio',
    };

    return await this.resultRepository.findWithPagination({
      taskId,
      ...options,
      orderBy: options.orderBy ? orderByMap[options.orderBy] : undefined,
    });
  }

  /**
   * 对比多个结果
   * @param resultIds 结果ID数组
   * @returns 对比结果
   */
  async compareResults(
    resultIds: string[],
  ): Promise<{
    results: BacktestResultEntity[];
    comparison: {
      bestReturn: string; // 最佳收益率的结果ID
      bestSharpe: string; // 最佳夏普的结果ID
      lowestDrawdown: string; // 最低回撤的结果ID
    };
  }> {
    this.logger.log(`Comparing ${resultIds.length} results`);

    if (resultIds.length < 2) {
      throw new BadRequestException('At least 2 results are required for comparison');
    }

    // 获取所有结果
    const results = await Promise.all(
      resultIds.map((id) => this.getResultById(id)),
    );

    // 找出最佳指标的结果
    let bestReturn = results[0];
    let bestSharpe = results[0];
    let lowestDrawdown = results[0];

    for (const result of results) {
      if (result.totalReturnPct > bestReturn.totalReturnPct) {
        bestReturn = result;
      }
      if ((result.sharpeRatio || 0) > (bestSharpe.sharpeRatio || 0)) {
        bestSharpe = result;
      }
      if ((result.maxDrawdownPct || Infinity) < (lowestDrawdown.maxDrawdownPct || Infinity)) {
        lowestDrawdown = result;
      }
    }

    return {
      results,
      comparison: {
        bestReturn: bestReturn.resultId,
        bestSharpe: bestSharpe.resultId,
        lowestDrawdown: lowestDrawdown.resultId,
      },
    };
  }

  /**
   * 删除任务的所有结果（包括文件）
   * 仅供内部使用，删除任务时调用
   * @param taskId 任务ID
   */
  async deleteAllResultsByTaskId(taskId: string): Promise<void> {
    this.logger.log(`Deleting all results for task ${taskId}`);

    // 获取所有结果
    const results = await this.resultRepository.findByTaskId(taskId);

    // 删除所有结果记录（包括主结果）
    for (const result of results) {
      // 注意：直接使用 repository 删除，绕过主结果保护
      await this.resultRepository['repository'].delete(result.resultId);
    }

    // 删除 Parquet 文件
    await this.parquetStorage.deleteTaskFiles(taskId);

    this.logger.log(`All results deleted for task ${taskId}`);
  }

  /**
   * 获取任务或抛出异常
   * @param taskId 任务ID
   * @returns 任务实体
   */
  private async getTaskOrThrow(taskId: string): Promise<BacktestTaskEntity> {
    const task = await this.taskRepository.findOne({ where: { taskId } });
    
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    
    return task;
  }

  /**
   * 生成主结果（供 Worker 回调使用）
   * @param taskId 任务ID
   * @returns 主结果
   */
  async generatePrimaryResultForTask(taskId: string): Promise<BacktestResultEntity> {
    this.logger.log(`Generating primary result for task ${taskId}`);

    const task = await this.getTaskOrThrow(taskId);
    return await this.analysisService.generatePrimaryResult(task);
  }
}

