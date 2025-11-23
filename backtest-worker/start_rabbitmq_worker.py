#!/usr/bin/env python3
"""
RabbitMQ Worker - 完整的任务消费和执行Worker

功能:
1. 注册Worker到Backend
2. 消费RabbitMQ任务队列
3. 执行回测任务
4. 发送进度/结果/心跳到Backend
"""

import sys
import os
import time
import json
import logging
import signal
import traceback
from datetime import datetime

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# 导入RabbitMQ客户端
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

# 全局变量
rabbitmq_client: RabbitMQClient = None
task_consumer: BacktestTaskConsumer = None
worker_id = os.getenv('WORKER_ID', 'worker-python-01')
is_running = True


def handle_shutdown(signum, frame):
    """处理退出信号"""
    global is_running
    logger.info("Received shutdown signal, stopping worker...")
    is_running = False


def handle_backtest_task(task: TaskMessage) -> bool:
    """
    处理回测任务
    
    Args:
        task: 任务消息
    
    Returns:
        是否成功处理
    """
    try:
        logger.info("=" * 80)
        logger.info(f"📋 接收到回测任务: {task.task_id}")
        logger.info(f"   策略类: {task.strategy_class_name}")
        logger.info(f"   数据集: {task.data_config.get('tradingPair')} / {task.data_config.get('granularity')}")
        logger.info(f"   初始资金: {task.execution_config.get('initialCapital')}")
        logger.info("=" * 80)
        
        # 1. 发送开始状态
        logger.info(f"🚀 开始执行任务: {task.task_id}")
        rabbitmq_client.send_message('backtest.status', {
            'task_id': task.task_id,
            'worker_id': worker_id,
            'status': 'RUNNING',
            'start_time': datetime.utcnow().isoformat() + 'Z',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        }, 'status.change')
        
        # 2. 模拟执行过程（实际应该调用Backtrader执行）
        logger.info("⚙️ 执行回测中...")
        
        # 模拟执行5步，每步2秒
        steps = 5
        for i in range(steps):
            if not is_running:
                logger.warning("Worker stopping, aborting task")
                return False
            
            time.sleep(2)
            progress = (i + 1) / steps
            
            # 发送进度
            rabbitmq_client.send_progress(
                task_id=task.task_id,
                progress=progress,
                message=f'Processing... {int(progress * 100)}%',
                details={
                    'processed_bars': int(progress * 10000),
                    'total_bars': 10000,
                    'current_date': '2023-01-01',
                    'worker_id': worker_id,
                }
            )
            logger.info(f"📊 进度: {int(progress * 100)}%")
        
        # 3. 发送完成状态
        logger.info(f"✅ 任务完成: {task.task_id}")
        rabbitmq_client.send_message('backtest.status', {
            'task_id': task.task_id,
            'worker_id': worker_id,
            'status': 'COMPLETED',
            'end_time': datetime.utcnow().isoformat() + 'Z',
            'duration': 10,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        }, 'status.change')
        
        # 4. 发送结果
        result_data = {
            'task_id': task.task_id,
            'worker_id': worker_id,
            'status': 'COMPLETED',
            'metrics': {
                'totalReturn': 0.155,
                'sharpeRatio': 1.25,
                'maxDrawdown': -0.082,
                'totalTrades': 45,
                'winRate': 0.62,
            },
            'files': {
                'trades': f'/results/{task.task_id}/trades.parquet',
                'equity': f'/results/{task.task_id}/equity.parquet',
            },
            'stats': {
                'processed_bars': 10000,
                'execution_time': 10,
                'peak_memory': 125.5,
            },
            'completed_at': datetime.utcnow().isoformat() + 'Z',
        }
        
        rabbitmq_client.send_message('backtest.result', result_data, 'result.complete')
        logger.info("📤 结果已发送")
        
        logger.info("=" * 80)
        return True
        
    except Exception as e:
        logger.error(f"❌ 任务执行失败: {e}")
        logger.error(traceback.format_exc())
        
        # 发送错误
        rabbitmq_client.send_error(
            task_id=task.task_id,
            error_code='EXECUTION_ERROR',
            error_message=str(e),
            stack_trace=traceback.format_exc()
        )
        return False


def handle_cancel_task(task_id: str, reason: str) -> bool:
    """
    处理取消任务
    
    Args:
        task_id: 任务ID
        reason: 取消原因
    
    Returns:
        是否成功处理
    """
    logger.info(f"⏹️ 取消任务: {task_id}, 原因: {reason}")
    # TODO: 实际实现任务取消逻辑
    return True


def start_heartbeat():
    """启动心跳线程"""
    import threading
    
    def send_heartbeat():
        while is_running:
            try:
                rabbitmq_client.send_heartbeat(
                    worker_id=worker_id,
                    status='healthy',
                    metrics={
                        'cpu_usage': 0.25,
                        'memory_usage': 0.35,
                        'active_tasks': 0,
                    }
                )
                logger.debug(f"💓 心跳已发送: {worker_id}")
            except Exception as e:
                logger.error(f"心跳发送失败: {e}")
            
            time.sleep(30)
    
    heartbeat_thread = threading.Thread(target=send_heartbeat, daemon=True)
    heartbeat_thread.start()
    logger.info("💓 心跳线程已启动")


def main():
    """主函数"""
    global rabbitmq_client, task_consumer, is_running
    
    # 注册信号处理
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)
    
    logger.info("=" * 80)
    logger.info("🚀 RabbitMQ Worker 启动中...")
    logger.info(f"   Worker ID: {worker_id}")
    logger.info("=" * 80)
    
    try:
        # 1. 创建RabbitMQ客户端
        rabbitmq_config = RabbitMQConfig()
        rabbitmq_client = RabbitMQClient(rabbitmq_config)
        logger.info("✅ RabbitMQ客户端初始化完成")
        
        # 2. 启动心跳
        start_heartbeat()
        
        # 3. 创建任务消费者
        task_consumer = BacktestTaskConsumer(rabbitmq_config)
        task_consumer.set_task_callback(handle_backtest_task)
        task_consumer.set_cancel_callback(handle_cancel_task)
        logger.info("✅ 任务消费者初始化完成")
        
        # 4. 开始消费任务
        logger.info("=" * 80)
        logger.info("👂 开始监听任务队列...")
        logger.info("   队列: backtest.task")
        logger.info("   按 Ctrl+C 停止")
        logger.info("=" * 80)
        
        task_consumer.start()  # 阻塞式运行
        
    except KeyboardInterrupt:
        logger.info("\n⏹️ 收到停止信号")
    except Exception as e:
        logger.error(f"❌ Worker启动失败: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)
    finally:
        # 清理资源
        is_running = False
        if task_consumer:
            task_consumer.stop()
        if rabbitmq_client:
            rabbitmq_client.close()
        logger.info("👋 Worker已停止")


if __name__ == '__main__':
    main()

