#!/usr/bin/env node
/**
 * 运行基础测试套件
 * 
 * 包含 PriceEcho 和 FixedRebalance 测试
 */

import { createTestRunner } from './runner/test-runner';
import { createPriceEchoTest } from './strategies/price-echo';
import { createFixedRebalanceTest } from './strategies/fixed-rebalance';

async function main() {
  console.log('🚀 Running Basic E2E Tests\n');

  // 创建测试运行器
  const runner = createTestRunner({
    verbose: true,
    timeout: 120000, // 2 minutes
  });

  // 注册测试策略
  console.log('📋 Registering test strategies...');
  runner.register(createPriceEchoTest());
  runner.register(createFixedRebalanceTest());

  // 运行测试
  console.log('▶️  Running tests...\n');
  const suite = await runner.runAll();

  // 打印结果
  runner.printSuiteResult(suite);

  // 生成报告
  const report = runner.generateReport(suite);
  console.log('\n📄 Test Report:');
  console.log(report);

  // 退出
  process.exit(suite.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

