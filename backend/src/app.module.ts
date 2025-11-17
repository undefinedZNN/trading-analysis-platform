import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { dataSourceOptions } from './database/typeorm.datasource';
import { TradingDataModule } from './trading-data/trading-data.module';
import { BacktestingModule } from './backtesting/backtesting.module';
import { ServiceRegistryModule } from './backtesting/service-registry/service-registry.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      entities: [],
      autoLoadEntities: true,
    }),
    BacktestingModule,
    ServiceRegistryModule,
    TradingDataModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
