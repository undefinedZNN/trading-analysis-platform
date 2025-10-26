import {
  IsInt,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  IsObject,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { BacktestTaskStatus } from '../entities/backtest-task.entity';

/**
 * 交易时段配置 DTO
 */
export class TradingSessionDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsString()
  @MaxLength(10)
  startTime!: string;

  @IsString()
  @MaxLength(10)
  endTime!: string;

  @IsBoolean()
  enabled!: boolean;
}

/**
 * 风险约束配置 DTO
 */
export class RiskConstraintsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxDrawdownPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxDailyLossPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPositionSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxLeverage?: number;
}

/**
 * 滑点模型配置 DTO
 */
export class SlippageModelDto {
  @IsEnum(['fixed', 'percentage', 'custom'])
  type!: 'fixed' | 'percentage' | 'custom';

  @IsNumber()
  @Min(0)
  value!: number;
}

/**
 * 手续费配置 DTO
 */
export class CommissionDto {
  @IsEnum(['fixed', 'percentage'])
  type!: 'fixed' | 'percentage';

  @IsNumber()
  @Min(0)
  value!: number;
}

/**
 * 回测配置 DTO
 */
export class BacktestConfigDto {
  @IsNumber()
  @Min(0)
  initialCapital!: number;

  @IsString()
  @MaxLength(10)
  timeLevel!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SlippageModelDto)
  slippageModel?: SlippageModelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CommissionDto)
  commission?: CommissionDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradingSessionDto)
  tradingSessions?: TradingSessionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RiskConstraintsDto)
  riskConstraints?: RiskConstraintsDto;

  @IsOptional()
  @IsObject()
  strategyParams?: Record<string, unknown>;
}

/**
 * 创建回测任务 DTO
 */
export class CreateBacktestTaskDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsInt()
  @Min(1)
  strategyId!: number;

  @IsInt()
  @Min(1)
  scriptId!: number;

  @IsInt()
  @Min(1)
  datasetId!: number;

  @IsDateString()
  backtestStartDate!: string;

  @IsDateString()
  backtestEndDate!: string;

  @ValidateNested()
  @Type(() => BacktestConfigDto)
  config!: BacktestConfigDto;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  createdBy?: string;
}

/**
 * 更新回测任务 DTO
 */
export class UpdateBacktestTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  updatedBy?: string;
}

/**
 * 更新回测任务状态 DTO
 */
export class UpdateBacktestTaskStatusDto {
  @IsEnum(BacktestTaskStatus)
  status!: BacktestTaskStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsObject()
  resultSummary?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  resultStoragePath?: string;
}

/**
 * 查询回测任务列表 DTO
 */
export class ListBacktestTasksQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(BacktestTaskStatus, { each: true })
  status?: BacktestTaskStatus[];

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  strategyId?: number;
}

