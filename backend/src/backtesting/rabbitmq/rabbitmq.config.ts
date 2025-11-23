/**
 * RabbitMQ 配置
 */
export interface RabbitMQConfig {
  host: string;
  port: number;
  vhost: string;
  username: string;
  password: string;
  exchange: string;
  heartbeat: number;
  connectionTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * RabbitMQ 队列名称常量
 */
export const RABBITMQ_QUEUES = {
  // Backend → Worker
  TASK: 'backtest.task',
  TASK_CANCEL: 'backtest.task.cancel',
  
  // Worker → Backend
  PROGRESS: 'backtest.progress',
  STATUS: 'backtest.status',
  RESULT: 'backtest.result',
  ERROR: 'backtest.error',
  LOG: 'backtest.log',
  HEARTBEAT: 'worker.heartbeat',
} as const;

/**
 * RabbitMQ 路由键
 */
export const RABBITMQ_ROUTING_KEYS = {
  TASK_CREATE: 'task.create',
  TASK_CANCEL: 'task.cancel',
  PROGRESS_UPDATE: 'progress.update',
  STATUS_CHANGE: 'status.change',
  RESULT_COMPLETE: 'result.complete',
  ERROR_REPORT: 'error.report',
  LOG_MESSAGE: 'log.message',
  WORKER_HEARTBEAT: 'worker.heartbeat',
} as const;

/**
 * 获取默认RabbitMQ配置
 */
export function getDefaultRabbitMQConfig(): RabbitMQConfig {
  return {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    vhost: process.env.RABBITMQ_VHOST || '/backtest',
    username: process.env.RABBITMQ_USERNAME || 'dev',
    password: process.env.RABBITMQ_PASSWORD || 'devpass',
    exchange: process.env.RABBITMQ_EXCHANGE || 'backtest',
    heartbeat: parseInt(process.env.RABBITMQ_HEARTBEAT || '600', 10),
    connectionTimeout: parseInt(process.env.RABBITMQ_CONNECTION_TIMEOUT || '10000', 10),
    maxRetries: parseInt(process.env.RABBITMQ_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.RABBITMQ_RETRY_DELAY || '1000', 10),
  };
}

/**
 * 队列配置选项
 */
export const QUEUE_OPTIONS = {
  [RABBITMQ_QUEUES.TASK]: {
    durable: true,
    arguments: {
      'x-max-priority': 10,
      'x-message-ttl': 3600000, // 1小时
    },
  },
  [RABBITMQ_QUEUES.TASK_CANCEL]: {
    durable: true,
  },
  [RABBITMQ_QUEUES.PROGRESS]: {
    durable: false,
    autoDelete: true,
    arguments: {
      'x-message-ttl': 60000, // 1分钟
    },
  },
  [RABBITMQ_QUEUES.STATUS]: {
    durable: true,
  },
  [RABBITMQ_QUEUES.RESULT]: {
    durable: true,
  },
  [RABBITMQ_QUEUES.ERROR]: {
    durable: true,
  },
  [RABBITMQ_QUEUES.LOG]: {
    durable: false,
    autoDelete: true,
    arguments: {
      'x-message-ttl': 300000, // 5分钟
    },
  },
  [RABBITMQ_QUEUES.HEARTBEAT]: {
    durable: false,
    autoDelete: true,
    arguments: {
      'x-message-ttl': 120000, // 2分钟
    },
  },
} as const;

