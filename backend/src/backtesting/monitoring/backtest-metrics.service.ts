import { Injectable } from '@nestjs/common';
import { BacktestTaskStatus } from '../tasks/entities';

type WorkerStatusValue = 'idle' | 'busy' | 'overloaded' | 'down';

interface WorkerSnapshot {
  status: WorkerStatusValue;
  load: number;
  lastHeartbeat: number;
}

@Injectable()
export class BacktestMetricsService {
  private readonly workerSnapshots = new Map<string, WorkerSnapshot>();
  private readonly taskStatusCounters = new Map<BacktestTaskStatus, number>();
  private runningTasks = 0;
  private lastTaskProgress = 0;

  recordWorkerRegistered(workerId: string) {
    if (!this.workerSnapshots.has(workerId)) {
      this.workerSnapshots.set(workerId, {
        status: 'idle',
        load: 0,
        lastHeartbeat: Date.now(),
      });
    }
  }

  recordWorkerHeartbeat(workerId: string, status: WorkerStatusValue, load: number) {
    const snapshot = this.workerSnapshots.get(workerId);
    if (snapshot) {
      snapshot.status = status;
      snapshot.load = load;
      snapshot.lastHeartbeat = Date.now();
    } else {
      this.workerSnapshots.set(workerId, {
        status,
        load,
        lastHeartbeat: Date.now(),
      });
    }
  }

  recordWorkerDeregister(workerId: string) {
    this.workerSnapshots.delete(workerId);
  }

  recordWorkerLoad(workerId: string, load: number, status: WorkerStatusValue) {
    const snapshot = this.workerSnapshots.get(workerId);
    if (snapshot) {
      snapshot.load = load;
      snapshot.status = status;
    }
  }

  recordTaskStatusChange(
    previous: BacktestTaskStatus | undefined,
    next: BacktestTaskStatus,
  ) {
    if (previous === next) {
      // 状态未变化，只记录一次计数
    }

    if (previous === BacktestTaskStatus.RUNNING && next !== BacktestTaskStatus.RUNNING) {
      this.runningTasks = Math.max(0, this.runningTasks - 1);
    }
    if (next === BacktestTaskStatus.RUNNING && previous !== BacktestTaskStatus.RUNNING) {
      this.runningTasks += 1;
    }

    const current = this.taskStatusCounters.get(next) ?? 0;
    this.taskStatusCounters.set(next, current + 1);
  }

  recordTaskProgress(progressPercent: number) {
    this.lastTaskProgress = progressPercent;
  }

  renderMetrics(): string {
    const lines: string[] = [];
    lines.push('# HELP backtest_workers_active 当前活跃 Worker 数量');
    lines.push('# TYPE backtest_workers_active gauge');
    lines.push(`backtest_workers_active ${this.workerSnapshots.size}`);

    lines.push('# HELP backtest_worker_load Worker 当前任务负载');
    lines.push('# TYPE backtest_worker_load gauge');
    for (const [workerId, snapshot] of this.workerSnapshots.entries()) {
      lines.push(
        `backtest_worker_load{worker_id="${workerId}"} ${snapshot.load}`,
      );
    }

    lines.push('# HELP backtest_worker_status Worker 状态枚举 (0=down,1=idle,2=busy,3=overloaded)');
    lines.push('# TYPE backtest_worker_status gauge');
    for (const [workerId, snapshot] of this.workerSnapshots.entries()) {
      lines.push(
        `backtest_worker_status{worker_id="${workerId}"} ${this.mapWorkerStatus(snapshot.status)}`,
      );
    }

    lines.push('# HELP backtest_worker_last_heartbeat_seconds 最近一次心跳（秒）');
    lines.push('# TYPE backtest_worker_last_heartbeat_seconds gauge');
    for (const [workerId, snapshot] of this.workerSnapshots.entries()) {
      lines.push(
        `backtest_worker_last_heartbeat_seconds{worker_id="${workerId}"} ${Math.floor(
          snapshot.lastHeartbeat / 1000,
        )}`,
      );
    }

    lines.push('# HELP backtest_tasks_running 当前运行中的任务数');
    lines.push('# TYPE backtest_tasks_running gauge');
    lines.push(`backtest_tasks_running ${this.runningTasks}`);

    lines.push('# HELP backtest_task_status_total 进入各状态的任务次数');
    lines.push('# TYPE backtest_task_status_total counter');
    for (const status of Object.values(BacktestTaskStatus)) {
      const count = this.taskStatusCounters.get(status) ?? 0;
      lines.push(
        `backtest_task_status_total{status="${status.toLowerCase()}"} ${count}`,
      );
    }

    lines.push('# HELP backtest_task_last_progress_percent 最近一次上报的任务进度（0-100）');
    lines.push('# TYPE backtest_task_last_progress_percent gauge');
    lines.push(`backtest_task_last_progress_percent ${this.lastTaskProgress}`);

    return lines.join('\n');
  }

  private mapWorkerStatus(status: WorkerStatusValue): number {
    switch (status) {
      case 'idle':
        return 1;
      case 'busy':
        return 2;
      case 'overloaded':
        return 3;
      case 'down':
      default:
        return 0;
    }
  }
}
