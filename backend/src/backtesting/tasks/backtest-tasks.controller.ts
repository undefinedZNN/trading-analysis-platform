import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { access } from 'fs/promises';
import { BacktestTasksService } from './backtest-tasks.service';
import { TaskLogsService } from './task-logs.service';
import { TaskExecutorService } from './task-executor.service';
import {
  CreateBacktestTaskDto,
  UpdateBacktestTaskDto,
  ListBacktestTasksDto,
  ListTaskLogsDto,
  ListTaskTradesDto,
  TaskBarsQueryDto,
  WorkerProgressDto,
  WorkerResultDto,
} from './dto';
import { BacktestTaskEntity, TaskLogEntity } from './entities';

/**
 * 回测任务控制器
 * 
 * 提供回测任务管理的REST API端点
 */
@ApiTags('Backtest Tasks')
@Controller('backtesting/tasks')
export class BacktestTasksController {
  private readonly logger = new Logger(BacktestTasksController.name);

  constructor(
    private readonly backtestTasksService: BacktestTasksService,
    private readonly taskLogsService: TaskLogsService,
    private readonly taskExecutorService: TaskExecutorService,
  ) {}

  private verifyWorkerToken(token?: string) {
    const expected = process.env.BACKTEST_WORKER_SHARED_SECRET;
    if (expected && token !== expected) {
      throw new UnauthorizedException('Invalid worker token');
    }
  }

  /**
   * 创建回测任务
   */
  @Post()
  @ApiOperation({
    summary: '创建回测任务',
    description: '创建一个新的回测任务。需要提供策略ID、脚本版本ID、数据集ID以及相关配置参数。',
  })
  @ApiBody({
    type: CreateBacktestTaskDto,
    description: '创建任务所需的配置信息',
    examples: {
      example1: {
        summary: '双均线策略示例',
        value: {
          taskName: '双均线策略回测-2024全年',
          taskDescription: '测试双均线策略在2024年BTC/USDT上的表现',
          strategyId: '550e8400-e29b-41d4-a716-446655440000',
          scriptVersionId: '660e8400-e29b-41d4-a716-446655440001',
          datasetId: 1,
          strategyParams: {
            fastPeriod: 10,
            slowPeriod: 30,
            positionSize: 0.5,
          },
          executionConfig: {
            initialCapital: 10000,
            leverage: 1,
            slippage: 0,
            fees: {
              makerFee: 0.0002,
              takerFee: 0.0005,
            },
          },
          dataConfig: {
            timeRange: {
              start: '2024-01-01T00:00:00Z',
              end: '2024-12-31T23:59:59Z',
            },
            timeframe: '1h',
          },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: '任务创建成功',
    type: BacktestTaskEntity,
  })
  @ApiBadRequestResponse({
    description: '请求参数验证失败',
    schema: {
      example: {
        message: ['taskName should not be empty', 'strategyId must be a UUID'],
        error: 'Bad Request',
        statusCode: 400,
      },
    },
  })
  async create(
    @Body(ValidationPipe) createDto: CreateBacktestTaskDto,
  ): Promise<BacktestTaskEntity> {
    return await this.backtestTasksService.create(createDto);
  }

  /**
   * 查询任务列表（分页）
   */
  @Get()
  @ApiOperation({
    summary: '查询回测任务列表',
    description: '查询回测任务列表，支持关键词搜索、多维度筛选、排序和分页。',
  })
  @ApiQuery({ name: 'keyword', required: false, description: '搜索关键词（搜索任务名称和描述）', example: '双均线' })
  @ApiQuery({ name: 'strategyId', required: false, description: '策略ID筛选', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiQuery({ name: 'scriptVersionId', required: false, description: '脚本版本ID筛选' })
  @ApiQuery({ name: 'datasetId', required: false, description: '数据集ID筛选', example: 1 })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], description: '任务状态筛选' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'startedAt', 'completedAt', 'taskName'], description: '排序字段' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: '排序方向' })
  @ApiQuery({ name: 'page', required: false, description: '页码（从1开始）', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页数量', example: 20 })
  @ApiOkResponse({
    description: '任务列表查询成功',
    schema: {
      example: {
        tasks: [
          {
            taskId: '770e8400-e29b-41d4-a716-446655440002',
            taskName: '双均线策略回测-2024全年',
            status: 'running',
            progress: 45,
            assignedWorkerId: 'worker-1',
            metricsSnapshot: {
              runningTasks: 1,
              throughput: 1200,
            },
            createdAt: '2025-11-12T10:30:00Z',
            startedAt: '2025-11-12T10:31:00Z',
          },
        ],
        total: 15,
        page: 1,
        pageSize: 20,
      },
    },
  })
  async findAll(
    @Query(ValidationPipe) listDto: ListBacktestTasksDto,
  ): Promise<{
    tasks: BacktestTaskEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return await this.backtestTasksService.findAll(listDto);
  }

  /**
   * 查询任务详情
   */
  @Get(':taskId')
  @ApiOperation({
    summary: '查询回测任务详情',
    description: '查询指定任务的完整信息，包括配置参数、执行状态和结果摘要。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '770e8400-e29b-41d4-a716-446655440002',
  })
  @ApiOkResponse({
    description: '任务详情查询成功',
    type: BacktestTaskEntity,
  })
  @ApiNotFoundResponse({
    description: '任务不存在',
    schema: {
      example: {
        message: 'Backtest task with ID 770e8400-e29b-41d4-a716-446655440002 not found',
        error: 'Not Found',
        statusCode: 404,
      },
    },
  })
  async findOne(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<BacktestTaskEntity> {
    return await this.backtestTasksService.findOne(taskId);
  }

  /**
   * 分页查询交易明细
   */
  @Get(':taskId/trades/list')
  @ApiOperation({
    summary: '查询交易明细（分页）',
    description: '基于 Parquet 结果文件读取指定任务的交易明细，支持分页返回。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
  })
  @ApiQuery({ name: 'page', required: false, description: '页码（从1开始）', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页数量，最大500', example: 50 })
  @ApiOkResponse({
    description: '交易明细列表',
    schema: {
      example: {
        trades: [
          {
            taskId: '770e8400-e29b-41d4-a716-446655440002',
            symbol: 'ES-23/ES',
            side: 'buy',
            type: 'open',
            quantity: 1.25,
            price: 1543.37,
            realizedPnl: 12.5,
            fees: 0.5,
            timestamp: '2025-11-18T02:33:43.000Z',
            factorSnapshot: {
              system: { fast_ma: 1500.23 },
              custom: { riskScore: 'medium' },
            },
            entryPrice: 1543.37,
            stopPrice: 1542.38,
            targetPrice: 1544.35,
            barTimestamp: '2025-11-18T02:33:40.000Z',
          },
        ],
        total: 128,
        page: 1,
        pageSize: 50,
      },
    },
  })
  async listTrades(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query(ValidationPipe) query: ListTaskTradesDto,
  ) {
    return await this.backtestTasksService.listTrades(taskId, query);
  }

  /**
   * 查询任务K线片段
   */
  @Get(':taskId/bars')
  @ApiOperation({
    summary: '查询任务数据集的K线片段',
    description: '基于任务绑定的数据集返回以指定时间为中心的K线窗口，供交易回放使用。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
  })
  @ApiQuery({ name: 'timestamp', required: false, description: '中心时间（ISO格式）' })
  @ApiQuery({ name: 'timestampSec', required: false, description: '中心时间（Unix秒）' })
  @ApiQuery({ name: 'resolution', required: false, description: 'K线粒度，例如 1m/5m/1h' })
  @ApiQuery({ name: 'beforeBars', required: false, description: '向前K线数量' })
  @ApiQuery({ name: 'afterBars', required: false, description: '向后K线数量' })
  @ApiOkResponse({
    description: '返回指定窗口内的K线数据',
  })
  async getTaskBars(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query(ValidationPipe) query: TaskBarsQueryDto,
  ) {
    return await this.backtestTasksService.getTaskBars(taskId, query);
  }

  /**
   * 下载交易明细（Parquet）
   */
  @Get(':taskId/trades')
  @ApiOperation({
    summary: '下载交易明细（Parquet）',
    description: '下载指定任务生成的交易明细 Parquet 文件。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
  })
  @ApiOkResponse({
    description: '返回 Parquet 文件流',
  })
  async downloadTrades(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { absolutePath } = await this.backtestTasksService.getTradeResultPath(taskId);

    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('交易明细文件不存在或已清理');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${taskId}-trades.parquet"`,
    );

    createReadStream(absolutePath).pipe(res);
  }

  /**
   * 更新任务
   */
  @Patch(':taskId')
  @ApiOperation({ summary: '更新回测任务' })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务更新成功',
    type: BacktestTaskEntity,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '任务不存在',
  })
  async update(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(ValidationPipe) updateDto: UpdateBacktestTaskDto,
  ): Promise<BacktestTaskEntity> {
    return await this.backtestTasksService.update(taskId, updateDto);
  }

  /**
   * 取消任务
   */
  @Post(':taskId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '取消回测任务',
    description: '取消正在运行或待执行的任务。已完成、失败或已取消的任务无法再次取消。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '770e8400-e29b-41d4-a716-446655440002',
  })
  @ApiOkResponse({
    description: '任务取消成功',
    type: BacktestTaskEntity,
  })
  @ApiBadRequestResponse({
    description: '任务状态不允许取消',
    schema: {
      example: {
        message: 'Cannot cancel task in completed status. Only pending or running tasks can be cancelled.',
        error: 'Bad Request',
        statusCode: 400,
      },
    },
  })
  @ApiNotFoundResponse({
    description: '任务不存在',
  })
  async cancel(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<BacktestTaskEntity> {
    await this.taskExecutorService.cancelTask(taskId);
    return await this.backtestTasksService.cancel(taskId);
  }

  /**
   * 重试失败的任务
   */
  @Post(':taskId/retry')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '重试失败的任务' })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '重试任务创建成功',
    type: BacktestTaskEntity,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '只有失败的任务可以重试',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '任务不存在',
  })
  async retry(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<BacktestTaskEntity> {
    return await this.backtestTasksService.retry(taskId);
  }

  /**
   * 复制任务配置
   */
  @Get(':taskId/copy')
  @ApiOperation({ summary: '复制任务配置（用于快速创建相似任务）' })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '配置复制成功',
    type: CreateBacktestTaskDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '任务不存在',
  })
  async copyConfig(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<CreateBacktestTaskDto> {
    return await this.backtestTasksService.copyTaskConfig(taskId);
  }

  /**
   * 删除任务
   */
  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '删除回测任务',
    description: '删除指定的回测任务。运行中的任务无法删除，需要先取消任务。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '770e8400-e29b-41d4-a716-446655440002',
  })
  @ApiNoContentResponse({
    description: '任务删除成功',
  })
  @ApiBadRequestResponse({
    description: '运行中的任务无法删除',
    schema: {
      example: {
        message: 'Cannot delete a running task. Please cancel it first.',
        error: 'Bad Request',
        statusCode: 400,
      },
    },
  })
  @ApiNotFoundResponse({
    description: '任务不存在',
  })
  async remove(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<void> {
    await this.backtestTasksService.remove(taskId);
  }

  /**
   * 查询任务日志
   */
  @Get(':taskId/logs')
  @ApiOperation({
    summary: '查询任务执行日志',
    description: '查询任务的执行日志，支持按级别筛选、关键词搜索和下拉加载（通过before参数实现）。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '770e8400-e29b-41d4-a716-446655440002',
  })
  @ApiQuery({ name: 'level', required: false, enum: ['debug', 'info', 'warn', 'error'], description: '日志级别筛选' })
  @ApiQuery({ name: 'keyword', required: false, description: '搜索关键词', example: 'trade' })
  @ApiQuery({ name: 'before', required: false, description: '获取此日志ID之前的日志（用于下拉加载）', example: '12345' })
  @ApiQuery({ name: 'limit', required: false, description: '返回日志数量（默认100，最大500）', example: 100 })
  @ApiOkResponse({
    description: '日志查询成功',
    schema: {
      example: {
        logs: [
          {
            logId: '12350',
            taskId: '770e8400-e29b-41d4-a716-446655440002',
            level: 'info',
            module: 'Orchestrator',
            message: 'Backtest session started',
            metadata: { sessionId: 'session-123' },
            loggedAt: '2025-11-12T10:31:00Z',
          },
        ],
        hasMore: true,
      },
    },
  })
  async getLogs(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query(ValidationPipe) listDto: ListTaskLogsDto,
  ): Promise<{
    logs: TaskLogEntity[];
    hasMore: boolean;
  }> {
    return await this.taskLogsService.findByTask(taskId, listDto);
  }

  /**
   * 查询任务日志统计
   */
  @Get(':taskId/logs/stats')
  @ApiOperation({ summary: '查询任务日志统计（按级别分组）' })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '日志统计查询成功',
  })
  async getLogStats(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<{
    total: number;
    debug: number;
    info: number;
    warn: number;
    error: number;
  }> {
    return await this.taskLogsService.countByLevel(taskId);
  }

  /**
   * 手动执行任务
   */
  @Post(':taskId/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '手动执行任务',
    description: '手动触发 pending 状态的任务开始执行。任务将异步执行，不阻塞响应。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID',
    type: 'string',
    example: '770e8400-e29b-41d4-a716-446655440002',
  })
  @ApiOkResponse({
    description: '任务开始执行',
    schema: {
      example: {
        message: 'Task execution started',
        taskId: '770e8400-e29b-41d4-a716-446655440002',
      },
    },
  })
  @ApiBadRequestResponse({
    description: '任务状态不允许执行',
    schema: {
      example: {
        message: 'Task is not in pending status (current: running)',
        error: 'Bad Request',
        statusCode: 400,
      },
    },
  })
  @ApiNotFoundResponse({
    description: '任务不存在',
    schema: {
      example: {
        message: 'Task not found',
        error: 'Not Found',
        statusCode: 404,
      },
    },
  })
  async executeTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<{ message: string; taskId: string }> {
    this.logger.log(`Received request to execute task: ${taskId}`);
    
    // 异步执行，不等待完成
    this.taskExecutorService.executeTask(taskId).catch((error) => {
      this.logger.error(`Task execution failed: ${error.message}`, error.stack);
    });
    
    return {
      message: 'Task execution started',
      taskId,
    };
  }

  @Post(':taskId/progress')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Worker 回调：更新任务进度' })
  async updateProgress(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() payload: WorkerProgressDto,
    @Headers('x-worker-key') workerKey?: string,
  ): Promise<{ status: string }> {
    this.verifyWorkerToken(workerKey);
    await this.backtestTasksService.updateProgressFromWorker(taskId, payload);
    return { status: 'accepted' };
  }

  @Post(':taskId/result')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Worker 回调：任务完成' })
  async submitResult(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() payload: WorkerResultDto,
    @Headers('x-worker-key') workerKey?: string,
  ): Promise<{ status: string }> {
    this.verifyWorkerToken(workerKey);
    await this.backtestTasksService.completeFromWorker(taskId, payload);
    return { status: 'accepted' };
  }
}
