import {
  IsString,
  IsUUID,
  IsInt,
  IsObject,
  IsOptional,
  MaxLength,
  ValidateNested,
  IsNumber,
  IsPositive,
  Min,
  Max,
  Matches,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 手续费配置 DTO
 */
export class FeesDto {
  @ApiProperty({
    description: 'Maker手续费率（小数形式，如0.0002表示0.02%）',
    example: 0.0002,
    minimum: 0,
    maximum: 0.01,
  })
  @IsNumber()
  @Min(0)
  @Max(0.01)
  makerFee!: number;

  @ApiProperty({
    description: 'Taker手续费率（小数形式，如0.0005表示0.05%）',
    example: 0.0005,
    minimum: 0,
    maximum: 0.01,
  })
  @IsNumber()
  @Min(0)
  @Max(0.01)
  takerFee!: number;
}

/**
 * 交易时段配置 DTO
 */
export class TradingHoursDto {
  @ApiProperty({
    description: '交易开始时间（HH:mm格式）',
    example: '09:00',
    pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
  })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: '交易开始时间格式错误，应为HH:mm',
  })
  start!: string;

  @ApiProperty({
    description: '交易结束时间（HH:mm格式）',
    example: '15:00',
    pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
  })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: '交易结束时间格式错误，应为HH:mm',
  })
  end!: string;
}

/**
 * 执行配置 DTO
 */
export class ExecutionConfigDto {
  @ApiProperty({
    description: '初始资金（美元）',
    example: 10000,
    minimum: 1,
    maximum: 10000000,
  })
  @IsNumber()
  @IsPositive()
  @Min(1)
  @Max(10000000)
  initialCapital!: number;

  @ApiProperty({
    description: '杠杆倍数（MVP阶段固定为1）',
    example: 1,
    default: 1,
  })
  @IsNumber()
  @IsPositive()
  @Min(1)
  @Max(125)
  leverage: number = 1;

  @ApiProperty({
    description: '滑点（MVP阶段固定为0）',
    example: 0,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  slippage: number = 0;

  @ApiProperty({
    description: '手续费配置',
    type: FeesDto,
  })
  @ValidateNested()
  @Type(() => FeesDto)
  fees!: FeesDto;

  @ApiPropertyOptional({
    description: '交易时段配置（可选）',
    type: TradingHoursDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TradingHoursDto)
  tradingHours?: TradingHoursDto;
}

/**
 * 时间范围 DTO
 */
export class TimeRangeDto {
  @ApiProperty({
    description: '开始时间（ISO 8601格式）',
    example: '2024-01-01T00:00:00Z',
  })
  @IsISO8601()
  start!: string;

  @ApiProperty({
    description: '结束时间（ISO 8601格式）',
    example: '2024-12-31T23:59:59Z',
  })
  @IsISO8601()
  end!: string;
}

/**
 * 数据配置 DTO
 */
export class DataConfigDto {
  @ApiProperty({
    description: '回测时间范围',
    type: TimeRangeDto,
  })
  @ValidateNested()
  @Type(() => TimeRangeDto)
  timeRange!: TimeRangeDto;

  @ApiProperty({
    description: '交易时间周期（如1m、5m、1h、1d等）',
    example: '1h',
  })
  @IsString()
  @Matches(/^(1|5|15|30)m$|^(1|4)h$|^1d$/, {
    message: '时间周期格式错误，支持：1m、5m、15m、30m、1h、4h、1d',
  })
  timeframe!: string;
}

/**
 * 创建回测任务 DTO
 */
export class CreateBacktestTaskDto {
  @ApiProperty({
    description: '任务名称',
    example: '双均线策略-回测-2024-11-12',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100, { message: '任务名称最大长度为100字符' })
  taskName!: string;

  @ApiPropertyOptional({
    description: '任务描述',
    example: '测试双均线策略在2024年全年的表现',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '任务描述最大长度为500字符' })
  taskDescription?: string;

  @ApiProperty({
    description: '策略ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4', { message: '策略ID必须是有效的UUID' })
  strategyId!: string;

  @ApiProperty({
    description: '脚本版本ID（UUID）',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID('4', { message: '脚本版本ID必须是有效的UUID' })
  scriptVersionId!: string;

  @ApiProperty({
    description: '数据集ID（整数）',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: '数据集ID必须是整数' })
  @IsPositive({ message: '数据集ID必须是正整数' })
  datasetId!: number;

  @ApiProperty({
    description: '策略参数（JSON对象）',
    example: { fastPeriod: 10, slowPeriod: 30, positionSize: 0.5 },
  })
  @IsObject({ message: '策略参数必须是有效的JSON对象' })
  strategyParams!: Record<string, any>;

  @ApiProperty({
    description: '执行配置',
    type: ExecutionConfigDto,
  })
  @ValidateNested()
  @Type(() => ExecutionConfigDto)
  executionConfig!: ExecutionConfigDto;

  @ApiProperty({
    description: '数据配置',
    type: DataConfigDto,
  })
  @ValidateNested()
  @Type(() => DataConfigDto)
  dataConfig!: DataConfigDto;
}

