import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WorkerRegistrationService } from '../registration/worker-registration.service';

@Injectable()
export class MainServiceReporter {
  private readonly logger = new Logger(MainServiceReporter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly registration: WorkerRegistrationService,
  ) {}

  private get baseUrl(): string | undefined {
    return this.config.get<string>('worker.reporting.progressUrl');
  }

  private get resultUrl(): string | undefined {
    return this.config.get<string>('worker.reporting.resultUrl') ?? this.baseUrl;
  }

  private get enabled(): boolean {
    return this.config.get<boolean>('worker.reporting.enabled', true);
  }

  private get authToken(): string | undefined {
    return this.config.get<string>('worker.reporting.authToken');
  }

  async reportProgress(taskId: string, payload: { progress?: number; metrics?: any }) {
    if (!this.enabled) {
      return;
    }
    const base = this.baseUrl;
    if (!base) {
      return;
    }

    await this.sendWithRetry(`${base}/backtesting/tasks/${taskId}/progress`, {
      ...payload,
      workerId: this.registration.workerId,
    });
  }

  async reportResult(
    taskId: string,
    payload: { status?: string; metrics?: any; summary?: any },
  ) {
    if (!this.enabled) {
      return;
    }
    const base = this.resultUrl;
    if (!base) {
      return;
    }

    await this.sendWithRetry(`${base}/backtesting/tasks/${taskId}/result`, {
      ...payload,
      workerId: this.registration.workerId,
    });
  }

  private async sendWithRetry(url: string, payload: any, attempt = 1): Promise<void> {
    try {
      await axios.post(url, payload, {
        timeout: 5000,
        headers: this.authToken ? { 'x-worker-key': this.authToken } : undefined,
      });
    } catch (error: any) {
      if (attempt >= 3) {
        this.logger.warn(`Failed to report to ${url}: ${error?.message ?? error}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      await this.sendWithRetry(url, payload, attempt + 1);
    }
  }
}
