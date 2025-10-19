import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatasetEntity } from './entities/dataset.entity';
import { ImportTaskEntity } from './entities/import-task.entity';
import { DatasetBatchEntity } from './entities/dataset-batch.entity';
import { TradingDataService } from './trading-data.service';
import { DatasetsController } from './controllers/datasets.controller';
import { ImportsController } from './controllers/imports.controller';
import { ImportProcessingService } from './services/import-processing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DatasetEntity, ImportTaskEntity, DatasetBatchEntity]),
  ],
  providers: [TradingDataService, ImportProcessingService],
  controllers: [DatasetsController, ImportsController],
  exports: [TradingDataService],
})
export class TradingDataModule {}
