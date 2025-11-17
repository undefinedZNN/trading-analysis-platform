import { Body, Controller, Get, Post, ValidationPipe } from '@nestjs/common';
import {
  WorkerRegistrationDto,
  WorkerHeartbeatDto,
  WorkerDeregisterDto,
} from '@trading-platform/backtesting-contracts';
import { ServiceRegistryService } from './service-registry.service';

@Controller('/internal/workers')
export class WorkerRegistryController {
  constructor(private readonly registry: ServiceRegistryService) { }

  @Post('register')
  register(@Body(new ValidationPipe({ transform: true })) body: WorkerRegistrationDto) {
    console.log('任务注册', body.workerId, body.host, body.port, body.capabilities);
    return this.registry.register(body);
  }

  @Post('heartbeat')
  heartbeat(@Body(new ValidationPipe({ transform: true })) body: WorkerHeartbeatDto) {
    console.log('任务心跳', body.workerId, body.status, body.currentLoad);
    const worker = this.registry.heartbeat(body);
    return worker
      ? { workerId: worker.workerId, status: worker.status, currentLoad: worker.currentLoad }
      : { workerId: body.workerId, status: 'unknown' };
  }

  @Post('deregister')
  deregister(@Body(new ValidationPipe({ transform: true })) body: WorkerDeregisterDto) {
    const removed = this.registry.deregister(body.workerId, body.reason);
    return { workerId: body.workerId, removed };
  }

  @Get()
  list() {
    return this.registry.listWorkers();
  }
}
