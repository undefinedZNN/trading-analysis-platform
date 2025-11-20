import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import {
  DataProvider,
  FetchRequest,
  DataSourceConfig,
} from '../backtesting/data/providers/interfaces';
import { BarEvent } from '../backtesting/data/timeframe/interfaces';
import { ParquetDuckDBProvider } from '../backtesting/data/providers/parquet-duckdb.provider';

@Injectable()
export class ParquetDataProviderService implements DataProvider {
  readonly id = 'parquet-duckdb';
  private readonly logger = new Logger(ParquetDataProviderService.name);
  private readonly provider: ParquetDuckDBProvider;

  constructor(private readonly config: ConfigService) {
    const storageBasePath = this.config.get<string>('worker.data.storagePath');
    this.logger.log(`Parquet provider using storage path ==============================================: ${storageBasePath}`);
    const configOverrides: Partial<DataSourceConfig> = {
      storageBasePath,
      defaultBatchSize: this.config.get<number>('worker.data.defaultBatchSize'),
      defaultGapPolicy: this.config.get('worker.data.gapPolicy'),
      defaultFillMethod: this.config.get('worker.data.fillMethod'),
      defaultMaxConcurrent: this.config.get<number>('worker.data.maxConcurrent'),
    };

    this.provider = new ParquetDuckDBProvider(configOverrides);
  }

  supports(request: FetchRequest): boolean {
    return this.provider.supports(request);
  }

  fetch(request: FetchRequest): Observable<BarEvent> {
    this.logger.debug(`Fetching dataset ${request.symbol} via ParquetDuckDBProvider`);
    return this.provider.fetch(request);
  }
}
