import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BacktestTasksService } from './backtest-tasks.service';
import { TaskLogsService } from './task-logs.service';
import { StrategiesService } from '../strategies/strategies.service';
import { TradingDataService } from '../../trading-data/trading-data.service';
import { BacktestTaskEntity, BacktestTaskStatus, ResultSummary } from './entities';
import {
  Orchestrator,
  Session,
  SessionEventType,
  BacktestSessionConfig,
  SessionEvent,
  createOrchestrator,
  createModuleCoordinator,
} from '../orchestrator';

/**
 * 策略清单接口（简化版）
 * 用于构建 Orchestrator 配置
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
 * 负责执行回测任务，调用 Orchestrator 完成回测计算
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
  
  /**
   * 活跃的会话映射
   * 用于任务取消时停止会话
   */
  private readonly activeSessions = new Map<string, Session>();
  
  /**
   * Orchestrator 实例
   */
  private readonly orchestrator: Orchestrator;

  constructor(
    private readonly tasksService: BacktestTasksService,
    private readonly logsService: TaskLogsService,
    private readonly strategiesService: StrategiesService,
    private readonly tradingDataService: TradingDataService,
    @InjectRepository(BacktestTaskEntity)
    private readonly taskRepository: Repository<BacktestTaskEntity>,
  ) {
    // 创建 Orchestrator 实例
    const moduleCoordinator = createModuleCoordinator();
    this.orchestrator = createOrchestrator(moduleCoordinator);
    
    this.logger.log('TaskExecutorService initialized with TradingDataService');
  }

  /**
   * 执行任务
   * 
   * @param taskId 任务ID
   */
  async executeTask(taskId: string): Promise<void> {
    this.logger.log(`Starting task execution: ${taskId}`);
    
    try {
      // 1. 获取任务
      const task = await this.tasksService.findOne(taskId);
      
      // 2. 验证状态
      if (task.status !== BacktestTaskStatus.PENDING) {
        throw new BadRequestException(
          `Task ${taskId} is not in pending status (current: ${task.status})`
        );
      }
      
      // 3. 更新状态为 running
      await this.tasksService.updateStatus(taskId, BacktestTaskStatus.RUNNING);
      await this.logsService.info(taskId, 'TaskExecutor', 'Task execution started');
      
      // 4. 准备 Orchestrator 配置
      const config = await this.prepareOrchestratorConfig(task);
      
      // 5. 创建会话
      const session = await this.orchestrator.createSession(config);
      this.activeSessions.set(taskId, session);
      
      // 6. 订阅事件
      this.subscribeToEvents(session, taskId);
      
      // 7. 启动执行
      await this.orchestrator.start(taskId);
      
      this.logger.log(`Task ${taskId} started successfully`);
      
    } catch (error) {
      this.logger.error(`Failed to start task ${taskId}: ${error.message}`);
      await this.handleError(taskId, error as Error);
      throw error;
    }
  }

  /**
   * 取消任务
   * 
   * @param taskId 任务ID
   */
  async cancelTask(taskId: string): Promise<void> {
    this.logger.log(`Cancelling task ${taskId}`);
    
    try {
      // 1. 检查任务状态
      const task = await this.tasksService.findOne(taskId);
      
      if (task.status !== BacktestTaskStatus.RUNNING) {
        throw new BadRequestException(
          `Only running tasks can be cancelled (current status: ${task.status})`
        );
      }
      
      // 2. 停止 Orchestrator 会话
      const session = this.activeSessions.get(taskId);
      if (session) {
        await this.orchestrator.stop(taskId, 'User cancelled');
        this.activeSessions.delete(taskId);
      }
      
      // 3. 更新状态
      await this.tasksService.updateStatus(taskId, BacktestTaskStatus.CANCELLED);
      await this.taskRepository.update(
        { taskId },
        { completedAt: new Date() }
      );
      
      // 4. 记录日志
      await this.logsService.info(taskId, 'TaskExecutor', 'Task cancelled by user');
      
      // 5. 清理资源
      this.progressUpdateThrottle.delete(taskId);
      
      this.logger.log(`Task ${taskId} cancelled successfully`);
      
    } catch (error) {
      this.logger.error(`Failed to cancel task ${taskId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 准备 Orchestrator 配置
   * 
   * @param task 任务实体
   * @returns Orchestrator 配置
   */
  private async prepareOrchestratorConfig(
    task: BacktestTaskEntity,
  ): Promise<BacktestSessionConfig> {
    this.logger.log(`Preparing config for task ${task.taskId}`);
    
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
      
      // 4. 构建 StrategyManifest
      const factorSchemaArray = Array.isArray(version.factorSchema) 
        ? version.factorSchema 
        : [];
      const parameterSchemaArray = Array.isArray(version.parameterSchema)
        ? version.parameterSchema
        : [];
      
      const manifest: StrategyManifest = {
        strategyId: strategy.strategyId,
        name: strategy.name,
        version: version.versionName,
        description: strategy.description || '',
        author: version.createdBy || 'system',
        requiredTimeframe: dataset.granularity,
        featureDeps: factorSchemaArray.map((f: any) => f.id || f.key),
        dataDeps: [{ symbol: dataset.tradingPair }],
        defaultParameters: parameterSchemaArray.reduce((acc: any, p: any) => {
          acc[p.id || p.key] = p.defaultValue;
          return acc;
        }, {}),
      };
      
      // 5. 构建配置
      const executionConfig = task.executionConfig as any;
      
      // 确定数据时间范围：优先使用任务配置，否则使用数据集的完整范围
      const dataTimeRange = task.dataConfig?.timeRange || {
        start: dataset.timeStart.toISOString(),
        end: dataset.timeEnd.toISOString(),
      };
      
      const config: BacktestSessionConfig = {
        sessionId: task.taskId,
        
        // 策略配置
        strategy: {
          strategyId: strategy.strategyId,
          name: strategy.name,
          scriptContent: version.code,
          manifest,
          parameters: task.strategyParams,
        },
        
        // 数据配置（从数据集动态加载）
        data: {
          source: {
            provider: 'parquet-duckdb',
            path: dataset.path, // 从数据集获取实际路径
            symbols: [dataset.tradingPair], // 从数据集获取交易对
            timeRange: dataTimeRange,
          },
          timeframe: {
            primary: task.dataConfig?.timeframe || dataset.granularity,
          },
        },
        
        // 执行配置
        execution: {
          initialCapital: String(executionConfig?.initialCapital || 10000),
          matching: {
            marketFillPolicy: 'close',
          },
          slippage: {
            model: 'proportional',
            params: {
              rate: executionConfig?.slippage || 0,
            },
          },
          fee: {
            model: 'fixed-rate',
            params: {
              maker: executionConfig?.fees?.makerFee || 0.0002,
              taker: executionConfig?.fees?.takerFee || 0.0005,
            },
          },
        },
        
        // 风控配置（使用默认值）
        risk: {
          rules: [],
        },
        
        // 日志配置
        log: {
          level: 'info',
          console: false, // 禁用控制台输出，通过事件收集日志
        },
      };
      
      this.logger.log(`Config prepared for task ${task.taskId}`);
      return config;
      
    } catch (error) {
      this.logger.error(`Failed to prepare config: ${error.message}`);
      throw error;
    }
  }

  /**
   * 订阅会话事件
   * 
   * @param session 会话实例
   * @param taskId 任务ID
   */
  private subscribeToEvents(session: Session, taskId: string): void {
    this.logger.log(`Subscribing to events for task ${taskId}`);
    
    // 进度事件
    session.on(SessionEventType.ProgressUpdated, (event: SessionEvent) => {
      const progress = (event.data as any)?.progress || 0;
      this.handleProgress(taskId, progress).catch((error) => {
        this.logger.error(`Failed to handle progress: ${error.message}`);
      });
    });
    
    // 完成事件
    session.on(SessionEventType.Completed, (event: SessionEvent) => {
      this.handleCompletion(taskId, event.data).catch((error) => {
        this.logger.error(`Failed to handle completion: ${error.message}`);
      });
    });
    
    // 失败事件
    session.on(SessionEventType.Failed, (event: SessionEvent) => {
      const error = new Error((event.data as any)?.message || 'Session failed');
      this.handleError(taskId, error).catch((err) => {
        this.logger.error(`Failed to handle error: ${err.message}`);
      });
    });
    
    // 状态变化事件
    session.on(SessionEventType.StateChanged, (event: SessionEvent) => {
      const data = event.data as any;
      this.logsService
        .info(
          taskId,
          'Orchestrator',
          `Session state changed: ${data?.previousState} -> ${data?.currentState}`,
        )
        .catch((error) => {
          this.logger.error(`Failed to log state change: ${error.message}`);
        });
    });
    
    this.logger.log(`Event subscriptions created for task ${taskId}`);
  }

  /**
   * 处理进度更新
   * 
   * @param taskId 任务ID
   * @param progress 进度百分比 (0-100)
   */
  private async handleProgress(taskId: string, progress: number): Promise<void> {
    // 节流：每秒最多更新一次（除非是100%）
    const lastUpdate = this.progressUpdateThrottle.get(taskId) || 0;
    const now = Date.now();
    
    if (now - lastUpdate < this.PROGRESS_UPDATE_INTERVAL && progress < 100) {
      return;
    }
    
    this.progressUpdateThrottle.set(taskId, now);
    
    // 更新数据库
    await this.tasksService.updateProgress(taskId, Math.round(progress));
    
    // 记录日志（每10%记录一次）
    if (progress % 10 === 0 || progress === 100) {
      await this.logsService.info(
        taskId,
        'TaskExecutor',
        `Progress: ${Math.round(progress)}%`,
      );
    }
  }

  /**
   * 处理任务完成
   * 
   * @param taskId 任务ID
   * @param result 执行结果
   */
  private async handleCompletion(taskId: string, result: any): Promise<void> {
    this.logger.log(`Task ${taskId} completed successfully`);
    
    try {
      // 1. 提取结果摘要
      const resultSummary = this.extractResultSummary(result);
      
      // 2. 保存结果文件路径（如果有）
      // TODO: 实现详细结果文件保存
      const resultFilePath = undefined;
      
      // 3. 更新任务状态
      await this.tasksService.updateStatus(taskId, BacktestTaskStatus.COMPLETED);
      await this.tasksService.updateProgress(taskId, 100);
      await this.taskRepository.update(
        { taskId },
        {
          completedAt: new Date(),
          resultSummary,
          resultFilePath,
        }
      );
      
      // 4. 记录日志
      await this.logsService.info(
        taskId,
        'TaskExecutor',
        'Task completed successfully',
        { resultSummary },
      );
      
      // 5. 清理资源
      this.progressUpdateThrottle.delete(taskId);
      this.activeSessions.delete(taskId);
      
    } catch (error) {
      this.logger.error(`Failed to save task result: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从执行结果中提取摘要
   * 
   * @param result Orchestrator 执行结果
   * @returns 结果摘要
   */
  private extractResultSummary(result: any): ResultSummary {
    // TODO: 根据实际的 Orchestrator 结果格式调整
    return {
      totalReturn: result?.metrics?.totalReturn || 0,
      annualizedReturn: result?.metrics?.annualizedReturn || 0,
      maxDrawdown: result?.metrics?.maxDrawdown || 0,
      sharpeRatio: result?.metrics?.sharpeRatio || 0,
      winRate: result?.metrics?.winRate || 0,
      profitLossRatio: result?.metrics?.profitLossRatio || 0,
      totalTrades: result?.trades?.length || 0,
      finalCapital: result?.portfolio?.equity || 0,
      processedBars: result?.processedBars || 0,
      executionTime: result?.executionTime || 0,
    };
  }

  /**
   * 处理错误
   * 
   * @param taskId 任务ID
   * @param error 错误对象
   */
  private async handleError(taskId: string, error: Error): Promise<void> {
    this.logger.error(`Task ${taskId} failed: ${error.message}`);
    
    try {
      // 1. 更新任务状态
      await this.tasksService.updateStatus(taskId, BacktestTaskStatus.FAILED);
      await this.taskRepository.update(
        { taskId },
        {
          completedAt: new Date(),
          errorMessage: error.message,
          errorStack: error.stack,
        }
      );
      
      // 2. 记录错误日志
      await this.logsService.error(
        taskId,
        'TaskExecutor',
        `Task execution failed: ${error.message}`,
        {
          errorStack: error.stack,
          errorName: error.name,
        },
      );
      
      // 3. 清理资源
      this.progressUpdateThrottle.delete(taskId);
      this.activeSessions.delete(taskId);
      
    } catch (saveError) {
      this.logger.error(
        `Failed to save error state for task ${taskId}: ${(saveError as Error).message}`,
      );
    }
  }
}

