/**
 * E2E测试运行器
 * 
 * 负责加载和执行测试策略
 * 
 * @module e2e-tests/runner
 */

import * as path from 'path';
import { nanoid } from 'nanoid';
import type { SessionResults } from '../../analytics/interfaces';

/**
 * 测试策略接口
 */
export interface TestStrategy {
  /** 策略名称 */
  name: string;
  /** 策略描述 */
  description: string;
  /** 策略脚本路径 */
  scriptPath: string;
  /** 策略参数 */
  params?: Record<string, any>;
  /** 测试配置 */
  testConfig: TestConfig;
  /** 执行测试 */
  run(): Promise<TestResult>;
  /** 断言验证 */
  assert(results: SessionResults): Promise<void>;
}

/**
 * 测试配置
 */
export interface TestConfig {
  /** 测试数据集 */
  dataset?: string;
  /** 起始时间 */
  startTime?: string;
  /** 结束时间 */
  endTime?: string;
  /** 交易对 */
  symbols?: string[];
  /** 时间框架 */
  timeframe?: string;
  /** 初始资金 */
  initialCapital?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 测试结果
 */
export interface TestResult {
  /** 测试名称 */
  name: string;
  /** 是否通过 */
  passed: boolean;
  /** 执行时间（毫秒） */
  duration: number;
  /** 会话结果 */
  results?: SessionResults;
  /** 错误信息 */
  error?: string;
  /** 断言失败信息 */
  assertions?: AssertionResult[];
}

/**
 * 断言结果
 */
export interface AssertionResult {
  /** 断言描述 */
  description: string;
  /** 是否通过 */
  passed: boolean;
  /** 期望值 */
  expected?: any;
  /** 实际值 */
  actual?: any;
  /** 错误信息 */
  error?: string;
}

/**
 * 测试套件结果
 */
export interface TestSuiteResult {
  /** 总测试数 */
  total: number;
  /** 通过数 */
  passed: number;
  /** 失败数 */
  failed: number;
  /** 跳过数 */
  skipped: number;
  /** 总执行时间（毫秒） */
  duration: number;
  /** 测试结果列表 */
  results: TestResult[];
}

/**
 * 测试运行器配置
 */
export interface TestRunnerConfig {
  /** 策略目录 */
  strategiesDir?: string;
  /** 并发数 */
  concurrency?: number;
  /** 超时时间 */
  timeout?: number;
  /** 是否详细输出 */
  verbose?: boolean;
}

/**
 * 测试运行器
 */
export class TestRunner {
  private config: Required<TestRunnerConfig>;
  private strategies: TestStrategy[] = [];

  constructor(config: TestRunnerConfig = {}) {
    this.config = {
      strategiesDir: path.join(__dirname, '../strategies'),
      concurrency: 1,
      timeout: 300000, // 5 minutes
      verbose: false,
      ...config,
    };
  }

  /**
   * 注册测试策略
   */
  register(strategy: TestStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * 加载所有测试策略
   */
  async loadStrategies(): Promise<void> {
    // TODO: 从目录动态加载策略
    // 现在手动注册
  }

  /**
   * 运行所有测试
   */
  async runAll(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    for (const strategy of this.strategies) {
      const result = await this.runTest(strategy);
      results.push(result);

      if (this.config.verbose) {
        this.printTestResult(result);
      }
    }

    const duration = Date.now() - startTime;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      skipped: 0,
      duration,
      results,
    };
  }

  /**
   * 运行单个测试
   */
  async runTest(strategy: TestStrategy): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // 执行策略
      const testResult = await this.runWithTimeout(
        () => strategy.run(),
        this.config.timeout
      );

      // 执行断言
      if (testResult.results) {
        await strategy.assert(testResult.results);
      }

      return {
        ...testResult,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        name: strategy.name,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message || String(error),
      };
    }
  }

  /**
   * 运行指定测试（按名称）
   */
  async runByName(name: string): Promise<TestResult | null> {
    const strategy = this.strategies.find(s => s.name === name);
    if (!strategy) {
      return null;
    }
    return this.runTest(strategy);
  }

  /**
   * 运行指定测试（按模式）
   */
  async runByPattern(pattern: RegExp): Promise<TestSuiteResult> {
    const matched = this.strategies.filter(s => pattern.test(s.name));
    const originalStrategies = this.strategies;
    this.strategies = matched;
    const result = await this.runAll();
    this.strategies = originalStrategies;
    return result;
  }

  /**
   * 带超时的运行
   */
  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Test timeout')), timeout)
      ),
    ]);
  }

  /**
   * 打印测试结果
   */
  private printTestResult(result: TestResult): void {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (result.assertions) {
      for (const assertion of result.assertions) {
        const assertStatus = assertion.passed ? '  ✓' : '  ✗';
        console.log(`${assertStatus} ${assertion.description}`);
        if (!assertion.passed && assertion.error) {
          console.log(`    ${assertion.error}`);
        }
      }
    }
  }

  /**
   * 打印测试套件结果
   */
  printSuiteResult(suite: TestSuiteResult): void {
    console.log('\n═══════════════════════════════════════════');
    console.log('           Test Suite Results');
    console.log('═══════════════════════════════════════════');
    console.log(`Total:   ${suite.total}`);
    console.log(`Passed:  ${suite.passed} ✅`);
    console.log(`Failed:  ${suite.failed} ❌`);
    console.log(`Skipped: ${suite.skipped} ⏭️`);
    console.log(`Duration: ${suite.duration}ms`);
    console.log('═══════════════════════════════════════════\n');

    if (suite.failed > 0) {
      console.log('Failed Tests:');
      for (const result of suite.results.filter(r => !r.passed)) {
        console.log(`  ❌ ${result.name}`);
        if (result.error) {
          console.log(`     ${result.error}`);
        }
      }
      console.log();
    }
  }

  /**
   * 获取所有测试策略
   */
  getStrategies(): TestStrategy[] {
    return this.strategies;
  }

  /**
   * 生成测试报告（JSON）
   */
  generateReport(suite: TestSuiteResult): string {
    return JSON.stringify(suite, null, 2);
  }
}

/**
 * 创建测试运行器
 */
export function createTestRunner(config?: TestRunnerConfig): TestRunner {
  return new TestRunner(config);
}

