import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQPublisherService, TaskMessage } from '../rabbitmq/rabbitmq-publisher.service';
import { BacktestTaskEntity } from './entities';
import { StrategiesService } from '../strategies/strategies.service';
import { TradingDataService } from '../../trading-data/trading-data.service';

/**
 * RabbitMQ 任务分发服务
 * 
 * 负责将回测任务通过RabbitMQ发送给Worker
 */
@Injectable()
export class RabbitMQTaskDispatcherService {
  private readonly logger = new Logger(RabbitMQTaskDispatcherService.name);

  constructor(
    private readonly publisherService: RabbitMQPublisherService,
    private readonly strategiesService: StrategiesService,
    private readonly tradingDataService: TradingDataService,
  ) {}

  /**
   * 分发回测任务
   * 
   * @param task 回测任务实体
   * @returns 是否成功分发
   */
  async dispatchTask(task: BacktestTaskEntity): Promise<boolean> {
    try {
      this.logger.log(`Dispatching task ${task.taskId} via RabbitMQ`);

      // 1. 获取策略信息
      const strategy = await this.strategiesService.getStrategy(task.strategyId);
      const scriptVersion = strategy.scriptVersions.find(
        v => v.scriptVersionId === task.scriptVersionId
      );

      if (!scriptVersion) {
        throw new Error(`Script version ${task.scriptVersionId} not found`);
      }

      // 2. 获取数据集信息
      const dataset = await this.tradingDataService.getDatasetById(task.datasetId);

      if (!dataset) {
        throw new Error(`Dataset ${task.datasetId} not found`);
      }

      // 3. 构建任务消息
      const taskMessage: TaskMessage = {
        taskId: task.taskId,
        strategyId: task.strategyId,
        scriptVersionId: task.scriptVersionId,
        userId: task.createdBy,
        priority: 5, // 默认优先级
        
        strategyCode: scriptVersion.code || '',
        strategyClassName: 'Strategy',
        strategyParameters: task.strategyParams || {},
        
      dataConfig: {
        datasetId: dataset.datasetId,
        datasetPath: dataset.path || '', // Parquet文件路径
        tradingPair: dataset.tradingPair,
        granularity: dataset.granularity,
        startDate: task.dataConfig?.timeRange?.start,
        endDate: task.dataConfig?.timeRange?.end,
        timeframe: (task.dataConfig as any)?.timeframe,
      },
        
        executionConfig: {
          initialCapital: (task.executionConfig as any)?.initialCapital || 100000,
          commission: (task.executionConfig as any)?.fee || (task.executionConfig as any)?.commission || 0.001,
          slippage: (task.executionConfig as any)?.slippage || 0.0005,
          enableFactors: true,
          factorNames: [],
        },
        
        timeoutConfig: {
          idleTimeout: 600, // 10分钟
          absoluteMaxTime: undefined, // 使用系统默认48小时
        },
        
        createdAt: task.createdAt.toISOString(),
      };

      // 4. 发布任务到RabbitMQ
      const published = await this.publisherService.publishTask(taskMessage);

      if (published) {
        this.logger.log(`Task ${task.taskId} dispatched successfully via RabbitMQ`);
        return true;
      } else {
        this.logger.error(`Failed to dispatch task ${task.taskId} via RabbitMQ`);
        return false;
      }

    } catch (error) {
      this.logger.error(
        `Error dispatching task ${task.taskId} via RabbitMQ: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 取消任务
   * 
   * @param taskId 任务ID
   * @param reason 取消原因
   */
  async cancelTask(taskId: string, reason?: string): Promise<boolean> {
    try {
      this.logger.log(`Cancelling task ${taskId} via RabbitMQ`);

      const cancelled = await this.publisherService.publishCancelTask(taskId, reason);

      if (cancelled) {
        this.logger.log(`Task ${taskId} cancel message sent successfully`);
        return true;
      } else {
        this.logger.error(`Failed to send cancel message for task ${taskId}`);
        return false;
      }

    } catch (error) {
      this.logger.error(`Error cancelling task ${taskId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查RabbitMQ是否可用
   */
  isAvailable(): boolean {
    return this.publisherService.isAvailable();
  }
}

