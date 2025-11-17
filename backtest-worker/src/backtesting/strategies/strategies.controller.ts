import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StrategiesService } from './strategies.service';
import { ListStrategiesDto } from './dto/list-strategies.dto';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { CreateScriptVersionDto } from './dto/create-script-version.dto';
import { UpdateScriptVersionDto } from './dto/update-script-version.dto';
import { CopyScriptVersionDto } from './dto/copy-script-version.dto';
import { DiffScriptVersionDto } from './dto/diff-script-version.dto';

@Controller('backtesting/strategies')
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

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
}
