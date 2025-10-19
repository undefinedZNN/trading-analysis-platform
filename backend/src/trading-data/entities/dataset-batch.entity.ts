import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DatasetEntity } from './dataset.entity';
import { ImportTaskEntity } from './import-task.entity';

const bigIntTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | number | null): number | null =>
    value === null ? null : Number(value),
};

@Entity({ name: 'dataset_batches', orderBy: { createdAt: 'ASC' } })
export class DatasetBatchEntity {
  @PrimaryGeneratedColumn({
    type: 'integer',
    name: 'dataset_batch_id',
    comment: '数据集批次记录主键',
  })
  datasetBatchId!: number;

  @Column({
    type: 'integer',
    name: 'dataset_id',
    nullable: false,
    comment: '所属数据集 ID',
  })
  datasetId!: number;

  @ManyToOne(() => DatasetEntity, (dataset) => dataset.batches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dataset_id' })
  dataset!: DatasetEntity;

  @Column({
    type: 'integer',
    name: 'import_id',
    nullable: false,
    comment: '来源导入任务 ID',
  })
  importId!: number;

  @ManyToOne(() => ImportTaskEntity, (importTask) => importTask.datasetBatches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'import_id' })
  importTask!: ImportTaskEntity;

  @Column({
    type: 'text',
    nullable: false,
    comment: '批次文件相对存储路径',
  })
  path!: string;

  @Column({
    type: 'timestamptz',
    name: 'time_start',
    nullable: false,
    comment: '批次最早时间戳 (UTC)',
  })
  timeStart!: Date;

  @Column({
    type: 'timestamptz',
    name: 'time_end',
    nullable: false,
    comment: '批次最晚时间戳 (UTC)',
  })
  timeEnd!: Date;

  @Column({
    type: 'bigint',
    name: 'row_count',
    nullable: false,
    transformer: bigIntTransformer,
    comment: '批次记录条数',
  })
  rowCount!: number;

  @Column({
    type: 'text',
    nullable: false,
    comment: '批次文件校验值',
  })
  checksum!: string;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
    comment: '记录创建时间',
  })
  createdAt!: Date;
}
