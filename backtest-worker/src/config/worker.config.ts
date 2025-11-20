import { registerAs } from '@nestjs/config';
import { resolve } from 'path';

export default registerAs('worker', () => {
  const port = parseInt(process.env.WORKER_PORT || process.env.PORT || '3001', 10);
  const mainServiceBase = process.env.MAIN_SERVICE_URL || 'http://localhost:3000';
  const mainServiceApiBase =
    process.env.MAIN_SERVICE_API_BASE || `${mainServiceBase.replace(/\/+$/, '')}/api/v1`;

    console.log(`WORKER_DATA_STORAGE_PATH ==============================================:1 ${process.env.WORKER_DATA_STORAGE_PATH}`);
    console.log(`WORKER_DATA_STORAGE_PATH ==============================================:2`, process.env.WORKER_DATA_STORAGE_PATH || '../backend/storage/datasets',);
  return {
    identity: process.env.WORKER_ID || `worker-${process.pid}`,
    server: {
      port,
      host: process.env.WORKER_HOST || '0.0.0.0',
    },
    mainService: {
      url: process.env.MAIN_SERVICE_URL || 'http://localhost:3000',
      registerPath: '/api/v1/internal/workers/register',
      heartbeatPath: '/api/v1/internal/workers/heartbeat',
      deregisterPath: '/api/v1/internal/workers/deregister',
      enabled: process.env.WORKER_REGISTRATION_DISABLED !== 'true',
    },
    heartbeat: {
      intervalMs: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL || '10000', 10),
      timeoutMs: parseInt(process.env.WORKER_HEARTBEAT_TIMEOUT || '30000', 10),
    },
    capabilities: {
      maxConcurrentTasks: parseInt(process.env.WORKER_MAX_CONCURRENT || '1', 10),
      supportedStrategies: process.env.WORKER_STRATEGIES
        ? process.env.WORKER_STRATEGIES.split(',')
        : ['*'],
    },
    execution: {
      batchSize: parseInt(process.env.WORKER_EXECUTION_BATCH_SIZE || '20000', 10),
      fallbackTotalBars: parseInt(process.env.WORKER_EXECUTION_FALLBACK_BARS || '10000', 10),
      syntheticDrift: parseFloat(process.env.WORKER_EXECUTION_DRIFT || '0.0001'),
      simulatedDelayMs: parseInt(process.env.WORKER_EXECUTION_DELAY_MS || '0', 10),
    },
    memory: {
      maxUsageMB: parseInt(process.env.WORKER_MEMORY_MAX_MB || '512', 10),
      perBarMB: parseFloat(process.env.WORKER_MEMORY_PER_BAR || '0.0005'),
    },
    strategy: {
      fastWindow: parseInt(process.env.WORKER_STRATEGY_FAST_WINDOW || '5', 10),
      slowWindow: parseInt(process.env.WORKER_STRATEGY_SLOW_WINDOW || '20', 10),
      threshold: parseFloat(process.env.WORKER_STRATEGY_THRESHOLD || '0.001'),
      orderSize: process.env.WORKER_STRATEGY_ORDER_SIZE || '1',
    },
    data: {
      enableProvider: process.env.WORKER_DATA_ENABLE_PROVIDER !== 'false',
      storagePath: process.env.WORKER_DATA_STORAGE_PATH || '../backend/storage/datasets',
      defaultBatchSize: parseInt(process.env.WORKER_DATA_BATCH_SIZE || '10000', 10),
      maxConcurrent: parseInt(process.env.WORKER_DATA_MAX_CONCURRENT || '3', 10),
      gapPolicy: process.env.WORKER_DATA_GAP_POLICY || 'skip',
      fillMethod: process.env.WORKER_DATA_FILL_METHOD || 'forwardFill',
    },
    logging: {
      metrics: process.env.WORKER_LOG_METRICS === 'true',
    },
    results: {
      absoluteBasePath:
        process.env.BACKTEST_RESULTS_PATH ||
        resolve(process.cwd(), '../backend/storage/backtests'),
      relativeBasePath: process.env.BACKTEST_RESULTS_RELATIVE || 'backtests',
    },
    reporting: {
      progressUrl: (process.env.MAIN_SERVICE_PROGRESS_URL || mainServiceApiBase).replace(/\/+$/, ''),
      resultUrl: (process.env.MAIN_SERVICE_RESULT_URL || mainServiceApiBase).replace(/\/+$/, ''),
      authToken: process.env.MAIN_SERVICE_REPORT_TOKEN,
      enabled: process.env.MAIN_SERVICE_REPORTING_DISABLED !== 'true',
    },
  };
});
