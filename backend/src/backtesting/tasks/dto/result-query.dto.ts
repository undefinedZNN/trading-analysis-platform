import {
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 结果查询 DTO
 */
export class ResultQueryDto {
  @ApiProperty({
    description: '是否只查询主结果',
    required: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPrimary?: boolean;

  @ApiProperty({
    description: '排序字段',
    enum: ['createdAt', 'totalReturnPct', 'sharpeRatio'],
    required: false,
    default: 'createdAt',
  })
  @IsOptional()
  @IsEnum(['createdAt', 'totalReturnPct', 'sharpeRatio'])
  orderBy?: 'createdAt' | 'totalReturnPct' | 'sharpeRatio';

  @ApiProperty({
    description: '排序方向',
    enum: ['ASC', 'DESC'],
    required: false,
    default: 'DESC',
  })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';

  @ApiProperty({
    description: '页码（从1开始）',
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiProperty({
    description: '每页数量',
    required: false,
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

/**
 * 交易数据查询 DTO
 */
export class TradesQueryDto {
  @ApiProperty({
    description: '过滤条件（JSON字符串）',
    required: false,
    example: '{"factors":{"rsi":{"min":30,"max":70}}}',
  })
  @IsOptional()
  filterConditions?: string;

  @ApiProperty({
    description: '页码（从1开始）',
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiProperty({
    description: '每页数量',
    required: false,
    default: 50,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number;
}

