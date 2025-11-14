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

#### 服务器入口（server.ts）
```typescript
// backtest-worker/src/server.ts
import express from 'express';
import { BacktestExecutor } from './executor/executor';
import { WorkerRegistration } from './registration';

const app = express();
app.use(express.json());

const config = {
  workerId: process.env.WORKER_ID || `worker-${process.pid}`,
  port: parseInt(process.env.PORT || '3001'),
  mainServiceUrl: process.env.MAIN_SERVICE_URL || 'http://localhost:3000',
};

const executor = new BacktestExecutor(config);
const registration = new WorkerRegistration(config);

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    workerId: config.workerId,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    tasksRunning: executor.getRunningTaskCount(),
  });
});

// 执行回测任务
app.post('/execute', async (req, res) => {
  const { taskId, config: taskConfig } = req.body;
  
  try {
    // 立即返回，异步执行
    res.status(202).json({
      taskId,
      status: 'accepted',
      workerId: config.workerId,
    });
    
    // 异步执行
    executor.execute(taskId, taskConfig).catch(error => {
      console.error(`Task ${taskId} failed:`, error);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 取消任务
app.post('/tasks/:taskId/cancel', async (req, res) => {
  const { taskId } = req.params;
  
  await executor.cancel(taskId);
  
  res.json({
    taskId,
    status: 'cancelled',
  });
});

// 获取任务状态
app.get('/tasks/:taskId/status', (req, res) => {
  const { taskId } = req.params;
  const status = executor.getTaskStatus(taskId);
  
  res.json(status);
});

// 启动服务器
app.listen(config.port, async () => {
  console.log(`Worker ${config.workerId} listening on port ${config.port}`);
  
  // 向主服务注册
  try {
    await registration.register();
    console.log(`Worker registered with main service`);
    
    // 启动心跳
    registration.startHeartbeat();
  } catch (error) {
    console.error('Failed to register with main service:', error);
    process.exit(1);
  }
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // 注销服务
  await registration.unregister();
  
  // 等待任务完成
  await executor.waitForTasksToComplete(30000); // 30s 超时
  
  process.exit(0);
});
```

#### Worker 注册（registration.ts）
```typescript
// backtest-worker/src/registration.ts
import axios from 'axios';

export class WorkerRegistration {
  private heartbeatTimer?: NodeJS.Timeout;
  
  constructor(private config: {
    workerId: string;
    port: number;
    mainServiceUrl: string;
  }) {}
  
  async register(): Promise<void> {
    await axios.post(
      `${this.config.mainServiceUrl}/api/internal/workers/register`,
      {
        workerId: this.config.workerId,
        host: 'localhost', // TODO: 自动检测
        port: this.config.port,
        capabilities: {
          maxConcurrentTasks: 1,
          supportedStrategies: ['*'],
        },
      }
    );
  }
  
  startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await axios.post(
          `${this.config.mainServiceUrl}/api/internal/workers/${this.config.workerId}/heartbeat`,
          {
            status: this.getStatus(),
            currentLoad: this.getCurrentLoad(),
            metrics: this.getMetrics(),
          }
        );
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    }, 10000); // 10s
  }
  
  async unregister(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    try {
      await axios.delete(
        `${this.config.mainServiceUrl}/api/internal/workers/${this.config.workerId}`
      );
    } catch (error) {
      console.error('Failed to unregister:', error);
    }
  }
  
  private getStatus(): string {
    // 'idle' | 'busy' | 'overloaded'
    const load = this.getCurrentLoad();
    if (load === 0) return 'idle';
    if (load < 1) return 'busy';
    return 'overloaded';
  }
  
  private getCurrentLoad(): number {
    // TODO: 实际实现
    return 0;
  }
  
  private getMetrics() {
    const usage = process.memoryUsage();
    return {
      cpu: process.cpuUsage(),
      memory: Math.round(usage.heapUsed / 1024 / 1024), // MB
      uptime: process.uptime(),
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
import axios from 'axios';
import { ServiceRegistryService } from '../service-registry/service-registry.service';

@Injectable()
export class WorkerClientService {
  private readonly logger = new Logger(WorkerClientService.name);
  
  constructor(
    private serviceRegistry: ServiceRegistryService,
  ) {}
  
  async executeTask(taskId: string, config: any): Promise<{ workerId: string; accepted: boolean }> {
    // 选择一个 Worker
    const worker = this.serviceRegistry.selectWorker();
    
    if (!worker) {
      throw new Error('No available workers');
    }
    
    const workerUrl = this.serviceRegistry.getWorkerUrl(worker.workerId);
    
    try {
      // 发送任务到 Worker
      const response = await axios.post(
        `${workerUrl}/execute`,
        { taskId, config },
        { timeout: 5000 }
      );
      
      this.logger.log(`Task ${taskId} assigned to worker ${worker.workerId}`);
      
      return {
        workerId: worker.workerId,
        accepted: response.status === 202,
      };
    } catch (error) {
      this.logger.error(`Failed to assign task ${taskId} to worker ${worker.workerId}:`, error);
      throw error;
    }
  }
  
  async cancelTask(taskId: string, workerId: string): Promise<void> {
    const workerUrl = this.serviceRegistry.getWorkerUrl(workerId);
    
    if (!workerUrl) {
      throw new Error(`Worker ${workerId} not found`);
    }
    
    await axios.post(
      `${workerUrl}/tasks/${taskId}/cancel`,
      {},
      { timeout: 5000 }
    );
  }
  
  async getTaskStatus(taskId: string, workerId: string): Promise<any> {
    const workerUrl = this.serviceRegistry.getWorkerUrl(workerId);
    
    if (!workerUrl) {
      throw new Error(`Worker ${workerId} not found`);
    }
    
    const response = await axios.get(
      `${workerUrl}/tasks/${taskId}/status`,
      { timeout: 5000 }
    );
    
    return response.data;
  }
}
```

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

---

**下一步**：查看 [数据流式加载方案](./03-data-streaming.md)

