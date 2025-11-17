import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  WorkerRegistrationDto,
  WorkerHeartbeatDto,
  WorkerDeregisterDto,
  WorkerCapabilitiesDto,
} from '@trading-platform/backtesting-contracts';
import { TaskStatusStore } from '../executor/task-status.store';

@Injectable()
export class WorkerRegistrationService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRegistrationService.name);
  readonly workerId: string;
  private registered = false;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly taskStatusStore: TaskStatusStore,
  ) {
    this.workerId = this.config.get<string>('worker.identity', `worker-${process.pid}`);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureRegistered();
  }

  async ensureRegistered(): Promise<void> {
    if (!this.shouldRegister() || this.registered) {
      return;
    }
    const capabilities = this.getCapabilities();
    const payload: WorkerRegistrationDto = {
      workerId: this.workerId,
      host: this.config.get<string>('worker.server.host', '127.0.0.1'),
      port: this.config.get<number>('worker.server.port', 3001),
      capabilities,
    };
    try {
      await this.post(this.config.get<string>('worker.mainService.registerPath')!, payload);
      this.registered = true;
      this.logger.log(`Worker registered as ${this.workerId}`);
      await this.sendHeartbeat();
      this.startHeartbeat();
    } catch (error: any) {
      this.logger.warn(
        `Failed to register worker ${this.workerId}: ${error?.message ?? error}`,
      );
      throw error;
    }
  }

  reportFailure(taskId: string, error: Error) {
    this.logger.error(`Task ${taskId} failed`, error.stack || error.message);
  }

  onModuleDestroy(): void {
    this.stopHeartbeat();
    if (this.registered) {
      void this.deregister().catch((error) =>
        this.logger.warn(`Failed to deregister worker ${this.workerId}: ${error.message}`),
      );
    }
  }

  private shouldRegister(): boolean {
    if (process.env.NODE_ENV === 'test') {
      return false;
    }
    const enabled = this.config.get<boolean>('worker.mainService.enabled', true);
    return Boolean(this.baseUrl && enabled);
  }

  private async post(path: string, payload: any) {
    const url = this.composeUrl(path);
    await axios.post(url, payload, { timeout: 5000 });
  }

  private startHeartbeat(): void {
    const interval = this.config.get<number>('worker.heartbeat.intervalMs', 10000);
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch((error) =>
        this.logger.warn(`Heartbeat failed for ${this.workerId}: ${error.message}`),
      );
    }, interval);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.registered) {
      return;
    }
    const runningTasks = this.taskStatusStore.getRunningTasks();
    const maxConcurrent = this.config.get<number>('worker.capabilities.maxConcurrentTasks', 1);
    const payload: WorkerHeartbeatDto = {
      workerId: this.workerId,
      status:
        runningTasks >= maxConcurrent ? 'overloaded' : this.taskStatusStore.getAggregatedStatus(),
      currentLoad: runningTasks,
      metrics: this.taskStatusStore.getMetricsSnapshot(),
    };
    await this.post(this.config.get<string>('worker.mainService.heartbeatPath')!, payload);
  }

  private async deregister(): Promise<void> {
    const payload: WorkerDeregisterDto = {
      workerId: this.workerId,
      reason: 'shutdown',
    };
    await this.post(this.config.get<string>('worker.mainService.deregisterPath')!, payload);
  }

  private composeUrl(path: string): string {
    if (!this.baseUrl) {
      throw new Error('MAIN_SERVICE_URL is not configured');
    }
    const base = this.baseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  private get baseUrl(): string | undefined {
    return this.config.get<string>('worker.mainService.url');
  }

  private getCapabilities(): WorkerCapabilitiesDto {
    const capabilities = this.config.get<WorkerCapabilitiesDto>('worker.capabilities');
    if (!capabilities) {
      throw new Error('worker.capabilities is not configured');
    }
    return capabilities;
  }
}
