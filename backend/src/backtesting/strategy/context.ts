/**
 * StrategyContext 实现
 * 
 * 提供策略访问系统资源的统一接口
 */

import { Observable } from 'rxjs';
import { nanoid } from 'nanoid';
import type {
  StrategyContext,
  StrategyMetrics,
  StrategyManifest,
  StrategySnapshot,
  OrderIntentPayload,
  MarketBarPayload,
  PositionSnapshot,
  PortfolioUpdatePayload,
  LogLevel,
  BaseEvent,
  StrategyLogPayload,
  StrategyMetricPayload,
  PortfolioStore,
} from './interfaces';

/**
 * EventBus 最小接口
 * 避免循环依赖，只定义需要的方法
 */
export interface IEventBus {
  publish<T = unknown>(event: BaseEvent<T>): void;
}

/**
 * 策略指标实现
 */
class StrategyMetricsImpl implements StrategyMetrics {
  constructor(
    private readonly strategyId: string,
    private readonly sessionId: string,
    private readonly eventBus: IEventBus
  ) {}

  increment(counter: string, value: number = 1, tags?: Record<string, string>): void {
    this.publishMetric('counter', counter, value, tags);
  }

  observe(histogram: string, value: number, tags?: Record<string, string>): void {
    this.publishMetric('histogram', histogram, value, tags);
  }

  gauge(metric: string, value: number, tags?: Record<string, string>): void {
    this.publishMetric('gauge', metric, value, tags);
  }

  private publishMetric(
    metricType: 'counter' | 'histogram' | 'gauge',
    metricName: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    const payload: StrategyMetricPayload = {
      strategyId: this.strategyId,
      metricType,
      metricName,
      value,
      tags,
    };

    const event: BaseEvent<StrategyMetricPayload> = {
      eventId: generateId(),
      eventType: 'strategy.metric',
      sessionId: this.sessionId,
      sequenceId: '', // 由 EventBus 分配
      timestamp: Date.now(),
      source: this.strategyId,
      payload,
    };

    this.eventBus.publish(event);
  }
}

/**
 * 策略上下文实现
 */
export class StrategyContextImpl implements StrategyContext {
  // 基础信息
  public readonly sessionId: string;
  public readonly strategyId: string;
  public readonly manifest: StrategyManifest;

  // 指标接口
  public readonly metrics: StrategyMetrics;

  // 共享状态
  public readonly sharedState: Map<string, Observable<unknown>>;

  // 私有状态
  private currentTimestamp: string;
  private parameters: Record<string, unknown>;
  private parameterOverrides: Record<string, unknown>;

  constructor(
    sessionId: string,
    strategyId: string,
    manifest: StrategyManifest,
    private readonly eventBus: IEventBus,
    private readonly portfolioStore: PortfolioStore
  ) {
    this.sessionId = sessionId;
    this.strategyId = strategyId;
    this.manifest = manifest;
    this.currentTimestamp = new Date().toISOString();
    this.parameters = { ...manifest.defaultParameters };
    this.parameterOverrides = {};
    this.sharedState = new Map();

    // 创建指标接口
    this.metrics = new StrategyMetricsImpl(strategyId, sessionId, eventBus);
  }

  // ===== 时间相关 =====

  now(): string {
    return this.currentTimestamp;
  }

  /**
   * 内部方法：更新当前时间戳
   * 在处理事件时由沙箱调用
   */
  updateTimestamp(timestamp: string | number): void {
    if (typeof timestamp === 'number') {
      this.currentTimestamp = new Date(timestamp).toISOString();
    } else {
      this.currentTimestamp = timestamp;
    }
  }

  // ===== 交易操作 =====

  publishIntent(intent: OrderIntentPayload): void {
    const event: BaseEvent<OrderIntentPayload> = {
      eventId: generateId(),
      eventType: 'strategy.intent',
      sessionId: this.sessionId,
      sequenceId: '', // 由 EventBus 分配
      timestamp: this.currentTimestamp,
      source: this.strategyId,
      payload: {
        ...intent,
        strategyId: this.strategyId,
      },
    };

    this.eventBus.publish(event);
    
    // 记录日志
    this.log('debug', `Published intent: ${intent.intentId}`, {
      symbol: intent.symbol,
      side: intent.side,
      quantity: intent.quantity,
    });
  }

  cancelIntent(intentId: string): void {
    // 发布取消意图事件
    const event: BaseEvent<{ intentId: string }> = {
      eventId: generateId(),
      eventType: 'strategy.cancel_intent',
      sessionId: this.sessionId,
      sequenceId: '',
      timestamp: this.currentTimestamp,
      source: this.strategyId,
      payload: {
        intentId,
      },
    };

    this.eventBus.publish(event);
    
    this.log('debug', `Canceled intent: ${intentId}`);
  }

  // ===== 仓位查询 =====

  getPosition(symbol: string): PositionSnapshot | undefined {
    return this.portfolioStore.getPosition(this.strategyId, symbol);
  }

  getPortfolio(): PortfolioUpdatePayload {
    return this.portfolioStore.getPortfolio(this.strategyId);
  }

  // ===== 特征访问 =====

  getFeature(event: MarketBarPayload, featureId: string): string | number | undefined {
    if (!event.features) {
      return undefined;
    }
    return event.features[featureId];
  }

  // ===== 参数访问 =====

  getParameters<T = Record<string, unknown>>(): T {
    // 合并默认参数和覆盖参数
    return {
      ...this.parameters,
      ...this.parameterOverrides,
    } as T;
  }

  setParameterOverrides(params: Record<string, unknown>): void {
    this.parameterOverrides = {
      ...this.parameterOverrides,
      ...params,
    };
    
    this.log('info', 'Parameter overrides updated', params);
  }

  // ===== 日志与指标 =====

  log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    const payload: StrategyLogPayload = {
      strategyId: this.strategyId,
      level,
      message,
      extra,
    };

    const event: BaseEvent<StrategyLogPayload> = {
      eventId: generateId(),
      eventType: 'strategy.log',
      sessionId: this.sessionId,
      sequenceId: '',
      timestamp: this.currentTimestamp,
      source: this.strategyId,
      payload,
    };

    this.eventBus.publish(event);

    // 同时输出到控制台（开发模式）
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${this.strategyId}]`;
      switch (level) {
        case 'debug':
          console.debug(prefix, message, extra);
          break;
        case 'info':
          console.info(prefix, message, extra);
          break;
        case 'warn':
          console.warn(prefix, message, extra);
          break;
        case 'error':
          console.error(prefix, message, extra);
          break;
      }
    }
  }

  // ===== 状态管理 =====

  async requestSnapshot(): Promise<StrategySnapshot> {
    // 这个方法由沙箱实现调用策略的 onSnapshot
    // 这里只是一个占位，实际由 SnapshotManager 处理
    return {
      state: {},
      sharedState: {},
      createdAt: this.currentTimestamp,
      lastSequenceId: '',
    };
  }

  // ===== 共享状态 =====

  registerSharedState(key: string, observable: Observable<unknown>): void {
    this.sharedState.set(key, observable);
    this.log('debug', `Registered shared state: ${key}`);
  }

  // ===== 内部辅助方法 =====

  /**
   * 内部方法：重置参数覆盖
   */
  clearParameterOverrides(): void {
    this.parameterOverrides = {};
  }

  /**
   * 内部方法：获取当前参数值
   */
  getParameter<T = unknown>(key: string): T | undefined {
    const params = this.getParameters();
    return params[key] as T | undefined;
  }
}

/**
 * 生成唯一 ID (使用 nanoid)
 */
function generateId(): string {
  return nanoid();
}

/**
 * 创建策略上下文
 * 工厂函数
 */
export function createStrategyContext(
  sessionId: string,
  strategyId: string,
  manifest: StrategyManifest,
  eventBus: IEventBus,
  portfolioStore: PortfolioStore
): StrategyContext {
  return new StrategyContextImpl(
    sessionId,
    strategyId,
    manifest,
    eventBus,
    portfolioStore
  );
}

