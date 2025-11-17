import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ExecuteTaskDto } from '@trading-platform/backtesting-contracts';
import { ServiceRegistryService } from '../service-registry/service-registry.service';

interface WorkerResponse {
  taskId: string;
  status: string;
  workerId?: string;
}

interface WorkerTarget {
  url: string;
  workerId?: string;
  source: 'registry' | 'static';
}

@Injectable()
export class WorkerClientService {
  private readonly logger = new Logger(WorkerClientService.name);
  private readonly enabled: boolean;
  private readonly staticEndpoints: string[];

  constructor(private readonly registry: ServiceRegistryService) {
    this.enabled = (process.env.BACKTEST_WORKER_ENABLED || '').toLowerCase() === 'true';
    const rawEndpoints = process.env.BACKTEST_WORKER_ENDPOINTS || '';
    this.staticEndpoints = rawEndpoints
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (this.enabled && !this.hasDynamicWorkers() && this.staticEndpoints.length === 0) {
      this.logger.warn(
        'Worker mode enabled but no worker endpoints available. Tasks will fall back to local execution.',
      );
    }
  }

  isEnabled(): boolean {
    if (!this.enabled) {
      return false;
    }
    return this.hasDynamicWorkers() || this.staticEndpoints.length > 0;
  }

  async dispatchTask(payload: ExecuteTaskDto): Promise<WorkerResponse> {
    if (!this.isEnabled()) {
      throw new Error('Worker dispatch attempted while worker mode is disabled.');
    }

    const attempted = new Set<string>();
    const errors: string[] = [];

    while (true) {
      const target = this.resolveTarget({
        strategyId: payload.config?.strategyId,
        excluded: attempted,
      });

      if (!target) {
        break;
      }

      const key = this.targetKey(target);
      attempted.add(key);

      this.logger.log(
        `Dispatching task ${payload.taskId} to worker target ${target.workerId ?? target.url} (${target.source})`,
      );

      if (target.workerId) {
        this.registry.updateLoad(target.workerId, 1);
      }

      try {
        const response = await axios.post<WorkerResponse>(`${target.url}/execute`, payload, {
          timeout: 10000,
        });

        return {
          ...response.data,
          workerId: response.data?.workerId ?? target.workerId ?? target.url,
        };
      } catch (error: any) {
        errors.push(error?.message || String(error));
        if (target.workerId) {
          this.registry.updateLoad(target.workerId, -1);
        }
        this.logger.warn(
          `Dispatch attempt failed for ${target.workerId ?? target.url}: ${error?.message}`,
        );
      }
    }

    throw new Error(
      errors.length > 0 ? `No available workers: ${errors.join('; ')}` : 'No available workers',
    );
  }

  async cancelTask(taskId: string, workerId?: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    const target = this.resolveTarget({ preferredWorkerId: workerId });
    if (!target) {
      this.logger.warn(`Unable to cancel task ${taskId}: worker ${workerId ?? 'unknown'} not found`);
      return;
    }
    await axios.post(
      `${target.url}/tasks/${taskId}/cancel`,
      {},
      {
        timeout: 5000,
      },
    );
  }

  async getTaskStatus(taskId: string, workerId?: string): Promise<any> {
    if (!this.isEnabled()) {
      return null;
    }
    const target = this.resolveTarget({ preferredWorkerId: workerId });
    if (!target) {
      return null;
    }
    const response = await axios.get(`${target.url}/tasks/${taskId}/status`, {
      timeout: 5000,
    });
    return response.data;
  }

  private resolveTarget(options: {
    preferredWorkerId?: string;
    strategyId?: string;
    excluded?: Set<string>;
  }): WorkerTarget | null {
    if (options.preferredWorkerId) {
      const worker = this.registry.getWorker(options.preferredWorkerId);
      if (worker) {
        const candidate: WorkerTarget = {
          url: worker.baseUrl,
          workerId: worker.workerId,
          source: 'registry',
        };
        if (!options.excluded?.has(this.targetKey(candidate))) {
          return candidate;
        }
      }
      if (this.staticEndpoints.includes(options.preferredWorkerId)) {
        const candidate: WorkerTarget = {
          url: options.preferredWorkerId,
          source: 'static',
        };
        if (!options.excluded?.has(this.targetKey(candidate))) {
          return candidate;
        }
      }
    }

    const worker = this.registry.selectWorker({
      strategyId: options.strategyId,
      exclude: this.extractExcludedWorkerIds(options.excluded),
    });

    if (worker) {
      return {
        url: worker.baseUrl,
        workerId: worker.workerId,
        source: 'registry',
      };
    }

    if (this.staticEndpoints.length > 0) {
      const shuffled = [...this.staticEndpoints];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      for (const endpoint of shuffled) {
        const candidate: WorkerTarget = {
          url: endpoint,
          source: 'static',
        };
        if (!options.excluded?.has(this.targetKey(candidate))) {
          return candidate;
        }
      }
    }

    return null;
  }

  private hasDynamicWorkers(): boolean {
    return this.registry.listWorkers().length > 0;
  }

  private targetKey(target: WorkerTarget): string {
    return target.workerId ? `registry:${target.workerId}` : `static:${target.url}`;
  }

  private extractExcludedWorkerIds(excluded?: Set<string>): Set<string> | undefined {
    if (!excluded || excluded.size === 0) {
      return undefined;
    }
    const ids = Array.from(excluded)
      .filter((key) => key.startsWith('registry:'))
      .map((key) => key.replace('registry:', ''));
    return ids.length > 0 ? new Set(ids) : undefined;
  }
}
