import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StrategiesService } from '../services/strategies.service';
import {
  CreateStrategyDto,
  ListStrategiesQueryDto,
  UpdateStrategyDto,
} from '../dto/strategy.dto';

@Controller('strategy-management/strategies')
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Get()
  async list(@Query() query: ListStrategiesQueryDto) {
    return this.strategiesService.listStrategies(query);
  }

  @Post()
  async create(@Body() payload: CreateStrategyDto) {
    return this.strategiesService.createStrategy(payload);
  }

  @Get(':strategyId')
  async detail(@Param('strategyId', ParseIntPipe) strategyId: number) {
    return this.strategiesService.getStrategyById(strategyId);
  }

  @Patch(':strategyId')
  async update(
    @Param('strategyId', ParseIntPipe) strategyId: number,
    @Body() payload: UpdateStrategyDto,
  ) {
    return this.strategiesService.updateStrategy(strategyId, payload);
  }

  @Delete(':strategyId')
  async remove(
    @Param('strategyId', ParseIntPipe) strategyId: number,
    @Body('operator') operator?: string,
  ) {
    await this.strategiesService.softDeleteStrategy(strategyId, operator);
    return { success: true };
  }
}
