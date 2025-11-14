import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DatasetEntity } from './dataset.entity';
import { DatasetAggregationEntity } from './dataset-aggregation.entity';

export enum AggregationTaskStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum TriggerType {
  Auto = 'auto',
  Manual = 'manual',
  Retry = 'retry',
}

/**
 * 聚合任务实体
 * 记录每次聚合操作的执行情况
 */
@Entity({ name: 'aggregation_tasks' })
export class AggregationTaskEntity {
  @PrimaryGeneratedColumn({
    name: 'task_id',
    comment: '聚合任务主键',
  })
  taskId!: number;

  @Column({
    name: 'aggregation_id',
    type: 'integer',
    nullable: true,
    comment: '关联的聚合记录ID',
  })
  aggregationId?: number | null;

  @ManyToOne(() => DatasetAggregationEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'aggregation_id' })
  aggregation?: DatasetAggregationEntity;

  @Column({
    name: 'dataset_id',
    type: 'integer',
    comment: '所属数据集ID',
  })
  datasetId!: number;

  @ManyToOne(() => DatasetEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dataset_id' })
  dataset!: DatasetEntity;

  @Column({
    name: 'target_granularity',
    type: 'text',
    comment: '目标聚合粒度',
  })
  targetGranularity!: string;

  @Column({
    name: 'trigger_type',
    type: 'text',
    enum: TriggerType,
    comment: '触发方式：auto（自动）/manual（手动）/retry（重试）',
  })
  triggerType!: TriggerType;

  @Column({
    name: 'triggered_by',
    type: 'text',
    nullable: true,
    comment: '触发人标识',
  })
  triggeredBy?: string | null;

  @Column({
    type: 'text',
    enum: AggregationTaskStatus,
    default: AggregationTaskStatus.Pending,
    comment: '任务状态：pending/running/completed/failed/cancelled',
  })
  status!: AggregationTaskStatus;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    comment: '任务进度百分比（0-100）',
  })
  progress!: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: '任务消息（如成功提示、错误摘要）',
  })
  message?: string | null;

  @Column({
    name: 'error_log',
    type: 'text',
    nullable: true,
    comment: '详细错误日志（堆栈跟踪）',
  })
  errorLog?: string | null;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    nullable: true,
    comment: '任务开始时间',
  })
  startedAt?: Date | null;

  @Column({
    name: 'finished_at',
    type: 'timestamptz',
    nullable: true,
    comment: '任务完成时间',
  })
  finishedAt?: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    comment: '记录创建时间',
  })
  createdAt!: Date;
}

