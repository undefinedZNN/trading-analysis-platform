import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  WorkerRegistrationDto,
  WorkerHeartbeatDto,
  WorkerCapabilitiesDto,
} from '@trading-platform/backtesting-contracts';
import { BacktestMetricsService } from '../monitoring/backtest-metrics.service';

export type WorkerRuntimeStatus = 'idle' | 'busy' | 'overloaded' | 'down';

export interface WorkerInfo {
  workerId: string;
  host: string;
  port: number;
  baseUrl: string;
  registeredAt: number;
  lastHeartbeat: number;
  status: WorkerRuntimeStatus;
  currentLoad: number;
  capabilities: WorkerCapabilitiesDto;
  metrics?: Record<string, any>;
}

interface WorkerSelectionOptions {
  strategyId?: string;
  exclude?: Set<string>;
}

@Injectable()
export class ServiceRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(ServiceRegistryService.name);
  private readonly workers = new Map<string, WorkerInfo>();
  private readonly heartbeatTimeoutMs = 30_000;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly metrics?: BacktestMetricsService) {
    this.cleanupTimer = setInterval(() => this.cleanupExpiredWorkers(), this.heartbeatTimeoutMs);
    // 避免阻止进程退出
    this.cleanupTimer.unref?.();
  }

  register(dto: WorkerRegistrationDto): WorkerInfo {
    const baseUrl = this.buildBaseUrl(dto.host, dto.port);
    const worker: WorkerInfo = {
      workerId: dto.workerId,
      host: dto.host,
      port: dto.port,
      baseUrl,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'idle',
      currentLoad: 0,
      capabilities: dto.capabilities,
      metrics: undefined,
    };

    this.workers.set(dto.workerId, worker);
    this.logger.log(
      `Worker registered: ${dto.workerId} at ${dto.host}:${dto.port} (max ${dto.capabilities.maxConcurrentTasks})`,
    );
    this.metrics?.recordWorkerRegistered(worker.workerId);
    this.metrics?.recordWorkerHeartbeat(worker.workerId, worker.status, worker.currentLoad);
    return worker;
  }

  heartbeat(dto: WorkerHeartbeatDto): WorkerInfo | undefined {
    const worker = this.workers.get(dto.workerId);
    if (!worker) {
      this.logger.warn(`Received heartbeat from unknown worker ${dto.workerId}`);
      return undefined;
    }

    worker.lastHeartbeat = Date.now();
    worker.status = dto.status;
    worker.currentLoad = dto.currentLoad;
    worker.metrics = dto.metrics;
    this.metrics?.recordWorkerHeartbeat(worker.workerId, worker.status, worker.currentLoad);
    return worker;
  }

  deregister(workerId: string, reason?: string): boolean {
    const existed = this.workers.delete(workerId);
    if (existed) {
      this.logger.log(
        `Worker ${workerId} deregistered${reason ? ` (${reason})` : ''}`,
      );
      this.metrics?.recordWorkerDeregister(workerId);
    }
    return existed;
  }

  selectWorker(options: WorkerSelectionOptions = {}): WorkerInfo | null {
    const now = Date.now();
    const candidates = Array.from(this.workers.values()).filter((worker) => {
      if (options.exclude?.has(worker.workerId)) {
        return false;
      }
      if (now - worker.lastHeartbeat > this.heartbeatTimeoutMs) {
        worker.status = 'down';
        return false;
      }

      if (worker.status === 'down') {
        return false;
      }

      if (
        worker.status === 'overloaded' ||
        worker.currentLoad >= worker.capabilities.maxConcurrentTasks
      ) {
        return false;
      }

      if (options.strategyId && !this.supportsStrategy(worker, options.strategyId)) {
        return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => a.currentLoad - b.currentLoad);
    return candidates[0];
  }

  getWorker(workerId: string): WorkerInfo | undefined {
    return this.workers.get(workerId);
  }

  listWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  updateLoad(workerId: string, delta: number): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }
    worker.currentLoad = Math.max(0, worker.currentLoad + delta);
    worker.status =
      worker.currentLoad === 0 ? 'idle' : worker.currentLoad >= worker.capabilities.maxConcurrentTasks
        ? 'overloaded'
        : 'busy';
    worker.lastHeartbeat = Date.now();
    this.metrics?.recordWorkerLoad(workerId, worker.currentLoad, worker.status);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanupExpiredWorkers(): void {
    const now = Date.now();
    for (const [workerId, worker] of this.workers.entries()) {
      if (now - worker.lastHeartbeat > this.heartbeatTimeoutMs * 2) {
        this.workers.delete(workerId);
        this.logger.warn(`Worker ${workerId} removed due to heartbeat timeout`);
      }
    }
  }

  private buildBaseUrl(host: string, port: number): string {
    const formattedHost = host.startsWith('http') ? host : `http://${host}`;
    const hasPort = /:\d+$/.test(formattedHost);
    const sanitized = formattedHost.replace(/\/$/, '');
    return hasPort ? sanitized : `${sanitized}:${port}`;
  }

  private supportsStrategy(worker: WorkerInfo, strategyId: string): boolean {
    const list = worker.capabilities.supportedStrategies || [];
    if (list.includes('*')) {
      return true;
    }
    return list.includes(strategyId);
  }
}
