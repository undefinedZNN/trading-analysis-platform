import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { DatasetEntity } from './dataset.entity';
import { DatasetBatchEntity } from './dataset-batch.entity';

const numericTransformer = {
  to: (value?: number | null) => value ?? 0,
  from: (value: string | number | null): number =>
    value === null ? 0 : Number(value),
};

export enum ImportStatus {
  Pending = 'pending',
  Uploading = 'uploading',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

@Entity({ name: 'imports', orderBy: { createdAt: 'DESC' } })
export class ImportTaskEntity extends BaseAuditEntity {
  @PrimaryGeneratedColumn({
    type: 'integer',
    name: 'import_id',
    comment: '自增主键，标识导入任务唯一 ID',
  })
  importId!: number;

  @Column({
    type: 'integer',
    name: 'dataset_id',
    nullable: true,
    comment: '关联成功生成的数据集 ID',
  })
  datasetId?: number | null;

  @ManyToOne(() => DatasetEntity, (dataset) => dataset.importTasks, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'dataset_id' })
  dataset?: DatasetEntity | null;

  @Column({
    type: 'integer',
    name: 'target_dataset_id',
    nullable: true,
    comment: '追加写入时的目标数据集 ID',
  })
  targetDatasetId?: number | null;

  @ManyToOne(() => DatasetEntity, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'target_dataset_id' })
  targetDataset?: DatasetEntity | null;

  @Column({
    type: 'text',
    nullable: false,
    name: 'source_file',
    comment: '用户上传的原始文件名',
  })
  sourceFile!: string;

  @Column({
    type: 'text',
    nullable: false,
    name: 'stored_file_path',
    comment: '原始文件在 raw_uploads 目录中的相对路径',
  })
  storedFilePath!: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: '导入任务提交时的附加元数据（来源、交易对等）',
  })
  metadata?: Record<string, unknown> | null;

  @Column({
    type: 'text',
    nullable: false,
    comment: '处理该任务的清洗插件名称',
    name: 'plugin_name',
  })
  pluginName!: string;

  @Column({
    type: 'text',
    nullable: false,
    comment: '清洗插件版本号',
    name: 'plugin_version',
  })
  pluginVersion!: string;

  @Column({
    type: 'varchar',
    length: 32,
    nullable: false,
    comment:
      '导入任务状态：pending/uploading/processing/completed/failed',
  })
  status!: ImportStatus;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: () => '0',
    transformer: numericTransformer,
    comment: '导入任务完成进度百分比（0-100）',
  })
  progress!: number;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '当前阶段标识，例如 uploading、cleaning、storing',
  })
  stage?: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: '状态摘要或错误信息',
  })
  message?: string | null;

  @Column({
    type: 'text',
    nullable: true,
    name: 'error_log',
    comment: '完整错误日志内容，失败时记录',
  })
  errorLog?: string | null;

  @Column({
    type: 'timestamptz',
    nullable: false,
    name: 'started_at',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '任务开始时间',
  })
  startedAt!: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    name: 'finished_at',
    comment: '任务结束时间（成功或失败）',
  })
  finishedAt?: Date | null;

  @OneToMany(() => DatasetBatchEntity, (batch) => batch.importTask)
  datasetBatches?: DatasetBatchEntity[];
}
