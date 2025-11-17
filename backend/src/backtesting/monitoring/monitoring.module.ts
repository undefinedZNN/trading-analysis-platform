import { Global, Module } from '@nestjs/common';
import { BacktestMetricsService } from './backtest-metrics.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  providers: [BacktestMetricsService],
  controllers: [MetricsController],
  exports: [BacktestMetricsService],
})
export class MonitoringModule {}
