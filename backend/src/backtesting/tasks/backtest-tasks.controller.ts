import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
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
import { BacktestTasksService } from './backtest-tasks.service';
import { TaskLogsService } from './task-logs.service';
import {
  CreateBacktestTaskDto,
  UpdateBacktestTaskDto,
  ListBacktestTasksDto,
  ListTaskLogsDto,
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
  constructor(
    private readonly backtestTasksService: BacktestTasksService,
    private readonly taskLogsService: TaskLogsService,
  ) {}

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
}

