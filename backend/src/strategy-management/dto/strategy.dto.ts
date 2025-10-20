import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const normalizeStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalize = (input: string): string =>
    input
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 50);

  const items = Array.isArray(value)
    ? value.flatMap((entry) => `${entry}`.split(','))
    : `${value}`.split(',');

  const sanitized = items
    .map((item) => normalize(item))
    .filter((item) => item.length > 0);

  return sanitized.length > 0 ? sanitized : undefined;
};

export class ListStrategiesQueryDto {
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
  @MaxLength(100)
  keyword?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  markets?: string[];
}

export class CreateStrategyDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  team?: string | null;

  @Transform(({ value }) => normalizeStringArray(value) ?? [])
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  markets!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  frequency?: string | null;

  @Transform(({ value }) => normalizeStringArray(value) ?? [])
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  tags!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  createdBy?: string | null;
}

export class UpdateStrategyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  team?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  markets?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  frequency?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  updatedBy?: string | null;
}
