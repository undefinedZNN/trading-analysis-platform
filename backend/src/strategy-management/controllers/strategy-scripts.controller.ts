import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StrategyScriptsService } from '../services/strategy-scripts.service';
import {
  CreateStrategyScriptDto,
  ListStrategyScriptsQueryDto,
  UpdateStrategyScriptDto,
} from '../dto/strategy-script.dto';

@Controller('strategy-management')
export class StrategyScriptsController {
  constructor(private readonly scriptsService: StrategyScriptsService) {}

  @Get('strategies/:strategyId/scripts')
  async listScripts(
    @Param('strategyId', ParseIntPipe) strategyId: number,
    @Query() query: ListStrategyScriptsQueryDto,
  ) {
    return this.scriptsService.listScripts(strategyId, query);
  }

  @Post('strategies/:strategyId/scripts')
  async createScript(
    @Param('strategyId', ParseIntPipe) strategyId: number,
    @Body() payload: CreateStrategyScriptDto,
  ) {
    return this.scriptsService.createScript(strategyId, payload);
  }

  @Get('scripts/:scriptId')
  async getScript(@Param('scriptId', ParseIntPipe) scriptId: number) {
    return this.scriptsService.getScriptById(scriptId);
  }

  @Patch('scripts/:scriptId')
  async updateScript(
    @Param('scriptId', ParseIntPipe) scriptId: number,
    @Body() payload: UpdateStrategyScriptDto,
  ) {
    return this.scriptsService.updateScript(scriptId, payload);
  }
}
