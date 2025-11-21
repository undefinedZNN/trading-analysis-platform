# -*- coding: utf-8 -*-
"""
统计分析模块测试

测试指标计算和回测分析功能。
"""

import sys
import os
import time
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# 添加模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import backtrader as bt
from backtrader_integration.analytics import MetricsCalculator, BacktestAnalyzer
from backtrader_integration.strategy import MACrossStrategy
from backtrader_integration.data import CachedParquetDataFeed
from backtrader_integration.factors import FactorCollector

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def test_metrics_calculator():
    """测试指标计算器"""
    print("\n" + "="*80)
    print("测试 1: 指标计算器")
    print("="*80)
    
    calc = MetricsCalculator()
    
    # 1. 测试夏普比率
    returns = np.array([0.01, 0.02, -0.01, 0.03, -0.02, 0.01])
    sharpe = calc.sharpe_ratio(returns)
    print(f"✅ 夏普比率: {sharpe:.3f}")
    assert isinstance(sharpe, float), "夏普比率应该是浮点数"
    
    # 2. 测试索提诺比率
    sortino = calc.sortino_ratio(returns)
    print(f"✅ 索提诺比率: {sortino:.3f}")
    assert isinstance(sortino, float), "索提诺比率应该是浮点数"
    
    # 3. 测试最大回撤
    equity_curve = np.array([100, 105, 103, 110, 95, 98, 112])
    max_dd, start, valley, end = calc.max_drawdown(equity_curve)
    print(f"✅ 最大回撤: {max_dd*100:.2f}% (索引: {start}->{valley}->{end})")
    assert max_dd > 0, "最大回撤应该大于0"
    assert start <= valley <= end, "回撤索引顺序应该正确"
    
    # 4. 测试胜率
    trades = [100, -50, 80, -30, 120, -40, 90]
    win_rate = calc.win_rate(trades)
    print(f"✅ 胜率: {win_rate*100:.2f}%")
    assert 0 <= win_rate <= 1, "胜率应该在0-1之间"
    
    # 5. 测试盈亏比
    profit_factor = calc.profit_factor(trades)
    print(f"✅ 盈亏比: {profit_factor:.2f}")
    assert profit_factor > 0, "盈亏比应该大于0"
    
    # 6. 测试平均盈亏比
    avg_ratio = calc.average_win_loss_ratio(trades)
    print(f"✅ 平均盈亏比: {avg_ratio:.2f}")
    
    # 7. 测试连续盈亏
    max_wins = calc.max_consecutive_wins(trades)
    max_losses = calc.max_consecutive_losses(trades)
    print(f"✅ 最大连胜: {max_wins}, 最大连亏: {max_losses}")
    
    # 8. 测试期望值
    expectancy = calc.expectancy(trades)
    print(f"✅ 期望值: {expectancy:.2f}")
    
    # 9. 测试年化收益率
    start_date = datetime(2023, 1, 1)
    end_date = datetime(2023, 12, 31)
    ann_return = calc.annualized_return(0.15, start_date, end_date)
    print(f"✅ 年化收益率: {ann_return*100:.2f}%")
    
    # 10. 测试年化波动率
    ann_vol = calc.annualized_volatility(returns)
    print(f"✅ 年化波动率: {ann_vol*100:.2f}%")
    
    print("✅ 指标计算器测试通过\n")


def test_backtest_analyzer_simple():
    """测试回测分析器（简单场景）"""
    print("\n" + "="*80)
    print("测试 2: 回测分析器（简单场景）")
    print("="*80)
    
    # 创建简单的回测
    cerebro = bt.Cerebro()
    cerebro.broker.setcash(100000.0)
    cerebro.broker.setcommission(commission=0.001)
    
    # 添加简单数据
    df = pd.DataFrame({
        'datetime': pd.date_range('2023-01-01', periods=100, freq='1min'),
        'open': np.random.uniform(99, 101, 100),
        'high': np.random.uniform(100, 102, 100),
        'low': np.random.uniform(98, 100, 100),
        'close': np.random.uniform(99, 101, 100),
        'volume': np.random.randint(1000, 2000, 100),
    })
    df = df.set_index('datetime')
    
    data = bt.feeds.PandasData(dataname=df)
    cerebro.adddata(data)
    
    # 添加策略
    cerebro.addstrategy(
        MACrossStrategy,
        sma_fast_period=5,
        sma_slow_period=10,
        task_id='test_analyzer'
    )
    
    print("✅ Cerebro 和策略创建成功")
    
    # 运行回测
    results = cerebro.run()
    strategy = results[0]
    
    # 使用分析器
    analyzer = BacktestAnalyzer()
    analysis_results = analyzer.analyze(cerebro, strategy, initial_cash=100000.0)
    
    print(f"✅ 分析完成")
    print(f"  总收益率: {analysis_results['total_return_pct']:.2f}%")
    print(f"  夏普比率: {analysis_results['sharpe_ratio']:.3f}")
    print(f"  最大回撤: {analysis_results['max_drawdown_pct']:.2f}%")
    print(f"  总交易次数: {analysis_results['total_trades']}")
    
    # 验证结果
    assert 'final_value' in analysis_results, "应该包含最终资金"
    assert 'sharpe_ratio' in analysis_results, "应该包含夏普比率"
    assert 'max_drawdown' in analysis_results, "应该包含最大回撤"
    
    # 格式化输出
    formatted = analyzer.format_results(analysis_results)
    print("\n格式化报告预览（前10行）:")
    print("\n".join(formatted.split('\n')[:10]))
    
    print("✅ 回测分析器测试通过\n")


def test_backtest_analyzer_with_real_data():
    """测试回测分析器（真实数据）"""
    print("\n" + "="*80)
    print("测试 3: 回测分析器（真实数据）")
    print("="*80)
    
    # 配置数据路径
    data_base_path = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets'
    
    if not os.path.exists(data_base_path):
        print("⚠️ 测试数据不存在，跳过真实数据测试")
        return
    
    try:
        # 创建 Cerebro
        cerebro = bt.Cerebro()
        cerebro.broker.setcash(100000.0)
        cerebro.broker.setcommission(commission=0.001)
        
        # 添加数据
        data = CachedParquetDataFeed(
            symbol='MES',
            base_path=data_base_path,
            start_date='2022-12-15 00:00:00',
            end_date='2022-12-15 23:59:59',
            aggregate_timeframe='1min',
        )
        cerebro.adddata(data)
        print("✅ 数据添加成功")
        
        # 添加策略和因子收集器
        cerebro.addstrategy(
            MACrossStrategy,
            sma_fast_period=10,
            sma_slow_period=30,
            task_id='test_real_analyzer'
        )
        cerebro.addobserver(FactorCollector)
        
        # 运行回测
        print("\n开始回测...")
        start_time = time.time()
        results = cerebro.run()
        elapsed = time.time() - start_time
        
        strategy = results[0]
        
        # 分析结果
        analyzer = BacktestAnalyzer()
        analysis_results = analyzer.analyze(cerebro, strategy, initial_cash=100000.0)
        
        print(f"\n✅ 回测完成，耗时: {elapsed:.2f}秒")
        
        # 打印完整报告
        print("\n" + analyzer.format_results(analysis_results))
        
        # 验证关键指标
        assert analysis_results['total_return_pct'] != 0, "应该有收益率（可能为负）"
        assert analysis_results['max_drawdown_pct'] >= 0, "最大回撤应该>=0"
        
        print("✅ 真实数据回测分析测试通过\n")
        
    except Exception as e:
        print(f"❌ 真实数据测试失败: {e}")
        import traceback
        traceback.print_exc()


def main():
    """运行所有测试"""
    print("\n" + "="*80)
    print(" 统计分析模块 - 单元测试")
    print("="*80)
    
    start_time = time.time()
    
    # 运行测试
    test_metrics_calculator()
    test_backtest_analyzer_simple()
    test_backtest_analyzer_with_real_data()
    
    # 统计
    end_time = time.time()
    elapsed = end_time - start_time
    
    print("\n" + "="*80)
    print(f" 所有测试完成，总耗时: {elapsed:.2f}秒")
    print("="*80 + "\n")


if __name__ == '__main__':
    main()
