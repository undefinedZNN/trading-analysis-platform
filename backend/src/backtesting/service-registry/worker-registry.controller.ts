import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ValidationPipe,
  NotFoundException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  WorkerRegistrationDto,
  WorkerHeartbeatDto,
  WorkerDeregisterDto,
} from '@trading-platform/backtesting-contracts';
import { ServiceRegistryService } from './service-registry.service';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

@ApiTags('Worker Management')
@Controller('/internal/workers')
export class WorkerRegistryController {
  private readonly logger = new Logger(WorkerRegistryController.name);

  constructor(private readonly registry: ServiceRegistryService) {}

  @Post('register')
  @ApiOperation({ summary: '注册Worker节点' })
  @ApiResponse({ status: 201, description: 'Worker注册成功' })
  register(@Body(new ValidationPipe({ transform: true })) body: WorkerRegistrationDto) {
    this.logger.log(`Worker注册: ${body.workerId} at ${body.host}:${body.port}`);
    return this.registry.register(body);
  }

  @Post('heartbeat')
  @ApiOperation({ summary: 'Worker心跳' })
  @ApiResponse({ status: 200, description: '心跳处理成功' })
  heartbeat(@Body(new ValidationPipe({ transform: true })) body: WorkerHeartbeatDto) {
    const worker = this.registry.heartbeat(body);
    return worker
      ? { workerId: worker.workerId, status: worker.status, currentLoad: worker.currentLoad }
      : { workerId: body.workerId, status: 'unknown' };
  }

  @Post('deregister')
  @ApiOperation({ summary: '注销Worker节点' })
  @ApiResponse({ status: 200, description: 'Worker注销成功' })
  deregister(@Body(new ValidationPipe({ transform: true })) body: WorkerDeregisterDto) {
    this.logger.log(`Worker注销: ${body.workerId}, 原因: ${body.reason || '未指定'}`);
    const removed = this.registry.deregister(body.workerId, body.reason);
    return { workerId: body.workerId, removed };
  }

  @Get()
  @ApiOperation({ summary: '查询所有Worker节点' })
  @ApiOkResponse({ description: 'Worker列表' })
  list() {
    return this.registry.listWorkers();
  }

  @Get(':workerId')
  @ApiOperation({ summary: '查询单个Worker节点详情' })
  @ApiParam({ name: 'workerId', description: 'Worker ID' })
  @ApiOkResponse({ description: 'Worker详情' })
  @ApiNotFoundResponse({ description: 'Worker不存在' })
  getWorker(@Param('workerId') workerId: string) {
    const worker = this.registry.getWorker(workerId);
    if (!worker) {
      throw new NotFoundException(`Worker ${workerId} not found`);
    }
    return worker;
  }

  @Post(':workerId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '启动Worker节点' })
  @ApiParam({ name: 'workerId', description: 'Worker ID' })
  @ApiOkResponse({ description: 'Worker启动命令已发送' })
  @ApiNotFoundResponse({ description: 'Worker不存在' })
  async startWorker(@Param('workerId') workerId: string) {
    const worker = this.registry.getWorker(workerId);
    if (!worker) {
      throw new NotFoundException(`Worker ${workerId} not found`);
    }

    this.logger.log(`发送启动命令到Worker: ${workerId}`);

    // 调用Worker的启动接口
    try {
      const response = await fetch(`${worker.baseUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Worker responded with status ${response.status}`);
      }

      return {
        workerId,
        status: 'start_command_sent',
        message: 'Worker启动命令已发送',
      };
    } catch (error) {
      this.logger.error(`启动Worker ${workerId} 失败: ${error.message}`);
      throw new Error(`Failed to start worker: ${error.message}`);
    }
  }

  @Post(':workerId/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '停止Worker节点' })
  @ApiParam({ name: 'workerId', description: 'Worker ID' })
  @ApiOkResponse({ description: 'Worker停止命令已发送' })
  @ApiNotFoundResponse({ description: 'Worker不存在' })
  async stopWorker(@Param('workerId') workerId: string) {
    const worker = this.registry.getWorker(workerId);
    if (!worker) {
      throw new NotFoundException(`Worker ${workerId} not found`);
    }

    this.logger.log(`发送停止命令到Worker: ${workerId}`);

    // 调用Worker的停止接口
    try {
      const response = await fetch(`${worker.baseUrl}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Worker responded with status ${response.status}`);
      }

      return {
        workerId,
        status: 'stop_command_sent',
        message: 'Worker停止命令已发送',
      };
    } catch (error) {
      this.logger.error(`停止Worker ${workerId} 失败: ${error.message}`);
      throw new Error(`Failed to stop worker: ${error.message}`);
    }
  }

  @Get(':workerId/health')
  @ApiOperation({ summary: '检查Worker节点健康状态' })
  @ApiParam({ name: 'workerId', description: 'Worker ID' })
  @ApiOkResponse({ description: 'Worker健康状态' })
  @ApiNotFoundResponse({ description: 'Worker不存在' })
  async checkHealth(@Param('workerId') workerId: string) {
    const worker = this.registry.getWorker(workerId);
    if (!worker) {
      throw new NotFoundException(`Worker ${workerId} not found`);
    }

    const now = Date.now();
    const heartbeatAge = now - worker.lastHeartbeat;
    const isHealthy = heartbeatAge < 30000 && worker.status !== 'down';

    return {
      workerId,
      healthy: isHealthy,
      status: worker.status,
      currentLoad: worker.currentLoad,
      lastHeartbeat: new Date(worker.lastHeartbeat).toISOString(),
      heartbeatAge,
      registeredAt: new Date(worker.registeredAt).toISOString(),
      uptime: now - worker.registeredAt,
    };
  }

  @Get(':workerId/metrics')
  @ApiOperation({ summary: '获取Worker节点性能指标' })
  @ApiParam({ name: 'workerId', description: 'Worker ID' })
  @ApiOkResponse({ description: 'Worker性能指标' })
  @ApiNotFoundResponse({ description: 'Worker不存在' })
  getMetrics(@Param('workerId') workerId: string) {
    const worker = this.registry.getWorker(workerId);
    if (!worker) {
      throw new NotFoundException(`Worker ${workerId} not found`);
    }

    const now = Date.now();
    const uptime = now - worker.registeredAt;
    const loadPercentage =
      worker.capabilities.maxConcurrentTasks > 0
        ? (worker.currentLoad / worker.capabilities.maxConcurrentTasks) * 100
        : 0;

    return {
      workerId,
      status: worker.status,
      currentLoad: worker.currentLoad,
      maxLoad: worker.capabilities.maxConcurrentTasks,
      loadPercentage: Math.round(loadPercentage * 100) / 100,
      uptime,
      lastHeartbeat: new Date(worker.lastHeartbeat).toISOString(),
      capabilities: worker.capabilities,
      customMetrics: worker.metrics || {},
    };
  }
}
