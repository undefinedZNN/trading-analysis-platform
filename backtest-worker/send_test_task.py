#!/usr/bin/env python3
"""发送测试任务到RabbitMQ"""

import pika
import json
import uuid
from datetime import datetime

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

# 准备测试任务
task_id = str(uuid.uuid4())
strategy_id = str(uuid.uuid4())
script_version_id = str(uuid.uuid4())

task_message = {
    'taskId': task_id,
    'strategyId': strategy_id,
    'scriptVersionId': script_version_id,
    'strategyCode': '''
import backtrader as bt

class MAStrategy(bt.Strategy):
    params = (('fast', 10), ('slow', 20))
    
    def __init__(self):
        self.sma_fast = bt.indicators.SMA(period=self.p.fast)
        self.sma_slow = bt.indicators.SMA(period=self.p.slow)
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
    
    def next(self):
        if not self.position:
            if self.crossover > 0:
                self.buy()
        else:
            if self.crossover < 0:
                self.sell()
''',
    'strategyClassName': 'MAStrategy',
    'strategyParameters': {
        'fast': 10,
        'slow': 20,
    },
    'dataConfig': {
        'datasetPath': '/Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-23/ES/5m/agg_5m_from_1s.parquet',
        'tradingPair': 'ES',
        'granularity': '5min',
        'startDate': '2022-01-01',
        'endDate': '2023-12-31',
    },
    'executionConfig': {
        'initialCapital': 100000,
        'commission': 0.001,
    },
    'createdAt': datetime.utcnow().isoformat() + 'Z',
}

# 发送任务
channel.basic_publish(
    exchange='backtest',
    routing_key='task.create',
    body=json.dumps(task_message),
    properties=pika.BasicProperties(
        delivery_mode=2,  # 持久化
        content_type='application/json',
    ),
)

print(f"✅ 测试任务已发送: {task_id}")
print(f"   数据集: {task_message['dataConfig']['datasetPath']}")
print(f"   策略: {task_message['strategyClassName']}")
print(f"   初始资金: {task_message['executionConfig']['initialCapital']}")

connection.close()

