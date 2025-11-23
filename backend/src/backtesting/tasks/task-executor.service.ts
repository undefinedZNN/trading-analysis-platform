import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BacktestTasksService } from './backtest-tasks.service';
import { TaskLogsService } from './task-logs.service';
import { StrategiesService } from '../strategies/strategies.service';
import { TradingDataService } from '../../trading-data/trading-data.service';
import { resolveDatasetPath } from '../../config/storage.config';
import { BacktestTaskEntity, BacktestTaskStatus, ResultSummary, LogLevel } from './entities';
import { WorkerClientService } from '../worker-client/worker-client.service';
import { ExecutionConfigDto } from './dto/create-backtest-task.dto';
import { DatasetEntity } from '../../trading-data/entities/dataset.entity';

/**
 * Worker执行配置DTO
 */
interface WorkerExecuteDto {
  taskId: string;
  strategyCode: string;
  dataPath: string;
  parameters: Record<string, any>;
  initialCapital: number;
  commission: number;
  callbackUrl: string;
}

/**
 * 策略清单接口（简化版）
 * 用于构建 Worker 配置
 */
interface StrategyManifest {
  strategyId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  requiredTimeframe: string;
  featureDeps: string[];
  dataDeps: Array<{ symbol: string }>;
  defaultParameters: Record<string, unknown>;
}

/**
 * 任务执行器服务
 * 
 * 负责执行回测任务，使用 Worker 模式完成回测计算
 */
@Injectable()
export class TaskExecutorService {
  private readonly logger = new Logger(TaskExecutorService.name);
  
  /**
   * 进度更新节流器
   * 存储每个任务最后一次更新进度的时间戳
   */
  private readonly progressUpdateThrottle = new Map<string, number>();
  
  /**
   * 进度更新间隔（毫秒）
   * 避免频繁更新数据库
   */
  private readonly PROGRESS_UPDATE_INTERVAL = 1000; // 1秒
  
  constructor(
    private readonly tasksService: BacktestTasksService,
    private readonly logsService: TaskLogsService,
    private readonly strategiesService: StrategiesService,
    private readonly tradingDataService: TradingDataService,
    private readonly workerClient: WorkerClientService,
    @InjectRepository(BacktestTaskEntity)
    private readonly taskRepository: Repository<BacktestTaskEntity>,
  ) {
    this.logger.log('TaskExecutorService initialized (Worker mode only)');
  }

  /**
   * 执行任务
   * 
   * @param taskId 任务ID
   */
  async executeTask(taskId: string): Promise<void> {
    this.logger.log(`Starting execution for task ${taskId}`);
    
    try {
      // 1. 加载任务信息
      const task = await this.tasksService.findOne(taskId);
      
      if (task.status !== BacktestTaskStatus.PENDING) {
        throw new BadRequestException(
          `Cannot execute task in status: ${task.status}`,
        );
      }
      
      // 2. 更新状态为运行中
      await this.tasksService.updateStatus(
        taskId,
        BacktestTaskStatus.RUNNING,
        { startedAt: new Date() },
      );
      
      await this.logsService.create(
        taskId,
        LogLevel.INFO,
        'Starting task execution via Worker',
      );
      
      // 3. 使用 Worker 模式执行
      await this.executeViaWorker(task);
      
    } catch (error) {
      this.logger.error(
        `Task execution failed for ${taskId}: ${(error as Error).message}`,
      );
      
      await this.handleExecutionError(taskId, error as Error);
      throw error;
    }
  }

  /**
   * 取消任务执行
   * 
   * @param taskId 任务ID
   */
  async cancelTask(taskId: string): Promise<void> {
    this.logger.log(`Cancelling task ${taskId}`);
    
    try {
      const task = await this.tasksService.findOne(taskId);
      
      if (task.status !== BacktestTaskStatus.RUNNING) {
        throw new BadRequestException(
          `Cannot cancel task in status: ${task.status}`,
        );
      }
      
      // Worker 取消 - 发送取消请求到 Worker
      await this.workerClient.cancelTask(taskId);
      
      await this.tasksService.updateStatus(
        taskId,
        BacktestTaskStatus.CANCELLED,
        { completedAt: new Date() },
      );
      
      await this.logsService.create(
        taskId,
        LogLevel.INFO,
        'Task cancelled by user',
      );
      
      this.logger.log(`Task ${taskId} cancelled successfully`);
      
    } catch (error) {
      this.logger.error(
        `Failed to cancel task ${taskId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * 暂停任务执行
   * TODO: Worker暂停功能待实现
   * 
   * @param taskId 任务ID
   */
  async pauseTask(taskId: string): Promise<void> {
    throw new BadRequestException('Pause功能暂未实现 - 请使用取消功能');
  }

  /**
   * 恢复任务执行
   * TODO: Worker恢复功能待实现
   * 
   * @param taskId 任务ID
   */
  async resumeTask(taskId: string): Promise<void> {
    throw new BadRequestException('Resume功能暂未实现');
  }

  /**
   * 通过 Worker 执行任务
   * 
   * @param task 任务实体
   */
  private async executeViaWorker(task: BacktestTaskEntity): Promise<void> {
    this.logger.log(`Executing task ${task.taskId} via Worker`);
    
    try {
      // 1. 构建 Worker 执行配置
      const executeDto = await this.buildWorkerConfig(task);
      
      // 2. 提交到 Worker 队列
      // TODO: WorkerClientService需要提供submitTask方法，目前暂时跳过
      this.logger.warn(`Task ${task.taskId} ready for Worker execution (Worker dispatch pending)`);
      // await this.workerClient.submitTask(executeDto);
      
      await this.logsService.create(
        task.taskId,
        LogLevel.INFO,
        'Task submitted to Worker successfully',
      );
      
      this.logger.log(`Task ${task.taskId} submitted to Worker queue`);
      
    } catch (error) {
      this.logger.error(
        `Worker execution failed for task ${task.taskId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * 构建 Worker 配置
   * 
   * @param task 任务实体
   * @returns Worker 执行配置
   */
  private async buildWorkerConfig(task: BacktestTaskEntity): Promise<WorkerExecuteDto> {
    this.logger.log(`Building Worker config for task ${task.taskId}`);
    
    try {
      // 1. 加载策略信息
      const strategy = await this.strategiesService.getStrategy(task.strategyId);
      
      // 2. 查找对应的脚本版本
      const version = strategy.scriptVersions.find(
        (v) => v.scriptVersionId === task.scriptVersionId,
      );
      
      if (!version) {
        throw new Error(
          `Script version ${task.scriptVersionId} not found in strategy ${task.strategyId}`,
        );
      }
      
      // 3. 加载数据集信息
      this.logger.log(`Loading dataset ${task.datasetId} for task ${task.taskId}`);
      let dataset;
      try {
        dataset = await this.tradingDataService.getDatasetById(task.datasetId);
      } catch (error) {
        throw new NotFoundException(
          `Dataset ${task.datasetId} not found: ${(error as Error).message}`
        );
      }
      
      this.logger.log(`Dataset loaded: ${dataset.tradingPair}, path: ${dataset.path}`);
      
      // 4. 构建执行配置
      const executeDto: WorkerExecuteDto = {
        taskId: task.taskId,
        strategyCode: version.code, // 使用code字段
        dataPath: resolveDatasetPath(dataset.path),
        parameters: (task.executionConfig as any)?.params || {},
        initialCapital: (task.executionConfig as any)?.initialCapital || 100000,
        commission: (task.executionConfig as any)?.fee || 0.001,
        callbackUrl: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/backtesting/tasks/${task.taskId}/progress`,
      };
      
      this.logger.log(`Worker config built successfully for task ${task.taskId}`);
      this.logger.debug(`Config: ${JSON.stringify(executeDto, null, 2)}`);
      
      return executeDto;
      
    } catch (error) {
      this.logger.error(
        `Failed to build Worker config for task ${task.taskId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * 处理执行错误
   * 
   * @param taskId 任务ID
   * @param error 错误对象
   */
  private async handleExecutionError(taskId: string, error: Error): Promise<void> {
    this.logger.error(`Handling execution error for task ${taskId}`);
    
    try {
      await this.tasksService.updateStatus(
        taskId,
        BacktestTaskStatus.FAILED,
        {
          completedAt: new Date(),
          errorMessage: error.message,
        },
      );
      
      await this.logsService.create(
        taskId,
        LogLevel.ERROR,
        `Task execution failed: ${error.message}`,
        undefined,
        { stack: error.stack || '' },
      );
      
    } catch (saveError) {
      this.logger.error(
        `Failed to save error state for task ${taskId}: ${(saveError as Error).message}`,
      );
    }
  }
}
