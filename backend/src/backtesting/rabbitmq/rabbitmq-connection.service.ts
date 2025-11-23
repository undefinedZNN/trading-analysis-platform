import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { Connection, Channel } from 'amqplib';
import { 
  RabbitMQConfig, 
  getDefaultRabbitMQConfig, 
  RABBITMQ_QUEUES,
  QUEUE_OPTIONS,
} from './rabbitmq.config';

/**
 * RabbitMQ 连接管理服务
 * 
 * 负责：
 * - 建立和维护RabbitMQ连接
 * - 创建和管理Channel
 * - 声明Exchange和Queue
 * - 连接重试机制
 */
@Injectable()
export class RabbitMQConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQConnectionService.name);
  private readonly config: RabbitMQConfig;
  
  private connection: Connection | null = null;
  private publishChannel: Channel | null = null;
  private consumeChannel: Channel | null = null;
  private isConnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.config = getDefaultRabbitMQConfig();
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * 建立RabbitMQ连接
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.connection) {
      return;
    }

    this.isConnecting = true;

    try {
      this.logger.log(`Connecting to RabbitMQ at ${this.config.host}:${this.config.port}...`);

      // 创建连接 - vhost需要URL编码
      const encodedVhost = encodeURIComponent(this.config.vhost);
      const connectionUrl = `amqp://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/${encodedVhost}`;
      
      this.connection = await amqp.connect(connectionUrl, {
        heartbeat: this.config.heartbeat,
        timeout: this.config.connectionTimeout,
      }) as unknown as Connection;

      this.logger.log('RabbitMQ connection established');

      // 监听连接事件
      this.connection.on('error', (err) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.handleConnectionClose();
      });

      // 创建Channel
      await this.createChannels();

      // 声明Exchange和Queue
      await this.setupTopology();

      this.isConnecting = false;

    } catch (error) {
      this.isConnecting = false;
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`);
      await this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * 创建发布和消费Channel
   */
  private async createChannels(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection not established');
    }

    // 创建发布Channel
    this.publishChannel = (await (this.connection as any).createChannel()) as Channel;
    this.publishChannel.on('error', (err) => {
      this.logger.error(`Publish channel error: ${err.message}`);
    });
    this.publishChannel.on('close', () => {
      this.logger.warn('Publish channel closed');
    });

    // 创建消费Channel
    this.consumeChannel = (await (this.connection as any).createChannel()) as Channel;
    this.consumeChannel.on('error', (err) => {
      this.logger.error(`Consume channel error: ${err.message}`);
    });
    this.consumeChannel.on('close', () => {
      this.logger.warn('Consume channel closed');
    });

    // 设置QoS（每次只处理1条消息）
    await this.consumeChannel.prefetch(1);

    this.logger.log('RabbitMQ channels created');
  }

  /**
   * 声明Exchange和所有Queue
   */
  private async setupTopology(): Promise<void> {
    if (!this.publishChannel) {
      throw new Error('Publish channel not created');
    }

    // 声明Exchange
    await this.publishChannel.assertExchange(
      this.config.exchange,
      'topic',
      { durable: true }
    );

    this.logger.log(`Exchange '${this.config.exchange}' declared`);

    // 声明所有队列
    for (const [queueKey, queueName] of Object.entries(RABBITMQ_QUEUES)) {
      const options = QUEUE_OPTIONS[queueName] || { durable: true };
      
      await this.publishChannel.assertQueue(queueName, options);
      
      this.logger.log(`Queue '${queueName}' declared`);
    }

    this.logger.log('RabbitMQ topology setup complete');
  }

  /**
   * 处理连接错误
   */
  private handleConnectionError(): void {
    this.connection = null;
    this.publishChannel = null;
    this.consumeChannel = null;
    this.scheduleReconnect();
  }

  /**
   * 处理连接关闭
   */
  private handleConnectionClose(): void {
    this.connection = null;
    this.publishChannel = null;
    this.consumeChannel = null;
    this.scheduleReconnect();
  }

  /**
   * 计划重连
   */
  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectTimer) {
      return;
    }

    this.logger.log(`Scheduling reconnect in ${this.config.retryDelay}ms...`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        this.logger.error(`Reconnect failed: ${error.message}`);
      }
    }, this.config.retryDelay);
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      if (this.publishChannel) {
        await this.publishChannel.close();
        this.publishChannel = null;
      }

      if (this.consumeChannel) {
        await this.consumeChannel.close();
        this.consumeChannel = null;
      }

      if (this.connection) {
        await (this.connection as any).close();
        this.connection = null;
      }

      this.logger.log('RabbitMQ connection closed');
    } catch (error) {
      this.logger.error(`Error closing RabbitMQ connection: ${error.message}`);
    }
  }

  /**
   * 获取发布Channel
   */
  getPublishChannel(): Channel {
    if (!this.publishChannel) {
      throw new Error('Publish channel not available');
    }
    return this.publishChannel;
  }

  /**
   * 获取消费Channel
   */
  getConsumeChannel(): Channel {
    if (!this.consumeChannel) {
      throw new Error('Consume channel not available');
    }
    return this.consumeChannel;
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connection !== null && this.publishChannel !== null;
  }

  /**
   * 获取配置
   */
  getConfig(): RabbitMQConfig {
    return this.config;
  }
}

