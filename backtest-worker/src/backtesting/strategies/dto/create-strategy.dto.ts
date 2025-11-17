import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { sanitizeStrategyTags } from '../../utils/tags.util';
import { CreateScriptVersionDto } from './create-script-version.dto';

export class CreateStrategyDto {
  @IsString()
  @Length(3, 60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => sanitizeStrategyTags(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @ArrayMaxSize(6)
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  createdBy?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  updatedBy?: string | null;

  @ValidateNested()
  @Type(() => CreateScriptVersionDto)
  initialVersion!: CreateScriptVersionDto;
}
