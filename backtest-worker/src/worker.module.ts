import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import workerConfig from './config/worker.config';
import { TasksController } from './controllers/tasks.controller';
import { HealthController } from './controllers/health.controller';
import { TaskStatusStore } from './executor/task-status.store';
import { BacktestExecutor } from './executor/backtest-executor';
import { WorkerRegistrationService } from './registration/worker-registration.service';
import { HistoricalDataLoader } from './executor/data-loader';
import { ProgressReporter } from './executor/progress-reporter';
import { StrategyRunner } from './executor/strategy-runner';
import { MemoryManager } from './executor/memory-manager';
import { ParquetDataProviderService } from './data/parquet-data-provider.service';
import { MainServiceReporter } from './executor/main-service-reporter';
import { WorkerMetricsService } from './monitoring/worker-metrics.service';
import { WorkerMetricsController } from './monitoring/metrics.controller';
import { DynamicStrategyExecutor } from './backtesting/strategies/dynamic-strategy.executor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [workerConfig],
      expandVariables: true,
    }),
    HttpModule,
  ],
  controllers: [TasksController, HealthController, WorkerMetricsController],
  providers: [
    TaskStatusStore,
    ParquetDataProviderService,
    HistoricalDataLoader,
    ProgressReporter,
    StrategyRunner,
    MemoryManager,
    MainServiceReporter,
    BacktestExecutor,
    WorkerRegistrationService,
    WorkerMetricsService,
    DynamicStrategyExecutor,
  ],
})
export class WorkerModule {}
