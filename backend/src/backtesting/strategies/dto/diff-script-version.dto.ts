import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class DiffScriptVersionDto {
  @IsOptional()
  @IsUUID()
  compareVersionId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 20)
  @Matches(/^v[0-9]+(\.[0-9]+)*$/)
  compareVersionName?: string;
}
