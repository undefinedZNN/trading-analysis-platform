import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 过滤条件接口
 * 用于存储因子过滤、时间过滤等条件
 */
export interface FilterConditions {
  /**
   * 因子过滤条件
   * 例如: { "entry_rsi": { "min": 70, "max": 100 } }
   */
  factors?: {
    [factorName: string]: {
      min?: number;
      max?: number;
      equals?: any;
      in?: any[];
    };
  };

  /**
   * 时间范围过滤
   * 例如: { "start_hour": 14, "end_hour": 16, "weekdays": [1,2,3,4,5] }
   */
  time_range?: {
    start_hour?: number;
    end_hour?: number;
    weekdays?: number[]; // 0=周日, 1=周一, ..., 6=周六
  };

  /**
   * 交易方向过滤
   */
  trade_direction?: 'long' | 'short' | 'both';

  /**
   * 持仓时间过滤
   */
  min_holding_bars?: number;
  max_holding_bars?: number;

  /**
   * 盈亏过滤
   */
  min_pnl?: number;
  max_pnl?: number;

  /**
   * 其他自定义过滤条件
   */
  [key: string]: any;
}

/**
 * 详细指标接口
 * 存储额外的分析指标和统计数据
 */
export interface DetailedMetrics {
  /**
   * 月度收益率
   */
  monthly_returns?: number[];

  /**
   * 最佳交易
   */
  best_trade?: {
    pnl: number;
    pnl_percent: number;
    date: string;
    holding_bars: number;
    [key: string]: any;
  };

  /**
   * 最差交易
   */
  worst_trade?: {
    pnl: number;
    pnl_percent: number;
    date: string;
    holding_bars: number;
    [key: string]: any;
  };

  /**
   * 连续盈利次数（最多）
   */
  consecutive_wins?: number;

  /**
   * 连续亏损次数（最多）
   */
  consecutive_losses?: number;

  /**
   * 平均盈利金额
   */
  avg_win?: number;

  /**
   * 平均亏损金额
   */
  avg_loss?: number;

  /**
   * 因子统计分析
   */
  factor_stats?: {
    [factorName: string]: {
      mean?: number;
      median?: number;
      std?: number;
      min?: number;
      max?: number;
      distribution?: any;
    };
  };

  /**
   * 其他自定义指标
   */
  [key: string]: any;
}

/**
 * 回测结果实体
 * 
 * 存储回测的统计分析结果
 * 一个回测任务可以有多个结果记录：
 * - 1个主结果（is_primary=true）：回测完成时自动生成，基于全量数据
 * - N个派生结果（is_primary=false）：用户设置因子过滤后生成
 */
@Entity({ name: 'backtest_results' })
@Index('idx_backtest_results_task', ['taskId'])
@Index('idx_backtest_results_task_primary', ['taskId', 'isPrimary'])
@Index('idx_backtest_results_created', ['createdAt'])
@Index('idx_backtest_results_return', ['totalReturnPct'])
@Index('idx_backtest_results_sharpe', ['sharpeRatio'])
export class BacktestResultEntity {
  // ============================================
  // 基础标识信息
  // ============================================

  /**
   * 结果唯一标识 (UUID)
   */
  @PrimaryGeneratedColumn('uuid', { name: 'result_id' })
  resultId!: string;

  /**
   * 关联的任务ID (UUID)
   */
  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  /**
   * 结果名称
   * 例如: "全量数据", "RSI>70过滤", "下午交易"
   */
  @Column({ name: 'result_name', type: 'varchar', length: 100 })
  resultName!: string;

  /**
   * 结果描述（可选）
   */
  @Column({ name: 'result_description', type: 'text', nullable: true })
  resultDescription?: string | null;

  /**
   * 是否为主结果
   * true: 回测完成时自动生成的全量数据结果
   * false: 用户设置过滤条件后生成的派生结果
   */
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  // ============================================
  // 过滤条件（支持后续因子筛选）
  // ============================================

  /**
   * 过滤条件 (JSONB)
   * 主结果为 null
   * 派生结果存储具体的过滤条件
   */
  @Column({ name: 'filter_conditions', type: 'jsonb', nullable: true })
  filterConditions?: FilterConditions | null;

  /**
   * 过滤后的交易数量
   * 应用过滤条件后剩余的交易笔数
   */
  @Column({ name: 'trades_count_filtered', type: 'integer' })
  tradesCountFiltered!: number;

  /**
   * 原始总交易数量
   * Parquet 文件中的总交易笔数
   */
  @Column({ name: 'trades_count_total', type: 'integer' })
  tradesCountTotal!: number;

  // ============================================
  // 资金信息
  // ============================================

  /**
   * 初始资金
   */
  @Column({ name: 'initial_cash', type: 'decimal', precision: 15, scale: 2 })
  initialCash!: number;

  /**
   * 最终权益
   */
  @Column({ name: 'final_value', type: 'decimal', precision: 15, scale: 2 })
  finalValue!: number;

  /**
   * 总盈亏
   */
  @Column({ name: 'total_pnl', type: 'decimal', precision: 15, scale: 2 })
  totalPnl!: number;

  // ============================================
  // 收益指标
  // ============================================

  /**
   * 总收益率（%）
   * 例如: 0.1523 表示 15.23%
   */
  @Column({ name: 'total_return_pct', type: 'decimal', precision: 10, scale: 4 })
  totalReturnPct!: number;

  /**
   * 年化收益率（%）
   */
  @Column({
    name: 'annualized_return_pct',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  annualizedReturnPct?: number | null;

  // ============================================
  // 交易统计
  // ============================================

  /**
   * 总交易笔数
   * 等于 trades_count_filtered
   */
  @Column({ name: 'total_trades', type: 'integer' })
  totalTrades!: number;

  /**
   * 盈利交易笔数
   */
  @Column({ name: 'winning_trades', type: 'integer' })
  winningTrades!: number;

  /**
   * 亏损交易笔数
   */
  @Column({ name: 'losing_trades', type: 'integer' })
  losingTrades!: number;

  /**
   * 胜率
   * 例如: 0.544 表示 54.4%
   */
  @Column({ name: 'win_rate', type: 'decimal', precision: 5, scale: 4 })
  winRate!: number;

  /**
   * 平均每笔盈亏
   */
  @Column({
    name: 'avg_profit_per_trade',
    type: 'decimal',
    precision: 15,
    scale: 2,
  })
  avgProfitPerTrade!: number;

  /**
   * 盈亏比（Profit Factor）
   * 总盈利 / 总亏损
   */
  @Column({
    name: 'profit_factor',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  profitFactor?: number | null;

  /**
   * 期望值
   * 每笔交易的预期盈亏
   */
  @Column({
    name: 'expectancy',
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  expectancy?: number | null;

  // ============================================
  // 风险指标
  // ============================================

  /**
   * 夏普比率
   * 风险调整后收益
   */
  @Column({
    name: 'sharpe_ratio',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  sharpeRatio?: number | null;

  /**
   * 索提诺比率（Sortino Ratio）
   * 考虑下行风险的收益比率
   */
  @Column({
    name: 'sortino_ratio',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  sortinoRatio?: number | null;

  /**
   * 卡玛比率（Calmar Ratio）
   * 年化收益率 / 最大回撤
   */
  @Column({
    name: 'calmar_ratio',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  calmarRatio?: number | null;

  /**
   * 最大回撤百分比（%）
   * 例如: 0.185 表示 18.5%
   */
  @Column({
    name: 'max_drawdown_pct',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  maxDrawdownPct?: number | null;

  /**
   * 最大回撤金额
   */
  @Column({
    name: 'max_drawdown_value',
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  maxDrawdownValue?: number | null;

  /**
   * 年化波动率（%）
   */
  @Column({
    name: 'annualized_volatility_pct',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  annualizedVolatilityPct?: number | null;

  // ============================================
  // 持仓统计
  // ============================================

  /**
   * 平均持仓K线数
   */
  @Column({ name: 'avg_holding_bars', type: 'integer', nullable: true })
  avgHoldingBars?: number | null;

  /**
   * 最大持仓K线数
   */
  @Column({ name: 'max_holding_bars', type: 'integer', nullable: true })
  maxHoldingBars?: number | null;

  /**
   * 最小持仓K线数
   */
  @Column({ name: 'min_holding_bars', type: 'integer', nullable: true })
  minHoldingBars?: number | null;

  // ============================================
  // 扩展数据
  // ============================================

  /**
   * 详细指标 (JSONB)
   * 存储其他分析指标，如月度收益、最佳/最差交易、因子统计等
   */
  @Column({ name: 'detailed_metrics', type: 'jsonb', nullable: true })
  detailedMetrics?: DetailedMetrics | null;

  // ============================================
  // 计算元数据
  // ============================================

  /**
   * 计算耗时（毫秒）
   */
  @Column({ name: 'calculation_time_ms', type: 'integer', nullable: true })
  calculationTimeMs?: number | null;

  /**
   * 数据来源
   * parquet: 从 Parquet 文件计算
   * cache: 从缓存计算
   * database: 从数据库计算
   */
  @Column({
    name: 'data_source',
    type: 'varchar',
    length: 50,
    default: 'parquet',
  })
  dataSource!: string;

  // ============================================
  // 时间戳
  // ============================================

  /**
   * 记录创建时间 (UTC时区)
   */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * 记录更新时间 (UTC时区)
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * 创建者
   */
  @Column({ name: 'created_by', type: 'varchar', length: 64, nullable: true })
  createdBy?: string | null;
}

