import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * 创建 backtest_results 表
 * 
 * 用途：
 * 存储回测的统计分析结果
 * 一个回测任务可以有多个结果记录：
 * - 1个主结果（is_primary=true）：回测完成时自动生成，基于全量数据
 * - N个派生结果（is_primary=false）：用户设置因子过滤后生成
 * 
 * 核心字段：
 * - result_id: 结果唯一标识
 * - task_id: 关联的任务ID
 * - is_primary: 是否为主结果
 * - filter_conditions: 过滤条件（JSONB）
 * - 30+个统计指标字段
 */
export class CreateBacktestResults1732550003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建表
    await queryRunner.createTable(
      new Table({
        name: 'backtest_results',
        columns: [
          // ============================================
          // 基础标识信息
          // ============================================
          {
            name: 'result_id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'task_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'result_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'result_description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_primary',
            type: 'boolean',
            default: false,
            isNullable: false,
          },

          // ============================================
          // 过滤条件
          // ============================================
          {
            name: 'filter_conditions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'trades_count_filtered',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'trades_count_total',
            type: 'integer',
            isNullable: false,
          },

          // ============================================
          // 资金信息
          // ============================================
          {
            name: 'initial_cash',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'final_value',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'total_pnl',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },

          // ============================================
          // 收益指标
          // ============================================
          {
            name: 'total_return_pct',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'annualized_return_pct',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },

          // ============================================
          // 交易统计
          // ============================================
          {
            name: 'total_trades',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'winning_trades',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'losing_trades',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'win_rate',
            type: 'decimal',
            precision: 5,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'avg_profit_per_trade',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'profit_factor',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'expectancy',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
          },

          // ============================================
          // 风险指标
          // ============================================
          {
            name: 'sharpe_ratio',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'sortino_ratio',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'calmar_ratio',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'max_drawdown_pct',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'max_drawdown_value',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'annualized_volatility_pct',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },

          // ============================================
          // 持仓统计
          // ============================================
          {
            name: 'avg_holding_bars',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'max_holding_bars',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'min_holding_bars',
            type: 'integer',
            isNullable: true,
          },

          // ============================================
          // 扩展数据
          // ============================================
          {
            name: 'detailed_metrics',
            type: 'jsonb',
            isNullable: true,
          },

          // ============================================
          // 计算元数据
          // ============================================
          {
            name: 'calculation_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'data_source',
            type: 'varchar',
            length: '50',
            default: "'parquet'",
            isNullable: false,
          },

          // ============================================
          // 时间戳
          // ============================================
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'created_by',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
        ],
      }),
      true, // ifNotExists
    );

    // 创建索引
    await queryRunner.createIndex(
      'backtest_results',
      new TableIndex({
        name: 'idx_backtest_results_task',
        columnNames: ['task_id'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_results',
      new TableIndex({
        name: 'idx_backtest_results_task_primary',
        columnNames: ['task_id', 'is_primary'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_results',
      new TableIndex({
        name: 'idx_backtest_results_created',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_results',
      new TableIndex({
        name: 'idx_backtest_results_return',
        columnNames: ['total_return_pct'],
      }),
    );

    await queryRunner.createIndex(
      'backtest_results',
      new TableIndex({
        name: 'idx_backtest_results_sharpe',
        columnNames: ['sharpe_ratio'],
      }),
    );

    // 添加表注释
    await queryRunner.query(`
      COMMENT ON TABLE backtest_results IS '回测结果表：存储回测的统计分析结果。一个任务可以有多个结果（主结果+派生结果）';
    `);

    // 添加字段注释
    await queryRunner.query(`
      COMMENT ON COLUMN backtest_results.result_id IS '结果唯一标识 (UUID)';
      COMMENT ON COLUMN backtest_results.task_id IS '关联的任务ID';
      COMMENT ON COLUMN backtest_results.result_name IS '结果名称，例如: "全量数据", "RSI>70过滤"';
      COMMENT ON COLUMN backtest_results.is_primary IS '是否为主结果：true=回测完成时自动生成的全量结果，false=用户过滤后的派生结果';
      COMMENT ON COLUMN backtest_results.filter_conditions IS '过滤条件 (JSONB)：主结果为null，派生结果存储具体的因子过滤条件';
      COMMENT ON COLUMN backtest_results.trades_count_filtered IS '应用过滤条件后的交易数量';
      COMMENT ON COLUMN backtest_results.trades_count_total IS 'Parquet文件中的原始总交易数量';
      COMMENT ON COLUMN backtest_results.sharpe_ratio IS '夏普比率：风险调整后收益';
      COMMENT ON COLUMN backtest_results.sortino_ratio IS '索提诺比率：考虑下行风险的收益比率';
      COMMENT ON COLUMN backtest_results.calmar_ratio IS '卡玛比率：年化收益率/最大回撤';
      COMMENT ON COLUMN backtest_results.profit_factor IS '盈亏比：总盈利/总亏损';
      COMMENT ON COLUMN backtest_results.expectancy IS '期望值：每笔交易的预期盈亏';
      COMMENT ON COLUMN backtest_results.detailed_metrics IS '详细指标 (JSONB)：月度收益、最佳/最差交易、因子统计等';
      COMMENT ON COLUMN backtest_results.calculation_time_ms IS '计算耗时（毫秒）';
      COMMENT ON COLUMN backtest_results.data_source IS '数据来源：parquet/cache/database';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.dropIndex('backtest_results', 'idx_backtest_results_sharpe');
    await queryRunner.dropIndex('backtest_results', 'idx_backtest_results_return');
    await queryRunner.dropIndex('backtest_results', 'idx_backtest_results_created');
    await queryRunner.dropIndex('backtest_results', 'idx_backtest_results_task_primary');
    await queryRunner.dropIndex('backtest_results', 'idx_backtest_results_task');

    // 删除表
    await queryRunner.dropTable('backtest_results');
  }
}

