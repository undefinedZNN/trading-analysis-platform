import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LogLevel } from '../entities';

/**
 * 查询任务日志 DTO
 */
export class ListTaskLogsDto {
  @ApiPropertyOptional({
    description: '日志级别筛选',
    enum: LogLevel,
    example: LogLevel.ERROR,
  })
  @IsOptional()
  @IsEnum(LogLevel)
  level?: LogLevel;

  @ApiPropertyOptional({
    description: '搜索关键词（搜索日志消息）',
    example: 'trade',
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '获取此日志ID之前的日志（用于下拉加载更早的日志）',
    example: '12345',
  })
  @IsOptional()
  @IsString()
  before?: string;

  @ApiPropertyOptional({
    description: '返回日志数量',
    example: 100,
    minimum: 1,
    maximum: 500,
    default: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 100;
}

