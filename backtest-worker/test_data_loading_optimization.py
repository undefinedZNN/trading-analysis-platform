"""
快速验证数据加载优化方案

测试内存优化模式 vs 默认模式
"""

import backtrader as bt
import sys
from pathlib import Path
import logging
import time
import psutil
import os
from datetime import datetime

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from backtrader_integration.data_loading_strategies import (
    DataLoadingConfig,
    DataLoadMode,
    DataLoadingStrategy,
    create_cerebro_with_config,
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TestStrategy(bt.Strategy):
    """测试策略"""
    
    def __init__(self):
        self.sma = bt.indicators.SMA(self.data.close, period=50)
        self.order = None
    
    def next(self):
        if not self.position:
            if self.data.close[0] > self.sma[0]:
                self.order = self.buy()
        else:
            if self.data.close[0] < self.sma[0]:
                self.order = self.sell()


def get_memory_usage():
    """获取当前进程内存使用（MB）"""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024


def run_test(mode: DataLoadMode, dataset_path: str):
    """运行测试"""
    logger.info("=" * 80)
    logger.info(f"Testing mode: {mode.value}")
    logger.info("=" * 80)
    
    # 记录初始内存
    initial_memory = get_memory_usage()
    logger.info(f"Initial memory: {initial_memory:.2f} MB")
    
    # 创建配置
    if mode == DataLoadMode.DEFAULT:
        config = DataLoadingConfig(mode=mode)
    else:
        config = DataLoadingConfig(
            mode=DataLoadMode.OPTIMIZED,
            exactbars=True,
            preload=False,
            runonce=False,
        )
    
    # 数据加载阶段
    logger.info("Loading data...")
    load_start = time.time()
    
    data_strategy = DataLoadingStrategy(config)
    data = data_strategy.load_data(
        dataset_path=dataset_path,
        fromdate=datetime(2022, 12, 15),
        todate=datetime(2023, 3, 17),
    )
    
    load_end = time.time()
    load_time = load_end - load_start
    
    after_load_memory = get_memory_usage()
    load_memory_increase = after_load_memory - initial_memory
    
    logger.info(f"Data loaded in {load_time:.2f} seconds")
    logger.info(f"Memory after load: {after_load_memory:.2f} MB (+{load_memory_increase:.2f} MB)")
    
    # 回测阶段
    logger.info("Running backtest...")
    
    cerebro = create_cerebro_with_config(config)
    cerebro.adddata(data)
    cerebro.addstrategy(TestStrategy)
    cerebro.broker.setcash(100000.0)
    
    # 添加分析器
    cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name='sharpe')
    cerebro.addanalyzer(bt.analyzers.Returns, _name='returns')
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name='trades')
    
    backtest_start = time.time()
    
    results = cerebro.run()
    
    backtest_end = time.time()
    backtest_time = backtest_end - backtest_start
    
    peak_memory = get_memory_usage()
    peak_memory_increase = peak_memory - initial_memory
    
    # 提取结果
    strat = results[0]
    final_value = cerebro.broker.getvalue()
    
    sharpe = strat.analyzers.sharpe.get_analysis().get('sharperatio', None)
    returns = strat.analyzers.returns.get_analysis()
    trades = strat.analyzers.trades.get_analysis()
    
    # 输出结果
    logger.info("=" * 80)
    logger.info("RESULTS")
    logger.info("=" * 80)
    logger.info(f"Mode: {mode.value}")
    logger.info(f"")
    logger.info(f"Performance:")
    logger.info(f"  Load time:     {load_time:.2f}s")
    logger.info(f"  Backtest time: {backtest_time:.2f}s")
    logger.info(f"  Total time:    {load_time + backtest_time:.2f}s")
    logger.info(f"")
    logger.info(f"Memory:")
    logger.info(f"  After load:    {after_load_memory:.2f} MB (+{load_memory_increase:.2f} MB)")
    logger.info(f"  Peak:          {peak_memory:.2f} MB (+{peak_memory_increase:.2f} MB)")
    logger.info(f"")
    logger.info(f"Trading Results:")
    logger.info(f"  Final Value:   ${final_value:,.2f}")
    logger.info(f"  Return:        {returns.get('rtot', 0) * 100:.2f}%")
    logger.info(f"  Sharpe Ratio:  {sharpe if sharpe else 'N/A'}")
    logger.info(f"  Total Trades:  {trades.get('total', {}).get('total', 0)}")
    logger.info("=" * 80)
    
    return {
        'mode': mode.value,
        'load_time': load_time,
        'backtest_time': backtest_time,
        'total_time': load_time + backtest_time,
        'memory_after_load_mb': after_load_memory,
        'memory_peak_mb': peak_memory,
        'memory_increase_mb': peak_memory_increase,
        'final_value': final_value,
        'return_pct': returns.get('rtot', 0) * 100,
        'sharpe': sharpe,
        'total_trades': trades.get('total', {}).get('total', 0),
    }


def compare_modes(dataset_path: str):
    """对比两种模式"""
    logger.info("\n\n")
    logger.info("🚀 " * 20)
    logger.info("DATA LOADING OPTIMIZATION TEST")
    logger.info("🚀 " * 20)
    logger.info("\n")
    
    # 测试默认模式
    logger.info("Test 1/2: Default mode")
    default_result = run_test(DataLoadMode.DEFAULT, dataset_path)
    
    # 等待GC
    import gc
    gc.collect()
    time.sleep(2)
    
    # 测试优化模式
    logger.info("\n\nTest 2/2: Optimized mode")
    optimized_result = run_test(DataLoadMode.OPTIMIZED, dataset_path)
    
    # 对比
    logger.info("\n\n")
    logger.info("=" * 80)
    logger.info("COMPARISON")
    logger.info("=" * 80)
    
    logger.info(f"\n{'Metric':<25} {'Default':<20} {'Optimized':<20} {'Change':<20}")
    logger.info("-" * 85)
    
    # 时间对比
    logger.info(f"{'Load time (s)':<25} {default_result['load_time']:<20.2f} {optimized_result['load_time']:<20.2f} {optimized_result['load_time'] - default_result['load_time']:+.2f}s")
    logger.info(f"{'Backtest time (s)':<25} {default_result['backtest_time']:<20.2f} {optimized_result['backtest_time']:<20.2f} {optimized_result['backtest_time'] - default_result['backtest_time']:+.2f}s")
    logger.info(f"{'Total time (s)':<25} {default_result['total_time']:<20.2f} {optimized_result['total_time']:<20.2f} {optimized_result['total_time'] - default_result['total_time']:+.2f}s")
    
    # 内存对比
    logger.info(f"")
    memory_reduction = default_result['memory_peak_mb'] - optimized_result['memory_peak_mb']
    memory_reduction_pct = (memory_reduction / default_result['memory_peak_mb']) * 100
    
    logger.info(f"{'Memory peak (MB)':<25} {default_result['memory_peak_mb']:<20.2f} {optimized_result['memory_peak_mb']:<20.2f} {-memory_reduction:.2f} MB")
    logger.info(f"{'Memory reduction':<25} {'-':<20} {'-':<20} {memory_reduction_pct:.1f}%")
    
    # 结果对比
    logger.info(f"")
    logger.info(f"{'Final value ($)':<25} {default_result['final_value']:<20,.2f} {optimized_result['final_value']:<20,.2f} {'✓' if abs(default_result['final_value'] - optimized_result['final_value']) < 1 else '✗'}")
    logger.info(f"{'Total trades':<25} {default_result['total_trades']:<20} {optimized_result['total_trades']:<20} {'✓' if default_result['total_trades'] == optimized_result['total_trades'] else '✗'}")
    
    logger.info("")
    logger.info("=" * 80)
    logger.info("SUMMARY")
    logger.info("=" * 80)
    
    time_increase_pct = ((optimized_result['total_time'] - default_result['total_time']) / default_result['total_time']) * 100
    
    logger.info(f"✅ Memory reduced by {memory_reduction_pct:.1f}% ({default_result['memory_peak_mb']:.0f}MB → {optimized_result['memory_peak_mb']:.0f}MB)")
    logger.info(f"⏱️  Time increased by {time_increase_pct:.1f}% ({default_result['total_time']:.0f}s → {optimized_result['total_time']:.0f}s)")
    logger.info(f"✅ Results are {'identical' if abs(default_result['final_value'] - optimized_result['final_value']) < 1 else 'different'}")
    logger.info(f"")
    logger.info(f"🎯 RECOMMENDATION: Use OPTIMIZED mode for {memory_reduction_pct:.0f}% memory saving")
    logger.info(f"   with only {time_increase_pct:.0f}% performance trade-off!")
    logger.info("=" * 80)


if __name__ == '__main__':
    # 配置数据集路径
    DATASET_PATH = "/Volumes/CODE/trading-analysis-platform/backend/storage/datasets/ES-23/ES/1s"
    
    # 检查路径是否存在
    if not Path(DATASET_PATH).exists():
        logger.error(f"Dataset path not found: {DATASET_PATH}")
        logger.info("Please update DATASET_PATH in the script")
        sys.exit(1)
    
    # 运行对比测试
    compare_modes(DATASET_PATH)

