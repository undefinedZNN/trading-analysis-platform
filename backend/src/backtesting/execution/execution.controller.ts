/**
 * 执行控制器
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { StrategyExecutorService } from './services/strategy-executor.service';
import { ExecutionMonitorService } from './services/execution-monitor.service';
import { ExecutionGateway } from './execution.gateway';
import { StartExecutionDto } from './dto/start-execution.dto';
import {
  ExecutionSession,
  ExecutionMetrics,
  ExecutionLog,
} from './interfaces/execution.interface';

@ApiTags('execution')
@Controller('backtesting/execution')
export class ExecutionController {
  constructor(
    private readonly executorService: StrategyExecutorService,
    private readonly monitorService: ExecutionMonitorService,
    private readonly gateway: ExecutionGateway,
  ) {}

  /**
   * 启动策略执行
   */
  @Post('start')
  @ApiOperation({ summary: '启动策略执行' })
  @ApiResponse({
    status: 201,
    description: '执行已启动',
    type: Object,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 404, description: '策略不存在' })
  async start(@Body() dto: StartExecutionDto): Promise<ExecutionSession> {
    return this.executorService.start(dto);
  }

  /**
   * 停止策略执行
   */
  @Post(':sessionId/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '停止策略执行' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({ status: 200, description: '执行已停止' })
  @ApiResponse({ status: 404, description: '会话不存在' })
  async stop(@Param('sessionId') sessionId: string): Promise<{ message: string }> {
    await this.executorService.stop(sessionId);
    return { message: 'Execution stopped' };
  }

  /**
   * 暂停策略执行
   */
  @Post(':sessionId/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '暂停策略执行' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({ status: 200, description: '执行已暂停' })
  @ApiResponse({ status: 404, description: '会话不存在' })
  async pause(@Param('sessionId') sessionId: string): Promise<{ message: string }> {
    await this.executorService.pause(sessionId);
    return { message: 'Execution paused' };
  }

  /**
   * 恢复策略执行
   */
  @Post(':sessionId/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复策略执行' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({ status: 200, description: '执行已恢复' })
  @ApiResponse({ status: 404, description: '会话不存在' })
  async resume(@Param('sessionId') sessionId: string): Promise<{ message: string }> {
    await this.executorService.resume(sessionId);
    return { message: 'Execution resumed' };
  }

  /**
   * 获取执行状态
   */
  @Get(':sessionId/status')
  @ApiOperation({ summary: '获取执行状态' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({
    status: 200,
    description: '执行状态',
    type: Object,
  })
  @ApiResponse({ status: 404, description: '会话不存在' })
  getStatus(@Param('sessionId') sessionId: string): ExecutionSession {
    return this.executorService.getStatus(sessionId);
  }

  /**
   * 获取执行指标
   */
  @Get(':sessionId/metrics')
  @ApiOperation({ summary: '获取执行指标' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({
    status: 200,
    description: '执行指标',
    type: Object,
  })
  @ApiResponse({ status: 404, description: '会话不存在' })
  getMetrics(@Param('sessionId') sessionId: string): ExecutionMetrics {
    return this.executorService.getMetrics(sessionId);
  }

  /**
   * 获取执行日志
   */
  @Get(':sessionId/logs')
  @ApiOperation({ summary: '获取执行日志' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiQuery({ name: 'limit', required: false, description: '限制数量' })
  @ApiResponse({
    status: 200,
    description: '执行日志',
    type: Array,
  })
  @ApiResponse({ status: 404, description: '会话不存在' })
  getLogs(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: number,
  ): ExecutionLog[] {
    return this.executorService.getLogs(sessionId, limit);
  }

  /**
   * 获取指标历史
   */
  @Get(':sessionId/metrics/history')
  @ApiOperation({ summary: '获取指标历史' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiQuery({ name: 'limit', required: false, description: '限制数量' })
  @ApiResponse({
    status: 200,
    description: '指标历史',
    type: Array,
  })
  getMetricsHistory(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: number,
  ): ExecutionMetrics[] {
    return this.monitorService.getMetricsHistory(sessionId, limit);
  }

  /**
   * 获取资源统计
   */
  @Get('resource/stats')
  @ApiOperation({ summary: '获取资源统计' })
  @ApiQuery({ name: 'limit', required: false, description: '限制数量' })
  @ApiResponse({
    status: 200,
    description: '资源统计',
    type: Array,
  })
  getResourceStats(@Query('limit') limit?: number) {
    return this.monitorService.getResourceStats(limit);
  }

  /**
   * 获取最新资源统计
   */
  @Get('resource/latest')
  @ApiOperation({ summary: '获取最新资源统计' })
  @ApiResponse({
    status: 200,
    description: '最新资源统计',
  })
  getLatestResourceStats() {
    return this.monitorService.getLatestResourceStats();
  }

  /**
   * 获取监控统计
   */
  @Get('monitor/stats')
  @ApiOperation({ summary: '获取监控统计' })
  @ApiResponse({
    status: 200,
    description: '监控统计',
  })
  getMonitorStats() {
    return this.monitorService.getStats();
  }

  /**
   * 获取WebSocket统计
   */
  @Get('websocket/stats')
  @ApiOperation({ summary: '获取WebSocket统计' })
  @ApiResponse({
    status: 200,
    description: 'WebSocket统计',
  })
  getWebSocketStats() {
    return this.gateway.getStats();
  }

  /**
   * 启动监控
   */
  @Post('monitor/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '启动监控' })
  @ApiResponse({ status: 200, description: '监控已启动' })
  startMonitor(): { message: string } {
    this.monitorService.start();
    return { message: 'Monitor started' };
  }

  /**
   * 停止监控
   */
  @Post('monitor/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '停止监控' })
  @ApiResponse({ status: 200, description: '监控已停止' })
  stopMonitor(): { message: string } {
    this.monitorService.stop();
    return { message: 'Monitor stopped' };
  }
}

