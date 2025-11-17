/**
 * Portfolio Store - 仓位存储
 * 
 * 管理策略的仓位和余额
 * 
 * @module execution/portfolio-store
 */

import Big from 'big.js';
import { PortfolioStore, PositionSnapshot, PortfolioSnapshot } from './interfaces';

/**
 * 简单仓位存储实现
 */
export class SimplePortfolioStore implements PortfolioStore {
  private portfolios = new Map<string, Map<string, PositionSnapshot>>();
  private balances = new Map<string, Record<string, string>>();

  getPosition(strategyId: string, symbol: string): PositionSnapshot | undefined {
    const positions = this.portfolios.get(strategyId);
    return positions?.get(symbol);
  }

  updatePosition(strategyId: string, position: PositionSnapshot): void {
    if (!this.portfolios.has(strategyId)) {
      this.portfolios.set(strategyId, new Map());
    }
    
    const positions = this.portfolios.get(strategyId)!;
    positions.set(position.symbol, { ...position });
  }

  getPortfolio(strategyId: string): PortfolioSnapshot | undefined {
    const positions = this.portfolios.get(strategyId);
    if (!positions) {
      return undefined;
    }

    const positionsMap: Record<string, PositionSnapshot> = {};
    for (const [symbol, position] of positions.entries()) {
      positionsMap[symbol] = position;
    }

    const balances = this.balances.get(strategyId) || { USDT: '10000' };
    let equity = new Big(balances.USDT || '0');

    // 计算总权益（余额 + 未实现盈亏）
    for (const position of positions.values()) {
      equity = equity.plus(position.unrealizedPnl);
    }

    return {
      strategyId,
      balances,
      positions: positionsMap,
      equity: equity.toFixed(),
      marginUsage: '0',
      timestamp: new Date().toISOString(),
    };
  }

  getAllPositions(strategyId: string): PositionSnapshot[] {
    const positions = this.portfolios.get(strategyId);
    if (!positions) {
      return [];
    }
    return Array.from(positions.values());
  }

  /**
   * 初始化余额
   */
  initializeBalance(strategyId: string, asset: string, amount: string): void {
    if (!this.balances.has(strategyId)) {
      this.balances.set(strategyId, {});
    }
    const balance = this.balances.get(strategyId)!;
    balance[asset] = amount;
  }

  /**
   * 更新余额
   */
  updateBalance(strategyId: string, asset: string, delta: string): void {
    if (!this.balances.has(strategyId)) {
      this.balances.set(strategyId, {});
    }
    const balance = this.balances.get(strategyId)!;
    const current = new Big(balance[asset] || '0');
    balance[asset] = current.plus(delta).toFixed();
  }
}

