/**
 * 完整的策略回测验证系统
 * 
 * 提供多层验证机制确保策略回测结果的准确性和可信度
 */

import Big from 'big.js';

/**
 * 交易记录（详细版本）
 */
export interface DetailedTrade {
  id: number;
  timestamp: number;
  side: 'buy' | 'sell';
  price: string;
  quantity: string;
  
  // 买入特有
  cost?: string;
  
  // 卖出特有
  revenue?: string;
  pnl?: string;
  pnlPercent?: string;
  entryPrice?: string;
  
  // 账户快照（交易前）
  beforeCash: string;
  beforePosition: string;
  beforeEquity: string;
  
  // 账户快照（交易后）
  afterCash: string;
  afterPosition: string;
  afterEquity: string;
  
  reason?: string;
}

/**
 * 账户状态快照
 */
export interface AccountSnapshot {
  timestamp: number;
  barIndex: number;
  price: number;
  cash: string;
  position: string;
  positionValue: string;
  equity: string;
  unrealizedPnl: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  statistics: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warningCount: number;
  };
}

/**
 * 完整验证器
 */
export class ComprehensiveValidator {
  private trades: DetailedTrade[] = [];
  private snapshots: AccountSnapshot[] = [];
  private initialEquity: Big;
  private tolerance: number = 0.01; // 容差 1 分钱
  
  constructor(initialEquity: string, tolerance: number = 0.01) {
    this.initialEquity = new Big(initialEquity);
    this.tolerance = tolerance;
  }

  /**
   * 记录详细交易
   */
  recordTrade(trade: DetailedTrade): void {
    this.trades.push(trade);
  }

  /**
   * 记录账户快照
   */
  recordSnapshot(snapshot: AccountSnapshot): void {
    this.snapshots.push(snapshot);
  }

  /**
   * 执行完整验证
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalChecks = 0;
    let passedChecks = 0;

    // 1. 验证交易连续性
    const { passed: continuityPassed, errors: continuityErrors } = this.validateTradeContinuity();
    totalChecks++;
    if (continuityPassed) passedChecks++;
    errors.push(...continuityErrors);

    // 2. 验证每笔交易的计算
    const { passed: tradePassed, errors: tradeErrors, warnings: tradeWarnings } = 
      this.validateEachTrade();
    totalChecks++;
    if (tradePassed) passedChecks++;
    errors.push(...tradeErrors);
    warnings.push(...tradeWarnings);

    // 3. 验证账户状态转换
    const { passed: statePassed, errors: stateErrors } = this.validateStateTransitions();
    totalChecks++;
    if (statePassed) passedChecks++;
    errors.push(...stateErrors);

    // 4. 验证资金守恒
    const { passed: conservationPassed, errors: conservationErrors } = 
      this.validateConservation();
    totalChecks++;
    if (conservationPassed) passedChecks++;
    errors.push(...conservationErrors);

    // 5. 验证持仓平衡
    const { passed: positionPassed, errors: positionErrors } = this.validatePositionBalance();
    totalChecks++;
    if (positionPassed) passedChecks++;
    errors.push(...positionErrors);

    // 6. 验证盈亏计算
    const { passed: pnlPassed, errors: pnlErrors } = this.validatePnLCalculations();
    totalChecks++;
    if (pnlPassed) passedChecks++;
    errors.push(...pnlErrors);

    // 7. 交叉验证权益
    const { passed: equityPassed, errors: equityErrors } = this.crossValidateEquity();
    totalChecks++;
    if (equityPassed) passedChecks++;
    errors.push(...equityErrors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      statistics: {
        totalChecks,
        passedChecks,
        failedChecks: totalChecks - passedChecks,
        warningCount: warnings.length,
      },
    };
  }

  /**
   * 1. 验证交易连续性
   */
  private validateTradeContinuity(): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查交易ID连续性
    for (let i = 0; i < this.trades.length; i++) {
      if (this.trades[i].id !== i) {
        errors.push(`交易 ${i}: ID 不连续，期望 ${i}，实际 ${this.trades[i].id}`);
      }
    }

    // 检查时间戳单调递增
    for (let i = 1; i < this.trades.length; i++) {
      if (this.trades[i].timestamp < this.trades[i - 1].timestamp) {
        errors.push(
          `交易 ${i}: 时间戳倒退，前一笔 ${this.trades[i - 1].timestamp}，当前 ${this.trades[i].timestamp}`
        );
      }
    }

    // 检查账户状态连续性
    for (let i = 1; i < this.trades.length; i++) {
      const prevTrade = this.trades[i - 1];
      const currTrade = this.trades[i];

      // 前一笔的交易后状态应该等于当前交易的交易前状态
      if (prevTrade.afterCash !== currTrade.beforeCash) {
        errors.push(
          `交易 ${i}: 现金不连续，前一笔交易后 ${prevTrade.afterCash}，当前交易前 ${currTrade.beforeCash}`
        );
      }
      if (prevTrade.afterPosition !== currTrade.beforePosition) {
        errors.push(
          `交易 ${i}: 持仓不连续，前一笔交易后 ${prevTrade.afterPosition}，当前交易前 ${currTrade.beforePosition}`
        );
      }
    }

    return { passed: errors.length === 0, errors };
  }

  /**
   * 2. 验证每笔交易的计算
   */
  private validateEachTrade(): { 
    passed: boolean; 
    errors: string[]; 
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < this.trades.length; i++) {
      const trade = this.trades[i];
      const price = new Big(trade.price);
      const quantity = new Big(trade.quantity);

      if (trade.side === 'buy') {
        // 验证买入成本计算
        const expectedCost = price.times(quantity);
        const actualCost = new Big(trade.cost!);
        
        if (!this.isClose(expectedCost, actualCost)) {
          errors.push(
            `交易 ${i} (买入): 成本计算错误，期望 ${expectedCost.toFixed(2)}，实际 ${actualCost.toFixed(2)}`
          );
        }

        // 验证现金变化
        const expectedCash = new Big(trade.beforeCash).minus(actualCost);
        const actualCash = new Big(trade.afterCash);
        
        if (!this.isClose(expectedCash, actualCash)) {
          errors.push(
            `交易 ${i} (买入): 现金计算错误，期望 ${expectedCash.toFixed(2)}，实际 ${actualCash.toFixed(2)}`
          );
        }

        // 验证持仓变化
        const expectedPosition = new Big(trade.beforePosition).plus(quantity);
        const actualPosition = new Big(trade.afterPosition);
        
        if (!this.isClose(expectedPosition, actualPosition)) {
          errors.push(
            `交易 ${i} (买入): 持仓计算错误，期望 ${expectedPosition.toFixed(8)}，实际 ${actualPosition.toFixed(8)}`
          );
        }

      } else if (trade.side === 'sell') {
        // 验证卖出收入计算
        const expectedRevenue = price.times(quantity);
        const actualRevenue = new Big(trade.revenue!);
        
        if (!this.isClose(expectedRevenue, actualRevenue)) {
          errors.push(
            `交易 ${i} (卖出): 收入计算错误，期望 ${expectedRevenue.toFixed(2)}，实际 ${actualRevenue.toFixed(2)}`
          );
        }

        // 验证盈亏计算
        if (trade.entryPrice) {
          const entryPrice = new Big(trade.entryPrice);
          const expectedPnl = quantity.times(price.minus(entryPrice));
          const actualPnl = new Big(trade.pnl!);
          
          if (!this.isClose(expectedPnl, actualPnl)) {
            errors.push(
              `交易 ${i} (卖出): 盈亏计算错误，期望 ${expectedPnl.toFixed(2)}，实际 ${actualPnl.toFixed(2)}`
            );
          }

          // 验证盈亏百分比
          const expectedPnlPercent = expectedPnl.div(entryPrice).times(100);
          const actualPnlPercent = new Big(trade.pnlPercent!);
          
          if (!this.isClose(expectedPnlPercent, actualPnlPercent, 0.01)) {
            warnings.push(
              `交易 ${i} (卖出): 盈亏百分比略有偏差，期望 ${expectedPnlPercent.toFixed(2)}%，实际 ${actualPnlPercent.toFixed(2)}%`
            );
          }
        }

        // 验证现金变化
        const expectedCash = new Big(trade.beforeCash).plus(actualRevenue);
        const actualCash = new Big(trade.afterCash);
        
        if (!this.isClose(expectedCash, actualCash)) {
          errors.push(
            `交易 ${i} (卖出): 现金计算错误，期望 ${expectedCash.toFixed(2)}，实际 ${actualCash.toFixed(2)}`
          );
        }

        // 验证持仓变化
        const expectedPosition = new Big(trade.beforePosition).minus(quantity);
        const actualPosition = new Big(trade.afterPosition);
        
        if (!this.isClose(expectedPosition, actualPosition)) {
          errors.push(
            `交易 ${i} (卖出): 持仓计算错误，期望 ${expectedPosition.toFixed(8)}，实际 ${actualPosition.toFixed(8)}`
          );
        }
      }

      // 验证权益变化（买入时权益不变，卖出时权益增加盈亏）
      const beforeEquity = new Big(trade.beforeEquity);
      const afterEquity = new Big(trade.afterEquity);
      
      if (trade.side === 'buy') {
        // 买入时权益应该基本不变（只是现金转为持仓）
        if (!this.isClose(beforeEquity, afterEquity, 1.0)) {
          warnings.push(
            `交易 ${i} (买入): 权益变化异常，交易前 ${beforeEquity.toFixed(2)}，交易后 ${afterEquity.toFixed(2)}`
          );
        }
      }
    }

    return { passed: errors.length === 0, errors, warnings };
  }

  /**
   * 3. 验证账户状态转换
   */
  private validateStateTransitions(): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const snapshot of this.snapshots) {
      const cash = new Big(snapshot.cash);
      const position = new Big(snapshot.position);
      const positionValue = new Big(snapshot.positionValue);
      const equity = new Big(snapshot.equity);
      const price = new Big(snapshot.price);

      // 验证持仓价值 = 持仓数量 × 当前价格
      const expectedPositionValue = position.times(price);
      if (!this.isClose(expectedPositionValue, positionValue, 0.01)) {
        errors.push(
          `快照 ${snapshot.barIndex}: 持仓价值计算错误，期望 ${expectedPositionValue.toFixed(2)}，实际 ${positionValue.toFixed(2)}`
        );
      }

      // 验证权益 = 现金 + 持仓价值
      const expectedEquity = cash.plus(positionValue);
      if (!this.isClose(expectedEquity, equity)) {
        errors.push(
          `快照 ${snapshot.barIndex}: 权益计算错误，期望 ${expectedEquity.toFixed(2)}，实际 ${equity.toFixed(2)}`
        );
      }

      // 验证现金和持仓非负
      if (cash.lt(0)) {
        errors.push(`快照 ${snapshot.barIndex}: 现金为负 ${cash.toFixed(2)}`);
      }
      if (position.lt(0)) {
        errors.push(`快照 ${snapshot.barIndex}: 持仓为负 ${position.toFixed(8)}`);
      }
    }

    return { passed: errors.length === 0, errors };
  }

  /**
   * 4. 验证资金守恒
   */
  private validateConservation(): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.trades.length === 0) {
      return { passed: true, errors: [] };
    }

    // 计算总买入成本和总卖出收入
    let totalCost = new Big(0);
    let totalRevenue = new Big(0);

    for (const trade of this.trades) {
      if (trade.side === 'buy') {
        totalCost = totalCost.plus(trade.cost!);
      } else if (trade.side === 'sell') {
        totalRevenue = totalRevenue.plus(trade.revenue!);
      }
    }

    // 最后的账户状态
    const lastTrade = this.trades[this.trades.length - 1];
    const finalCash = new Big(lastTrade.afterCash);
    const finalPosition = new Big(lastTrade.afterPosition);

    // 验证: 初始资金 + 总收入 = 最终现金 + 总成本
    const leftSide = this.initialEquity.plus(totalRevenue);
    const rightSide = finalCash.plus(totalCost);

    if (!this.isClose(leftSide, rightSide, 1.0)) {
      errors.push(
        `资金守恒验证失败: 初始+收入=${leftSide.toFixed(2)}, 现金+成本=${rightSide.toFixed(2)}, 差异=${leftSide.minus(rightSide).toFixed(2)}`
      );
    }

    return { passed: errors.length === 0, errors };
  }

  /**
   * 5. 验证持仓平衡
   */
  private validatePositionBalance(): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    let totalBuy = new Big(0);
    let totalSell = new Big(0);

    for (const trade of this.trades) {
      const quantity = new Big(trade.quantity);
      if (trade.side === 'buy') {
        totalBuy = totalBuy.plus(quantity);
      } else if (trade.side === 'sell') {
        totalSell = totalSell.plus(quantity);
      }
    }

    // 验证卖出不超过买入
    if (totalSell.gt(totalBuy)) {
      errors.push(
        `持仓平衡验证失败: 累计卖出 ${totalSell.toFixed(8)} 超过累计买入 ${totalBuy.toFixed(8)}`
      );
    }

    // 验证最终持仓 = 累计买入 - 累计卖出
    if (this.trades.length > 0) {
      const lastTrade = this.trades[this.trades.length - 1];
      const finalPosition = new Big(lastTrade.afterPosition);
      const expectedPosition = totalBuy.minus(totalSell);

      if (!this.isClose(expectedPosition, finalPosition)) {
        errors.push(
          `最终持仓验证失败: 期望 ${expectedPosition.toFixed(8)}，实际 ${finalPosition.toFixed(8)}`
        );
      }
    }

    return { passed: errors.length === 0, errors };
  }

  /**
   * 6. 验证盈亏计算
   */
  private validatePnLCalculations(): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    // 计算已实现盈亏总和
    let totalRealizedPnl = new Big(0);
    for (const trade of this.trades) {
      if (trade.side === 'sell' && trade.pnl) {
        totalRealizedPnl = totalRealizedPnl.plus(trade.pnl);
      }
    }

    // 验证: 最终权益 = 初始资金 + 已实现盈亏 + 未实现盈亏
    if (this.trades.length > 0 && this.snapshots.length > 0) {
      const lastSnapshot = this.snapshots[this.snapshots.length - 1];
      const finalEquity = new Big(lastSnapshot.equity);
      const unrealizedPnl = new Big(lastSnapshot.unrealizedPnl);
      
      const expectedEquity = this.initialEquity.plus(totalRealizedPnl).plus(unrealizedPnl);
      
      if (!this.isClose(expectedEquity, finalEquity, 1.0)) {
        errors.push(
          `盈亏验证失败: 期望权益 ${expectedEquity.toFixed(2)}，实际权益 ${finalEquity.toFixed(2)}`
        );
      }
    }

    return { passed: errors.length === 0, errors };
  }

  /**
   * 7. 交叉验证权益（使用两种独立方法计算）
   */
  private crossValidateEquity(): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.trades.length === 0 || this.snapshots.length === 0) {
      return { passed: true, errors: [] };
    }

    const lastSnapshot = this.snapshots[this.snapshots.length - 1];
    const reportedEquity = new Big(lastSnapshot.equity);

    // 方法1: 现金 + 持仓价值
    const method1Equity = new Big(lastSnapshot.cash).plus(lastSnapshot.positionValue);

    // 方法2: 初始资金 + 已实现盈亏 + 未实现盈亏
    let totalRealizedPnl = new Big(0);
    for (const trade of this.trades) {
      if (trade.side === 'sell' && trade.pnl) {
        totalRealizedPnl = totalRealizedPnl.plus(trade.pnl);
      }
    }
    const method2Equity = this.initialEquity.plus(totalRealizedPnl).plus(lastSnapshot.unrealizedPnl);

    // 三个值应该一致
    if (!this.isClose(reportedEquity, method1Equity, 0.5)) {
      errors.push(
        `权益交叉验证失败 (方法1): 报告权益 ${reportedEquity.toFixed(2)}，现金+持仓 ${method1Equity.toFixed(2)}`
      );
    }

    if (!this.isClose(reportedEquity, method2Equity, 1.0)) {
      errors.push(
        `权益交叉验证失败 (方法2): 报告权益 ${reportedEquity.toFixed(2)}，初始+盈亏 ${method2Equity.toFixed(2)}`
      );
    }

    return { passed: errors.length === 0, errors };
  }

  /**
   * 判断两个值是否接近（在容差范围内）
   */
  private isClose(a: Big, b: Big, customTolerance?: number): boolean {
    const tolerance = customTolerance !== undefined ? customTolerance : this.tolerance;
    return a.minus(b).abs().lte(tolerance);
  }

  /**
   * 生成验证报告
   */
  generateReport(result: ValidationResult): string {
    const lines: string[] = [];
    
    lines.push('╔════════════════════════════════════════════════════════════════════╗');
    lines.push('║                     完整验证报告                                   ║');
    lines.push('╚════════════════════════════════════════════════════════════════════╝');
    lines.push('');
    
    lines.push(`验证状态: ${result.valid ? '✅ 通过' : '❌ 失败'}`);
    lines.push('');
    
    lines.push('验证统计:');
    lines.push(`  总检查项: ${result.statistics.totalChecks}`);
    lines.push(`  通过: ${result.statistics.passedChecks}`);
    lines.push(`  失败: ${result.statistics.failedChecks}`);
    lines.push(`  警告: ${result.statistics.warningCount}`);
    lines.push('');
    
    lines.push('检查项详情:');
    lines.push('  1. 交易连续性验证');
    lines.push('  2. 每笔交易计算验证');
    lines.push('  3. 账户状态转换验证');
    lines.push('  4. 资金守恒验证');
    lines.push('  5. 持仓平衡验证');
    lines.push('  6. 盈亏计算验证');
    lines.push('  7. 权益交叉验证');
    lines.push('');
    
    if (result.errors.length > 0) {
      lines.push('❌ 发现的错误:');
      result.errors.forEach((error, idx) => {
        lines.push(`  ${idx + 1}. ${error}`);
      });
      lines.push('');
    }
    
    if (result.warnings.length > 0) {
      lines.push('⚠️  警告信息:');
      result.warnings.forEach((warning, idx) => {
        lines.push(`  ${idx + 1}. ${warning}`);
      });
      lines.push('');
    }
    
    if (result.valid) {
      lines.push('✅ 所有验证通过！回测结果可信。');
    } else {
      lines.push('❌ 验证失败，请检查回测逻辑或数据。');
    }
    
    lines.push('');
    lines.push('─'.repeat(70));
    
    return lines.join('\n');
  }
}

