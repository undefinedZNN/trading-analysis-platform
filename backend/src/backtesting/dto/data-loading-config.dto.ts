import { IsEnum, IsBoolean, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DataLoadMode {
  DEFAULT = 'default',
  OPTIMIZED = 'optimized',
  STREAMING = 'streaming',
  HYBRID = 'hybrid',
  SEGMENTED = 'segmented',
}

export enum DataPrecision {
  FULL = 'full',
  REDUCED = 'reduced',
}

export class DataLoadingConfigDto {
  @ApiProperty({
    enum: DataLoadMode,
    description: '数据加载模式',
    example: DataLoadMode.OPTIMIZED,
  })
  @IsEnum(DataLoadMode)
  mode: DataLoadMode;

  @ApiProperty({
    description: '是否启用exactbars（只保留必要的历史bar）',
    example: true,
  })
  @IsBoolean()
  exactbars: boolean;

  @ApiProperty({
    description: '是否预加载所有数据',
    example: false,
  })
  @IsBoolean()
  preload: boolean;

  @ApiProperty({
    description: '是否使用runonce模式（向量化）',
    example: false,
  })
  @IsBoolean()
  runonce: boolean;

  @ApiPropertyOptional({
    description: '流式加载的chunk大小（仅streaming模式）',
    example: 100000,
  })
  @IsOptional()
  @IsNumber()
  @Min(10000)
  @Max(1000000)
  chunkSize?: number;

  @ApiPropertyOptional({
    description: '分段月数（仅segmented模式）',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  segmentMonths?: number;

  @ApiPropertyOptional({
    enum: DataPrecision,
    description: '数据精度（仅hybrid模式）',
    example: DataPrecision.REDUCED,
  })
  @IsOptional()
  @IsEnum(DataPrecision)
  precision?: DataPrecision;
}

/**
 * 获取推荐的配置
 */
export function getRecommendedConfig(datasetSize: number): DataLoadingConfigDto {
  // 小数据集(<50万条) - 使用默认模式
  if (datasetSize < 500000) {
    return {
      mode: DataLoadMode.DEFAULT,
      exactbars: false,
      preload: true,
      runonce: true,
    };
  }

  // 中等数据集(50万-500万条) - 使用优化模式
  if (datasetSize < 5000000) {
    return {
      mode: DataLoadMode.OPTIMIZED,
      exactbars: true,
      preload: false,
      runonce: false,
    };
  }

  // 大数据集(500万-1000万条) - 使用流式模式
  if (datasetSize < 10000000) {
    return {
      mode: DataLoadMode.STREAMING,
      exactbars: true,
      preload: false,
      runonce: false,
      chunkSize: 100000,
    };
  }

  // 超大数据集(>1000万条) - 使用分段模式
  return {
    mode: DataLoadMode.SEGMENTED,
    exactbars: true,
    preload: false,
    runonce: false,
    segmentMonths: 3,
  };
}

/**
 * 估算资源消耗
 */
export interface ResourceEstimate {
  memoryMB: number;
  loadTimeSeconds: number;
  speedPercentage: number;
  accuracyPercentage: number;
}

export function estimateResources(
  datasetSize: number,
  config: DataLoadingConfigDto,
): ResourceEstimate {
  const baseMemoryGB = (datasetSize * 500) / (1024 * 1024 * 1024);
  const baseTimeSeconds = Math.max(10, datasetSize / 50000);

  let memoryMultiplier = 1.0;
  let timeMultiplier = 1.0;
  let speedPercentage = 100;
  let accuracyPercentage = 100;

  switch (config.mode) {
    case DataLoadMode.OPTIMIZED:
      memoryMultiplier = 0.12; // 降低88%
      timeMultiplier = 1.0;
      speedPercentage = 75;
      accuracyPercentage = 100;
      break;

    case DataLoadMode.STREAMING:
      memoryMultiplier = 0.06; // 降低94%
      timeMultiplier = 0.1; // 启动快
      speedPercentage = 70;
      accuracyPercentage = 100;
      break;

    case DataLoadMode.HYBRID:
      if (config.precision === DataPrecision.REDUCED) {
        memoryMultiplier = 0.02;
        timeMultiplier = 0.02;
        speedPercentage = 100;
        accuracyPercentage = 85;
      }
      break;

    case DataLoadMode.SEGMENTED:
      memoryMultiplier = 0.3; // 单段
      timeMultiplier = 0.3;
      speedPercentage = 90;
      accuracyPercentage = 95;
      break;
  }

  return {
    memoryMB: Math.round(baseMemoryGB * memoryMultiplier * 1024),
    loadTimeSeconds: Math.round(baseTimeSeconds * timeMultiplier),
    speedPercentage,
    accuracyPercentage,
  };
}

