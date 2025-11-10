import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StrategiesService } from './strategies.service';
import { VersionCompareService } from './services/version-compare.service';
import { CacheStats } from './services/compare-cache.service';
import { ListStrategiesDto } from './dto/list-strategies.dto';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { CreateScriptVersionDto } from './dto/create-script-version.dto';
import { UpdateScriptVersionDto } from './dto/update-script-version.dto';
import { CopyScriptVersionDto } from './dto/copy-script-version.dto';
import { DiffScriptVersionDto } from './dto/diff-script-version.dto';
import { CompareVersionsDto, CompareVersionsResponseDto } from './dto/version-compare.dto';

@ApiTags('strategies')
@Controller('backtesting/strategies')
export class StrategiesController {
  constructor(
    private readonly strategiesService: StrategiesService,
    private readonly versionCompareService: VersionCompareService,
  ) {}

  @Get()
  list(@Query() query: ListStrategiesDto) {
    return this.strategiesService.listStrategies(query);
  }

  @Get('tags')
  listTags() {
    return this.strategiesService.listStrategyTags();
  }

  @Get(':strategyId')
  detail(@Param('strategyId') strategyId: string) {
    return this.strategiesService.getStrategy(strategyId);
  }

  @Post()
  create(@Body() dto: CreateStrategyDto) {
    return this.strategiesService.createStrategy(dto);
  }

  @Patch(':strategyId')
  update(
    @Param('strategyId') strategyId: string,
    @Body() dto: UpdateStrategyDto,
  ) {
    return this.strategiesService.updateStrategy(strategyId, dto);
  }

  @Post(':strategyId/script-versions')
  createVersion(
    @Param('strategyId') strategyId: string,
    @Body() dto: CreateScriptVersionDto,
  ) {
    return this.strategiesService.createScriptVersion(
      strategyId,
      dto,
    );
  }

  @Patch(':strategyId/script-versions/:versionId')
  updateVersion(
    @Param('strategyId') strategyId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateScriptVersionDto,
  ) {
    return this.strategiesService.updateScriptVersion(
      strategyId,
      versionId,
      dto,
    );
  }

  @Post(':strategyId/script-versions/:versionId/copy')
  copyVersion(
    @Param('strategyId') strategyId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CopyScriptVersionDto,
  ) {
    return this.strategiesService.copyScriptVersion(
      strategyId,
      versionId,
      dto,
    );
  }

  @Get(':strategyId/script-versions/:versionId/diff')
  diffVersion(
    @Param('strategyId') strategyId: string,
    @Param('versionId') versionId: string,
    @Query() query: DiffScriptVersionDto,
  ) {
    return this.strategiesService.diffScriptVersions(
      strategyId,
      versionId,
      query,
    );
  }

  /**
   * 对比两个版本
   */
  @Post(':strategyId/compare')
  @ApiOperation({ summary: '对比两个策略版本' })
  @ApiResponse({
    status: 200,
    description: '对比成功',
    type: CompareVersionsResponseDto,
  })
  @ApiResponse({ status: 404, description: '版本不存在' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async compareVersions(
    @Param('strategyId') strategyId: string,
    @Body() dto: Omit<CompareVersionsDto, 'strategyId'>,
  ): Promise<CompareVersionsResponseDto> {
    return this.versionCompareService.compareVersions({
      ...dto,
      strategyId,
    });
  }

  /**
   * 获取可用于对比的版本列表
   */
  @Get(':strategyId/versions-for-compare')
  @ApiOperation({ summary: '获取可用于对比的版本列表' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getVersionsForCompare(
    @Param('strategyId') strategyId: string,
  ) {
    return this.versionCompareService.getVersionsForCompare(strategyId);
  }

  /**
   * 获取缓存统计信息
   */
  @Get('cache/stats')
  @ApiOperation({ summary: '获取版本对比缓存统计信息' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  getCacheStats(): CacheStats {
    return this.versionCompareService.getCacheStats();
  }

  /**
   * 清空缓存
   */
  @Post('cache/clear')
  @ApiOperation({ summary: '清空版本对比缓存' })
  @ApiResponse({
    status: 200,
    description: '清空成功',
  })
  clearCache() {
    this.versionCompareService.clearCache();
    return { message: 'Cache cleared successfully' };
  }
}
