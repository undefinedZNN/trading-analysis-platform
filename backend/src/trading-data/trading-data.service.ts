import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { join, posix as posixPath } from 'path';
import type { Express } from 'express';
import { DatasetEntity } from './entities/dataset.entity';
import {
  ImportStatus,
  ImportTaskEntity,
} from './entities/import-task.entity';
import {
  CreateImportTaskPayload,
  UpdateImportStatusPayload,
  ListImportsQuery,
} from './dto/import.dto';
import type {
  CreateImportTaskDto,
  RetryImportDto,
  ImportMetadataPayload,
} from './dto/import.dto';
import {
  ListDatasetsQuery,
  UpdateDatasetMetadataPayload,
} from './dto/dataset.dto';
import { resolveImportUploadPath } from '../config/storage.config';
import { ImportProcessingService } from './services/import-processing.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_LABEL_COUNT = 20;

@Injectable()
export class TradingDataService {
  constructor(
    @InjectRepository(DatasetEntity)
    private readonly datasetsRepository: Repository<DatasetEntity>,
    @InjectRepository(ImportTaskEntity)
    private readonly importsRepository: Repository<ImportTaskEntity>,
    private readonly importProcessingService: ImportProcessingService,
  ) {}

  async listDatasets(
    query: ListDatasetsQuery,
  ): Promise<{ items: DatasetEntity[]; total: number }> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, 100);
    const qb = this.datasetsRepository
      .createQueryBuilder('dataset')
      .withDeleted();

    if (query.status !== 'all') {
      if (query.status === 'deleted') {
        qb.where('dataset.deletedAt IS NOT NULL');
      } else {
        qb.where('dataset.deletedAt IS NULL');
      }
    }

    if (query.source) {
      qb.andWhere('dataset.source = :source', { source: query.source });
    }

    if (query.tradingPair) {
      qb.andWhere('dataset.tradingPair ILIKE :pair', {
        pair: `%${query.tradingPair}%`,
      });
    }

    if (query.granularity) {
      qb.andWhere('dataset.granularity = :granularity', {
        granularity: query.granularity,
      });
    }

    if (query.dataStart) {
      qb.andWhere('dataset.timeEnd >= :dataStart', {
        dataStart: query.dataStart,
      });
    }

    if (query.dataEnd) {
      qb.andWhere('dataset.timeStart <= :dataEnd', {
        dataEnd: query.dataEnd,
      });
    }

    if (query.createdStart) {
      qb.andWhere('dataset.createdAt >= :createdStart', {
        createdStart: query.createdStart,
      });
    }

    if (query.createdEnd) {
      qb.andWhere('dataset.createdAt <= :createdEnd', {
        createdEnd: query.createdEnd,
      });
    }

    if (query.tags?.length) {
      qb.andWhere('dataset.labels @> :tags', {
        tags: JSON.stringify(query.tags),
      });
    }

    if (query.keyword) {
      qb.andWhere(
        '(dataset.tradingPair ILIKE :keyword OR dataset.description ILIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    qb.leftJoinAndSelect('dataset.importTasks', 'importTask');
    if (query.importStatus) {
      qb.andWhere('importTask.status = :importStatus', {
        importStatus: query.importStatus,
      });
    }

    qb.distinct(true)
      .orderBy('dataset.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getDatasetById(datasetId: number): Promise<DatasetEntity> {
    const dataset = await this.datasetsRepository.findOne({
      where: { datasetId },
      relations: ['importTasks'],
      withDeleted: true,
    });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }
    return dataset;
  }

  async updateDatasetMetadata(
    datasetId: number,
    payload: UpdateDatasetMetadataPayload,
  ): Promise<DatasetEntity> {
    const dataset = await this.datasetsRepository.findOne({
      where: { datasetId },
    });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    if (payload.description !== undefined) {
      dataset.description = payload.description;
    }

    if (payload.labels) {
      dataset.labels = this.sanitizeLabels(payload.labels);
    }

    if (payload.updatedBy !== undefined) {
      dataset.updatedBy = payload.updatedBy;
    }

    return this.datasetsRepository.save(dataset);
  }

  async softDeleteDataset(
    datasetId: number,
    operator?: string | null,
  ): Promise<void> {
    const dataset = await this.datasetsRepository.findOne({
      where: { datasetId },
    });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }
    if (dataset.deletedAt) {
      throw new BadRequestException('数据集已被软删除');
    }

    dataset.updatedBy = operator ?? null;
    await this.datasetsRepository.save(dataset);
    await this.datasetsRepository.softDelete({ datasetId });
  }

  async restoreDataset(
    datasetId: number,
    operator?: string | null,
  ): Promise<DatasetEntity> {
    const dataset = await this.datasetsRepository.findOne({
      where: { datasetId },
      withDeleted: true,
    });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }
    if (!dataset.deletedAt) {
      throw new BadRequestException('数据集未处于软删除状态');
    }

    await this.datasetsRepository.restore({ datasetId });

    dataset.deletedAt = null;
    dataset.updatedBy = operator ?? null;
    return this.datasetsRepository.save(dataset);
  }

  async createImportTask(
    payload: CreateImportTaskPayload,
  ): Promise<ImportTaskEntity> {
    const normalizedMetadata = this.normalizeMetadata(payload.metadata);
    payload.metadata = normalizedMetadata;

    const status = payload.status ?? ImportStatus.Pending;

    const importTask = this.importsRepository.create({
      sourceFile: payload.sourceFile,
      storedFilePath: payload.storedFilePath,
      metadata: payload.metadata ? { ...payload.metadata } : null,
      pluginName: payload.pluginName,
      pluginVersion: payload.pluginVersion,
      status,
      stage: this.resolveStageFromStatus(status),
      createdBy: payload.createdBy ?? null,
      // dataset metadata will be persisted post-processing
    });

    return this.importsRepository.save(importTask);
  }

  async listImports(
    query: ListImportsQuery,
  ): Promise<{ items: ImportTaskEntity[]; total: number }> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, 100);

    const qb = this.importsRepository
      .createQueryBuilder('import')
      .leftJoinAndSelect('import.dataset', 'dataset')
      .orderBy('import.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.status) {
      qb.andWhere('import.status = :status', { status: query.status });
    }

    if (query.source) {
      qb.andWhere(`(import.metadata ->> 'source') = :source`, {
        source: query.source,
      });
    }

    if (query.tradingPair) {
      qb.andWhere(`(import.metadata ->> 'tradingPair') ILIKE :tradingPair`, {
        tradingPair: `%${query.tradingPair}%`,
      });
    }

    if (query.keyword) {
      qb.andWhere(
        `((import.metadata ->> 'tradingPair') ILIKE :keyword OR import.message ILIKE :keyword)`,
        {
          keyword: `%${query.keyword}%`,
        },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async retryImport(
    importId: number,
    payload: RetryImportDto,
    file?: Express.Multer.File,
  ): Promise<ImportTaskEntity> {
    const importTask = await this.importsRepository.findOne({
      where: { importId },
    });
    if (!importTask) {
      throw new NotFoundException(`Import ${importId} not found`);
    }

    if (importTask.status !== ImportStatus.Failed) {
      throw new BadRequestException('仅允许重试失败的导入任务');
    }

    const reuseOriginal = payload.reuseOriginalFile ?? true;

    const existingMetadata =
      this.normalizeMetadata(importTask.metadata as ImportMetadataPayload | undefined) ?? {};
    const overrideMetadata = this.normalizeMetadata(payload.metadata);
    const metadata: ImportMetadataPayload = {
      ...existingMetadata,
      ...(overrideMetadata ?? {}),
    } as ImportMetadataPayload;
    if (!metadata.tradingPair) {
      metadata.tradingPair = 'unknown';
    }
    if (!metadata.granularity) {
      metadata.granularity = 'unknown';
    }

    let storedFilePath = importTask.storedFilePath;
    let sourceFile = importTask.sourceFile;

    if (file) {
      const safeFileName = this.normalizeFileName(
        file.originalname || importTask.sourceFile,
      );
      const finalDir = resolveImportUploadPath(String(importTask.importId));
      await mkdir(finalDir, { recursive: true });
      await writeFile(join(finalDir, safeFileName), file.buffer);
      storedFilePath = posixPath.join(String(importTask.importId), safeFileName);
      sourceFile = safeFileName;
    } else if (!reuseOriginal) {
      throw new BadRequestException('未选择复用原始文件，请上传新的文件');
    }

    await this.importsRepository.update(importId, {
      status: ImportStatus.Uploading,
      stage: 'uploading',
      progress: 0,
      message: null,
      errorLog: null,
      finishedAt: null,
      datasetId: null,
      sourceFile,
      storedFilePath,
      metadata: Object.keys(metadata).length ? metadata : null,
    });

    const refreshed = await this.importsRepository.findOneOrFail({
      where: { importId },
    });

    await this.importProcessingService.scheduleProcessing(refreshed, metadata);

    return refreshed;
  }

  async createImportWithUpload(
    payload: CreateImportTaskDto,
    file: Express.Multer.File,
  ): Promise<ImportTaskEntity> {
    if (!file) {
      throw new BadRequestException('请上传数据文件');
    }

    const safeFileName = this.normalizeFileName(file.originalname || 'dataset');
    const tempKey = `tmp-${Date.now()}-${randomUUID()}`;
    const tempDir = resolveImportUploadPath(tempKey);
    await mkdir(tempDir, { recursive: true });

    const tempFilePath = join(tempDir, safeFileName);
    await writeFile(tempFilePath, file.buffer);

    const initialStoredPath = posixPath.join(tempKey, safeFileName);

    const normalizedMetadata = this.normalizeMetadata(payload.metadata);
    payload.metadata = normalizedMetadata;

    const metadataPayload: ImportMetadataPayload | undefined = normalizedMetadata
      ? { ...normalizedMetadata }
      : undefined;

    let importTask = await this.createImportTask({
      sourceFile: safeFileName,
      storedFilePath: initialStoredPath,
      pluginName: payload.pluginName,
      pluginVersion: payload.pluginVersion,
      status: payload.status ?? ImportStatus.Uploading,
      createdBy: payload.createdBy ?? null,
      metadata: metadataPayload,
    });

    const finalDir = resolveImportUploadPath(String(importTask.importId));
    await mkdir(finalDir, { recursive: true });
    const finalRelative = posixPath.join(
      String(importTask.importId),
      safeFileName,
    );
    await rename(tempFilePath, join(finalDir, safeFileName));
    await rm(tempDir, { recursive: true, force: true });

    importTask.storedFilePath = finalRelative;
    const savedTask = await this.importsRepository.save(importTask);

    await this.importProcessingService.scheduleProcessing(
      savedTask,
      metadataPayload ?? null,
    );

    return this.importsRepository.findOneOrFail({
      where: { importId: savedTask.importId },
    });
  }

  async updateImportStatus(
    payload: UpdateImportStatusPayload,
  ): Promise<ImportTaskEntity> {
    const importTask = await this.importsRepository.findOne({
      where: { importId: payload.importId },
    });
    if (!importTask) {
      throw new NotFoundException(`Import ${payload.importId} not found`);
    }

    if (!this.canTransition(importTask.status, payload.status)) {
      throw new BadRequestException(
        `状态从 ${importTask.status} 不允许切换到 ${payload.status}`,
      );
    }

    importTask.status = payload.status;
    if (payload.progress !== undefined) {
      importTask.progress = Math.min(Math.max(payload.progress, 0), 100);
    }
    if (payload.stage !== undefined) {
      importTask.stage = payload.stage;
    } else {
      importTask.stage = this.resolveStageFromStatus(payload.status);
    }
    if (payload.message !== undefined) {
      importTask.message = payload.message;
    }
    if (payload.errorLog !== undefined) {
      importTask.errorLog = payload.errorLog;
    }
    if (payload.updatedBy !== undefined) {
      importTask.updatedBy = payload.updatedBy;
    }
    if (payload.finishedAt !== undefined) {
      importTask.finishedAt = payload.finishedAt ?? null;
    }
    if (payload.datasetId !== undefined) {
      if (
        payload.datasetId !== null &&
        payload.status !== ImportStatus.Completed
      ) {
        throw new BadRequestException(
          '仅在导入完成时允许关联数据集 ID',
        );
      }
      importTask.datasetId = payload.datasetId;
    }

    if (payload.status === ImportStatus.Completed) {
      importTask.progress = 100;
      if (!payload.finishedAt) {
        importTask.finishedAt = new Date();
      }
    }

    if (payload.status === ImportStatus.Failed && !payload.finishedAt) {
      importTask.finishedAt = new Date();
    }

    if (
      [ImportStatus.Pending, ImportStatus.Uploading, ImportStatus.Processing].includes(
        payload.status,
      )
    ) {
      importTask.finishedAt = null;
    }

    return this.importsRepository.save(importTask);
  }

  async getImportTask(importId: number): Promise<ImportTaskEntity> {
    const importTask = await this.importsRepository.findOne({
      where: { importId },
      relations: ['dataset'],
    });
    if (!importTask) {
      throw new NotFoundException(`Import ${importId} not found`);
    }
    return importTask;
  }

  private sanitizeLabels(labels: string[]): string[] {
    const sanitized = labels
      .map((label) => (label ?? '').trim())
      .filter((label) => label.length > 0)
      .map((label) => label.slice(0, 25));

    const unique = Array.from(new Set(sanitized));

    if (unique.length > MAX_LABEL_COUNT) {
      throw new BadRequestException(`标签数量不能超过 ${MAX_LABEL_COUNT} 个`);
    }

    return unique;
  }

  private normalizeMetadata(
    metadata?: ImportMetadataPayload | (Partial<ImportMetadataPayload> & { labels?: unknown }) | null,
  ): ImportMetadataPayload | undefined {
    if (!metadata) {
      return undefined;
    }

    const normalized: ImportMetadataPayload = {
      ...(metadata as ImportMetadataPayload),
    };

    if (metadata.labels) {
      const labelsArray = Array.isArray(metadata.labels)
        ? metadata.labels.map((label) => String(label))
        : String(metadata.labels)
            .split(',')
            .map((label) => label.trim())
            .filter((label) => label.length > 0);
      normalized.labels = this.sanitizeLabels(labelsArray);
    }

    if (normalized.source === undefined) {
      normalized.source = null;
    }
    if (normalized.description === undefined) {
      normalized.description = null;
    }

    return normalized;
  }

  private normalizeFileName(fileName: string): string {
    const sanitized = fileName.replace(/[\\/:*?"<>|]/g, '_').trim();
    if (sanitized.length === 0) {
      return `dataset-${Date.now()}`;
    }
    return sanitized;
  }

  private resolveStageFromStatus(status: ImportStatus): string | null {
    switch (status) {
      case ImportStatus.Pending:
        return 'pending';
      case ImportStatus.Uploading:
        return 'uploading';
      case ImportStatus.Processing:
        return 'processing';
      case ImportStatus.Completed:
        return 'completed';
      case ImportStatus.Failed:
        return 'failed';
      default:
        return null;
    }
  }

  private canTransition(
    current: ImportStatus,
    next: ImportStatus,
  ): boolean {
    if (current === next) {
      return true;
    }

    const transitions: Record<ImportStatus, ImportStatus[]> = {
      [ImportStatus.Pending]: [
        ImportStatus.Pending,
        ImportStatus.Uploading,
        ImportStatus.Processing,
        ImportStatus.Completed,
        ImportStatus.Failed,
      ],
      [ImportStatus.Uploading]: [
        ImportStatus.Uploading,
        ImportStatus.Processing,
        ImportStatus.Completed,
        ImportStatus.Failed,
      ],
      [ImportStatus.Processing]: [
        ImportStatus.Processing,
        ImportStatus.Completed,
        ImportStatus.Failed,
      ],
      [ImportStatus.Completed]: [ImportStatus.Completed],
      [ImportStatus.Failed]: [
        ImportStatus.Failed,
        ImportStatus.Pending,
        ImportStatus.Uploading,
        ImportStatus.Processing,
      ],
    };

    return transitions[current]?.includes(next) ?? false;
  }
}
