import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsObject,
  Min,
  Max,
  Length,
} from 'class-validator';
import {
  FilterConditions,
  DetailedMetrics,
} from '../entities/backtest-result.entity';

/**
 * 创建回测结果的 DTO
 * 
 * 用于创建新的回测结果记录（主结果或派生结果）
 */
export class CreateBacktestResultDto {
  // ============================================
  // 基础标识信息
  // ============================================

  @IsString()
  @Length(1, 36)
  taskId!: string;

  @IsString()
  @Length(1, 100)
  resultName!: string;

  @IsOptional()
  @IsString()
  resultDescription?: string;

  @IsBoolean()
  isPrimary!: boolean;

  // ============================================
  // 过滤条件
  // ============================================

  @IsOptional()
  @IsObject()
  filterConditions?: FilterConditions;

  @IsNumber()
  @Min(0)
  tradesCountFiltered!: number;

  @IsNumber()
  @Min(0)
  tradesCountTotal!: number;

  // ============================================
  // 资金信息
  // ============================================

  @IsNumber()
  @Min(0)
  initialCash!: number;

  @IsNumber()
  @Min(0)
  finalValue!: number;

  @IsNumber()
  totalPnl!: number;

  // ============================================
  // 收益指标
  // ============================================

  @IsNumber()
  totalReturnPct!: number;

  @IsOptional()
  @IsNumber()
  annualizedReturnPct?: number;

  // ============================================
  // 交易统计
  // ============================================

  @IsNumber()
  @Min(0)
  totalTrades!: number;

  @IsNumber()
  @Min(0)
  winningTrades!: number;

  @IsNumber()
  @Min(0)
  losingTrades!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  winRate!: number;

  @IsNumber()
  avgProfitPerTrade!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  profitFactor?: number;

  @IsOptional()
  @IsNumber()
  expectancy?: number;

  // ============================================
  // 风险指标
  // ============================================

  @IsOptional()
  @IsNumber()
  sharpeRatio?: number;

  @IsOptional()
  @IsNumber()
  sortinoRatio?: number;

  @IsOptional()
  @IsNumber()
  calmarRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  maxDrawdownPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDrawdownValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualizedVolatilityPct?: number;

  // ============================================
  // 持仓统计
  // ============================================

  @IsOptional()
  @IsNumber()
  @Min(0)
  avgHoldingBars?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxHoldingBars?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minHoldingBars?: number;

  // ============================================
  // 文件路径
  // ============================================

  @IsOptional()
  @IsString()
  tradesFilePath?: string;

  @IsOptional()
  @IsString()
  equityFilePath?: string;

  // ============================================
  // 扩展数据
  // ============================================

  @IsOptional()
  @IsObject()
  detailedMetrics?: DetailedMetrics;

  @IsOptional()
  @IsNumber()
  @Min(0)
  calculationTimeMs?: number;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  dataSource?: string;

  // ============================================
  // 创建者
  // ============================================

  @IsOptional()
  @IsString()
  @Length(1, 64)
  createdBy?: string;
}

