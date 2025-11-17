import { Injectable } from '@nestjs/common';
import { TaskStatusStore } from './task-status.store';
import { ExecutionMetrics } from './interfaces';

@Injectable()
export class ProgressReporter {
  constructor(private readonly statusStore: TaskStatusStore) {}

  report(taskId: string, metrics: ExecutionMetrics) {
    const progress = metrics.totalBars === 0 ? 1 : metrics.processedBars / metrics.totalBars;

    this.statusStore.update(taskId, {
      progress: Math.min(1, progress),
      metrics: {
        processedBars: metrics.processedBars,
        totalBars: metrics.totalBars,
        throughput: Number(metrics.throughput.toFixed(2)),
        memoryUsed: metrics.memoryUsed,
      },
    });
  }
}
