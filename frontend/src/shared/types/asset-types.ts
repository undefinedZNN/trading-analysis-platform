/**
 * 资产类型和佣金配置类型定义
 * 
 * 与后端 backend/src/backtesting/types/asset-types.ts 保持一致
 */

/**
 * 资产类型
 */
export const AssetType = {
  Stock: 'stock',        // 股票
  Futures: 'futures',    // 期货
  Crypto: 'crypto',      // 加密货币
  Forex: 'forex',        // 外汇
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

/**
 * 佣金类型
 */
export const CommissionType = {
  Percentage: 'percentage',    // 百分比佣金
  Fixed: 'fixed',             // 固定佣金
  MakerTaker: 'maker-taker',  // Maker/Taker 差异化费率
  Tiered: 'tiered',           // 阶梯佣金（暂不实现）
} as const;

export type CommissionType = (typeof CommissionType)[keyof typeof CommissionType];

/**
 * 合约规格配置
 */
export interface ContractSpecs {
  /** 合约乘数 (期货) */
  multiplier?: number;
  /** 保证金比例 (期货) */
  marginRatio?: number;
  /** 最小交易单位 (股票) */
  lotSize?: number;
  /** 最小变动价位 (期货) */
  tickSize?: number;
}

/**
 * 佣金配置
 */
export interface CommissionConfig {
  /** 佣金类型 */
  type: CommissionType;
  /** 百分比费率 (type为percentage或maker-taker时) */
  rate?: number;
  /** 固定金额 (type为fixed时) */
  amount?: number;
  /** Maker费率 (type为maker-taker时) */
  makerRate?: number;
  /** Taker费率 (type为maker-taker时) */
  takerRate?: number;
  /** 最低佣金 (可选) */
  minCommission?: number;
  /** 印花税率 (股票，可选) */
  stampDuty?: number;
}

/**
 * 资产类型选项（用于下拉框）
 */
export const ASSET_TYPE_OPTIONS = [
  { value: AssetType.Stock, label: '股票' },
  { value: AssetType.Futures, label: '期货' },
  { value: AssetType.Crypto, label: '加密货币' },
  { value: AssetType.Forex, label: '外汇' },
];

/**
 * 资产类型标签映射
 */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  [AssetType.Stock]: '股票',
  [AssetType.Futures]: '期货',
  [AssetType.Crypto]: '加密货币',
  [AssetType.Forex]: '外汇',
};

/**
 * 佣金类型选项（用于下拉框）
 */
export const COMMISSION_TYPE_OPTIONS = [
  { value: CommissionType.Percentage, label: '百分比佣金' },
  { value: CommissionType.Fixed, label: '固定佣金' },
  { value: CommissionType.MakerTaker, label: 'Maker/Taker' },
  // { value: CommissionType.Tiered, label: '阶梯佣金', disabled: true },
];

/**
 * 佣金类型标签映射
 */
export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  [CommissionType.Percentage]: '百分比佣金',
  [CommissionType.Fixed]: '固定佣金',
  [CommissionType.MakerTaker]: 'Maker/Taker',
  [CommissionType.Tiered]: '阶梯佣金',
};

