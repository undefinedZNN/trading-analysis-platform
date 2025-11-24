# RabbitMQ集成快速启动指南

## 🚀 5分钟快速启动

### 步骤1: 启动RabbitMQ

```bash
# 使用Docker启动RabbitMQ (推荐)
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=dev \
  -e RABBITMQ_DEFAULT_PASS=devpass \
  -e RABBITMQ_DEFAULT_VHOST=/backtest \
  rabbitmq:3-management

# 等待RabbitMQ启动 (大约10秒)
docker logs -f rabbitmq
# 看到 "Server startup complete" 表示启动成功

# 访问管理界面
# URL: http://localhost:15672
# 用户名: dev
# 密码: devpass
```

### 步骤2: 配置Backend

```bash
cd backend

# 复制环境配置
cp ../.env.rabbitmq.example .env

# 修改关键配置
cat > .env << EOF
USE_RABBITMQ=true
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_VHOST=/backtest
RABBITMQ_USERNAME=dev
RABBITMQ_PASSWORD=devpass
EOF

# 安装依赖 (如果还没安装)
npm install

# 启动Backend
npm run start:dev
```

**预期日志**:
```
[NestApplication] Nest application successfully started
[RabbitMQConnectionService] Connecting to RabbitMQ at localhost:5672...
[RabbitMQConnectionService] RabbitMQ connection established
[RabbitMQConnectionService] Exchange 'backtest' declared
[RabbitMQConnectionService] Queue 'backtest.task' declared
[BacktestMessageConsumer] All RabbitMQ consumers started successfully
```

### 步骤3: 配置并启动Worker

```bash
cd backtest-worker

# 创建环境配置
cat > .env << EOF
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_VHOST=/backtest
RABBITMQ_USERNAME=dev
RABBITMQ_PASSWORD=devpass
BACKEND_URL=http://localhost:3000
WORKER_ID=worker-01
EOF

# 激活虚拟环境
source venv/bin/activate

# 安装依赖 (如果还没安装)
pip install pika

# 创建Worker启动脚本
cat > start_rabbitmq_worker.py << 'PYTHON_EOF'
import os
import sys
import logging
import time
import traceback

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from backtrader_integration.messaging import (
    BacktestTaskConsumer,
    RabbitMQClient,
    RabbitMQConfig,
    TaskMessage,
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

# 创建RabbitMQ客户端
rabbitmq_config = RabbitMQConfig()
rabbitmq_client = RabbitMQClient(rabbitmq_config)

def handle_backtest_task(task: TaskMessage) -> bool:
    """处理回测任务"""
    try:
        logger.info(f"=" * 60)
        logger.info(f"Received task: {task.task_id}")
        logger.info(f"Strategy: {task.strategy_class_name}")
        logger.info(f"Dataset: {task.data_config.get('tradingPair')}")
        logger.info(f"=" * 60)
        
        # 1. 发送开始状态
        rabbitmq_client.send_message('backtest.status', {
            'task_id': task.task_id,
            'worker_id': os.getenv('WORKER_ID', 'worker-01'),
            'status': 'RUNNING',
            'start_time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        })
        logger.info("Status RUNNING sent")
        
        # 2. 模拟回测执行
        for i in range(5):
            time.sleep(2)
            progress = (i + 1) * 0.2
            
            # 发送进度
            rabbitmq_client.send_progress(
                task.task_id,
                progress,
                f'Processing... {int(progress * 100)}%',
                {
                    'processed_bars': int(progress * 1000),
                    'total_bars': 1000,
                    'current_date': '2023-01-01',
                }
            )
            logger.info(f"Progress: {int(progress * 100)}%")
        
        # 3. 发送完成状态
        rabbitmq_client.send_message('backtest.status', {
            'task_id': task.task_id,
            'worker_id': os.getenv('WORKER_ID', 'worker-01'),
            'status': 'COMPLETED',
            'end_time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'duration': 10,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        })
        logger.info("Status COMPLETED sent")
        
        # 4. 发送结果
        rabbitmq_client.send_result(
            task.task_id,
            'success',
            {
                'metrics': {
                    'totalReturn': 0.155,
                    'sharpeRatio': 1.2,
                    'maxDrawdown': -0.08,
                },
                'files': {
                    'trades': f'/results/{task.task_id}/trades.parquet',
                    'equity': f'/results/{task.task_id}/equity.parquet',
                },
                'stats': {
                    'processed_bars': 1000,
                    'execution_time': 10,
                },
            }
        )
        logger.info("Result sent")
        
        logger.info(f"Task {task.task_id} completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Task failed: {e}")
        logger.error(traceback.format_exc())
        
        # 发送错误
        rabbitmq_client.send_error(
            task.task_id,
            'EXECUTION_ERROR',
            str(e),
            traceback.format_exc()
        )
        return False

def handle_cancel_task(task_id: str, reason: str) -> bool:
    """处理取消任务"""
    logger.info(f"Cancelling task {task_id}: {reason}")
    # 实际实现中应该停止正在执行的任务
    return True

def main():
    """主函数"""
    logger.info("=" * 60)
    logger.info("Starting Backtest Worker (RabbitMQ Mode)")
    logger.info("=" * 60)
    
    try:
        # 创建任务消费者
        consumer = BacktestTaskConsumer()
        
        # 注册回调
        consumer.set_task_callback(handle_backtest_task)
        consumer.set_cancel_callback(handle_cancel_task)
        
        logger.info("Worker initialized successfully")
        logger.info("Waiting for tasks from RabbitMQ...")
        logger.info("Press Ctrl+C to stop")
        logger.info("=" * 60)
        
        # 开始消费 (阻塞)
        consumer.start()
        
    except KeyboardInterrupt:
        logger.info("\nShutting down worker...")
    except Exception as e:
        logger.error(f"Worker error: {e}")
        logger.error(traceback.format_exc())
    finally:
        rabbitmq_client.close()
        logger.info("Worker stopped")

if __name__ == '__main__':
    main()
PYTHON_EOF

# 启动Worker
python start_rabbitmq_worker.py
```

**预期日志**:
```
============================================================
Starting Backtest Worker (RabbitMQ Mode)
============================================================
[INFO] TaskConsumer initialized: queue=backtest.task
[INFO] Worker initialized successfully
[INFO] Waiting for tasks from RabbitMQ...
[INFO] Consumer connected: queue=backtest.task
[INFO] Started consuming messages...
```

### 步骤4: 测试端到端通信

在另一个终端创建测试任务：

```bash
curl -X POST http://localhost:3000/api/backtesting/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "taskName": "Test RabbitMQ Task",
    "strategyId": "your-strategy-id",
    "scriptVersionId": "your-version-id",
    "datasetId": 1,
    "executionConfig": {
      "initialCapital": 100000
    }
  }'
```

**预期输出**:

1. **Backend日志**:
```
[TaskExecutorService] Starting execution for task xxx
[TaskExecutorService] Mode: RabbitMQ
[RabbitMQPublisher] Task published: xxx (priority: 5)
[BacktestMessageConsumer] Received status: xxx - RUNNING
[BacktestMessageConsumer] Received progress: xxx - 20%
[BacktestMessageConsumer] Received progress: xxx - 40%
...
[BacktestMessageConsumer] Received status: xxx - COMPLETED
[BacktestMessageConsumer] Received result: xxx
```

2. **Worker日志**:
```
============================================================
Received task: xxx
Strategy: MyStrategy
Dataset: BTC-USDT
============================================================
[INFO] Status RUNNING sent
[INFO] Progress: 20%
[INFO] Progress: 40%
...
[INFO] Status COMPLETED sent
[INFO] Result sent
[INFO] Task xxx completed successfully!
```

---

## 🎛️ RabbitMQ管理界面

访问: http://localhost:15672

**用户名**: dev  
**密码**: devpass

### 监控队列

1. 点击 "Queues" 标签
2. 选择虚拟主机 "/backtest"
3. 查看队列统计:
   - `backtest.task` - 待处理任务数
   - `backtest.progress` - 进度消息
   - `backtest.result` - 结果消息

### 查看消息

1. 点击队列名称
2. 展开 "Get messages"
3. 点击 "Get Message(s)"
4. 查看消息内容

---

## 🔧 故障排查

### Worker未接收到任务

**检查1**: RabbitMQ是否运行
```bash
docker ps | grep rabbitmq
```

**检查2**: 队列中是否有消息
```bash
curl -u dev:devpass \
  http://localhost:15672/api/queues/%2Fbacktest/backtest.task
```

**检查3**: Worker配置是否正确
```bash
# 检查环境变量
echo $RABBITMQ_HOST
echo $RABBITMQ_VHOST
```

### Backend无法发布任务

**检查1**: 环境变量
```bash
echo $USE_RABBITMQ  # 应该是 true
```

**检查2**: Backend日志
```bash
# 查找错误
grep -i "rabbitmq" backend.log
```

### 消息堆积

**原因**: Worker处理速度慢

**解决**: 启动多个Worker实例
```bash
# Terminal 1
WORKER_ID=worker-01 python start_rabbitmq_worker.py

# Terminal 2
WORKER_ID=worker-02 python start_rabbitmq_worker.py

# Terminal 3
WORKER_ID=worker-03 python start_rabbitmq_worker.py
```

---

## 📝 切换回HTTP模式

如果需要切换回HTTP直接调用模式：

```bash
# Backend
export USE_RABBITMQ=false
npm run start:dev

# Worker (使用HTTP API)
python start_worker_http.py
```

---

## 🎯 总结

现在你已经成功：

✅ 启动了RabbitMQ  
✅ 配置了Backend (RabbitMQ模式)  
✅ 配置了Worker (消费任务)  
✅ 完成了端到端测试

**下一步**:
- 集成真实的回测执行逻辑
- 添加监控和告警
- 部署到生产环境

---

**需要帮助?** 查看 [RABBITMQ_INTEGRATION.md](./RABBITMQ_INTEGRATION.md) 获取详细文档


