/**
 * 配置管理单元测试
 * 
 * 测试：
 * - 配置合并
 * - 配置验证
 * - 默认配置
 * 
 * @module orchestrator/__tests__/config.test
 */

import type { BacktestSessionConfig } from '../interfaces/config';
import { ConfigMerger, mergeConfig } from '../config/merger';
import { ConfigValidator, validateConfig, validateConfigOrThrow } from '../config/validator';
import {
  DEFAULT_EXECUTION_CONFIG,
  DEFAULT_RISK_CONFIG,
  DEFAULT_ANALYTICS_CONFIG,
} from '../config/defaults';

// ============================================================================
// 测试框架
// ============================================================================

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(description: string, fn: () => void): void {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✅ ${description}`);
  } catch (error: any) {
    failCount++;
    console.error(`❌ ${description}`);
    console.error(`   Error: ${error.message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ============================================================================
// 测试套件
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║          M3-01-A: 配置管理单元测试                             ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ----------------------------------------------------------------------------
// 配置合并测试
// ----------------------------------------------------------------------------

console.log('## 配置合并测试\n');

test('合并执行配置 - 用户配置覆盖默认值', () => {
  const userConfig = {
    initialCapital: '50000',
    matching: {
      marketFillPolicy: 'open' as const,
    },
  };
  
  const merged = ConfigMerger.mergeExecutionConfig(userConfig);
  
  assert(merged.initialCapital === '50000', 'Initial capital should be overridden');
  assert(merged.matching?.marketFillPolicy === 'open', 'Market fill policy should be overridden');
  assert(merged.slippage?.model === 'zero', 'Slippage should use default');
});

test('合并风控配置 - 规则合并', () => {
  const userConfig = {
    rules: [
      {
        ruleId: 'custom-rule',
        type: 'CustomRule',
        enabled: true,
        priority: 50,
        params: { threshold: 100 },
      },
    ],
    logLevel: 'debug' as const,
  };
  
  const merged = ConfigMerger.mergeRiskConfig(userConfig);
  
  assert(merged.rules.length === 1, 'Should have 1 rule');
  assert(merged.rules[0].ruleId === 'custom-rule', 'Custom rule should be present');
  assert(merged.logLevel === 'debug', 'Log level should be overridden');
});

test('合并完整会话配置 - 多层配置合并', () => {
  const userConfig: Partial<BacktestSessionConfig> = {
    sessionId: 'test-session',
    data: {
      source: {
        provider: 'parquet-duckdb' as const,
        path: '/data/btc',
        symbols: ['BTC/USDT'],
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z',
        },
      },
      timeframe: {
        primary: '5m',
      },
    },
    strategy: {
      strategyId: 'test-strategy',
      scriptContent: 'export default class TestStrategy {}',
      manifest: {
        strategyId: 'test-strategy',
        version: '1.0.0',
        name: 'Test Strategy',
        author: 'Test',
        description: 'Test',
        requiredTimeframe: '5m',
        featureDeps: [],
        dataDeps: [],
        defaultParameters: {},
      },
    },
    execution: {
      initialCapital: '20000',
    },
    risk: {
      rules: [],
    },
  };
  
  const merged = mergeConfig(userConfig);
  
  assert(merged.sessionId === 'test-session', 'Session ID should be set');
  assert(merged.data.source.symbols[0] === 'BTC/USDT', 'Symbol should be set');
  assert(merged.data.timeframe.primary === '5m', 'Primary timeframe should be set');
  assert(merged.execution.initialCapital === '20000', 'Initial capital should be set');
  assert(merged.execution.slippage?.model === 'zero', 'Should have default slippage');
});

test('深度合并 - 嵌套对象合并', () => {
  const userConfig: Partial<BacktestSessionConfig> = {
    sessionId: 'test',
    execution: {
      initialCapital: '10000',
      matching: {
        marketFillPolicy: 'mid' as const,
      },
    },
  } as any;
  
  const merged = mergeConfig(userConfig);
  
  assert(merged.execution.matching?.marketFillPolicy === 'mid', 'Should override nested value');
  assert(merged.execution.matching?.limitFillPolicy !== undefined, 'Should keep default nested value');
});

// ----------------------------------------------------------------------------
// 配置验证测试
// ----------------------------------------------------------------------------

console.log('\n## 配置验证测试\n');

test('验证有效配置 - 应该通过', () => {
  const validConfig: BacktestSessionConfig = {
    sessionId: 'valid-session',
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: '/data',
        symbols: ['BTC/USDT'],
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z',
        },
      },
      timeframe: {
        primary: '1m',
      },
    },
    strategy: {
      strategyId: 'strategy-1',
      scriptContent: 'export default class Strategy {}',
      manifest: {
        strategyId: 'strategy-1',
        version: '1.0.0',
        name: 'Strategy',
        author: 'Test',
        description: 'Test',
        requiredTimeframe: '1m',
        featureDeps: [],
        dataDeps: [],
        defaultParameters: {},
      },
    },
    execution: {
      initialCapital: '10000',
    },
    risk: {
      rules: [],
    },
  };
  
  const result = validateConfig(validConfig);
  
  assert(result.valid === true, 'Config should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

test('验证缺失 sessionId - 应该失败', () => {
  const invalidConfig: any = {
    sessionId: '',
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: '/data',
        symbols: ['BTC/USDT'],
        timeRange: { start: '2024-01-01', end: '2024-01-31' },
      },
      timeframe: { primary: '1m' },
    },
    strategy: {
      strategyId: 'strategy-1',
      scriptContent: 'code',
      manifest: { strategyId: 'strategy-1', version: '1.0.0', name: 'Strategy', author: 'Test', description: 'Test', requiredTimeframe: '1m', featureDeps: [], dataDeps: [], defaultParameters: {} },
    },
    execution: { initialCapital: '10000' },
    risk: { rules: [] },
  };
  
  const result = validateConfig(invalidConfig);
  
  assert(result.valid === false, 'Config should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(
    result.errors.some(err => err.path === 'sessionId'),
    'Should have sessionId error'
  );
});

test('验证非法初始资金 - 应该失败', () => {
  const invalidConfig: BacktestSessionConfig = {
    sessionId: 'test',
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: '/data',
        symbols: ['BTC/USDT'],
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-31T23:59:59Z' },
      },
      timeframe: { primary: '1m' },
    },
    strategy: {
      strategyId: 'strategy-1',
      scriptContent: 'code',
      manifest: { strategyId: 'strategy-1', version: '1.0.0', name: 'Strategy', author: 'Test', description: 'Test', requiredTimeframe: '1m', featureDeps: [], dataDeps: [], defaultParameters: {} },
    },
    execution: {
      initialCapital: '-1000', // 负数
    },
    risk: { rules: [] },
  };
  
  const result = validateConfig(invalidConfig);
  
  assert(result.valid === false, 'Config should be invalid');
  assert(
    result.errors.some(err => err.path === 'execution.initialCapital'),
    'Should have initial capital error'
  );
});

test('验证时间范围 - 开始时间晚于结束时间', () => {
  const invalidConfig: BacktestSessionConfig = {
    sessionId: 'test',
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: '/data',
        symbols: ['BTC/USDT'],
        timeRange: {
          start: '2024-01-31T23:59:59Z', // 晚于结束时间
          end: '2024-01-01T00:00:00Z',
        },
      },
      timeframe: { primary: '1m' },
    },
    strategy: {
      strategyId: 'strategy-1',
      scriptContent: 'code',
      manifest: { strategyId: 'strategy-1', version: '1.0.0', name: 'Strategy', author: 'Test', description: 'Test', requiredTimeframe: '1m', featureDeps: [], dataDeps: [], defaultParameters: {} },
    },
    execution: { initialCapital: '10000' },
    risk: { rules: [] },
  };
  
  const result = validateConfig(invalidConfig);
  
  assert(result.valid === false, 'Config should be invalid');
  assert(
    result.errors.some(err => err.path === 'data.source.timeRange'),
    'Should have time range error'
  );
});

test('验证时间框架格式 - 非法格式', () => {
  const invalidConfig: BacktestSessionConfig = {
    sessionId: 'test',
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: '/data',
        symbols: ['BTC/USDT'],
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-31T23:59:59Z' },
      },
      timeframe: {
        primary: 'invalid', // 非法格式
      },
    },
    strategy: {
      strategyId: 'strategy-1',
      scriptContent: 'code',
      manifest: { strategyId: 'strategy-1', version: '1.0.0', name: 'Strategy', author: 'Test', description: 'Test', requiredTimeframe: '1m', featureDeps: [], dataDeps: [], defaultParameters: {} },
    },
    execution: { initialCapital: '10000' },
    risk: { rules: [] },
  };
  
  const result = validateConfig(invalidConfig);
  
  assert(result.valid === false, 'Config should be invalid');
  assert(
    result.errors.some(err => err.path === 'data.timeframe.primary'),
    'Should have timeframe error'
  );
});

test('验证风控规则 - 重复规则ID', () => {
  const invalidConfig: BacktestSessionConfig = {
    sessionId: 'test',
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: '/data',
        symbols: ['BTC/USDT'],
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-31T23:59:59Z' },
      },
      timeframe: { primary: '1m' },
    },
    strategy: {
      strategyId: 'strategy-1',
      scriptContent: 'code',
      manifest: { strategyId: 'strategy-1', version: '1.0.0', name: 'Strategy', author: 'Test', description: 'Test', requiredTimeframe: '1m', featureDeps: [], dataDeps: [], defaultParameters: {} },
    },
    execution: { initialCapital: '10000' },
    risk: {
      rules: [
        { ruleId: 'rule-1', type: 'Rule1', enabled: true, priority: 10, params: {} },
        { ruleId: 'rule-1', type: 'Rule2', enabled: true, priority: 20, params: {} }, // 重复ID
      ],
    },
  };
  
  const result = validateConfig(invalidConfig);
  
  assert(result.valid === false, 'Config should be invalid');
  assert(
    result.errors.some(err => err.message.includes('Duplicate rule ID')),
    'Should have duplicate rule ID error'
  );
});

test('validateConfigOrThrow - 有效配置应该不抛出错误', () => {
  const validConfig: BacktestSessionConfig = {
    sessionId: 'test',
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: '/data',
        symbols: ['BTC/USDT'],
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-31T23:59:59Z' },
      },
      timeframe: { primary: '1m' },
    },
    strategy: {
      strategyId: 'strategy-1',
      scriptContent: 'code',
      manifest: { strategyId: 'strategy-1', version: '1.0.0', name: 'Strategy', author: 'Test', description: 'Test', requiredTimeframe: '1m', featureDeps: [], dataDeps: [], defaultParameters: {} },
    },
    execution: { initialCapital: '10000' },
    risk: { rules: [] },
  };
  
  try {
    validateConfigOrThrow(validConfig);
    assert(true, 'Should not throw');
  } catch (error) {
    assert(false, 'Should not throw error for valid config');
  }
});

test('validateConfigOrThrow - 无效配置应该抛出错误', () => {
  const invalidConfig: any = {
    sessionId: '',
    data: {},
    strategy: {},
    execution: {},
    risk: {},
  };
  
  let thrown = false;
  try {
    validateConfigOrThrow(invalidConfig);
  } catch (error) {
    thrown = true;
    assert(error instanceof Error, 'Should throw Error');
    assert(error.message.includes('validation failed'), 'Error message should mention validation');
  }
  
  assert(thrown, 'Should throw error for invalid config');
});

// ============================================================================
// 测试总结
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                   测试总结                                      ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log(`总测试数: ${testCount}`);
console.log(`✅ 通过: ${passCount}`);
console.log(`❌ 失败: ${failCount}`);
console.log(`成功率: ${((passCount / testCount) * 100).toFixed(1)}%\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 所有配置管理测试通过！\n');
  process.exit(0);
}

