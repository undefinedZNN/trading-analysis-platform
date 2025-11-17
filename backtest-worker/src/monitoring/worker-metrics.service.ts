import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TaskMetrics {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  totalBars: number;
  processedBars: number;
  updatedAt: number;
}

@Injectable()
export class WorkerMetricsService {
  private readonly workerId: string;
  private runningTasks = 0;
  private completedTasks = 0;
  private failedTasks = 0;
  private cancelledTasks = 0;
  private lastTask?: TaskMetrics;

  constructor(private readonly config: ConfigService) {
    this.workerId = this.config.get<string>('worker.identity', `worker-${process.pid}`);
  }

  taskStarted(taskId: string, totalBars: number) {
    this.runningTasks += 1;
    this.lastTask = {
      taskId,
      status: 'running',
      progress: 0,
      totalBars,
      processedBars: 0,
      updatedAt: Date.now(),
    };
  }

  taskProgress(taskId: string, processedBars: number, totalBars: number) {
    if (!this.lastTask || this.lastTask.taskId !== taskId) {
      this.lastTask = {
        taskId,
        status: 'running',
        progress: totalBars === 0 ? 0 : processedBars / totalBars,
        totalBars,
        processedBars,
        updatedAt: Date.now(),
      };
      return;
    }
    this.lastTask.progress = totalBars === 0 ? 0 : processedBars / totalBars;
    this.lastTask.processedBars = processedBars;
    this.lastTask.totalBars = totalBars;
    this.lastTask.updatedAt = Date.now();
  }

  taskCompleted(taskId: string) {
    this.runningTasks = Math.max(0, this.runningTasks - 1);
    this.completedTasks += 1;
    if (this.lastTask && this.lastTask.taskId === taskId) {
      this.lastTask.status = 'completed';
      this.lastTask.progress = 1;
      this.lastTask.updatedAt = Date.now();
    }
  }

  taskFailed(taskId: string) {
    this.runningTasks = Math.max(0, this.runningTasks - 1);
    this.failedTasks += 1;
    if (this.lastTask && this.lastTask.taskId === taskId) {
      this.lastTask.status = 'failed';
      this.lastTask.updatedAt = Date.now();
    }
  }

  taskCancelled(taskId: string) {
    this.runningTasks = Math.max(0, this.runningTasks - 1);
    this.cancelledTasks += 1;
    if (this.lastTask && this.lastTask.taskId === taskId) {
      this.lastTask.status = 'cancelled';
      this.lastTask.updatedAt = Date.now();
    }
  }

  render(): string {
    const lines: string[] = [];
    lines.push('# HELP worker_running_tasks 当前运行中的任务数量');
    lines.push('# TYPE worker_running_tasks gauge');
    lines.push(`worker_running_tasks{worker_id="${this.workerId}"} ${this.runningTasks}`);

    lines.push('# HELP worker_completed_tasks 完成任务总数');
    lines.push('# TYPE worker_completed_tasks counter');
    lines.push(`worker_completed_tasks{worker_id="${this.workerId}"} ${this.completedTasks}`);

    lines.push('# HELP worker_failed_tasks 失败任务总数');
    lines.push('# TYPE worker_failed_tasks counter');
    lines.push(`worker_failed_tasks{worker_id="${this.workerId}"} ${this.failedTasks}`);

    lines.push('# HELP worker_cancelled_tasks 取消任务总数');
    lines.push('# TYPE worker_cancelled_tasks counter');
    lines.push(`worker_cancelled_tasks{worker_id="${this.workerId}"} ${this.cancelledTasks}`);

    if (this.lastTask) {
      lines.push('# HELP worker_last_task_progress 最近一次任务进度 (0-1)');
      lines.push('# TYPE worker_last_task_progress gauge');
      lines.push(
        `worker_last_task_progress{worker_id="${this.workerId}",task_id="${this.lastTask.taskId}"} ${this.lastTask.progress}`,
      );

      lines.push('# HELP worker_last_task_status 最近任务状态');
      lines.push('# TYPE worker_last_task_status gauge');
      lines.push(
        `worker_last_task_status{worker_id="${this.workerId}",task_id="${this.lastTask.taskId}",status="${this.lastTask.status}"} 1`,
      );

      lines.push('# HELP worker_last_task_processed_bars 最近任务已处理bar数量');
      lines.push('# TYPE worker_last_task_processed_bars gauge');
      lines.push(
        `worker_last_task_processed_bars{worker_id="${this.workerId}",task_id="${this.lastTask.taskId}"} ${this.lastTask.processedBars}`,
      );
    }

    return lines.join('\n');
  }
}
