# 服务隔离方案

## 🎯 目标

将回测执行从主服务中分离，形成独立的 Worker 服务，实现：
- 资源隔离（内存、CPU）
- 故障隔离（Worker 崩溃不影响主服务）
- 水平扩展（多 Worker 实例）

## 🏗️ 技术方案

### 方案选择：独立 Node.js 进程 + HTTP 通信

#### 为什么选择独立进程？

**对比分析**：

| 方案 | 优点 | 缺点 | 适用场景 |
|-----|------|------|---------|
| **Worker Threads** | • 共享内存<br>• 启动快<br>• 通信效率高 | • 内存隔离不完全<br>• 无法独立部署 | 计算密集型，单机部署 |
| **Child Process** | • 进程隔离<br>• 崩溃不影响主进程 | • 启动慢<br>• 通信开销大 | 需要隔离，单机部署 |
| **独立服务** | • 完全隔离<br>• 可独立部署<br>• 易于扩展 | • 网络开销<br>• 复杂度较高 | 分布式部署，生产环境 ✅ |
| **容器化** | • 资源限制<br>• 编排能力 | • 运维复杂<br>• 非必需 | 大规模集群 |

**结论**：选择 **独立 Node.js 服务 + HTTP 通信**
- ✅ 满足隔离需求
- ✅ 可以后续平滑升级到容器化
- ✅ 运维简单（不需要 Docker/K8s）
- ✅ 调试方便

## 📁 项目结构

```
trading-analysis-platform/
├── backend/                          # 主服务
│   ├── src/
│   │   ├── backtesting/
│   │   │   ├── orchestrator/        # 回测编排器
│   │   │   ├── worker-client/       # Worker 客户端（新增）
│   │   │   └── service-registry/    # 服务注册（新增）
│   │   └── ...
│   └── package.json
│
├── backtest-worker/                  # Worker 服务（新增）
│   ├── src/
│   │   ├── server.ts                # HTTP 服务器
│   │   ├── executor/                # 执行引擎
│   │   │   ├── executor.ts
│   │   │   ├── data-loader.ts
│   │   │   ├── memory-manager.ts
│   │   │   └── progress-reporter.ts
│   │   ├── strategies/              # 策略执行器
│   │   └── config/
│   ├── package.json
│   └── tsconfig.json
│
└── scripts/
    ├── start-workers.sh             # 启动多个 Worker
    └── stop-workers.sh              # 停止所有 Worker
```

## 🔧 实现细节

### 1. Worker 服务实现

#### 技术栈对齐（main.ts + worker.module.ts）
```typescript
// backtest-worker/src/main.ts
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule, { bufferLogs: true });
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('worker.server.port', 3001);

  await app.listen(port);
}
bootstrap();
```

```typescript
// backtest-worker/src/worker.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import workerConfig from './config/worker.config';
import { TasksController } from './controllers/tasks.controller';
import { HealthController } from './controllers/health.controller';
import { BacktestExecutor } from './executor/executor';
import { WorkerRegistrationService } from './registration/worker-registration.service';
import { TaskStatusStore } from './executor/task-status.store';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [workerConfig] }),
    HttpModule,
  ],
  controllers: [TasksController, HealthController],
  providers: [BacktestExecutor, WorkerRegistrationService, TaskStatusStore],
})
export class WorkerModule {}
```

> Worker 服务沿用 NestJS 模块化、依赖注入、拦截器、异常过滤器等能力，可直接复用主服务里的监控、日志、Tracing Middleware，降低跨服务调试成本。

#### 任务控制器（tasks.controller.ts）
```typescript
// backtest-worker/src/controllers/tasks.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BacktestExecutor } from '../executor/executor';
import { WorkerRegistrationService } from '../registration/worker-registration.service';
import { ExecuteTaskDto, TaskStatusDto } from '@trading-platform/backtesting-contracts';

@Controller()
export class TasksController {
  constructor(
    private readonly executor: BacktestExecutor,
    private readonly registration: WorkerRegistrationService,
  ) {}

  @Post('execute')
  async execute(@Body() body: ExecuteTaskDto) {
    const { taskId, config } = body;

    this.registration.ensureRegistered();
    this.executor.execute(taskId, config).catch(error => {
      this.registration.reportFailure(taskId, error);
    });

    return {
      taskId,
      workerId: this.registration.workerId,
      status: 'accepted',
    };
  }

  @Post('tasks/:taskId/cancel')
  cancel(@Param('taskId') taskId: string) {
    this.executor.cancel(taskId);
    return { taskId, status: 'cancelled' };
  }

  @Get('tasks/:taskId/status')
  getStatus(@Param('taskId') taskId: string): TaskStatusDto {
    return this.executor.getTaskStatus(taskId);
  }
}
```

状态接口遵循与主服务一致的 DTO（`TaskStatusDto`），便于 `worker-client` 统一消费，也方便 CLI/管理后台直接查询 Worker 的实时状态。

#### Worker 注册（registration.ts）
```typescript
// backtest-worker/src/registration/worker-registration.service.ts
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskStatusStore } from '../executor/task-status.store';
import { catchError } from 'rxjs/operators';
import { EMPTY, firstValueFrom } from 'rxjs';

@Injectable()
export class WorkerRegistrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRegistrationService.name);
  private heartbeatTimer?: NodeJS.Timeout;
  readonly workerId = this.config.get<string>('worker.identity', `worker-${process.pid}`);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly taskStatusStore: TaskStatusStore,
  ) {}

  async onModuleInit() {
    await this.register();
    this.startHeartbeat();
  }

  onModuleDestroy() {
    this.stopHeartbeat();
    return this.unregister();
  }

  ensureRegistered() {
    if (!this.heartbeatTimer) {
      this.startHeartbeat();
    }
  }

  reportFailure(taskId: string, error: Error) {
    this.taskStatusStore.fail(taskId, error);
  }

  private async register() {
    await firstValueFrom(
      this.http.post(
        `${this.config.get<string>('worker.mainServiceUrl')}/api/internal/workers/register`,
        {
          workerId: this.workerId,
          host: this.config.get<string>('worker.server.host'),
          port: this.config.get<number>('worker.server.port'),
          capabilities: this.config.get('worker.capabilities'),
        },
      ),
    );
    this.logger.log(`Worker ${this.workerId} registered`);
  }

  private startHeartbeat() {
    const interval = this.config.get<number>('worker.heartbeat.intervalMs', 10000);
    this.heartbeatTimer = setInterval(() => {
      firstValueFrom(
        this.http.post(
          `${this.config.get<string>('worker.mainServiceUrl')}/api/internal/workers/${this.workerId}/heartbeat`,
          {
            status: this.taskStatusStore.getAggregatedStatus(),
            currentLoad: this.taskStatusStore.getRunningTasks(),
            metrics: this.taskStatusStore.getMetricsSnapshot(),
          },
        ).pipe(
          catchError(error => {
            this.logger.error('Heartbeat failed', error?.stack || error);
            return EMPTY;
          }),
        ),
      );
    }, interval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private unregister() {
    return firstValueFrom(
      this.http.delete(
        `${this.config.get<string>('worker.mainServiceUrl')}/api/internal/workers/${this.workerId}`,
      ),
    ).catch(error => {
      this.logger.warn(`Failed to unregister: ${error.message}`);
    });
  }
}
```

#### 任务状态存储（task-status.store.ts）
```typescript
// backtest-worker/src/executor/task-status.store.ts
import { Injectable } from '@nestjs/common';
import { TaskStatusDto } from '@trading-platform/backtesting-contracts';

@Injectable()
export class TaskStatusStore {
  private readonly statuses = new Map<string, TaskStatusDto>();

  start(taskId: string) {
    this.statuses.set(taskId, {
      taskId,
      status: 'running',
      progress: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  update(taskId: string, patch: Partial<TaskStatusDto>) {
    const current = this.statuses.get(taskId);
    if (!current) return;
    this.statuses.set(taskId, {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  complete(taskId: string) {
    this.update(taskId, { status: 'completed', progress: 1 });
  }

  fail(taskId: string, error: Error) {
    this.update(taskId, { status: 'failed', error: error.message });
  }

  cancel(taskId: string) {
    this.update(taskId, { status: 'cancelled' });
  }

  getTaskStatus(taskId: string): TaskStatusDto {
    return (
      this.statuses.get(taskId) || {
        taskId,
        status: 'pending',
        progress: 0,
        updatedAt: new Date().toISOString(),
      }
    );
  }

  getAggregatedStatus() {
    const running = Array.from(this.statuses.values()).filter(s => s.status === 'running').length;
    return running === 0 ? 'idle' : 'busy';
  }

  getRunningTasks() {
    return Array.from(this.statuses.values()).filter(s => s.status === 'running').length;
  }

  getMetricsSnapshot() {
    return {
      runningTasks: this.getRunningTasks(),
      lastUpdated: Date.now(),
    };
  }
}
```

### 2. 主服务实现

#### 服务注册表（service-registry.service.ts）
```typescript
// backend/src/backtesting/service-registry/service-registry.service.ts
import { Injectable, Logger } from '@nestjs/common';

interface WorkerInfo {
  workerId: string;
  host: string;
  port: number;
  status: 'idle' | 'busy' | 'down';
  registeredAt: number;
  lastHeartbeat: number;
  currentLoad: number;
  capabilities: {
    maxConcurrentTasks: number;
    supportedStrategies: string[];
  };
}

@Injectable()
export class ServiceRegistryService {
  private readonly logger = new Logger(ServiceRegistryService.name);
  private workers = new Map<string, WorkerInfo>();
  private cleanupTimer?: NodeJS.Timeout;
  
  constructor() {
    this.startCleanup();
  }
  
  register(workerData: Omit<WorkerInfo, 'status' | 'registeredAt' | 'lastHeartbeat' | 'currentLoad'>): void {
    const worker: WorkerInfo = {
      ...workerData,
      status: 'idle',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      currentLoad: 0,
    };
    
    this.workers.set(worker.workerId, worker);
    this.logger.log(`Worker registered: ${worker.workerId} at ${worker.host}:${worker.port}`);
  }
  
  unregister(workerId: string): void {
    this.workers.delete(workerId);
    this.logger.log(`Worker unregistered: ${workerId}`);
  }
  
  heartbeat(workerId: string, data: { status: string; currentLoad: number; metrics: any }): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastHeartbeat = Date.now();
      worker.status = data.status as any;
      worker.currentLoad = data.currentLoad;
      
      this.logger.debug(`Heartbeat from ${workerId}: ${data.status}, load: ${data.currentLoad}`);
    }
  }
  
  selectWorker(): WorkerInfo | null {
    const now = Date.now();
    const HEARTBEAT_TIMEOUT = 30000; // 30s
    
    // 找出健康且空闲的 Worker
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => {
        // 心跳超时检查
        if (now - w.lastHeartbeat > HEARTBEAT_TIMEOUT) {
          w.status = 'down';
          return false;
        }
        
        // 只选择 idle 或 busy 但未满载的
        return w.status === 'idle' || (w.status === 'busy' && w.currentLoad < w.capabilities.maxConcurrentTasks);
      })
      .sort((a, b) => a.currentLoad - b.currentLoad);
    
    return availableWorkers[0] || null;
  }
  
  getWorkerUrl(workerId: string): string | null {
    const worker = this.workers.get(workerId);
    return worker ? `http://${worker.host}:${worker.port}` : null;
  }
  
  getAllWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }
  
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const TIMEOUT = 60000; // 1 分钟
      
      for (const [workerId, worker] of this.workers.entries()) {
        if (now - worker.lastHeartbeat > TIMEOUT) {
          this.logger.warn(`Worker ${workerId} timed out, removing...`);
          this.workers.delete(workerId);
        }
      }
    }, 60000); // 每分钟清理一次
  }
  
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
```

#### Worker 客户端（worker-client.service.ts）
```typescript
// backend/src/backtesting/worker-client/worker-client.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ServiceRegistryService } from '../service-registry/service-registry.service';
import { ExecuteTaskDto, TaskStatusDto } from '@trading-platform/backtesting-contracts';

@Injectable()
export class WorkerClientService {
  private readonly logger = new Logger(WorkerClientService.name);
  
  constructor(
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly http: HttpService,
  ) {}
  
  async executeTask(taskId: string, config: any): Promise<{ workerId: string; accepted: boolean }> {
    const worker = this.serviceRegistry.selectWorker();
    
    if (!worker) {
      throw new Error('No available workers');
    }
    
    const workerUrl = this.serviceRegistry.getWorkerUrl(worker.workerId);
    
    const response = await firstValueFrom(
      this.http.post<ExecuteTaskDto>(`${workerUrl}/execute`, { taskId, config }, { timeout: 5000 }),
    );
    
    this.logger.log(`Task ${taskId} assigned to worker ${worker.workerId}`);
    
    return {
      workerId: worker.workerId,
      accepted: response.status === 201 || response.status === 202,
    };
  }
  
  async cancelTask(taskId: string, workerId: string): Promise<void> {
    const workerUrl = this.serviceRegistry.getWorkerUrl(workerId);
    
    if (!workerUrl) {
      throw new Error(`Worker ${workerId} not found`);
    }
    
    await firstValueFrom(
      this.http.post(`${workerUrl}/tasks/${taskId}/cancel`, {}, { timeout: 5000 }),
    );
  }
  
  async getTaskStatus(taskId: string, workerId: string): Promise<TaskStatusDto> {
    const workerUrl = this.serviceRegistry.getWorkerUrl(workerId);
    
    if (!workerUrl) {
      throw new Error(`Worker ${workerId} not found`);
    }
    
    const response = await firstValueFrom(
      this.http.get<TaskStatusDto>(`${workerUrl}/tasks/${taskId}/status`, { timeout: 5000 }),
    );
    
    return response.data;
  }
}
```

### 3. 契约与一致性治理

1. **共享 DTO**：回测任务、进度、状态等结构定义在 `libs/backtesting-contracts` 包中（`ExecuteTaskDto`、`TaskStatusDto`、`TaskProgressEvent` 等），主服务与 Worker 均通过 TypeScript 引用，避免 JSON 字段漂移。
2. **状态枚举**：统一 `pending/running/completed/failed/cancelled` 等状态枚举，并在任务详情页、API 响应、队列消息内复用，保障同源数据。
3. **拦截器与日志**：将主服务已有的 `RequestIdInterceptor`、`LoggingInterceptor`、异常过滤器在 `WorkerModule` 中注册，实现全局一致的 TraceId、Log 格式。
4. **指标对齐**：`TaskStatusStore` 聚合运行中的任务数量、平均耗时等指标，并通过心跳和 `/health` 接口暴露，与主服务监控面板保持一致。

## 🚀 启动与部署

### 开发环境

#### 启动脚本（scripts/start-workers.sh）
```bash
#!/bin/bash

# 启动多个 Worker 实例

MAIN_SERVICE_URL="http://localhost:3000"
NUM_WORKERS=3
START_PORT=3001

echo "Starting $NUM_WORKERS workers..."

for i in $(seq 1 $NUM_WORKERS); do
  PORT=$((START_PORT + i - 1))
  WORKER_ID="worker-$i"
  
  echo "Starting Worker $WORKER_ID on port $PORT"
  
  cd backtest-worker
  WORKER_ID=$WORKER_ID \
  PORT=$PORT \
  MAIN_SERVICE_URL=$MAIN_SERVICE_URL \
  NODE_OPTIONS="--max-old-space-size=1024" \
  npm start > "../logs/worker-$i.log" 2>&1 &
  
  echo $! > "../logs/worker-$i.pid"
  cd ..
done

echo "All workers started!"
```

#### 停止脚本（scripts/stop-workers.sh）
```bash
#!/bin/bash

# 停止所有 Worker

echo "Stopping all workers..."

for pid_file in logs/worker-*.pid; do
  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file")
    echo "Stopping worker (PID: $pid)"
    kill $pid
    rm "$pid_file"
  fi
done

echo "All workers stopped!"
```

### 生产环境

#### 使用 PM2 管理
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'main-service',
      script: 'backend/dist/main.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
    },
    {
      name: 'backtest-worker',
      script: 'backtest-worker/dist/server.js',
      instances: 3, // 启动 3 个实例
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1024',
        MAIN_SERVICE_URL: 'http://localhost:3000',
      },
    },
  ],
};
```

启动：
```bash
pm2 start ecosystem.config.js
pm2 logs
pm2 monit
```

## 🔍 监控与调试

### 日志
```typescript
// 统一日志格式
{
  timestamp: '2025-11-14T10:30:00.000Z',
  level: 'info',
  service: 'worker-1',
  taskId: 'task-123',
  message: 'Task progress: 45%',
  metrics: {
    processedBars: 450000,
    memoryMB: 320,
    throughput: 12000,
  }
}
```

### 健康检查
```bash
# 检查所有 Worker
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health

# 检查主服务注册表
curl http://localhost:3000/api/internal/workers
```

## ⚠️ 注意事项

1. **端口管理**：确保 Worker 端口不冲突
2. **网络延迟**：HTTP 通信有延迟，进度上报不宜过于频繁
3. **错误处理**：Worker 崩溃时主服务需要检测并重新分配任务
4. **资源限制**：为每个 Worker 设置合理的内存限制（如 1GB）

## ♻️ 优化要点

- **契约测试**：为 `/execute`、`/tasks/:taskId/status` 等接口编写 Pact/contract 测试，确保主服务与 Worker 的 DTO 演进保持同步。
- **配置守卫**：结合 Nest Config validation（如 `class-validator` + `Joi`）在启动阶段校验 `MAIN_SERVICE_URL`、资源阈值等配置，避免环境漂移。
- **观测性**：启用与主服务一致的 OpenTelemetry Provider，将任务 id、worker id 注入 trace/日志，方便排查跨服务链路。
- **弹性扩展**：基于 TaskStatusStore 元数据计算 Worker 实际负载，动态调整 `maxConcurrentTasks`、自动扩缩容脚本或告警阈值。

---

**下一步**：查看 [数据流式加载方案](./03-data-streaming.md)
