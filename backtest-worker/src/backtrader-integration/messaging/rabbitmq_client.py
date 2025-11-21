"""
RabbitMQ 消息客户端

重构自 POC: poc/backtrader-poc/src/rabbitmq_communication.py
"""

import pika
import json
import logging
import time
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum
from threading import Lock

logger = logging.getLogger(__name__)


class MessageType(Enum):
    """消息类型"""
    PROGRESS = 'backtest.progress'
    RESULT = 'backtest.result'
    ERROR = 'backtest.error'
    LOG = 'backtest.log'
    HEARTBEAT = 'backtest.heartbeat'
    STATUS = 'backtest.status'


@dataclass
class RabbitMQConfig:
    """RabbitMQ 配置"""
    host: str = 'localhost'
    port: int = 5672
    vhost: str = '/backtest'
    username: str = 'dev'
    password: str = 'devpass'
    exchange: str = 'backtest'
    
    # 连接池配置
    pool_size: int = 5
    max_retries: int = 3
    retry_delay: float = 1.0
    
    # 超时配置
    connection_timeout: int = 10
    heartbeat: int = 600


class RabbitMQClient:
    """
    RabbitMQ 客户端
    
    功能：
    - 发送消息到不同队列
    - 连接重试
    - 消息确认
    - 线程安全
    """
    
    def __init__(self, config: Optional[RabbitMQConfig] = None):
        """
        初始化 RabbitMQ 客户端
        
        Args:
            config: RabbitMQ 配置
        """
        self.config = config or RabbitMQConfig()
        self.connection: Optional[pika.BlockingConnection] = None
        self.channel: Optional[pika.channel.Channel] = None
        self.lock = Lock()
        
        self._connect()
    
    def _connect(self) -> None:
        """建立连接"""
        try:
            credentials = pika.PlainCredentials(
                self.config.username,
                self.config.password
            )
            
            parameters = pika.ConnectionParameters(
                host=self.config.host,
                port=self.config.port,
                virtual_host=self.config.vhost,
                credentials=credentials,
                connection_attempts=self.config.max_retries,
                retry_delay=self.config.retry_delay,
                socket_timeout=self.config.connection_timeout,
                heartbeat=self.config.heartbeat,
            )
            
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # 声明交换机
            self.channel.exchange_declare(
                exchange=self.config.exchange,
                exchange_type='topic',
                durable=True
            )
            
            logger.info(f"Connected to RabbitMQ: {self.config.host}:{self.config.port}")
            
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise
    
    def _ensure_connection(self) -> None:
        """确保连接可用"""
        if not self.connection or self.connection.is_closed:
            logger.warning("Connection lost, reconnecting...")
            self._connect()
    
    def send_message(
        self,
        routing_key: str,
        message: Dict[str, Any],
        retry: int = 3
    ) -> bool:
        """
        发送消息
        
        Args:
            routing_key: 路由键（队列名称）
            message: 消息内容（字典）
            retry: 重试次数
        
        Returns:
            是否发送成功
        """
        with self.lock:
            for attempt in range(retry):
                try:
                    self._ensure_connection()
                    
                    # 序列化消息
                    body = json.dumps(message, ensure_ascii=False)
                    
                    # 发送消息
                    self.channel.basic_publish(
                        exchange=self.config.exchange,
                        routing_key=routing_key,
                        body=body,
                        properties=pika.BasicProperties(
                            delivery_mode=2,  # 持久化
                            content_type='application/json',
                            timestamp=int(time.time() * 1000),
                        )
                    )
                    
                    logger.debug(f"Message sent: routing_key={routing_key}, size={len(body)}")
                    return True
                    
                except Exception as e:
                    logger.warning(f"Failed to send message (attempt {attempt + 1}/{retry}): {e}")
                    if attempt < retry - 1:
                        time.sleep(self.config.retry_delay * (attempt + 1))
                    else:
                        logger.error(f"Failed to send message after {retry} attempts")
                        return False
        
        return False
    
    def send_progress(
        self,
        task_id: str,
        progress: float,
        message: str = '',
        details: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        发送进度消息
        
        Args:
            task_id: 任务ID
            progress: 进度百分比 (0-100)
            message: 进度消息
            details: 额外信息
        
        Returns:
            是否发送成功
        """
        payload = {
            'task_id': task_id,
            'progress': progress,
            'message': message,
            'timestamp': time.time(),
        }
        
        if details:
            payload['details'] = details
        
        return self.send_message(MessageType.PROGRESS.value, payload)
    
    def send_result(
        self,
        task_id: str,
        status: str,
        result: Dict[str, Any]
    ) -> bool:
        """
        发送结果消息
        
        Args:
            task_id: 任务ID
            status: 状态 (success/failure)
            result: 结果数据
        
        Returns:
            是否发送成功
        """
        payload = {
            'task_id': task_id,
            'status': status,
            'result': result,
            'timestamp': time.time(),
        }
        
        return self.send_message(MessageType.RESULT.value, payload)
    
    def send_error(
        self,
        task_id: str,
        error_code: str,
        error_message: str,
        stack_trace: Optional[str] = None
    ) -> bool:
        """
        发送错误消息
        
        Args:
            task_id: 任务ID
            error_code: 错误代码
            error_message: 错误消息
            stack_trace: 堆栈跟踪
        
        Returns:
            是否发送成功
        """
        payload = {
            'task_id': task_id,
            'error_code': error_code,
            'error_message': error_message,
            'timestamp': time.time(),
        }
        
        if stack_trace:
            payload['stack_trace'] = stack_trace
        
        return self.send_message(MessageType.ERROR.value, payload)
    
    def send_heartbeat(
        self,
        worker_id: str,
        status: str = 'healthy',
        metrics: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        发送心跳消息
        
        Args:
            worker_id: Worker ID
            status: Worker 状态
            metrics: 性能指标
        
        Returns:
            是否发送成功
        """
        payload = {
            'worker_id': worker_id,
            'status': status,
            'timestamp': time.time(),
        }
        
        if metrics:
            payload['metrics'] = metrics
        
        return self.send_message(MessageType.HEARTBEAT.value, payload)
    
    def send_log(
        self,
        task_id: str,
        level: str,
        message: str,
        extra: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        发送日志消息
        
        Args:
            task_id: 任务ID
            level: 日志级别
            message: 日志消息
            extra: 额外信息
        
        Returns:
            是否发送成功
        """
        payload = {
            'task_id': task_id,
            'level': level,
            'message': message,
            'timestamp': time.time(),
        }
        
        if extra:
            payload['extra'] = extra
        
        return self.send_message(MessageType.LOG.value, payload)
    
    def close(self) -> None:
        """关闭连接"""
        try:
            if self.channel and not self.channel.is_closed:
                self.channel.close()
            
            if self.connection and not self.connection.is_closed:
                self.connection.close()
            
            logger.info("RabbitMQ connection closed")
            
        except Exception as e:
            logger.warning(f"Error closing connection: {e}")
    
    def __enter__(self):
        """上下文管理器入口"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        self.close()


class MessageConsumer:
    """
    消息消费者
    
    用于接收来自 Backend 的任务消息。
    """
    
    def __init__(
        self,
        config: Optional[RabbitMQConfig] = None,
        queue_name: str = 'backtest.tasks'
    ):
        """
        初始化消息消费者
        
        Args:
            config: RabbitMQ 配置
            queue_name: 队列名称
        """
        self.config = config or RabbitMQConfig()
        self.queue_name = queue_name
        self.connection: Optional[pika.BlockingConnection] = None
        self.channel: Optional[pika.channel.Channel] = None
        
        self._connect()
    
    def _connect(self) -> None:
        """建立连接"""
        try:
            credentials = pika.PlainCredentials(
                self.config.username,
                self.config.password
            )
            
            parameters = pika.ConnectionParameters(
                host=self.config.host,
                port=self.config.port,
                virtual_host=self.config.vhost,
                credentials=credentials,
                heartbeat=self.config.heartbeat,
            )
            
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # 声明队列
            self.channel.queue_declare(
                queue=self.queue_name,
                durable=True
            )
            
            # 设置 QoS（每次只消费一条消息）
            self.channel.basic_qos(prefetch_count=1)
            
            logger.info(f"Consumer connected: queue={self.queue_name}")
            
        except Exception as e:
            logger.error(f"Failed to connect consumer: {e}")
            raise
    
    def consume(
        self,
        callback: Callable[[Dict[str, Any]], bool],
        auto_ack: bool = False
    ) -> None:
        """
        开始消费消息
        
        Args:
            callback: 消息处理回调函数，返回 True 表示成功
            auto_ack: 是否自动确认
        """
        def on_message(ch, method, properties, body):
            try:
                # 解析消息
                message = json.loads(body)
                logger.debug(f"Received message: {message}")
                
                # 调用回调处理消息
                success = callback(message)
                
                # 手动确认
                if not auto_ack:
                    if success:
                        ch.basic_ack(delivery_tag=method.delivery_tag)
                    else:
                        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
                
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                if not auto_ack:
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        
        self.channel.basic_consume(
            queue=self.queue_name,
            on_message_callback=on_message,
            auto_ack=auto_ack
        )
        
        logger.info("Started consuming messages...")
        try:
            self.channel.start_consuming()
        except KeyboardInterrupt:
            logger.info("Stopped consuming messages")
            self.channel.stop_consuming()
    
    def close(self) -> None:
        """关闭连接"""
        try:
            if self.channel:
                self.channel.close()
            if self.connection:
                self.connection.close()
            logger.info("Consumer connection closed")
        except Exception as e:
            logger.warning(f"Error closing consumer: {e}")

