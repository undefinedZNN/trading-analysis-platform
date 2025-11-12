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
  @ApiOperation({ summary: '创建回测任务' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '任务创建成功',
    type: BacktestTaskEntity,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '请求参数验证失败',
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
  @ApiOperation({ summary: '查询回测任务列表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务列表查询成功',
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
  @ApiOperation({ summary: '查询回测任务详情' })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务详情查询成功',
    type: BacktestTaskEntity,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '任务不存在',
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
  @ApiOperation({ summary: '取消回测任务' })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务取消成功',
    type: BacktestTaskEntity,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '任务状态不允许取消',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
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
  @ApiOperation({ summary: '删除回测任务' })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: '任务删除成功',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '运行中的任务无法删除',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
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
  @ApiOperation({ summary: '查询任务执行日志（支持下拉加载）' })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '日志查询成功',
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

