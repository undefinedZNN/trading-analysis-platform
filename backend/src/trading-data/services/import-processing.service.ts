import { Injectable, Logger } from '@nestjs/common';
import { dirname, posix as posixPath } from 'path';
import { mkdir, copyFile } from 'fs/promises';
import { ImportTaskEntity, ImportStatus } from '../entities/import-task.entity';
import type { ImportMetadataPayload } from '../dto/import.dto';
import { pluginRegistry } from '../plugins/plugin-registry';
import { CsvOhlcvPlugin } from '../plugins/csv-ohlcv.plugin';
import {
  resolveImportUploadPath,
  resolveDatasetPath,
} from '../../config/storage.config';
import { DatasetEntity } from '../entities/dataset.entity';
import { Repository, DeepPartial } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ImportProcessingService {
  private readonly logger = new Logger(ImportProcessingService.name);

  constructor(
    @InjectRepository(ImportTaskEntity)
    private readonly importRepository: Repository<ImportTaskEntity>,
    @InjectRepository(DatasetEntity)
    private readonly datasetRepository: Repository<DatasetEntity>,
  ) {
    pluginRegistry.register(new CsvOhlcvPlugin());
  }

  async scheduleProcessing(
    importTask: ImportTaskEntity,
    metadata?: ImportMetadataPayload | null,
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
    const labels = Array.isArray(effectiveMetadata?.labels)
      ? (effectiveMetadata.labels as string[])
      : [];

    try {
      const summary = await plugin.process(filePath, { task: importTask });

      const datasetRelativePath = this.buildDatasetPath(
        effectiveMetadata,
        importTask,
        summary,
      );
      const datasetAbsolutePath = resolveDatasetPath(datasetRelativePath);
      await mkdir(dirname(datasetAbsolutePath), { recursive: true });
      await copyFile(filePath, datasetAbsolutePath);

      const datasetPayload: DeepPartial<DatasetEntity> = {
        source: effectiveMetadata?.source ?? null,
        tradingPair:
          effectiveMetadata?.tradingPair ?? effectiveMetadata?.symbol ?? 'unknown',
        granularity: effectiveMetadata?.granularity ?? 'unknown',
        path: datasetRelativePath,
        timeStart: summary.timeStart,
        timeEnd: summary.timeEnd,
        rowCount: summary.rowCount,
        checksum: summary.checksum,
        labels,
        description: effectiveMetadata?.description ?? null,
        createdBy: importTask.createdBy,
        updatedBy: importTask.createdBy,
      };
      const dataset = this.datasetRepository.create(datasetPayload);
      const savedDataset = await this.datasetRepository.save(dataset);

      await this.importRepository.update(importTask.importId, {
        status: ImportStatus.Completed,
        progress: 100,
        stage: 'completed',
        datasetId: savedDataset.datasetId,
        finishedAt: new Date(),
        metadata: effectiveMetadata ?? null,
      });

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

  private buildDatasetPath(
    metadata: ImportMetadataPayload | undefined,
    importTask: ImportTaskEntity,
    summary: { timeStart: Date; timeEnd: Date },
  ): string {
    const source = (metadata?.source ?? 'unknown').replace(/\s+/g, '-');
    const tradingPair = (metadata?.tradingPair ?? 'unknown')
      .replace('/', '_')
      .replace(/\s+/g, '-');
    const granularity = (metadata?.granularity ?? 'unknown').replace(
      /\s+/g,
      '-',
    );
    const batch = `batch_${importTask.importId}_${summary.timeStart
      .toISOString()
      .replace(/[:.]/g, '-')}_${summary.timeEnd
      .toISOString()
      .replace(/[:.]/g, '-')}`;
    return posixPath.join(source, tradingPair, granularity, `${batch}.csv`);
  }
}
