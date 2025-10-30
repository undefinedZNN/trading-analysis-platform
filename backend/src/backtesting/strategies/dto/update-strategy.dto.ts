import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeStrategyTags } from '../../utils/tags.util';

export class UpdateStrategyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => sanitizeStrategyTags(value))
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(6)
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  updatedBy?: string | null;
}
