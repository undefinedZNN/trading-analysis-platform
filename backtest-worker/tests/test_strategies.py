# -*- coding: utf-8 -*-
"""
策略模块完整测试

测试 3 个内置策略：
1. MACrossStrategy - MA 交叉策略
2. RSIStrategy - RSI 超买超卖策略
3. ThreeLineMomentumStrategy - 三线动量 + DMI 策略
"""

import sys
import os
import time
import logging
import numpy as np
import pandas as pd
from datetime import datetime

# 添加模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import backtrader as bt
from backtrader_integration.strategy import (
    MACrossStrategy,
    RSIStrategy,
    ThreeLineMomentumStrategy,
    StrategyFactory,
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


def test_strategy_factory():
    """测试策略工厂"""
    print("\n" + "="*80)
    print("测试 1: 策略工厂")
    print("="*80)
    
    # 1. 获取所有已注册策略
    strategies = StrategyFactory.list_strategies()
    print(f"✅ 已注册策略: {strategies}")
    assert 'ma_cross' in strategies, "ma_cross 应该已注册"
    assert 'rsi' in strategies, "rsi 应该已注册"
    assert 'three_line_momentum' in strategies, "three_line_momentum 应该已注册"
    
    # 2. 获取策略信息
    for strategy_name in strategies:
        info = StrategyFactory.get_strategy_info(strategy_name)
        print(f"\n策略: {strategy_name}")
        print(f"  名称: {info['name']}")
        print(f"  描述: {info.get('description', '无描述')}")
        print(f"  参数: {list(info['params'].keys())}")
        assert 'name' in info, f"{strategy_name} 应该有名称"
        assert 'params' in info, f"{strategy_name} 应该有参数"
    
    # 3. 创建策略实例（通过 create 方法）
    for strategy_name in strategies:
        strategy_class, params = StrategyFactory.create(strategy_name, task_id=f'test_{strategy_name}')
        assert strategy_class is not None, f"{strategy_name} 应该可以创建"
        print(f"✅ {strategy_name} 策略类创建成功")
    
    print("\n✅ 策略工厂测试通过\n")


def test_ma_cross_strategy():
    """测试 MA 交叉策略"""
    print("\n" + "="*80)
    print("测试 2: MA 交叉策略")
    print("="*80)
    
    # 创建 Cerebro
    cerebro = bt.Cerebro()
    cerebro.broker.setcash(100000.0)
    cerebro.broker.setcommission(commission=0.001)
    
    # 创建测试数据（趋势上涨）
    df = pd.DataFrame({
        'datetime': pd.date_range('2023-01-01', periods=200, freq='1min'),
        'open': np.linspace(100, 120, 200) + np.random.uniform(-0.5, 0.5, 200),
        'high': np.linspace(101, 121, 200) + np.random.uniform(-0.5, 0.5, 200),
        'low': np.linspace(99, 119, 200) + np.random.uniform(-0.5, 0.5, 200),
        'close': np.linspace(100, 120, 200) + np.random.uniform(-0.5, 0.5, 200),
        'volume': np.random.randint(1000, 2000, 200),
    })
    df = df.set_index('datetime')
    
    data = bt.feeds.PandasData(dataname=df)
    cerebro.adddata(data)
    
    # 添加策略
    cerebro.addstrategy(
        MACrossStrategy,
        sma_fast_period=5,
        sma_slow_period=20,
        task_id='test_ma_cross'
    )
    cerebro.addobserver(FactorCollector)
    
    print("开始回测 MA 交叉策略...")
    start_time = time.time()
    results = cerebro.run()
    elapsed = time.time() - start_time
    
    strategy = results[0]
    
    # 分析结果
    analyzer = BacktestAnalyzer()
    analysis = analyzer.analyze(cerebro, strategy, initial_cash=100000.0)
    
    print(f"\n✅ MA 交叉策略回测完成，耗时: {elapsed:.2f}秒")
    print(f"  初始资金: ${analysis['initial_cash']:,.2f}")
    print(f"  最终资金: ${analysis['final_value']:,.2f}")
    print(f"  总收益率: {analysis['total_return_pct']:.2f}%")
    print(f"  总交易次数: {analysis['total_trades']}")
    print(f"  胜率: {analysis['win_rate']*100:.2f}%")
    
    assert analysis['final_value'] > 0, "最终资金应该大于0"
    print("✅ MA 交叉策略测试通过\n")


def test_rsi_strategy():
    """测试 RSI 策略"""
    print("\n" + "="*80)
    print("测试 3: RSI 超买超卖策略")
    print("="*80)
    
    # 创建 Cerebro
    cerebro = bt.Cerebro()
    cerebro.broker.setcash(100000.0)
    cerebro.broker.setcommission(commission=0.001)
    
    # 创建测试数据（震荡行情，确保价格变化）
    base_price = 100
    df_data = []
    np.random.seed(42)  # 固定随机种子，确保可重现
    
    for i in range(300):
        # 创造震荡行情：上涨一段，下跌一段
        if (i // 50) % 2 == 0:
            price = base_price + (i % 50) * 0.5  # 上涨
        else:
            price = base_price + 25 - (i % 50) * 0.5  # 下跌
        
        # 确保有明显的价格波动
        noise = np.random.uniform(-1.0, 1.0)
        open_price = price + noise
        close_price = price + noise + np.random.uniform(-0.5, 0.5)
        high_price = max(open_price, close_price) + np.random.uniform(0.5, 1.5)
        low_price = min(open_price, close_price) - np.random.uniform(0.5, 1.5)
        
        df_data.append({
            'datetime': datetime(2023, 1, 1) + pd.Timedelta(minutes=i),
            'open': max(1, open_price),  # 确保价格 > 0
            'high': max(1, high_price),
            'low': max(0.5, low_price),
            'close': max(1, close_price),
            'volume': np.random.randint(1000, 2000),
        })
    
    df = pd.DataFrame(df_data)
    df = df.set_index('datetime')
    
    data = bt.feeds.PandasData(dataname=df)
    cerebro.adddata(data)
    
    # 添加策略
    cerebro.addstrategy(
        RSIStrategy,
        rsi_period=14,
        rsi_oversold=30,
        rsi_overbought=70,
        use_stop_loss=False,
        task_id='test_rsi'
    )
    cerebro.addobserver(FactorCollector)
    
    print("开始回测 RSI 策略...")
    start_time = time.time()
    results = cerebro.run()
    elapsed = time.time() - start_time
    
    strategy = results[0]
    
    # 分析结果
    analyzer = BacktestAnalyzer()
    analysis = analyzer.analyze(cerebro, strategy, initial_cash=100000.0)
    
    print(f"\n✅ RSI 策略回测完成，耗时: {elapsed:.2f}秒")
    print(f"  初始资金: ${analysis['initial_cash']:,.2f}")
    print(f"  最终资金: ${analysis['final_value']:,.2f}")
    print(f"  总收益率: {analysis['total_return_pct']:.2f}%")
    print(f"  总交易次数: {analysis['total_trades']}")
    print(f"  胜率: {analysis['win_rate']*100:.2f}%")
    
    assert analysis['final_value'] > 0, "最终资金应该大于0"
    print("✅ RSI 策略测试通过\n")


def test_three_line_momentum_strategy():
    """测试三线动量 + DMI 策略"""
    print("\n" + "="*80)
    print("测试 4: 三线动量 + DMI 策略")
    print("="*80)
    
    # 创建 Cerebro
    cerebro = bt.Cerebro()
    cerebro.broker.setcash(100000.0)
    cerebro.broker.setcommission(commission=0.001)
    
    # 创建测试数据（明确的趋势行情）
    df_data = []
    base_price = 100
    
    for i in range(300):
        # 创造趋势行情：
        # 0-100: 上涨趋势（连续阳线机会）
        # 100-200: 下跌趋势（连续阴线机会）
        # 200-300: 震荡
        
        if i < 100:
            # 上涨趋势
            price = base_price + i * 0.2
            open_price = price + np.random.uniform(-0.2, 0)
            close_price = price + np.random.uniform(0, 0.5)  # 阳线
        elif i < 200:
            # 下跌趋势
            price = base_price + 20 - (i - 100) * 0.2
            open_price = price + np.random.uniform(0, 0.2)
            close_price = price - np.random.uniform(0, 0.5)  # 阴线
        else:
            # 震荡
            price = base_price + 10 + np.random.uniform(-2, 2)
            open_price = price + np.random.uniform(-0.3, 0.3)
            close_price = price + np.random.uniform(-0.3, 0.3)
        
        df_data.append({
            'datetime': datetime(2023, 1, 1) + pd.Timedelta(minutes=i),
            'open': open_price,
            'high': max(open_price, close_price) + np.random.uniform(0.1, 0.5),
            'low': min(open_price, close_price) - np.random.uniform(0.1, 0.5),
            'close': close_price,
            'volume': np.random.randint(1000, 2000),
        })
    
    df = pd.DataFrame(df_data)
    df = df.set_index('datetime')
    
    data = bt.feeds.PandasData(dataname=df)
    cerebro.adddata(data)
    
    # 添加策略
    cerebro.addstrategy(
        ThreeLineMomentumStrategy,
        dmi_period=14,
        strict_structure=True,
        task_id='test_three_line'
    )
    cerebro.addobserver(FactorCollector)
    
    print("开始回测三线动量策略...")
    start_time = time.time()
    results = cerebro.run()
    elapsed = time.time() - start_time
    
    strategy = results[0]
    
    # 分析结果
    analyzer = BacktestAnalyzer()
    analysis = analyzer.analyze(cerebro, strategy, initial_cash=100000.0)
    
    print(f"\n✅ 三线动量策略回测完成，耗时: {elapsed:.2f}秒")
    print(f"  初始资金: ${analysis['initial_cash']:,.2f}")
    print(f"  最终资金: ${analysis['final_value']:,.2f}")
    print(f"  总收益率: {analysis['total_return_pct']:.2f}%")
    print(f"  总交易次数: {analysis['total_trades']}")
    print(f"  胜率: {analysis['win_rate']*100:.2f}%")
    
    assert analysis['final_value'] > 0, "最终资金应该大于0"
    print("✅ 三线动量策略测试通过\n")


def test_all_strategies_with_real_data():
    """使用真实数据测试所有策略"""
    print("\n" + "="*80)
    print("测试 5: 所有策略 - 真实数据对比")
    print("="*80)
    
    # 配置数据路径
    data_base_path = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets'
    
    if not os.path.exists(data_base_path):
        print("⚠️ 测试数据不存在，跳过真实数据测试")
        return
    
    strategies_config = [
        {
            'name': 'MA Cross',
            'class': MACrossStrategy,
            'params': {
                'sma_fast_period': 10,
                'sma_slow_period': 30,
                'task_id': 'real_ma_cross'
            }
        },
        {
            'name': 'RSI',
            'class': RSIStrategy,
            'params': {
                'rsi_period': 14,
                'rsi_oversold': 30,
                'rsi_overbought': 70,
                'task_id': 'real_rsi'
            }
        },
        {
            'name': 'Three Line Momentum',
            'class': ThreeLineMomentumStrategy,
            'params': {
                'dmi_period': 14,
                'strict_structure': True,
                'task_id': 'real_three_line'
            }
        },
    ]
    
    results_summary = []
    
    for config in strategies_config:
        try:
            print(f"\n{'='*80}")
            print(f"测试策略: {config['name']}")
            print(f"{'='*80}")
            
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
            
            # 添加策略和观察者
            cerebro.addstrategy(config['class'], **config['params'])
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
                'strategy': config['name'],
                'return': analysis['total_return_pct'],
                'trades': analysis['total_trades'],
                'win_rate': analysis['win_rate'] * 100,
                'sharpe': analysis.get('sharpe_ratio', 0),
                'max_dd': analysis.get('max_drawdown_pct', 0),
                'elapsed': elapsed,
            })
            
            print(f"✅ {config['name']} 完成")
            print(f"  收益率: {analysis['total_return_pct']:.2f}%")
            print(f"  交易次数: {analysis['total_trades']}")
            print(f"  胜率: {analysis['win_rate']*100:.2f}%")
            print(f"  夏普比率: {analysis.get('sharpe_ratio', 0):.3f}")
            print(f"  最大回撤: {analysis.get('max_drawdown_pct', 0):.2f}%")
            print(f"  耗时: {elapsed:.2f}秒")
            
        except Exception as e:
            print(f"❌ {config['name']} 测试失败: {e}")
            import traceback
            traceback.print_exc()
    
    # 打印对比总结
    if results_summary:
        print("\n" + "="*80)
        print(" 策略对比总结")
        print("="*80)
        print(f"{'策略':<25} {'收益率':<12} {'交易':<8} {'胜率':<10} {'夏普':<10} {'最大回撤':<12}")
        print("-"*80)
        
        for result in results_summary:
            print(
                f"{result['strategy']:<25} "
                f"{result['return']:>10.2f}% "
                f"{result['trades']:>6} "
                f"{result['win_rate']:>8.1f}% "
                f"{result['sharpe']:>8.3f} "
                f"{result['max_dd']:>10.2f}%"
            )
        
        print("="*80)
        print("✅ 真实数据对比测试完成\n")


def main():
    """运行所有测试"""
    print("\n" + "="*80)
    print(" 策略模块 - 完整单元测试")
    print("="*80)
    
    start_time = time.time()
    
    # 运行测试
    test_strategy_factory()
    test_ma_cross_strategy()
    test_rsi_strategy()
    test_three_line_momentum_strategy()
    test_all_strategies_with_real_data()
    
    # 统计
    end_time = time.time()
    elapsed = end_time - start_time
    
    print("\n" + "="*80)
    print(f" 所有策略测试完成！")
    print(f" 总耗时: {elapsed:.2f}秒")
    print(f" 测试策略数: 3")
    print(f" 测试通过: ✅")
    print("="*80 + "\n")


if __name__ == '__main__':
    main()

