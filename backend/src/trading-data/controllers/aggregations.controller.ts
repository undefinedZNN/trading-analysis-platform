import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { DataAggregationService } from '../services/data-aggregation.service';
import { TriggerType, AggregationTaskStatus } from '../entities/aggregation-task.entity';
import { AggregationStatus } from '../entities/dataset-aggregation.entity';

class CreateAggregationDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Type(() => String)
  granularities?: string[];

  @IsOptional()
  @IsString()
  triggeredBy?: string;
}

class AggregationListQueryDto {
  @IsOptional()
  @IsString()
  status?: AggregationStatus | 'all';
}

class AggregationTaskListQueryDto {
  @IsOptional()
  @IsString()
  status?: AggregationTaskStatus | 'all';
}

@ApiTags('aggregations')
@Controller('trading-data/datasets/:datasetId/aggregations')
export class AggregationsController {
  constructor(
    private readonly aggregationService: DataAggregationService,
  ) {}

  @Post()
  @ApiOperation({ summary: '手动触发数据集聚合' })
  async createAggregations(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Body() dto: CreateAggregationDto,
  ) {
    const tasks = await this.aggregationService.createAggregationTasks(
      datasetId,
      dto.granularities,
      TriggerType.Manual,
      dto.triggeredBy,
    );

    return {
      message: `创建了 ${tasks.length} 个聚合任务`,
      tasks,
    };
  }

  @Get()
  @ApiOperation({ summary: '查询数据集的聚合列表' })
  async listAggregations(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Query() query: AggregationListQueryDto,
  ) {
    const items = await this.aggregationService.listAggregations(
      datasetId,
      query.status ?? 'all',
    );
    return {
      items,
      total: items.length,
    };
  }

  @Get('tasks')
  @ApiOperation({ summary: '查询数据集的聚合任务列表' })
  async listAggregationTasks(
    @Param('datasetId', ParseIntPipe) datasetId: number,
    @Query() query: AggregationTaskListQueryDto,
  ) {
    const items = await this.aggregationService.listAggregationTasks(
      datasetId,
      query.status ?? 'all',
    );
    return {
      items,
      total: items.length,
    };
  }
}
