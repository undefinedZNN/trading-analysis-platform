import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CopyScriptVersionDto {
  @IsOptional()
  @IsString()
  @Length(2, 20)
  versionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  createdBy?: string | null;
}
