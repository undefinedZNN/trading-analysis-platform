import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateScriptVersionDto {
  @IsOptional()
  @IsString()
  @Length(2, 20)
  versionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;

  @IsOptional()
  @IsBoolean()
  setMaster?: boolean;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  updatedBy?: string | null;
}
