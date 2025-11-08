/**
 * 服务 Token 定义
 * 
 * 定义回测框架中所有服务的唯一标识符
 * 
 * @module orchestrator/container/tokens
 */

// ============================================================================
// 服务 Token 常量
// ============================================================================

/**
 * 服务 Token 命名空间
 */
export const ServiceTokens = {
  // -------------------------------------------------------------------------
  // M1: 数据与事件总线
  // -------------------------------------------------------------------------
  
  /** 数据提供者 */
  DataProvider: 'backtesting.data.provider',
  
  /** 时间框架适配器 */
  TimeframeAdapter: 'backtesting.data.timeframe-adapter',
  
  /** 特征注册表 */
  FeatureRegistry: 'backtesting.features.registry',
  
  /** 事件总线 */
  EventBus: 'backtesting.events.bus',
  
  /** 事件存储 */
  EventStore: 'backtesting.events.store',
  
  /** 控制事件处理器 */
  ControlEventHandler: 'backtesting.events.control-handler',
  
  /** 死信队列 */
  DeadLetterQueue: 'backtesting.events.dead-letter-queue',
  
  // -------------------------------------------------------------------------
  // M2: 策略/风控/执行
  // -------------------------------------------------------------------------
  
  /** 策略沙箱 */
  StrategySandbox: 'backtesting.strategy.sandbox',
  
  /** 风控引擎 */
  RiskEngine: 'backtesting.risk.engine',
  
  /** 执行引擎 */
  ExecutionEngine: 'backtesting.execution.engine',
  
  /** 账簿服务 */
  LedgerService: 'backtesting.ledger.service',
  
  /** 投资组合存储 */
  PortfolioStore: 'backtesting.execution.portfolio-store',
  
  // -------------------------------------------------------------------------
  // M3: 编排与快照
  // -------------------------------------------------------------------------
  
  /** 编排器 */
  Orchestrator: 'backtesting.orchestrator',
  
  /** 服务容器 */
  ServiceContainer: 'backtesting.container',
  
  /** 快照管理器 */
  SnapshotManager: 'backtesting.snapshot.manager',
  
  /** 分析服务 */
  AnalyticsService: 'backtesting.analytics.service',
  
  // -------------------------------------------------------------------------
  // 配置
  // -------------------------------------------------------------------------
  
  /** 会话配置 */
  SessionConfig: 'backtesting.config.session',
  
  /** 数据配置 */
  DataConfig: 'backtesting.config.data',
  
  /** 策略配置 */
  StrategyConfig: 'backtesting.config.strategy',
  
  /** 执行配置 */
  ExecutionConfig: 'backtesting.config.execution',
  
  /** 风控配置 */
  RiskConfig: 'backtesting.config.risk',
  
  // -------------------------------------------------------------------------
  // 工具与辅助
  // -------------------------------------------------------------------------
  
  /** 日志服务 */
  Logger: 'backtesting.logger',
  
  /** 指标收集器 */
  MetricsCollector: 'backtesting.metrics.collector',
  
  /** 时钟服务（用于回测时间控制） */
  Clock: 'backtesting.clock',
} as const;

/**
 * 服务 Token 类型
 */
export type ServiceToken = typeof ServiceTokens[keyof typeof ServiceTokens];

// ============================================================================
// Token 工具函数
// ============================================================================

/**
 * 验证 token 是否有效
 * 
 * @param token 服务 token
 * @returns 是否有效
 */
export function isValidToken(token: string): token is ServiceToken {
  return Object.values(ServiceTokens).includes(token as ServiceToken);
}

/**
 * 获取所有服务 token
 * 
 * @returns 服务 token 列表
 */
export function getAllTokens(): ServiceToken[] {
  return Object.values(ServiceTokens);
}

/**
 * 根据前缀获取 token
 * 
 * @param prefix token 前缀
 * @returns 匹配的 token 列表
 */
export function getTokensByPrefix(prefix: string): ServiceToken[] {
  return getAllTokens().filter(token => token.startsWith(prefix));
}

/**
 * 获取 M1 模块的所有 token
 */
export function getM1Tokens(): ServiceToken[] {
  return [
    ServiceTokens.DataProvider,
    ServiceTokens.TimeframeAdapter,
    ServiceTokens.FeatureRegistry,
    ServiceTokens.EventBus,
    ServiceTokens.EventStore,
    ServiceTokens.ControlEventHandler,
    ServiceTokens.DeadLetterQueue,
  ];
}

/**
 * 获取 M2 模块的所有 token
 */
export function getM2Tokens(): ServiceToken[] {
  return [
    ServiceTokens.StrategySandbox,
    ServiceTokens.RiskEngine,
    ServiceTokens.ExecutionEngine,
    ServiceTokens.LedgerService,
    ServiceTokens.PortfolioStore,
  ];
}

/**
 * 获取 M3 模块的所有 token
 */
export function getM3Tokens(): ServiceToken[] {
  return [
    ServiceTokens.Orchestrator,
    ServiceTokens.ServiceContainer,
    ServiceTokens.SnapshotManager,
    ServiceTokens.AnalyticsService,
  ];
}

/**
 * 获取配置相关的所有 token
 */
export function getConfigTokens(): ServiceToken[] {
  return [
    ServiceTokens.SessionConfig,
    ServiceTokens.DataConfig,
    ServiceTokens.StrategyConfig,
    ServiceTokens.ExecutionConfig,
    ServiceTokens.RiskConfig,
  ];
}

