import { Module } from '@nestjs/common';
import { WorkerClientService } from './worker-client.service';
import { ServiceRegistryModule } from '../service-registry/service-registry.module';

@Module({
  imports: [ServiceRegistryModule],
  providers: [WorkerClientService],
  exports: [WorkerClientService],
})
export class WorkerClientModule {}
