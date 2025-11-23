import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ValidationPipe,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { BacktestResultService } from '../services/backtest-result.service';
import { BacktestResultEntity } from '../entities/backtest-result.entity';
import {
  CreateFilteredResultDto,
  ResultQueryDto,
  TradesQueryDto,
} from '../dto';
import { TradeData, EquityPoint } from '../services/parquet-storage.service';

/**
 * 回测结果 API 控制器
 * 
 * 提供回测结果的查询、创建、删除功能
 */
@ApiTags('回测结果')
@Controller('backtest')
export class BacktestResultsController {
  private readonly logger = new Logger(BacktestResultsController.name);

  constructor(
    private readonly backtestResultService: BacktestResultService,
  ) {}

  /**
   * 获取任务的所有结果
   */
  @Get('tasks/:taskId/results')
  @ApiOperation({
    summary: '获取任务的所有结果',
    description: '获取指定回测任务的所有结果，包括主结果和派生结果',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'isPrimary',
    description: '是否只查询主结果',
    required: false,
    type: Boolean,
  })
  @ApiQuery({
    name: 'orderBy',
    description: '排序字段',
    required: false,
    enum: ['createdAt', 'totalReturnPct', 'sharpeRatio'],
  })
  @ApiQuery({
    name: 'order',
    description: '排序方向',
    required: false,
    enum: ['ASC', 'DESC'],
  })
  @ApiQuery({
    name: 'page',
    description: '页码（从1开始）',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    description: '每页数量',
    required: false,
    type: Number,
  })
  @ApiOkResponse({
    description: '结果列表',
    type: [BacktestResultEntity],
  })
  @ApiNotFoundResponse({
    description: '任务不存在',
  })
  async getResultsByTaskId(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query(ValidationPipe) query: ResultQueryDto,
  ): Promise<{
    results: BacktestResultEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    // 如果有分页参数，使用分页查询
    if (query.page || query.limit) {
      return await this.backtestResultService.getResultsWithPagination(
        taskId,
        query,
      );
    }

    // 否则返回所有结果
    const results = await this.backtestResultService.getResultsByTaskId(taskId);
    return {
      results,
      total: results.length,
      page: 1,
      pageSize: results.length,
    };
  }

  /**
   * 获取主结果
   */
  @Get('tasks/:taskId/results/primary')
  @ApiOperation({
    summary: '获取主结果',
    description: '获取指定任务的主结果（基于全量数据的结果）',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: '主结果',
    type: BacktestResultEntity,
  })
  @ApiNotFoundResponse({
    description: '任务不存在或主结果未生成',
  })
  async getPrimaryResult(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<BacktestResultEntity> {
    return await this.backtestResultService.getPrimaryResult(taskId);
  }

  /**
   * 获取单个结果
   */
  @Get('results/:resultId')
  @ApiOperation({
    summary: '获取单个结果',
    description: '根据结果ID获取结果详情',
  })
  @ApiParam({
    name: 'resultId',
    description: '结果ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: '结果详情',
    type: BacktestResultEntity,
  })
  @ApiNotFoundResponse({
    description: '结果不存在',
  })
  async getResultById(
    @Param('resultId', ParseUUIDPipe) resultId: string,
  ): Promise<BacktestResultEntity> {
    return await this.backtestResultService.getResultById(resultId);
  }

  /**
   * 创建过滤结果
   */
  @Post('tasks/:taskId/results')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '创建过滤结果',
    description: '基于过滤条件创建新的派生结果',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiBody({
    type: CreateFilteredResultDto,
  })
  @ApiCreatedResponse({
    description: '过滤结果创建成功',
    type: BacktestResultEntity,
  })
  @ApiBadRequestResponse({
    description: '请求参数错误或任务状态不允许创建结果',
  })
  @ApiNotFoundResponse({
    description: '任务不存在',
  })
  async createFilteredResult(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(ValidationPipe) createDto: CreateFilteredResultDto,
    // TODO: 添加用户认证后，从请求中获取 userId
  ): Promise<BacktestResultEntity> {
    return await this.backtestResultService.createFilteredResult(
      taskId,
      createDto.resultName,
      createDto.filterConditions,
      undefined, // userId，待实现认证后传入
    );
  }

  /**
   * 删除结果
   */
  @Delete('results/:resultId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '删除结果',
    description: '删除指定的结果。注意：主结果不能被删除',
  })
  @ApiParam({
    name: 'resultId',
    description: '结果ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: '结果删除成功',
  })
  @ApiBadRequestResponse({
    description: '不能删除主结果',
  })
  @ApiNotFoundResponse({
    description: '结果不存在',
  })
  async deleteResult(
    @Param('resultId', ParseUUIDPipe) resultId: string,
    // TODO: 添加用户认证后，从请求中获取 userId
  ): Promise<void> {
    await this.backtestResultService.deleteResult(
      resultId,
      undefined, // userId，待实现认证后传入
    );
  }

  /**
   * 获取结果统计摘要
   */
  @Get('tasks/:taskId/results/summary')
  @ApiOperation({
    summary: '获取结果统计摘要',
    description: '获取任务的结果统计信息，包括总数、最佳收益、最佳夏普等',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: '结果统计摘要',
    schema: {
      type: 'object',
      properties: {
        total: {
          type: 'number',
          description: '结果总数',
        },
        hasPrimary: {
          type: 'boolean',
          description: '是否存在主结果',
        },
        topByReturn: {
          $ref: '#/components/schemas/BacktestResultEntity',
          description: '最高收益率的结果',
        },
        topBySharpe: {
          $ref: '#/components/schemas/BacktestResultEntity',
          description: '最高夏普比率的结果',
        },
      },
    },
  })
  async getResultsSummary(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<{
    total: number;
    hasPrimary: boolean;
    topByReturn?: BacktestResultEntity;
    topBySharpe?: BacktestResultEntity;
  }> {
    return await this.backtestResultService.getResultsSummary(taskId);
  }

  /**
   * 对比多个结果
   */
  @Post('results/compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '对比多个结果',
    description: '对比多个结果的关键指标，找出最佳表现',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        resultIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: '要对比的结果ID列表（至少2个）',
          example: [
            '123e4567-e89b-12d3-a456-426614174000',
            '223e4567-e89b-12d3-a456-426614174001',
          ],
        },
      },
      required: ['resultIds'],
    },
  })
  @ApiOkResponse({
    description: '对比结果',
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: { $ref: '#/components/schemas/BacktestResultEntity' },
        },
        comparison: {
          type: 'object',
          properties: {
            bestReturn: { type: 'string', description: '最佳收益率的结果ID' },
            bestSharpe: { type: 'string', description: '最佳夏普比率的结果ID' },
            lowestDrawdown: { type: 'string', description: '最低回撤的结果ID' },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: '至少需要2个结果进行对比',
  })
  async compareResults(
    @Body() body: { resultIds: string[] },
  ): Promise<{
    results: BacktestResultEntity[];
    comparison: {
      bestReturn: string;
      bestSharpe: string;
      lowestDrawdown: string;
    };
  }> {
    return await this.backtestResultService.compareResults(body.resultIds);
  }

  /**
   * 获取交易明细数据
   */
  @Get('tasks/:taskId/trades')
  @ApiOperation({
    summary: '获取交易明细数据',
    description: '获取任务的交易明细数据，支持过滤和分页',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'filterConditions',
    description: '过滤条件（JSON字符串）',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'page',
    description: '页码（从1开始）',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    description: '每页数量',
    required: false,
    type: Number,
  })
  @ApiOkResponse({
    description: '交易明细数据',
    schema: {
      type: 'object',
      properties: {
        trades: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entry_time: { type: 'string' },
              entry_price: { type: 'number' },
              exit_time: { type: 'string' },
              exit_price: { type: 'number' },
              size: { type: 'number' },
              direction: { type: 'string', enum: ['long', 'short'] },
              pnl: { type: 'number' },
              commission: { type: 'number' },
              entry_factors: { type: 'object' },
              holding_factors: { type: 'array' },
              exit_factors: { type: 'object' },
            },
          },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
      },
    },
  })
  async getTradesData(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query(ValidationPipe) query: TradesQueryDto,
    // TODO: 添加用户认证后，从请求中获取 userId
  ): Promise<{
    trades: TradeData[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    // 解析过滤条件
    let filterConditions;
    if (query.filterConditions) {
      try {
        filterConditions = JSON.parse(query.filterConditions);
      } catch (error) {
        this.logger.warn(`Failed to parse filter conditions: ${error}`);
      }
    }

    // 获取交易数据
    const allTrades = await this.backtestResultService.getTradesData(
      taskId,
      filterConditions,
      undefined, // userId
    );

    // 手动分页
    const page = query.page || 1;
    const limit = query.limit || 50;
    const start = (page - 1) * limit;
    const end = start + limit;
    const trades = allTrades.slice(start, end);

    return {
      trades,
      total: allTrades.length,
      page,
      pageSize: limit,
    };
  }

  /**
   * 获取权益曲线数据
   */
  @Get('tasks/:taskId/equity')
  @ApiOperation({
    summary: '获取权益曲线数据',
    description: '获取任务的权益曲线数据',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: '权益曲线数据',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          datetime: { type: 'string' },
          value: { type: 'number' },
          cash: { type: 'number' },
        },
      },
    },
  })
  async getEquityData(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    // TODO: 添加用户认证后，从请求中获取 userId
  ): Promise<EquityPoint[]> {
    return await this.backtestResultService.getEquityData(
      taskId,
      undefined, // userId
    );
  }

  /**
   * 导出任务结果为CSV
   */
  @Get('tasks/:taskId/export')
  @ApiOperation({
    summary: '导出任务结果',
    description: '导出任务的完整结果数据为CSV格式，包括统计信息、交易明细和权益曲线',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['csv', 'json'],
    description: '导出格式',
    example: 'csv',
  })
  @ApiOkResponse({
    description: 'CSV文件下载',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async exportResults(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query('format') format: string = 'csv',
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Exporting results for task ${taskId} in ${format} format`);

    try {
      // 获取任务的主结果
      const result = await this.backtestResultService.getPrimaryResult(taskId);
      
      if (!result) {
        res.status(404).json({
          message: `No result found for task ${taskId}`,
          error: 'Not Found',
          statusCode: 404,
        });
        return;
      }

      // 获取交易明细
      let trades: TradeData[] = [];
      try {
        trades = await this.backtestResultService.getTradeData(taskId, undefined);
      } catch (err) {
        this.logger.warn(`Failed to load trades for ${taskId}: ${err.message}`);
      }

      // 获取权益曲线
      let equity: EquityPoint[] = [];
      try {
        equity = await this.backtestResultService.getEquityData(taskId, undefined);
      } catch (err) {
        this.logger.warn(`Failed to load equity for ${taskId}: ${err.message}`);
      }

      if (format === 'json') {
        // JSON格式导出
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="backtest-result-${taskId}.json"`,
        );
        res.json({
          taskId,
          result: result.metrics,
          trades,
          equity,
          exportedAt: new Date().toISOString(),
        });
      } else {
        // CSV格式导出
        const csvContent = this.generateCSV(result, trades, equity);
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="backtest-result-${taskId}.csv"`,
        );
        res.send('\uFEFF' + csvContent); // 添加BOM以支持Excel中文显示
      }
    } catch (error) {
      this.logger.error(`Failed to export results for ${taskId}:`, error);
      res.status(500).json({
        message: 'Failed to export results',
        error: error.message,
        statusCode: 500,
      });
    }
  }

  /**
   * 生成CSV内容
   */
  private generateCSV(
    result: BacktestResultEntity,
    trades: TradeData[],
    equity: EquityPoint[],
  ): string {
    const lines: string[] = [];

    // 添加标题
    lines.push('# 回测结果导出');
    lines.push(`# 任务ID: ${result.taskId}`);
    lines.push(`# 导出时间: ${new Date().toISOString()}`);
    lines.push('');

    // 1. 统计指标
    lines.push('## 统计指标');
    lines.push('指标名称,数值');
    
    const metrics = result.metrics as any;
    if (metrics) {
      Object.entries(metrics).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          // 嵌套对象
          Object.entries(value).forEach(([subKey, subValue]) => {
            lines.push(`${key}.${subKey},${this.formatValue(subValue)}`);
          });
        } else {
          lines.push(`${key},${this.formatValue(value)}`);
        }
      });
    }
    lines.push('');

    // 2. 交易明细
    if (trades && trades.length > 0) {
      lines.push('## 交易明细');
      const tradeHeaders = ['时间', '交易对', '方向', '类型', '数量', '价格', '已实现盈亏', '手续费'];
      lines.push(tradeHeaders.join(','));
      
      trades.forEach((trade) => {
        const row = [
          trade.timestamp || '',
          trade.symbol || '',
          trade.side || '',
          trade.type || '',
          trade.quantity || 0,
          trade.price || 0,
          trade.realizedPnl || 0,
          trade.fees || 0,
        ];
        lines.push(row.map(v => this.escapeCSV(v)).join(','));
      });
      lines.push('');
    }

    // 3. 权益曲线
    if (equity && equity.length > 0) {
      lines.push('## 权益曲线');
      lines.push('时间,权益,现金');
      
      equity.forEach((point) => {
        lines.push(`${point.datetime},${point.value},${point.cash || ''}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 格式化值
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return this.escapeCSV(value.toString());
  }

  /**
   * CSV转义
   */
  private escapeCSV(value: any): string {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
}

