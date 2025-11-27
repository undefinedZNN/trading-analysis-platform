/**
 * RabbitMQ 配置
 * 定义队列、交换机、路由键等配置
 */

export interface RabbitMQConfig {
  hostname: string;
  host?: string; // 别名
  port: number;
  username: string;
  password: string;
  vhost: string;
  exchange?: string;
  heartbeat?: number;
  connectionTimeout?: number;
  retryDelay?: number;
}

/**
 * 获取默认RabbitMQ配置
 */
export function getDefaultRabbitMQConfig(): RabbitMQConfig {
  const hostname = process.env.RABBITMQ_HOST || 'localhost';
  return {
    hostname,
    host: hostname, // 别名
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    username: process.env.RABBITMQ_USERNAME || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    vhost: process.env.RABBITMQ_VHOST || '/',
    exchange: 'backtest.exchange',
    heartbeat: 60,
    connectionTimeout: 10000,
    retryDelay: 5000,
  };
}

/**
 * RabbitMQ 队列名称常量
 */
export const RABBITMQ_QUEUES = {
  TASK_QUEUE: 'backtest.tasks',
  RESULT_QUEUE: 'backtest.results',
  STATUS_QUEUE: 'backtest.status',
  PROGRESS_QUEUE: 'backtest.progress',
  ERROR_QUEUE: 'backtest.errors',
  // 别名（向后兼容）
  TASK: 'backtest.tasks',
  STATUS: 'backtest.status',
  RESULT: 'backtest.results',
  PROGRESS: 'backtest.progress',
  ERROR: 'backtest.errors',
  LOG: 'backtest.logs',
  HEARTBEAT: 'backtest.heartbeat',
} as const;

/**
 * RabbitMQ 路由键常量
 */
export const RABBITMQ_ROUTING_KEYS = {
  TASK_CREATE: 'task.create',
  TASK_CANCEL: 'task.cancel',
  RESULT: 'result',
  STATUS_CHANGE: 'status.change',
  PROGRESS: 'progress',
  ERROR: 'error',
} as const;

/**
 * RabbitMQ 交换机名称
 */
export const RABBITMQ_EXCHANGES = {
  BACKTEST: 'backtest.exchange',
} as const;

/**
 * 队列配置选项
 */
export const QUEUE_OPTIONS: Record<string, any> = {
  [RABBITMQ_QUEUES.TASK_QUEUE]: {
    durable: true,
    // 移除x-message-ttl参数，避免与Worker队列参数冲突
    // arguments: {
    //   'x-message-ttl': 3600000, // 1小时
    // },
  },
  [RABBITMQ_QUEUES.RESULT_QUEUE]: {
    durable: true,
  },
  [RABBITMQ_QUEUES.STATUS_QUEUE]: {
    durable: true,
  },
  [RABBITMQ_QUEUES.PROGRESS_QUEUE]: {
    durable: false, // 进度消息不需要持久化
  },
  [RABBITMQ_QUEUES.ERROR_QUEUE]: {
    durable: true,
  },
  [RABBITMQ_QUEUES.LOG]: {
    durable: true,
  },
  [RABBITMQ_QUEUES.HEARTBEAT]: {
    durable: false,
  },
};

/**
 * 队列绑定配置
 */
export const QUEUE_BINDINGS = [
  {
    queue: RABBITMQ_QUEUES.TASK_QUEUE,
    exchange: RABBITMQ_EXCHANGES.BACKTEST,
    routingKey: 'task.*',
  },
  {
    queue: RABBITMQ_QUEUES.RESULT_QUEUE,
    exchange: RABBITMQ_EXCHANGES.BACKTEST,
    routingKey: 'result.*',  // 使用通配符匹配result.complete等
  },
  {
    queue: RABBITMQ_QUEUES.STATUS_QUEUE,
    exchange: RABBITMQ_EXCHANGES.BACKTEST,
    routingKey: RABBITMQ_ROUTING_KEYS.STATUS_CHANGE,
  },
  {
    queue: RABBITMQ_QUEUES.PROGRESS_QUEUE,
    exchange: RABBITMQ_EXCHANGES.BACKTEST,
    routingKey: RABBITMQ_ROUTING_KEYS.PROGRESS,
  },
  {
    queue: RABBITMQ_QUEUES.ERROR_QUEUE,
    exchange: RABBITMQ_EXCHANGES.BACKTEST,
    routingKey: RABBITMQ_ROUTING_KEYS.ERROR,
  },
] as const;

