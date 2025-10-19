import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { dirname, posix as posixPath } from 'path';
import { createReadStream } from 'fs';
import { mkdir, rename, copyFile, unlink } from 'fs/promises';
import { ImportTaskEntity, ImportStatus } from '../entities/import-task.entity';
import type { ImportMetadataPayload } from '../dto/import.dto';
import { pluginRegistry } from '../plugins/plugin-registry';
import { CsvOhlcvPlugin } from '../plugins/csv-ohlcv.plugin';
import {
  resolveImportUploadPath,
  resolveDatasetPath,
} from '../../config/storage.config';
import { DatasetEntity } from '../entities/dataset.entity';
import { DatasetBatchEntity } from '../entities/dataset-batch.entity';
import { Repository, DeepPartial } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as duckdb from 'duckdb';

type ProcessSummary = {
  timeStart: Date;
  timeEnd: Date;
  rowCount: number;
  checksum: string;
  outputPath: string;
};

@Injectable()
export class ImportProcessingService {
  private readonly logger = new Logger(ImportProcessingService.name);

  constructor(
    @InjectRepository(ImportTaskEntity)
    private readonly importRepository: Repository<ImportTaskEntity>,
    @InjectRepository(DatasetEntity)
    private readonly datasetRepository: Repository<DatasetEntity>,
    @InjectRepository(DatasetBatchEntity)
    private readonly datasetBatchRepository: Repository<DatasetBatchEntity>,
  ) {
    pluginRegistry.register(new CsvOhlcvPlugin());
  }

  async scheduleProcessing(
    importTask: ImportTaskEntity,
    metadata?: ImportMetadataPayload | null,
    options?: { targetDataset?: DatasetEntity | null },
  ): Promise<void> {
    this.logger.log(`开始处理导入任务 #${importTask.importId}`);

    const format = importTask.sourceFile.split('.').pop()?.toLowerCase() ?? '';
    const plugin = pluginRegistry.findByFormat(format);
    if (!plugin) {
      throw new Error(`未找到格式 ${format} 对应的导入插件`);
    }

    await this.importRepository.update(importTask.importId, {
      status: ImportStatus.Processing,
      stage: 'processing',
    });

    const filePath = resolveImportUploadPath(importTask.storedFilePath);

    const effectiveMetadata: ImportMetadataPayload | undefined = metadata
      ? { ...metadata }
      : (importTask.metadata as ImportMetadataPayload | undefined);
    const targetDataset = options?.targetDataset
      ? await this.datasetRepository.findOne({
          where: { datasetId: options.targetDataset.datasetId },
        })
      : null;
    if (options?.targetDataset && !targetDataset) {
      throw new Error(
        `目标数据集 ${options.targetDataset.datasetId} 不存在，无法执行追加`,
      );
    }

    try {
      const summary = (await plugin.process(filePath, {
        task: importTask,
      })) as ProcessSummary;

      if (targetDataset) {
        const { summary: trimmedSummary, direction } = await this.trimAppendData(
          summary,
          targetDataset,
        );
        await this.handleAppendImport(
          importTask,
          trimmedSummary,
          effectiveMetadata,
          targetDataset,
          direction,
        );
      } else {
        await this.handleInitialImport(importTask, summary, effectiveMetadata);
      }

      this.logger.log(`导入任务 #${importTask.importId} 处理完成`);
    } catch (error) {
      this.logger.error(
        `导入任务 #${importTask.importId} 处理失败: ${error?.message ?? error}`,
      );
      await this.importRepository.update(importTask.importId, {
        status: ImportStatus.Failed,
        stage: 'failed',
        message:
          error instanceof Error ? error.message : '导入失败，未知错误',
        errorLog: error instanceof Error ? error.stack : String(error),
        finishedAt: new Date(),
      });
    }
  }

  private async handleInitialImport(
    importTask: ImportTaskEntity,
    summary: ProcessSummary,
    metadata?: ImportMetadataPayload,
  ): Promise<void> {
    const labels = Array.isArray(metadata?.labels)
      ? Array.from(new Set(metadata.labels))
      : [];

    const datasetRoot = this.buildDatasetRootFromMetadata(metadata);
    const batchRelativePath = this.buildBatchPath(datasetRoot, importTask, summary);

    await this.ensureDirectories(batchRelativePath);
    await this.moveOutputFile(summary.outputPath, resolveDatasetPath(batchRelativePath));

    const datasetPayload: DeepPartial<DatasetEntity> = {
      source: metadata?.source ?? null,
      tradingPair:
        metadata?.tradingPair ?? metadata?.symbol ?? 'unknown',
      granularity: metadata?.granularity ?? 'unknown',
      path: datasetRoot,
      timeStart: summary.timeStart,
      timeEnd: summary.timeEnd,
      rowCount: summary.rowCount,
      checksum: summary.checksum,
      labels,
      description: metadata?.description ?? null,
      createdBy: importTask.createdBy,
      updatedBy: importTask.createdBy,
    };

    const dataset = await this.datasetRepository.save(
      this.datasetRepository.create(datasetPayload),
    );

    await this.recordDatasetBatch(dataset.datasetId, importTask.importId, batchRelativePath, summary);

    await this.importRepository.update(importTask.importId, {
      status: ImportStatus.Completed,
      progress: 100,
      stage: 'completed',
      datasetId: dataset.datasetId,
      finishedAt: new Date(),
      metadata: metadata ?? null,
    });
  }

  private async handleAppendImport(
    importTask: ImportTaskEntity,
    summary: ProcessSummary,
    metadata: ImportMetadataPayload | undefined,
    dataset: DatasetEntity,
    direction: 'left' | 'right',
  ): Promise<void> {
    const datasetRoot = this.resolveDatasetRoot(dataset, metadata);
    const batchRelativePath = this.buildBatchPath(datasetRoot, importTask, summary);

    await this.ensureDirectories(batchRelativePath);
    await this.moveOutputFile(summary.outputPath, resolveDatasetPath(batchRelativePath));

    const updatedDataset: DeepPartial<DatasetEntity> = {
      datasetId: dataset.datasetId,
      path: datasetRoot,
      timeStart:
        direction === 'left'
          ? summary.timeStart
          : dataset.timeStart,
      timeEnd:
        direction === 'right'
          ? summary.timeEnd
          : dataset.timeEnd,
      rowCount: (dataset.rowCount ?? 0) + summary.rowCount,
      checksum: this.mergeChecksum(dataset.checksum, summary.checksum, direction),
      updatedBy: importTask.createdBy ?? dataset.updatedBy ?? null,
    };

    await this.datasetRepository.save(updatedDataset);

    await this.recordDatasetBatch(dataset.datasetId, importTask.importId, batchRelativePath, summary);

    await this.importRepository.update(importTask.importId, {
      status: ImportStatus.Completed,
      progress: 100,
      stage: 'completed',
      datasetId: dataset.datasetId,
      finishedAt: new Date(),
      metadata: metadata ?? null,
    });
  }

  private buildDatasetRootFromMetadata(
    metadata: ImportMetadataPayload | undefined,
  ): string {
    const source = this.normalizePathSegment(metadata?.source ?? 'unknown');
    const tradingPair = this.normalizePathSegment(
      (metadata?.tradingPair ?? metadata?.symbol ?? 'unknown').replace('/', '_'),
    );
    const granularity = this.normalizePathSegment(
      metadata?.granularity ?? 'unknown',
    );
    return posixPath.join(source, tradingPair, granularity);
  }

  private buildBatchPath(
    datasetRoot: string,
    importTask: ImportTaskEntity,
    summary: ProcessSummary,
  ): string {
    const dt = this.formatUtcDate(summary.timeStart);
    const hour = this.formatUtcHour(summary.timeStart);
    const batch = `batch_${importTask.importId}.parquet`;
    return posixPath.join(datasetRoot, `dt=${dt}`, `hour=${hour}`, batch);
  }

  private resolveDatasetRoot(
    dataset: DatasetEntity,
    metadata?: ImportMetadataPayload,
  ): string {
    if (dataset.path) {
      if (dataset.path.endsWith('.parquet')) {
        return this.extractDatasetRootFromPath(dataset.path);
      }
      return dataset.path;
    }
    return this.buildDatasetRootFromMetadata(metadata);
  }

  private extractDatasetRootFromPath(path: string): string {
    const segments = path.split('/').filter((segment) => segment.length > 0);
    if (segments.length >= 3) {
      return posixPath.join(segments[0], segments[1], segments[2]);
    }
    return posixPath.dirname(path);
  }

  private async trimAppendData(
    summary: ProcessSummary,
    dataset: DatasetEntity,
  ): Promise<{ summary: ProcessSummary; direction: 'left' | 'right' }> {
    const datasetStart = dataset.timeStart.getTime();
    const datasetEnd = dataset.timeEnd.getTime();
    const newStart = summary.timeStart.getTime();
    const newEnd = summary.timeEnd.getTime();

    const leftSpan = newStart < datasetStart ? datasetStart - newStart : 0;
    const rightSpan = newEnd > datasetEnd ? newEnd - datasetEnd : 0;

    if (leftSpan === 0 && rightSpan === 0) {
      throw new Error('追加数据不包含可追加的时间段，请上传更早或更晚的数据');
    }

    const direction: 'left' | 'right' =
      leftSpan >= rightSpan ? 'left' : 'right';

    const cutoff =
      direction === 'left'
        ? dataset.timeStart.toISOString()
        : dataset.timeEnd.toISOString();
    const comparator = direction === 'left' ? '<' : '>';

    const db = new duckdb.Database(':memory:');
    const connection = db.connect();
    const escapedSource = summary.outputPath.replace(/\\/g, '/');
    const tempTable = 'filtered_data';
    const filteredPath = `${summary.outputPath}.filtered.parquet`;
    const escapedFiltered = filteredPath.replace(/\\/g, '/');

    try {
      await this.execDuckDb(connection,
        `CREATE TEMP TABLE ${tempTable} AS SELECT * FROM read_parquet('${escapedSource}') WHERE timestamp ${comparator} TIMESTAMP '${cutoff}' ORDER BY timestamp;`,
      );
      const stats = await new Promise<any>((resolve, reject) => {
        connection.all(
          `SELECT COUNT(*) AS row_count, MIN(timestamp) AS time_start, MAX(timestamp) AS time_end FROM ${tempTable}`,
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows?.[0]);
            }
          },
        );
      });

      const rowCount = Number(stats?.row_count ?? 0);
      if (!rowCount) {
        throw new Error('追加数据不包含可追加的时间段，请上传更早或更晚的数据');
      }

      await this.execDuckDb(connection, `COPY ${tempTable} TO '${escapedFiltered}' (FORMAT PARQUET);`);

      const timeStart = new Date(stats.time_start);
      const timeEnd = new Date(stats.time_end);
      const checksum = await this.computeFileChecksum(filteredPath);

      await unlink(summary.outputPath).catch(() => undefined);

      return {
        summary: {
          timeStart,
          timeEnd,
          rowCount,
          checksum,
          outputPath: filteredPath,
        },
        direction,
      };
    } finally {
      connection.close();
      db.close();
    }
  }

  private async ensureDirectories(relativeFilePath: string): Promise<void> {
    const absoluteDir = dirname(resolveDatasetPath(relativeFilePath));
    await mkdir(absoluteDir, { recursive: true });
  }

  private async recordDatasetBatch(
    datasetId: number,
    importId: number,
    path: string,
    summary: ProcessSummary,
  ): Promise<void> {
    const batchPayload: DeepPartial<DatasetBatchEntity> = {
      datasetId,
      importId,
      path,
      timeStart: summary.timeStart,
      timeEnd: summary.timeEnd,
      rowCount: summary.rowCount,
      checksum: summary.checksum,
    };
    await this.datasetBatchRepository.save(
      this.datasetBatchRepository.create(batchPayload),
    );
  }

  private normalizePathSegment(value: string): string {
    return value.trim().replace(/\s+/g, '-');
  }

  private formatUtcDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatUtcHour(date: Date): string {
    return String(date.getUTCHours()).padStart(2, '0');
  }

  private mergeChecksum(
    previous: string,
    incoming: string,
    direction: 'left' | 'right',
  ): string {
    if (!previous) {
      return incoming;
    }
    if (!incoming) {
      return previous;
    }
    const hash = createHash('md5');
    if (direction === 'left') {
      hash.update(incoming).update(previous);
    } else {
      hash.update(previous).update(incoming);
    }
    return hash.digest('hex');
  }

  private async computeFileChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5');
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private execDuckDb(connection: duckdb.Connection, sql: string): Promise<void> {
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

  private async moveOutputFile(
    sourcePath: string,
    targetPath: string,
  ): Promise<void> {
    try {
      await rename(sourcePath, targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        await copyFile(sourcePath, targetPath);
        await unlink(sourcePath);
      } else {
        throw error;
      }
    }
  }
}
