import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000/api/v1/backtesting',
  timeout: 10000,
});

export interface BacktestingHealth {
  status: string;
  module: string;
  timestamp: string;
}

export interface StrategyVersionSummary {
  scriptVersionId: string;
  versionName: string;
  isMaster: boolean;
  remark?: string | null;
  updatedAt: string;
  createdAt: string;
  code?: string;
  parameterSchema?: unknown;
  factorSchema?: unknown;
  lastReferencedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface StrategySummary {
  strategyId: string;
  name: string;
  description?: string | null;
  tags: string[];
  defaultScriptVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
  masterVersion: StrategyVersionSummary | null;
  latestVersion: StrategyVersionSummary | null;
  versionsCount: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListStrategiesQuery {
  page?: number;
  pageSize?: number;
  keyword?: string | null;
  tags?: string[];
}

export interface StrategyDetail extends StrategySummary {
  scriptVersions: StrategyVersionSummary[];
}

export interface CreateStrategyRequest {
  name: string;
  description?: string | null;
  tags?: string[];
  createdBy?: string | null;
  initialVersion: {
    code: string;
    versionName?: string;
    remark?: string | null;
    isMaster?: boolean;
  };
}

export interface CreateStrategyVersionRequest {
  code: string;
  versionName?: string;
  remark?: string | null;
  isMaster?: boolean;
  createdBy?: string | null;
}

export interface UpdateStrategyRequest {
  description?: string | null;
  tags?: string[];
  updatedBy?: string | null;
}

export interface UpdateStrategyVersionRequest {
  versionName?: string;
  remark?: string | null;
  code?: string;
  setMaster?: boolean;
  updatedBy?: string | null;
}

export async function fetchBacktestingHealth() {
  const { data } = await client.get<BacktestingHealth>('/health');
  return data;
}

export async function listStrategies(params: ListStrategiesQuery = {}) {
  const { data } = await client.get<PaginatedResponse<StrategySummary>>(
    '/strategies',
    { params },
  );
  return data;
}

export async function fetchStrategy(strategyId: string) {
  const { data } = await client.get<StrategyDetail>(`/strategies/${strategyId}`);
  return data;
}

export async function fetchStrategyTags() {
  const { data } = await client.get<string[]>('/strategies/tags');
  return data;
}

export async function createStrategy(payload: CreateStrategyRequest) {
  const { data } = await client.post<StrategyDetail>('/strategies', payload);
  return data;
}

export async function updateStrategy(
  strategyId: string,
  payload: UpdateStrategyRequest,
) {
  const { data } = await client.patch<StrategyDetail>(
    `/strategies/${strategyId}`,
    payload,
  );
  return data;
}

export async function createStrategyVersion(
  strategyId: string,
  payload: CreateStrategyVersionRequest,
) {
  const { data } = await client.post<StrategyDetail>(
    `/strategies/${strategyId}/script-versions`,
    payload,
  );
  return data;
}

export async function updateStrategyVersion(
  strategyId: string,
  versionId: string,
  payload: UpdateStrategyVersionRequest,
) {
  const { data } = await client.patch<StrategyDetail>(
    `/strategies/${strategyId}/script-versions/${versionId}`,
    payload,
  );
  return data;
}

export interface VersionCodeDiffSegment {
  type: 'equal' | 'added' | 'removed';
  value: string;
}

export interface VersionFieldDiff<T> {
  added: T[];
  removed: T[];
  changed: Array<{ before: T; after: T }>;
  unchanged: T[];
}

export interface VersionDiffResponse {
  baseVersion: StrategyVersionSummary;
  compareVersion: StrategyVersionSummary;
  codeDiff: VersionCodeDiffSegment[];
  parameterDiff: VersionFieldDiff<Record<string, unknown>>;
  factorDiff: VersionFieldDiff<Record<string, unknown>>;
}

export async function fetchStrategyVersionDiff(
  strategyId: string,
  versionId: string,
  params: { compareVersionId?: string; compareVersionName?: string },
) {
  const { data } = await client.get<VersionDiffResponse>(
    `/strategies/${strategyId}/script-versions/${versionId}/diff`,
    { params },
  );
  return data;
}

// ============================================
// 任务统计 API
// ============================================

export interface TaskStatistics {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number;
  averageExecutionTime: number | null;
}

/**
 * 获取任务统计信息
 */
export async function fetchTaskStatistics() {
  const { data } = await client.get<TaskStatistics>('/tasks/statistics');
  return data;
}

// ============================================
// 最近任务和趋势数据 API
// ============================================

export interface RecentTask {
  taskId: string;
  taskName: string;
  taskDescription?: string;
  status: string;
  progress?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  strategyId?: string;
  strategyName?: string;
  metricsSnapshot?: Record<string, any>;
}

export interface TrendData {
  date: string;
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number;
}

/**
 * 获取最近任务列表
 * @param limit 返回数量限制，默认10
 * @param status 状态筛选，可选多个
 * @param sortBy 排序字段，默认createdAt
 */
export async function fetchRecentTasks(
  limit: number = 10,
  status?: string[],
  sortBy: 'createdAt' | 'completedAt' = 'createdAt'
): Promise<RecentTask[]> {
  const params: any = { limit, sortBy };
  if (status && status.length > 0) {
    params.status = status.join(',');
  }
  const { data } = await client.get<RecentTask[]>('/tasks/recent', { params });
  return data;
}

/**
 * 获取任务趋势数据
 * @param days 统计天数，默认7天
 * @param groupBy 分组方式，默认按天
 */
export async function fetchTaskTrend(
  days: number = 7,
  groupBy: 'day' | 'hour' = 'day'
): Promise<TrendData[]> {
  const { data } = await client.get<TrendData[]>('/tasks/trend', {
    params: { days, groupBy },
  });
  return data;
}

// ============================================
// 任务暂停/恢复 API
// ============================================

export interface BacktestTask {
  taskId: string;
  taskName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  [key: string]: any;
}

/**
 * 暂停任务
 */
export async function pauseTask(taskId: string) {
  const { data } = await client.post<BacktestTask>(`/tasks/${taskId}/pause`);
  return data;
}

/**
 * 恢复任务
 */
export async function resumeTask(taskId: string) {
  const { data } = await client.post<BacktestTask>(`/tasks/${taskId}/resume`);
  return data;
}

// ============================================
// Worker 管理 API
// ============================================

const workerClient = axios.create({
  baseURL: 'http://localhost:3000/api/v1/internal',
  timeout: 10000,
});

export interface WorkerStatus {
  workerId: string;
  host: string;
  port: number;
  baseUrl: string;
  registeredAt: number;
  lastHeartbeat: number;
  status: 'idle' | 'busy' | 'overloaded' | 'down';
  currentLoad: number;
  capabilities: {
    maxConcurrentTasks: number;
    supportedStrategies?: string[];
  };
  metrics?: Record<string, any>;
}

export interface WorkerHealth {
  workerId: string;
  healthy: boolean;
  status: string;
  currentLoad: number;
  lastHeartbeat: string;
  heartbeatAge: number;
  registeredAt: string;
  uptime: number;
}

export interface WorkerMetrics {
  workerId: string;
  status: string;
  currentLoad: number;
  maxLoad: number;
  loadPercentage: number;
  uptime: number;
  lastHeartbeat: string;
  capabilities: {
    maxConcurrentTasks: number;
    supportedStrategies?: string[];
  };
  customMetrics: Record<string, any>;
}

/**
 * 获取所有Worker列表
 */
export async function fetchWorkerList() {
  const { data } = await workerClient.get<WorkerStatus[]>('/workers');
  return data;
}

/**
 * 获取Worker详情
 */
export async function fetchWorker(workerId: string) {
  const { data } = await workerClient.get<WorkerStatus>(`/workers/${workerId}`);
  return data;
}

/**
 * 启动Worker
 */
export async function startWorker(workerId: string) {
  const { data } = await workerClient.post<{ workerId: string; status: string; message: string }>(
    `/workers/${workerId}/start`,
  );
  return data;
}

/**
 * 停止Worker
 */
export async function stopWorker(workerId: string) {
  const { data } = await workerClient.post<{ workerId: string; status: string; message: string }>(
    `/workers/${workerId}/stop`,
  );
  return data;
}

/**
 * 检查Worker健康状态
 */
export async function checkWorkerHealth(workerId: string) {
  const { data } = await workerClient.get<WorkerHealth>(`/workers/${workerId}/health`);
  return data;
}

/**
 * 获取Worker性能指标
 */
export async function fetchWorkerMetrics(workerId: string) {
  const { data} = await workerClient.get<WorkerMetrics>(`/workers/${workerId}/metrics`);
  return data;
}

// ============================================
// 结果导出 API
// ============================================

/**
 * 导出任务结果
 * @param taskId 任务ID
 * @param format 导出格式 ('csv' | 'json')
 * @returns Blob对象，可用于下载
 */
export async function exportTaskResults(taskId: string, format: 'csv' | 'json' = 'csv') {
  const response = await client.get(`/backtest/tasks/${taskId}/export`, {
    params: { format },
    responseType: 'blob',
  });
  return response.data;
}

/**
 * 触发结果下载
 * @param taskId 任务ID
 * @param format 导出格式
 */
export async function downloadTaskResults(taskId: string, format: 'csv' | 'json' = 'csv') {
  const blob = await exportTaskResults(taskId, format);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backtest-result-${taskId}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ============================================
// 策略脚本验证 API
// ============================================

export interface ScriptValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证策略脚本
 * @param code Python策略脚本代码
 */
export async function validateStrategyScript(code: string) {
  const { data } = await client.post<ScriptValidationResult>('/strategies/validate', { code });
  return data;
}



