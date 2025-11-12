import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacktestTaskEntity, TaskLogEntity } from './entities';
import { BacktestTasksService } from './backtest-tasks.service';
import { TaskLogsService } from './task-logs.service';
import { BacktestTasksController } from './backtest-tasks.controller';

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
    ]),
  ],
  controllers: [BacktestTasksController],
  providers: [
    BacktestTasksService,
    TaskLogsService,
  ],
  exports: [
    BacktestTasksService,
    TaskLogsService,
  ],
})
export class BacktestTasksModule {}

