import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacktestTaskEntity, TaskLogEntity } from './entities';
import { BacktestTasksService } from './backtest-tasks.service';
import { TaskLogsService } from './task-logs.service';
import { TaskExecutorService } from './task-executor.service';
import { BacktestTasksController } from './backtest-tasks.controller';
import { StrategiesService } from '../strategies/strategies.service';
import { StrategyScriptParser } from '../strategies/strategy-script.parser';
import { StrategyScriptValidator } from '../strategies/strategy-script.validator';
import { StrategyEntity } from '../entities/strategy.entity';
import { ScriptVersionEntity } from '../entities/script-version.entity';
import { TradingDataModule } from '../../trading-data/trading-data.module';

/**
 * 回测任务管理模块
 * 
 * 提供回测任务的创建、查询、执行和日志管理功能
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BacktestTaskEntity,
      TaskLogEntity,
      StrategyEntity,
      ScriptVersionEntity,
    ]),
    TradingDataModule, // 导入 TradingDataModule 以访问 TradingDataService
  ],
  controllers: [BacktestTasksController],
  providers: [
    BacktestTasksService,
    TaskLogsService,
    TaskExecutorService,
    StrategiesService,
    StrategyScriptParser,
    StrategyScriptValidator,
  ],
  exports: [
    BacktestTasksService,
    TaskLogsService,
    TaskExecutorService,
  ],
})
export class BacktestTasksModule {}

