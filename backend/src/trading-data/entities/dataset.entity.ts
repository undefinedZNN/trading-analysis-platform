import {
  Column,
  DeleteDateColumn,
  OneToMany,
  PrimaryGeneratedColumn,
  Entity,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { ImportTaskEntity } from './import-task.entity';
import { DatasetBatchEntity } from './dataset-batch.entity';
import { DatasetAggregationEntity } from './dataset-aggregation.entity';

const bigIntTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | number | null): number | null =>
    value === null ? null : Number(value),
};

/**
 * 合约规格接口
 */
export interface ContractSpecs {
  /** 合约乘数（期货） */
  multiplier?: number;
  /** 最小变动价位 */
  tickSize?: number;
  /** 最小交易单位（手数） */
  lotSize?: number;
  /** 保证金比例（期货） */
  marginRatio?: number;
  /** 计价货币 */
  currency?: string;
}

@Entity({ name: 'datasets', orderBy: { createdAt: 'DESC' } })
export class DatasetEntity extends BaseAuditEntity {
  @PrimaryGeneratedColumn({
    type: 'integer',
    name: 'dataset_id',
    comment: '自增主键，标识数据集唯一 ID',
  })
  datasetId!: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: '数据来源渠道，可为空表示未知',
  })
  source?: string | null;

  @Column({
    type: 'text',
    nullable: false,
    name: 'trading_pair',
    comment: '交易对或标的符号，例如 BTC/USDT、AAPL',
  })
  tradingPair!: string;

  @Column({
    type: 'text',
    nullable: false,
    comment: '时间粒度，如 1m、5m、1d',
  })
  granularity!: string;

  @Column({
    type: 'text',
    nullable: false,
    comment: '数据集根目录或主文件的相对路径',
  })
  path!: string;

  @Column({
    type: 'text',
    name: 'path_template',
    nullable: true,
    comment: '数据集路径模板，例如 source/tradingPair/{granularity}',
  })
  pathTemplate?: string | null;

  @Column({
    type: 'timestamptz',
    nullable: false,
    name: 'time_start',
    comment: '数据集中最早一条记录的时间（UTC）',
  })
  timeStart!: Date;

  @Column({
    type: 'timestamptz',
    nullable: false,
    name: 'time_end',
    comment: '数据集中最新一条记录的时间（UTC）',
  })
  timeEnd!: Date;

  @Column({
    type: 'bigint',
    nullable: false,
    transformer: bigIntTransformer,
    name: 'row_count',
    comment: '数据集中包含的记录条数',
  })
  rowCount!: number;

  @Column({
    type: 'text',
    nullable: false,
    comment: '清洗结果文件的校验值（如 MD5）',
  })
  checksum!: string;

  @Column({
    type: 'jsonb',
    nullable: false,
    default: () => "'[]'::jsonb",
    comment: '自定义标签集合，入库前需去重与裁剪',
  })
  labels!: string[];

  @Column({
    type: 'jsonb',
    name: 'available_granularities',
    nullable: false,
    default: () => "'[]'::jsonb",
    comment: '当前可用的时间粒度列表（含原始 + 已完成聚合）',
  })
  availableGranularities!: string[];

  @Column({
    type: 'text',
    nullable: true,
    comment: '数据集描述或备注信息',
  })
  description?: string | null;

  @Column({
    type: 'text',
    name: 'asset_type',
    nullable: false,
    default: 'crypto',
    comment: '资产类型：stock（股票）、futures（期货）、crypto（加密货币）、forex（外汇）',
  })
  assetType!: string;

  @Column({
    type: 'jsonb',
    name: 'contract_specs',
    nullable: true,
    comment: '合约规格信息',
  })
  contractSpecs?: ContractSpecs;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
    name: 'deleted_at',
    comment: '软删除标记时间，NULL 表示有效',
  })
  deletedAt?: Date | null;

  @OneToMany(() => ImportTaskEntity, (importTask) => importTask.dataset)
  importTasks?: ImportTaskEntity[];

  @OneToMany(() => DatasetBatchEntity, (batch) => batch.dataset)
  batches?: DatasetBatchEntity[];

  @OneToMany(() => DatasetAggregationEntity, (aggregation) => aggregation.dataset)
  aggregations?: DatasetAggregationEntity[];
}
