import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { sanitizeStrategyTags } from '../../utils/tags.util';

export class ListStrategiesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string | null;

  @IsOptional()
  @Transform(({ value }) => sanitizeStrategyTags(value))
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(6)
  tags?: string[];
}
