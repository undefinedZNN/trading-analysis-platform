import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListTaskTradesDto {
  @ApiPropertyOptional({ description: '页码（从1开始）', default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ description: '每页数量（最大500）', default: 50 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize = 50;
}

export interface TradeFactorSnapshot {
  system?: Record<string, number | string>;
  custom?: Record<string, number | string>;
}

export interface TaskTradeRecord {
  taskId: string;
  sessionId: string;
  strategyId: string;
  scriptVersionId?: string;
  symbol: string;
  side: string;
  type: string;
  quantity?: number | null;
  price?: number | null;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  fees?: number | null;
  feeCurrency?: string;
  liquidity?: string;
  timestamp?: string | null;
  sequenceId?: string;
  position?: {
    quantity?: number | null;
    avgEntryPrice?: number | null;
    side?: string | null;
  };
  reason?: string | null;
  factorSnapshot?: TradeFactorSnapshot;
  entryPrice?: number | null;
  exitPrice?: number | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  barTimestamp?: string | null;
  entryTimestamp?: string | null;
  exitTimestamp?: string | null;
  exitSegments?: Array<{
    price: number;
    quantity: number;
    timestamp: string;
    barTimestamp?: string;
    reason?: string;
  }>;
  status?: string | null;
  context?: Record<string, unknown>;
}
