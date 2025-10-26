import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, ILike } from 'typeorm';
import {
  BacktestTaskEntity,
  BacktestTaskStatus,
} from '../entities/backtest-task.entity';
import {
  CreateBacktestTaskDto,
  UpdateBacktestTaskDto,
  UpdateBacktestTaskStatusDto,
  ListBacktestTasksQueryDto,
} from '../dto/backtest-task.dto';
import { StrategyEntity } from '../../strategy-management/entities/strategy.entity';
import { StrategyScriptVersionEntity } from '../../strategy-management/entities/strategy-script-version.entity';
import { DatasetEntity } from '../../trading-data/entities/dataset.entity';

@Injectable()
export class BacktestTasksService {
  constructor(
    @InjectRepository(BacktestTaskEntity)
    private readonly taskRepo: Repository<BacktestTaskEntity>,
    @InjectRepository(StrategyEntity)
    private readonly strategyRepo: Repository<StrategyEntity>,
    @InjectRepository(StrategyScriptVersionEntity)
    private readonly scriptRepo: Repository<StrategyScriptVersionEntity>,
    @InjectRepository(DatasetEntity)
    private readonly datasetRepo: Repository<DatasetEntity>,
  ) {}

  /**
   * 创建回测任务
   */
  async createTask(dto: CreateBacktestTaskDto): Promise<BacktestTaskEntity> {
    // 验证策略存在
    const strategy = await this.strategyRepo.findOne({
      where: { strategyId: dto.strategyId },
    });
    if (!strategy) {
      throw new NotFoundException(`策略 ID ${dto.strategyId} 不存在`);
    }

    // 验证脚本版本存在且属于该策略
    const script = await this.scriptRepo.findOne({
      where: { scriptId: dto.scriptId, strategyId: dto.strategyId },
    });
    if (!script) {
      throw new NotFoundException(
        `脚本版本 ID ${dto.scriptId} 不存在或不属于策略 ${dto.strategyId}`,
      );
    }

    // 验证数据集存在
    const dataset = await this.datasetRepo.findOne({
      where: { datasetId: dto.datasetId },
    });
    if (!dataset) {
      throw new NotFoundException(`数据集 ID ${dto.datasetId} 不存在`);
    }

    // 验证日期范围
    const startDate = new Date(dto.backtestStartDate);
    const endDate = new Date(dto.backtestEndDate);
    if (startDate >= endDate) {
      throw new BadRequestException('回测开始日期必须早于结束日期');
    }

    // 创建任务
    const task = this.taskRepo.create({
      name: dto.name,
      description: dto.description,
      strategyId: dto.strategyId,
      scriptId: dto.scriptId,
      datasetId: dto.datasetId,
      backtestStartDate: startDate,
      backtestEndDate: endDate,
      config: dto.config,
      status: BacktestTaskStatus.SUBMITTED,
      progress: 0,
      createdBy: dto.createdBy,
    });

    return await this.taskRepo.save(task);
  }

  /**
   * 查询回测任务列表
   */
  async listTasks(query: ListBacktestTasksQueryDto) {
    const { page = 1, pageSize = 10, keyword, status, strategyId } = query;

    const where: FindOptionsWhere<BacktestTaskEntity> = {};

    if (keyword?.trim()) {
      where.name = ILike(`%${keyword.trim()}%`);
    }

    if (status && status.length > 0) {
      where.status = status.length === 1 ? status[0] : (status as any);
    }

    if (strategyId) {
      where.strategyId = strategyId;
    }

    const [items, total] = await this.taskRepo.findAndCount({
      where,
      relations: ['strategy', 'scriptVersion', 'dataset'],
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 获取回测任务详情
   */
  async getTask(taskId: number): Promise<BacktestTaskEntity> {
    const task = await this.taskRepo.findOne({
      where: { taskId },
      relations: ['strategy', 'scriptVersion', 'dataset'],
    });

    if (!task) {
      throw new NotFoundException(`回测任务 ID ${taskId} 不存在`);
    }

    return task;
  }

  /**
   * 更新回测任务基本信息
   */
  async updateTask(
    taskId: number,
    dto: UpdateBacktestTaskDto,
  ): Promise<BacktestTaskEntity> {
    const task = await this.getTask(taskId);

    // 只允许更新尚未执行的任务
    if (
      task.status !== BacktestTaskStatus.SUBMITTED &&
      task.status !== BacktestTaskStatus.FAILED &&
      task.status !== BacktestTaskStatus.CANCELLED
    ) {
      throw new BadRequestException(
        '只能修改状态为 submitted/failed/cancelled 的任务',
      );
    }

    if (dto.name !== undefined) {
      task.name = dto.name;
    }

    if (dto.description !== undefined) {
      task.description = dto.description;
    }

    if (dto.updatedBy !== undefined) {
      task.updatedBy = dto.updatedBy;
    }

    return await this.taskRepo.save(task);
  }

  /**
   * 更新回测任务状态
   */
  async updateTaskStatus(
    taskId: number,
    dto: UpdateBacktestTaskStatusDto,
  ): Promise<BacktestTaskEntity> {
    const task = await this.getTask(taskId);

    task.status = dto.status;

    if (dto.progress !== undefined) {
      task.progress = dto.progress;
    }

    if (dto.errorMessage !== undefined) {
      task.errorMessage = dto.errorMessage;
    }

    if (dto.resultSummary !== undefined) {
      task.resultSummary = dto.resultSummary;
    }

    if (dto.resultStoragePath !== undefined) {
      task.resultStoragePath = dto.resultStoragePath;
    }

    // 更新时间戳
    if (dto.status === BacktestTaskStatus.RUNNING && !task.startedAt) {
      task.startedAt = new Date();
    }

    if (
      (dto.status === BacktestTaskStatus.FINISHED ||
        dto.status === BacktestTaskStatus.FAILED ||
        dto.status === BacktestTaskStatus.CANCELLED) &&
      !task.finishedAt
    ) {
      task.finishedAt = new Date();
    }

    return await this.taskRepo.save(task);
  }

  /**
   * 删除回测任务（软删除）
   */
  async deleteTask(taskId: number, operator?: string): Promise<void> {
    const task = await this.getTask(taskId);

    // 只允许删除已完成、失败或取消的任务
    if (
      task.status !== BacktestTaskStatus.FINISHED &&
      task.status !== BacktestTaskStatus.FAILED &&
      task.status !== BacktestTaskStatus.CANCELLED
    ) {
      throw new BadRequestException(
        '只能删除状态为 finished/failed/cancelled 的任务',
      );
    }

    if (operator) {
      task.updatedBy = operator;
      await this.taskRepo.save(task);
    }

    await this.taskRepo.softRemove(task);
  }

  /**
   * 取消回测任务
   */
  async cancelTask(taskId: number): Promise<BacktestTaskEntity> {
    const task = await this.getTask(taskId);

    // 只能取消排队中或正在运行的任务
    if (
      task.status !== BacktestTaskStatus.SUBMITTED &&
      task.status !== BacktestTaskStatus.QUEUED &&
      task.status !== BacktestTaskStatus.RUNNING
    ) {
      throw new BadRequestException(
        '只能取消状态为 submitted/queued/running 的任务',
      );
    }

    return await this.updateTaskStatus(taskId, {
      status: BacktestTaskStatus.CANCELLED,
    });
  }
}

