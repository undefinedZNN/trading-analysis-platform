import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { StrategiesService } from './strategies.service';
import { ListStrategiesDto } from './dto/list-strategies.dto';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { CreateScriptVersionDto } from './dto/create-script-version.dto';
import { UpdateScriptVersionDto } from './dto/update-script-version.dto';
import { CopyScriptVersionDto } from './dto/copy-script-version.dto';
import { DiffScriptVersionDto } from './dto/diff-script-version.dto';
import { PythonStrategyValidator } from './python-strategy.validator';

@ApiTags('Strategies')
@Controller('backtesting/strategies')
export class StrategiesController {
  constructor(
    private readonly strategiesService: StrategiesService,
    private readonly validator: PythonStrategyValidator,
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
   * 验证策略脚本
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '验证策略脚本',
    description: '验证Python策略脚本的语法和结构是否符合要求',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python策略脚本代码',
        },
      },
      required: ['code'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '验证结果',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean', description: '是否有效' },
        errors: {
          type: 'array',
          items: { type: 'string' },
          description: '错误信息列表',
        },
        warnings: {
          type: 'array',
          items: { type: 'string' },
          description: '警告信息列表',
        },
      },
    },
  })
  async validateScript(@Body() body: { code: string }) {
    const result = await this.validator.validate(body.code);
    return {
      valid: result.isValid,
      errors: result.errors,
      warnings: result.warnings || [],
    };
  }
}
