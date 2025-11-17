import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, Between } from 'typeorm';
import {
  BacktestTaskEntity,
  BacktestTaskStatus,
} from './entities';
import {
  CreateBacktestTaskDto,
  UpdateBacktestTaskDto,
  ListBacktestTasksDto,
} from './dto';
import { ServiceRegistryService } from '../service-registry/service-registry.service';
import { BacktestMetricsService } from '../monitoring/backtest-metrics.service';

/**
 * 回测任务服务
 * 
 * 提供回测任务的CRUD操作、状态管理和查询功能
 */
@Injectable()
export class BacktestTasksService {
  private readonly logger = new Logger(BacktestTasksService.name);

  constructor(
    @InjectRepository(BacktestTaskEntity)
    private readonly backtestTaskRepository: Repository<BacktestTaskEntity>,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly metrics?: BacktestMetricsService,
  ) {}

  /**
   * 创建回测任务
   * 
   * @param createDto 创建任务DTO
   * @param userId 创建用户ID（可选）
   * @returns 创建的任务实体
   */
  async create(createDto: CreateBacktestTaskDto, userId?: string): Promise<BacktestTaskEntity> {
    this.logger.log(`Creating backtest task: ${createDto.taskName}`);

    const task = this.backtestTaskRepository.create({
      ...createDto,
      status: BacktestTaskStatus.PENDING,
      progress: 0,
      createdBy: userId,
      updatedBy: userId,
    });

    const savedTask = await this.backtestTaskRepository.save(task);
    
    this.logger.log(`Backtest task created successfully: ${savedTask.taskId}`);
    return savedTask;
  }

  /**
   * 查询任务列表（分页）
   * 
   * @param listDto 查询参数DTO
   * @returns 任务列表和总数
   */
  async findAll(listDto: ListBacktestTasksDto): Promise<{
    tasks: BacktestTaskEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const {
      keyword,
      strategyId,
      scriptVersionId,
      datasetId,
      status,
      createdAfter,
      createdBefore,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      pageSize = 20,
    } = listDto;

    // 构建查询条件
    const where: FindOptionsWhere<BacktestTaskEntity> = {};

    if (strategyId) {
      where.strategyId = strategyId;
    }

    if (scriptVersionId) {
      where.scriptVersionId = scriptVersionId;
    }

    if (datasetId) {
      where.datasetId = datasetId;
    }

    if (status) {
      where.status = status;
    }

    if (createdAfter || createdBefore) {
      where.createdAt = Between(
        createdAfter ? new Date(createdAfter) : new Date(0),
        createdBefore ? new Date(createdBefore) : new Date(),
      );
    }

    // 关键词搜索（任务名称或描述）
    const queryBuilder = this.backtestTaskRepository.createQueryBuilder('task');

    if (keyword) {
      queryBuilder.where(
        '(task.task_name ILIKE :keyword OR task.task_description ILIKE :keyword)',
        { keyword: `%${keyword}%` },
      );
    }

    // 应用其他筛选条件
    if (strategyId) {
      queryBuilder.andWhere('task.strategy_id = :strategyId', { strategyId });
    }

    if (scriptVersionId) {
      queryBuilder.andWhere('task.script_version_id = :scriptVersionId', { scriptVersionId });
    }

    if (datasetId) {
      queryBuilder.andWhere('task.dataset_id = :datasetId', { datasetId });
    }

    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }

    if (createdAfter) {
      queryBuilder.andWhere('task.created_at >= :createdAfter', { createdAfter: new Date(createdAfter) });
    }

    if (createdBefore) {
      queryBuilder.andWhere('task.created_at <= :createdBefore', { createdBefore: new Date(createdBefore) });
    }

    // 排序
    const orderDirection = sortOrder.toUpperCase() as 'ASC' | 'DESC';
    queryBuilder.orderBy(`task.${sortBy}`, orderDirection);

    // 分页
    const skip = (page - 1) * pageSize;
    queryBuilder.skip(skip).take(pageSize);

    // 执行查询
    const [tasks, total] = await queryBuilder.getManyAndCount();

    this.logger.log(`Found ${total} tasks, returning page ${page} with ${tasks.length} items`);

    return {
      tasks,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 根据ID查询任务详情
   * 
   * @param taskId 任务ID
   * @returns 任务实体
   * @throws NotFoundException 如果任务不存在
   */
  async findOne(taskId: string): Promise<BacktestTaskEntity> {
    const task = await this.backtestTaskRepository.findOne({
      where: { taskId },
    });

    if (!task) {
      throw new NotFoundException(`Backtest task with ID ${taskId} not found`);
    }

    return task;
  }

  /**
   * 更新任务
   * 
   * @param taskId 任务ID
   * @param updateDto 更新数据DTO
   * @param userId 更新用户ID（可选）
   * @returns 更新后的任务实体
   * @throws NotFoundException 如果任务不存在
   */
  async update(
    taskId: string,
    updateDto: UpdateBacktestTaskDto,
    userId?: string,
  ): Promise<BacktestTaskEntity> {
    const task = await this.findOne(taskId);

    // 更新字段
    Object.assign(task, updateDto);
    task.updatedBy = userId;

    const updatedTask = await this.backtestTaskRepository.save(task);
    
    this.logger.log(`Backtest task updated: ${taskId}`);
    return updatedTask;
  }

  /**
   * 更新任务状态
   * 
   * @param taskId 任务ID
   * @param status 新状态
   * @param additionalData 附加数据（如进度、错误信息等）
   * @returns 更新后的任务实体
   */
  async updateStatus(
    taskId: string,
    status: BacktestTaskStatus,
    additionalData?: Partial<BacktestTaskEntity>,
  ): Promise<BacktestTaskEntity> {
    const task = await this.findOne(taskId);

    const previousStatus = task.status;
    task.status = status;

    // 根据状态更新时间戳
    if (status === BacktestTaskStatus.RUNNING && !task.startedAt) {
      task.startedAt = new Date();
    }

    if ([BacktestTaskStatus.COMPLETED, BacktestTaskStatus.FAILED, BacktestTaskStatus.CANCELLED].includes(status)) {
      task.completedAt = new Date();
    }

    // 应用附加数据
    if (additionalData) {
      Object.assign(task, additionalData);
    }

    const updatedTask = await this.backtestTaskRepository.save(task);
    
    this.logger.log(`Backtest task status updated: ${taskId} -> ${status}`);
    this.metrics?.recordTaskStatusChange(previousStatus, status);
    return updatedTask;
  }

  /**
   * 更新任务进度
   * 
   * @param taskId 任务ID
   * @param progress 进度百分比（0-100）
   * @returns 更新后的任务实体
   */
  async updateProgress(taskId: string, progress: number): Promise<BacktestTaskEntity> {
    if (progress < 0 || progress > 100) {
      throw new BadRequestException('Progress must be between 0 and 100');
    }

    const task = await this.findOne(taskId);
    task.progress = progress;

    const updatedTask = await this.backtestTaskRepository.save(task);
    
    this.logger.debug(`Task progress updated: ${taskId} -> ${progress}%`);
    return updatedTask;
  }

  async updateProgressFromWorker(
    taskId: string,
    payload: { progress?: number; metrics?: any; workerId?: string },
  ) {
    const task = await this.findOne(taskId);
    const normalizedProgress = Math.round(
      Math.min(Math.max((payload?.progress ?? 0) * 100, 0), 100),
    );
    const assignedWorkerId = payload?.workerId ?? task.assignedWorkerId ?? null;

    if (
      payload?.workerId &&
      task.assignedWorkerId &&
      payload.workerId !== task.assignedWorkerId
    ) {
      this.logger.warn(
        `Worker mismatch for task ${taskId}: assigned=${task.assignedWorkerId}, incoming=${payload.workerId}`,
      );
    }

    await this.backtestTaskRepository.update(
      { taskId },
      {
        progress: normalizedProgress,
        metricsSnapshot: payload?.metrics ?? task.metricsSnapshot ?? null,
        assignedWorkerId,
        startedAt: task.startedAt ?? new Date(),
        status:
          task.status === BacktestTaskStatus.PENDING ? BacktestTaskStatus.RUNNING : task.status,
      },
    );
    this.metrics?.recordTaskProgress(normalizedProgress);
  }

  async completeFromWorker(
    taskId: string,
    payload: { status?: string; metrics?: any; summary?: any; workerId?: string },
  ) {
    const task = await this.findOne(taskId);
    const finalStatus = this.mapWorkerStatus(payload?.status, task.status);
    const updateData: Partial<BacktestTaskEntity> = {
      metricsSnapshot: payload?.metrics ?? task.metricsSnapshot ?? null,
      assignedWorkerId: null,
    };

    if (finalStatus === BacktestTaskStatus.COMPLETED) {
      updateData.resultSummary = payload?.summary ?? task.resultSummary ?? null;
      updateData.progress = 100;
    }

    await this.updateStatus(taskId, finalStatus, updateData);
    this.releaseWorkerCapacity(payload?.workerId ?? task.assignedWorkerId ?? undefined);
  }

  /**
   * 取消任务
   * 
   * @param taskId 任务ID
   * @returns 取消后的任务实体
   * @throws BadRequestException 如果任务状态不允许取消
   */
  async cancel(taskId: string): Promise<BacktestTaskEntity> {
    const task = await this.findOne(taskId);

    // 只有待执行和运行中的任务可以取消
    if (![BacktestTaskStatus.PENDING, BacktestTaskStatus.RUNNING].includes(task.status)) {
      throw new BadRequestException(
        `Cannot cancel task in ${task.status} status. Only pending or running tasks can be cancelled.`,
      );
    }

    return this.updateStatus(taskId, BacktestTaskStatus.CANCELLED);
  }

  /**
   * 删除任务
   * 
   * @param taskId 任务ID
   * @throws BadRequestException 如果任务正在运行
   */
  async remove(taskId: string): Promise<void> {
    const task = await this.findOne(taskId);

    // 不允许删除运行中的任务
    if (task.status === BacktestTaskStatus.RUNNING) {
      throw new BadRequestException('Cannot delete a running task. Please cancel it first.');
    }

    await this.backtestTaskRepository.remove(task);
    
    this.logger.log(`Backtest task deleted: ${taskId}`);
  }

  /**
   * 复制任务配置
   * 
   * @param taskId 任务ID
   * @returns 任务配置（用于创建新任务）
   */
  async copyTaskConfig(taskId: string): Promise<CreateBacktestTaskDto> {
    const task = await this.findOne(taskId);

    return {
      taskName: `${task.taskName} (Copy)`,
      taskDescription: task.taskDescription,
      strategyId: task.strategyId,
      scriptVersionId: task.scriptVersionId,
      datasetId: task.datasetId,
      strategyParams: task.strategyParams,
      executionConfig: task.executionConfig,
      dataConfig: task.dataConfig,
    };
  }

  /**
   * 重试失败的任务
   * 
   * @param taskId 任务ID
   * @param userId 用户ID（可选）
   * @returns 新创建的任务实体
   * @throws BadRequestException 如果任务状态不是失败
   */
  async retry(taskId: string, userId?: string): Promise<BacktestTaskEntity> {
    const task = await this.findOne(taskId);

    if (task.status !== BacktestTaskStatus.FAILED) {
      throw new BadRequestException('Only failed tasks can be retried');
    }

    // 复制配置创建新任务
    const config = await this.copyTaskConfig(taskId);
    config.taskName = `${task.taskName} (Retry)`;

    return this.create(config, userId);
  }

  private mapWorkerStatus(
    reportedStatus: string | undefined,
    currentStatus: BacktestTaskStatus,
  ): BacktestTaskStatus {
    if (currentStatus === BacktestTaskStatus.CANCELLED) {
      return BacktestTaskStatus.CANCELLED;
    }
    switch (reportedStatus) {
      case 'failed':
        return BacktestTaskStatus.FAILED;
      case 'cancelled':
        return BacktestTaskStatus.CANCELLED;
      default:
        return BacktestTaskStatus.COMPLETED;
    }
  }

  private releaseWorkerCapacity(workerId?: string) {
    if (!workerId) {
      return;
    }
    this.serviceRegistry.updateLoad(workerId, -1);
  }
}
