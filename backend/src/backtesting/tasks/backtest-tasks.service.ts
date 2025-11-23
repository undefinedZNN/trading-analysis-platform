import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, Between } from 'typeorm';
import * as duckdb from 'duckdb';
import { access } from 'fs/promises';
import { InternalServerErrorException } from '@nestjs/common';
import {
  BacktestTaskEntity,
  BacktestTaskStatus,
} from './entities';
import {
  CreateBacktestTaskDto,
  UpdateBacktestTaskDto,
  ListBacktestTasksDto,
  ListTaskTradesDto,
  TaskTradeRecord,
  TradeFactorSnapshot,
  TaskBarsQueryDto,
  TaskBarsResponse,
} from './dto';
import { ServiceRegistryService } from '../service-registry/service-registry.service';
import { BacktestMetricsService } from '../monitoring/backtest-metrics.service';
import { BACKTEST_RESULTS_ROOT, resolveBacktestResultPath } from '../../config/storage.config';
import * as path from 'path';
import { TradingDataService } from '../../trading-data/trading-data.service';

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
    private readonly tradingDataService: TradingDataService,
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
      const summary = payload?.summary ?? task.resultSummary ?? null;
      updateData.resultSummary = summary;
      updateData.progress = 100;

      const artifactPath = this.extractTradeArtifactPath(summary);
      if (artifactPath) {
        updateData.resultFilePath = artifactPath;
      }
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
   * 暂停任务
   * 
   * @param taskId 任务ID
   * @returns 暂停后的任务实体
   * @throws BadRequestException 如果任务状态不允许暂停
   */
  async pause(taskId: string): Promise<BacktestTaskEntity> {
    const task = await this.findOne(taskId);

    // 只有运行中的任务可以暂停
    if (task.status !== BacktestTaskStatus.RUNNING) {
      throw new BadRequestException(
        `Cannot pause task in ${task.status} status. Only running tasks can be paused.`,
      );
    }

    // 更新任务状态为paused
    task.status = BacktestTaskStatus.PAUSED;
    const pausedTask = await this.backtestTaskRepository.save(task);
    
    this.logger.log(`Backtest task paused: ${taskId}`);
    return pausedTask;
  }

  /**
   * 恢复暂停的任务
   * 
   * @param taskId 任务ID
   * @returns 恢复后的任务实体
   * @throws BadRequestException 如果任务状态不允许恢复
   */
  async resume(taskId: string): Promise<BacktestTaskEntity> {
    const task = await this.findOne(taskId);

    // 只有暂停的任务可以恢复
    if (task.status !== BacktestTaskStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot resume task in ${task.status} status. Only paused tasks can be resumed.`,
      );
    }

    // 恢复任务到运行状态
    return this.updateStatus(taskId, BacktestTaskStatus.RUNNING);
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

  private extractTradeArtifactPath(summary: any): string | null {
    const artifacts: any[] | undefined = summary?.artifacts;
    if (!Array.isArray(artifacts)) {
      return null;
    }
    const tradeArtifact = artifacts.find(
      (item) => item?.type === 'trades/parquet' && typeof item?.path === 'string',
    );
    return tradeArtifact?.path ?? null;
  }

  async getTradeResultPath(taskId: string): Promise<{
    relativePath: string;
    absolutePath: string;
  }> {
    const task = await this.findOne(taskId);
    const relativePath =
      task.resultFilePath ??
      this.extractTradeArtifactPath(task.resultSummary) ??
      null;

    if (!relativePath) {
      throw new NotFoundException('该任务没有可用的交易明细文件');
    }

    const normalized = this.normalizeResultRelativePath(relativePath);
    const absolutePath = path.isAbsolute(normalized.absolute)
      ? normalized.absolute
      : resolveBacktestResultPath(normalized.relative);
    return { relativePath: normalized.relative, absolutePath };
  }

  async listTrades(
    taskId: string,
    { page = 1, pageSize = 50 }: ListTaskTradesDto,
  ): Promise<{
    trades: TaskTradeRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { absolutePath } = await this.getTradeResultPath(taskId);
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('交易明细文件不存在或已被清理');
    }
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(500, pageSize));
    const offset = (safePage - 1) * safePageSize;
    const db = new duckdb.Database(':memory:');
    const connection = db.connect();

    try {
      const source = absolutePath.replace(/'/g, "''");
      const countRows = await this.runDuckDbQuery<{ count: number }>(
        connection,
        `SELECT COUNT(*) AS count FROM read_parquet('${source}')`,
      );
      const total = Number(countRows?.[0]?.count ?? 0);
      if (total === 0 || offset >= total) {
        return {
          trades: [],
          total,
          page: safePage,
          pageSize: safePageSize,
        };
      }

      const rows = await this.runDuckDbQuery<Record<string, any>>(
        connection,
        `
          SELECT *
          FROM read_parquet('${source}')
          ORDER BY ts ASC, sequence_id ASC
          LIMIT ${safePageSize}
          OFFSET ${offset}
        `,
      );

      const trades = rows.map((row) => this.mapTradeRow(row));
      return {
        trades,
        total,
        page: safePage,
        pageSize: safePageSize,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `读取交易明细失败: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      connection.close();
      db.close();
    }
  }

  async getTaskBars(
    taskId: string,
    query: TaskBarsQueryDto,
  ): Promise<TaskBarsResponse> {
    const task = await this.findOne(taskId);
    const dataset = await this.tradingDataService.getDatasetById(task.datasetId);

    const resolution =
      query.resolution ||
      task.dataConfig?.timeframe ||
      dataset.granularity ||
      '1m';

    const intervalSeconds = this.parseResolutionToSeconds(resolution);
    if (!intervalSeconds) {
      throw new BadRequestException(`无法解析时间粒度 ${resolution}`);
    }

    const beforeBars = Math.max(query.beforeBars ?? 60, 0);
    const afterBars = Math.max(query.afterBars ?? 60, 0);

    const centerMs = this.resolveCenterTimestamp(query) ?? dataset.timeEnd?.getTime();
    if (!centerMs || !Number.isFinite(centerMs)) {
      throw new BadRequestException('缺少有效的时间参数');
    }

    const fromMs = centerMs - beforeBars * intervalSeconds * 1000;
    const toMs = centerMs + afterBars * intervalSeconds * 1000;

    const result = await this.tradingDataService.getDatasetCandles(task.datasetId, {
      resolution,
      from: Math.floor(fromMs / 1000),
      to: Math.ceil(toMs / 1000),
      limit: Math.min(beforeBars + afterBars + 1, 5000),
    });

    return {
      taskId,
      datasetId: task.datasetId,
      resolution: result.resolution,
      from: result.from,
      to: result.to,
      limit: result.limit,
      hasMore: result.hasMore,
      candles: result.candles,
    };
  }

  private releaseWorkerCapacity(workerId?: string) {
    if (!workerId) {
      return;
    }
    this.serviceRegistry.updateLoad(workerId, -1);
  }

  private resolveCenterTimestamp(query: TaskBarsQueryDto): number | undefined {
    if (query.timestampSec !== undefined) {
      return query.timestampSec * 1000;
    }
    if (query.timestamp) {
      const parsed = Date.parse(query.timestamp);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private parseResolutionToSeconds(resolution: string | undefined): number | null {
    if (!resolution) {
      return null;
    }
    const match = /^(\d+)([smhd])$/i.exec(resolution.trim());
    if (!match) {
      return null;
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return null;
    }
  }

  private runDuckDbQuery<T = Record<string, any>>(
    connection: duckdb.Connection,
    sql: string,
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      connection.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  private mapTradeRow(row: Record<string, any>): TaskTradeRecord {
    const factorSnapshot = this.parseFactorSnapshot(row);
    const positionQuantity = this.toNumber(row.position_qty);
    const positionAvgEntry = this.toNumber(row.position_avg_entry);
    const context = this.safeParseJson(row.context_json);
    const exitSegments = this.parseExitSegments(context);
    return {
      taskId: row.task_id,
      sessionId: row.session_id,
      strategyId: row.strategy_id,
      scriptVersionId: row.script_version_id ?? undefined,
      symbol: row.symbol,
      side: row.side,
      type: row.trade_type,
      quantity: this.toNumber(row.quantity),
      price: this.toNumber(row.price),
      realizedPnl: this.toNumber(row.realized_pnl),
      unrealizedPnl: this.toNumber(row.unrealized_pnl),
      fees: this.toNumber(row.fees),
      feeCurrency: row.fee_currency ?? undefined,
      liquidity: row.liquidity ?? undefined,
      timestamp: this.formatTimestamp(row.ts),
      sequenceId: row.sequence_id ?? undefined,
      position:
        positionQuantity !== null || positionAvgEntry !== null || row.position_side
          ? {
              quantity: positionQuantity,
              avgEntryPrice: positionAvgEntry,
              side: row.position_side ?? null,
            }
          : undefined,
      reason: row.reason ?? null,
      factorSnapshot,
      entryPrice: this.toNumber(row.entry_price),
      exitPrice: this.toNumber(row.exit_price),
      stopPrice: this.toNumber(row.stop_price),
      targetPrice: this.toNumber(row.target_price),
      barTimestamp: this.formatTimestamp(row.bar_ts),
      entryTimestamp: context?.entryTimestamp ? this.formatTimestamp(context.entryTimestamp) : null,
      exitTimestamp: context?.exitTimestamp
        ? this.formatTimestamp(context.exitTimestamp)
        : this.formatTimestamp(row.ts),
      exitSegments: exitSegments ?? undefined,
      status: context?.status ?? null,
      context: context ?? undefined,
    };
  }

  private parseFactorSnapshot(row: Record<string, any>): TradeFactorSnapshot | undefined {
    const system = this.safeParseJson(row.factor_system);
    const custom = this.safeParseJson(row.factor_custom);
    const snapshot: TradeFactorSnapshot = {};
    if (system && Object.keys(system).length > 0) {
      snapshot.system = system;
    }
    if (custom && Object.keys(custom).length > 0) {
      snapshot.custom = custom;
    }
    return Object.keys(snapshot).length > 0 ? snapshot : undefined;
  }

  private safeParseJson(value: any): Record<string, any> | undefined {
    if (!value || typeof value !== 'string') {
      return undefined;
    }
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private toNumber(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private formatTimestamp(value: any): string | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return null;
    }
    const millis = num > 1e12 ? num : num * 1000;
    return new Date(millis).toISOString();
  }

  private parseExitSegments(context?: Record<string, any>) {
    if (!context?.exitSegments || !Array.isArray(context.exitSegments)) {
      return undefined;
    }
    return context.exitSegments.map((segment: any) => ({
      price: this.toNumber(segment.price) ?? 0,
      quantity: this.toNumber(segment.quantity) ?? 0,
      timestamp: this.formatTimestamp(segment.timestamp) ?? null,
      barTimestamp: this.formatTimestamp(segment.barTimestamp),
      reason: typeof segment.reason === 'string' ? segment.reason : undefined,
    }));
  }

  private normalizeResultRelativePath(relativePath: string) {
    const normalized = relativePath.replace(/\\/g, '/');
    if (path.isAbsolute(normalized)) {
      const rel = path.relative(BACKTEST_RESULTS_ROOT, normalized);
      return { relative: rel, absolute: normalized };
    }
    const match = normalized.match(/backtests\/(.+)$/);
    if (match) {
      const trimmed = match[1];
      return { relative: trimmed, absolute: path.resolve(BACKTEST_RESULTS_ROOT, trimmed) };
    }
    return { relative: normalized, absolute: path.resolve(BACKTEST_RESULTS_ROOT, normalized) };
  }

  // ============================================
  // Checkpoint 相关方法
  // ============================================

  /**
   * 更新任务的 Checkpoint 状态
   * 
   * @param taskId 任务ID
   * @param data Checkpoint 数据
   */
  async updateCheckpointStatus(
    taskId: string,
    data: {
      lastCheckpointBar?: number;
      checkpointFilePath?: string;
      canResume?: boolean;
    },
  ): Promise<void> {
    this.logger.log(`Updating checkpoint status for task: ${taskId}`);

    const task = await this.findOne(taskId);
    
    if (data.lastCheckpointBar !== undefined) {
      task.lastCheckpointBar = data.lastCheckpointBar;
    }
    if (data.checkpointFilePath !== undefined) {
      task.checkpointFilePath = data.checkpointFilePath;
    }
    if (data.canResume !== undefined) {
      task.canResume = data.canResume;
    }

    await this.backtestTaskRepository.save(task);
    
    this.logger.log(
      `Checkpoint status updated: bar=${data.lastCheckpointBar}, canResume=${data.canResume}`,
    );
  }

  /**
   * 查询可恢复的任务列表
   * 
   * @returns 可恢复的任务列表
   */
  async findResumableTasks(): Promise<BacktestTaskEntity[]> {
    this.logger.debug('Finding resumable tasks');

    return await this.backtestTaskRepository.find({
      where: {
        canResume: true,
        status: BacktestTaskStatus.FAILED, // 只查找失败的任务
      },
      order: {
        updatedAt: 'DESC',
      },
    });
  }

  // ============================================
  // 文件路径相关方法
  // ============================================

  /**
   * 更新任务的 Parquet 文件路径
   * 
   * @param taskId 任务ID
   * @param data 文件路径数据
   */
  async updateFilePaths(
    taskId: string,
    data: {
      tradesFilePath?: string;
      equityFilePath?: string;
    },
  ): Promise<BacktestTaskEntity> {
    this.logger.log(`Updating file paths for task: ${taskId}`);

    const task = await this.findOne(taskId);
    
    if (data.tradesFilePath !== undefined) {
      task.tradesFilePath = data.tradesFilePath;
    }
    if (data.equityFilePath !== undefined) {
      task.equityFilePath = data.equityFilePath;
    }

    return await this.backtestTaskRepository.save(task);
    
    this.logger.log(
      `File paths updated: trades=${data.tradesFilePath}, equity=${data.equityFilePath}`,
    );
  }

  /**
   * 查询有文件的任务列表
   * 
   * @returns 有文件的任务列表
   */
  async findTasksWithFiles(): Promise<BacktestTaskEntity[]> {
    this.logger.debug('Finding tasks with files');

    // 使用 QueryBuilder 查询有文件路径的任务
    return await this.backtestTaskRepository
      .createQueryBuilder('task')
      .where('task.tradesFilePath IS NOT NULL')
      .orWhere('task.equityFilePath IS NOT NULL')
      .orderBy('task.completedAt', 'DESC')
      .getMany();
  }

  // ============================================
  // 统计相关方法
  // ============================================

  /**
   * 获取任务统计信息
   * 
   * @returns 统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    successRate: number;
    averageExecutionTime: number | null;
  }> {
    this.logger.debug('Getting task statistics');

    // 获取各状态的任务数量
    const [
      total,
      pending,
      running,
      completed,
      failed,
      cancelled,
    ] = await Promise.all([
      this.backtestTaskRepository.count(),
      this.backtestTaskRepository.count({ where: { status: BacktestTaskStatus.PENDING } }),
      this.backtestTaskRepository.count({ where: { status: BacktestTaskStatus.RUNNING } }),
      this.backtestTaskRepository.count({ where: { status: BacktestTaskStatus.COMPLETED } }),
      this.backtestTaskRepository.count({ where: { status: BacktestTaskStatus.FAILED } }),
      this.backtestTaskRepository.count({ where: { status: BacktestTaskStatus.CANCELLED } }),
    ]);

    // 计算成功率
    const finishedTasks = completed + failed;
    const successRate = finishedTasks > 0 ? completed / finishedTasks : 0;

    // 计算平均执行时间（只统计已完成的任务）
    let averageExecutionTime: number | null = null;
    const completedTasks = await this.backtestTaskRepository.find({
      where: { status: BacktestTaskStatus.COMPLETED },
      select: ['startedAt', 'completedAt'],
    });

    if (completedTasks.length > 0) {
      const totalExecutionTime = completedTasks.reduce((sum, task) => {
        if (task.startedAt && task.completedAt) {
          return sum + (task.completedAt.getTime() - task.startedAt.getTime());
        }
        return sum;
      }, 0);
      averageExecutionTime = totalExecutionTime / completedTasks.length;
    }

    return {
      total,
      pending,
      running,
      completed,
      failed,
      cancelled,
      successRate: Math.round(successRate * 10000) / 10000, // 保留4位小数
      averageExecutionTime,
    };
  }

  /**
   * 获取最近任务列表
   * 
   * @param options 查询选项
   * @returns 最近任务列表
   */
  async getRecentTasks(options: {
    limit?: number;
    status?: string[];
    sortBy?: 'createdAt' | 'completedAt';
  }): Promise<any[]> {
    const { limit = 10, status, sortBy = 'createdAt' } = options;
    
    this.logger.debug(`Getting recent tasks: limit=${limit}, status=${status?.join(',')}, sortBy=${sortBy}`);

    const queryBuilder = this.backtestTaskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.strategy', 'strategy')
      .select([
        'task.taskId',
        'task.taskName',
        'task.taskDescription',
        'task.status',
        'task.progress',
        'task.createdAt',
        'task.startedAt',
        'task.completedAt',
        'task.metricsSnapshot',
        'strategy.strategyId',
        'strategy.strategyName',
      ]);

    // 状态筛选
    if (status && status.length > 0) {
      queryBuilder.andWhere('task.status IN (:...status)', { status });
    }

    // 排序
    queryBuilder.orderBy(`task.${sortBy}`, 'DESC');

    // 限制数量
    queryBuilder.limit(limit);

    const tasks = await queryBuilder.getMany();

    // 格式化返回数据
    return tasks.map(task => ({
      taskId: task.taskId,
      taskName: task.taskName,
      taskDescription: task.taskDescription,
      status: task.status,
      progress: task.progress,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      strategyId: task.strategy?.strategyId,
      strategyName: task.strategy?.strategyName,
      metricsSnapshot: task.metricsSnapshot,
    }));
  }

  /**
   * 获取任务趋势数据
   * 
   * @param options 查询选项
   * @returns 趋势数据
   */
  async getTrend(options: {
    days?: number;
    groupBy?: 'day' | 'hour';
  }): Promise<any[]> {
    const { days = 7, groupBy = 'day' } = options;
    
    this.logger.debug(`Getting task trend: days=${days}, groupBy=${groupBy}`);

    // 计算起始时间
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // 获取时间范围内的所有任务
    const tasks = await this.backtestTaskRepository.find({
      where: {
        createdAt: Between(startDate, new Date()),
      },
      select: ['taskId', 'status', 'createdAt', 'completedAt'],
      order: {
        createdAt: 'ASC',
      },
    });

    // 按日期分组统计
    const trendMap = new Map<string, {
      date: string;
      total: number;
      pending: number;
      running: number;
      completed: number;
      failed: number;
      cancelled: number;
    }>();

    // 初始化所有日期
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      trendMap.set(dateKey, {
        date: dateKey,
        total: 0,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      });
    }

    // 统计任务
    tasks.forEach(task => {
      const dateKey = task.createdAt.toISOString().split('T')[0];
      const stats = trendMap.get(dateKey);
      
      if (stats) {
        stats.total++;
        
        switch (task.status) {
          case BacktestTaskStatus.PENDING:
            stats.pending++;
            break;
          case BacktestTaskStatus.RUNNING:
            stats.running++;
            break;
          case BacktestTaskStatus.COMPLETED:
            stats.completed++;
            break;
          case BacktestTaskStatus.FAILED:
            stats.failed++;
            break;
          case BacktestTaskStatus.CANCELLED:
            stats.cancelled++;
            break;
        }
      }
    });

    // 转换为数组并计算成功率
    const trendData = Array.from(trendMap.values()).map(stats => {
      const finished = stats.completed + stats.failed;
      const successRate = finished > 0 ? stats.completed / finished : 0;
      
      return {
        ...stats,
        successRate: Math.round(successRate * 10000) / 10000,
      };
    });

    return trendData;
  }
}
