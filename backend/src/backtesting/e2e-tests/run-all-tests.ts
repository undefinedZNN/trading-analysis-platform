#!/usr/bin/env node
/**
 * 运行完整测试套件
 * 
 * 包含所有E2E测试
 */

import { createTestRunner } from './runner/test-runner';
import { createPriceEchoTest } from './strategies/price-echo';
import { createFixedRebalanceTest } from './strategies/fixed-rebalance';
import { createRiskStressTest } from './strategies/risk-stress';
import { createSnapshotResumeTest } from './strategies/snapshot-resume';

async function main() {
  console.log('🚀 Running Complete E2E Test Suite\n');

  // 创建测试运行器
  const runner = createTestRunner({
    verbose: true,
    timeout: 180000, // 3 minutes per test
  });

  // 注册所有测试策略
  console.log('📋 Registering test strategies...');
  
  console.log('  ✓ PriceEcho (data pipeline)');
  runner.register(createPriceEchoTest());
  
  console.log('  ✓ FixedRebalance (order matching)');
  runner.register(createFixedRebalanceTest());
  
  console.log('  ✓ RiskStress (risk controls)');
  runner.register(createRiskStressTest());
  
  console.log('  ✓ SnapshotResume (snapshot/restore)');
  runner.register(createSnapshotResumeTest());

  console.log('\n▶️  Running tests...\n');
  
  // 运行测试
  const suite = await runner.runAll();

  // 打印结果
  console.log('\n' + '='.repeat(70));
  runner.printSuiteResult(suite);
  console.log('='.repeat(70));

  // 生成详细报告
  const report = runner.generateReport(suite);
  console.log('\n📄 Detailed Test Report:');
  console.log(report);

  // 打印测试覆盖范围
  console.log('\n📊 Test Coverage:');
  console.log('━'.repeat(70));
  console.log('  ✅ Data Pipeline        - PriceEcho');
  console.log('  ✅ Order Matching       - FixedRebalance');
  console.log('  ✅ Risk Controls        - RiskStress');
  console.log('  ✅ Snapshot/Restore     - SnapshotResume');
  console.log('━'.repeat(70));

  // 退出
  const exitCode = suite.failed > 0 ? 1 : 0;
  console.log(`\n${exitCode === 0 ? '✅' : '❌'} Test suite ${exitCode === 0 ? 'PASSED' : 'FAILED'}`);
  process.exit(exitCode);
}

main().catch(error => {
  console.error('❌ Fatal Error:', error);
  process.exit(1);
});

