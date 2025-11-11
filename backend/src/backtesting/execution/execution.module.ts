/**
 * 执行模块
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScriptVersionEntity } from '../entities/script-version.entity';
import { StrategyModule } from '../strategy/strategy.module';
import { ExecutionController } from './execution.controller';
import { ExecutionGateway } from './execution.gateway';
import { StrategyLoaderService } from './services/strategy-loader.service';
import { DataFeedService } from './services/data-feed.service';
import { StrategyExecutorService } from './services/strategy-executor.service';
import { ExecutionMonitorService } from './services/execution-monitor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScriptVersionEntity]),
    EventEmitterModule.forRoot(),
    StrategyModule,
  ],
  controllers: [ExecutionController],
  providers: [
    ExecutionGateway,
    StrategyLoaderService,
    DataFeedService,
    StrategyExecutorService,
    ExecutionMonitorService,
  ],
  exports: [
    StrategyLoaderService,
    DataFeedService,
    StrategyExecutorService,
    ExecutionMonitorService,
  ],
})
export class ExecutionModule {}

