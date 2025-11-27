"""
测试分段回测器

对比完整回测和分段回测的效果：
- 内存占用
- 回测时间
- 结果准确性
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

import backtrader as bt
from datetime import datetime
import logging
from backtrader_integration.segmented_backtester import SegmentedBacktester, compare_with_full_backtest

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SimpleMAStrategy(bt.Strategy):
    """简单的移动平均策略（用于测试）"""
    
    params = (
        ('fast_period', 10),
        ('slow_period', 50),
    )
    
    def __init__(self):
        self.fast_ma = bt.indicators.SMA(period=self.params.fast_period)
        self.slow_ma = bt.indicators.SMA(period=self.params.slow_period)
        self.crossover = bt.indicators.CrossOver(self.fast_ma, self.slow_ma)
    
    def next(self):
        if not self.position:
            if self.crossover > 0:  # 金叉
                self.buy()
        elif self.crossover < 0:  # 死叉
            self.sell()


def test_segmented_backtest():
    """测试分段回测"""
    
    logger.info("="*80)
    logger.info("SEGMENTED BACKTEST TEST")
    logger.info("="*80)
    
    # 配置
    dataset_path = 'ES-23/ES/1s'  # 使用1秒数据（530万条）
    start_date = datetime(2022, 12, 15)
    end_date = datetime(2023, 3, 17)
    
    # 创建分段回测器
    # 优化：减少segment和lookback，避免单段数据过大
    backtester = SegmentedBacktester(
        dataset_path=dataset_path,
        strategy_class=SimpleMAStrategy,
        strategy_params={
            'fast_period': 10,
            'slow_period': 50,
        },
        segment_days=7,  # 每段7天（优化：避免单段过大）
        lookback_days=5,  # 预热5天（优化：减少重叠）
        initial_cash=100000.0,
        commission=0.001,
        enable_exactbars=True,
    )
    
    # 运行分段回测
    result = backtester.run(start_date, end_date)
    
    # 打印详细结果
    print("\n" + "="*80)
    print("DETAILED RESULTS")
    print("="*80)
    
    print(f"\n总体结果:")
    print(f"  初始资金: ${result['initial_value']:,.2f}")
    print(f"  最终资金: ${result['final_value']:,.2f}")
    print(f"  总收益: ${result['total_profit']:,.2f}")
    print(f"  总收益率: {result['total_return_pct']:.2f}%")
    print(f"  峰值内存: {result['peak_memory_mb']:.2f} MB")
    print(f"  段数: {result['num_segments']}")
    
    print(f"\n各段结果:")
    print(f"{'段号':<6} {'开始日期':<12} {'结束日期':<12} {'初始资金':<15} {'最终资金':<15} {'收益':<12} {'收益率':<10} {'内存':<10}")
    print("-" * 110)
    
    for seg in result['segments']:
        print(
            f"{seg['segment_id']:<6} "
            f"{seg['start'].date()!s:<12} "
            f"{seg['end'].date()!s:<12} "
            f"${seg['initial_value']:>13,.2f} "
            f"${seg['final_value']:>13,.2f} "
            f"${seg['profit']:>10,.2f} "
            f"{seg['return_pct']:>8.2f}% "
            f"{seg['peak_memory_mb']:>8.0f} MB"
        )
    
    # 评估
    print("\n" + "="*80)
    print("EVALUATION")
    print("="*80)
    
    avg_memory = sum(seg['peak_memory_mb'] for seg in result['segments']) / len(result['segments'])
    
    print(f"平均每段内存: {avg_memory:.2f} MB")
    print(f"峰值内存: {result['peak_memory_mb']:.2f} MB")
    
    # 与预期对比
    expected_full_memory = 2900  # Day 1测试的完整回测内存
    memory_reduction_pct = ((expected_full_memory - result['peak_memory_mb']) / expected_full_memory) * 100
    
    print(f"\n内存优化效果:")
    print(f"  完整回测（Day 1）: ~{expected_full_memory} MB")
    print(f"  分段回测（Day 2）: {result['peak_memory_mb']:.0f} MB")
    print(f"  内存降低: {memory_reduction_pct:.1f}%")
    
    # 判断是否达标
    if memory_reduction_pct >= 80:
        print("\n✅ EXCELLENT: 内存降低 ≥ 80%，达到目标！")
    elif memory_reduction_pct >= 70:
        print("\n✅ GOOD: 内存降低 ≥ 70%，接近目标")
    elif memory_reduction_pct >= 50:
        print("\n🟡 ACCEPTABLE: 内存降低 ≥ 50%，有改善但未达标")
    else:
        print("\n❌ FAILED: 内存降低 < 50%，需要调优")
    
    return result


def test_comparison():
    """对比测试：完整 vs 分段"""
    
    logger.info("\n" + "="*80)
    logger.info("COMPARISON TEST: FULL vs SEGMENTED")
    logger.info("="*80)
    logger.info("⚠️  WARNING: This will load full dataset into memory first")
    logger.info("="*80)
    
    # 使用较小的数据集进行对比（避免OOM）
    dataset_path = 'ES-23/ES/5m/agg_5m_from_1s.parquet'  # 5分钟数据
    start_date = datetime(2023, 1, 1)
    end_date = datetime(2023, 1, 31)  # 仅1个月
    
    comparison = compare_with_full_backtest(
        dataset_path=dataset_path,
        strategy_class=SimpleMAStrategy,
        start_date=start_date,
        end_date=end_date,
        strategy_params={'fast_period': 10, 'slow_period': 50},
        segment_days=30,  # 30天一段（用于验证准确性）
    )
    
    return comparison


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Test segmented backtest')
    parser.add_argument(
        '--mode',
        choices=['segmented', 'comparison', 'both'],
        default='segmented',
        help='Test mode'
    )
    
    args = parser.parse_args()
    
    try:
        if args.mode in ['segmented', 'both']:
            print("\n" + "🚀 " + "="*76)
            print("TEST 1: SEGMENTED BACKTEST (530万条数据)")
            print("="*78)
            result1 = test_segmented_backtest()
        
        if args.mode in ['comparison', 'both']:
            print("\n" + "🚀 " + "="*76)
            print("TEST 2: ACCURACY COMPARISON (使用5分钟数据验证准确性)")
            print("="*78)
            result2 = test_comparison()
        
        print("\n" + "="*80)
        print("✅ ALL TESTS COMPLETED")
        print("="*80)
        
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        sys.exit(1)

