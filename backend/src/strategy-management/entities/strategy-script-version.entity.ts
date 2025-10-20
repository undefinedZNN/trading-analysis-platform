import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { StrategyEntity } from './strategy.entity';

@Entity({ name: 'strategy_scripts', orderBy: { createdAt: 'DESC' } })
@Unique(['strategyId', 'versionCode'])
export class StrategyScriptVersionEntity extends BaseAuditEntity {
  @PrimaryGeneratedColumn({
    type: 'integer',
    name: 'script_id',
    comment: '脚本版本主键 ID',
  })
  scriptId!: number;

  @Column({
    type: 'integer',
    name: 'strategy_id',
    nullable: false,
    comment: '所属策略 ID',
  })
  strategyId!: number;

  @ManyToOne(() => StrategyEntity, (strategy) => strategy.scriptVersions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'strategy_id' })
  strategy!: StrategyEntity;

  @Column({
    type: 'text',
    name: 'version_code',
    nullable: false,
    comment: '脚本版本号，例如 v20240513-001 或 1.0.0',
  })
  versionCode!: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '版本描述或摘要',
  })
  description?: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: '版本变更记录，markdown/纯文本',
  })
  changelog?: string | null;

  @Column({
    type: 'text',
    name: 'script_source',
    nullable: false,
    comment: 'TypeScript 源码内容',
  })
  scriptSource!: string;

  @Column({
    type: 'jsonb',
    name: 'manifest',
    nullable: true,
    comment: '脚本 manifest 描述（入口文件、依赖等）',
  })
  manifest?: Record<string, unknown> | null;

  @Column({
    type: 'boolean',
    name: 'is_primary',
    nullable: false,
    default: () => 'false',
    comment: '是否标记为主版本',
  })
  isPrimary!: boolean;
}
