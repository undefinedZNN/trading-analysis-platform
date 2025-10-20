import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { dataSourceOptions } from './database/typeorm.datasource';
import { TradingDataModule } from './trading-data/trading-data.module';
import { StrategyManagementModule } from './strategy-management/strategy-management.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      entities: [],
      autoLoadEntities: true,
    }),
    TradingDataModule,
    StrategyManagementModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
