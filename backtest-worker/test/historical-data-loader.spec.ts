import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { HistoricalDataLoader } from '../src/executor/data-loader';
import { ParquetDataProviderService } from '../src/data/parquet-data-provider.service';
import { from, Observable, throwError } from 'rxjs';
import { TaskConfigDto } from '@trading-platform/backtesting-contracts';
import { BarEvent, Timeframe } from '../src/backtesting/data/timeframe/interfaces';

const createConfig = (overrides: Record<string, any>): ConfigService =>
  ({
    get: (key: string, defaultValue?: any) =>
      key in overrides ? overrides[key] : defaultValue,
  } as ConfigService);

const baseConfigValues = {
  'worker.execution.batchSize': 2,
  'worker.execution.fallbackTotalBars': 4,
  'worker.execution.syntheticDrift': 0.0001,
  'worker.data.enableProvider': true,
  'worker.data.defaultBatchSize': 2,
  'worker.data.maxConcurrent': 1,
  'worker.data.gapPolicy': 'skip',
  'worker.data.fillMethod': 'forwardFill',
};

const sampleTask: TaskConfigDto = {
  strategyId: 's1',
  datasetId: 'BTC-USDT',
  timeframe: '1m',
  timeRange: {
    start: '2024-01-01T00:00:00.000Z',
    end: '2024-01-01T00:05:00.000Z',
  },
  parameters: {},
};

describe('HistoricalDataLoader', () => {
  it('streams bars from real provider when available', async () => {
    const provider = {
      fetch: () =>
        from<BarEvent[]>([
          {
            symbol: 'BTC-USDT',
            timestamp: '2024-01-01T00:00:00.000Z',
            open: '1',
            high: '1.2',
            low: '0.8',
            close: '1.1',
            volume: '10',
            timeframe: '1m' as Timeframe,
            source: 'test',
            sequenceId: '1',
          },
          {
            symbol: 'BTC-USDT',
            timestamp: '2024-01-01T00:01:00.000Z',
            open: '1.1',
            high: '1.3',
            low: '0.9',
            close: '1.0',
            volume: '11',
            timeframe: '1m' as Timeframe,
            source: 'test',
            sequenceId: '2',
          },
        ]),
    } as unknown as ParquetDataProviderService;

    const loader = new HistoricalDataLoader(createConfig(baseConfigValues), provider);
    const chunks: any[] = [];

    for await (const chunk of loader.stream(sampleTask)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0]).toHaveLength(2);
    expect(chunks[0][0].open).toBeCloseTo(1);
  });

  it('falls back to synthetic stream when provider fails', async () => {
    const provider = {
      fetch: () =>
        throwError(() => new Error('boom')) as Observable<BarEvent>,
    } as unknown as ParquetDataProviderService;

    const loader = new HistoricalDataLoader(createConfig(baseConfigValues), provider);
    const iterator = loader.stream(sampleTask);
    const first = await iterator.next();

    expect(first.value?.length).toBeGreaterThan(0);
  });
});
