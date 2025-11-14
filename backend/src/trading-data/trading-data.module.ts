import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatasetEntity } from './entities/dataset.entity';
import { ImportTaskEntity } from './entities/import-task.entity';
import { DatasetBatchEntity } from './entities/dataset-batch.entity';
import { DatasetAggregationEntity } from './entities/dataset-aggregation.entity';
import { AggregationTaskEntity } from './entities/aggregation-task.entity';
import { TradingDataService } from './trading-data.service';
import { DatasetsController } from './controllers/datasets.controller';
import { ImportsController } from './controllers/imports.controller';
import { AggregationsController } from './controllers/aggregations.controller';
import { ImportProcessingService } from './services/import-processing.service';
import { DataAggregationService } from './services/data-aggregation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DatasetEntity,
      ImportTaskEntity,
      DatasetBatchEntity,
      DatasetAggregationEntity,
      AggregationTaskEntity,
    ]),
  ],
  providers: [TradingDataService, ImportProcessingService, DataAggregationService],
  controllers: [DatasetsController, ImportsController, AggregationsController],
  exports: [TradingDataService, DataAggregationService],
})
export class TradingDataModule {}
