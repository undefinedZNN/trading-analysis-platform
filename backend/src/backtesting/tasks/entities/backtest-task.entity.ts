import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 回测任务状态枚举
 */
export enum BacktestTaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * 策略参数接口
 */
export interface StrategyParams {
  [key: string]: any;
}

/**
 * 执行配置接口
 */
export interface ExecutionConfig {
  initialCapital: number;
  leverage: number;
  slippage: number;
  fees: {
    makerFee: number;
    takerFee: number;
  };
  tradingHours?: {
    start: string;
    end: string;
  };
}

/**
 * 数据配置接口
 */
export interface DataConfig {
  timeRange: {
    start: string;
    end: string;
  };
  timeframe: string;
}

/**
 * 结果摘要接口
 */
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
}

/**
 * 回测任务实体
 * 
 * 存储回测任务的元数据、配置和执行状态
 */
@Entity({ name: 'backtest_tasks' })
@Index('idx_backtest_tasks_status', ['status'])
@Index('idx_backtest_tasks_strategy', ['strategyId'])
@Index('idx_backtest_tasks_version', ['scriptVersionId'])
@Index('idx_backtest_tasks_dataset', ['datasetId'])
@Index('idx_backtest_tasks_created_at', ['createdAt'])
@Index('idx_backtest_tasks_strategy_version_status', [
  'strategyId',
  'scriptVersionId',
  'status',
])
export class BacktestTaskEntity {
  /**
   * 任务唯一标识 (UUID)
   */
  @PrimaryGeneratedColumn('uuid', { name: 'task_id' })
  taskId!: string;

  /**
   * 任务名称，用户自定义，用于识别任务
   */
  @Column({ name: 'task_name', type: 'varchar', length: 100 })
  taskName!: string;

  /**
   * 任务描述，可选
   */
  @Column({ name: 'task_description', type: 'text', nullable: true })
  taskDescription?: string;

  /**
   * 关联的策略ID (UUID)
   */
  @Column({ name: 'strategy_id', type: 'uuid' })
  strategyId!: string;

  /**
   * 使用的脚本版本ID (UUID)
   */
  @Column({ name: 'script_version_id', type: 'uuid' })
  scriptVersionId!: string;

  /**
   * 使用的数据集ID (INTEGER)
   */
  @Column({ name: 'dataset_id', type: 'integer' })
  datasetId!: number;

  /**
   * 策略参数配置 (JSONB)
   * 存储用户输入的策略自定义参数
   */
  @Column({ name: 'strategy_params', type: 'jsonb', default: {} })
  strategyParams!: StrategyParams;

  /**
   * 执行配置 (JSONB)
   * 包含初始资金、手续费、杠杆等交易执行参数
   */
  @Column({ name: 'execution_config', type: 'jsonb', default: {} })
  executionConfig!: ExecutionConfig;

  /**
   * 数据配置 (JSONB)
   * 包含回测时间范围和时间周期
   */
  @Column({ name: 'data_config', type: 'jsonb', default: {} })
  dataConfig!: DataConfig;

  /**
   * 任务状态
   * pending: 待执行
   * running: 执行中
   * completed: 已完成
   * failed: 失败
   * cancelled: 已取消
   */
  @Column({ name: 'status', type: 'varchar', length: 20, default: BacktestTaskStatus.PENDING })
  status!: BacktestTaskStatus;

  /**
   * 任务执行进度百分比 (0-100)
   */
  @Column({ name: 'progress', type: 'integer', default: 0, nullable: true })
  progress?: number;

  /**
   * 任务创建时间 (UTC时区)
   */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * 任务开始执行时间 (UTC时区)
   */
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  /**
   * 任务完成时间 (UTC时区)
   */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  /**
   * 任务最后更新时间 (UTC时区)
   * 任何字段更新时自动更新
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * 回测结果摘要 (JSONB)
   * 完成后填充，包含总收益率、最大回撤等关键指标
   */
  @Column({ name: 'result_summary', type: 'jsonb', nullable: true })
  resultSummary?: ResultSummary;

  /**
   * 回测结果详细数据文件路径
   * 指向DuckDB或Parquet文件
   */
  @Column({ name: 'result_file_path', type: 'varchar', length: 500, nullable: true })
  resultFilePath?: string;

  /**
   * 当前分配的 Worker ID
   */
  @Column({ name: 'assigned_worker_id', type: 'varchar', length: 128, nullable: true })
  assignedWorkerId?: string;

  @Column({ name: 'metrics_snapshot', type: 'jsonb', nullable: true })
  metricsSnapshot?: Record<string, unknown>;

  /**
   * 错误信息
   * 任务失败时记录简要错误描述
   */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  /**
   * 错误堆栈
   * 任务失败时记录完整的错误堆栈信息
   */
  @Column({ name: 'error_stack', type: 'text', nullable: true })
  errorStack?: string;

  /**
   * 任务创建者
   */
  @Column({ name: 'created_by', type: 'varchar', length: 64, nullable: true })
  createdBy?: string;

  /**
   * 任务最后更新者
   */
  @Column({ name: 'updated_by', type: 'varchar', length: 64, nullable: true })
  updatedBy?: string;
}
