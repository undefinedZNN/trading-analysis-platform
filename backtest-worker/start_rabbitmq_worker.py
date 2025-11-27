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
import requests
import psutil
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
from datetime import datetime

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# 导入RabbitMQ客户端
from backtrader_integration.messaging import (
    BacktestTaskConsumer,
    RabbitMQClient,
    RabbitMQConfig,
    TaskConsumerConfig,
    TaskMessage,
)

# 导入Backtrader执行器
from backtrader_integration.execution import BacktestExecutor

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
backend_base = os.getenv('BACKEND_URL', 'http://localhost:3000/api/v1/internal/workers')

# 结果存储目录（与 backend/storage/backtests 对齐）
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKTEST_RESULTS_ROOT = REPO_ROOT / 'backend' / 'storage' / 'backtests'


def handle_shutdown(signum, frame):
    """处理退出信号"""
    global is_running
    logger.info("Received shutdown signal, stopping worker...")
    is_running = False
    try:
        if task_consumer:
            task_consumer.stop()
        if rabbitmq_client:
            rabbitmq_client.close()
    finally:
        sys.exit(0)


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
        
        # 创建Backtrader执行器
        executor = BacktestExecutor(
            rabbitmq_client=rabbitmq_client,
            worker_id=worker_id,
            backend_url=backend_base.replace('/api/v1/internal/workers', ''),
        )
        
        # 准备任务消息（转换为dict格式）
        task_message = {
            'taskId': task.task_id,
            'strategyCode': task.strategy_code,
            'strategyClassName': task.strategy_class_name,
            'strategyParameters': task.strategy_parameters or {},
            'dataConfig': task.data_config,
            'executionConfig': task.execution_config,
            'createdAt': task.created_at,
        }
        
        # 执行回测
        logger.info(f"🚀 开始执行任务: {task.task_id}")
        result_summary = executor.execute_backtest(task_message)
        
        logger.info(f"✅ 任务完成: {task.task_id}")
        logger.info(f"   总交易次数: {result_summary.get('totalTrades', 0)}")
        logger.info(f"   总收益率: {result_summary.get('totalReturn', 0):.2f}%")
        logger.info(f"   处理Bar数: {result_summary.get('processedBars', 0)}")
        logger.info("=" * 80)
        
        return True
        
    except Exception as e:
        logger.error(f"❌ 任务执行失败: {e}")
        logger.error(traceback.format_exc())
        
        # 发送错误
        try:
            rabbitmq_client.send_error(
                task_id=task.task_id,
                error_code='EXECUTION_ERROR',
                error_message=str(e),
                stack_trace=traceback.format_exc()
            )
        except Exception as send_err:
            logger.error(f"发送错误消息失败: {send_err}")
        
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
                cpu = psutil.cpu_percent(interval=0.1)
                mem = psutil.virtual_memory().percent
                status = 'idle'
                if cpu >= 80 or mem >= 90:
                    status = 'overloaded'
                rabbitmq_client.send_heartbeat(
                    worker_id=worker_id,
                    status=status,
                    metrics={
                        'cpu_usage': cpu,
                        'memory_usage': mem,
                        'current_task_id': None,
                    },
                )
                logger.debug(f"💓 心跳已发送: {worker_id}, status={status}, cpu={cpu:.1f}%, mem={mem:.1f}%")
            except Exception as e:
                logger.error(f"心跳发送失败: {e}")
            
            time.sleep(30)
    
    heartbeat_thread = threading.Thread(target=send_heartbeat, daemon=True)
    heartbeat_thread.start()
    logger.info("💓 心跳线程已启动")


def start_backend_heartbeat():
    """向 Backend 周期性发送心跳，确保 Worker 管理可见"""
    import threading

    heartbeat_url = f"{backend_base}/heartbeat"

    def send():
        while is_running:
            try:
                cpu = psutil.cpu_percent(interval=0.1)
                mem = psutil.virtual_memory().percent
                status = 'idle'
                if cpu >= 80 or mem >= 90:
                    status = 'overloaded'
                payload = {
                    "workerId": worker_id,
                    "status": status,
                    "currentLoad": max(cpu, mem) / 100.0,
                    "metrics": {
                        "cpu": cpu,
                        "memoryUsed": mem,
                        "runningTasks": 0,
                    },
                }
                resp = requests.post(heartbeat_url, json=payload, timeout=5)
                if resp.status_code not in (200, 201):
                    logger.warning("Backend heartbeat failed: %s %s", resp.status_code, resp.text)
            except Exception as e:
                logger.warning("Backend heartbeat error: %s", e)
            time.sleep(30)

    threading.Thread(target=send, daemon=True).start()
    logger.info("💓 Backend 心跳线程已启动")


def load_existing_results(task_id: str) -> tuple[str, str, int, float, float]:
    """
    读取已生成的真实结果文件（假设回测已写入 backend/storage/backtests/<taskId>/）
    返回：trades相对路径、equity相对路径、交易数、总Pnl、总手续费
    """
    task_dir = BACKTEST_RESULTS_ROOT / task_id
    trades_file = task_dir / 'trades.parquet'
    equity_file = task_dir / 'equity.parquet'

    if not trades_file.exists():
        raise FileNotFoundError(f"Trades file not found: {trades_file}")

    # 读取交易数据以统计条数和简单指标
    table = pq.read_table(trades_file)
    df = table.to_pandas()
    total_trades = len(df)
    total_pnl = float(df['realized_pnl'].sum()) if 'realized_pnl' in df else 0.0
    total_fees = float(df['fees'].sum()) if 'fees' in df else 0.0

    rel_trades = f'backtests/{task_id}/trades.parquet'
    rel_equity = f'backtests/{task_id}/equity.parquet' if equity_file.exists() else ''
    return rel_trades, rel_equity, total_trades, total_pnl, total_fees


def write_placeholder_results(task_id: str, trade_count: int = 1) -> tuple[str, str, int, float, float]:
    """
    写入占位的交易/equity 文件，避免缺文件导致消息反复重试
    """
    task_dir = BACKTEST_RESULTS_ROOT / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    trades_file = task_dir / 'trades.parquet'
    equity_file = task_dir / 'equity.parquet'

    now = datetime.utcnow().timestamp()
    trades_rows = {
        'task_id': [],
        'session_id': [],
        'strategy_id': [],
        'script_version_id': [],
        'symbol': [],
        'side': [],
        'trade_type': [],
        'quantity': [],
        'price': [],
        'realized_pnl': [],
        'unrealized_pnl': [],
        'fees': [],
        'fee_currency': [],
        'liquidity': [],
        'ts': [],
        'sequence_id': [],
        'position_qty': [],
        'position_avg_entry': [],
        'position_side': [],
        'reason': [],
        'factor_system': [],
        'factor_custom': [],
        'entry_price': [],
        'exit_price': [],
        'stop_price': [],
        'target_price': [],
        'bar_ts': [],
        'context_json': [],
    }

    for i in range(trade_count):
        trades_rows['task_id'].append(task_id)
        trades_rows['session_id'].append('session-1')
        trades_rows['strategy_id'].append('strategy-1')
        trades_rows['script_version_id'].append(None)
        trades_rows['symbol'].append('ES')
        trades_rows['side'].append('buy' if i % 2 == 0 else 'sell')
        trades_rows['trade_type'].append('market')
        trades_rows['quantity'].append(1.0)
        trades_rows['price'].append(100.0 + i * 0.1)
        trades_rows['realized_pnl'].append(0.5 + i * 0.01)
        trades_rows['unrealized_pnl'].append(0.0)
        trades_rows['fees'].append(0.01)
        trades_rows['fee_currency'].append('USD')
        trades_rows['liquidity'].append('T')
        trades_rows['ts'].append(now + i)
        trades_rows['sequence_id'].append(i + 1)
        trades_rows['position_qty'].append(1.0)
        trades_rows['position_avg_entry'].append(100.0)
        trades_rows['position_side'].append('long')
        trades_rows['reason'].append('entry')
        trades_rows['factor_system'].append(json.dumps({'ma_fast': 10, 'ma_slow': 20}))
        trades_rows['factor_custom'].append(json.dumps({'score': 0.8}))
        trades_rows['entry_price'].append(100.0)
        trades_rows['exit_price'].append(100.5 + i * 0.01)
        trades_rows['stop_price'].append(99.0)
        trades_rows['target_price'].append(101.0)
        trades_rows['bar_ts'].append(now + i)
        trades_rows['context_json'].append(json.dumps({'status': 'closed', 'entryTimestamp': now + i}))

    trades_table = pa.table(trades_rows)
    pq.write_table(trades_table, trades_file)

    equity_table = pa.table({
        'ts': [now - 60, now],
        'equity': [10000.0, 10000.5],
    })
    pq.write_table(equity_table, equity_file)

    rel_trades = f'backtests/{task_id}/trades.parquet'
    rel_equity = f'backtests/{task_id}/equity.parquet'
    total_trades = trade_count
    total_pnl = float(trades_rows['realized_pnl'][0]) if trade_count > 0 else 0.0
    total_fees = float(trades_rows['fees'][0]) * trade_count if trade_count > 0 else 0.0
    return rel_trades, rel_equity, total_trades, total_pnl, total_fees


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
        # 1. 读取配置（支持环境变量覆盖）
        rabbitmq_config = RabbitMQConfig(
            host=os.getenv('RABBITMQ_HOST', 'localhost'),
            port=int(os.getenv('RABBITMQ_PORT', '5672')),
            vhost=os.getenv('RABBITMQ_VHOST', '/backtest'),
            username=os.getenv('RABBITMQ_USERNAME', 'dev'),
            password=os.getenv('RABBITMQ_PASSWORD', 'devpass'),
            exchange=os.getenv('RABBITMQ_EXCHANGE', 'backtest.exchange'),  # 修改为与Backend一致
        )
        task_queue = os.getenv('RABBITMQ_TASK_QUEUE', 'backtest.tasks')
        cancel_queue = os.getenv('RABBITMQ_TASK_CANCEL_QUEUE', 'backtest.task.cancel')

        logger.info(
            "RabbitMQ config: host=%s port=%s vhost=%s exchange=%s queue=%s cancelQueue=%s",
            rabbitmq_config.host,
            rabbitmq_config.port,
            rabbitmq_config.vhost,
            rabbitmq_config.exchange,
            task_queue,
            cancel_queue,
        )

        # 2. 创建RabbitMQ客户端
        rabbitmq_client = RabbitMQClient(rabbitmq_config)
        logger.info("✅ RabbitMQ客户端初始化完成")
        
        # 3. 启动心跳（RabbitMQ + Backend）
        start_heartbeat()
        start_backend_heartbeat()
        
        # 4. 创建任务消费者（明确队列名）
        consumer_config = TaskConsumerConfig(
            queue_name=task_queue,
            cancel_queue=cancel_queue,
            auto_ack=False,
            prefetch_count=1,
        )
        task_consumer = BacktestTaskConsumer(
            rabbitmq_config=rabbitmq_config,
            consumer_config=consumer_config,
        )
        task_consumer.set_task_callback(handle_backtest_task)
        task_consumer.set_cancel_callback(handle_cancel_task)
        logger.info("✅ 任务消费者初始化完成")
        
        # 5. 开始消费任务
        logger.info("=" * 80)
        logger.info("👂 开始监听任务队列...")
        logger.info("   队列: %s", task_queue)
        logger.info("   取消队列: %s", cancel_queue)
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
