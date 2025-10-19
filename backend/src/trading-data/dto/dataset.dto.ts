import {
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsNumber,
  ValidateIf,
  ArrayMaxSize,
  ArrayNotEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ImportStatus } from '../entities/import-task.entity';

export interface ListDatasetsQuery {
  page?: number;
  pageSize?: number;
  source?: string | null;
  tradingPair?: string | null;
  granularity?: string | null;
  dataStart?: Date | null;
  dataEnd?: Date | null;
  createdStart?: Date | null;
  createdEnd?: Date | null;
  tags?: string[];
  status?: 'active' | 'deleted' | 'all';
  importStatus?: ImportStatus | null;
  keyword?: string | null;
}

export const sanitizeStringArray = (
  value: unknown,
): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalize = (input: string): string =>
    input
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 25);

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => `${entry}`.split(','))
      .map((entry) => normalize(entry))
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => normalize(entry))
      .filter((entry) => entry.length > 0);
  }
  return undefined;
};

const parseQueryTags = (value: unknown): string[] | undefined => {
  const parsed = sanitizeStringArray(value);
  return parsed && parsed.length > 0 ? parsed : undefined;
};

export class ListDatasetsRequestDto implements ListDatasetsQuery {
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
  @IsString()
  @MaxLength(50)
  source?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tradingPair?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  granularity?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dataStart?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dataEnd?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdStart?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdEnd?: Date | null;

  @IsOptional()
  @Transform(({ value }) => parseQueryTags(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(25, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['active', 'deleted', 'all'])
  status?: 'active' | 'deleted' | 'all';

  @IsOptional()
  @IsEnum(ImportStatus)
  importStatus?: ImportStatus | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string | null;
}

export interface UpdateDatasetMetadataPayload {
  description?: string | null;
  labels?: string[];
  updatedBy?: string | null;
}

export class UpdateDatasetMetadataDto
  implements UpdateDatasetMetadataPayload
{
  @IsOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => sanitizeStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(25, { each: true })
  @ArrayMaxSize(20)
  labels?: string[];
}

export class AppendDatasetRequestDto {
  @IsOptional()
  @IsString()
  createdBy?: string | null;

  @IsString()
  @MaxLength(100)
  pluginName!: string;

  @IsString()
  @MaxLength(50)
  pluginVersion!: string;
}

export class DatasetCandlesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  resolution?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  from?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  to?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
