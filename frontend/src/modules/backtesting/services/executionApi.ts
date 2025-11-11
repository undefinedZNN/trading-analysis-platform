/**
 * 执行API服务
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api/v1/backtesting/execution';

/**
 * 执行状态类型
 */
export type ExecutionStatus = 'idle' | 'loading' | 'running' | 'paused' | 'stopped' | 'error' | 'completed';

/**
 * 执行配置
 */
export interface ExecutionConfig {
  datasetId: number;
  strategyId: string;
  versionId: string;
  startTime: Date | string;
  endTime: Date | string;
  timeframe: string;
  initialCapital: number;
  speed?: number;
  enableLogging?: boolean;
  parameters?: Record<string, any>;
}

/**
 * 执行会话
 */
export interface ExecutionSession {
  sessionId: string;
  strategyId: string;
  versionId: string;
  status: ExecutionStatus;
  config: ExecutionConfig;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  currentTime?: string;
  error?: string;
}

/**
 * 执行指标
 */
export interface ExecutionMetrics {
  sessionId: string;
  barsProcessed: number;
  eventsProcessed: number;
  executionTime: number;
  avgLatency: number;
  signalsGenerated: number;
  ordersPlaced: number;
  errors: number;
  memoryUsage: number;
  cpuUsage: number;
  updatedAt: string;
}

/**
 * 执行日志
 */
export interface ExecutionLog {
  sessionId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  data?: any;
}

/**
 * 资源统计
 */
export interface ResourceStats {
  cpuUsage: number;
  memoryUsage: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  timestamp: string;
}

/**
 * 异常事件
 */
export interface AnomalyEvent {
  sessionId: string;
  type: 'high_latency' | 'high_memory' | 'high_cpu' | 'high_error_rate' | 'stalled';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
}

/**
 * 执行API类
 */
export class ExecutionApi {
  /**
   * 启动执行
   */
  static async start(config: ExecutionConfig): Promise<ExecutionSession> {
    const response = await axios.post(`${API_BASE_URL}/start`, config);
    return response.data;
  }

  /**
   * 停止执行
   */
  static async stop(sessionId: string): Promise<void> {
    await axios.post(`${API_BASE_URL}/${sessionId}/stop`);
  }

  /**
   * 暂停执行
   */
  static async pause(sessionId: string): Promise<void> {
    await axios.post(`${API_BASE_URL}/${sessionId}/pause`);
  }

  /**
   * 恢复执行
   */
  static async resume(sessionId: string): Promise<void> {
    await axios.post(`${API_BASE_URL}/${sessionId}/resume`);
  }

  /**
   * 获取执行状态
   */
  static async getStatus(sessionId: string): Promise<ExecutionSession> {
    const response = await axios.get(`${API_BASE_URL}/${sessionId}/status`);
    return response.data;
  }

  /**
   * 获取执行指标
   */
  static async getMetrics(sessionId: string): Promise<ExecutionMetrics> {
    const response = await axios.get(`${API_BASE_URL}/${sessionId}/metrics`);
    return response.data;
  }

  /**
   * 获取执行日志
   */
  static async getLogs(sessionId: string, limit?: number): Promise<ExecutionLog[]> {
    const response = await axios.get(`${API_BASE_URL}/${sessionId}/logs`, {
      params: { limit },
    });
    return response.data;
  }

  /**
   * 获取指标历史
   */
  static async getMetricsHistory(
    sessionId: string,
    limit?: number,
  ): Promise<ExecutionMetrics[]> {
    const response = await axios.get(`${API_BASE_URL}/${sessionId}/metrics/history`, {
      params: { limit },
    });
    return response.data;
  }

  /**
   * 获取资源统计
   */
  static async getResourceStats(limit?: number): Promise<ResourceStats[]> {
    const response = await axios.get(`${API_BASE_URL}/resource/stats`, {
      params: { limit },
    });
    return response.data;
  }

  /**
   * 获取最新资源统计
   */
  static async getLatestResourceStats(): Promise<ResourceStats> {
    const response = await axios.get(`${API_BASE_URL}/resource/latest`);
    return response.data;
  }

  /**
   * 启动监控
   */
  static async startMonitor(): Promise<void> {
    await axios.post(`${API_BASE_URL}/monitor/start`);
  }

  /**
   * 停止监控
   */
  static async stopMonitor(): Promise<void> {
    await axios.post(`${API_BASE_URL}/monitor/stop`);
  }

  /**
   * 获取监控统计
   */
  static async getMonitorStats(): Promise<any> {
    const response = await axios.get(`${API_BASE_URL}/monitor/stats`);
    return response.data;
  }

  /**
   * 获取WebSocket统计
   */
  static async getWebSocketStats(): Promise<any> {
    const response = await axios.get(`${API_BASE_URL}/websocket/stats`);
    return response.data;
  }
}

