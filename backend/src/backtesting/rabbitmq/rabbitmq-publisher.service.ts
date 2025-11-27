import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';
import { RABBITMQ_QUEUES, RABBITMQ_ROUTING_KEYS } from './rabbitmq.config';

/**
 * 任务消息接口
 */
export interface TaskMessage {
  taskId: string;
  strategyId: string;
  scriptVersionId: string;
  userId?: string;
  priority?: number;
  
  strategyCode: string;
  strategyClassName: string;
  strategyParameters: Record<string, any>;
  
  dataConfig: {
    datasetId: number;
    datasetPath: string;
    tradingPair: string;
    granularity: string;
    startDate?: string;
    endDate?: string;
  };
  
  executionConfig: {
    initialCapital: number;
    commission: number;
    slippage: number;
    enableFactors?: boolean;
    factorNames?: string[];
  };
  
  timeoutConfig?: {
    idleTimeout?: number;
    absoluteMaxTime?: number;
  };
  
  createdAt: string;
}

/**
 * 取消任务消息接口
 */
export interface CancelTaskMessage {
  taskId: string;
  reason?: string;
  timestamp: string;
}

/**
 * RabbitMQ 消息发布服务
 * 
 * 负责向Worker发送任务相关消息
 */
@Injectable()
export class RabbitMQPublisherService {
  private readonly logger = new Logger(RabbitMQPublisherService.name);

  constructor(
    private readonly connectionService: RabbitMQConnectionService,
  ) {}

  /**
   * 发布回测任务到队列
   */
  async publishTask(message: TaskMessage): Promise<boolean> {
    try {
      const channel = this.connectionService.getPublishChannel();
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const priority = message.priority || 5;

      // 直接投递到队列，避免路由键/绑定问题导致消息丢失
      const sent = channel.sendToQueue(
        RABBITMQ_QUEUES.TASK,
        messageBuffer,
        {
          persistent: true,
          priority,
          contentType: 'application/json',
          timestamp: Date.now(),
          messageId: message.taskId,
          headers: {
            taskId: message.taskId,
            strategyId: message.strategyId,
            userId: message.userId,
          },
        },
      );

      if (sent) {
        this.logger.log(`Task sent to queue: ${message.taskId} (priority: ${priority})`);
        return true;
      }

      this.logger.warn(`Failed to send task to queue (channel buffer full): ${message.taskId}`);
      return false;

    } catch (error) {
      this.logger.error(`Error publishing task ${message.taskId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 发布取消任务消息
   */
  async publishCancelTask(taskId: string, reason?: string): Promise<boolean> {
    try {
      const channel = this.connectionService.getPublishChannel();
      const config = this.connectionService.getConfig();

      const message: CancelTaskMessage = {
        taskId,
        reason,
        timestamp: new Date().toISOString(),
      };

      const messageBuffer = Buffer.from(JSON.stringify(message));

      const published = channel.publish(
        config.exchange,
        RABBITMQ_ROUTING_KEYS.TASK_CANCEL,
        messageBuffer,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
          messageId: `cancel-${taskId}`,
          headers: {
            taskId,
          },
        }
      );

      if (published) {
        this.logger.log(`Cancel task published: ${taskId}`);
        return true;
      } else {
        this.logger.warn(`Failed to publish cancel task: ${taskId}`);
        return false;
      }

    } catch (error) {
      this.logger.error(`Error publishing cancel task ${taskId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 发送任务到指定队列（低级API）
   */
  async sendToQueue(
    queue: string,
    message: any,
    options?: {
      priority?: number;
      persistent?: boolean;
      expiration?: number;
    }
  ): Promise<boolean> {
    try {
      const channel = this.connectionService.getPublishChannel();
      const messageBuffer = Buffer.from(JSON.stringify(message));

      const sendOptions: any = {
        persistent: options?.persistent !== false,
        contentType: 'application/json',
        timestamp: Date.now(),
      };

      if (options?.priority !== undefined) {
        sendOptions.priority = options.priority;
      }

      if (options?.expiration) {
        sendOptions.expiration = options.expiration.toString();
      }

      const sent = channel.sendToQueue(queue, messageBuffer, sendOptions);

      if (sent) {
        this.logger.debug(`Message sent to queue ${queue}`);
        return true;
      } else {
        this.logger.warn(`Failed to send message to queue ${queue} (buffer full)`);
        return false;
      }

    } catch (error) {
      this.logger.error(`Error sending to queue ${queue}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查发布服务是否可用
   */
  isAvailable(): boolean {
    return this.connectionService.isConnected();
  }
}



