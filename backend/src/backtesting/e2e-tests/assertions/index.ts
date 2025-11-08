/**
 * E2E测试断言工具
 * 
 * 提供专用于回测框架的断言函数
 * 
 * @module e2e-tests/assertions
 */

import Big from 'big.js';
import type { SessionResults } from '../../analytics/interfaces';
import type { TradeRecord } from '../../ledger/interfaces';

/**
 * 断言错误
 */
export class AssertionError extends Error {
  constructor(message: string, public expected?: any, public actual?: any) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * 基础断言
 */
export class Assertions {
  /**
   * 断言相等
   */
  static assertEqual<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new AssertionError(
        message || `Expected ${expected}, but got ${actual}`,
        expected,
        actual
      );
    }
  }

  /**
   * 断言不相等
   */
  static assertNotEqual<T>(actual: T, expected: T, message?: string): void {
    if (actual === expected) {
      throw new AssertionError(
        message || `Expected not equal to ${expected}`,
        expected,
        actual
      );
    }
  }

  /**
   * 断言真值
   */
  static assertTrue(value: boolean, message?: string): void {
    if (!value) {
      throw new AssertionError(
        message || 'Expected true, but got false',
        true,
        value
      );
    }
  }

  /**
   * 断言假值
   */
  static assertFalse(value: boolean, message?: string): void {
    if (value) {
      throw new AssertionError(
        message || 'Expected false, but got true',
        false,
        value
      );
    }
  }

  /**
   * 断言null
   */
  static assertNull(value: any, message?: string): void {
    if (value !== null) {
      throw new AssertionError(
        message || 'Expected null',
        null,
        value
      );
    }
  }

  /**
   * 断言非null
   */
  static assertNotNull(value: any, message?: string): void {
    if (value === null) {
      throw new AssertionError(
        message || 'Expected not null',
        'not null',
        value
      );
    }
  }

  /**
   * 断言undefined
   */
  static assertUndefined(value: any, message?: string): void {
    if (value !== undefined) {
      throw new AssertionError(
        message || 'Expected undefined',
        undefined,
        value
      );
    }
  }

  /**
   * 断言非undefined
   */
  static assertDefined(value: any, message?: string): void {
    if (value === undefined) {
      throw new AssertionError(
        message || 'Expected defined value',
        'defined',
        value
      );
    }
  }

  /**
   * 断言范围内
   */
  static assertInRange(
    value: number,
    min: number,
    max: number,
    message?: string
  ): void {
    if (value < min || value > max) {
      throw new AssertionError(
        message || `Expected value in range [${min}, ${max}], but got ${value}`,
        `[${min}, ${max}]`,
        value
      );
    }
  }

  /**
   * 断言接近（浮点数比较）
   */
  static assertCloseTo(
    actual: number | string,
    expected: number | string,
    tolerance: number = 0.0001,
    message?: string
  ): void {
    const actualBig = new Big(actual);
    const expectedBig = new Big(expected);
    const diff = actualBig.minus(expectedBig).abs();

    if (diff.gt(tolerance)) {
      throw new AssertionError(
        message || `Expected ${expected} ± ${tolerance}, but got ${actual}`,
        expected,
        actual
      );
    }
  }

  /**
   * 断言抛出异常
   */
  static async assertThrows(
    fn: () => void | Promise<void>,
    errorType?: new (...args: any[]) => Error,
    message?: string
  ): Promise<void> {
    let thrown = false;
    let error: any;

    try {
      await fn();
    } catch (e) {
      thrown = true;
      error = e;
    }

    if (!thrown) {
      throw new AssertionError(
        message || 'Expected function to throw, but it did not'
      );
    }

    if (errorType && !(error instanceof errorType)) {
      throw new AssertionError(
        message || `Expected error of type ${errorType.name}, but got ${error.constructor.name}`,
        errorType.name,
        error.constructor.name
      );
    }
  }

  /**
   * 断言数组相等
   */
  static assertArrayEqual<T>(
    actual: T[],
    expected: T[],
    message?: string
  ): void {
    if (actual.length !== expected.length) {
      throw new AssertionError(
        message || `Array length mismatch: expected ${expected.length}, got ${actual.length}`,
        expected.length,
        actual.length
      );
    }

    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        throw new AssertionError(
          message || `Array element mismatch at index ${i}: expected ${expected[i]}, got ${actual[i]}`,
          expected[i],
          actual[i]
        );
      }
    }
  }

  /**
   * 断言数组包含
   */
  static assertArrayContains<T>(
    array: T[],
    value: T,
    message?: string
  ): void {
    if (!array.includes(value)) {
      throw new AssertionError(
        message || `Expected array to contain ${value}`,
        value,
        array
      );
    }
  }

  /**
   * 断言对象包含属性
   */
  static assertHasProperty(
    obj: any,
    property: string,
    message?: string
  ): void {
    if (!(property in obj)) {
      throw new AssertionError(
        message || `Expected object to have property '${property}'`,
        property,
        Object.keys(obj)
      );
    }
  }
}

/**
 * 回测专用断言
 */
export class BacktestAssertions extends Assertions {
  /**
   * 断言交易数量
   */
  static assertTradeCount(
    trades: TradeRecord[],
    expected: number,
    message?: string
  ): void {
    this.assertEqual(
      trades.length,
      expected,
      message || `Expected ${expected} trades, but got ${trades.length}`
    );
  }

  /**
   * 断言PnL
   */
  static assertPnL(
    actual: string | number,
    expected: string | number,
    tolerance: number = 0.01,
    message?: string
  ): void {
    this.assertCloseTo(
      actual,
      expected,
      tolerance,
      message || `PnL mismatch: expected ${expected}, got ${actual}`
    );
  }

  /**
   * 断言费用
   */
  static assertFees(
    actual: string | number,
    expected: string | number,
    tolerance: number = 0.01,
    message?: string
  ): void {
    this.assertCloseTo(
      actual,
      expected,
      tolerance,
      message || `Fees mismatch: expected ${expected}, got ${actual}`
    );
  }

  /**
   * 断言胜率
   */
  static assertWinRate(
    winRate: number,
    expected: number,
    tolerance: number = 0.01,
    message?: string
  ): void {
    this.assertCloseTo(
      winRate,
      expected,
      tolerance,
      message || `Win rate mismatch: expected ${expected}, got ${winRate}`
    );
  }

  /**
   * 断言没有错误
   */
  static assertNoErrors(results: SessionResults, message?: string): void {
    if (results.status === 'failed' || results.error) {
      throw new AssertionError(
        message || `Session has errors: ${results.error}`,
        'no errors',
        results.error
      );
    }
  }

  /**
   * 断言会话完成
   */
  static assertSessionCompleted(
    results: SessionResults,
    message?: string
  ): void {
    this.assertEqual(
      results.status,
      'completed',
      message || `Session not completed: ${results.status}`
    );
  }

  /**
   * 断言最大回撤
   */
  static assertMaxDrawdown(
    actual: number,
    max: number,
    message?: string
  ): void {
    if (actual > max) {
      throw new AssertionError(
        message || `Max drawdown ${actual} exceeds limit ${max}`,
        `<= ${max}`,
        actual
      );
    }
  }

  /**
   * 断言Sharpe比率
   */
  static assertSharpeRatio(
    actual: number,
    min: number,
    message?: string
  ): void {
    if (actual < min) {
      throw new AssertionError(
        message || `Sharpe ratio ${actual} below minimum ${min}`,
        `>= ${min}`,
        actual
      );
    }
  }

  /**
   * 断言无重复交易
   */
  static assertNoDuplicateTrades(
    trades: TradeRecord[],
    message?: string
  ): void {
    const tradeIds = new Set<string>();
    const duplicates: string[] = [];

    for (const trade of trades) {
      if (tradeIds.has(trade.tradeId)) {
        duplicates.push(trade.tradeId);
      }
      tradeIds.add(trade.tradeId);
    }

    if (duplicates.length > 0) {
      throw new AssertionError(
        message || `Found duplicate trade IDs: ${duplicates.join(', ')}`,
        'no duplicates',
        duplicates
      );
    }
  }

  /**
   * 断言交易连续性（用于快照恢复测试）
   */
  static assertTradeContinuity(
    trades: TradeRecord[],
    message?: string
  ): void {
    if (trades.length < 2) return;

    const timestamps = trades.map(t => new Date(t.timestamp).getTime());
    
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < timestamps[i - 1]) {
        throw new AssertionError(
          message || `Trade order broken at index ${i}`,
          'continuous timestamps',
          `timestamp[${i}] < timestamp[${i-1}]`
        );
      }
    }
  }
}

/**
 * 便捷导出
 */
export const assert = Assertions;
export const assertBacktest = BacktestAssertions;

