/**
 * Trading Platform API Client
 * 
 * 前端TypeScript API客户端库
 * 提供类型安全的API调用方法
 */

// ============================================
// 基础类型定义
// ============================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type WorkerStatus = 'idle' | 'busy' | 'overloaded' | 'down';

// ============================================
// Worker 相关类型
// ============================================

export interface WorkerInfo {
  workerId: string;
  host: string;
  port: number;
  baseUrl: string;
  registeredAt: number;
  lastHeartbeat: number;
  status: WorkerStatus;
  currentLoad: number;
  capabilities: {
    maxConcurrentTasks: number;
    supportedStrategies: string[];
  };
  metrics?: Record<string, any>;
}

export interface WorkerHealth {
  workerId: string;
  healthy: boolean;
  status: WorkerStatus;
  currentLoad: number;
  lastHeartbeat: string;
  heartbeatAge: number;
  registeredAt: string;
  uptime: number;
}

export interface WorkerMetrics {
  workerId: string;
  status: WorkerStatus;
  currentLoad: number;
  maxLoad: number;
  loadPercentage: number;
  uptime: number;
  lastHeartbeat: string;
  capabilities: {
    maxConcurrentTasks: number;
    supportedStrategies: string[];
  };
  customMetrics: Record<string, any>;
}

// ============================================
// Task 相关类型
// ============================================

export interface BacktestTask {
  taskId: string;
  taskName: string;
  taskDescription?: string;
  strategyId: string;
  scriptVersionId: string;
  datasetId: number;
  strategyParams: Record<string, any>;
  executionConfig: {
    initialCapital: number;
    leverage: number;
    slippage: number;
    fees: {
      makerFee: number;
      takerFee: number;
    };
  };
  dataConfig: {
    timeRange: {
      start: string;
      end: string;
    };
    timeframe: string;
  };
  status: TaskStatus;
  progress: number;
  assignedWorkerId?: string;
  metricsSnapshot?: Record<string, any>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  checkpointEnabled?: boolean;
  checkpointIntervalBars?: number;
  lastCheckpointBar?: number;
  checkpointFilePath?: string;
  canResume?: boolean;
  tradesFilePath?: string;
  equityFilePath?: string;
}

export interface CreateTaskDto {
  taskName: string;
  taskDescription?: string;
  strategyId: string;
  scriptVersionId: string;
  datasetId: number;
  strategyParams: Record<string, any>;
  executionConfig: {
    initialCapital: number;
    leverage?: number;
    slippage?: number;
    fees?: {
      makerFee: number;
      takerFee: number;
    };
  };
  dataConfig: {
    timeRange: {
      start: string;
      end: string;
    };
    timeframe: string;
  };
  checkpointEnabled?: boolean;
  checkpointIntervalBars?: number;
}

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

export interface TaskListQuery {
  keyword?: string;
  strategyId?: string;
  scriptVersionId?: string;
  datasetId?: number;
  status?: TaskStatus;
  sortBy?: 'createdAt' | 'startedAt' | 'completedAt' | 'taskName';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

// ============================================
// Result 相关类型
// ============================================

export interface BacktestResult {
  resultId: string;
  taskId: string;
  resultName: string;
  isPrimary: boolean;
  filterConditions?: Record<string, any>;
  tradesCountTotal?: number;
  tradesCountFiltered?: number;
  initialCash: number;
  finalValue: number;
  totalPnl: number;
  totalReturnPct: number;
  annualizedReturnPct?: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgProfitPerTrade?: number;
  profitFactor?: number;
  expectancy?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  calmarRatio?: number;
  maxDrawdownPct?: number;
  maxDrawdownValue?: number;
  annualizedVolatilityPct?: number;
  avgHoldingBars?: number;
  maxHoldingBars?: number;
  minHoldingBars?: number;
  tradesFilePath?: string;
  equityFilePath?: string;
  detailedMetrics?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFilteredResultDto {
  resultName: string;
  filterConditions?: {
    factors?: Record<string, any>;
    timeRange?: {
      start?: string;
      end?: string;
    };
    tradeType?: {
      buy?: boolean;
      sell?: boolean;
    };
  };
}

export interface TradeData {
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  size: number;
  direction: 'long' | 'short';
  pnl: number;
  commission: number;
  entry_factors?: Record<string, any>;
  holding_factors?: any[];
  exit_factors?: Record<string, any>;
}

export interface EquityPoint {
  datetime: string;
  value: number;
  cash?: number;
}

// ============================================
// Strategy 相关类型
// ============================================

export interface Strategy {
  strategyId: string;
  strategyName: string;
  strategyDescription?: string;
  category?: string;
  tags?: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface ScriptVersion {
  versionId: string;
  strategyId: string;
  versionName: string;
  remark: string;
  code: string;
  isMaster: boolean;
  parameterSchema?: Record<string, any>;
  factorSchema?: Record<string, any>;
  createdAt: string;
  createdBy?: string;
}

// ============================================
// API Client 配置
// ============================================

export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

// ============================================
// API Client 类
// ============================================

export class TradingPlatformApiClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // 移除末尾斜杠
    this.timeout = config.timeout || 30000; // 默认30秒超时
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  /**
   * 通用请求方法
   */
  private async request<T>(
    method: string,
    path: string,
    data?: any,
    queryParams?: Record<string, any>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    // 添加查询参数
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (data && ['POST', 'PATCH', 'PUT'].includes(method)) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url.toString(), options);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      // 204 No Content 不需要解析body
      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  // ============================================
  // Worker API
  // ============================================

  /**
   * 获取所有Worker列表
   */
  async listWorkers(): Promise<WorkerInfo[]> {
    return this.request<WorkerInfo[]>('GET', '/internal/workers');
  }

  /**
   * 获取Worker详情
   */
  async getWorker(workerId: string): Promise<WorkerInfo> {
    return this.request<WorkerInfo>('GET', `/internal/workers/${workerId}`);
  }

  /**
   * 启动Worker
   */
  async startWorker(workerId: string): Promise<{ workerId: string; status: string; message: string }> {
    return this.request('POST', `/internal/workers/${workerId}/start`);
  }

  /**
   * 停止Worker
   */
  async stopWorker(workerId: string): Promise<{ workerId: string; status: string; message: string }> {
    return this.request('POST', `/internal/workers/${workerId}/stop`);
  }

  /**
   * 检查Worker健康状态
   */
  async getWorkerHealth(workerId: string): Promise<WorkerHealth> {
    return this.request<WorkerHealth>('GET', `/internal/workers/${workerId}/health`);
  }

  /**
   * 获取Worker性能指标
   */
  async getWorkerMetrics(workerId: string): Promise<WorkerMetrics> {
    return this.request<WorkerMetrics>('GET', `/internal/workers/${workerId}/metrics`);
  }

  // ============================================
  // Task API
  // ============================================

  /**
   * 创建回测任务
   */
  async createTask(dto: CreateTaskDto): Promise<BacktestTask> {
    return this.request<BacktestTask>('POST', '/backtesting/tasks', dto);
  }

  /**
   * 查询任务列表
   */
  async listTasks(query?: TaskListQuery): Promise<PaginatedResponse<BacktestTask>> {
    return this.request<PaginatedResponse<BacktestTask>>('GET', '/backtesting/tasks', undefined, query);
  }

  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<BacktestTask> {
    return this.request<BacktestTask>('GET', `/backtesting/tasks/${taskId}`);
  }

  /**
   * 更新任务
   */
  async updateTask(taskId: string, data: Partial<BacktestTask>): Promise<BacktestTask> {
    return this.request<BacktestTask>('PATCH', `/backtesting/tasks/${taskId}`, data);
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    return this.request<void>('DELETE', `/backtesting/tasks/${taskId}`);
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<BacktestTask> {
    return this.request<BacktestTask>('POST', `/backtesting/tasks/${taskId}/cancel`);
  }

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<BacktestTask> {
    return this.request<BacktestTask>('POST', `/backtesting/tasks/${taskId}/pause`);
  }

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<BacktestTask> {
    return this.request<BacktestTask>('POST', `/backtesting/tasks/${taskId}/resume`);
  }

  /**
   * 重试任务
   */
  async retryTask(taskId: string): Promise<BacktestTask> {
    return this.request<BacktestTask>('POST', `/backtesting/tasks/${taskId}/retry`);
  }

  /**
   * 复制任务配置
   */
  async copyTaskConfig(taskId: string): Promise<CreateTaskDto> {
    return this.request<CreateTaskDto>('GET', `/backtesting/tasks/${taskId}/copy`);
  }

  /**
   * 获取任务统计信息
   */
  async getTaskStatistics(): Promise<TaskStatistics> {
    return this.request<TaskStatistics>('GET', '/backtesting/tasks/statistics');
  }

  // ============================================
  // Result API
  // ============================================

  /**
   * 获取任务的所有结果
   */
  async getTaskResults(
    taskId: string,
    query?: {
      isPrimary?: boolean;
      orderBy?: 'createdAt' | 'totalReturnPct' | 'sharpeRatio';
      order?: 'ASC' | 'DESC';
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedResponse<BacktestResult>> {
    return this.request<PaginatedResponse<BacktestResult>>(
      'GET',
      `/backtest/tasks/${taskId}/results`,
      undefined,
      query,
    );
  }

  /**
   * 获取主结果
   */
  async getPrimaryResult(taskId: string): Promise<BacktestResult> {
    return this.request<BacktestResult>('GET', `/backtest/tasks/${taskId}/results/primary`);
  }

  /**
   * 获取单个结果
   */
  async getResult(resultId: string): Promise<BacktestResult> {
    return this.request<BacktestResult>('GET', `/backtest/results/${resultId}`);
  }

  /**
   * 创建过滤结果
   */
  async createFilteredResult(taskId: string, dto: CreateFilteredResultDto): Promise<BacktestResult> {
    return this.request<BacktestResult>('POST', `/backtest/tasks/${taskId}/results`, dto);
  }

  /**
   * 删除结果
   */
  async deleteResult(resultId: string): Promise<void> {
    return this.request<void>('DELETE', `/backtest/results/${resultId}`);
  }

  /**
   * 获取结果统计摘要
   */
  async getResultsSummary(taskId: string): Promise<{
    total: number;
    hasPrimary: boolean;
    topByReturn?: BacktestResult;
    topBySharpe?: BacktestResult;
  }> {
    return this.request('GET', `/backtest/tasks/${taskId}/results/summary`);
  }

  /**
   * 对比多个结果
   */
  async compareResults(resultIds: string[]): Promise<{
    results: BacktestResult[];
    comparison: {
      bestReturn: string;
      bestSharpe: string;
      lowestDrawdown: string;
    };
  }> {
    return this.request('POST', '/backtest/results/compare', { resultIds });
  }

  /**
   * 获取交易明细数据
   */
  async getTradesData(
    taskId: string,
    options?: {
      filterConditions?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    trades: TradeData[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.request('GET', `/backtest/tasks/${taskId}/trades`, undefined, options);
  }

  /**
   * 获取权益曲线数据
   */
  async getEquityData(taskId: string): Promise<EquityPoint[]> {
    return this.request<EquityPoint[]>('GET', `/backtest/tasks/${taskId}/equity`);
  }

  // ============================================
  // Strategy API (简化版，根据需要扩展)
  // ============================================

  /**
   * 获取策略列表
   */
  async listStrategies(query?: {
    keyword?: string;
    category?: string;
    tags?: string[];
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Strategy>> {
    return this.request<PaginatedResponse<Strategy>>('GET', '/backtesting/strategies', undefined, query);
  }

  /**
   * 获取策略详情
   */
  async getStrategy(strategyId: string): Promise<Strategy> {
    return this.request<Strategy>('GET', `/backtesting/strategies/${strategyId}`);
  }

  /**
   * 创建策略
   */
  async createStrategy(data: Partial<Strategy>): Promise<Strategy> {
    return this.request<Strategy>('POST', '/backtesting/strategies', data);
  }
}

// ============================================
// 导出默认实例
// ============================================

export function createApiClient(config: ApiClientConfig): TradingPlatformApiClient {
  return new TradingPlatformApiClient(config);
}

// 默认客户端（开发环境）
export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1',
});

