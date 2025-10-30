import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StrategyEntity } from './strategy.entity';

@Entity({ name: 'script_versions' })
export class ScriptVersionEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'script_version_id' })
  scriptVersionId!: string;

  @Column({ name: 'strategy_id', type: 'uuid' })
  strategyId!: string;

  @ManyToOne(() => StrategyEntity, (strategy) => strategy.scriptVersions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'strategy_id', referencedColumnName: 'strategyId' })
  strategy!: StrategyEntity;

  @Column({ name: 'version_name', type: 'varchar', length: 20 })
  versionName!: string;

  @Column({ name: 'is_master', type: 'boolean', default: false })
  isMaster!: boolean;

  @Column({ name: 'code', type: 'text' })
  code!: string;

  @Column({ name: 'parameter_schema', type: 'jsonb', default: () => `'[]'::jsonb` })
  parameterSchema!: unknown;

  @Column({ name: 'factor_schema', type: 'jsonb', default: () => `'[]'::jsonb` })
  factorSchema!: unknown;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark?: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 64, nullable: true })
  createdBy?: string | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 64, nullable: true })
  updatedBy?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'last_referenced_at', type: 'timestamptz', nullable: true })
  lastReferencedAt?: Date | null;
}
