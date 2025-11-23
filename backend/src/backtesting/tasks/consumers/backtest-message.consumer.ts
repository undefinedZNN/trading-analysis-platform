import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { RabbitMQConnectionService } from '../../rabbitmq/rabbitmq-connection.service';
import { RABBITMQ_QUEUES } from '../../rabbitmq/rabbitmq.config';
import { BacktestTasksService } from '../backtest-tasks.service';
import { BacktestResultService } from '../services/backtest-result.service';
import { TaskLogsService } from '../task-logs.service';
import { ServiceRegistryService } from '../../service-registry/service-registry.service';
import { BacktestTaskStatus } from '../entities/backtest-task.entity';
import { LogLevel } from '../entities';

/**
 * 进度更新消息接口
 */
interface ProgressMessage {
  task_id: string;
  worker_id: string;
  progress: number; // 0.0 - 1.0
  processed_bars?: number;
  total_bars?: number;
  current_date?: string;
  estimated_time_left?: number;
  timestamp: number;
}

/**
 * 状态更新消息接口
 */
interface StatusMessage {
  task_id: string;
  worker_id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  start_time?: string;
  end_time?: string;
  duration?: number;
  timestamp: string;
}

/**
 * 结果消息接口
 */
interface ResultMessage {
  task_id: string;
  worker_id: string;
  status: 'COMPLETED';
  metrics: Record<string, any>;
  files: {
    trades?: string;
    factors?: string;
    equity?: string;
  };
  stats: {
    processed_bars: number;
    execution_time: number;
    peak_memory?: number;
  };
  completed_at: string;
}

/**
 * 错误消息接口
 */
interface ErrorMessage {
  task_id: string;
  worker_id: string;
  status: 'FAILED';
  error: {
    type: string;
    message: string;
    code?: string;
    stack?: string;
    context?: Record<string, any>;
  };
  partial_result?: {
    processed_bars: number;
    last_processed_date?: string;
  };
  failed_at: string;
}

/**
 * 日志消息接口
 */
interface LogMessage {
  task_id: string;
  level: string;
  message: string;
  timestamp: number;
  extra?: Record<string, any>;
}

/**
 * Worker心跳消息接口
 */
interface HeartbeatMessage {
  worker_id: string;
  status: 'idle' | 'busy';
  current_task_id?: string;
  resources: {
    cpu_usage: number;
    memory_usage: number;
    memory_limit: number;
  };
  stats: {
    tasks_completed: number;
    tasks_failed: number;
    uptime: number;
  };
  timestamp: number;
}

/**
 * RabbitMQ 消息消费者
 * 
 * 负责消费Worker发送的各类消息：
 * - 进度更新
 * - 状态变更
 * - 结果提交
 * - 错误报告
 * - 日志消息
 * - Worker心跳
 */
@Injectable()
export class BacktestMessageConsumer implements OnModuleInit {
  private readonly logger = new Logger(BacktestMessageConsumer.name);

  constructor(
    private readonly connectionService: RabbitMQConnectionService,
    private readonly tasksService: BacktestTasksService,
    private readonly resultService: BacktestResultService,
    private readonly logsService: TaskLogsService,
    private readonly registryService: ServiceRegistryService,
  ) {}

  async onModuleInit() {
    // 等待连接建立后再开始消费
    setTimeout(() => {
      this.startConsuming();
    }, 2000);
  }

  /**
   * 开始消费所有队列
   */
  private async startConsuming(): Promise<void> {
    try {
      if (!this.connectionService.isConnected()) {
        this.logger.warn('RabbitMQ not connected, skipping consumer setup');
        return;
      }

      const channel = this.connectionService.getConsumeChannel();

      // 绑定队列到Exchange
      await this.bindQueues(channel);

      // 开始消费各个队列
      await this.consumeProgress(channel);
      await this.consumeStatus(channel);
      await this.consumeResult(channel);
      await this.consumeError(channel);
      await this.consumeLog(channel);
      await this.consumeHeartbeat(channel);

      this.logger.log('All RabbitMQ consumers started successfully');

    } catch (error) {
      this.logger.error(`Failed to start consumers: ${error.message}`);
    }
  }

  /**
   * 绑定队列到Exchange
   */
  private async bindQueues(channel: any): Promise<void> {
    const config = this.connectionService.getConfig();

    // 绑定进度队列
    await channel.bindQueue(
      RABBITMQ_QUEUES.PROGRESS,
      config.exchange,
      'progress.*'
    );

    // 绑定状态队列
    await channel.bindQueue(
      RABBITMQ_QUEUES.STATUS,
      config.exchange,
      'status.*'
    );

    // 绑定结果队列
    await channel.bindQueue(
      RABBITMQ_QUEUES.RESULT,
      config.exchange,
      'result.*'
    );

    // 绑定错误队列
    await channel.bindQueue(
      RABBITMQ_QUEUES.ERROR,
      config.exchange,
      'error.*'
    );

    // 绑定日志队列
    await channel.bindQueue(
      RABBITMQ_QUEUES.LOG,
      config.exchange,
      'log.*'
    );

    // 绑定心跳队列
    await channel.bindQueue(
      RABBITMQ_QUEUES.HEARTBEAT,
      config.exchange,
      'worker.*'
    );

    this.logger.log('Queue bindings configured');
  }

  /**
   * 消费进度更新消息
   */
  private async consumeProgress(channel: any): Promise<void> {
    await channel.consume(
      RABBITMQ_QUEUES.PROGRESS,
      async (msg) => {
        if (!msg) return;

        try {
          const message: ProgressMessage = JSON.parse(msg.content.toString());
          
          this.logger.debug(`Received progress: ${message.task_id} - ${(message.progress * 100).toFixed(1)}%`);

          // 更新任务进度
          await this.tasksService.updateProgressFromWorker(message.task_id, {
            progress: message.progress,
            workerId: message.worker_id,
            metrics: {
              processedBars: message.processed_bars,
              totalBars: message.total_bars,
              currentDate: message.current_date,
              estimatedTimeLeft: message.estimated_time_left,
            },
          });

          channel.ack(msg);

        } catch (error) {
          this.logger.error(`Error processing progress message: ${error.message}`);
          channel.nack(msg, false, false); // 不重新入队
        }
      },
      { noAck: false }
    );

    this.logger.log('Progress consumer started');
  }

  /**
   * 消费状态更新消息
   */
  private async consumeStatus(channel: any): Promise<void> {
    await channel.consume(
      RABBITMQ_QUEUES.STATUS,
      async (msg) => {
        if (!msg) return;

        try {
          const message: StatusMessage = JSON.parse(msg.content.toString());
          
          this.logger.log(`Received status: ${message.task_id} - ${message.status}`);

          // 更新任务状态
          const updateData: any = {
            assignedWorkerId: message.worker_id,
          };

          if (message.start_time) {
            updateData.startedAt = new Date(message.start_time);
          }

          if (message.end_time) {
            updateData.completedAt = new Date(message.end_time);
          }

          // 将字符串状态转换为枚举
          const statusMap: Record<string, BacktestTaskStatus> = {
            'RUNNING': BacktestTaskStatus.RUNNING,
            'COMPLETED': BacktestTaskStatus.COMPLETED,
            'FAILED': BacktestTaskStatus.FAILED,
            'CANCELLED': BacktestTaskStatus.CANCELLED,
          };

          await this.tasksService.updateStatus(
            message.task_id,
            statusMap[message.status] || BacktestTaskStatus.RUNNING,
            updateData
          );

          channel.ack(msg);

        } catch (error) {
          this.logger.error(`Error processing status message: ${error.message}`);
          channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );

    this.logger.log('Status consumer started');
  }

  /**
   * 消费结果消息
   */
  private async consumeResult(channel: any): Promise<void> {
    await channel.consume(
      RABBITMQ_QUEUES.RESULT,
      async (msg) => {
        if (!msg) return;

        try {
          const message: ResultMessage = JSON.parse(msg.content.toString());
          
          this.logger.log(`Received result: ${message.task_id}`);

          // 更新任务完成信息
          await this.tasksService.completeFromWorker(message.task_id, {
            status: message.status,
            workerId: message.worker_id,
            metrics: message.metrics,
            summary: message.metrics, // 临时使用metrics作为summary
          });

          // 触发主结果生成（如果有Parquet文件）
          if (message.files?.trades || message.files?.equity) {
            this.logger.log(`Triggering primary result generation for task ${message.task_id}`);
            // 这里可以发布消息到result.primary.generate队列
            // 或者直接调用BacktestResultService
          }

          channel.ack(msg);

        } catch (error) {
          this.logger.error(`Error processing result message: ${error.message}`);
          channel.nack(msg, false, true); // 重新入队
        }
      },
      { noAck: false }
    );

    this.logger.log('Result consumer started');
  }

  /**
   * 消费错误消息
   */
  private async consumeError(channel: any): Promise<void> {
    await channel.consume(
      RABBITMQ_QUEUES.ERROR,
      async (msg) => {
        if (!msg) return;

        try {
          const message: ErrorMessage = JSON.parse(msg.content.toString());
          
          this.logger.error(`Received error for task ${message.task_id}: ${message.error.message}`);

          // 更新任务为失败状态
          await this.tasksService.updateStatus(
            message.task_id,
            BacktestTaskStatus.FAILED,
            {
              assignedWorkerId: message.worker_id,
              completedAt: new Date(message.failed_at),
              errorMessage: message.error.message,
              errorStack: message.error.stack,
            }
          );

          // 记录错误日志
          await this.logsService.create(
            message.task_id,
            LogLevel.ERROR,
            `Task failed: ${message.error.message}`,
            'worker',
            {
              errorType: message.error.type,
              errorCode: message.error.code,
              context: message.error.context,
            }
          );

          channel.ack(msg);

        } catch (error) {
          this.logger.error(`Error processing error message: ${error.message}`);
          channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );

    this.logger.log('Error consumer started');
  }

  /**
   * 消费日志消息
   */
  private async consumeLog(channel: any): Promise<void> {
    await channel.consume(
      RABBITMQ_QUEUES.LOG,
      async (msg) => {
        if (!msg) return;

        try {
          const message: LogMessage = JSON.parse(msg.content.toString());
          
          // 保存日志到数据库
          const logLevelMap: Record<string, LogLevel> = {
            'DEBUG': LogLevel.DEBUG,
            'INFO': LogLevel.INFO,
            'WARN': LogLevel.WARN,
            'ERROR': LogLevel.ERROR,
          };
          const logLevel = logLevelMap[message.level.toUpperCase()] || LogLevel.INFO;
          
          await this.logsService.create(
            message.task_id,
            logLevel,
            message.message,
            'worker',
            message.extra
          );

          channel.ack(msg);

        } catch (error) {
          this.logger.error(`Error processing log message: ${error.message}`);
          channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );

    this.logger.log('Log consumer started');
  }

  /**
   * 消费Worker心跳消息
   */
  private async consumeHeartbeat(channel: any): Promise<void> {
    await channel.consume(
      RABBITMQ_QUEUES.HEARTBEAT,
      async (msg) => {
        if (!msg) return;

        try {
          const message: HeartbeatMessage = JSON.parse(msg.content.toString());
          
          this.logger.debug(`Received heartbeat from ${message.worker_id}`);

          // 更新Worker心跳（使用heartbeat方法）
          this.registryService.heartbeat({
            workerId: message.worker_id,
            status: message.status as 'idle' | 'busy' | 'overloaded',
            currentLoad: message.resources.cpu_usage / 100,
            metrics: {
              cpu: message.resources.cpu_usage,
              memoryUsed: message.resources.memory_usage,
              runningTasks: message.current_task_id ? 1 : 0,
            },
          });

          channel.ack(msg);

        } catch (error) {
          this.logger.error(`Error processing heartbeat message: ${error.message}`);
          channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );

    this.logger.log('Heartbeat consumer started');
  }
}

