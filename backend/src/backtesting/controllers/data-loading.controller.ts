import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import {
  DataLoadingConfigDto,
  DataLoadMode,
  getRecommendedConfig,
  estimateResources,
  ResourceEstimate,
} from '../dto/data-loading-config.dto';

@ApiTags('Data Loading')
@Controller('backtesting/data-loading')
export class DataLoadingController {
  /**
   * 获取推荐的数据加载配置
   */
  @Get('recommend/:datasetId')
  @ApiOperation({ summary: '根据数据集大小推荐配置' })
  @ApiParam({
    name: 'datasetId',
    description: '数据集ID',
    example: 'ES-23',
  })
  @ApiResponse({
    status: 200,
    description: '推荐配置',
    type: DataLoadingConfigDto,
  })
  async getRecommendedConfig(
    @Param('datasetId') datasetId: string,
  ): Promise<{
    datasetId: string;
    datasetSize: number;
    recommendedConfig: DataLoadingConfigDto;
    estimate: ResourceEstimate;
  }> {
    // TODO: 从数据库获取数据集大小
    // 这里先用示例数据
    const datasetSize = 5300000; // 530万条

    const config = getRecommendedConfig(datasetSize);
    const estimate = estimateResources(datasetSize, config);

    return {
      datasetId,
      datasetSize,
      recommendedConfig: config,
      estimate,
    };
  }

  /**
   * 估算指定配置的资源消耗
   */
  @Post('estimate')
  @ApiOperation({ summary: '估算资源消耗' })
  @ApiResponse({
    status: 200,
    description: '资源估算结果',
  })
  async estimateResources(
    @Body() body: { datasetSize: number; config: DataLoadingConfigDto },
  ): Promise<{
    estimate: ResourceEstimate;
    comparison: any;
  }> {
    const { datasetSize, config } = body;

    const estimate = estimateResources(datasetSize, config);

    // 对比默认模式
    const defaultConfig: DataLoadingConfigDto = {
      mode: DataLoadMode.DEFAULT,
      exactbars: false,
      preload: true,
      runonce: true,
    };
    const defaultEstimate = estimateResources(datasetSize, defaultConfig);

    const comparison = {
      memorySavingMB: defaultEstimate.memoryMB - estimate.memoryMB,
      memorySavingPercent: ((defaultEstimate.memoryMB - estimate.memoryMB) / defaultEstimate.memoryMB) * 100,
      timeChangeSec: estimate.loadTimeSeconds - defaultEstimate.loadTimeSeconds,
      speedChange: estimate.speedPercentage - defaultEstimate.speedPercentage,
    };

    return {
      estimate,
      comparison,
    };
  }

  /**
   * 获取所有可用的加载模式
   */
  @Get('modes')
  @ApiOperation({ summary: '获取所有可用的加载模式' })
  @ApiResponse({
    status: 200,
    description: '加载模式列表',
  })
  async getAvailableModes() {
    return {
      modes: [
        {
          mode: DataLoadMode.DEFAULT,
          name: '默认模式',
          description: '标准Backtrader配置，适合小数据集',
          complexity: '简单',
          memoryReduction: '0%',
          speedImpact: '0%',
          recommendedFor: '< 50万条',
        },
        {
          mode: DataLoadMode.OPTIMIZED,
          name: '内存优化模式',
          description: '启用exactbars，内存降低85%+，仅需1行代码',
          complexity: '极简',
          memoryReduction: '85-90%',
          speedImpact: '-20%到-30%',
          recommendedFor: '50万 - 500万条',
          recommended: true,
        },
        {
          mode: DataLoadMode.STREAMING,
          name: '流式加载模式',
          description: 'DuckDB流式查询+Backtrader优化，适合千万级数据',
          complexity: '中等',
          memoryReduction: '90-95%',
          speedImpact: '-25%到-35%',
          recommendedFor: '500万 - 1000万条',
        },
        {
          mode: DataLoadMode.HYBRID,
          name: '混合精度模式',
          description: '开发时用低精度数据，生产时用完整数据',
          complexity: '中等',
          memoryReduction: '95%（开发模式）',
          speedImpact: '0%（开发模式）',
          recommendedFor: '快速迭代开发',
        },
        {
          mode: DataLoadMode.SEGMENTED,
          name: '智能分段模式',
          description: '按时间窗口分段处理，适合多年回测',
          complexity: '中等',
          memoryReduction: '70%',
          speedImpact: '-10%',
          recommendedFor: '长周期回测（3年+）',
        },
      ],
    };
  }

  /**
   * 验证配置的有效性
   */
  @Post('validate')
  @ApiOperation({ summary: '验证配置' })
  @ApiResponse({
    status: 200,
    description: '验证结果',
  })
  async validateConfig(
    @Body() config: DataLoadingConfigDto,
  ): Promise<{
    valid: boolean;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    // 验证规则
    if (config.mode === DataLoadMode.STREAMING) {
      if (!config.chunkSize || config.chunkSize < 10000) {
        errors.push('流式模式的chunk_size不能小于10000');
      }
      if (config.chunkSize && config.chunkSize > 1000000) {
        warnings.push('chunk_size过大可能影响性能');
      }
    }

    if (config.mode === DataLoadMode.SEGMENTED) {
      if (!config.segmentMonths || config.segmentMonths < 1) {
        errors.push('分段模式的segment_months不能小于1');
      }
      if (config.segmentMonths && config.segmentMonths > 12) {
        warnings.push('segment_months过大可能无法有效降低内存');
      }
    }

    if (config.mode === DataLoadMode.OPTIMIZED) {
      if (!config.exactbars) {
        errors.push('优化模式必须启用exactbars');
      }
      if (config.preload || config.runonce) {
        warnings.push('优化模式建议关闭preload和runonce以获得最佳效果');
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * 获取数据集信息
   */
  @Get('datasets/:datasetId/info')
  @ApiOperation({ summary: '获取数据集信息' })
  @ApiParam({
    name: 'datasetId',
    description: '数据集ID',
    example: 'ES-23',
  })
  @ApiResponse({
    status: 200,
    description: '数据集信息',
  })
  async getDatasetInfo(@Param('datasetId') datasetId: string) {
    // TODO: 实际从数据库或文件系统查询
    // 这里返回示例数据
    return {
      datasetId,
      symbol: 'ES',
      year: 2023,
      timeframe: '1s',
      totalRows: 5300000,
      sizeMB: 2500,
      dateRange: {
        start: '2023-01-01',
        end: '2023-12-31',
      },
      recommendedMode: DataLoadMode.OPTIMIZED,
    };
  }
}

