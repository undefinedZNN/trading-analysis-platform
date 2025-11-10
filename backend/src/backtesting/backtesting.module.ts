import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacktestingController } from './backtesting.controller';
import { BacktestingService } from './backtesting.service';
import { StrategyEntity } from './entities/strategy.entity';
import { ScriptVersionEntity } from './entities/script-version.entity';
import { StrategiesController } from './strategies/strategies.controller';
import { StrategiesService } from './strategies/strategies.service';
import { StrategyScriptParser } from './strategies/strategy-script.parser';
import { StrategyScriptValidator } from './strategies/strategy-script.validator';
import { CodeDiffService } from './strategies/services/code-diff.service';
import { SchemaDiffService } from './strategies/services/schema-diff.service';
import { VersionCompareService } from './strategies/services/version-compare.service';
import { CompareCacheService } from './strategies/services/compare-cache.service';
import { StrategyModule } from './strategy/strategy.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StrategyEntity, ScriptVersionEntity]),
    StrategyModule,
  ],
  controllers: [BacktestingController, StrategiesController],
  providers: [
    BacktestingService,
    StrategiesService,
    StrategyScriptParser,
    StrategyScriptValidator,
    CodeDiffService,
    SchemaDiffService,
    CompareCacheService,
    VersionCompareService,
  ],
  exports: [
    BacktestingService,
    StrategiesService,
    StrategyScriptParser,
    StrategyScriptValidator,
    CodeDiffService,
    SchemaDiffService,
    CompareCacheService,
    VersionCompareService,
  ],
})
export class BacktestingModule {}
