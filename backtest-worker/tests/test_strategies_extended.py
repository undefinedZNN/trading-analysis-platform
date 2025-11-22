# -*- coding: utf-8 -*-
"""
策略模块扩展测试 - 使用更长时间范围的真实数据

使用多天数据进行测试，确保策略能产生交易信号。
"""

import sys
import os
import time
import logging
from datetime import datetime

# 添加模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import backtrader as bt
from backtrader_integration.strategy import (
    MACrossStrategy,
    RSIStrategy,
    ThreeLineMomentumStrategy,
)
from backtrader_integration.data import CachedParquetDataFeed
from backtrader_integration.factors import FactorCollector
from backtrader_integration.analytics import BacktestAnalyzer

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def test_strategies_with_extended_data():
    """使用更长时间范围测试所有策略"""
    print("\n" + "="*80)
    print(" 策略扩展测试 - 更长时间范围（真实数据）")
    print("="*80)
    
    # 配置数据路径
    data_base_path = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets'
    
    if not os.path.exists(data_base_path):
        print("❌ 测试数据不存在")
        return
    
    # 测试不同的时间范围和聚合级别
    test_configs = [
        {
            'name': '1天数据 + 1分钟级别',
            'start': '2022-12-15 00:00:00',
            'end': '2022-12-15 23:59:59',
            'timeframe': '1min',
        },
        {
            'name': '1天数据 + 5分钟级别',
            'start': '2022-12-15 00:00:00',
            'end': '2022-12-15 23:59:59',
            'timeframe': '5min',
        },
        {
            'name': '3天数据 + 1分钟级别',
            'start': '2022-12-15 00:00:00',
            'end': '2022-12-17 23:59:59',
            'timeframe': '1min',
        },
        {
            'name': '7天数据 + 1分钟级别',
            'start': '2022-12-15 00:00:00',
            'end': '2022-12-21 23:59:59',
            'timeframe': '1min',
        },
    ]
    
    strategies_config = [
        {
            'name': 'MA Cross',
            'class': MACrossStrategy,
            'params': {
                'sma_fast_period': 5,   # 缩短周期
                'sma_slow_period': 15,  # 缩短周期
                'task_id': 'ext_ma_cross'
            }
        },
        {
            'name': 'RSI',
            'class': RSIStrategy,
            'params': {
                'rsi_period': 10,      # 缩短周期
                'rsi_oversold': 35,    # 放宽条件
                'rsi_overbought': 65,  # 放宽条件
                'task_id': 'ext_rsi'
            }
        },
        {
            'name': 'Three Line Momentum',
            'class': ThreeLineMomentumStrategy,
            'params': {
                'dmi_period': 10,      # 缩短周期
                'strict_structure': False,  # 放宽条件
                'task_id': 'ext_three_line'
            }
        },
    ]
    
    for test_config in test_configs:
        print(f"\n" + "="*80)
        print(f" 测试配置: {test_config['name']}")
        print(f" 时间范围: {test_config['start']} ~ {test_config['end']}")
        print(f" 聚合级别: {test_config['timeframe']}")
        print("="*80)
        
        results_summary = []
        
        for strategy_config in strategies_config:
            try:
                print(f"\n策略: {strategy_config['name']}")
                print("-" * 80)
                
                # 创建 Cerebro
                cerebro = bt.Cerebro()
                cerebro.broker.setcash(100000.0)
                cerebro.broker.setcommission(commission=0.001)
                
                # 添加数据
                data = CachedParquetDataFeed(
                    symbol='MES',
                    base_path=data_base_path,
                    start_date=test_config['start'],
                    end_date=test_config['end'],
                    aggregate_timeframe=test_config['timeframe'],
                )
                cerebro.adddata(data)
                
                # 添加策略和观察者
                cerebro.addstrategy(strategy_config['class'], **strategy_config['params'])
                cerebro.addobserver(FactorCollector)
                
                # 运行回测
                start_time = time.time()
                run_results = cerebro.run()
                elapsed = time.time() - start_time
                
                strategy = run_results[0]
                
                # 分析结果
                analyzer = BacktestAnalyzer()
                analysis = analyzer.analyze(cerebro, strategy, initial_cash=100000.0)
                
                # 保存结果
                results_summary.append({
                    'strategy': strategy_config['name'],
                    'return': analysis['total_return_pct'],
                    'trades': analysis['total_trades'],
                    'winning': analysis['winning_trades'],
                    'losing': analysis['losing_trades'],
                    'win_rate': analysis['win_rate'] * 100,
                    'sharpe': analysis.get('sharpe_ratio', 0),
                    'max_dd': analysis.get('max_drawdown_pct', 0),
                    'elapsed': elapsed,
                })
                
                print(f"  ✅ 完成")
                print(f"  收益率: {analysis['total_return_pct']:>8.2f}%")
                print(f"  交易次数: {analysis['total_trades']:>6}")
                print(f"  盈利/亏损: {analysis['winning_trades']}/{analysis['losing_trades']}")
                print(f"  胜率: {analysis['win_rate']*100:>8.2f}%")
                print(f"  夏普比率: {analysis.get('sharpe_ratio', 0):>8.3f}")
                print(f"  最大回撤: {analysis.get('max_drawdown_pct', 0):>8.2f}%")
                print(f"  耗时: {elapsed:>8.2f}秒")
                
            except Exception as e:
                print(f"  ❌ 失败: {e}")
                import traceback
                traceback.print_exc()
        
        # 打印本配置的对比总结
        if results_summary:
            print(f"\n{'='*80}")
            print(f" {test_config['name']} - 策略对比")
            print(f"{'='*80}")
            print(f"{'策略':<25} {'收益率':<10} {'交易':<8} {'盈/亏':<10} {'胜率':<10} {'夏普':<10} {'最大回撤':<10}")
            print("-"*80)
            
            for result in results_summary:
                print(
                    f"{result['strategy']:<25} "
                    f"{result['return']:>8.2f}% "
                    f"{result['trades']:>6} "
                    f"{result['winning']:>3}/{result['losing']:<3} "
                    f"{result['win_rate']:>8.1f}% "
                    f"{result['sharpe']:>8.3f} "
                    f"{result['max_dd']:>8.2f}%"
                )
            
            print("="*80)


def test_check_data_availability():
    """检查可用的数据范围"""
    print("\n" + "="*80)
    print(" 检查数据可用性")
    print("="*80)
    
    import duckdb
    
    data_file = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/MES/MES/1s/dt=2022-12-15/hour=00/batch_5.parquet'
    
    if not os.path.exists(data_file):
        print("❌ 数据文件不存在")
        return
    
    conn = duckdb.connect()
    
    # 检查数据概况
    query = f"""
    SELECT 
        COUNT(*) as total_rows,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time
    FROM read_parquet('{data_file}')
    """
    
    result = conn.execute(query).fetchone()
    print(f"\n数据文件: {data_file}")
    print(f"总行数: {result[0]:,}")
    print(f"时间范围: {result[1]} ~ {result[2]}")
    
    # 检查不同日期的数据量
    query2 = f"""
    SELECT 
        DATE(timestamp) as date,
        COUNT(*) as rows,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time
    FROM read_parquet('{data_file}')
    GROUP BY DATE(timestamp)
    ORDER BY date
    LIMIT 10
    """
    
    print(f"\n按日期统计（前10天）:")
    print(f"{'日期':<15} {'行数':<12} {'开始时间':<25} {'结束时间':<25}")
    print("-" * 80)
    
    for row in conn.execute(query2).fetchall():
        print(f"{row[0]!s:<15} {row[1]:>10,} {row[2]!s:<25} {row[3]!s:<25}")
    
    conn.close()


def main():
    """运行所有测试"""
    print("\n" + "="*80)
    print(" 策略扩展测试 - 使用更长时间范围")
    print("="*80)
    
    start_time = time.time()
    
    # 检查数据
    test_check_data_availability()
    
    # 运行扩展测试
    test_strategies_with_extended_data()
    
    # 统计
    end_time = time.time()
    elapsed = end_time - start_time
    
    print("\n" + "="*80)
    print(f" 所有扩展测试完成！")
    print(f" 总耗时: {elapsed:.2f}秒")
    print("="*80 + "\n")


if __name__ == '__main__':
    main()

