import {
  IsOptional,
  IsUUID,
  IsString,
  IsInt,
  IsEnum,
  IsISO8601,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BacktestTaskStatus } from '../entities';

/**
 * 排序方向枚举
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * 排序字段枚举
 */
export enum SortField {
  CREATED_AT = 'createdAt',
  STARTED_AT = 'startedAt',
  COMPLETED_AT = 'completedAt',
  TASK_NAME = 'taskName',
}

/**
 * 查询回测任务列表 DTO
 */
export class ListBacktestTasksDto {
  @ApiPropertyOptional({
    description: '搜索关键词（搜索任务名称和描述）',
    example: '双均线',
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '策略ID筛选',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4')
  strategyId?: string;

  @ApiPropertyOptional({
    description: '脚本版本ID筛选',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID('4')
  scriptVersionId?: string;

  @ApiPropertyOptional({
    description: '数据集ID筛选',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  datasetId?: number;

  @ApiPropertyOptional({
    description: '任务状态筛选',
    enum: BacktestTaskStatus,
    example: BacktestTaskStatus.RUNNING,
  })
  @IsOptional()
  @IsEnum(BacktestTaskStatus)
  status?: BacktestTaskStatus;

  @ApiPropertyOptional({
    description: '创建时间开始（ISO 8601格式）',
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601()
  createdAfter?: string;

  @ApiPropertyOptional({
    description: '创建时间结束（ISO 8601格式）',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsISO8601()
  createdBefore?: string;

  @ApiPropertyOptional({
    description: '排序字段',
    enum: SortField,
    default: SortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(SortField)
  sortBy?: SortField = SortField.CREATED_AT;

  @ApiPropertyOptional({
    description: '排序方向',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({
    description: '页码（从1开始）',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: '每页数量',
    example: 20,
    minimum: 1,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 20;
}

