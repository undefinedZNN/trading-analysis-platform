import { Injectable } from '@nestjs/common';
import { TaskStatus, TaskStatusDto } from '@trading-platform/backtesting-contracts';

@Injectable()
export class TaskStatusStore {
  private readonly statuses = new Map<string, TaskStatusDto>();

  start(taskId: string, workerId?: string) {
    this.statuses.set(taskId, {
      taskId,
      status: TaskStatus.Running,
      progress: 0,
      updatedAt: new Date().toISOString(),
      workerId,
    });
  }

  update(taskId: string, patch: Partial<TaskStatusDto>) {
    const current = this.statuses.get(taskId);
    if (!current) {
      return;
    }

    this.statuses.set(taskId, {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  complete(taskId: string) {
    this.update(taskId, { status: TaskStatus.Completed, progress: 1 });
  }

  fail(taskId: string, error: Error | string) {
    this.update(taskId, {
      status: TaskStatus.Failed,
      error: typeof error === 'string' ? error : error.message,
    });
  }

  cancel(taskId: string) {
    this.update(taskId, {
      status: TaskStatus.Cancelled,
    });
  }

  getTaskStatus(taskId: string): TaskStatusDto {
    return (
      this.statuses.get(taskId) || {
        taskId,
        status: TaskStatus.Pending,
        progress: 0,
        updatedAt: new Date().toISOString(),
      }
    );
  }

  getRunningTasks(): number {
    return Array.from(this.statuses.values()).filter((s) => s.status === TaskStatus.Running).length;
  }

  getAggregatedStatus(): 'idle' | 'busy' {
    return this.getRunningTasks() > 0 ? 'busy' : 'idle';
  }

  getMetricsSnapshot() {
    return {
      runningTasks: this.getRunningTasks(),
      updatedAt: new Date().toISOString(),
    };
  }
}
