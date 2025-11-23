"""
消息通信模块

提供：
- RabbitMQClient: RabbitMQ 客户端（发送消息）
- MessageConsumer: 消息消费者（接收任务）
- ProgressTracker: 进度追踪器（Backtrader Observer）
- HeartbeatSender: 心跳发送器
- MessageType: 消息类型枚举
- RabbitMQConfig: RabbitMQ 配置
"""

from .rabbitmq_client import (
    RabbitMQClient,
    MessageConsumer,
    MessageType,
    RabbitMQConfig,
)
from .progress_tracker import (
    ProgressTracker,
    HeartbeatSender,
)

from .task_consumer import (
    BacktestTaskConsumer,
    TaskConsumerConfig,
    TaskMessage,
)

__all__ = [
    'RabbitMQClient',
    'MessageConsumer',
    'MessageType',
    'RabbitMQConfig',
    'ProgressTracker',
    'HeartbeatSender',
    'BacktestTaskConsumer',
    'TaskConsumerConfig',
    'TaskMessage',
]

