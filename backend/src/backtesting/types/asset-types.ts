import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
  IsObject,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 资产类型枚举
 */
export enum AssetType {
  /** 股票 */
  STOCK = 'stock',
  /** 期货 */
  FUTURES = 'futures',
  /** 加密货币 */
  CRYPTO = 'crypto',
  /** 外汇 */
  FOREX = 'forex',
}

/**
 * 佣金类型枚举
 */
export enum CommissionType {
  /** 百分比佣金（股票常用） */
  PERCENTAGE = 'percentage',
  /** 固定金额佣金（期货常用） */
  FIXED = 'fixed',
  /** Maker/Taker差异（加密货币） */
  MAKER_TAKER = 'maker-taker',
  /** 分段佣金（VIP等级） */
  TIERED = 'tiered',
}

/**
 * 合约规格 DTO
 */
export class ContractSpecsDto {
  @ApiPropertyOptional({
    description: '合约乘数（期货）- 每手合约对应的标的物数量',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  multiplier?: number;

  @ApiPropertyOptional({
    description: '最小变动价位 - 价格的最小变动单位',
    example: 1.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tickSize?: number;

  @ApiPropertyOptional({
    description: '最小交易单位（手数）- 最小可交易的手数',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  lotSize?: number;

  @ApiPropertyOptional({
    description: '保证金比例（期货）- 开仓所需的保证金占合约价值的比例',
    example: 0.09,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  marginRatio?: number;

  @ApiPropertyOptional({
    description: '计价货币',
    example: 'CNY',
  })
  @IsOptional()
  @IsString()
  currency?: string;
}

/**
 * 自定义验证器：期货必须提供合约规格
 */
export function IsRequiredForFutures(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isRequiredForFutures',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as any;
          if (obj.assetType === AssetType.FUTURES) {
            return value !== undefined && value !== null;
          }
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} is required when assetType is 'futures'`;
        },
      },
    });
  };
}

/**
 * 自定义验证器：期货合约规格必须包含乘数和保证金比例
 */
export function ValidateFuturesContractSpecs(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'validateFuturesContractSpecs',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as any;
          if (obj.assetType === AssetType.FUTURES && value) {
            // 期货必须有 multiplier 和 marginRatio
            if (!value.multiplier || value.multiplier < 1) {
              return false;
            }
            if (value.marginRatio === undefined || value.marginRatio < 0 || value.marginRatio > 1) {
              return false;
            }
            return true;
          }
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return 'Futures contractSpecs must include multiplier (>= 1) and marginRatio (0-1)';
        },
      },
    });
  };
}

/**
 * 佣金配置 DTO
 */
export class CommissionConfigDto {
  @ApiProperty({
    description: '佣金类型',
    enum: CommissionType,
    example: CommissionType.FIXED,
  })
  @IsEnum(CommissionType)
  type!: CommissionType;

  @ApiPropertyOptional({
    description: '佣金率（百分比模式）- 以小数形式表示，如 0.0003 表示万分之三',
    example: 0.0003,
    minimum: 0,
    maximum: 0.1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  rate?: number;

  @ApiPropertyOptional({
    description: '固定佣金金额（固定模式）- 每手交易的固定费用',
    example: 2.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Maker费率（Maker-Taker模式）- 提供流动性时的费率',
    example: 0.0002,
    minimum: 0,
    maximum: 0.1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  makerRate?: number;

  @ApiPropertyOptional({
    description: 'Taker费率（Maker-Taker模式）- 消耗流动性时的费率',
    example: 0.0005,
    minimum: 0,
    maximum: 0.1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  takerRate?: number;

  @ApiPropertyOptional({
    description: '最低佣金金额 - 每笔交易的最低费用（主要用于股票）',
    example: 5.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minCommission?: number;

  @ApiPropertyOptional({
    description: '印花税率（某些市场，仅卖出时收取）- 如A股千分之一',
    example: 0.001,
    minimum: 0,
    maximum: 0.01,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.01)
  stampDuty?: number;
}

