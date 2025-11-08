/**
 * Ledger Service - 交易账簿服务模块
 * 
 * 提供：
 * - 交易记录
 * - PnL 计算
 * - 特征关联
 * - 结构化输出（JSON/CSV/Parquet）
 * 
 * @module ledger
 */

// ============================================================================
// 核心接口
// ============================================================================

export type {
  // 核心类型
  TradeSide,
  TradeType,
  
  // 交易记录
  TradeRecord,
  
  // 账簿服务
  LedgerService,
  TradeFilter,
  TradeStats,
  LedgerServiceConfig,
  
  // PnL 计算
  PnLCalculator,
  PnLResult,
  
  // 编排器
  LedgerServiceOrchestrator,
  OrchestratorStats,
  
  // Parquet Schema
  ParquetSchema,
} from './interfaces';

export { LEDGER_PARQUET_SCHEMA } from './interfaces';

// ============================================================================
// 核心实现
// ============================================================================

export { LedgerServiceImpl, createLedgerService } from './service';
export { SimplePnLCalculator } from './pnl-calculator';
export { LedgerServiceOrchestratorImpl, createLedgerOrchestrator } from './orchestrator';

