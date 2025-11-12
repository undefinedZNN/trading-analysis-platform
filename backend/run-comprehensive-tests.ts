#!/usr/bin/env ts-node

/**
 * 回测框架综合测试脚本
 * 运行所有模块的单元测试和集成测试
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface TestResult {
  name: string;
  passed: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime: number = Date.now();

  /**
   * 打印标题
   */
  private printHeader(title: string) {
    console.log('\n' + '='.repeat(70));
    console.log(`  ${title}`);
    console.log('='.repeat(70) + '\n');
  }

  /**
   * 打印分隔线
   */
  private printSeparator() {
    console.log('─'.repeat(70));
  }

  /**
   * 运行单个测试文件
   */
  private runTest(testFile: string, testName: string): TestResult {
    const startTime = Date.now();
    console.log(`\n${colors.cyan}▶ 运行测试: ${testName}${colors.reset}`);
    this.printSeparator();

    const fullPath = path.join(__dirname, testFile);

    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      console.log(`${colors.yellow}⚠ 文件不存在: ${testFile}${colors.reset}`);
      return { name: testName, passed: false, error: 'File not found' };
    }

    try {
      const output = execSync(`npx ts-node "${fullPath}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000, // 60秒超时
      });

      const duration = Date.now() - startTime;
      console.log(output);
      console.log(
        `${colors.green}✅ ${testName} 通过 (${duration}ms)${colors.reset}`
      );

      return {
        name: testName,
        passed: true,
        output,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(
        `${colors.red}❌ ${testName} 失败 (${duration}ms)${colors.reset}`
      );
      if (error.stdout) {
        console.log(error.stdout.toString());
      }
      if (error.stderr) {
        console.log(error.stderr.toString());
      }

      return {
        name: testName,
        passed: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * 运行所有测试
   */
  public async runAllTests() {
    console.log('\n');
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + ' '.repeat(20) + '回测框架综合测试' + ' '.repeat(32) + '║');
    console.log('╚' + '═'.repeat(68) + '╝');

    // ============================================================
    // M1: 数据/特征与事件总线
    // ============================================================
    this.printHeader('M1: 数据/特征与事件总线');

    // M1-01: DataProvider
    this.results.push(
      this.runTest(
        'src/backtesting/data/providers/test-runner.ts',
        'M1-01 DataProvider'
      )
    );

    // M1-02: TimeframeAdapter
    this.results.push(
      this.runTest(
        'src/backtesting/data/timeframe/test-runner.ts',
        'M1-02 TimeframeAdapter'
      )
    );

    // M1-03: FeatureRegistry
    this.results.push(
      this.runTest(
        'src/backtesting/features/test-runner-extended.ts',
        'M1-03 FeatureRegistry'
      )
    );

    // M1-04: EventBus
    this.printHeader('M1-04: EventBus & EventStore');

    this.results.push(
      this.runTest(
        'src/backtesting/events/simple-test-runner.ts',
        'M1-04-A EventBus 基础'
      )
    );

    this.results.push(
      this.runTest(
        'src/backtesting/events/enhanced-test-runner.ts',
        'M1-04-B EventBus 增强'
      )
    );

    this.results.push(
      this.runTest(
        'src/backtesting/events/control-dead-letter-test.ts',
        'M1-04-C 控制流与死信'
      )
    );

    this.results.push(
      this.runTest(
        'src/backtesting/events/replay-test.ts',
        'M1-04-D 事件重放'
      )
    );

    this.results.push(
      this.runTest(
        'src/backtesting/events/integration-test.ts',
        'M1-04-E 集成测试'
      )
    );

    // ============================================================
    // M2: 策略/风控/执行
    // ============================================================
    this.printHeader('M2: 策略/风控/执行');

    // M2-01: StrategySandbox
    this.results.push(
      this.runTest(
        'src/backtesting/strategy/__tests__/simple-test.ts',
        'M2-01 StrategySandbox'
      )
    );

    // M2-02: RiskEngine
    this.results.push(
      this.runTest(
        'src/backtesting/risk/__tests__/risk-engine.test.ts',
        'M2-02 RiskEngine'
      )
    );

    // M2-03: ExecutionEngine
    this.results.push(
      this.runTest(
        'src/backtesting/execution/__tests__/execution-engine.test.ts',
        'M2-03 ExecutionEngine'
      )
    );

    // M2-04: LedgerService
    this.results.push(
      this.runTest(
        'src/backtesting/ledger/__tests__/ledger-service.test.ts',
        'M2-04 LedgerService'
      )
    );

    // ============================================================
    // M3: 编排与分析
    // ============================================================
    this.printHeader('M3: 编排与分析 (Jest测试)');

    console.log(
      `${colors.yellow}ℹ M3 模块使用 Jest 测试框架，需要单独运行${colors.reset}`
    );
    console.log(
      `${colors.cyan}  命令: cd backend && npm test -- orchestrator${colors.reset}`
    );
    console.log(
      `${colors.cyan}  命令: cd backend && npm test -- analytics${colors.reset}\n`
    );

    // ============================================================
    // 边界和压力测试
    // ============================================================
    this.printHeader('边界和压力测试');

    this.results.push(
      this.runTest(
        'src/backtesting/tests/boundary-stress-tests.ts',
        'EventBus 边界压力测试'
      )
    );

    this.results.push(
      this.runTest(
        'src/backtesting/tests/data-modules-boundary-tests.ts',
        '数据模块边界测试'
      )
    );

    // ============================================================
    // E2E 测试
    // ============================================================
    this.printHeader('E2E 端到端测试');

    this.results.push(
      this.runTest(
        'src/backtesting/e2e-tests/run-basic-tests.ts',
        'E2E 基础测试'
      )
    );

    this.results.push(
      this.runTest(
        'src/backtesting/e2e-tests/run-advanced-tests.ts',
        'E2E 高级测试'
      )
    );

    // ============================================================
    // 打印总结
    // ============================================================
    this.printSummary();
  }

  /**
   * 打印测试总结
   */
  private printSummary() {
    const totalTime = Date.now() - this.startTime;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;
    const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    console.log('\n');
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + ' '.repeat(25) + '测试总结' + ' '.repeat(35) + '║');
    console.log('╚' + '═'.repeat(68) + '╝');
    console.log('\n');

    // 打印测试结果列表
    console.log('测试结果:');
    this.printSeparator();
    this.results.forEach((result) => {
      const status = result.passed
        ? `${colors.green}✅${colors.reset}`
        : `${colors.red}❌${colors.reset}`;
      const duration = result.duration ? `(${result.duration}ms)` : '';
      console.log(`  ${status} ${result.name} ${colors.cyan}${duration}${colors.reset}`);
    });

    console.log('\n');

    // 打印统计信息
    console.log('统计信息:');
    this.printSeparator();
    console.log(`  总测试数: ${total}`);
    console.log(
      `  ${colors.green}通过: ${passed}${colors.reset}`
    );
    console.log(
      `  ${colors.red}失败: ${failed}${colors.reset}`
    );
    console.log(`  成功率: ${successRate}%`);
    console.log(`  总耗时: ${(totalTime / 1000).toFixed(2)}s`);
    console.log('\n');

    // 打印最终状态
    if (failed === 0 && total > 0) {
      console.log(
        `${colors.green}${colors.bright}✅ 所有测试通过！${colors.reset}\n`
      );
      process.exit(0);
    } else if (total === 0) {
      console.log(
        `${colors.yellow}⚠️  没有运行任何测试${colors.reset}\n`
      );
      process.exit(1);
    } else {
      console.log(
        `${colors.red}${colors.bright}❌ 有 ${failed} 个测试失败${colors.reset}\n`
      );
      process.exit(1);
    }
  }
}

// 主函数
async function main() {
  const runner = new TestRunner();
  await runner.runAllTests();
}

// 运行测试
main().catch((error) => {
  console.error(`${colors.red}测试运行器错误:${colors.reset}`, error);
  process.exit(1);
});

