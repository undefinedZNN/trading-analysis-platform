"""
数据加载模式完整示例

演示所有5种加载模式的使用方法
"""

import backtrader as bt
import sys
from pathlib import Path
import logging
from datetime import datetime

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from backtrader_integration.data_loading_strategies import (
    DataLoadingConfig,
    DataLoadMode,
    DataLoadingStrategy,
    create_cerebro_with_config,
    estimate_memory,
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# 示例策略
class SimpleMAStrategy(bt.Strategy):
    """简单的移动平均策略"""
    params = (
        ('fast_period', 10),
        ('slow_period', 50),
    )
    
    def __init__(self):
        self.fast_ma = bt.indicators.SMA(self.data.close, period=self.p.fast_period)
        self.slow_ma = bt.indicators.SMA(self.data.close, period=self.p.slow_period)
        self.crossover = bt.indicators.CrossOver(self.fast_ma, self.slow_ma)
    
    def next(self):
        if self.crossover > 0:  # 金叉
            if not self.position:
                self.buy()
        elif self.crossover < 0:  # 死叉
            if self.position:
                self.sell()


def run_backtest_with_mode(
    mode: DataLoadMode,
    dataset_path: str,
    dataset_size: int,
    **config_kwargs
):
    """
    使用指定模式运行回测
    
    Args:
        mode: 加载模式
        dataset_path: 数据集路径
        dataset_size: 数据集大小（行数）
        **config_kwargs: 额外的配置参数
    """
    logger.info("=" * 80)
    logger.info(f"Running backtest with mode: {mode.value}")
    logger.info("=" * 80)
    
    # 1. 创建配置
    if mode == DataLoadMode.DEFAULT:
        config = DataLoadingConfig(mode=mode)
    elif mode == DataLoadMode.OPTIMIZED:
        config = DataLoadingConfig(
            mode=mode,
            exactbars=True,
            preload=False,
            runonce=False,
        )
    elif mode == DataLoadMode.STREAMING:
        config = DataLoadingConfig(
            mode=mode,
            exactbars=True,
            preload=False,
            runonce=False,
            chunk_size=config_kwargs.get('chunk_size', 100000),
        )
    elif mode == DataLoadMode.HYBRID:
        config = DataLoadingConfig(
            mode=mode,
            exactbars=False,
            preload=True,
            runonce=True,
            precision=config_kwargs.get('precision', 'reduced'),
        )
    elif mode == DataLoadMode.SEGMENTED:
        config = DataLoadingConfig(
            mode=mode,
            exactbars=True,
            preload=False,
            runonce=False,
            segment_months=config_kwargs.get('segment_months', 3),
        )
    
    # 2. 估算内存
    memory_info = estimate_memory(dataset_size, config)
    logger.info(f"Memory estimate: {memory_info}")
    
    # 3. 创建数据加载策略
    data_strategy = DataLoadingStrategy(config)
    
    # 4. 加载数据
    fromdate = datetime(2023, 1, 1)
    todate = datetime(2023, 12, 31)
    
    try:
        data = data_strategy.load_data(
            dataset_path=dataset_path,
            fromdate=fromdate,
            todate=todate,
        )
    except NotImplementedError:
        # 分段模式需要特殊处理
        logger.info("Segmented mode requires special handling")
        run_segmented_backtest(config, dataset_path, fromdate, todate)
        return
    
    # 5. 创建Cerebro
    cerebro = create_cerebro_with_config(config)
    
    # 6. 添加数据和策略
    cerebro.adddata(data)
    cerebro.addstrategy(SimpleMAStrategy)
    
    # 7. 设置初始资金
    cerebro.broker.setcash(100000.0)
    
    # 8. 添加分析器
    cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name='sharpe')
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name='drawdown')
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name='trades')
    
    # 9. 运行回测
    logger.info("Starting backtest...")
    start_time = datetime.now()
    
    results = cerebro.run()
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    # 10. 输出结果
    strat = results[0]
    final_value = cerebro.broker.getvalue()
    
    logger.info("=" * 80)
    logger.info(f"Backtest completed in {duration:.2f} seconds")
    logger.info(f"Final Portfolio Value: ${final_value:,.2f}")
    logger.info(f"Sharpe Ratio: {strat.analyzers.sharpe.get_analysis().get('sharperatio', 'N/A')}")
    logger.info(f"Max Drawdown: {strat.analyzers.drawdown.get_analysis().get('max', {}).get('drawdown', 'N/A'):.2f}%")
    
    trades_analysis = strat.analyzers.trades.get_analysis()
    total_trades = trades_analysis.get('total', {}).get('total', 0)
    logger.info(f"Total Trades: {total_trades}")
    logger.info("=" * 80)
    
    return {
        'mode': mode.value,
        'duration_seconds': duration,
        'final_value': final_value,
        'memory_estimate_mb': memory_info['estimated_memory_mb'],
        'memory_reduction_pct': memory_info['reduction_percentage'],
    }


def run_segmented_backtest(
    config: DataLoadingConfig,
    dataset_path: str,
    fromdate: datetime,
    todate: datetime,
):
    """运行分段回测"""
    logger.info("Running SEGMENTED backtest")
    
    data_strategy = DataLoadingStrategy(config)
    
    # 生成段
    segments = data_strategy.load_segments(
        dataset_path=dataset_path,
        fromdate=fromdate,
        todate=todate,
        lookback_days=60,
    )
    
    logger.info(f"Processing {len(segments)} segments...")
    
    segment_results = []
    
    for i, segment_info in enumerate(segments):
        logger.info(f"Processing segment {i+1}/{len(segments)}: "
                   f"{segment_info['start']} to {segment_info['end']}")
        
        # 加载段数据（带lookback）
        data = data_strategy.load_data(
            dataset_path=dataset_path,
            fromdate=segment_info['start_with_lookback'],
            todate=segment_info['end'],
        )
        
        # 创建新的Cerebro
        cerebro = create_cerebro_with_config(config)
        cerebro.adddata(data)
        cerebro.addstrategy(SimpleMAStrategy)
        
        # 设置初始资金（来自上一段）
        if i == 0:
            initial_cash = 100000.0
        else:
            initial_cash = segment_results[-1]['final_value']
        
        cerebro.broker.setcash(initial_cash)
        
        # 运行
        results = cerebro.run()
        final_value = cerebro.broker.getvalue()
        
        segment_results.append({
            'segment': i + 1,
            'start': segment_info['start'],
            'end': segment_info['end'],
            'initial_value': initial_cash,
            'final_value': final_value,
            'pnl': final_value - initial_cash,
        })
        
        logger.info(f"Segment {i+1} completed: ${initial_cash:,.2f} -> ${final_value:,.2f}")
    
    # 汇总结果
    total_initial = segment_results[0]['initial_value']
    total_final = segment_results[-1]['final_value']
    total_pnl = total_final - total_initial
    total_return_pct = (total_pnl / total_initial) * 100
    
    logger.info("=" * 80)
    logger.info("SEGMENTED BACKTEST SUMMARY")
    logger.info(f"Total segments: {len(segments)}")
    logger.info(f"Initial value: ${total_initial:,.2f}")
    logger.info(f"Final value: ${total_final:,.2f}")
    logger.info(f"Total P&L: ${total_pnl:,.2f}")
    logger.info(f"Total Return: {total_return_pct:.2f}%")
    logger.info("=" * 80)


def compare_all_modes(dataset_path: str, dataset_size: int):
    """对比所有加载模式"""
    logger.info("=" * 80)
    logger.info("COMPARING ALL DATA LOADING MODES")
    logger.info("=" * 80)
    
    modes_to_test = [
        DataLoadMode.DEFAULT,
        DataLoadMode.OPTIMIZED,  # 推荐
        DataLoadMode.STREAMING,
        DataLoadMode.HYBRID,
    ]
    
    results = []
    
    for mode in modes_to_test:
        try:
            result = run_backtest_with_mode(
                mode=mode,
                dataset_path=dataset_path,
                dataset_size=dataset_size,
            )
            results.append(result)
        except Exception as e:
            logger.error(f"Mode {mode.value} failed: {e}", exc_info=True)
    
    # 输出对比表
    logger.info("\n" + "=" * 80)
    logger.info("COMPARISON SUMMARY")
    logger.info("=" * 80)
    logger.info(f"{'Mode':<15} {'Duration(s)':<15} {'Memory(MB)':<15} {'Reduction(%)':<15}")
    logger.info("-" * 80)
    
    for result in results:
        logger.info(
            f"{result['mode']:<15} "
            f"{result['duration_seconds']:<15.2f} "
            f"{result['memory_estimate_mb']:<15.0f} "
            f"{result['memory_reduction_pct']:<15.1f}"
        )
    
    logger.info("=" * 80)


if __name__ == '__main__':
    # 配置
    DATASET_PATH = "/Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-23/ES/1s"
    DATASET_SIZE = 5300000  # 530万条
    
    # 运行对比
    compare_all_modes(DATASET_PATH, DATASET_SIZE)
    
    # 或者单独测试某个模式
    # run_backtest_with_mode(
    #     mode=DataLoadMode.OPTIMIZED,  # 推荐使用
    #     dataset_path=DATASET_PATH,
    #     dataset_size=DATASET_SIZE,
    # )

