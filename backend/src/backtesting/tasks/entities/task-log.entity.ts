import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * 日志元数据接口
 */
export interface LogMetadata {
  [key: string]: any;
}

/**
 * 任务日志实体
 * 
 * 记录回测任务执行过程中的日志信息，用于监控和调试
 */
@Entity({ name: 'task_logs' })
@Index('idx_task_logs_task_time', ['taskId', 'loggedAt'])
@Index('idx_task_logs_task_level', ['taskId', 'level'])
@Index('idx_task_logs_logged_at', ['loggedAt'])
export class TaskLogEntity {
  /**
   * 日志记录唯一标识 (自增BIGINT)
   */
  @PrimaryGeneratedColumn('increment', {
    name: 'log_id',
    type: 'bigint',
  })
  logId!: string;

  /**
   * 关联的任务ID (UUID)
   * 指向 backtest_tasks 表
   */
  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  /**
   * 日志级别
   * debug: 调试信息
   * info: 一般信息
   * warn: 警告信息
   * error: 错误信息
   */
  @Column({ name: 'level', type: 'varchar', length: 10 })
  level!: LogLevel;

  /**
   * 日志来源模块名称
   * 如 Orchestrator、StrategySandbox、RiskEngine 等
   */
  @Column({ name: 'module', type: 'varchar', length: 50, nullable: true })
  module?: string;

  /**
   * 日志消息内容
   */
  @Column({ name: 'message', type: 'text' })
  message!: string;

  /**
   * 日志元数据 (JSONB)
   * 可选，存储结构化的额外信息
   * 如事件ID、价格、交易ID等
   */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: LogMetadata;

  /**
   * 日志记录时间 (UTC时区)
   */
  @CreateDateColumn({ name: 'logged_at', type: 'timestamptz' })
  loggedAt!: Date;
}

