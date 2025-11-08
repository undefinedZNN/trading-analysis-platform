/**
 * 默认配置
 * 
 * 提供回测会话的默认配置值
 * 
 * @module orchestrator/config/defaults
 */

import type {
  DataConfig,
  ExecutionConfig,
  RiskConfig,
  AnalyticsConfig,
  OutputConfig,
  LogConfig,
  MatchingConfig,
  SlippageConfig,
  FeeConfig,
} from '../interfaces/config';

// ============================================================================
// 数据默认配置
// ============================================================================

/**
 * 数据默认配置
 */
export const DEFAULT_DATA_CONFIG: Partial<DataConfig> = {
  source: {
    provider: 'parquet-duckdb',
    path: '',
    symbols: [],
    timeRange: {
      start: '',
      end: '',
    },
    gapPolicy: 'forward-fill',
  },
  timeframe: {
    primary: '1m',
    auxiliary: [],
  },
};

// ============================================================================
// 执行默认配置
// ============================================================================

/**
 * 撮合默认配置
 */
export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  marketFillPolicy: 'close',
  limitFillPolicy: 'limit-price',
};

/**
 * 滑点默认配置
 */
export const DEFAULT_SLIPPAGE_CONFIG: SlippageConfig = {
  model: 'zero',
  params: {},
};

/**
 * 手续费默认配置
 */
export const DEFAULT_FEE_CONFIG: FeeConfig = {
  model: 'zero',
  params: {},
};

/**
 * 执行默认配置
 */
export const DEFAULT_EXECUTION_CONFIG: Partial<ExecutionConfig> = {
  initialCapital: '10000',
  matching: DEFAULT_MATCHING_CONFIG,
  slippage: DEFAULT_SLIPPAGE_CONFIG,
  fee: DEFAULT_FEE_CONFIG,
};

// ============================================================================
// 风控默认配置
// ============================================================================

/**
 * 风控默认配置
 */
export const DEFAULT_RISK_CONFIG: RiskConfig = {
  rules: [],
  logLevel: 'info',
};

// ============================================================================
// 分析默认配置
// ============================================================================

/**
 * 分析默认配置
 */
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  realtime: false,
  metrics: [
    'total_pnl',
    'win_rate',
    'sharpe_ratio',
    'max_drawdown',
  ],
  generateReport: true,
};

// ============================================================================
// 输出默认配置
// ============================================================================

/**
 * 输出默认配置
 */
export const DEFAULT_OUTPUT_CONFIG: OutputConfig = {
  directory: './backtest-results',
  formats: ['json', 'csv'],
  compress: false,
  includeFeatures: true,
};

// ============================================================================
// 日志默认配置
// ============================================================================

/**
 * 日志默认配置
 */
export const DEFAULT_LOG_CONFIG: LogConfig = {
  level: 'info',
  console: true,
};

// ============================================================================
// 常见风控规则配置模板
// ============================================================================

/**
 * 最大订单规模规则默认配置
 */
export const DEFAULT_MAX_ORDER_SIZE_RULE = {
  ruleId: 'max-order-size',
  type: 'MaxOrderSizeRule',
  enabled: true,
  priority: 10,
  params: {
    maxQuantity: '100',
  },
};

/**
 * 最大杠杆率规则默认配置
 */
export const DEFAULT_MAX_LEVERAGE_RULE = {
  ruleId: 'max-leverage',
  type: 'MaxLeverageRule',
  enabled: true,
  priority: 20,
  params: {
    maxLeverage: '3',
  },
};

/**
 * 日内盈亏限制规则默认配置
 */
export const DEFAULT_PNL_DAILY_LIMIT_RULE = {
  ruleId: 'pnl-daily-limit',
  type: 'PnLDailyLimitRule',
  enabled: false,
  priority: 30,
  params: {
    maxLoss: '1000',
    maxProfit: '5000',
  },
};

/**
 * 止损规则默认配置
 */
export const DEFAULT_STOP_LOSS_RULE = {
  ruleId: 'stop-loss',
  type: 'StopLossRule',
  enabled: false,
  priority: 40,
  params: {
    maxDrawdown: '2000',
    maxDrawdownPct: 0.2,
    forceClose: true,
  },
};

/**
 * 默认风控规则集
 */
export const DEFAULT_RISK_RULES = [
  DEFAULT_MAX_ORDER_SIZE_RULE,
  DEFAULT_MAX_LEVERAGE_RULE,
];

// ============================================================================
// 滑点模型配置模板
// ============================================================================

/**
 * 固定点差滑点配置
 */
export const FIXED_SPREAD_SLIPPAGE = (spreadBps: number): SlippageConfig => ({
  model: 'fixed-spread',
  params: {
    spreadBps,
  },
});

/**
 * 比例滑点配置
 */
export const PROPORTIONAL_SLIPPAGE = (basisPoints: number): SlippageConfig => ({
  model: 'proportional',
  params: {
    basisPoints,
  },
});

/**
 * 市场冲击滑点配置
 */
export const MARKET_IMPACT_SLIPPAGE = (
  liquidityFactor: number,
  impactCoefficient: number
): SlippageConfig => ({
  model: 'market-impact',
  params: {
    liquidityFactor,
    impactCoefficient,
  },
});

// ============================================================================
// 手续费模型配置模板
// ============================================================================

/**
 * 固定费率配置
 */
export const FIXED_RATE_FEE = (
  takerRate: string,
  makerRate: string
): FeeConfig => ({
  model: 'fixed-rate',
  params: {
    takerRate,
    makerRate,
  },
});

/**
 * 分级费率配置
 */
export const TIERED_FEE = (
  tiers: Array<{ volume: string; takerRate: string; makerRate: string }>
): FeeConfig => ({
  model: 'tiered',
  params: {
    tiers,
  },
});

// ============================================================================
// 常见交易所配置模板
// ============================================================================

/**
 * Binance 配置模板
 */
export const BINANCE_CONFIG = {
  slippage: FIXED_SPREAD_SLIPPAGE(1), // 1 bps
  fee: FIXED_RATE_FEE('0.001', '0.001'), // 0.1% taker/maker
};

/**
 * OKX 配置模板
 */
export const OKX_CONFIG = {
  slippage: FIXED_SPREAD_SLIPPAGE(1),
  fee: FIXED_RATE_FEE('0.0008', '0.0008'), // 0.08% taker/maker
};

/**
 * Bybit 配置模板
 */
export const BYBIT_CONFIG = {
  slippage: FIXED_SPREAD_SLIPPAGE(1),
  fee: FIXED_RATE_FEE('0.001', '0.001'), // 0.1% taker/maker
};

