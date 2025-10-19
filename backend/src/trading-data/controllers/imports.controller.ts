import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { TradingDataService } from '../trading-data.service';
import {
  CreateImportTaskDto,
  UpdateImportStatusDto,
  ListImportsRequestDto,
  RetryImportDto,
  ImportLogQueryDto,
} from '../dto/import.dto';
import { ImportStatus } from '../entities/import-task.entity';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('imports')
@Controller('trading-data/imports')
export class ImportsController {
  constructor(private readonly tradingDataService: TradingDataService) {}

  @Get()
  @ApiOperation({ summary: '导入任务列表' })
  @ApiQuery({ name: 'status', required: false, enum: ImportStatus })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'tradingPair', required: false })
  @ApiQuery({ name: 'keyword', required: false })
  async listImports(@Query() query: ListImportsRequestDto) {
    const { items, total } = await this.tradingDataService.listImports(query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  @Post()
  @ApiOperation({ summary: '上传交易数据文件并创建导入任务' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pluginName: {
          type: 'string',
          example: 'CsvOhlcvPlugin',
          description: '用于解析文件的插件名称',
        },
        pluginVersion: {
          type: 'string',
          example: '1.0.0',
        },
        status: {
          type: 'string',
          enum: Object.values(ImportStatus),
          nullable: true,
          description: '可选的初始状态，默认 pending',
        },
        createdBy: {
          type: 'string',
          nullable: true,
          example: 'researcher-01',
        },
        metadata: {
          type: 'string',
          nullable: true,
          description: 'JSON 字符串，包含来源、交易对、粒度等元信息',
          example: JSON.stringify({
            source: 'binance',
            tradingPair: 'BTC/USDT',
            granularity: '1m',
          }),
        },
        file: {
          type: 'string',
          format: 'binary',
          description: '待清洗的数据文件（支持 csv/json/zst）',
        },
      },
      required: ['pluginName', 'pluginVersion', 'file'],
    },
  })
  @ApiResponse({ status: 201, description: '导入任务创建成功' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  async createImport(
    @Body() payload: CreateImportTaskDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('请上传数据文件');
    }

    return this.tradingDataService.createImportWithUpload(payload, file);
  }

  @Post(':importId/status')
  async updateImportStatus(
    @Param('importId', ParseIntPipe) importId: number,
    @Body() payload: UpdateImportStatusDto,
  ) {
    return this.tradingDataService.updateImportStatus({
      importId,
      ...payload,
    });
  }

  @Post(':importId/retry')
  @ApiOperation({ summary: '重新触发导入任务' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reuseOriginalFile: {
          type: 'boolean',
          default: true,
          description: '是否复用原始上传文件',
        },
        metadata: {
          type: 'string',
          nullable: true,
          description: '覆盖导入元数据（JSON 字符串）',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: '可选，重新上传替换原文件',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  async retryImport(
    @Param('importId', ParseIntPipe) importId: number,
    @Body() payload: RetryImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.tradingDataService.retryImport(importId, payload, file);
  }

  @Get(':importId')
  async getImport(@Param('importId', ParseIntPipe) importId: number) {
    return this.tradingDataService.getImportTask(importId);
  }

  @Get(':importId/error-log')
  @ApiOperation({ summary: '获取导入任务错误日志（分页加载）' })
  async getErrorLog(
    @Param('importId', ParseIntPipe) importId: number,
    @Query() query: ImportLogQueryDto,
  ) {
    return this.tradingDataService.getImportErrorLogChunk(importId, query);
  }
}
