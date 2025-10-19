import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
  ListDatasetsRequestDto,
  UpdateDatasetMetadataDto,
  AppendDatasetRequestDto,
  DatasetCandlesQueryDto,
} from '../dto/dataset.dto';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';

@ApiTags('datasets')
@Controller('trading-data/datasets')
export class DatasetsController {
  constructor(private readonly tradingDataService: TradingDataService) {}

  @Get()
  @ApiOperation({ summary: '数据集列表' })
  async listDatasets(@Query() query: ListDatasetsRequestDto) {
    const { items, total } = await this.tradingDataService.listDatasets(query);
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

  @Get(':datasetId')
  @ApiOperation({ summary: '获取数据集详情' })
  async getDataset(
    @Param('datasetId', ParseIntPipe) datasetId: number,
  ) {
    return this.tradingDataService.getDatasetById(datasetId);
  }

  @Patch(':datasetId')
  @ApiOperation({ summary: '更新数据集元数据' })
  async updateMetadata(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Body() payload: UpdateDatasetMetadataDto,
  ) {
    return this.tradingDataService.updateDatasetMetadata(datasetId, payload);
  }

  @Post(':datasetId/delete')
  @ApiOperation({ summary: '软删除数据集' })
  async softDelete(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Body('operator') operator?: string,
  ) {
    await this.tradingDataService.softDeleteDataset(datasetId, operator);
    return { success: true };
  }

  @Post(':datasetId/restore')
  @ApiOperation({ summary: '恢复已删除数据集' })
  async restore(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Body('operator') operator?: string,
  ) {
    const dataset = await this.tradingDataService.restoreDataset(
      datasetId,
      operator,
    );
    return dataset;
  }

  @Post(':datasetId/append')
  @ApiOperation({ summary: '为数据集追加数据' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  async append(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Body() payload: AppendDatasetRequestDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.tradingDataService.appendDataset(datasetId, payload, file);
  }

  @Get(':datasetId/candles')
  @ApiOperation({ summary: '获取数据集 K 线数据' })
  async getCandles(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Query() query: DatasetCandlesQueryDto,
  ) {
    return this.tradingDataService.getDatasetCandles(datasetId, query);
  }
}
