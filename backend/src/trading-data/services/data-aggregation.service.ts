import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, FindOptionsWhere } from 'typeorm';
import { dirname } from 'path';
import { mkdir, rename, copyFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import * as duckdb from 'duckdb';
import { DatasetEntity } from '../entities/dataset.entity';
import { DatasetBatchEntity } from '../entities/dataset-batch.entity';
import {
  DatasetAggregationEntity,
  AggregationStatus,
} from '../entities/dataset-aggregation.entity';
import {
  AggregationTaskEntity,
  AggregationTaskStatus,
  TriggerType,
} from '../entities/aggregation-task.entity';
import { resolveDatasetPath } from '../../config/storage.config';
import { getDefaultAggregationGranularities } from '../../config/aggregation.config';

/**
 * 预聚合服务基础实现
 * T1.3.1 仅提供任务创建与核心骨架，后续任务将补充 SQL、DuckDB 执行等细节。
 */
interface AggregationQueryConfig {
  sourceGranularity: string;
  targetGranularity: string;
  sourcePaths: string[];
  outputPath: string;
  timeStart: Date;
  timeEnd: Date;
}

interface AggregationQueryPlan {
  selectSql: string;
  exportSql: string;
  intervalSeconds: number;
}

interface AggregationExecutionSummary {
  rowCount: number;
  timeStart: Date;
  timeEnd: Date;
  checksum: string;
  outputPath: string;
  aggregationId: number;
}

@Injectable()
export class DataAggregationService {
  private readonly logger = new Logger(DataAggregationService.name);

  private readonly DEFAULT_GRANULARITIES =
    getDefaultAggregationGranularities();
  private readonly MAX_RETRY_ATTEMPTS = 3;

  constructor(
    @InjectRepository(DatasetEntity)
    private readonly datasetRepository: Repository<DatasetEntity>,
    @InjectRepository(DatasetAggregationEntity)
    private readonly aggregationRepository: Repository<DatasetAggregationEntity>,
    @InjectRepository(AggregationTaskEntity)
    private readonly taskRepository: Repository<AggregationTaskEntity>,
  ) {}

  /**
   * 为指定数据集创建聚合任务
   */
  async createAggregationTasks(
    datasetId: number,
    targetGranularities?: string[],
    triggerType: TriggerType = TriggerType.Auto,
    triggeredBy?: string,
  ): Promise<AggregationTaskEntity[]> {
    const dataset = await this.datasetRepository.findOne({
      where: { datasetId },
    });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    const granularities =
      targetGranularities?.length && targetGranularities.length > 0
        ? targetGranularities
        : this.getDefaultGranularities();

    if (!granularities.length) {
      this.logger.warn(
        `Dataset ${datasetId} 没有可用的聚合粒度，跳过任务创建`,
      );
      return [];
    }

    const tasks: AggregationTaskEntity[] = [];

    for (const targetGranularity of granularities) {
      if (
        !this.validateGranularityPair(dataset.granularity, targetGranularity)
      ) {
        this.logger.warn(
          `跳过非法聚合粒度 ${dataset.granularity} -> ${targetGranularity}`,
        );
        continue;
      }

      const aggregation = await this.ensureAggregationRecord(
        dataset,
        targetGranularity,
      );

      const task = this.taskRepository.create({
        aggregationId: aggregation.aggregationId,
        datasetId: dataset.datasetId,
        targetGranularity,
        triggerType,
        triggeredBy: triggeredBy ?? null,
        status: AggregationTaskStatus.Pending,
        progress: 0,
        message: null,
      });

      tasks.push(await this.taskRepository.save(task));
    }

    tasks.forEach((task) => this.dispatchTaskExecution(task));

    return tasks;
  }

  /**
   * 根据配置生成聚合查询与导出语句
   */
  buildAggregationQueryPlan(
    config: AggregationQueryConfig,
  ): AggregationQueryPlan {
    if (!config.sourcePaths.length) {
      throw new BadRequestException('缺少聚合源文件，无法生成 SQL');
    }

    const intervalSeconds = this.parseGranularityToSeconds(
      config.targetGranularity,
    );
    const sourceList = config.sourcePaths
      .map((path) => `'${this.escapeSqlLiteral(path)}'`)
      .join(', ');

    const timeStart = config.timeStart.toISOString();
    const timeEnd = config.timeEnd.toISOString();

    const selectSql = `
      WITH source_data AS (
        SELECT
          timestamp,
          open,
          high,
          low,
          close,
          volume
        FROM read_parquet([${sourceList}])
        WHERE timestamp >= TIMESTAMP '${timeStart}'
          AND timestamp < TIMESTAMP '${timeEnd}'
      ),
      bucketed AS (
        SELECT
          *,
          CAST(
            FLOOR(epoch(timestamp) / ${intervalSeconds}) * ${intervalSeconds}
          AS BIGINT) AS bucket
        FROM source_data
      )
      SELECT
        to_timestamp(bucket) AS timestamp,
        arg_min(open, timestamp) AS open,
        max(high) AS high,
        min(low) AS low,
        arg_max(close, timestamp) AS close,
        sum(volume) AS volume
      FROM bucketed
      GROUP BY bucket
      ORDER BY bucket
    `.trim();

    const exportSql = `
      COPY (${selectSql})
      TO '${this.escapeSqlLiteral(config.outputPath)}'
      (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
    `.trim();

    return { selectSql, exportSql, intervalSeconds };
  }

  /**
   * 执行 DuckDB 聚合并返回统计与校验信息
   */
  protected async runAggregationTask(
    task: AggregationTaskEntity,
  ): Promise<AggregationExecutionSummary> {
    const { config, aggregation } = await this.prepareAggregationConfig(task);
    const stats = await this.executeDuckDbAggregation(config);
    const checksum = await this.computeFileChecksum(config.outputPath);

    return {
      ...stats,
      checksum,
      outputPath: config.outputPath,
      aggregationId: aggregation.aggregationId,
    };
  }

  /**
   * 确保存在对应的聚合元数据记录
   */
  private async ensureAggregationRecord(
    dataset: DatasetEntity,
    targetGranularity: string,
  ): Promise<DatasetAggregationEntity> {
    let aggregation = await this.aggregationRepository.findOne({
      where: { datasetId: dataset.datasetId, targetGranularity },
    });

    if (aggregation) {
      return aggregation;
    }

    aggregation = this.aggregationRepository.create({
      datasetId: dataset.datasetId,
      sourceGranularity: dataset.granularity,
      targetGranularity,
      path: this.buildAggregationPath(dataset, targetGranularity),
      timeStart: dataset.timeStart,
      timeEnd: dataset.timeEnd,
      rowCount: 0,
      checksum: '',
      status: AggregationStatus.Pending,
      progress: 0,
    });

    return this.aggregationRepository.save(aggregation);
  }

  /**
   * 默认聚合粒度，可在后续任务中接入配置
   */
  protected getDefaultGranularities(): string[] {
    return [...this.DEFAULT_GRANULARITIES];
  }

  /**
   * 验证粒度组合是否合法
   * T1.3.5 将实现真实逻辑，这里先返回 true 以便联调其它环节。
   */
  protected validateGranularityPair(
    source: string,
    target: string,
  ): boolean {
    try {
      const sourceMs = this.parseGranularityToMs(source);
      const targetMs = this.parseGranularityToMs(target);

      if (targetMs < sourceMs) {
        return false;
      }

      const ratio = targetMs / sourceMs;
      return Number.isInteger(ratio);
    } catch (error) {
      this.logger.warn(
        `粒度验证失败 (${source} -> ${target}): ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  /**
   * 解析粒度到秒
   */
  protected parseGranularityToSeconds(granularity: string): number {
    const match = granularity.match(/^(\d+)([smhdwM])$/);
    if (!match) {
      throw new BadRequestException(
        `无效的时间粒度格式: ${granularity}`,
      );
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const unitSeconds: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800,
      M: 2592000, // 月份按30天近似
    };

    return value * unitSeconds[unit];
  }

  /**
   * 解析粒度到毫秒
   */
  protected parseGranularityToMs(granularity: string): number {
    return this.parseGranularityToSeconds(granularity) * 1000;
  }

  /**
   * 构建聚合配置，收集源文件与输出路径
   */
  private async prepareAggregationConfig(
    task: AggregationTaskEntity,
  ): Promise<{
    config: AggregationQueryConfig;
    dataset: DatasetEntity;
    aggregation: DatasetAggregationEntity;
  }> {
    const dataset = await this.datasetRepository.findOne({
      where: { datasetId: task.datasetId },
      relations: ['batches'],
    });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${task.datasetId} not found`);
    }
    if (!dataset.batches?.length) {
      throw new BadRequestException(
        `Dataset ${dataset.datasetId} 尚无批次文件，无法进行聚合`,
      );
    }

    let aggregation = task.aggregation ?? null;
    if (!aggregation && task.aggregationId) {
      aggregation = await this.aggregationRepository.findOne({
        where: { aggregationId: task.aggregationId },
      });
    }
    if (!aggregation) {
      aggregation = await this.ensureAggregationRecord(
        dataset,
        task.targetGranularity,
      );
    }

    const sourcePaths = dataset.batches.map((batch) =>
      resolveDatasetPath(batch.path),
    );

    const outputPath = resolveDatasetPath(aggregation.path);
    await mkdir(dirname(outputPath), { recursive: true });

    const config: AggregationQueryConfig = {
      sourceGranularity: dataset.granularity,
      targetGranularity: task.targetGranularity,
      sourcePaths,
      outputPath,
      timeStart: dataset.timeStart,
      timeEnd: dataset.timeEnd,
    };

    return { config, dataset, aggregation };
  }

  /**
   * 调用 DuckDB 执行聚合 SQL
   */
  private async executeDuckDbAggregation(
    config: AggregationQueryConfig,
  ): Promise<{ rowCount: number; timeStart: Date; timeEnd: Date }> {
    const plan = this.buildAggregationQueryPlan(config);
    const db = new duckdb.Database(':memory:');
    const connection = db.connect();

    try {
      await this.execDuckDb(connection, plan.exportSql);
      return this.getAggregationStats(connection, plan.selectSql, config);
    } finally {
      connection.close();
      db.close();
    }
  }

  /**
   * 获取聚合统计信息
   */
  private getAggregationStats(
    connection: duckdb.Connection,
    selectSql: string,
    config: AggregationQueryConfig,
  ): Promise<{ rowCount: number; timeStart: Date; timeEnd: Date }> {
    const statsSql = `
      SELECT
        COUNT(*) AS row_count,
        MIN(timestamp) AS time_start,
        MAX(timestamp) AS time_end
      FROM (${selectSql})
    `;

    return new Promise((resolve, reject) => {
      connection.all(statsSql, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const row = rows[0];
        resolve({
          rowCount: Number(row.row_count ?? 0),
          timeStart: row.time_start ? new Date(row.time_start) : config.timeStart,
          timeEnd: row.time_end ? new Date(row.time_end) : config.timeEnd,
        });
      });
    });
  }

  /**
   * 调用 DuckDB 执行任意 SQL
   */
  private execDuckDb(
    connection: duckdb.Connection,
    sql: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 计算输出文件校验和
   */
  private computeFileChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5');
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async updateAggregationsForAppend(
    datasetId: number,
    newBatch: DatasetBatchEntity,
  ): Promise<void> {
    const aggregations = await this.aggregationRepository.find({
      where: {
        datasetId,
        status: AggregationStatus.Completed,
      },
    });

    if (!aggregations.length) {
      this.logger.debug(
        `Dataset ${datasetId} 没有已完成的聚合，跳过增量更新`,
      );
      return;
    }

    for (const aggregation of aggregations) {
      try {
        await this.appendAggregation(aggregation, newBatch);
      } catch (error) {
        this.logger.error(
          `增量更新聚合 #${aggregation.aggregationId} 失败: ${error instanceof Error ? error.message : error}`,
        );
        await this.aggregationRepository.update(aggregation.aggregationId, {
          status: AggregationStatus.Failed,
          errorLog: error instanceof Error ? error.stack : String(error),
        });
      }
    }
  }

  private async appendAggregation(
    aggregation: DatasetAggregationEntity,
    newBatch: DatasetBatchEntity,
  ): Promise<void> {
    const appendRelativePath = `${aggregation.path}.append-${newBatch.datasetBatchId}-${Date.now()}.parquet`;
    await this.aggregateBatchToTempFile(aggregation, newBatch, appendRelativePath);
    await this.mergeParquetFiles(aggregation.path, appendRelativePath);

    const stats = await this.readParquetStats(aggregation.path);
    await this.aggregationRepository.update(aggregation.aggregationId, {
      timeStart: stats.timeStart,
      timeEnd: stats.timeEnd,
      rowCount: stats.rowCount,
      checksum: await this.computeFileChecksum(
        resolveDatasetPath(aggregation.path),
      ),
      status: AggregationStatus.Completed,
      progress: 100,
    });
  }

  private async aggregateBatchToTempFile(
    aggregation: DatasetAggregationEntity,
    batch: DatasetBatchEntity,
    tempRelativePath: string,
  ): Promise<void> {
    const config: AggregationQueryConfig = {
      sourceGranularity: aggregation.sourceGranularity,
      targetGranularity: aggregation.targetGranularity,
      sourcePaths: [resolveDatasetPath(batch.path)],
      outputPath: resolveDatasetPath(tempRelativePath),
      timeStart: batch.timeStart,
      timeEnd: batch.timeEnd,
    };
    await mkdir(dirname(config.outputPath), { recursive: true });
    await this.executeDuckDbAggregation(config);
  }

  private async mergeParquetFiles(
    targetRelativePath: string,
    appendRelativePath: string,
  ): Promise<void> {
    const targetPath = resolveDatasetPath(targetRelativePath);
    const appendPath = resolveDatasetPath(appendRelativePath);
    const mergedTemp = `${targetPath}.merged-${Date.now()}.parquet`;
    const db = new duckdb.Database(':memory:');
    const connection = db.connect();
    try {
      const mergeSql = `
        COPY (
          SELECT * FROM read_parquet('${this.escapeSqlLiteral(targetPath)}')
          UNION ALL
          SELECT * FROM read_parquet('${this.escapeSqlLiteral(appendPath)}')
          ORDER BY timestamp
        )
        TO '${this.escapeSqlLiteral(mergedTemp)}'
        (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
      `;
      await this.execDuckDb(connection, mergeSql);
    } finally {
      connection.close();
      db.close();
    }

    await this.replaceFile(mergedTemp, targetPath);
    await unlink(appendPath).catch(() => undefined);
  }

  private async readParquetStats(
    relativePath: string,
  ): Promise<{ rowCount: number; timeStart: Date; timeEnd: Date }> {
    const absolute = resolveDatasetPath(relativePath);
    const db = new duckdb.Database(':memory:');
    const connection = db.connect();
    try {
      const sql = `
        SELECT
          COUNT(*) AS row_count,
          MIN(timestamp) AS time_start,
          MAX(timestamp) AS time_end
        FROM read_parquet('${this.escapeSqlLiteral(absolute)}')
      `;
      return await new Promise((resolve, reject) => {
        connection.all(sql, (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          const row = rows[0];
          resolve({
            rowCount: Number(row?.row_count ?? 0),
            timeStart: row?.time_start ? new Date(row.time_start) : new Date(0),
            timeEnd: row?.time_end ? new Date(row.time_end) : new Date(0),
          });
        });
      });
    } finally {
      connection.close();
      db.close();
    }
  }

  private async replaceFile(source: string, target: string): Promise<void> {
    try {
      await rename(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        await copyFile(source, target);
        await unlink(source);
      } else {
        throw error;
      }
    }
  }

  async listAggregations(
    datasetId: number,
    status: AggregationStatus | 'all' = 'all',
  ): Promise<DatasetAggregationEntity[]> {
    await this.ensureDatasetExists(datasetId);
    const where: FindOptionsWhere<DatasetAggregationEntity> = {
      datasetId,
    };
    if (status !== 'all') {
      where.status = status;
    }

    return this.aggregationRepository.find({
      where,
      order: { targetGranularity: 'ASC' },
    });
  }

  async listAggregationTasks(
    datasetId: number,
    status: AggregationTaskStatus | 'all' = 'all',
  ): Promise<AggregationTaskEntity[]> {
    await this.ensureDatasetExists(datasetId);
    const where: FindOptionsWhere<AggregationTaskEntity> = {
      datasetId,
    };

    if (status !== 'all') {
      where.status = status;
    }

    return this.taskRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  private async ensureDatasetExists(datasetId: number): Promise<void> {
    const exists = await this.datasetRepository.exist({ where: { datasetId } });
    if (!exists) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }
  }

  /**
   * 构建预聚合文件的相对存储路径
   */
  protected buildAggregationPath(
    dataset: DatasetEntity,
    targetGranularity: string,
  ): string {
    const template = dataset.pathTemplate;
    const basePath =
      template && template.includes('{granularity}')
        ? template.replace('{granularity}', targetGranularity)
        : `${dataset.source || 'unknown'}/${dataset.tradingPair.replace(/[\\/]/g, '_')}/${targetGranularity}`;
    return `${basePath}/agg_${targetGranularity}_from_${dataset.granularity}.parquet`;
  }

  /**
   * SQL 字符串转义
   */
  protected escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }

  private async ensureDatasetGranularity(
    datasetId: number,
    granularity: string,
  ): Promise<void> {
    const dataset = await this.datasetRepository.findOne({
      where: { datasetId },
    });
    if (!dataset) {
      return;
    }
    const set = new Set(dataset.availableGranularities ?? []);
    set.add(dataset.granularity);
    if (set.has(granularity)) {
      return;
    }
    set.add(granularity);
    await this.datasetRepository.update(datasetId, {
      availableGranularities: Array.from(set),
    });
  }

  /**
   * 任务调度入口，后续任务会实现实际的执行逻辑
   */
  protected async dispatchTaskExecution(
    task: AggregationTaskEntity,
  ): Promise<void> {
    setImmediate(() => {
      this.executeTask(task.taskId).catch((error) => {
        this.logger.error(
          `聚合任务 #${task.taskId} 异步执行失败: ${error?.message ?? error}`,
          error?.stack,
        );
      });
    });
  }

  private async executeTask(taskId: number): Promise<void> {
    const logger = new Logger(`AggregationTask-${taskId}`);
    const task = await this.taskRepository.findOne({
      where: { taskId },
      relations: ['aggregation'],
    });
    if (!task) {
      logger.warn(`任务 ${taskId} 不存在，忽略执行`);
      return;
    }

    try {
      await this.taskRepository.update(taskId, {
        status: AggregationTaskStatus.Running,
        startedAt: new Date(),
        progress: 5,
        message: '聚合任务执行中',
      });

      if (task.aggregationId) {
        await this.aggregationRepository.update(task.aggregationId, {
          status: AggregationStatus.Processing,
          progress: 10,
        });
      }

      const summary = await this.runAggregationTask(task);

      const aggregationId = summary.aggregationId;

      await this.aggregationRepository.update(aggregationId, {
        rowCount: summary.rowCount,
        checksum: summary.checksum,
        status: AggregationStatus.Completed,
        timeStart: summary.timeStart,
        timeEnd: summary.timeEnd,
        progress: 100,
      });

      await this.taskRepository.update(taskId, {
        aggregationId,
        status: AggregationTaskStatus.Completed,
        progress: 100,
        finishedAt: new Date(),
        message: `完成 ${summary.rowCount} 条记录聚合`,
      });

      await this.ensureDatasetGranularity(task.datasetId, task.targetGranularity);

      logger.log(`聚合任务 ${taskId} 完成`);
    } catch (error: any) {
      logger.error(`聚合任务 ${taskId} 失败: ${error?.message ?? error}`);

      const retried = await this.handleTaskFailure(task, error);
      if (retried) {
        logger.warn(`聚合任务 ${taskId} 将自动重试`);
      }
    }
  }

  private async handleTaskFailure(
    task: AggregationTaskEntity,
    error: any,
  ): Promise<boolean> {
    await this.taskRepository.update(task.taskId, {
      status: AggregationTaskStatus.Failed,
      progress: 0,
      finishedAt: new Date(),
      message: error?.message ?? '聚合失败',
      errorLog: error?.stack ?? String(error),
    });

    if (task.aggregationId) {
      await this.aggregationRepository.update(task.aggregationId, {
        status: AggregationStatus.Failed,
        errorLog: error?.stack ?? String(error),
        progress: 0,
      });
    }

    const retried = await this.scheduleAutoRetry(task);

    if (retried && task.aggregationId) {
      await this.aggregationRepository.update(task.aggregationId, {
        status: AggregationStatus.Pending,
        errorLog: null,
        progress: 0,
      });
    }

    return retried;
  }

  private async scheduleAutoRetry(
    task: AggregationTaskEntity,
  ): Promise<boolean> {
    if (task.triggerType === TriggerType.Manual || !this.canRetry(task)) {
      return false;
    }

    const attempts = await this.taskRepository.count({
      where: {
        datasetId: task.datasetId,
        targetGranularity: task.targetGranularity,
        triggerType: In([TriggerType.Auto, TriggerType.Retry]),
      },
    });

    if (attempts >= this.MAX_RETRY_ATTEMPTS) {
      return false;
    }

    const retryTask = this.taskRepository.create({
      aggregationId: task.aggregationId,
      datasetId: task.datasetId,
      targetGranularity: task.targetGranularity,
      triggerType: TriggerType.Retry,
      triggeredBy: task.triggeredBy ?? 'system',
      status: AggregationTaskStatus.Pending,
      progress: 0,
      message: `自动重试（第 ${attempts + 1} 次）`,
    });

    const saved = await this.taskRepository.save(retryTask);
    this.dispatchTaskExecution(saved);
    return true;
  }

  private canRetry(task: AggregationTaskEntity): boolean {
    return (
      task.status !== AggregationTaskStatus.Cancelled &&
      task.status !== AggregationTaskStatus.Completed
    );
  }
}
