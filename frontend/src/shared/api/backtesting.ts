import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000/api/v1/backtesting',
  timeout: 30000,
});

/** 回测任务状态 */
export enum BacktestTaskStatus {
  SUBMITTED = 'submitted',
  QUEUED = 'queued',
  RUNNING = 'running',
  FINISHED = 'finished',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** 交易时段配置 */
export interface TradingSession {
  name: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

/** 风险约束配置 */
export interface RiskConstraints {
  maxDrawdownPercent?: number;
  maxDailyLossPercent?: number;
  maxPositionSize?: number;
  maxLeverage?: number;
}

/** 滑点模型配置 */
export interface SlippageModel {
  type: 'fixed' | 'percentage' | 'custom';
  value: number;
}

/** 手续费配置 */
export interface Commission {
  type: 'fixed' | 'percentage';
  value: number;
}

/** 回测配置 */
export interface BacktestConfig {
  initialCapital: number;
  timeLevel: string;
  slippageModel?: SlippageModel;
  commission?: Commission;
  tradingSessions?: TradingSession[];
  riskConstraints?: RiskConstraints;
  strategyParams?: Record<string, unknown>;
}

/** 回测任务 DTO */
export interface BacktestTaskDto {
  taskId: number;
  name: string;
  description?: string | null;
  strategyId: number;
  scriptId: number;
  datasetId: number;
  backtestStartDate: string;
  backtestEndDate: string;
  config: BacktestConfig;
  status: BacktestTaskStatus;
  progress?: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  resultSummary?: Record<string, unknown> | null;
  resultStoragePath?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  strategy?: {
    strategyId: number;
    name: string;
  };
  scriptVersion?: {
    scriptId: number;
    versionCode: string;
  };
  dataset?: {
    datasetId: number;
    symbol: string;
  };
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 查询回测任务列表参数 */
export interface ListBacktestTasksQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: BacktestTaskStatus[];
  strategyId?: number;
}

/** 创建回测任务参数 */
export interface CreateBacktestTaskPayload {
  name: string;
  description?: string;
  strategyId: number;
  scriptId: number;
  datasetId: number;
  backtestStartDate: string;
  backtestEndDate: string;
  config: BacktestConfig;
  createdBy?: string;
}

/** 更新回测任务参数 */
export interface UpdateBacktestTaskPayload {
  name?: string;
  description?: string;
  updatedBy?: string;
}

/** 更新回测任务状态参数 */
export interface UpdateBacktestTaskStatusPayload {
  status: BacktestTaskStatus;
  progress?: number;
  errorMessage?: string;
  resultSummary?: Record<string, unknown>;
  resultStoragePath?: string;
}

/** 查询回测任务列表 */
export async function listBacktestTasks(params: ListBacktestTasksQuery = {}) {
  const { data } = await client.get<PaginatedResponse<BacktestTaskDto>>('/tasks', {
    params,
  });
  return data;
}

/** 创建回测任务 */
export async function createBacktestTask(payload: CreateBacktestTaskPayload) {
  const { data } = await client.post<BacktestTaskDto>('/tasks', payload);
  return data;
}

/** 获取回测任务详情 */
export async function getBacktestTask(taskId: number) {
  const { data } = await client.get<BacktestTaskDto>(`/tasks/${taskId}`);
  return data;
}

/** 更新回测任务 */
export async function updateBacktestTask(
  taskId: number,
  payload: UpdateBacktestTaskPayload,
) {
  const { data } = await client.patch<BacktestTaskDto>(`/tasks/${taskId}`, payload);
  return data;
}

/** 更新回测任务状态 */
export async function updateBacktestTaskStatus(
  taskId: number,
  payload: UpdateBacktestTaskStatusPayload,
) {
  const { data } = await client.patch<BacktestTaskDto>(
    `/tasks/${taskId}/status`,
    payload,
  );
  return data;
}

/** 取消回测任务 */
export async function cancelBacktestTask(taskId: number) {
  const { data } = await client.post<BacktestTaskDto>(`/tasks/${taskId}/cancel`);
  return data;
}

/** 删除回测任务 */
export async function deleteBacktestTask(taskId: number, operator?: string) {
  await client.delete(`/tasks/${taskId}`, {
    data: { operator },
  });
}

