import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum TaskStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export class TimeRangeDto {
  @IsDateString()
  start!: string;

  @IsDateString()
  end!: string;
}

export class ScriptMetadataDto {
  @IsString()
  @IsNotEmpty()
  scriptVersionId!: string;

  @IsString()
  @IsNotEmpty()
  compiledCode!: string;

  @IsOptional()
  @IsString()
  strategyId?: string;

  @IsOptional()
  @IsString()
  versionName?: string;
}

export class TaskConfigDto {
  @IsString()
  @IsNotEmpty()
  strategyId!: string;

  @IsString()
  @IsNotEmpty()
  datasetId!: string;

  @ValidateNested()
  @Type(() => TimeRangeDto)
  timeRange!: TimeRangeDto;

  @IsString()
  @IsNotEmpty()
  timeframe!: string;

  @IsObject()
  @IsOptional()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScriptMetadataDto)
  script?: ScriptMetadataDto;
}

export class ExecuteTaskDto {
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @ValidateNested()
  @Type(() => TaskConfigDto)
  config!: TaskConfigDto;
}

export class ExecuteTaskResponseDto {
  @IsString()
  taskId!: string;

  @IsString()
  workerId!: string;

  @IsIn(['accepted', 'rejected'])
  status!: 'accepted' | 'rejected';

  @IsDateString()
  acceptedAt!: string;
}

export class TaskMetricsDto {
  @IsOptional()
  @IsNumber()
  throughput?: number;

  @IsOptional()
  @IsNumber()
  memoryUsed?: number;

  @IsOptional()
  @IsNumber()
  cpu?: number;

  @IsOptional()
  @IsNumber()
  runningTasks?: number;

  @IsOptional()
  @IsString()
  updatedAt?: string;

  [key: string]: unknown;
}

export class TaskStatusDto {
  @IsString()
  taskId!: string;

  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @IsNumber()
  @Min(0)
  @Max(1)
  progress!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskMetricsDto)
  metrics?: TaskMetricsDto;

  @IsDateString()
  updatedAt!: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  workerId?: string;
}

export class TaskProgressEventDto {
  @IsString()
  taskId!: string;

  @IsString()
  workerId!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  progress!: number;

  @IsNumber()
  processedBars!: number;

  @IsNumber()
  totalBars!: number;

  @IsDateString()
  currentTime!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskMetricsDto)
  metrics?: TaskMetricsDto;
}

export class CancelTaskDto {
  @IsString()
  taskId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class WorkerCapabilitiesDto {
  @IsInt()
  @Min(1)
  maxConcurrentTasks!: number;

  @IsArray()
  @IsString({ each: true })
  supportedStrategies!: string[];
}

export class WorkerRegistrationDto {
  @IsString()
  workerId!: string;

  @IsString()
  host!: string;

  @IsInt()
  port!: number;

  @ValidateNested()
  @Type(() => WorkerCapabilitiesDto)
  capabilities!: WorkerCapabilitiesDto;
}

export class WorkerHeartbeatDto {
  @IsString()
  workerId!: string;

  @IsEnum(['idle', 'busy', 'overloaded'])
  status!: 'idle' | 'busy' | 'overloaded';

  @IsNumber()
  currentLoad!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskMetricsDto)
  metrics?: TaskMetricsDto;
}

export class WorkerDeregisterDto {
  @IsString()
  workerId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class WorkerInfoDto extends WorkerRegistrationDto {
  @IsEnum(['idle', 'busy', 'down'])
  status!: 'idle' | 'busy' | 'down';

  @IsDateString()
  lastHeartbeat!: string;
}

export class TaskResultDto {
  @IsString()
  taskId!: string;

  @IsString()
  workerId!: string;

  @IsObject()
  summary!: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskMetricsDto)
  metrics?: TaskMetricsDto;

  @IsOptional()
  @IsArray()
  artifacts?: string[];
}
