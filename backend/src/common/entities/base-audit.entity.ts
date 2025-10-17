import { Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export class BaseAuditEntity {
  @Column({
    name: 'created_by',
    type: 'text',
    nullable: true,
    comment: '记录创建人标识（预留）',
  })
  createdBy?: string | null;

  @Column({
    name: 'updated_by',
    type: 'text',
    nullable: true,
    comment: '记录最后编辑人标识（预留）',
  })
  updatedBy?: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '记录创建时间',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '记录最近更新时间',
  })
  updatedAt!: Date;
}
