import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacktestingController } from './backtesting.controller';
import { BacktestingService } from './backtesting.service';
import { StrategyEntity } from './entities/strategy.entity';
import { ScriptVersionEntity } from './entities/script-version.entity';
import { StrategiesController } from './strategies/strategies.controller';
import { StrategiesService } from './strategies/strategies.service';
import { StrategyScriptParser } from './strategies/strategy-script.parser';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyEntity, ScriptVersionEntity])],
  controllers: [BacktestingController, StrategiesController],
  providers: [BacktestingService, StrategiesService, StrategyScriptParser],
  exports: [BacktestingService, StrategiesService, StrategyScriptParser],
})
export class BacktestingModule {}
