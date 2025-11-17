import { Module } from '@nestjs/common';
import { ServiceRegistryService } from './service-registry.service';
import { WorkerRegistryController } from './worker-registry.controller';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [MonitoringModule],
  providers: [ServiceRegistryService],
  controllers: [WorkerRegistryController],
  exports: [ServiceRegistryService],
})
export class ServiceRegistryModule {}
