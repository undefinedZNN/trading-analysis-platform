import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { StrategyEntity } from '../../strategy-management/entities/strategy.entity';
import { StrategyScriptVersionEntity } from '../../strategy-management/entities/strategy-script-version.entity';
import { DatasetEntity } from '../../trading-data/entities/dataset.entity';

/**
 * 回测任务状态枚举
 */
export enum BacktestTaskStatus {
  /** 已提交，等待执行 */
  SUBMITTED = 'submitted',
  /** 正在排队 */
  QUEUED = 'queued',
  /** 正在运行 */
  RUNNING = 'running',
  /** 已完成 */
  FINISHED = 'finished',
  /** 执行失败 */
  FAILED = 'failed',
  /** 已取消 */
  CANCELLED = 'cancelled',
}

/**
 * 交易时段配置
 */
export interface TradingSession {
  /** 时段名称，例如 "RTH", "ETH" */
  name: string;
  /** 开始时间，格式 HH:mm */
  startTime: string;
  /** 结束时间，格式 HH:mm */
  endTime: string;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 风险约束配置
 */
export interface RiskConstraints {
  /** 最大回撤百分比 (0-100) */
  maxDrawdownPercent?: number;
  /** 最大单日亏损百分比 (0-100) */
  maxDailyLossPercent?: number;
  /** 最大持仓数量 */
  maxPositionSize?: number;
  /** 最大杠杆倍数 */
  maxLeverage?: number;
}

/**
 * 回测配置参数
 */
export interface BacktestConfig {
  /** 初始资金 */
  initialCapital: number;
  /** 交易时间级别，例如 "1m", "5m", "1h", "1d" */
  timeLevel: string;
  /** 滑点模型配置 */
  slippageModel?: {
    type: 'fixed' | 'percentage' | 'custom';
    value: number;
  };
  /** 手续费配置 */
  commission?: {
    type: 'fixed' | 'percentage';
    value: number;
  };
  /** 交易时段配置 */
  tradingSessions?: TradingSession[];
  /** 风险约束 */
  riskConstraints?: RiskConstraints;
  /** 自定义策略参数 */
  strategyParams?: Record<string, unknown>;
}

/**
 * 回测任务实体
 */
@Entity({ name: 'backtest_tasks', orderBy: { createdAt: 'DESC' } })
export class BacktestTaskEntity extends BaseAuditEntity {
  @PrimaryGeneratedColumn({
    type: 'integer',
    name: 'task_id',
    comment: '回测任务主键 ID',
  })
  taskId!: number;

  @Column({
    type: 'text',
    nullable: false,
    comment: '任务名称',
  })
  name!: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '任务描述',
  })
  description?: string | null;

  @Column({
    type: 'integer',
    name: 'strategy_id',
    nullable: false,
    comment: '关联的策略 ID',
  })
  strategyId!: number;

  @ManyToOne(() => StrategyEntity, { nullable: false })
  @JoinColumn({ name: 'strategy_id' })
  strategy?: StrategyEntity;

  @Column({
    type: 'integer',
    name: 'script_id',
    nullable: false,
    comment: '关联的脚本版本 ID',
  })
  scriptId!: number;

  @ManyToOne(() => StrategyScriptVersionEntity, { nullable: false })
  @JoinColumn({ name: 'script_id' })
  scriptVersion?: StrategyScriptVersionEntity;

  @Column({
    type: 'integer',
    name: 'dataset_id',
    nullable: false,
    comment: '关联的数据集 ID',
  })
  datasetId!: number;

  @ManyToOne(() => DatasetEntity, { nullable: false })
  @JoinColumn({ name: 'dataset_id' })
  dataset?: DatasetEntity;

  @Column({
    type: 'timestamptz',
    name: 'backtest_start_date',
    nullable: false,
    comment: '回测开始日期',
  })
  backtestStartDate!: Date;

  @Column({
    type: 'timestamptz',
    name: 'backtest_end_date',
    nullable: false,
    comment: '回测结束日期',
  })
  backtestEndDate!: Date;

  @Column({
    type: 'jsonb',
    nullable: false,
    comment: '回测配置参数（JSON）',
  })
  config!: BacktestConfig;

  @Column({
    type: 'enum',
    enum: BacktestTaskStatus,
    nullable: false,
    default: BacktestTaskStatus.SUBMITTED,
    comment: '任务状态',
  })
  status!: BacktestTaskStatus;

  @Column({
    type: 'integer',
    nullable: true,
    default: 0,
    comment: '执行进度 (0-100)',
  })
  progress?: number;

  @Column({
    type: 'text',
    name: 'error_message',
    nullable: true,
    comment: '错误信息（失败时记录）',
  })
  errorMessage?: string | null;

  @Column({
    type: 'timestamptz',
    name: 'started_at',
    nullable: true,
    comment: '任务开始执行时间',
  })
  startedAt?: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'finished_at',
    nullable: true,
    comment: '任务完成时间',
  })
  finishedAt?: Date | null;

  @Column({
    type: 'jsonb',
    name: 'result_summary',
    nullable: true,
    comment: '结果摘要（JSON）',
  })
  resultSummary?: Record<string, unknown> | null;

  @Column({
    type: 'text',
    name: 'result_storage_path',
    nullable: true,
    comment: '结果存储路径',
  })
  resultStoragePath?: string | null;
}

