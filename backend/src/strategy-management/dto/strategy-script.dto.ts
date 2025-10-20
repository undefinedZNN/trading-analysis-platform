import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListStrategyScriptsQueryDto {
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
}

export class CreateStrategyScriptDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  versionCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changelog?: string | null;

  @IsString()
  scriptSource!: string;

  @IsOptional()
  manifest?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  createdBy?: string | null;
}

export class UpdateStrategyScriptDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changelog?: string | null;

  @IsOptional()
  @IsString()
  scriptSource?: string;

  @IsOptional()
  manifest?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  updatedBy?: string | null;
}
