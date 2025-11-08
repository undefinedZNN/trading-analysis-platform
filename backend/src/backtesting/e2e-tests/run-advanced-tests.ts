#!/usr/bin/env node
/**
 * 运行高级测试套件
 * 
 * 包含 RiskStress 和 SnapshotResume 测试
 */

import { createTestRunner } from './runner/test-runner';
import { createRiskStressTest } from './strategies/risk-stress';
import { createSnapshotResumeTest } from './strategies/snapshot-resume';

async function main() {
  console.log('🚀 Running Advanced E2E Tests\n');

  // 创建测试运行器
  const runner = createTestRunner({
    verbose: true,
    timeout: 180000, // 3 minutes
  });

  // 注册测试策略
  console.log('📋 Registering test strategies...');
  runner.register(createRiskStressTest());
  runner.register(createSnapshotResumeTest());

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

