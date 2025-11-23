/**
 * 回测任务 API 适配器
 * 
 * 此文件作为新旧API之间的桥梁，使用新的API Client（api/client.ts）
 * 同时保持与旧API（shared/api/backtestTasks.ts）的兼容性
 * 
 * 迁移日期: 2025-11-22
 */

import { apiClient, type BacktestApiClient } from './client';

// ============================================
// 类型定义 - 从旧API导入（保持兼容）
// ============================================

export const BacktestTaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused', // 新增状态
} as const;
export type BacktestTaskStatus =
  (typeof BacktestTaskStatus)[keyof typeof BacktestTaskStatus];

export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const SortField = {
  CREATED_AT: 'createdAt',
  STARTED_AT: 'startedAt',
  COMPLETED_AT: 'completedAt',
  TASK_NAME: 'taskName',
} as const;
export type SortField = (typeof SortField)[keyof typeof SortField];

export const SortOrder = {
  ASC: 'asc',
  DESC: 'desc',
} as const;
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

// ============================================
// 配置接口
// ============================================

export interface FeesConfig {
  makerFee: number;
  takerFee: number;
}

export interface TradingHours {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface ExecutionConfig {
  initialCapital: number;
  leverage: number;
  slippage: number;
  fees: FeesConfig;
  tradingHours?: TradingHours;
}

export interface TimeRange {
  start: string; // ISO 8601
  end: string; // ISO 8601
}

export interface DataConfig {
  timeRange: TimeRange;
  timeframe: string; // e.g., "1h", "1d"
  datasetId?: number; // 可选，某些场景下可能需要
}

// ============================================
// 结果相关接口
// ============================================

export interface ResultArtifact {
  type: string;
  path: string;
  [key: string]: unknown;
}

export interface ResultSummary {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  profitLossRatio: number;
  totalTrades: number;
  finalCapital: number;
  processedBars: number;
  executionTime: number;
  taskId?: string;
  strategyId?: string;
  scriptVersionId?: string | null;
  initialCapital?: number;
  endingEquity?: number;
  returnPct?: number;
  winningTrades?: number;
  totalPnl?: number;
  totalFees?: number;
  profitFactor?: number;
  artifacts?: ResultArtifact[];
  datasetBaseGranularity?: string;
}

// ============================================
// 交易相关接口
// ============================================

export interface TradeFactorSnapshot {
  system?: Record<string, number | string>;
  custom?: Record<string, number | string>;
}

export interface TradeExitSegment {
  price: number;
  quantity: number;
  timestamp: string | null;
  barTimestamp?: string | null;
  reason?: string;
}

export interface TradeContext {
  exitSegments?: TradeExitSegment[];
  status?: string;
  entryTimestamp?: string;
  entryBarTimestamp?: string;
  exitTimestamp?: string;
  exitBarTimestamp?: string;
}

export interface TaskTradeRecord {
  tradeId: string;
  taskId: string;
  sessionId: string;
  strategyId: string;
  scriptVersionId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'open' | 'close' | 'adjust';
  quantity?: number | null;
  price?: number | null;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  fees?: number | null;
  feeCurrency?: string;
  liquidity?: string;
  timestamp?: string | null;
  sequenceId?: string;
  position?: {
    quantity?: number | null;
    avgEntryPrice?: number | null;
    side?: string | null;
  };
  reason?: string | null;
  factorSnapshot?: TradeFactorSnapshot;
  entryPrice?: number | null;
  exitPrice?: number | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  barTimestamp?: string | null;
  entryTimestamp?: string | null;
  exitTimestamp?: string | null;
  exitSegments?: TradeExitSegment[];
  status?: string | null;
  context?: TradeContext;
}

export interface ListTaskTradesResponse {
  trades: TaskTradeRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListTaskTradesQuery {
  page?: number;
  pageSize?: number;
}

// ============================================
// K线相关接口
// ============================================

export interface TaskBarsResponse {
  taskId: string;
  datasetId: number;
  resolution: string;
  from: number;
  to: number;
  limit: number;
  hasMore: boolean;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export interface TaskBarsQuery {
  timestamp?: string;
  timestampSec?: number;
  resolution?: string;
  beforeBars?: number;
  afterBars?: number;
}

// ============================================
// 任务相关接口
// ============================================

export interface BacktestTask {
  taskId: string;
  taskName: string;
  taskDescription?: string;
  strategyId: string;
  scriptVersionId: string;
  datasetId: number;
  strategyParams: Record<string, any>;
  executionConfig: ExecutionConfig;
  dataConfig: DataConfig;
  status: BacktestTaskStatus;
  progress?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  resultSummary?: ResultSummary;
  resultFilePath?: string;
  assignedWorkerId?: string;
  metricsSnapshot?: Record<string, any>;
  errorMessage?: string;
  errorStack?: string;
  createdBy?: string;
  updatedBy?: string;
  currentBar?: number;
  totalBars?: number;
}

export interface CreateBacktestTaskRequest {
  taskName: string;
  taskDescription?: string;
  strategyId: string;
  scriptVersionId: string;
  datasetId: number;
  strategyParams: Record<string, any>;
  executionConfig: ExecutionConfig;
  dataConfig: DataConfig;
}

export interface UpdateBacktestTaskRequest {
  taskName?: string;
  taskDescription?: string;
}

export interface ListBacktestTasksQuery {
  keyword?: string;
  strategyId?: string;
  scriptVersionId?: string;
  datasetId?: number;
  status?: BacktestTaskStatus;
  createdAfter?: string;
  createdBefore?: string;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface ListBacktestTasksResponse {
  tasks: BacktestTask[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================
// 日志相关接口
// ============================================

export interface TaskLog {
  logId: string;
  taskId: string;
  level: LogLevel;
  module?: string;
  message: string;
  metadata?: Record<string, any>;
  loggedAt: string;
}

export interface ListTaskLogsQuery {
  level?: LogLevel;
  keyword?: string;
  before?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}

export interface ListTaskLogsResponse {
  logs: TaskLog[];
  hasMore?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
}

export interface TaskLogStats {
  total: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
}

// ============================================
// 统计相关接口（新增）
// ============================================

export interface TaskStatistics {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  paused: number;
  successRate: number;
  averageExecutionTime: number; // in milliseconds
}

// ============================================
// API 方法 - 使用新的 API Client
// ============================================

/**
 * 创建回测任务
 */
export async function createBacktestTask(
  payload: CreateBacktestTaskRequest,
): Promise<BacktestTask> {
  return await apiClient.createTask(payload);
}

/**
 * 查询任务列表
 */
export async function listBacktestTasks(
  params: ListBacktestTasksQuery = {},
): Promise<ListBacktestTasksResponse> {
  return await apiClient.listTasks(params);
}

/**
 * 查询任务详情
 */
export async function fetchBacktestTask(taskId: string): Promise<BacktestTask> {
  return await apiClient.getTask(taskId);
}

/**
 * 更新任务
 */
export async function updateBacktestTask(
  taskId: string,
  payload: UpdateBacktestTaskRequest,
): Promise<BacktestTask> {
  return await apiClient.updateTask(taskId, payload);
}

/**
 * 取消任务
 */
export async function cancelBacktestTask(taskId: string): Promise<BacktestTask> {
  return await apiClient.cancelTask(taskId);
}

/**
 * 重试任务
 */
export async function retryBacktestTask(taskId: string): Promise<BacktestTask> {
  return await apiClient.retryTask(taskId);
}

/**
 * 删除任务
 */
export async function deleteBacktestTask(taskId: string): Promise<void> {
  return await apiClient.deleteTask(taskId);
}

/**
 * 复制任务配置
 */
export async function copyBacktestTaskConfig(
  taskId: string,
): Promise<CreateBacktestTaskRequest> {
  return await apiClient.copyTask(taskId);
}

/**
 * 查询任务日志
 */
export async function fetchTaskLogs(
  taskId: string,
  params: ListTaskLogsQuery = {},
): Promise<ListTaskLogsResponse> {
  return await apiClient.getTaskLogs(taskId, params);
}

/**
 * 查询日志统计
 */
export async function fetchTaskLogStats(taskId: string): Promise<TaskLogStats> {
  return await apiClient.getTaskLogStats(taskId);
}

/**
 * 查询任务交易列表
 */
export async function listTaskTrades(
  taskId: string,
  query: ListTaskTradesQuery,
): Promise<ListTaskTradesResponse> {
  return await apiClient.getTaskTrades(taskId, query);
}

/**
 * 下载任务交易数据
 */
export async function downloadBacktestTrades(taskId: string): Promise<Blob> {
  // 注意：新API Client可能没有直接的下载方法，这里需要手动实现
  // 或者使用getTaskTrades获取所有数据然后转换为Blob
  const response = await apiClient.getTaskTrades(taskId, { pageSize: 10000 });
  const jsonStr = JSON.stringify(response.trades, null, 2);
  return new Blob([jsonStr], { type: 'application/json' });
}

/**
 * 获取任务K线数据
 */
export async function fetchTaskBars(
  taskId: string,
  query: TaskBarsQuery,
): Promise<TaskBarsResponse> {
  return await apiClient.getTaskBars(taskId, query);
}

/**
 * 手动执行任务
 * 注意：这个API在新Client中可能不存在，如果不存在则抛出错误
 */
export async function executeBacktestTask(
  taskId: string,
): Promise<{ message: string; taskId: string }> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1'}/backtesting/tasks/${taskId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '执行任务失败' }));
    throw new Error(error.message || `执行任务失败: ${response.statusText}`);
  }

  return await response.json();
}

// ============================================
// 新增 API 方法
// ============================================

/**
 * 暂停任务（新增）
 */
export async function pauseBacktestTask(taskId: string): Promise<BacktestTask> {
  return await apiClient.pauseTask(taskId);
}

/**
 * 恢复任务（新增）
 */
export async function resumeBacktestTask(taskId: string): Promise<BacktestTask> {
  return await apiClient.resumeTask(taskId);
}

/**
 * 获取任务统计信息（新增）
 */
export async function fetchTaskStatistics(): Promise<TaskStatistics> {
  return await apiClient.getTaskStatistics();
}

// ============================================
// 导出 API Client 实例（供高级使用）
// ============================================

export { apiClient };
export type { BacktestApiClient };

