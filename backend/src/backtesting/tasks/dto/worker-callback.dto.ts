import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class WorkerMetricsDto {
  @ApiPropertyOptional({ description: '已处理 bar 数量' })
  @IsOptional()
  @IsNumber()
  processedBars?: number;

  @ApiPropertyOptional({ description: '总 bar 数量' })
  @IsOptional()
  @IsNumber()
  totalBars?: number;

  @ApiPropertyOptional({ description: '吞吐量 (bars/s)' })
  @IsOptional()
  @IsNumber()
  throughput?: number;

  @ApiPropertyOptional({ description: '当前内存占用 (MB)' })
  @IsOptional()
  @IsNumber()
  memoryUsed?: number;

  @ApiPropertyOptional({ description: '任意附加指标' })
  @IsOptional()
  @IsObject()
  additional?: Record<string, unknown>;
}

export class WorkerProgressDto {
  @ApiPropertyOptional({ description: 'Worker ID（可选）' })
  @IsOptional()
  @IsString()
  workerId?: string;

  @ApiPropertyOptional({ description: '任务进度 (0-1)', example: 0.45 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  progress?: number;

  @ApiPropertyOptional({ type: WorkerMetricsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkerMetricsDto)
  metrics?: WorkerMetricsDto | Record<string, unknown>;
}

export class WorkerResultDto {
  @ApiPropertyOptional({ description: 'Worker ID（可选）' })
  @IsOptional()
  @IsString()
  workerId?: string;

  @ApiPropertyOptional({ description: '最终状态', example: 'completed' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: '任意执行指标快照' })
  @IsOptional()
  @IsObject()
  metrics?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '结果摘要', example: { totalReturn: 0.12 } })
  @IsOptional()
  @IsObject()
  summary?: Record<string, unknown>;
}
