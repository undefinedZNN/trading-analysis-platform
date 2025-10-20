import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyEntity } from './entities/strategy.entity';
import { StrategyScriptVersionEntity } from './entities/strategy-script-version.entity';
import { StrategiesController } from './controllers/strategies.controller';
import { StrategyScriptsController } from './controllers/strategy-scripts.controller';
import { StrategiesService } from './services/strategies.service';
import { StrategyScriptsService } from './services/strategy-scripts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StrategyEntity,
      StrategyScriptVersionEntity,
    ]),
  ],
  controllers: [
    StrategiesController,
    StrategyScriptsController,
  ],
  providers: [
    StrategiesService,
    StrategyScriptsService,
  ],
  exports: [
    StrategiesService,
    StrategyScriptsService,
  ],
})
export class StrategyManagementModule {}
