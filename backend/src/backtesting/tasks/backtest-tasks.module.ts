import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import {
  BacktestTaskEntity,
  TaskLogEntity,
  BacktestResultEntity,
} from './entities';
import { BacktestTasksService } from './backtest-tasks.service';
import { TaskLogsService } from './task-logs.service';
import { TaskExecutorService } from './task-executor.service';
import { BacktestTasksController } from './backtest-tasks.controller';
import { StrategiesService } from '../strategies/strategies.service';
import { StrategyScriptParser } from '../strategies/strategy-script.parser';
import { PythonStrategyValidator } from '../strategies/python-strategy.validator';
import { StrategyScriptCompiler } from '../strategies/strategy-script.compiler';
import { StrategyEntity } from '../entities/strategy.entity';
import { ScriptVersionEntity } from '../entities/script-version.entity';
import { TradingDataModule } from '../../trading-data/trading-data.module';
import { WorkerClientModule } from '../worker-client/worker-client.module';
import { ServiceRegistryModule } from '../service-registry/service-registry.module';
import { BacktestResultRepository } from './repositories';
import {
  ParquetStorageService,
  BacktestAnalysisService,
  BacktestResultService,
} from './services';
// TODO: RabbitMQ消费者待实现
// import { BacktestResultConsumer } from './consumers';
import { BacktestResultsController } from './controllers';

/**
 * 回测任务管理模块
 * 
 * 提供回测任务的创建、查询、执行和日志管理功能
 */
@Module({
  imports: [
    ConfigModule, // 添加 ConfigModule 以提供 ConfigService
    TypeOrmModule.forFeature([
      BacktestTaskEntity,
      TaskLogEntity,
      BacktestResultEntity, // 新增
      StrategyEntity,
      ScriptVersionEntity,
    ]),
    TradingDataModule, // 导入 TradingDataModule 以访问 TradingDataService
    WorkerClientModule,
    ServiceRegistryModule,
  ],
  controllers: [
    BacktestTasksController,
    BacktestResultsController, // Day 5 新增
  ],
  providers: [
    // 任务相关服务
    BacktestTasksService,
    TaskLogsService,
    TaskExecutorService,
    
    // 结果相关服务（Day 2-3 新增）
    BacktestResultRepository,
    ParquetStorageService,
    BacktestAnalysisService,
    BacktestResultService,
    
    // 消息消费者（Day 4 新增） - 待实现RabbitMQ
    // BacktestResultConsumer,
    
    // 策略相关服务
    StrategiesService,
    StrategyScriptParser,
    PythonStrategyValidator,
    StrategyScriptCompiler,
  ],
  exports: [
    BacktestTasksService,
    TaskLogsService,
    TaskExecutorService,
    BacktestResultRepository,
    BacktestResultService, // 导出供其他模块使用
  ],
})
export class BacktestTasksModule {}
