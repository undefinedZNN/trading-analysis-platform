import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacktestTaskEntity } from './entities/backtest-task.entity';
import { BacktestTasksService } from './services/backtest-tasks.service';
import { BacktestTasksController } from './controllers/backtest-tasks.controller';
import { StrategyEntity } from '../strategy-management/entities/strategy.entity';
import { StrategyScriptVersionEntity } from '../strategy-management/entities/strategy-script-version.entity';
import { DatasetEntity } from '../trading-data/entities/dataset.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BacktestTaskEntity,
      StrategyEntity,
      StrategyScriptVersionEntity,
      DatasetEntity,
    ]),
  ],
  controllers: [BacktestTasksController],
  providers: [BacktestTasksService],
  exports: [BacktestTasksService],
})
export class BacktestingModule {}

