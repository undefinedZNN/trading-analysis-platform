import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DatasetEntity } from './dataset.entity';

export enum AggregationStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

const bigIntTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | number | null): number | null =>
    value === null ? null : Number(value),
};

/**
 * 数据集聚合实体
 * 记录每个数据集的预聚合结果元数据
 */
@Entity({ name: 'dataset_aggregations' })
export class DatasetAggregationEntity {
  @PrimaryGeneratedColumn({
    name: 'aggregation_id',
    comment: '聚合记录主键',
  })
  aggregationId!: number;

  @Column({
    name: 'dataset_id',
    type: 'integer',
    comment: '所属数据集ID',
  })
  datasetId!: number;

  @ManyToOne(() => DatasetEntity, (dataset) => dataset.aggregations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dataset_id' })
  dataset!: DatasetEntity;

  @Column({
    name: 'source_granularity',
    type: 'text',
    comment: '源数据粒度，如 1m',
  })
  sourceGranularity!: string;

  @Column({
    name: 'target_granularity',
    type: 'text',
    comment: '目标聚合粒度，如 5m, 1h, 1d',
  })
  targetGranularity!: string;

  @Column({
    type: 'text',
    comment: '聚合结果Parquet文件相对路径',
  })
  path!: string;

  @Column({
    name: 'time_start',
    type: 'timestamptz',
    comment: '聚合数据起始时间（UTC）',
  })
  timeStart!: Date;

  @Column({
    name: 'time_end',
    type: 'timestamptz',
    comment: '聚合数据结束时间（UTC）',
  })
  timeEnd!: Date;

  @Column({
    name: 'row_count',
    type: 'bigint',
    transformer: bigIntTransformer,
    default: 0,
    comment: '聚合结果记录条数',
  })
  rowCount!: number;

  @Column({
    type: 'text',
    default: '',
    comment: '聚合文件校验和（MD5）',
  })
  checksum!: string;

  @Column({
    type: 'text',
    enum: AggregationStatus,
    default: AggregationStatus.Pending,
    comment: '聚合状态：pending/processing/completed/failed',
  })
  status!: AggregationStatus;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    comment: '聚合进度百分比（0-100）',
  })
  progress!: number;

  @Column({
    name: 'error_log',
    type: 'text',
    nullable: true,
    comment: '聚合失败时的错误日志',
  })
  errorLog?: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    comment: '记录创建时间',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    comment: '记录更新时间',
  })
  updatedAt!: Date;
}

