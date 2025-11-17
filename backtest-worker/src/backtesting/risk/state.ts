/**
 * RiskEngine 状态管理
 * 
 * 维护风控引擎的状态，包括：
 * - 组合快照
 * - 历史统计
 * - 活跃规则
 * 
 * @module risk/state
 */

import Big from 'big.js';
import { 
  RiskState, 
  PortfolioSnapshot, 
  HistoricalStats,
  PositionSnapshot,
  PortfolioUpdatePayload,
  ExecutionReportPayload
} from './interfaces';

/**
 * 创建初始风控状态
 */
export function createInitialRiskState(): RiskState {
  return {
    portfolio: createEmptyPortfolio(),
    stats: createEmptyStats(),
    activeRules: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 创建空组合
 */
export function createEmptyPortfolio(): PortfolioSnapshot {
  return {
    balances: {},
    positions: {},
    equity: '0',
    marginUsage: '0',
    timestamp: new Date().toISOString(),
  };
}

/**
 * 创建空统计
 */
export function createEmptyStats(): HistoricalStats {
  return {
    ordersToday: 0,
    filledToday: 0,
    pnlToday: '0',
    cumulativePnl: '0',
    maxDrawdown: '0',
    lastResetAt: new Date().toISOString(),
    consecutiveLosses: 0,
    consecutiveWins: 0,
  };
}

/**
 * 风控状态管理器
 */
export class RiskStateManager {
  private state: RiskState;

  constructor(initialState?: RiskState) {
    this.state = initialState || createInitialRiskState();
  }

  /**
   * 获取当前状态（深拷贝）
   */
  getState(): RiskState {
    return {
      portfolio: {
        ...this.state.portfolio,
        balances: { ...this.state.portfolio.balances },
        positions: { ...this.state.portfolio.positions },
      },
      stats: { ...this.state.stats },
      activeRules: [...this.state.activeRules],
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt,
    };
  }

  /**
   * 更新组合
   */
  updatePortfolio(update: PortfolioUpdatePayload): void {
    // 更新余额
    this.state.portfolio.balances = { ...update.balances };
    
    // 更新持仓
    const positions: Record<string, PositionSnapshot> = {};
    for (const pos of update.positions) {
      positions[pos.symbol] = { ...pos };
    }
    this.state.portfolio.positions = positions;
    
    // 更新权益和保证金
    this.state.portfolio.equity = update.equity;
    this.state.portfolio.marginUsage = update.marginUsage || '0';
    this.state.portfolio.timestamp = update.timestamp;
    
    // 更新最大回撤
    this.updateMaxDrawdown(update.equity);
    
    this.state.updatedAt = new Date().toISOString();
  }

  /**
   * 更新执行回报
   */
  updateExecution(report: ExecutionReportPayload): void {
    this.state.stats.ordersToday++;
    
    if (report.status === 'filled' || report.status === 'partially-filled') {
      this.state.stats.filledToday++;
      
      // 更新盈亏（这里简化处理，实际应该根据仓位计算）
      // 通常在 PortfolioUpdate 事件中计算更准确
      this.updatePnL(report);
    }
    
    this.state.updatedAt = new Date().toISOString();
  }

  /**
   * 更新盈亏
   */
  private updatePnL(report: ExecutionReportPayload): void {
    // 简化实现：仅扣除手续费
    // 实际盈亏应该在组合更新时计算
    const feeAmount = report.totalFee ?? '0';
    const fee = new Big(feeAmount);
    const currentPnlToday = new Big(this.state.stats.pnlToday);
    
    // 手续费作为成本
    this.state.stats.pnlToday = currentPnlToday.minus(fee).toFixed();
    
    const currentCumulativePnl = new Big(this.state.stats.cumulativePnl);
    this.state.stats.cumulativePnl = currentCumulativePnl.minus(fee).toFixed();
  }

  /**
   * 更新最大回撤
   */
  private updateMaxDrawdown(currentEquity: string): void {
    // 简化实现：假设初始权益为基准
    // 实际应该跟踪历史最高权益
    const equity = new Big(currentEquity);
    const initialEquity = new Big(10000); // 假设初始资金 10000
    
    const drawdown = equity.minus(initialEquity);
    const currentMaxDrawdown = new Big(this.state.stats.maxDrawdown);
    
    if (drawdown.lt(currentMaxDrawdown)) {
      this.state.stats.maxDrawdown = drawdown.toFixed();
    }
  }

  /**
   * 重置统计数据
   */
  resetStats(): void {
    const now = new Date().toISOString();
    this.state.stats = {
      ...createEmptyStats(),
      lastResetAt: now,
      cumulativePnl: this.state.stats.cumulativePnl, // 保留累计盈亏
      maxDrawdown: this.state.stats.maxDrawdown,     // 保留最大回撤
    };
    this.state.updatedAt = now;
  }

  /**
   * 添加活跃规则
   */
  addActiveRule(ruleId: string): void {
    if (!this.state.activeRules.includes(ruleId)) {
      this.state.activeRules.push(ruleId);
      this.state.updatedAt = new Date().toISOString();
    }
  }

  /**
   * 移除活跃规则
   */
  removeActiveRule(ruleId: string): void {
    const index = this.state.activeRules.indexOf(ruleId);
    if (index !== -1) {
      this.state.activeRules.splice(index, 1);
      this.state.updatedAt = new Date().toISOString();
    }
  }

  /**
   * 恢复状态（深拷贝）
   */
  restoreState(state: RiskState): void {
    this.state = {
      portfolio: {
        ...state.portfolio,
        balances: { ...state.portfolio.balances },
        positions: { ...state.portfolio.positions },
      },
      stats: { ...state.stats },
      activeRules: [...state.activeRules],
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }
}
