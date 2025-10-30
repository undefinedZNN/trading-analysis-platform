import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ScriptVersionEntity } from './script-version.entity';

@Entity({ name: 'strategies' })
export class StrategyEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'strategy_id' })
  strategyId!: string;

  @Column({ name: 'name', type: 'varchar', length: 60, unique: true })
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'tags', type: 'jsonb', default: () => `'[]'::jsonb` })
  tags!: string[];

  @Column({ name: 'created_by', type: 'varchar', length: 64, nullable: true })
  createdBy?: string | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 64, nullable: true })
  updatedBy?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({
    name: 'default_script_version_id',
    type: 'uuid',
    nullable: true,
  })
  defaultScriptVersionId?: string | null;

  @OneToMany(() => ScriptVersionEntity, (version) => version.strategy)
  scriptVersions?: ScriptVersionEntity[];
}
