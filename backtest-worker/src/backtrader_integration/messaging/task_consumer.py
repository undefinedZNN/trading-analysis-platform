"""
RabbitMQ 任务消费者

负责从RabbitMQ接收回测任务并执行
"""

import json
import logging
from typing import Callable, Dict, Any, Optional
from .rabbitmq_client import RabbitMQClient, RabbitMQConfig, MessageConsumer

logger = logging.getLogger(__name__)


class TaskConsumerConfig:
    """任务消费者配置"""
    
    def __init__(
        self,
        queue_name: str = 'backtest.tasks',
        cancel_queue: str = 'backtest.task.cancel',
        auto_ack: bool = False,
        prefetch_count: int = 1,
    ):
        self.queue_name = queue_name
        self.cancel_queue = cancel_queue
        self.auto_ack = auto_ack
        self.prefetch_count = prefetch_count


class TaskMessage:
    """任务消息"""
    
    def __init__(self, data: Dict[str, Any]):
        self.task_id = data['taskId']
        self.strategy_id = data['strategyId']
        self.script_version_id = data['scriptVersionId']
        self.user_id = data.get('userId')
        self.priority = data.get('priority', 5)
        
        # 策略信息
        self.strategy_code = data['strategyCode']
        self.strategy_class_name = data['strategyClassName']
        self.strategy_parameters = data['strategyParameters']
        
        # 数据配置
        self.data_config = data['dataConfig']
        
        # 执行配置
        self.execution_config = data['executionConfig']
        
        # 超时配置
        self.timeout_config = data.get('timeoutConfig', {})
        
        # 创建时间
        self.created_at = data['createdAt']
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'taskId': self.task_id,
            'strategyId': self.strategy_id,
            'scriptVersionId': self.script_version_id,
            'userId': self.user_id,
            'priority': self.priority,
            'strategyCode': self.strategy_code,
            'strategyClassName': self.strategy_class_name,
            'strategyParameters': self.strategy_parameters,
            'dataConfig': self.data_config,
            'executionConfig': self.execution_config,
            'timeoutConfig': self.timeout_config,
            'createdAt': self.created_at,
        }


class BacktestTaskConsumer:
    """
    回测任务消费者
    
    从RabbitMQ消费回测任务并执行
    """
    
    def __init__(
        self,
        rabbitmq_config: Optional[RabbitMQConfig] = None,
        consumer_config: Optional[TaskConsumerConfig] = None,
    ):
        """
        初始化任务消费者
        
        Args:
            rabbitmq_config: RabbitMQ配置
            consumer_config: 消费者配置
        """
        self.rabbitmq_config = rabbitmq_config or RabbitMQConfig()
        self.consumer_config = consumer_config or TaskConsumerConfig()
        
        self.task_consumer: Optional[MessageConsumer] = None
        self.cancel_consumer: Optional[MessageConsumer] = None
        self.task_callback: Optional[Callable[[TaskMessage], bool]] = None
        self.cancel_callback: Optional[Callable[[str, str], bool]] = None
        
        logger.info(
            f"TaskConsumer initialized: queue={self.consumer_config.queue_name}"
        )
    
    def set_task_callback(self, callback: Callable[[TaskMessage], bool]) -> None:
        """
        设置任务处理回调函数
        
        Args:
            callback: 回调函数，接收TaskMessage，返回是否成功
        """
        self.task_callback = callback
        logger.info("Task callback registered")
    
    def set_cancel_callback(self, callback: Callable[[str, str], bool]) -> None:
        """
        设置取消任务回调函数
        
        Args:
            callback: 回调函数，接收taskId和reason，返回是否成功
        """
        self.cancel_callback = callback
        logger.info("Cancel callback registered")
    
    def start(self) -> None:
        """
        开始消费任务
        """
        if not self.task_callback:
            raise ValueError("Task callback not set. Call set_task_callback() first.")
        
        logger.info("Starting task consumers...")
        
        # 启动任务消费者
        self._start_task_consumer()
        
        # 启动取消任务消费者（如果设置了回调）
        if self.cancel_callback:
            self._start_cancel_consumer()
        
        logger.info("Task consumers started successfully")
    
    def _start_task_consumer(self) -> None:
        """启动任务消费者"""
        self.task_consumer = MessageConsumer(
            config=self.rabbitmq_config,
            queue_name=self.consumer_config.queue_name,
        )
        
        def on_task_message(message: Dict[str, Any]) -> bool:
            """处理任务消息"""
            try:
                logger.info(f"Received task message: {message.get('taskId')}")
                
                # 解析任务消息
                task_message = TaskMessage(message)
                
                # 调用回调处理任务
                return self.task_callback(task_message)
                
            except Exception as e:
                logger.error(f"Error processing task message: {e}")
                return False
        
        # 开始消费（会阻塞）
        self.task_consumer.consume(
            callback=on_task_message,
            auto_ack=self.consumer_config.auto_ack,
        )
    
    def _start_cancel_consumer(self) -> None:
        """启动取消任务消费者"""
        self.cancel_consumer = MessageConsumer(
            config=self.rabbitmq_config,
            queue_name=self.consumer_config.cancel_queue,
        )
        
        def on_cancel_message(message: Dict[str, Any]) -> bool:
            """处理取消任务消息"""
            try:
                task_id = message.get('taskId')
                reason = message.get('reason', 'No reason provided')
                
                logger.info(f"Received cancel message for task {task_id}: {reason}")
                
                # 调用回调处理取消
                return self.cancel_callback(task_id, reason)
                
            except Exception as e:
                logger.error(f"Error processing cancel message: {e}")
                return False
        
        # 开始消费（会阻塞）
        self.cancel_consumer.consume(
            callback=on_cancel_message,
            auto_ack=self.consumer_config.auto_ack,
        )
    
    def stop(self) -> None:
        """停止消费"""
        logger.info("Stopping task consumers...")
        
        if self.task_consumer:
            self.task_consumer.close()
            self.task_consumer = None
        
        if self.cancel_consumer:
            self.cancel_consumer.close()
            self.cancel_consumer = None
        
        logger.info("Task consumers stopped")
    
    def __enter__(self):
        """上下文管理器入口"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        self.stop()




