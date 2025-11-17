import { Controller, Get, Header } from '@nestjs/common';
import { WorkerMetricsService } from './worker-metrics.service';

@Controller()
export class WorkerMetricsController {
  constructor(private readonly metrics: WorkerMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsEndpoint(): string {
    return this.metrics.render();
  }
}
