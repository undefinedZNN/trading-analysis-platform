import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 过滤条件 DTO
 */
export class FilterConditionsDto {
  @ApiProperty({
    description: '因子过滤条件',
    example: {
      rsi: { min: 30, max: 70 },
      volume: { min: 1000 },
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  factors?: Record<string, any>;

  @ApiProperty({
    description: '时间范围过滤',
    example: {
      start: '2022-12-15T00:00:00',
      end: '2022-12-31T23:59:59',
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  timeRange?: {
    start?: string;
    end?: string;
  };

  @ApiProperty({
    description: '交易类型过滤',
    example: {
      buy: true,
      sell: false,
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  tradeType?: {
    buy?: boolean;
    sell?: boolean;
  };
}

/**
 * 创建过滤结果 DTO
 */
export class CreateFilteredResultDto {
  @ApiProperty({
    description: '结果名称',
    example: 'RSI>70多单',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  resultName!: string;

  @ApiProperty({
    description: '过滤条件',
    type: FilterConditionsDto,
  })
  @ValidateNested()
  @Type(() => FilterConditionsDto)
  filterConditions!: FilterConditionsDto;
}

