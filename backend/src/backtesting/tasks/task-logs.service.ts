import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { TaskLogEntity, LogLevel } from './entities';
import { ListTaskLogsDto } from './dto';

/**
 * 任务日志服务
 * 
 * 提供任务日志的查询和管理功能
 */
@Injectable()
export class TaskLogsService {
  private readonly logger = new Logger(TaskLogsService.name);

  constructor(
    @InjectRepository(TaskLogEntity)
    private readonly taskLogRepository: Repository<TaskLogEntity>,
  ) {}

  /**
   * 创建日志记录
   * 
   * @param taskId 任务ID
   * @param level 日志级别
   * @param message 日志消息
   * @param module 来源模块（可选）
   * @param metadata 元数据（可选）
   * @returns 创建的日志实体
   */
  async create(
    taskId: string,
    level: LogLevel,
    message: string,
    module?: string,
    metadata?: Record<string, any>,
  ): Promise<TaskLogEntity> {
    const log = this.taskLogRepository.create({
      taskId,
      level,
      message,
      module,
      metadata,
    });

    return await this.taskLogRepository.save(log);
  }

  /**
   * 批量创建日志记录
   * 
   * @param logs 日志数组
   * @returns 创建的日志实体数组
   */
  async createBatch(logs: Array<{
    taskId: string;
    level: LogLevel;
    message: string;
    module?: string;
    metadata?: Record<string, any>;
  }>): Promise<TaskLogEntity[]> {
    const entities = logs.map(log => this.taskLogRepository.create(log));
    return await this.taskLogRepository.save(entities);
  }

  /**
   * 查询任务日志（支持下拉加载）
   * 
   * @param taskId 任务ID
   * @param listDto 查询参数DTO
   * @returns 日志列表和是否有更多数据
   */
  async findByTask(
    taskId: string,
    listDto: ListTaskLogsDto,
  ): Promise<{
    logs: TaskLogEntity[];
    hasMore: boolean;
  }> {
    const {
      level,
      keyword,
      before,
      limit = 100,
    } = listDto;

    const queryBuilder = this.taskLogRepository
      .createQueryBuilder('log')
      .where('log.task_id = :taskId', { taskId });

    // 日志级别筛选
    if (level) {
      queryBuilder.andWhere('log.level = :level', { level });
    }

    // 关键词搜索（搜索消息内容）
    if (keyword) {
      queryBuilder.andWhere('log.message ILIKE :keyword', { keyword: `%${keyword}%` });
    }

    // 下拉加载：获取指定日志ID之前的日志
    if (before) {
      queryBuilder.andWhere('log.log_id < :before', { before });
    }

    // 按时间倒序排列（最新的日志在前）
    queryBuilder.orderBy('log.logged_at', 'DESC');

    // 限制数量（多取1条用于判断是否有更多数据）
    queryBuilder.limit(limit + 1);

    const logs = await queryBuilder.getMany();

    // 判断是否有更多数据
    const hasMore = logs.length > limit;
    
    // 如果有更多数据，移除多余的一条
    if (hasMore) {
      logs.pop();
    }

    this.logger.debug(`Found ${logs.length} logs for task ${taskId}, hasMore: ${hasMore}`);

    return {
      logs,
      hasMore,
    };
  }

  /**
   * 获取最新日志（用于主动刷新）
   * 
   * @param taskId 任务ID
   * @param limit 返回数量
   * @returns 最新的日志列表
   */
  async findLatest(taskId: string, limit: number = 100): Promise<TaskLogEntity[]> {
    return await this.taskLogRepository.find({
      where: { taskId },
      order: { loggedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * 统计任务日志数量（按级别分组）
   * 
   * @param taskId 任务ID
   * @returns 各级别的日志数量
   */
  async countByLevel(taskId: string): Promise<{
    total: number;
    debug: number;
    info: number;
    warn: number;
    error: number;
  }> {
    const result = await this.taskLogRepository
      .createQueryBuilder('log')
      .select('log.level', 'level')
      .addSelect('COUNT(*)', 'count')
      .where('log.task_id = :taskId', { taskId })
      .groupBy('log.level')
      .getRawMany();

    const counts = {
      total: 0,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    result.forEach((row) => {
      const count = parseInt(row.count, 10);
      counts.total += count;
      counts[row.level as keyof typeof counts] = count;
    });

    return counts;
  }

  /**
   * 删除任务的所有日志
   * 
   * @param taskId 任务ID
   * @returns 删除的日志数量
   */
  async removeByTask(taskId: string): Promise<number> {
    const result = await this.taskLogRepository.delete({ taskId });
    
    this.logger.log(`Deleted ${result.affected || 0} logs for task ${taskId}`);
    return result.affected || 0;
  }

  /**
   * 清理旧日志（用于定期归档）
   * 
   * @param beforeDate 清理此日期之前的日志
   * @returns 删除的日志数量
   */
  async cleanOldLogs(beforeDate: Date): Promise<number> {
    const result = await this.taskLogRepository
      .createQueryBuilder()
      .delete()
      .where('logged_at < :beforeDate', { beforeDate })
      .execute();

    this.logger.log(`Cleaned ${result.affected || 0} old logs before ${beforeDate.toISOString()}`);
    return result.affected || 0;
  }

  /**
   * 便捷方法：记录调试日志
   */
  async debug(taskId: string, message: string, module?: string, metadata?: Record<string, any>): Promise<TaskLogEntity> {
    return this.create(taskId, LogLevel.DEBUG, message, module, metadata);
  }

  /**
   * 便捷方法：记录信息日志
   */
  async info(taskId: string, message: string, module?: string, metadata?: Record<string, any>): Promise<TaskLogEntity> {
    return this.create(taskId, LogLevel.INFO, message, module, metadata);
  }

  /**
   * 便捷方法：记录警告日志
   */
  async warn(taskId: string, message: string, module?: string, metadata?: Record<string, any>): Promise<TaskLogEntity> {
    return this.create(taskId, LogLevel.WARN, message, module, metadata);
  }

  /**
   * 便捷方法：记录错误日志
   */
  async error(taskId: string, message: string, module?: string, metadata?: Record<string, any>): Promise<TaskLogEntity> {
    return this.create(taskId, LogLevel.ERROR, message, module, metadata);
  }
}

