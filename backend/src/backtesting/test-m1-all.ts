/**
 * M1 里程碑完整测试套件
 * 
 * 运行所有 M1 模块的测试，生成汇总报告
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  module: string;
  testFile: string;
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  error?: string;
}

interface TestSummary {
  totalModules: number;
  passedModules: number;
  failedModules: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
  successRate: number;
  results: TestResult[];
}

// M1 模块测试配置
const M1_TEST_CONFIGS = [
  {
    module: 'M1-01 DataProvider',
    testFiles: [
      'src/backtesting/data/providers/test-runner.ts',
    ],
  },
  {
    module: 'M1-02 TimeframeAdapter',
    testFiles: [
      'src/backtesting/data/timeframe/test-runner.ts',
    ],
  },
  {
    module: 'M1-03 FeatureRegistry',
    testFiles: [
      'src/backtesting/features/test-runner.ts',
      'src/backtesting/features/test-runner-extended.ts',
      'src/backtesting/features/test-runner-new-features.ts',
    ],
  },
  {
    module: 'M1-04-B EventBus Core',
    testFiles: [
      'src/backtesting/events/simple-test-runner.ts',
    ],
  },
  {
    module: 'M1-04-C EventStore Enhanced',
    testFiles: [
      'src/backtesting/events/enhanced-test-runner.ts',
    ],
  },
  {
    module: 'M1-04-D Control & DeadLetter',
    testFiles: [
      'src/backtesting/events/control-dead-letter-test.ts',
    ],
  },
  {
    module: 'M1-04-E Integration & Replay',
    testFiles: [
      'src/backtesting/events/integration-test.ts',
      'src/backtesting/events/replay-test.ts',
    ],
  },
];

/**
 * 运行单个测试文件
 */
async function runTest(testFile: string): Promise<TestResult> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    console.log(`\n🧪 Running: ${testFile}`);
    console.log('─'.repeat(80));
    
    const proc = cp.spawn('npx', ['ts-node', testFile], {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      
      // 解析测试结果
      const totalMatch = stdout.match(/总测试数[：:]\s*(\d+)/);
      const passedMatch = stdout.match(/(?:通过|✅ 通过)[：:]\s*(\d+)/);
      const failedMatch = stdout.match(/(?:失败|❌ 失败)[：:]\s*(\d+)/);
      
      const passedTests = passedMatch ? parseInt(passedMatch[1]) : 0;
      const failedTests = failedMatch ? parseInt(failedMatch[1]) : 0;
      const totalTests = totalMatch ? parseInt(totalMatch[1]) : (passedTests + failedTests);

      const result: TestResult = {
        module: '',
        testFile,
        passed: code === 0,
        totalTests,
        passedTests,
        failedTests,
        duration,
        error: code !== 0 ? stderr : undefined,
      };

      resolve(result);
    });
  });
}

/**
 * 运行所有测试
 */
async function runAllTests(): Promise<TestSummary> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          M1 里程碑完整测试套件                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const allResults: TestResult[] = [];
  
  for (const config of M1_TEST_CONFIGS) {
    console.log(`\n📦 Module: ${config.module}`);
    console.log('═'.repeat(80));
    
    for (const testFile of config.testFiles) {
      const result = await runTest(testFile);
      result.module = config.module;
      allResults.push(result);
    }
  }

  // 计算总结
  const summary: TestSummary = {
    totalModules: M1_TEST_CONFIGS.length,
    passedModules: 0,
    failedModules: 0,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    totalDuration: 0,
    successRate: 0,
    results: allResults,
  };

  // 按模块统计
  const moduleStats = new Map<string, { passed: boolean; tests: number }>();
  
  for (const result of allResults) {
    summary.totalTests += result.totalTests;
    summary.passedTests += result.passedTests;
    summary.failedTests += result.failedTests;
    summary.totalDuration += result.duration;

    if (!moduleStats.has(result.module)) {
      moduleStats.set(result.module, { passed: true, tests: 0 });
    }
    
    const stat = moduleStats.get(result.module)!;
    stat.passed = stat.passed && result.passed;
    stat.tests += result.totalTests;
  }

  summary.passedModules = Array.from(moduleStats.values()).filter(s => s.passed).length;
  summary.failedModules = summary.totalModules - summary.passedModules;
  summary.successRate = summary.totalTests > 0 ? summary.passedTests / summary.totalTests : 0;

  return summary;
}

/**
 * 生成测试报告
 */
function generateReport(summary: TestSummary): string {
  const lines: string[] = [];
  
  lines.push('\n╔════════════════════════════════════════════════════════════════╗');
  lines.push('║                   M1 测试汇总报告                              ║');
  lines.push('╚════════════════════════════════════════════════════════════════╝\n');

  // 总体统计
  lines.push('## 📊 总体统计\n');
  lines.push(`总模块数: ${summary.totalModules}`);
  lines.push(`通过模块: ${summary.passedModules} ✅`);
  lines.push(`失败模块: ${summary.failedModules} ${summary.failedModules > 0 ? '❌' : ''}`);
  lines.push('');
  lines.push(`总测试数: ${summary.totalTests}`);
  lines.push(`通过测试: ${summary.passedTests} ✅`);
  lines.push(`失败测试: ${summary.failedTests} ${summary.failedTests > 0 ? '❌' : ''}`);
  lines.push(`成功率: ${(summary.successRate * 100).toFixed(1)}%`);
  lines.push(`总耗时: ${(summary.totalDuration / 1000).toFixed(2)}s\n`);

  // 模块详情
  lines.push('## 📋 模块详情\n');
  
  const moduleGroups = new Map<string, TestResult[]>();
  for (const result of summary.results) {
    if (!moduleGroups.has(result.module)) {
      moduleGroups.set(result.module, []);
    }
    moduleGroups.get(result.module)!.push(result);
  }

  for (const [module, results] of moduleGroups) {
    const allPassed = results.every(r => r.passed);
    const totalTests = results.reduce((sum, r) => sum + r.totalTests, 0);
    const passedTests = results.reduce((sum, r) => sum + r.passedTests, 0);
    const duration = results.reduce((sum, r) => sum + r.duration, 0);

    lines.push(`### ${allPassed ? '✅' : '❌'} ${module}`);
    lines.push(`- 测试文件数: ${results.length}`);
    lines.push(`- 测试用例: ${passedTests}/${totalTests}`);
    lines.push(`- 耗时: ${(duration / 1000).toFixed(2)}s`);
    
    for (const result of results) {
      const status = result.passed ? '✅' : '❌';
      lines.push(`  ${status} ${path.basename(result.testFile)}: ${result.passedTests}/${result.totalTests} (${(result.duration / 1000).toFixed(2)}s)`);
      
      if (!result.passed && result.error) {
        lines.push(`     Error: ${result.error.split('\n')[0]}`);
      }
    }
    lines.push('');
  }

  // 建议
  if (summary.failedTests > 0) {
    lines.push('## ⚠️ 需要关注\n');
    lines.push(`发现 ${summary.failedTests} 个失败的测试用例，建议：`);
    lines.push('1. 检查失败的测试用例详情');
    lines.push('2. 确认是代码问题还是测试环境问题');
    lines.push('3. 修复后重新运行测试\n');
  } else {
    lines.push('## 🎉 测试通过\n');
    lines.push('所有测试用例全部通过！M1 里程碑质量良好。\n');
  }

  return lines.join('\n');
}

/**
 * 保存测试报告
 */
function saveReport(summary: TestSummary, report: string): void {
  const reportPath = path.join(__dirname, 'M1-TEST-REPORT.md');
  
  let markdown = `# M1 里程碑测试报告\n\n`;
  markdown += `**生成时间**: ${new Date().toLocaleString('zh-CN')}\n`;
  markdown += `**测试环境**: Node ${process.version}\n\n`;
  markdown += `---\n\n`;
  markdown += report;
  
  // 添加详细结果表格
  markdown += `\n## 📈 详细结果\n\n`;
  markdown += `| 模块 | 测试文件 | 状态 | 测试数 | 通过 | 失败 | 耗时 |\n`;
  markdown += `|------|----------|------|--------|------|------|------|\n`;
  
  for (const result of summary.results) {
    const status = result.passed ? '✅' : '❌';
    const filename = path.basename(result.testFile);
    markdown += `| ${result.module} | ${filename} | ${status} | ${result.totalTests} | ${result.passedTests} | ${result.failedTests} | ${(result.duration / 1000).toFixed(2)}s |\n`;
  }

  fs.writeFileSync(reportPath, markdown, 'utf-8');
  console.log(`\n📄 测试报告已保存: ${reportPath}`);
}

/**
 * 主函数
 */
async function main() {
  try {
    const summary = await runAllTests();
    const report = generateReport(summary);
    
    console.log(report);
    saveReport(summary, report);

    // 退出码
    process.exit(summary.failedTests > 0 ? 1 : 0);
  } catch (error) {
    console.error('测试运行出错:', error);
    process.exit(1);
  }
}

main();

