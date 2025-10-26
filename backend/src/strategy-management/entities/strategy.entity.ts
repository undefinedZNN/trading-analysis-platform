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
    nullable: false,
    comment: '策略名称',
  })
  name!: string;

  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: () => 'ARRAY[]::text[]',
    comment: '策略标签集合，用于分类检索',
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
