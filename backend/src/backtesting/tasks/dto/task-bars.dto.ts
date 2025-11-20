import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class TaskBarsQueryDto {
  @ApiPropertyOptional({
    description: '中心时间（ISO字符串或Unix毫秒）',
    example: '2024-05-01T12:00:00Z',
  })
  @IsOptional()
  @IsString()
  timestamp?: string;

  @ApiPropertyOptional({
    description: '中心时间（秒）',
    example: 1714564800,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  timestampSec?: number;

  @ApiPropertyOptional({
    description: '时间粒度（默认取任务的timeframe或数据集粒度），例如 1m/5m/1h',
  })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional({
    description: '向前取多少根K线',
    default: 60,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  beforeBars?: number;

  @ApiPropertyOptional({
    description: '向后取多少根K线',
    default: 60,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  afterBars?: number;
}

export interface TaskBarsResponse {
  taskId: string;
  datasetId: number;
  resolution: string;
  from: number;
  to: number;
  limit: number;
  hasMore: boolean;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}
