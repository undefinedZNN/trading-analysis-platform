"""
统计分析模块测试

测试回测分析器和统计指标计算。
"""

import sys
import os
import time
import logging
from datetime import datetime, timedelta

# 添加模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import numpy as np
from backtrader_integration.analytics import (
    BacktestAnalyzer,
    calculate_sharpe_ratio,
    calculate_max_drawdown,
    calculate_win_rate,
    calculate_profit_factor,
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def test_metrics_functions():
    """测试指标计算函数"""
    print("\n" + "="*80)
    print("测试 1: 指标计算函数")
    print("="*80)
    
    # 测试夏普比率
    returns = np.array([0.01, -0.005, 0.015, -0.01, 0.02])
    sharpe = calculate_sharpe_ratio(returns)
    print(f"✅ 夏普比率计算: {sharpe:.2f}")
    assert isinstance(sharpe, (float, np.floating)), "应该返回浮点数"
    
    # 测试最大回撤
    equity = np.array([100, 110, 105, 115, 100, 120])
    max_dd, max_dd_pct, start_idx, end_idx = calculate_max_drawdown(equity)
    print(f"✅ 最大回撤计算: {max_dd:.2f} ({max_dd_pct:.2%})")
    assert max_dd_pct > 0, "应该有回撤"
    
    # 测试胜率
    trades = [100, -50, 150, -30, 200, -80]
    win_rate = calculate_win_rate(trades)
    print(f"✅ 胜率计算: {win_rate:.2%}")
    assert 0 <= win_rate <= 1, "胜率应该在0-1之间"
    
    # 测试盈亏比
    profit_factor = calculate_profit_factor(trades)
    print(f"✅ 盈亏比计算: {profit_factor:.2f}")
    assert profit_factor > 0, "盈亏比应该大于0"
    
    print("✅ 指标计算函数测试通过\n")


def test_backtest_analyzer_basic():
    """测试回测分析器基础功能"""
    print("\n" + "="*80)
    print("测试 2: 回测分析器基础功能")
    print("="*80)
    
    # 创建分析器
    analyzer = BacktestAnalyzer()
    analyzer.set_initial_cash(100000.0)
    print("✅ 分析器创建成功")
    
    # 添加一些模拟交易
    base_date = datetime(2023, 1, 1)
    
    trades = [
        {'entry_date': base_date, 'exit_date': base_date + timedelta(hours=1), 'pnl': 100, 'pnl_percent': 0.01, 'holding_bars': 60},
        {'entry_date': base_date + timedelta(hours=2), 'exit_date': base_date + timedelta(hours=3), 'pnl': -50, 'pnl_percent': -0.005, 'holding_bars': 60},
        {'entry_date': base_date + timedelta(hours=4), 'exit_date': base_date + timedelta(hours=5), 'pnl': 150, 'pnl_percent': 0.015, 'holding_bars': 60},
        {'entry_date': base_date + timedelta(hours=6), 'exit_date': base_date + timedelta(hours=7), 'pnl': -30, 'pnl_percent': -0.003, 'holding_bars': 60},
        {'entry_date': base_date + timedelta(hours=8), 'exit_date': base_date + timedelta(hours=9), 'pnl': 200, 'pnl_percent': 0.02, 'holding_bars': 60},
    ]
    
    for trade in trades:
        analyzer.add_trade(trade)
    print(f"✅ 添加 {len(trades)} 笔交易")
    
    # 添加权益曲线点
    equity_values = [100000, 100100, 100050, 100200, 100170, 100370]
    for i, value in enumerate(equity_values):
        analyzer.add_equity_point(
            date=base_date + timedelta(hours=i),
            value=value,
            cash=value * 0.5
        )
    print(f"✅ 添加 {len(equity_values)} 个权益点")
    
    analyzer.set_final_value(100370.0)
    
    # 执行分析
    results = analyzer.analyze()
    print("✅ 分析完成")
    
    # 验证结果结构
    assert 'summary' in results, "应该包含摘要"
    assert 'returns' in results, "应该包含收益指标"
    assert 'risk' in results, "应该包含风险指标"
    assert 'trades' in results, "应该包含交易指标"
    print("✅ 结果结构正确")
    
    # 验证基本指标
    assert results['summary']['total_trades'] == 5, "交易数量应该是5"
    assert results['returns']['total_return'] > 0, "总收益应该大于0"
    assert 0 <= results['trades']['win_rate'] <= 1, "胜率应该在0-1之间"
    print("✅ 基本指标正确")
    
    # 打印摘要
    print("\n结果摘要:")
    print(f"  总收益率: {results['returns']['total_return']:.2%}")
    print(f"  夏普比率: {results['risk']['sharpe_ratio']:.2f}")
    print(f"  最大回撤: {results['risk']['max_drawdown_percent']:.2%}")
    print(f"  胜率: {results['trades']['win_rate']:.2%}")
    print(f"  盈亏比: {results['trades']['profit_factor']:.2f}")
    
    print("✅ 回测分析器基础功能测试通过\n")


def test_backtest_analyzer_export():
    """测试回测分析器导出功能"""
    print("\n" + "="*80)
    print("测试 3: 回测分析器导出功能")
    print("="*80)
    
    analyzer = BacktestAnalyzer()
    analyzer.set_initial_cash(100000.0)
    analyzer.set_final_value(105000.0)
    
    # 添加一些数据
    base_date = datetime(2023, 1, 1)
    analyzer.add_trade({
        'entry_date': base_date,
        'exit_date': base_date + timedelta(hours=1),
        'pnl': 1000,
        'pnl_percent': 0.01,
        'holding_bars': 60
    })
    
    analyzer.add_equity_point(base_date, 100000, 50000)
    analyzer.add_equity_point(base_date + timedelta(hours=1), 101000, 51000)
    
    # 测试转换为字典
    data_dict = analyzer.to_dict()
    assert 'trades' in data_dict, "应该包含交易数据"
    assert 'equity_curve' in data_dict, "应该包含权益曲线"
    assert 'analysis' in data_dict, "应该包含分析结果"
    print("✅ 转换为字典成功")
    
    # 测试转换为 DataFrame
    trades_df = analyzer.to_dataframe()
    assert len(trades_df) == 1, "应该有1笔交易"
    print(f"✅ 转换为 DataFrame 成功: {len(trades_df)} 行")
    
    # 测试权益曲线 DataFrame
    equity_df = analyzer.get_equity_curve_df()
    assert len(equity_df) == 2, "应该有2个权益点"
    print(f"✅ 权益曲线 DataFrame: {len(equity_df)} 行")
    
    print("✅ 回测分析器导出功能测试通过\n")


def test_print_summary():
    """测试打印摘要功能"""
    print("\n" + "="*80)
    print("测试 4: 打印摘要功能")
    print("="*80)
    
    analyzer = BacktestAnalyzer()
    analyzer.set_initial_cash(100000.0)
    analyzer.set_final_value(110000.0)
    
    # 添加模拟数据
    base_date = datetime(2023, 1, 1)
    
    # 添加10笔交易
    for i in range(10):
        pnl = (i % 2) * 500 - 200  # 交替盈亏
        analyzer.add_trade({
            'entry_date': base_date + timedelta(hours=i*2),
            'exit_date': base_date + timedelta(hours=i*2+1),
            'pnl': pnl,
            'pnl_percent': pnl / 10000,
            'holding_bars': 60
        })
    
    # 添加权益曲线
    for i in range(11):
        value = 100000 + i * 1000
        analyzer.add_equity_point(
            date=base_date + timedelta(hours=i*2),
            value=value,
            cash=value * 0.5
        )
    
    # 打印摘要
    print("\n测试打印摘要:")
    analyzer.print_summary()
    
    print("✅ 打印摘要功能测试通过\n")


def main():
    """运行所有测试"""
    print("\n" + "="*80)
    print(" 统计分析模块 - 单元测试")
    print("="*80)
    
    start_time = time.time()
    
    # 运行测试
    test_metrics_functions()
    test_backtest_analyzer_basic()
    test_backtest_analyzer_export()
    test_print_summary()
    
    # 统计
    end_time = time.time()
    elapsed = end_time - start_time
    
    print("\n" + "="*80)
    print(f" 所有测试完成，总耗时: {elapsed:.2f}秒")
    print("="*80 + "\n")


if __name__ == '__main__':
    main()

