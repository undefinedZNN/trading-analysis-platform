#!/usr/bin/env python3
"""清理RabbitMQ队列"""

import pika

# RabbitMQ配置
rabbitmq_config = {
    'host': 'localhost',
    'port': 5672,
    'vhost': '/backtest',
    'username': 'dev',
    'password': 'devpass',
}

# 创建连接
credentials = pika.PlainCredentials(rabbitmq_config['username'], rabbitmq_config['password'])
parameters = pika.ConnectionParameters(
    host=rabbitmq_config['host'],
    port=rabbitmq_config['port'],
    virtual_host=rabbitmq_config['vhost'],
    credentials=credentials,
)

connection = pika.BlockingConnection(parameters)
channel = connection.channel()

# 清理队列
queue_name = 'backtest.task'
result = channel.queue_purge(queue_name)
print(f"✅ 清理队列 {queue_name}: 删除了 {result.method.message_count} 条消息")

connection.close()


