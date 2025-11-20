import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskConfigDto } from '@trading-platform/backtesting-contracts';
import { HistoricalBar } from './interfaces';
import { ParquetDataProviderService } from '../data/parquet-data-provider.service';
import { FetchRequest } from '../backtesting/data/providers/interfaces';
import { Timeframe } from '../backtesting/data/timeframe/interfaces';

const ONE_MINUTE = 60 * 1000;

@Injectable()
export class HistoricalDataLoader {
  private readonly logger = new Logger(HistoricalDataLoader.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataProvider: ParquetDataProviderService,
  ) {}

  estimateTotalBars(config: TaskConfigDto): number {
    const timeframeMs = this.getTimeframeMs(config.timeframe);
    const start = Date.parse(config.timeRange.start);
    const end = Date.parse(config.timeRange.end);

    if (Number.isNaN(start) || Number.isNaN(end) || !timeframeMs) {
      return this.configService.get<number>('worker.execution.fallbackTotalBars', 10_000);
    }

    return Math.max(1, Math.floor((end - start) / timeframeMs));
  }

  async *stream(config: TaskConfigDto, signal?: AbortSignal): AsyncGenerator<HistoricalBar[]> {
    const preferProvider = this.configService.get<boolean>('worker.data.enableProvider', true);

    if (preferProvider) {
      try {
        for await (const chunk of this.streamFromProvider(config, signal)) {
          yield chunk;
        }
        return;
      } catch (error) {
        this.logger.warn(
          `Falling back to synthetic loader for dataset ${config.datasetId}: ${
            (error as Error).message
          }`,
        );
      }
    }

    yield* this.syntheticStream(config, signal);
  }

  private async *streamFromProvider(config: TaskConfigDto, signal?: AbortSignal) {
    const request = this.buildFetchRequest(config);
    this.logger.log(`Stream from provider request ==============================================: ${JSON.stringify(request)}`);
    const chunkSize = this.configService.get<number>('worker.execution.batchSize', 20_000);
    const buffer: HistoricalBar[] = [];
    let completed = false;
    let error: Error | null = null;

    const subscription = this.dataProvider.fetch(request).subscribe({
      next: (event) => {
        buffer.push({
          timestamp: event.timestamp,
          open: parseFloat(event.open),
          high: parseFloat(event.high),
          low: parseFloat(event.low),
          close: parseFloat(event.close),
          volume: parseFloat(event.volume),
        });
      },
      error: (err) => {
        error = err;
      },
      complete: () => {
        completed = true;
      },
    });

    try {
      while (!completed || buffer.length > 0) {
        this.throwIfAborted(signal);
        if (error) {
          throw error;
        }

        if (buffer.length >= chunkSize || (completed && buffer.length > 0)) {
          yield buffer.splice(0, chunkSize);
        } else {
          await this.delay(10);
        }
      }
    } finally {
      subscription.unsubscribe();
    }
  }

  private async *syntheticStream(config: TaskConfigDto, signal?: AbortSignal) {
    const batchSize = this.configService.get<number>('worker.execution.batchSize', 20_000);
    const timeframeMs = this.getTimeframeMs(config.timeframe) || ONE_MINUTE;
    const totalBars = this.estimateTotalBars(config);

    let generated = 0;
    let currentTimestamp = Date.parse(config.timeRange.start);
    let lastClose = 100;

    while (generated < totalBars) {
      this.throwIfAborted(signal);
      const chunkSize = Math.min(batchSize, totalBars - generated);
      const chunk: HistoricalBar[] = [];

      for (let i = 0; i < chunkSize; i++) {
        const open = this.nextPrice(lastClose);
        const high = open + Math.random() * 0.5;
        const low = open - Math.random() * 0.5;
        const close = low + Math.random() * (high - low);
        lastClose = close;

        chunk.push({
          timestamp: new Date(currentTimestamp).toISOString(),
          open,
          high,
          low,
          close,
          volume: 10 + Math.random() * 5,
        });

        currentTimestamp += timeframeMs;
      }

      generated += chunk.length;
      yield chunk;
    }
  }

  private buildFetchRequest(config: TaskConfigDto): FetchRequest {
    return {
      symbol: config.datasetId,
      start: config.timeRange.start,
      end: config.timeRange.end,
      baseTimeframe: (config.timeframe as Timeframe) || ('1m' as Timeframe),
      batchSize: this.configService.get<number>('worker.data.defaultBatchSize'),
      maxConcurrent: this.configService.get<number>('worker.data.maxConcurrent'),
      gapPolicy: this.configService.get('worker.data.gapPolicy'),
      fillMethod: this.configService.get('worker.data.fillMethod'),
    };
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getTimeframeMs(timeframe: string): number | undefined {
    const match = timeframe?.match(/^(\d+)([smhd])$/);
    if (!match) {
      return undefined;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * ONE_MINUTE;
      case 'h':
        return value * 60 * ONE_MINUTE;
      case 'd':
        return value * 24 * 60 * ONE_MINUTE;
      default:
        return undefined;
    }
  }

  private throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
      const error = new Error('Task cancelled');
      error.name = 'AbortError';
      throw error;
    }
  }

  private nextPrice(previous: number): number {
    const drift = this.configService.get<number>('worker.execution.syntheticDrift', 0.01);
    const noise = (Math.random() - 0.5) * 0.2;

    return Math.max(0.1, previous + previous * drift + noise);
  }
}
