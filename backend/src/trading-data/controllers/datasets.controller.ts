import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TradingDataService } from '../trading-data.service';
import {
  ListDatasetsRequestDto,
  UpdateDatasetMetadataDto,
} from '../dto/dataset.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

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
}
