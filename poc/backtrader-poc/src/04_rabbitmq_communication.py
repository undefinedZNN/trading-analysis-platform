#!/usr/bin/env python3
"""
POC Day 4 - RabbitMQ 消息通信
验证 Worker 通过 RabbitMQ 向 Backend 发送回测进度消息
"""

import pika
import json
import time
from datetime import datetime
from enum import Enum
from typing import Dict, Any


class MessageType(Enum):
    """消息类型枚举"""
    TASK_STARTED = "task.started"
    TASK_PROGRESS = "task.progress"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"


class BacktestMessageSender:
    """
    回测消息发送器
    负责向 RabbitMQ 发送不同类型的回测消息
    """
    
    def __init__(self, host='127.0.0.1', port=5672, username='dev', password='devpass', vhost='/backtest'):
        """初始化 RabbitMQ 连接"""
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.vhost = vhost
        self.connection = None
        self.channel = None
        self.queue_name = 'backtest.progress'
        
    def connect(self):
        """连接到 RabbitMQ"""
        try:
            credentials = pika.PlainCredentials(self.username, self.password)
            parameters = pika.ConnectionParameters(
                host=self.host,
                port=self.port,
                virtual_host=self.vhost,
                credentials=credentials,
                heartbeat=600,
                blocked_connection_timeout=300,
            )
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # 声明队列（持久化）
            self.channel.queue_declare(
                queue=self.queue_name,
                durable=True,
                arguments={
                    'x-message-ttl': 86400000,  # 消息 TTL: 1 天
                    'x-max-length': 100000,  # 队列最大长度
                }
            )
            
            print(f"✅ 成功连接到 RabbitMQ: {self.host}:{self.port} (vhost={self.vhost})")
            return True
            
        except Exception as e:
            print(f"❌ 连接 RabbitMQ 失败: {e}")
            return False
    
    def disconnect(self):
        """断开连接"""
        if self.connection and not self.connection.is_closed:
            self.connection.close()
            print("🔒 RabbitMQ 连接已关闭")
    
    def send_message(self, message_type: MessageType, task_id: str, **kwargs) -> bool:
        """
        发送消息
        
        Args:
            message_type: 消息类型
            task_id: 任务ID
            **kwargs: 其他消息字段
        
        Returns:
            bool: 是否发送成功
        """
        try:
            # 构造消息体
            message = {
                'message_type': message_type.value,
                'task_id': task_id,
                'timestamp': datetime.now().isoformat(),
                **kwargs
            }
            
            # 发送消息
            start_time = time.time()
            self.channel.basic_publish(
                exchange='',
                routing_key=self.queue_name,
                body=json.dumps(message),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # 持久化消息
                    content_type='application/json',
                )
            )
            elapsed = (time.time() - start_time) * 1000  # 转换为毫秒
            
            print(f"  📤 发送消息: {message_type.value} (task_id={task_id}, 耗时={elapsed:.2f}ms)")
            return True
            
        except Exception as e:
            print(f"  ❌ 发送消息失败: {e}")
            return False
    
    def send_task_started(self, task_id: str, strategy_name: str, params: Dict[str, Any]):
        """发送任务开始消息"""
        return self.send_message(
            MessageType.TASK_STARTED,
            task_id,
            strategy_name=strategy_name,
            params=params,
        )
    
    def send_task_progress(self, task_id: str, progress: float, current_bar: int, total_bars: int):
        """发送任务进度消息"""
        return self.send_message(
            MessageType.TASK_PROGRESS,
            task_id,
            progress=progress,
            current_bar=current_bar,
            total_bars=total_bars,
        )
    
    def send_task_completed(self, task_id: str, result: Dict[str, Any]):
        """发送任务完成消息"""
        return self.send_message(
            MessageType.TASK_COMPLETED,
            task_id,
            result=result,
        )
    
    def send_task_failed(self, task_id: str, error: str):
        """发送任务失败消息"""
        return self.send_message(
            MessageType.TASK_FAILED,
            task_id,
            error=error,
        )


class BacktestMessageReceiver:
    """
    回测消息接收器（用于测试）
    负责从 RabbitMQ 接收回测消息
    """
    
    def __init__(self, host='127.0.0.1', port=5672, username='dev', password='devpass', vhost='/backtest'):
        """初始化 RabbitMQ 连接"""
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.vhost = vhost
        self.connection = None
        self.channel = None
        self.queue_name = 'backtest.progress'
        self.received_messages = []
        
    def connect(self):
        """连接到 RabbitMQ"""
        try:
            credentials = pika.PlainCredentials(self.username, self.password)
            parameters = pika.ConnectionParameters(
                host=self.host,
                port=self.port,
                virtual_host=self.vhost,
                credentials=credentials,
                heartbeat=600,
                blocked_connection_timeout=300,
            )
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # 声明队列（与发送器相同）
            self.channel.queue_declare(
                queue=self.queue_name,
                durable=True,
                arguments={
                    'x-message-ttl': 86400000,
                    'x-max-length': 100000,
                }
            )
            
            print(f"✅ 消费者成功连接到 RabbitMQ: {self.host}:{self.port} (vhost={self.vhost})")
            return True
            
        except Exception as e:
            print(f"❌ 消费者连接 RabbitMQ 失败: {e}")
            return False
    
    def disconnect(self):
        """断开连接"""
        if self.connection and not self.connection.is_closed:
            self.connection.close()
            print("🔒 消费者 RabbitMQ 连接已关闭")
    
    def callback(self, ch, method, properties, body):
        """消息回调函数"""
        try:
            message = json.loads(body)
            receive_time = datetime.now()
            send_time = datetime.fromisoformat(message['timestamp'])
            latency = (receive_time - send_time).total_seconds() * 1000  # 毫秒
            
            self.received_messages.append({
                'message': message,
                'latency_ms': latency,
            })
            
            print(f"  📥 接收消息: {message['message_type']} (task_id={message['task_id']}, 延迟={latency:.2f}ms)")
            
            # 确认消息
            ch.basic_ack(delivery_tag=method.delivery_tag)
            
        except Exception as e:
            print(f"  ❌ 处理消息失败: {e}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    
    def start_consuming(self, max_messages=None, timeout=5):
        """
        开始消费消息
        
        Args:
            max_messages: 最大消费消息数（None 表示持续消费）
            timeout: 超时时间（秒），用于限制等待时间
        """
        try:
            print(f"\n📡 开始消费消息（队列: {self.queue_name}，最多 {max_messages} 条，超时 {timeout}秒）...")
            
            if max_messages:
                message_count = 0
                start_time = time.time()
                
                while message_count < max_messages:
                    # 检查超时
                    if time.time() - start_time > timeout:
                        print(f"  ⏱️  超时：已等待 {timeout} 秒，接收到 {message_count} 条消息")
                        break
                    
                    # 尝试获取消息（非阻塞）
                    method_frame, properties, body = self.channel.basic_get(self.queue_name, auto_ack=False)
                    
                    if method_frame:
                        self.callback(self.channel, method_frame, properties, body)
                        message_count += 1
                    else:
                        # 没有消息，短暂休眠
                        time.sleep(0.1)
            else:
                # 持续消费（使用回调）
                self.channel.basic_qos(prefetch_count=1)
                self.channel.basic_consume(
                    queue=self.queue_name,
                    on_message_callback=self.callback,
                )
                self.channel.start_consuming()
                
        except KeyboardInterrupt:
            print("\n⚠️  用户中断消费")
            if self.channel:
                self.channel.stop_consuming()
        except Exception as e:
            print(f"❌ 消费消息失败: {e}")
    
    def get_statistics(self):
        """获取消息统计"""
        if not self.received_messages:
            return {
                'total': 0,
                'avg_latency_ms': 0,
                'max_latency_ms': 0,
                'min_latency_ms': 0,
            }
        
        latencies = [msg['latency_ms'] for msg in self.received_messages]
        return {
            'total': len(self.received_messages),
            'avg_latency_ms': sum(latencies) / len(latencies),
            'max_latency_ms': max(latencies),
            'min_latency_ms': min(latencies),
        }


def test_rabbitmq_communication():
    """测试 RabbitMQ 消息通信"""
    print("🚀 POC Day 4 - RabbitMQ 消息通信测试")
    print("=" * 60)
    
    # 1. 创建发送器和接收器
    sender = BacktestMessageSender()
    receiver = BacktestMessageReceiver()
    
    # 2. 连接到 RabbitMQ
    print("\n📡 连接到 RabbitMQ...")
    if not sender.connect():
        print("❌ 发送器连接失败")
        return False
    
    if not receiver.connect():
        print("❌ 接收器连接失败")
        sender.disconnect()
        return False
    
    # 3. 发送测试消息
    print("\n" + "=" * 60)
    print("📤 发送测试消息...")
    print("=" * 60)
    
    task_id = "test_task_001"
    
    # 3.1 任务开始
    sender.send_task_started(
        task_id=task_id,
        strategy_name="MA_Strategy",
        params={'fast': 10, 'slow': 20}
    )
    time.sleep(0.1)
    
    # 3.2 进度更新（模拟3次）
    for i in range(1, 4):
        progress = i * 33.33
        sender.send_task_progress(
            task_id=task_id,
            progress=progress,
            current_bar=i * 1000,
            total_bars=3000
        )
        time.sleep(0.1)
    
    # 3.3 任务完成
    sender.send_task_completed(
        task_id=task_id,
        result={
            'final_value': 99955.46,
            'pnl': -44.54,
            'pnl_percent': -0.04,
            'trade_count': 2,
        }
    )
    time.sleep(0.1)
    
    # 4. 接收消息
    print("\n" + "=" * 60)
    print("📥 接收测试消息...")
    print("=" * 60)
    
    receiver.start_consuming(max_messages=5)
    
    # 5. 统计结果
    print("\n" + "=" * 60)
    print("📊 消息统计")
    print("=" * 60)
    
    stats = receiver.get_statistics()
    print(f"\n消息总数: {stats['total']}")
    print(f"平均延迟: {stats['avg_latency_ms']:.2f} ms")
    print(f"最大延迟: {stats['max_latency_ms']:.2f} ms")
    print(f"最小延迟: {stats['min_latency_ms']:.2f} ms")
    
    # 6. 验证消息类型
    print(f"\n📋 消息类型分布:")
    message_types = {}
    for msg_data in receiver.received_messages:
        msg_type = msg_data['message']['message_type']
        message_types[msg_type] = message_types.get(msg_type, 0) + 1
    
    for msg_type, count in message_types.items():
        print(f"  - {msg_type}: {count}")
    
    # 7. 断开连接
    print("\n" + "=" * 60)
    sender.disconnect()
    receiver.disconnect()
    
    # 8. 验证结果
    print("\n" + "=" * 60)
    print("✅ 测试结果")
    print("=" * 60)
    
    success = True
    
    # 检查消息数量
    if stats['total'] == 5:
        print(f"✅ 消息数量正确: {stats['total']} / 5")
    else:
        print(f"❌ 消息数量错误: {stats['total']} / 5")
        success = False
    
    # 检查延迟
    if stats['avg_latency_ms'] < 100:  # 平均延迟 < 100ms
        print(f"✅ 平均延迟在可接受范围内: {stats['avg_latency_ms']:.2f} ms < 100 ms")
    else:
        print(f"⚠️  平均延迟较高: {stats['avg_latency_ms']:.2f} ms >= 100 ms")
    
    # 检查消息类型
    expected_types = {
        MessageType.TASK_STARTED.value: 1,
        MessageType.TASK_PROGRESS.value: 3,
        MessageType.TASK_COMPLETED.value: 1,
    }
    
    if message_types == expected_types:
        print(f"✅ 消息类型正确")
    else:
        print(f"❌ 消息类型错误")
        print(f"  期望: {expected_types}")
        print(f"  实际: {message_types}")
        success = False
    
    print(f"\n{'✅ RabbitMQ 消息通信测试通过！' if success else '❌ RabbitMQ 消息通信测试失败！'}")
    
    return success


if __name__ == "__main__":
    success = test_rabbitmq_communication()
    exit(0 if success else 1)

