import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  IsInt,
  IsPositive,
  ValidateIf,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import { ImportStatus } from '../entities/import-task.entity';
import { sanitizeStringArray } from './dataset.dto';

export interface ImportMetadataPayload extends Record<string, unknown> {
  source?: string | null;
  tradingPair: string;
  granularity: string;
  timeStart?: Date | null;
  timeEnd?: Date | null;
  labels?: string[];
  description?: string | null;
  symbol?: string | null;
}

export interface CreateImportTaskPayload {
  sourceFile: string;
  storedFilePath: string;
  pluginName: string;
  pluginVersion: string;
  status?: ImportStatus;
  createdBy?: string | null;
  metadata?: ImportMetadataPayload;
  targetDatasetId?: number | null;
}

const parseMetadataInput = ({ value }: { value: unknown }) => {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new BadRequestException('metadata 字段需要提供合法的 JSON');
    }
  }
  return value;
};

export class ImportMetadataDto {
  [key: string]: unknown;
  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string | null;

  @IsString()
  @MaxLength(100)
  tradingPair!: string;

  @IsString()
  @MaxLength(50)
  granularity!: string;

  @IsOptional()
  @Type(() => Date)
  timeStart?: Date | null;

  @IsOptional()
  @Type(() => Date)
  timeEnd?: Date | null;

  @IsOptional()
  @Transform(({ value }) => sanitizeStringArray(value))
  labels?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class CreateImportTaskDto {
  @IsOptional()
  @IsString()
  createdBy?: string | null;

  @IsString()
  @MaxLength(100)
  pluginName!: string;

  @IsString()
  @MaxLength(50)
  pluginVersion!: string;

  @IsOptional()
  @IsEnum(ImportStatus)
  status?: ImportStatus;

  @IsOptional()
  @Transform(parseMetadataInput)
  @Type(() => ImportMetadataDto)
  metadata?: ImportMetadataDto;
}

export interface UpdateImportStatusPayload {
  importId: number;
  status: ImportStatus;
  progress?: number;
  stage?: string | null;
  message?: string | null;
  errorLog?: string | null;
  datasetId?: number | null;
  updatedBy?: string | null;
  finishedAt?: Date | null;
}

export class UpdateImportStatusDto implements Omit<UpdateImportStatusPayload, 'importId'> {
  @IsEnum(ImportStatus)
  status!: ImportStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string | null;

  @IsOptional()
  @IsString()
  errorLog?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return Number(value);
  })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @IsPositive()
  datasetId?: number | null;

  @IsOptional()
  @IsString()
  updatedBy?: string | null;

  @IsOptional()
  @Type(() => Date)
  finishedAt?: Date | null;
}

export interface ListImportsQuery {
  page?: number;
  pageSize?: number;
  status?: ImportStatus | null;
  source?: string | null;
  tradingPair?: string | null;
  keyword?: string | null;
}

export class ListImportsRequestDto implements ListImportsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsEnum(ImportStatus)
  status?: ImportStatus | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tradingPair?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string | null;
}

export class ImportLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class RetryImportDto {
  @IsOptional()
  @IsBoolean()
  reuseOriginalFile?: boolean;

  @IsOptional()
  @Transform(parseMetadataInput)
  @Type(() => ImportMetadataDto)
  metadata?: ImportMetadataDto;
}
