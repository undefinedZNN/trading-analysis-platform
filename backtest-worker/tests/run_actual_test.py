# -*- coding: utf-8 -*-
"""
策略实际测试 - 获取真实成交数据
使用模拟数据运行各策略
"""

import sys
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# 添加路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    import backtrader as bt
    from src.backtrader_integration.strategy import (
        ReversalPatternStrategy,
        HighFrequencyStrategy,
        PendingOrderStrategy,
        PyramidStrategy,
        RandomStrategy
    )
    BACKTRADER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  Backtrader未安装: {e}")
    print("请先安装: pip install backtrader")
    BACKTRADER_AVAILABLE = False

def generate_test_data(days=7, trend='mixed'):
    """生成测试数据"""
    print(f'\n生成测试数据: {days}天, 趋势={trend}')
    
    start_date = datetime(2023, 1, 1)
    dates = [start_date + timedelta(minutes=i) for i in range(days * 24 * 60)]
    
    # 生成价格数据
    base_price = 5000
    prices = []
    
    for i in range(len(dates)):
        if trend == 'up':
            # 上升趋势
            trend_component = i * 0.01
            volatility = np.sin(i * 0.01) * 20
        elif trend == 'down':
            # 下降趋势
            trend_component = -i * 0.01
            volatility = np.sin(i * 0.01) * 20
        else:
            # 混合趋势
            trend_component = np.sin(i * 0.001) * 100
            volatility = (hash(str(i)) % 50) - 25
        
        price = base_price + trend_component + volatility
        prices.append(max(price, 100))  # 确保价格>0
    
    # 生成OHLCV数据
    data = []
    for i, (date, close) in enumerate(zip(dates, prices)):
        high = close * 1.002
        low = close * 0.998
        open_price = prices[i-1] if i > 0 else close
        volume = 1000000
        
        data.append({
            'datetime': date,
            'open': open_price,
            'high': high,
            'low': low,
            'close': close,
            'volume': volume
        })
    
    df = pd.DataFrame(data)
    df.set_index('datetime', inplace=True)
    
    print(f'✓ 数据生成完成: {len(df)}根K线')
    print(f'  价格范围: {df["close"].min():.2f} - {df["close"].max():.2f}')
    
    return df

def run_strategy_test(strategy_class, strategy_name, df, params=None):
    """运行单个策略测试"""
    print(f'\n{"="*80}')
    print(f'测试策略: {strategy_name}')
    print(f'{"="*80}')
    
    try:
        # 创建Cerebro
        cerebro = bt.Cerebro()
        
        # 添加数据
        data = bt.feeds.PandasData(dataname=df)
        cerebro.adddata(data)
        
        # 添加策略
        if params:
            cerebro.addstrategy(strategy_class, **params)
        else:
            cerebro.addstrategy(strategy_class)
        
        # 设置初始资金
        initial_cash = 100000
        cerebro.broker.setcash(initial_cash)
        
        # 添加观察者
        cerebro.addobserver(bt.observers.Value)
        
        # 运行回测
        print(f'初始资金: ${initial_cash:,.2f}')
        print(f'运行回测...')
        
        start_time = datetime.now()
        results = cerebro.run()
        end_time = datetime.now()
        
        strategy = results[0]
        final_value = cerebro.broker.getvalue()
        
        # 统计交易数据
        if hasattr(strategy, 'factor_collector') and strategy.factor_collector:
            trades = strategy.factor_collector.trades
            trade_count = len(trades)
        else:
            trade_count = 0
        
        # 计算收益
        pnl = final_value - initial_cash
        return_pct = (pnl / initial_cash) * 100
        elapsed = (end_time - start_time).total_seconds()
        
        # 显示结果
        print(f'\n【测试结果】')
        print(f'  实际成交笔数: {trade_count} 笔')
        print(f'  最终资金: ${final_value:,.2f}')
        print(f'  盈亏: ${pnl:,.2f} ({return_pct:+.2f}%)')
        print(f'  执行时间: {elapsed:.3f} 秒')
        
        if trade_count > 0:
            print(f'  平均处理速度: {trade_count/elapsed:.0f} 笔/秒')
        
        return {
            'strategy': strategy_name,
            'trade_count': trade_count,
            'final_value': final_value,
            'pnl': pnl,
            'return_pct': return_pct,
            'elapsed': elapsed,
            'success': True
        }
        
    except Exception as e:
        print(f'✗ 策略运行失败: {e}')
        import traceback
        traceback.print_exc()
        return {
            'strategy': strategy_name,
            'trade_count': 0,
            'success': False,
            'error': str(e)
        }

def main():
    """主测试函数"""
    print('='*80)
    print('🧪 策略实际测试 - 获取真实成交数据')
    print('='*80)
    
    if not BACKTRADER_AVAILABLE:
        print('\n❌ 无法运行测试: Backtrader未安装')
        return 1
    
    # 生成测试数据 (7天数据用于快速测试)
    df = generate_test_data(days=7, trend='mixed')
    
    # 要测试的策略
    strategies = [
        ('ReversalPattern', ReversalPatternStrategy, {
            'ma_len': 50,
            'rr_tp': 2.0,
            'rr_be': 1.0,
        }),
        ('HighFrequency', HighFrequencyStrategy, {
            'mode': 'always_long',
            'hold_bars': 1,
            'use_sl_tp': False,
        }),
        ('PendingOrder', PendingOrderStrategy, {
            'breakout_lookback': 20,
            'pullback_ratio': 0.5,
        }),
        ('Pyramid', PyramidStrategy, {
            'trend_ma_len': 50,
            'max_add_times': 3,
        }),
        ('Random', RandomStrategy, {
            'entry_prob': 0.05,  # 降低概率加快测试
            'close_prob': 0.1,
            'random_seed': 42,
        }),
    ]
    
    # 运行所有策略
    results = []
    for name, strategy_class, params in strategies:
        result = run_strategy_test(strategy_class, name, df, params)
        if result['success']:
            results.append(result)
    
    # 汇总结果
    print('\n' + '='*80)
    print('📊 测试结果汇总')
    print('='*80)
    
    if not results:
        print('❌ 没有成功的测试结果')
        return 1
    
    # 按成交笔数排序
    results.sort(key=lambda x: x['trade_count'], reverse=True)
    
    print(f'\n数据规模: {len(df)} 根K线 (7天1分钟数据)')
    print(f'测试策略: {len(results)} 个\n')
    
    print(f'{"排名":<6} {"策略":<20} {"成交笔数":<12} {"收益率":<12} {"耗时":<10}')
    print('-' * 80)
    
    for i, r in enumerate(results, 1):
        trade_count = f"{r['trade_count']} 笔"
        return_pct = f"{r['return_pct']:+.2f}%"
        elapsed = f"{r['elapsed']:.3f}秒"
        print(f'{i:<6} {r["strategy"]:<20} {trade_count:<12} {return_pct:<12} {elapsed:<10}')
    
    print('='*80)
    
    # 显示详细统计
    total_trades = sum(r['trade_count'] for r in results)
    max_trades = results[0]['trade_count'] if results else 0
    min_trades = results[-1]['trade_count'] if results else 0
    
    print(f'\n总成交笔数: {total_trades} 笔')
    print(f'最高: {max_trades} 笔 ({results[0]["strategy"]})')
    print(f'最低: {min_trades} 笔 ({results[-1]["strategy"]})')
    
    # 与预期对比
    print('\n' + '='*80)
    print('📈 实际 vs 预期对比 (7天数据)')
    print('='*80)
    
    # 7天预期值 (90天的1/13)
    expected = {
        'HighFrequency': 10080,
        'Random': 350,
        'ReversalPattern': 2,
        'PendingOrder': 1,
        'Pyramid': 1,
    }
    
    print(f'{"策略":<20} {"实际成交":<12} {"预期成交":<12} {"差异":<15}')
    print('-' * 80)
    
    for r in results:
        actual = r['trade_count']
        exp = expected.get(r['strategy'], 0)
        diff = actual - exp
        diff_pct = (diff / exp * 100) if exp > 0 else 0
        
        diff_str = f"{diff:+d} ({diff_pct:+.1f}%)" if exp > 0 else "N/A"
        print(f'{r["strategy"]:<20} {actual:<12} {exp:<12} {diff_str:<15}')
    
    print('='*80)
    print('\n✅ 实际测试完成！')
    
    return 0

if __name__ == '__main__':
    sys.exit(main())

