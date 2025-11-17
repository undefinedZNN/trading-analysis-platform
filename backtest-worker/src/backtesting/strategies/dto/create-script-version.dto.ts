import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateScriptVersionDto {
  @IsOptional()
  @IsString()
  @Length(2, 20)
  versionName?: string;

  @IsString()
  @Length(1, 500000)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  createdBy?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  updatedBy?: string | null;

  @IsOptional()
  @IsBoolean()
  isMaster?: boolean;
}
