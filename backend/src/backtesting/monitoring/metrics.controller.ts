import { Controller, Get, Header } from '@nestjs/common';
import { BacktestMetricsService } from './backtest-metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: BacktestMetricsService) {}

  @Get('metrics/backtesting')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return this.metrics.renderMetrics();
  }
}
