import {
  Column,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { StrategyScriptVersionEntity } from './strategy-script-version.entity';

@Entity({ name: 'strategies', orderBy: { createdAt: 'DESC' } })
export class StrategyEntity extends BaseAuditEntity {
  @PrimaryGeneratedColumn({
    type: 'integer',
    name: 'strategy_id',
    comment: '策略主键 ID',
  })
  strategyId!: number;

  @Column({
    type: 'text',
    unique: true,
    nullable: false,
    comment: '策略唯一编码，便于 API/CLI 调用',
  })
  code!: string;

  @Column({
    type: 'text',
    nullable: false,
    comment: '策略名称',
  })
  name!: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '归属团队或小组',
  })
  team?: string | null;

  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: () => 'ARRAY[]::text[]',
    comment: '适用市场或标的标签集合',
  })
  markets!: string[];

  @Column({
    type: 'text',
    nullable: true,
    comment: '交易频率，如 1m、5m、1d',
  })
  frequency?: string | null;

  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: () => 'ARRAY[]::text[]',
    comment: '策略标签集合',
  })
  tags!: string[];

  @Column({
    type: 'text',
    nullable: true,
    comment: '策略说明文档或备注',
  })
  description?: string | null;

  @DeleteDateColumn({
    type: 'timestamptz',
    name: 'deleted_at',
    nullable: true,
    comment: '软删除标记时间',
  })
  deletedAt?: Date | null;

  @OneToMany(
    () => StrategyScriptVersionEntity,
    (script) => script.strategy,
  )
  scriptVersions?: StrategyScriptVersionEntity[];
}
