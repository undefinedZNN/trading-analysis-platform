#!/usr/bin/env node
/**
 * E2E测试CLI工具
 * 
 * @module e2e-tests/runner/cli
 */

import { createTestRunner } from './test-runner';

/**
 * 解析命令行参数
 */
function parseArgs(): {
  pattern?: string;
  verbose?: boolean;
  timeout?: number;
} {
  const args = process.argv.slice(2);
  const result: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--timeout' || arg === '-t') {
      result.timeout = parseInt(args[++i], 10);
    } else if (arg === '--pattern' || arg === '-p') {
      result.pattern = args[++i];
    }
  }

  return result;
}

/**
 * 主函数
 */
async function main() {
  const args = parseArgs();
  
  console.log('🚀 Starting E2E Tests...\n');

  const runner = createTestRunner({
    verbose: args.verbose,
    timeout: args.timeout,
  });

  // 加载策略
  await runner.loadStrategies();

  // 运行测试
  let suite;
  if (args.pattern) {
    const pattern = new RegExp(args.pattern);
    suite = await runner.runByPattern(pattern);
  } else {
    suite = await runner.runAll();
  }

  // 打印结果
  runner.printSuiteResult(suite);

  // 退出码
  process.exit(suite.failed > 0 ? 1 : 0);
}

// 运行
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

