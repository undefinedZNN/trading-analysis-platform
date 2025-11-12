/**
 * 回测框架压力测试脚本
 *
 * 通过批量创建/启动/停止会话来验证 Orchestrator 在高并发下的稳定性
 *
 * 运行方式：
 *   npx ts-node src/backtesting/orchestrator/examples/stress-test.ts
 *
 * 可选环境变量：
 *   STRESS_SESSIONS=50          // 会话总数
 *   STRESS_CONCURRENCY=5        // 并发会话数
 *   STRESS_RUN_MS=2000          // 每个会话运行多久（毫秒）
 *   STRESS_DATA_PATH=/data/btc  // 数据目录
 *   STRESS_SYMBOL=BTCUSDT       // 交易对
 */

import { performance } from 'perf_hooks';
import {
  createModuleCoordinator,
  createOrchestrator,
  type BacktestSessionConfig,
} from '../index';

interface StressOptions {
  totalSessions: number;
  concurrency: number;
  runDurationMs: number;
  dataPath: string;
  symbol: string;
}

interface SessionStats {
  sessionId: string;
  durationMs: number;
  processedEvents: number;
}

const DEFAULT_OPTIONS: StressOptions = {
  totalSessions: Number(process.env.STRESS_SESSIONS ?? 20),
  concurrency: Number(process.env.STRESS_CONCURRENCY ?? 4),
  runDurationMs: Number(process.env.STRESS_RUN_MS ?? 1000),
  dataPath: process.env.STRESS_DATA_PATH ?? '/data/crypto',
  symbol: process.env.STRESS_SYMBOL ?? 'BTCUSDT',
};

function createStrategyConfig(symbol: string, idx: number): BacktestSessionConfig['strategy'] {
  const fast = 5 + (idx % 5);
  const slow = fast + 10;
  return {
    strategyId: `ma-crossover-${idx}`,
    name: 'MA Crossover Stress Strategy',
    scriptContent: '// placeholder strategy script',
    manifest: {
      strategyId: `ma-crossover-${idx}`,
      name: 'MA Crossover Stress Strategy',
      version: '1.0.0',
      description: 'Stress test strategy manifest',
      author: 'stress-runner',
      requiredTimeframe: '1h',
      featureDeps: [],
      dataDeps: [{ symbol }],
      defaultParameters: { fast, slow },
    },
    parameters: { fast, slow },
  };
}

function createConfig(options: StressOptions, sessionId: string, idx: number): BacktestSessionConfig {
  return {
    sessionId,
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: options.dataPath,
        symbols: [options.symbol],
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z',
        },
        gapPolicy: 'forward-fill',
      },
      timeframe: {
        primary: '1h',
      },
    },
    strategy: createStrategyConfig(options.symbol, idx),
    execution: {
      initialCapital: '100000',
      matching: { marketFillPolicy: 'close' },
      slippage: { model: 'zero' },
      fee: { model: 'zero' },
    },
    risk: {
      rules: [
        {
          ruleId: 'max-loss',
          type: 'max-loss',
          enabled: true,
          priority: 1,
          params: { maxDrawdown: 0.25 },
        },
      ],
    },
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSession(
  orchestrator: ReturnType<typeof createOrchestrator>,
  options: StressOptions,
  idx: number
): Promise<SessionStats> {
  const sessionId = `stress-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
  const config = createConfig(options, sessionId, idx);
  const start = performance.now();

  await orchestrator.createSession(config);
  await orchestrator.start(sessionId);
  await sleep(options.runDurationMs);
  await orchestrator.stop(sessionId);
  const results = await orchestrator.getResults(sessionId);
  await orchestrator.destroySession(sessionId);

  return {
    sessionId,
    durationMs: performance.now() - start,
    processedEvents: results.stats.processedEvents,
  };
}

async function main() {
  const options = DEFAULT_OPTIONS;
  console.log('🚀 启动回测压力测试');
  console.log(
    `   sessions=${options.totalSessions}, concurrency=${options.concurrency}, runMs=${options.runDurationMs}`
  );
  console.log(`   dataPath=${options.dataPath}, symbol=${options.symbol}`);

  const moduleCoordinator = createModuleCoordinator();
  const orchestrator = createOrchestrator(moduleCoordinator);

  const active = new Set<Promise<void>>();
  const stats: SessionStats[] = [];
  let failures = 0;

  const pushTask = (task: Promise<void>) => {
    active.add(task);
    task.finally(() => active.delete(task));
  };

  const schedule = async (idx: number) => {
    const promise = runSession(orchestrator, options, idx)
      .then((result) => {
        stats.push(result);
        console.log(
          `✅ [${result.sessionId}] completed in ${result.durationMs.toFixed(
            0
          )}ms, events=${result.processedEvents}`
        );
      })
      .catch((error) => {
        failures += 1;
        console.error(`❌ [session-${idx}] failed:`, error);
      });
    pushTask(promise);
    if (active.size >= options.concurrency) {
      await Promise.race(active);
    }
  };

  const totalStart = performance.now();
  for (let i = 0; i < options.totalSessions; i++) {
    await schedule(i);
  }
  await Promise.all(active);
  const totalDuration = performance.now() - totalStart;

  await orchestrator.destroyAll();

  const successCount = stats.length;
  const avgDuration = successCount
    ? stats.reduce((sum, s) => sum + s.durationMs, 0) / successCount
    : 0;

  console.log('\n📊 压力测试结果');
  console.log(`   总会话数:     ${options.totalSessions}`);
  console.log(`   成功会话数:   ${successCount}`);
  console.log(`   失败会话数:   ${failures}`);
  console.log(`   平均耗时(ms): ${avgDuration.toFixed(0)}`);
  console.log(`   总耗时(ms):   ${totalDuration.toFixed(0)}`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('压力测试过程中出现异常:', error);
    process.exit(1);
  });
}

export { main };
