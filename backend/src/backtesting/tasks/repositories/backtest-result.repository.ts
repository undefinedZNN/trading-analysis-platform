import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { BacktestResultEntity } from '../entities/backtest-result.entity';
import { CreateBacktestResultDto, UpdateBacktestResultDto } from '../dto';

/**
 * 回测结果数据访问层
 * 
 * 提供 backtest_results 表的 CRUD 操作和查询方法
 * 
 * 核心功能：
 * - 创建/更新/删除结果
 * - 查询主结果（is_primary=true）
 * - 查询任务的所有结果
 * - 分页查询和排序
 */
@Injectable()
export class BacktestResultRepository {
  private readonly logger = new Logger(BacktestResultRepository.name);

  constructor(
    @InjectRepository(BacktestResultEntity)
    private readonly repository: Repository<BacktestResultEntity>,
  ) {}

  // ============================================
  // 基础 CRUD 操作
  // ============================================

  /**
   * 创建回测结果
   * 
   * @param data 创建数据
   * @returns 创建的结果实体
   */
  async create(data: CreateBacktestResultDto): Promise<BacktestResultEntity> {
    this.logger.log(
      `Creating backtest result: ${data.resultName} for task ${data.taskId}`,
    );

    const result = this.repository.create(data);
    const savedResult = await this.repository.save(result);

    this.logger.log(
      `Backtest result created: ${savedResult.resultId} (isPrimary: ${savedResult.isPrimary})`,
    );

    return savedResult;
  }

  /**
   * 更新回测结果
   * 
   * @param resultId 结果ID
   * @param data 更新数据
   * @returns 更新后的结果实体
   */
  async update(
    resultId: string,
    data: UpdateBacktestResultDto,
  ): Promise<BacktestResultEntity> {
    this.logger.log(`Updating backtest result: ${resultId}`);

    const result = await this.findById(resultId);

    // 不允许更新主结果
    if (result.isPrimary) {
      throw new BadRequestException('Cannot update primary result');
    }

    Object.assign(result, data);
    return await this.repository.save(result);
  }

  /**
   * 删除回测结果（物理删除）
   * 
   * @param resultId 结果ID
   * @throws NotFoundException 结果不存在
   * @throws BadRequestException 尝试删除主结果
   */
  async delete(resultId: string): Promise<void> {
    this.logger.log(`Deleting backtest result: ${resultId}`);

    const result = await this.findById(resultId);

    // 不允许删除主结果
    if (result.isPrimary) {
      throw new BadRequestException(
        'Cannot delete primary result. Primary results are automatically generated and should not be deleted.',
      );
    }

    await this.repository.delete(resultId);
    this.logger.log(`Backtest result deleted: ${resultId}`);
  }

  // ============================================
  // 查询方法
  // ============================================

  /**
   * 根据ID查询单个结果
   * 
   * @param resultId 结果ID
   * @returns 结果实体
   * @throws NotFoundException 结果不存在
   */
  async findById(resultId: string): Promise<BacktestResultEntity> {
    const result = await this.repository.findOne({
      where: { resultId },
    });

    if (!result) {
      throw new NotFoundException(`Backtest result ${resultId} not found`);
    }

    return result;
  }

  /**
   * 查询某任务的所有结果
   * 
   * @param taskId 任务ID
   * @returns 结果列表（按创建时间倒序）
   */
  async findByTaskId(taskId: string): Promise<BacktestResultEntity[]> {
    this.logger.debug(`Finding results for task: ${taskId}`);

    return await this.repository.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 查询主结果（is_primary=true）
   * 
   * 这是最重要的方法之一！
   * 用于：
   * - 用户打开结果页时，首先获取主结果
   * - 检查主结果是否已生成
   * 
   * @param taskId 任务ID
   * @returns 主结果实体，如果不存在返回 null
   */
  async findPrimaryByTaskId(
    taskId: string,
  ): Promise<BacktestResultEntity | null> {
    this.logger.debug(`Finding primary result for task: ${taskId}`);

    return await this.repository.findOne({
      where: {
        taskId,
        isPrimary: true,
      },
    });
  }

  /**
   * 检查主结果是否存在
   * 
   * @param taskId 任务ID
   * @returns true 如果主结果存在
   */
  async hasPrimaryResult(taskId: string): Promise<boolean> {
    const count = await this.repository.count({
      where: {
        taskId,
        isPrimary: true,
      },
    });

    return count > 0;
  }

  /**
   * 统计某任务的结果数量
   * 
   * @param taskId 任务ID
   * @returns 结果数量
   */
  async countByTaskId(taskId: string): Promise<number> {
    return await this.repository.count({
      where: { taskId },
    });
  }

  // ============================================
  // 高级查询方法
  // ============================================

  /**
   * 分页查询结果列表
   * 
   * 支持：
   * - 按任务筛选
   * - 按是否为主结果筛选
   * - 多种排序方式
   * - 分页
   * 
   * @param options 查询选项
   * @returns 结果列表和总数
   */
  async findWithPagination(options: {
    taskId?: string;
    isPrimary?: boolean;
    orderBy?: 'created_at' | 'total_return_pct' | 'sharpe_ratio';
    order?: 'ASC' | 'DESC';
    page?: number;
    limit?: number;
  }): Promise<{
    results: BacktestResultEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const {
      taskId,
      isPrimary,
      orderBy = 'created_at',
      order = 'DESC',
      page = 1,
      limit = 10,
    } = options;

    this.logger.debug(
      `Finding results with pagination: page=${page}, limit=${limit}`,
    );

    // 构建查询条件
    const where: FindOptionsWhere<BacktestResultEntity> = {};
    if (taskId) {
      where.taskId = taskId;
    }
    if (isPrimary !== undefined) {
      where.isPrimary = isPrimary;
    }

    // 映射排序字段
    const orderByMap: Record<string, string> = {
      created_at: 'createdAt',
      total_return_pct: 'totalReturnPct',
      sharpe_ratio: 'sharpeRatio',
    };

    const orderByField = orderByMap[orderBy] || 'createdAt';

    // 执行查询
    const [results, total] = await this.repository.findAndCount({
      where,
      order: {
        [orderByField]: order,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      results,
      total,
      page,
      pageSize: limit,
    };
  }

  /**
   * 查询收益率最高的结果
   * 
   * @param taskId 任务ID（可选）
   * @param limit 返回数量
   * @returns 结果列表
   */
  async findTopByReturn(
    taskId?: string,
    limit: number = 10,
  ): Promise<BacktestResultEntity[]> {
    const where: FindOptionsWhere<BacktestResultEntity> = {};
    if (taskId) {
      where.taskId = taskId;
    }

    return await this.repository.find({
      where,
      order: {
        totalReturnPct: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * 查询夏普比率最高的结果
   * 
   * @param taskId 任务ID（可选）
   * @param limit 返回数量
   * @returns 结果列表
   */
  async findTopBySharpe(
    taskId?: string,
    limit: number = 10,
  ): Promise<BacktestResultEntity[]> {
    const queryBuilder = this.repository.createQueryBuilder('result');

    if (taskId) {
      queryBuilder.where('result.taskId = :taskId', { taskId });
    }

    // 过滤掉 null 值的夏普比率
    queryBuilder.andWhere('result.sharpeRatio IS NOT NULL');

    queryBuilder.orderBy('result.sharpeRatio', 'DESC').limit(limit);

    return await queryBuilder.getMany();
  }
}

