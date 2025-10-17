import {
  Column,
  DeleteDateColumn,
  OneToMany,
  PrimaryGeneratedColumn,
  Entity,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { ImportTaskEntity } from './import-task.entity';

const bigIntTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | number | null): number | null =>
    value === null ? null : Number(value),
};

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
    comment: '清洗后 Parquet 文件的相对存储路径',
  })
  path!: string;

  @Column({
    type: 'timestamptz',
    nullable: false,
    comment: '数据集中最早一条记录的时间（UTC）',
  })
  timeStart!: Date;

  @Column({
    type: 'timestamptz',
    nullable: false,
    comment: '数据集中最新一条记录的时间（UTC）',
  })
  timeEnd!: Date;

  @Column({
    type: 'bigint',
    nullable: false,
    transformer: bigIntTransformer,
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
    type: 'text',
    nullable: true,
    comment: '数据集描述或备注信息',
  })
  description?: string | null;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
    comment: '软删除标记时间，NULL 表示有效',
  })
  deletedAt?: Date | null;

  @OneToMany(() => ImportTaskEntity, (importTask) => importTask.dataset)
  importTasks?: ImportTaskEntity[];
}
