/**
 * 执行监控服务
 * 
 * 负责监控策略执行的性能、资源使用和异常检测
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExecutionMetrics } from '../interfaces/execution.interface';

/**
 * 资源使用统计
 */
export interface ResourceStats {
  /** CPU使用率 (%) */
  cpuUsage: number;
  /** 内存使用 (MB) */
  memoryUsage: number;
  /** 堆内存使用 (MB) */
  heapUsed: number;
  /** 堆内存总量 (MB) */
  heapTotal: number;
  /** 外部内存 (MB) */
  external: number;
  /** 更新时间 */
  timestamp: Date;
}

/**
 * 异常事件
 */
export interface AnomalyEvent {
  /** 会话ID */
  sessionId: string;
  /** 异常类型 */
  type: 'high_latency' | 'high_memory' | 'high_cpu' | 'high_error_rate' | 'stalled';
  /** 严重程度 */
  severity: 'warning' | 'critical';
  /** 描述 */
  message: string;
  /** 当前值 */
  value: number;
  /** 阈值 */
  threshold: number;
  /** 时间戳 */
  timestamp: Date;
}

/**
 * 监控配置
 */
export interface MonitorConfig {
  /** 采样间隔 (ms) */
  sampleInterval?: number;
  /** 延迟阈值 (ms) */
  latencyThreshold?: number;
  /** CPU使用率阈值 (%) */
  cpuThreshold?: number;
  /** 内存使用阈值 (MB) */
  memoryThreshold?: number;
  /** 错误率阈值 (%) */
  errorRateThreshold?: number;
  /** 停滞检测间隔 (ms) */
  stalledThreshold?: number;
}

/**
 * 执行监控服务
 */
@Injectable()
export class ExecutionMonitorService {
  private readonly logger = new Logger(ExecutionMonitorService.name);

  // 默认配置
  private readonly defaultConfig: Required<MonitorConfig> = {
    sampleInterval: 1000, // 1秒
    latencyThreshold: 100, // 100ms
    cpuThreshold: 80, // 80%
    memoryThreshold: 500, // 500MB
    errorRateThreshold: 5, // 5%
    stalledThreshold: 10000, // 10秒
  };

  // 监控配置
  private config: Required<MonitorConfig>;

  // 会话指标历史
  private metricsHistory = new Map<string, ExecutionMetrics[]>();

  // 资源统计历史
  private resourceHistory: ResourceStats[] = [];

  // 上次Bar处理时间
  private lastBarTime = new Map<string, Date>();

  // 监控定时器
  private monitorTimer?: NodeJS.Timeout;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.config = { ...this.defaultConfig };
  }

  /**
   * 启动监控
   * 
   * @param config 监控配置
   */
  start(config?: MonitorConfig): void {
    this.logger.log('Starting execution monitor');

    // 更新配置
    if (config) {
      this.config = { ...this.defaultConfig, ...config };
    }

    // 启动定时采样
    this.monitorTimer = setInterval(() => {
      this.collectResourceStats();
      this.detectAnomalies();
    }, this.config.sampleInterval);
  }

  /**
   * 停止监控
   */
  stop(): void {
    this.logger.log('Stopping execution monitor');

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }
  }

  /**
   * 记录指标
   * 
   * @param sessionId 会话ID
   * @param metrics 执行指标
   */
  recordMetrics(sessionId: string, metrics: ExecutionMetrics): void {
    // 获取或创建历史记录
    let history = this.metricsHistory.get(sessionId);
    if (!history) {
      history = [];
      this.metricsHistory.set(sessionId, history);
    }

    // 添加到历史
    history.push({ ...metrics });

    // 限制历史记录数量 (保留最近1000条)
    if (history.length > 1000) {
      history.shift();
    }

    // 更新最后处理时间
    this.lastBarTime.set(sessionId, new Date());

    // 发送指标更新事件
    this.eventEmitter.emit('execution.metrics', {
      sessionId,
      metrics,
    });
  }

  /**
   * 获取指标历史
   * 
   * @param sessionId 会话ID
   * @param limit 限制数量
   * @returns 指标历史
   */
  getMetricsHistory(sessionId: string, limit?: number): ExecutionMetrics[] {
    const history = this.metricsHistory.get(sessionId) || [];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * 获取资源统计
   * 
   * @param limit 限制数量
   * @returns 资源统计历史
   */
  getResourceStats(limit?: number): ResourceStats[] {
    if (limit) {
      return this.resourceHistory.slice(-limit);
    }
    return this.resourceHistory;
  }

  /**
   * 获取最新资源统计
   * 
   * @returns 最新资源统计
   */
  getLatestResourceStats(): ResourceStats | null {
    if (this.resourceHistory.length === 0) {
      return null;
    }
    return this.resourceHistory[this.resourceHistory.length - 1];
  }

  /**
   * 清理会话数据
   * 
   * @param sessionId 会话ID
   */
  clearSession(sessionId: string): void {
    this.metricsHistory.delete(sessionId);
    this.lastBarTime.delete(sessionId);
  }

  /**
   * 收集资源统计
   */
  private collectResourceStats(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const stats: ResourceStats = {
      cpuUsage: this.calculateCpuUsage(cpuUsage),
      memoryUsage: memUsage.rss / 1024 / 1024, // 转换为MB
      heapUsed: memUsage.heapUsed / 1024 / 1024,
      heapTotal: memUsage.heapTotal / 1024 / 1024,
      external: memUsage.external / 1024 / 1024,
      timestamp: new Date(),
    };

    // 添加到历史
    this.resourceHistory.push(stats);

    // 限制历史记录数量 (保留最近1000条)
    if (this.resourceHistory.length > 1000) {
      this.resourceHistory.shift();
    }

    // 发送资源统计事件
    this.eventEmitter.emit('execution.resource', stats);
  }

  /**
   * 计算CPU使用率
   * 
   * @param cpuUsage CPU使用信息
   * @returns CPU使用率 (%)
   */
  private calculateCpuUsage(cpuUsage: NodeJS.CpuUsage): number {
    // 简化计算: (user + system) / 1000000 / interval
    // 这里返回一个估算值
    const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000;
    const interval = this.config.sampleInterval / 1000;
    return Math.min((totalUsage / interval) * 100, 100);
  }

  /**
   * 检测异常
   */
  private detectAnomalies(): void {
    // 检查资源异常
    this.detectResourceAnomalies();

    // 检查会话异常
    for (const [sessionId, history] of this.metricsHistory.entries()) {
      if (history.length === 0) continue;

      const latest = history[history.length - 1];

      // 检查延迟
      this.detectLatencyAnomaly(sessionId, latest);

      // 检查错误率
      this.detectErrorRateAnomaly(sessionId, latest);

      // 检查停滞
      this.detectStalledAnomaly(sessionId);
    }
  }

  /**
   * 检测资源异常
   */
  private detectResourceAnomalies(): void {
    const stats = this.getLatestResourceStats();
    if (!stats) return;

    // 检查CPU使用率
    if (stats.cpuUsage > this.config.cpuThreshold) {
      this.emitAnomaly({
        sessionId: 'system',
        type: 'high_cpu',
        severity: stats.cpuUsage > 90 ? 'critical' : 'warning',
        message: `High CPU usage: ${stats.cpuUsage.toFixed(2)}%`,
        value: stats.cpuUsage,
        threshold: this.config.cpuThreshold,
        timestamp: new Date(),
      });
    }

    // 检查内存使用
    if (stats.memoryUsage > this.config.memoryThreshold) {
      this.emitAnomaly({
        sessionId: 'system',
        type: 'high_memory',
        severity: stats.memoryUsage > 800 ? 'critical' : 'warning',
        message: `High memory usage: ${stats.memoryUsage.toFixed(2)}MB`,
        value: stats.memoryUsage,
        threshold: this.config.memoryThreshold,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 检测延迟异常
   * 
   * @param sessionId 会话ID
   * @param metrics 执行指标
   */
  private detectLatencyAnomaly(
    sessionId: string,
    metrics: ExecutionMetrics,
  ): void {
    if (metrics.avgLatency > this.config.latencyThreshold) {
      this.emitAnomaly({
        sessionId,
        type: 'high_latency',
        severity: metrics.avgLatency > this.config.latencyThreshold * 2 ? 'critical' : 'warning',
        message: `High latency: ${metrics.avgLatency.toFixed(2)}ms`,
        value: metrics.avgLatency,
        threshold: this.config.latencyThreshold,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 检测错误率异常
   * 
   * @param sessionId 会话ID
   * @param metrics 执行指标
   */
  private detectErrorRateAnomaly(
    sessionId: string,
    metrics: ExecutionMetrics,
  ): void {
    if (metrics.barsProcessed === 0) return;

    const errorRate = (metrics.errors / metrics.barsProcessed) * 100;

    if (errorRate > this.config.errorRateThreshold) {
      this.emitAnomaly({
        sessionId,
        type: 'high_error_rate',
        severity: errorRate > this.config.errorRateThreshold * 2 ? 'critical' : 'warning',
        message: `High error rate: ${errorRate.toFixed(2)}%`,
        value: errorRate,
        threshold: this.config.errorRateThreshold,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 检测停滞异常
   * 
   * @param sessionId 会话ID
   */
  private detectStalledAnomaly(sessionId: string): void {
    const lastTime = this.lastBarTime.get(sessionId);
    if (!lastTime) return;

    const elapsed = Date.now() - lastTime.getTime();

    if (elapsed > this.config.stalledThreshold) {
      this.emitAnomaly({
        sessionId,
        type: 'stalled',
        severity: 'warning',
        message: `Execution stalled for ${(elapsed / 1000).toFixed(2)}s`,
        value: elapsed,
        threshold: this.config.stalledThreshold,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 发送异常事件
   * 
   * @param anomaly 异常事件
   */
  private emitAnomaly(anomaly: AnomalyEvent): void {
    this.logger.warn(
      `Anomaly detected: ${anomaly.type} - ${anomaly.message}`,
    );

    // 发送异常事件
    this.eventEmitter.emit('execution.anomaly', anomaly);
  }

  /**
   * 获取监控统计
   * 
   * @returns 监控统计
   */
  getStats(): {
    activeSessions: number;
    totalMetrics: number;
    resourceSamples: number;
    config: Required<MonitorConfig>;
  } {
    return {
      activeSessions: this.metricsHistory.size,
      totalMetrics: Array.from(this.metricsHistory.values()).reduce(
        (sum, history) => sum + history.length,
        0,
      ),
      resourceSamples: this.resourceHistory.length,
      config: this.config,
    };
  }

  /**
   * 清理资源
   */
  onModuleDestroy(): void {
    this.stop();
    this.metricsHistory.clear();
    this.resourceHistory = [];
    this.lastBarTime.clear();
  }
}

