import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { join, posix as posixPath } from 'path';
import type { Express } from 'express';
import * as duckdb from 'duckdb';
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
  AppendDatasetRequestDto,
  DatasetCandlesQueryDto,
} from './dto/dataset.dto';
import {
  resolveImportUploadPath,
  resolveDatasetPath,
} from '../config/storage.config';
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
      targetDatasetId: payload.targetDatasetId ?? null,
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

    if (importTask.targetDatasetId) {
      throw new BadRequestException('追加任务不支持重试，请重新提交新的追加任务');
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
    return this.createImportFromUpload(file, {
      pluginName: payload.pluginName,
      pluginVersion: payload.pluginVersion,
      createdBy: payload.createdBy ?? null,
      metadata: payload.metadata as ImportMetadataPayload | undefined,
      status: payload.status ?? ImportStatus.Uploading,
    });
  }

  private async createImportFromUpload(
    file: Express.Multer.File,
    options: {
      pluginName: string;
      pluginVersion: string;
      createdBy?: string | null;
      metadata?: ImportMetadataPayload;
      status?: ImportStatus;
      targetDataset?: DatasetEntity | null;
    },
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

    const normalizedMetadata = this.normalizeMetadata(options.metadata);
    const metadataPayload: ImportMetadataPayload | undefined = normalizedMetadata
      ? { ...normalizedMetadata }
      : undefined;

    let importTask = await this.createImportTask({
      sourceFile: safeFileName,
      storedFilePath: initialStoredPath,
      pluginName: options.pluginName,
      pluginVersion: options.pluginVersion,
      status: options.status ?? ImportStatus.Uploading,
      createdBy: options.createdBy ?? null,
      metadata: metadataPayload,
      targetDatasetId: options.targetDataset?.datasetId ?? null,
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
      { targetDataset: options.targetDataset ?? null },
    );

    return this.importsRepository.findOneOrFail({
      where: { importId: savedTask.importId },
      relations: ['dataset'],
    });
  }

  async appendDataset(
    datasetId: number,
    payload: AppendDatasetRequestDto,
    file?: Express.Multer.File,
  ): Promise<ImportTaskEntity> {
    if (!file) {
      throw new BadRequestException('请上传数据文件');
    }

    const dataset = await this.datasetsRepository.findOne({
      where: { datasetId },
    });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }
    if (dataset.deletedAt) {
      throw new BadRequestException('数据集已被软删除，无法追加数据');
    }

    await this.assertDatasetAvailableForAppend(dataset);

    const metadata: ImportMetadataPayload = {
      source: dataset.source ?? null,
      tradingPair: dataset.tradingPair,
      granularity: dataset.granularity,
      labels: Array.isArray(dataset.labels) ? [...dataset.labels] : [],
      description: dataset.description ?? null,
      timeStart: dataset.timeStart,
      timeEnd: dataset.timeEnd,
    };

    return this.createImportFromUpload(file, {
      pluginName: payload.pluginName,
      pluginVersion: payload.pluginVersion,
      createdBy: payload.createdBy ? payload.createdBy.trim() : null,
      metadata,
      targetDataset: dataset,
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

  async getImportErrorLogChunk(
    importId: number,
    options?: { cursor?: number; limit?: number },
  ): Promise<{
    entries: string[];
    cursor: number;
    nextCursor: number | null;
    hasMore: boolean;
    totalLines: number;
  }> {
    const importTask = await this.importsRepository.findOne({
      where: { importId },
      select: ['importId', 'errorLog'],
    });
    if (!importTask) {
      throw new NotFoundException(`Import ${importId} not found`);
    }

    const rawLog = importTask.errorLog ?? '';
    if (!rawLog.trim()) {
      return {
        entries: [],
        cursor: 0,
        nextCursor: null,
        hasMore: false,
        totalLines: 0,
      };
    }

    const lines = rawLog.split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === '') {
      lines.pop();
    }
    const totalLines = lines.length;
    const cursor = Math.min(
      Math.max(options?.cursor ?? 0, 0),
      totalLines,
    );
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 1000);

    const remaining = totalLines - cursor;
    if (remaining <= 0) {
      return {
        entries: [],
        cursor,
        nextCursor: null,
        hasMore: false,
        totalLines,
      };
    }

    const take = Math.min(limit, remaining);
    const sliceStart = totalLines - cursor - take;
    const sliceEnd = totalLines - cursor;
    const chunk = lines.slice(sliceStart, sliceEnd).reverse();
    const nextCursor = cursor + chunk.length;

    return {
      entries: chunk,
      cursor,
      nextCursor: nextCursor < totalLines ? nextCursor : null,
      hasMore: nextCursor < totalLines,
      totalLines,
    };
  }

  async getDatasetCandles(
    datasetId: number,
    query: DatasetCandlesQueryDto,
  ): Promise<{
    datasetId: number;
    symbol: string;
    granularity: string;
    resolution: string;
    from: number;
    to: number;
    limit: number;
    hasMore: boolean;
    candles: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  }> {
    const dataset = await this.datasetsRepository.findOne({
      where: { datasetId },
      relations: ['batches'],
    });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    const baseResolution = dataset.granularity ?? 'unknown';
    const baseIntervalSeconds = this.parseResolutionToSeconds(baseResolution);

    const resolution = query.resolution ?? dataset.granularity;
    const intervalSeconds = this.parseResolutionToSeconds(resolution);

    if (intervalSeconds < baseIntervalSeconds || intervalSeconds % baseIntervalSeconds !== 0) {
      throw new BadRequestException(
        `不支持的时间粒度 ${resolution}，需为数据集基础粒度 ${dataset.granularity} 的整数倍`,
      );
    }

    const limit = Math.min(query.limit ?? 500, 5000);

    const datasetStart = dataset.timeStart;
    const datasetEnd = dataset.timeEnd;

    let toDate = query.to ? this.secondsToDate(query.to) : new Date(datasetEnd);
    if (Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('结束时间参数非法');
    }
    if (toDate.getTime() > datasetEnd.getTime()) {
      toDate = new Date(datasetEnd);
    }

    let fromDate = query.from ? this.secondsToDate(query.from) : new Date(toDate);
    if (Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException('开始时间参数非法');
    }
    if (!query.from) {
      const defaultWindowMs = intervalSeconds * limit * 1000;
      fromDate = new Date(toDate.getTime() - defaultWindowMs);
    }
    if (fromDate.getTime() < datasetStart.getTime()) {
      fromDate = new Date(datasetStart);
    }
    if (fromDate > toDate) {
      throw new BadRequestException('开始时间需早于结束时间');
    }

    const relevantBatches = (dataset.batches ?? [])
      .filter((batch) => {
        const batchStart = new Date(batch.timeStart).getTime();
        const batchEnd = new Date(batch.timeEnd).getTime();
        return batchEnd >= fromDate.getTime() && batchStart <= toDate.getTime();
      })
      .sort(
        (a, b) =>
          new Date(a.timeStart).getTime() - new Date(b.timeStart).getTime(),
      );

    let paths = relevantBatches.map((batch) => resolveDatasetPath(batch.path));

    if (!paths.length) {
      if (dataset.path && dataset.path.endsWith('.parquet')) {
        paths = [resolveDatasetPath(dataset.path)];
      }
    }

    if (!paths.length) {
      throw new BadRequestException('当前数据集暂无可用的批次文件');
    }

    const rows = await this.queryCandles({
      paths,
      from: fromDate,
      to: toDate,
      intervalSeconds,
      baseIntervalSeconds,
      limit,
    });

    const candles = rows.map((row: any) => ({
      time: Math.floor(Number(row.time)),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume ?? 0),
    }));

    return {
      datasetId: dataset.datasetId,
      symbol: dataset.tradingPair,
      granularity: dataset.granularity,
      resolution,
      from: Math.floor(fromDate.getTime() / 1000),
      to: Math.floor(toDate.getTime() / 1000),
      limit,
      hasMore: fromDate.getTime() > datasetStart.getTime(),
      candles,
    };
  }

  private async assertDatasetAvailableForAppend(
    dataset: DatasetEntity,
  ): Promise<void> {
    const blockingStatuses = [
      ImportStatus.Pending,
      ImportStatus.Uploading,
      ImportStatus.Processing,
    ];

    const activeCount = await this.importsRepository.count({
      where: [
        { datasetId: dataset.datasetId, status: In(blockingStatuses) },
        { targetDatasetId: dataset.datasetId, status: In(blockingStatuses) },
      ],
    });

    if (activeCount > 0) {
      throw new BadRequestException(
        '当前数据集存在进行中的导入或追加任务，请稍后再试',
      );
    }
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
    if (normalized.tradingPair === undefined || normalized.tradingPair === null) {
      normalized.tradingPair = 'unknown';
    }
    if (normalized.granularity === undefined || normalized.granularity === null) {
      normalized.granularity = 'unknown';
    }

    if (normalized.timeStart) {
      const parsedStart = new Date(normalized.timeStart as unknown as string);
      normalized.timeStart = Number.isNaN(parsedStart.getTime()) ? null : parsedStart;
    }

    if (normalized.timeEnd) {
      const parsedEnd = new Date(normalized.timeEnd as unknown as string);
      normalized.timeEnd = Number.isNaN(parsedEnd.getTime()) ? null : parsedEnd;
    }

    return normalized;
  }

  private secondsToDate(value: number): Date {
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('时间戳参数非法');
    }
    return date;
  }

  private parseResolutionToSeconds(resolution?: string | null): number {
    if (!resolution) {
      throw new BadRequestException('缺少时间粒度参数');
    }
    const normalized = resolution.trim().toLowerCase();
    const match = normalized.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new BadRequestException(`不支持的时间粒度格式: ${resolution}`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const unitMap: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    const unitSeconds = unitMap[unit];
    if (!unitSeconds) {
      throw new BadRequestException(`不支持的时间粒度单位: ${unit}`);
    }
    return value * unitSeconds;
  }

  private async queryCandles(params: {
    paths: string[];
    from: Date;
    to: Date;
    intervalSeconds: number;
    baseIntervalSeconds: number;
    limit: number;
  }): Promise<any[]> {
    const { paths, from, to, intervalSeconds, baseIntervalSeconds, limit } =
      params;
    const escapedPaths = paths.map((p) => `'${this.escapeLiteral(p)}'`).join(', ');
    const parquetScan = `read_parquet([${escapedPaths}])`;
    const fromIso = this.escapeLiteral(from.toISOString());
    const toIso = this.escapeLiteral(to.toISOString());
    const limitClause = limit ? `LIMIT ${limit}` : '';

    let sql: string;
    if (intervalSeconds === baseIntervalSeconds) {
      sql = `
        SELECT
          FLOOR(epoch(timestamp)) AS time,
          open,
          high,
          low,
          close,
          volume
        FROM ${parquetScan}
        WHERE timestamp BETWEEN TIMESTAMP '${fromIso}' AND TIMESTAMP '${toIso}'
        ORDER BY timestamp
        ${limitClause};
      `;
    } else {
      sql = `
        WITH filtered AS (
          SELECT *,
            CAST(FLOOR(epoch(timestamp) / ${intervalSeconds}) * ${intervalSeconds} AS BIGINT) AS bucket
          FROM ${parquetScan}
          WHERE timestamp BETWEEN TIMESTAMP '${fromIso}' AND TIMESTAMP '${toIso}'
        )
        SELECT
          bucket AS time,
          arg_min(open, timestamp) AS open,
          max(high) AS high,
          min(low) AS low,
          arg_max(close, timestamp) AS close,
          sum(volume) AS volume
        FROM filtered
        GROUP BY bucket
        ORDER BY bucket
        ${limitClause};
      `;
    }

    return this.executeDuckDbQuery(sql);
  }

  private executeDuckDbQuery<T = any>(sql: string): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      const db = new duckdb.Database(':memory:');
      const connection = db.connect();
      connection.all(sql, (err, rows) => {
        connection.close();
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  private escapeLiteral(value: string): string {
    return value.replace(/'/g, "''");
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
