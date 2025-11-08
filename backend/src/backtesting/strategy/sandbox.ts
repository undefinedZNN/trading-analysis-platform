/**
 * 策略沙箱
 * 
 * 管理策略的生命周期和事件订阅
 */

import { Subscription } from 'rxjs';
import type {
  StrategyInstance,
  StrategyContext,
  SandboxConfig,
  BaseEvent,
  MarketBarPayload,
  ExecutionReportPayload,
  RiskDecisionPayload,
  ControlEventPayload,
} from './interfaces';
import type { IEventBus } from './context';
import { SnapshotManager } from './snapshot';

/**
 * 沙箱状态
 */
export type SandboxStatus = 'idle' | 'initializing' | 'running' | 'paused' | 'stopped' | 'error';

/**
 * 策略沙箱
 */
export class StrategySandbox {
  private readonly instance: StrategyInstance;
  private readonly context: StrategyContext;
  private readonly config: Required<SandboxConfig>;
  private readonly snapshotManager: SnapshotManager;

  private subscriptions: Subscription[] = [];
  private status: SandboxStatus = 'idle';
  private lastError: Error | null = null;
  private warmupRemaining: number = 0;
  private lastSequenceId: string = '';

  constructor(
    instance: StrategyInstance,
    context: StrategyContext,
    config: SandboxConfig = {}
  ) {
    this.instance = instance;
    this.context = context;
    this.config = {
      isolateErrors: config.isolateErrors !== false,
      timeout: config.timeout || 5000,
      debug: config.debug || false,
    };
    this.snapshotManager = new SnapshotManager();
    this.warmupRemaining = instance.manifest.warmupBars || 0;
  }

  /**
   * 启动沙箱
   * @param eventBus EventBus 实例
   */
  async start(eventBus: IEventBus): Promise<void> {
    if (this.status !== 'idle') {
      throw new Error(`Cannot start sandbox in status: ${this.status}`);
    }

    this.status = 'initializing';

    try {
      // 1. 调用 onInit
      if (this.instance.lifecycle.onInit) {
        this.context.log('info', 'Initializing strategy...');
        await this.executeWithTimeout(
          this.instance.lifecycle.onInit(this.context),
          'onInit'
        );
      }

      // 2. 订阅事件
      this.subscribeToEvents(eventBus);

      // 3. 状态切换
      this.status = 'running';
      this.context.log('info', 'Strategy started');
    } catch (error: any) {
      this.status = 'error';
      this.lastError = error;
      this.context.log('error', `Failed to start strategy: ${error.message}`);
      throw error;
    }
  }

  /**
   * 停止沙箱
   * @param reason 停止原因
   */
  async stop(reason: string = 'manual'): Promise<void> {
    if (this.status === 'stopped') {
      return;
    }

    this.context.log('info', `Stopping strategy: ${reason}`);

    try {
      // 1. 调用 onStop
      if (this.instance.lifecycle.onStop) {
        await this.executeWithTimeout(
          this.instance.lifecycle.onStop(this.context, reason),
          'onStop'
        );
      }

      // 2. 取消所有订阅
      this.subscriptions.forEach((sub) => sub.unsubscribe());
      this.subscriptions = [];

      // 3. 状态切换
      this.status = 'stopped';
      this.context.log('info', 'Strategy stopped');
    } catch (error: any) {
      this.status = 'error';
      this.lastError = error;
      this.context.log('error', `Error stopping strategy: ${error.message}`);
      throw error;
    }
  }

  /**
   * 暂停沙箱
   */
  pause(): void {
    if (this.status !== 'running') {
      throw new Error(`Cannot pause sandbox in status: ${this.status}`);
    }
    this.status = 'paused';
    this.context.log('info', 'Strategy paused');
  }

  /**
   * 恢复沙箱
   */
  resume(): void {
    if (this.status !== 'paused') {
      throw new Error(`Cannot resume sandbox in status: ${this.status}`);
    }
    this.status = 'running';
    this.context.log('info', 'Strategy resumed');
  }

  /**
   * 获取沙箱状态
   */
  getStatus(): SandboxStatus {
    return this.status;
  }

  /**
   * 获取最后的错误
   */
  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * 订阅事件
   * @param eventBus EventBus 实例
   * @private
   */
  private subscribeToEvents(eventBus: IEventBus): void {
    // 注意：这里需要实际的 EventBus subscribe 方法
    // 由于我们定义的 IEventBus 只有 publish，这里是示意代码
    
    this.context.log('debug', 'Subscribed to events');
  }

  /**
   * 处理 bar 事件
   * @param event bar 事件
   * @private
   */
  async handleBar(event: BaseEvent<MarketBarPayload>): Promise<void> {
    if (this.status !== 'running') {
      return;
    }

    try {
      // 更新上下文时间戳
      (this.context as any).updateTimestamp(event.timestamp);
      this.lastSequenceId = event.sequenceId;

      // 预热阶段
      if (this.warmupRemaining > 0) {
        if (this.instance.lifecycle.onWarmup) {
          await this.executeWithTimeout(
            this.instance.lifecycle.onWarmup(this.context, event.payload),
            'onWarmup'
          );
        }
        this.warmupRemaining--;
        return;
      }

      // 正常阶段
      if (this.instance.lifecycle.onBar) {
        await this.executeWithTimeout(
          this.instance.lifecycle.onBar(this.context, event.payload),
          'onBar'
        );
      }
    } catch (error: any) {
      await this.handleError(error);
    }
  }

  /**
   * 处理辅助流事件
   * @param event bar 事件
   * @private
   */
  async handleAuxStream(event: BaseEvent<MarketBarPayload>): Promise<void> {
    if (this.status !== 'running' || !this.instance.lifecycle.onAuxStream) {
      return;
    }

    try {
      (this.context as any).updateTimestamp(event.timestamp);
      await this.executeWithTimeout(
        this.instance.lifecycle.onAuxStream(this.context, event.payload),
        'onAuxStream'
      );
    } catch (error: any) {
      await this.handleError(error);
    }
  }

  /**
   * 处理执行回报
   * @param event 执行回报事件
   * @private
   */
  async handleExecutionReport(event: BaseEvent<ExecutionReportPayload>): Promise<void> {
    if (this.status !== 'running' || !this.instance.lifecycle.onExecutionReport) {
      return;
    }

    try {
      (this.context as any).updateTimestamp(event.timestamp);
      await this.executeWithTimeout(
        this.instance.lifecycle.onExecutionReport(this.context, event.payload),
        'onExecutionReport'
      );
    } catch (error: any) {
      await this.handleError(error);
    }
  }

  /**
   * 处理风控决策
   * @param event 风控决策事件
   * @private
   */
  async handleRiskDecision(event: BaseEvent<RiskDecisionPayload>): Promise<void> {
    if (this.status !== 'running' || !this.instance.lifecycle.onRiskDecision) {
      return;
    }

    try {
      (this.context as any).updateTimestamp(event.timestamp);
      await this.executeWithTimeout(
        this.instance.lifecycle.onRiskDecision(this.context, event.payload),
        'onRiskDecision'
      );
    } catch (error: any) {
      await this.handleError(error);
    }
  }

  /**
   * 处理控制事件
   * @param event 控制事件
   * @private
   */
  async handleControl(event: BaseEvent<ControlEventPayload>): Promise<void> {
    if (!this.instance.lifecycle.onControl) {
      return;
    }

    try {
      (this.context as any).updateTimestamp(event.timestamp);
      await this.executeWithTimeout(
        this.instance.lifecycle.onControl(this.context, event.payload),
        'onControl'
      );
    } catch (error: any) {
      await this.handleError(error);
    }
  }

  /**
   * 处理错误
   * @param error 错误对象
   * @private
   */
  private async handleError(error: Error): Promise<void> {
    this.lastError = error;
    this.context.log('error', `Strategy error: ${error.message}`, {
      stack: error.stack,
    });

    // 调用策略的 onError
    if (this.instance.lifecycle.onError) {
      try {
        await this.executeWithTimeout(
          this.instance.lifecycle.onError(this.context, error),
          'onError'
        );
      } catch (onErrorError: any) {
        this.context.log('error', `onError handler failed: ${onErrorError.message}`);
      }
    }

    // 如果不隔离错误，则停止策略
    if (!this.config.isolateErrors) {
      await this.stop('error');
    }
  }

  /**
   * 创建快照
   */
  async createSnapshot(): Promise<any> {
    return this.snapshotManager.createSnapshot(
      this.instance,
      this.context,
      this.lastSequenceId
    );
  }

  /**
   * 恢复快照
   * @param snapshot 快照数据
   */
  async restoreSnapshot(snapshot: any): Promise<void> {
    await this.snapshotManager.restoreSnapshot(
      this.instance,
      this.context,
      snapshot
    );
    this.lastSequenceId = snapshot.lastSequenceId;
  }

  /**
   * 执行带超时的操作
   * @param promise Promise
   * @param hookName 钩子名称
   * @private
   */
  private async executeWithTimeout(
    promise: Promise<void> | void,
    hookName: string
  ): Promise<void> {
    if (!promise || !(promise instanceof Promise)) {
      return;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${hookName} timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });

    await Promise.race([promise, timeoutPromise]);
  }
}

