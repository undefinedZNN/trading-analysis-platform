import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskStatusStore } from '../executor/task-status.store';
import { BacktestExecutor } from '../executor/backtest-executor';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly statusStore: TaskStatusStore,
    private readonly executor: BacktestExecutor,
  ) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      workerId: this.config.get<string>('worker.identity', `worker-${process.pid}`),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      runningTasks: this.executor.getRunningTaskCount(),
      metrics: this.statusStore.getMetricsSnapshot(),
      timestamp: new Date().toISOString(),
    };
  }
}
