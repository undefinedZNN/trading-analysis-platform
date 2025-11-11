/**
 * 启动执行DTO
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDate,
  IsNumber,
  IsOptional,
  Min,
  IsBoolean,
  IsInt,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartExecutionDto {
  @ApiProperty({ description: '数据集ID' })
  @IsInt()
  @Min(1)
  datasetId: number;

  @ApiProperty({ description: '策略ID' })
  @IsString()
  @IsNotEmpty()
  strategyId: string;

  @ApiProperty({ description: '版本ID' })
  @IsString()
  @IsNotEmpty()
  versionId: string;

  @ApiProperty({ description: '回测开始时间(必须在数据集范围内)' })
  @IsDate()
  @Type(() => Date)
  startTime: Date;

  @ApiProperty({ description: '回测结束时间(必须在数据集范围内)' })
  @IsDate()
  @Type(() => Date)
  endTime: Date;

  @ApiProperty({ description: '回测时间周期(必须>=数据集颗粒度)', example: '5m' })
  @IsString()
  @IsNotEmpty()
  timeframe: string;

  @ApiProperty({ description: '初始资金', example: 100000 })
  @IsNumber()
  @Min(0)
  initialCapital: number;

  @ApiProperty({ description: '回放速度', example: 1, required: false })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  speed?: number;

  @ApiProperty({ description: '是否记录日志', required: false })
  @IsBoolean()
  @IsOptional()
  enableLogging?: boolean;

  @ApiProperty({ description: '策略自定义参数', required: false })
  @IsObject()
  @IsOptional()
  parameters?: Record<string, any>;
}

