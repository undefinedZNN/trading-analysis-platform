/**
 * 策略执行器服务
 * 
 * 负责策略的生命周期管理和执行控制
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Subscription } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import {
  ExecutionStatus,
  ExecutionConfig,
  ExecutionSession,
  ExecutionMetrics,
  ExecutionLog,
  StrategyInstance,
  StrategyContext,
  MarketBar,
} from '../interfaces/execution.interface';
import { StrategyLoaderService } from './strategy-loader.service';
import { DataFeedService } from './data-feed.service';
import { ExecutionMonitorService } from './execution-monitor.service';

/**
 * 策略执行器
 */
@Injectable()
export class StrategyExecutorService {
  private readonly logger = new Logger(StrategyExecutorService.name);

  // 活跃会话
  private sessions = new Map<string, ExecutionSession>();
  
  // 策略实例
  private instances = new Map<string, StrategyInstance>();
  
  // 数据流订阅
  private subscriptions = new Map<string, Subscription>();
  
  // 执行指标
  private metrics = new Map<string, ExecutionMetrics>();
  
  // 执行日志
  private logs = new Map<string, ExecutionLog[]>();

  constructor(
    private readonly strategyLoader: StrategyLoaderService,
    private readonly dataFeed: DataFeedService,
    private readonly monitor: ExecutionMonitorService,
  ) {}

  /**
   * 启动策略执行
   * 
   * @param config 执行配置
   * @returns 执行会话
   */
  async start(config: ExecutionConfig): Promise<ExecutionSession> {
    const sessionId = uuidv4();
    
    this.logger.log(`Starting execution session: ${sessionId}`);

    // 创建会话
    const session: ExecutionSession = {
      sessionId,
      strategyId: config.strategyId,
      versionId: config.versionId,
      status: ExecutionStatus.LOADING,
      config,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // 初始化指标
    this.metrics.set(sessionId, {
      sessionId,
      barsProcessed: 0,
      eventsProcessed: 0,
      executionTime: 0,
      avgLatency: 0,
      signalsGenerated: 0,
      ordersPlaced: 0,
      errors: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      updatedAt: new Date(),
    });

    // 初始化日志
    this.logs.set(sessionId, []);

    try {
      // 1. 加载策略
      this.addLog(sessionId, 'info', 'Loading strategy...');
      const instance = await this.strategyLoader.loadStrategy(
        config.strategyId,
        config.versionId,
      );
      this.instances.set(sessionId, instance);

      // 2. 创建策略上下文
      const context = this.createContext(sessionId, config);

      // 3. 调用 onInit
      if (instance.lifecycle.onInit) {
        this.addLog(sessionId, 'info', 'Initializing strategy...');
        await instance.lifecycle.onInit(context);
      }

      // 4. 加载历史数据
      this.addLog(sessionId, 'info', 'Loading historical data...');
      // TODO: 从 datasetId 加载历史数据
      // 暂时使用模拟数据
      const historicalData = await this.dataFeed.loadHistoricalData(
        'BTCUSDT', // TODO: 从数据集获取交易对
        config.startTime,
        config.endTime,
        config.timeframe,
      );

      // 5. 开始回放
      session.status = ExecutionStatus.RUNNING;
      session.startedAt = new Date();
      this.addLog(sessionId, 'info', 'Starting data replay...');

      // 使用 concatMap 确保顺序执行,避免并发问题
      const subscription = this.dataFeed
        .replay(historicalData, config.speed || 1)
        .pipe(
          concatMap(async (bar) => {
            await this.processBar(sessionId, context, bar);
            return bar;
          }),
        )
        .subscribe({
          error: (error) => {
            this.handleError(sessionId, context, error);
          },
          complete: () => {
            this.complete(sessionId, context);
          },
        });

      this.subscriptions.set(sessionId, subscription);

      this.logger.log(`Execution session started: ${sessionId}`);

      return session;
    } catch (error) {
      session.status = ExecutionStatus.ERROR;
      session.error = error.message;
      this.addLog(sessionId, 'error', `Failed to start: ${error.message}`);
      throw error;
    }
  }

  /**
   * 停止策略执行
   * 
   * @param sessionId 会话ID
   */
  async stop(sessionId: string): Promise<void> {
    this.logger.log(`Stopping execution session: ${sessionId}`);

    const session = this.getSession(sessionId);
    const instance = this.instances.get(sessionId);
    const subscription = this.subscriptions.get(sessionId);

    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(sessionId);
    }

    this.dataFeed.stop();

    if (instance && instance.lifecycle.onStop) {
      const context = this.createContext(sessionId, session.config);
      await instance.lifecycle.onStop(context, 'manual_stop');
    }

    session.status = ExecutionStatus.STOPPED;
    session.endedAt = new Date();

    this.addLog(sessionId, 'info', 'Execution stopped');
    this.logger.log(`Execution session stopped: ${sessionId}`);
  }

  /**
   * 暂停策略执行
   * 
   * @param sessionId 会话ID
   */
  async pause(sessionId: string): Promise<void> {
    this.logger.log(`Pausing execution session: ${sessionId}`);

    const session = this.getSession(sessionId);
    
    if (session.status !== ExecutionStatus.RUNNING) {
      throw new Error('Cannot pause: session is not running');
    }

    this.dataFeed.pause();
    session.status = ExecutionStatus.PAUSED;

    this.addLog(sessionId, 'info', 'Execution paused');
  }

  /**
   * 恢复策略执行
   * 
   * @param sessionId 会话ID
   */
  async resume(sessionId: string): Promise<void> {
    this.logger.log(`Resuming execution session: ${sessionId}`);

    const session = this.getSession(sessionId);
    
    if (session.status !== ExecutionStatus.PAUSED) {
      throw new Error('Cannot resume: session is not paused');
    }

    this.dataFeed.resume();
    session.status = ExecutionStatus.RUNNING;

    this.addLog(sessionId, 'info', 'Execution resumed');
  }

  /**
   * 获取会话状态
   * 
   * @param sessionId 会话ID
   * @returns 执行会话
   */
  getStatus(sessionId: string): ExecutionSession {
    return this.getSession(sessionId);
  }

  /**
   * 获取执行指标
   * 
   * @param sessionId 会话ID
   * @returns 执行指标
   */
  getMetrics(sessionId: string): ExecutionMetrics {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) {
      throw new NotFoundException(`Metrics not found for session: ${sessionId}`);
    }
    return metrics;
  }

  /**
   * 获取执行日志
   * 
   * @param sessionId 会话ID
   * @param limit 限制数量
   * @returns 执行日志
   */
  getLogs(sessionId: string, limit?: number): ExecutionLog[] {
    const logs = this.logs.get(sessionId) || [];
    if (limit) {
      return logs.slice(-limit);
    }
    return logs;
  }

  /**
   * 处理Bar数据
   * 
   * @param sessionId 会话ID
   * @param context 策略上下文
   * @param bar Bar数据
   */
  private async processBar(
    sessionId: string,
    context: StrategyContext,
    bar: MarketBar,
  ): Promise<void> {
    const instance = this.instances.get(sessionId);
    const session = this.sessions.get(sessionId);
    const metrics = this.metrics.get(sessionId);

    if (!instance || !session || !metrics) {
      return;
    }

    const startTime = Date.now();

    try {
      // 更新当前时间
      session.currentTime = bar.timestamp;
      context.currentTime = bar.timestamp;

      // 调用 onBar
      if (instance.lifecycle.onBar) {
        await instance.lifecycle.onBar(context, bar);
      }

      // 更新指标
      metrics.barsProcessed++;
      metrics.eventsProcessed++;
      metrics.executionTime = Date.now() - startTime;
      metrics.avgLatency =
        (metrics.avgLatency * (metrics.barsProcessed - 1) +
          metrics.executionTime) /
        metrics.barsProcessed;
      metrics.updatedAt = new Date();

      // 记录到监控服务
      this.monitor.recordMetrics(sessionId, metrics);

      this.addLog(
        sessionId,
        'debug',
        `Processed bar: ${bar.symbol} ${bar.timestamp.toISOString()}`,
      );
    } catch (error) {
      metrics.errors++;
      await this.handleError(sessionId, context, error);
    }
  }

  /**
   * 处理错误
   * 
   * @param sessionId 会话ID
   * @param context 策略上下文
   * @param error 错误
   */
  private async handleError(
    sessionId: string,
    context: StrategyContext,
    error: Error,
  ): Promise<void> {
    const instance = this.instances.get(sessionId);
    const session = this.sessions.get(sessionId);

    this.addLog(sessionId, 'error', `Error: ${error.message}`, {
      stack: error.stack,
    });

    if (instance && instance.lifecycle.onError) {
      try {
        await instance.lifecycle.onError(context, error);
      } catch (handlerError) {
        this.logger.error('Error in error handler:', handlerError);
      }
    }

    // 严重错误停止执行
    if (session) {
      session.status = ExecutionStatus.ERROR;
      session.error = error.message;
      session.endedAt = new Date();
    }
  }

  /**
   * 完成执行
   * 
   * @param sessionId 会话ID
   * @param context 策略上下文
   */
  private async complete(
    sessionId: string,
    context: StrategyContext,
  ): Promise<void> {
    const instance = this.instances.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (instance && instance.lifecycle.onStop) {
      await instance.lifecycle.onStop(context, 'completed');
    }

    if (session) {
      session.status = ExecutionStatus.COMPLETED;
      session.endedAt = new Date();
    }

    this.addLog(sessionId, 'info', 'Execution completed');
    this.logger.log(`Execution session completed: ${sessionId}`);
  }

  /**
   * 创建策略上下文
   * 
   * @param sessionId 会话ID
   * @param config 执行配置
   * @returns 策略上下文
   */
  private createContext(
    sessionId: string,
    config: ExecutionConfig,
  ): StrategyContext {
    const self = this;

    return {
      strategyId: config.strategyId,
      sessionId,
      currentTime: new Date(),
      
      getParameters: <T = any>(): T => {
        // TODO: 返回策略参数
        return {} as T;
      },
      
      getPosition: (symbol: string) => {
        // TODO: 返回仓位信息
        return null;
      },
      
      getPortfolio: () => {
        // TODO: 返回投资组合
        return { cash: config.initialCapital, positions: [] };
      },
      
      getFeature: (bar: MarketBar, featureName: string) => {
        // TODO: 返回特征值
        return undefined;
      },
      
      publishIntent: (intent: any) => {
        // TODO: 发布交易意图
        const metrics = self.metrics.get(sessionId);
        if (metrics) {
          metrics.ordersPlaced++;
        }
        self.addLog(sessionId, 'info', 'Order intent published', intent);
      },
      
      log: (level: string, message: string, data?: any) => {
        self.addLog(sessionId, level as any, message, data);
      },
      
      metrics: {
        increment: (name: string, value: number = 1, tags?: any) => {
          const metrics = self.metrics.get(sessionId);
          if (metrics && name === 'signals') {
            metrics.signalsGenerated += value;
          }
        },
        gauge: (name: string, value: number, tags?: any) => {
          // TODO: 记录gauge指标
        },
      },
    };
  }

  /**
   * 添加日志
   * 
   * @param sessionId 会话ID
   * @param level 日志级别
   * @param message 日志消息
   * @param data 额外数据
   */
  private addLog(
    sessionId: string,
    level: ExecutionLog['level'],
    message: string,
    data?: any,
  ): void {
    const logs = this.logs.get(sessionId);
    if (logs) {
      logs.push({
        sessionId,
        level,
        message,
        timestamp: new Date(),
        data,
      });

      // 限制日志数量
      if (logs.length > 1000) {
        logs.shift();
      }
    }
  }

  /**
   * 获取会话
   * 
   * @param sessionId 会话ID
   * @returns 执行会话
   */
  private getSession(sessionId: string): ExecutionSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * 清理资源
   */
  onModuleDestroy(): void {
    // 停止所有会话
    for (const sessionId of this.sessions.keys()) {
      this.stop(sessionId).catch((error) => {
        this.logger.error(`Error stopping session ${sessionId}:`, error);
      });
    }
  }
}

