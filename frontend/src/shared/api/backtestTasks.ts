import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000/api/v1/backtesting/tasks',
  timeout: 30000, // 回测任务可能需要较长时间
});

/**
 * 回测任务状态
 */
export const BacktestTaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
export type BacktestTaskStatus =
  (typeof BacktestTaskStatus)[keyof typeof BacktestTaskStatus];

/**
 * 日志级别
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * 排序字段
 */
export const SortField = {
  CREATED_AT: 'createdAt',
  STARTED_AT: 'startedAt',
  COMPLETED_AT: 'completedAt',
  TASK_NAME: 'taskName',
} as const;
export type SortField = (typeof SortField)[keyof typeof SortField];

/**
 * 排序方向
 */
export const SortOrder = {
  ASC: 'asc',
  DESC: 'desc',
} as const;
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

/**
 * 手续费配置
 */
export interface FeesConfig {
  makerFee: number;
  takerFee: number;
}

/**
 * 交易时段
 */
export interface TradingHours {
  start: string; // HH:mm
  end: string; // HH:mm
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  initialCapital: number;
  leverage: number;
  slippage: number;
  fees: FeesConfig;
  tradingHours?: TradingHours;
}

/**
 * 时间范围
 */
export interface TimeRange {
  start: string; // ISO 8601
  end: string; // ISO 8601
}

/**
 * 数据配置
 */
export interface DataConfig {
  timeRange: TimeRange;
  timeframe: string; // e.g., "1h", "1d"
}

/**
 * 结果摘要
 */
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

/**
 * 回测任务实体
 */
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
}

export async function downloadBacktestTrades(taskId: string): Promise<Blob> {
  const response = await client.get(`/${taskId}/trades`, {
    responseType: 'blob',
  });
  return response.data;
}

export async function listTaskTrades(
  taskId: string,
  query: ListTaskTradesQuery,
): Promise<ListTaskTradesResponse> {
  const response = await client.get(`/${taskId}/trades/list`, {
    params: query,
  });
  return response.data;
}

export async function fetchTaskBars(
  taskId: string,
  query: TaskBarsQuery,
): Promise<TaskBarsResponse> {
  const response = await client.get(`/${taskId}/bars`, {
    params: query,
  });
  return response.data;
}

/**
 * 创建任务请求
 */
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

/**
 * 更新任务请求
 */
export interface UpdateBacktestTaskRequest {
  taskName?: string;
  taskDescription?: string;
}

/**
 * 查询任务列表参数
 */
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

/**
 * 任务列表响应
 */
export interface ListBacktestTasksResponse {
  tasks: BacktestTask[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 任务日志
 */
export interface TaskLog {
  logId: string;
  taskId: string;
  level: LogLevel;
  module?: string;
  message: string;
  metadata?: Record<string, any>;
  loggedAt: string;
}

/**
 * 查询日志参数
 */
export interface ListTaskLogsQuery {
  level?: LogLevel;
  keyword?: string;
  before?: string;
  limit?: number;
}

/**
 * 日志列表响应
 */
export interface ListTaskLogsResponse {
  logs: TaskLog[];
  hasMore: boolean;
}

/**
 * 日志统计
 */
export interface TaskLogStats {
  total: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
}

/**
 * 创建回测任务
 */
export async function createBacktestTask(
  payload: CreateBacktestTaskRequest,
): Promise<BacktestTask> {
  const { data } = await client.post<BacktestTask>('', payload);
  return data;
}

/**
 * 查询任务列表
 */
export async function listBacktestTasks(
  params: ListBacktestTasksQuery = {},
): Promise<ListBacktestTasksResponse> {
  const { data } = await client.get<ListBacktestTasksResponse>('', { params });
  return data;
}

/**
 * 查询任务详情
 */
export async function fetchBacktestTask(taskId: string): Promise<BacktestTask> {
  const { data } = await client.get<BacktestTask>(`/${taskId}`);
  return data;
}

/**
 * 更新任务
 */
export async function updateBacktestTask(
  taskId: string,
  payload: UpdateBacktestTaskRequest,
): Promise<BacktestTask> {
  const { data } = await client.patch<BacktestTask>(`/${taskId}`, payload);
  return data;
}

/**
 * 取消任务
 */
export async function cancelBacktestTask(taskId: string): Promise<BacktestTask> {
  const { data } = await client.post<BacktestTask>(`/${taskId}/cancel`);
  return data;
}

/**
 * 重试任务
 */
export async function retryBacktestTask(taskId: string): Promise<BacktestTask> {
  const { data } = await client.post<BacktestTask>(`/${taskId}/retry`);
  return data;
}

/**
 * 手动执行任务
 */
export async function executeBacktestTask(taskId: string): Promise<{ message: string; taskId: string }> {
  const { data } = await client.post<{ message: string; taskId: string }>(`/${taskId}/execute`);
  return data;
}

/**
 * 复制任务配置
 */
export async function copyBacktestTaskConfig(
  taskId: string,
): Promise<CreateBacktestTaskRequest> {
  const { data } = await client.get<CreateBacktestTaskRequest>(`/${taskId}/copy`);
  return data;
}

/**
 * 删除任务
 */
export async function deleteBacktestTask(taskId: string): Promise<void> {
  await client.delete(`/${taskId}`);
}

/**
 * 查询任务日志
 */
export async function fetchTaskLogs(
  taskId: string,
  params: ListTaskLogsQuery = {},
): Promise<ListTaskLogsResponse> {
  const { data } = await client.get<ListTaskLogsResponse>(`/${taskId}/logs`, {
    params,
  });
  return data;
}

/**
 * 查询日志统计
 */
export async function fetchTaskLogStats(taskId: string): Promise<TaskLogStats> {
  const { data } = await client.get<TaskLogStats>(`/${taskId}/logs/stats`);
  return data;
}
