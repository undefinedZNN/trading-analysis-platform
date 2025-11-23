# -*- coding: utf-8 -*-
"""
高级策略测试
测试新增的5个策略：
1. ReversalPatternStrategy - 反转形态
2. HighFrequencyStrategy - 高频交易
3. PendingOrderStrategy - 挂单
4. PyramidStrategy - 金字塔加仓
5. RandomStrategy - 随机策略
"""

import unittest
import pandas as pd
import backtrader as bt
from datetime import datetime, timedelta
import sys
import os

# 添加路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.backtrader_integration.strategy import (
    StrategyFactory,
    ReversalPatternStrategy,
    HighFrequencyStrategy,
    PendingOrderStrategy,
    PyramidStrategy,
    RandomStrategy
)
from src.backtrader_integration.data import CachedParquetDataFeed


class TestAdvancedStrategies(unittest.TestCase):
    """高级策略测试"""
    
    @classmethod
    def setUpClass(cls):
        """准备测试数据"""
        # 生成90天的模拟数据
        start_date = datetime(2023, 1, 1)
        dates = [start_date + timedelta(minutes=i) for i in range(90 * 24 * 60)]
        
        # 生成趋势+波动数据
        base_price = 5000
        prices = []
        for i in range(len(dates)):
            # 添加趋势和随机波动
            trend = i * 0.005  # 上升趋势
            volatility = (hash(str(i)) % 100) - 50  # 伪随机波动
            price = base_price + trend + volatility
            prices.append(price)
        
        # 生成OHLCV数据
        data = []
        for i, (date, close) in enumerate(zip(dates, prices)):
            high = close * 1.002
            low = close * 0.998
            open_price = (close + prices[i-1]) / 2 if i > 0 else close
            volume = 1000000
            
            data.append({
                'datetime': date,
                'open': open_price,
                'high': high,
                'low': low,
                'close': close,
                'volume': volume
            })
        
        cls.df = pd.DataFrame(data)
        cls.df.set_index('datetime', inplace=True)
    
    def _run_backtest(self, strategy_class, strategy_params=None, cash=100000):
        """运行回测的辅助方法"""
        cerebro = bt.Cerebro()
        
        # 添加数据
        data = bt.feeds.PandasData(dataname=self.df)
        cerebro.adddata(data)
        
        # 添加策略
        if strategy_params:
            cerebro.addstrategy(strategy_class, **strategy_params)
        else:
            cerebro.addstrategy(strategy_class)
        
        # 设置初始资金
        cerebro.broker.setcash(cash)
        
        # 添加Value观察者用于权益曲线
        cerebro.addobserver(bt.observers.Value)
        
        # 运行回测
        print(f'\n{"="*60}')
        print(f'测试策略: {strategy_class.__name__}')
        print(f'初始资金: ${cash:,.2f}')
        print(f'{"="*60}')
        
        results = cerebro.run()
        strategy = results[0]
        
        final_value = cerebro.broker.getvalue()
        pnl = final_value - cash
        return_pct = (pnl / cash) * 100
        
        print(f'\n最终资金: ${final_value:,.2f}')
        print(f'盈亏: ${pnl:,.2f} ({return_pct:+.2f}%)')
        print(f'{"="*60}\n')
        
        return {
            'strategy': strategy,
            'final_value': final_value,
            'pnl': pnl,
            'return_pct': return_pct
        }
    
    def test_01_reversal_pattern_strategy(self):
        """测试反转形态策略"""
        print('\n' + '='*80)
        print('测试 1: 反转形态策略 (Pin Bar & Engulfing)')
        print('='*80)
        
        result = self._run_backtest(
            ReversalPatternStrategy,
            strategy_params={
                'ma_len': 50,
                'pin_long_wick_ratio': 0.66,
                'max_body_ratio': 0.3,
                'rr_tp': 2.0,
                'rr_be': 1.0,
                'rr_trail': 1.5,
            }
        )
        
        self.assertIsNotNone(result['strategy'])
        print(f'✓ 反转形态策略测试完成')
    
    def test_02_high_frequency_strategy_always_long(self):
        """测试高频策略 - 总是做多"""
        print('\n' + '='*80)
        print('测试 2: 高频策略 - 总是做多模式')
        print('='*80)
        
        result = self._run_backtest(
            HighFrequencyStrategy,
            strategy_params={
                'mode': 'always_long',
                'hold_bars': 1,
                'use_sl_tp': False,
            }
        )
        
        self.assertIsNotNone(result['strategy'])
        print(f'✓ 高频策略 (总是做多) 测试完成')
    
    def test_03_high_frequency_strategy_alternating(self):
        """测试高频策略 - 多空交替"""
        print('\n' + '='*80)
        print('测试 3: 高频策略 - 多空交替模式')
        print('='*80)
        
        result = self._run_backtest(
            HighFrequencyStrategy,
            strategy_params={
                'mode': 'alt_long_short',
                'hold_bars': 2,
                'use_sl_tp': True,
                'fixed_sl_pips': 20,
                'fixed_tp_pips': 20,
            }
        )
        
        self.assertIsNotNone(result['strategy'])
        print(f'✓ 高频策略 (多空交替) 测试完成')
    
    def test_04_pending_order_strategy(self):
        """测试挂单策略"""
        print('\n' + '='*80)
        print('测试 4: 挂单策略 (限价单回踩入场)')
        print('='*80)
        
        result = self._run_backtest(
            PendingOrderStrategy,
            strategy_params={
                'breakout_lookback': 20,
                'pullback_ratio': 0.5,
                'order_expire_bars': 5,
                'rr_tp': 2.0,
                'rr_sl': 1.0,
            }
        )
        
        self.assertIsNotNone(result['strategy'])
        print(f'✓ 挂单策略测试完成')
    
    def test_05_pyramid_strategy(self):
        """测试金字塔加仓策略"""
        print('\n' + '='*80)
        print('测试 5: 金字塔加仓策略')
        print('='*80)
        
        result = self._run_backtest(
            PyramidStrategy,
            strategy_params={
                'trend_ma_len': 50,
                'breakout_lookback': 20,
                'add_step_r': 1.0,
                'max_add_times': 3,
                'global_rr_tp': 3.0,
                'partial_tp_ratio': 0.5,
                'partial_tp_r': 2.0,
            }
        )
        
        self.assertIsNotNone(result['strategy'])
        print(f'✓ 金字塔加仓策略测试完成')
    
    def test_06_random_strategy(self):
        """测试随机策略"""
        print('\n' + '='*80)
        print('测试 6: 随机策略 (Monte Carlo 压力测试)')
        print('='*80)
        
        result = self._run_backtest(
            RandomStrategy,
            strategy_params={
                'entry_prob': 0.05,
                'long_prob': 0.5,
                'close_prob': 0.05,
                'max_hold_bars': 50,
                'use_sl_tp': True,
                'sl_min': 10,
                'sl_max': 30,
                'tp_min': 15,
                'tp_max': 40,
                'random_seed': 42,  # 固定种子确保可重现
            }
        )
        
        self.assertIsNotNone(result['strategy'])
        print(f'✓ 随机策略测试完成')
    
    def test_07_strategy_factory_registration(self):
        """测试策略工厂注册"""
        print('\n' + '='*80)
        print('测试 7: 策略工厂注册')
        print('='*80)
        
        # 检查所有新策略是否已注册
        strategies = [
            'reversal_pattern',
            'high_frequency',
            'pending_order',
            'pyramid',
            'random'
        ]
        
        for strategy_name in strategies:
            info = StrategyFactory.get_strategy_info(strategy_name)
            self.assertIsNotNone(info, f'策略 {strategy_name} 未注册')
            self.assertIn('name', info)
            self.assertIn('description', info)
            self.assertIn('params', info)
            print(f'✓ {strategy_name}: {info["description"]}')
        
        print(f'\n✓ 所有策略已正确注册')
    
    def test_08_all_strategies_comparison(self):
        """对比所有策略的表现"""
        print('\n' + '='*80)
        print('测试 8: 策略对比测试')
        print('='*80)
        
        strategies_config = [
            ('reversal_pattern', ReversalPatternStrategy, {}),
            ('high_frequency', HighFrequencyStrategy, {'mode': 'alt_long_short', 'hold_bars': 3}),
            ('pending_order', PendingOrderStrategy, {}),
            ('pyramid', PyramidStrategy, {}),
            ('random', RandomStrategy, {'random_seed': 42, 'entry_prob': 0.03}),
        ]
        
        results = []
        for name, strategy_class, params in strategies_config:
            try:
                result = self._run_backtest(strategy_class, params)
                results.append({
                    'name': name,
                    'return_pct': result['return_pct'],
                    'final_value': result['final_value']
                })
            except Exception as e:
                print(f'⚠️  {name} 执行失败: {e}')
        
        # 排序并显示结果
        results.sort(key=lambda x: x['return_pct'], reverse=True)
        
        print('\n' + '='*80)
        print('策略排名 (按收益率):')
        print('='*80)
        for i, r in enumerate(results, 1):
            print(f'{i}. {r["name"]:20s}: {r["return_pct"]:+8.2f}% (${r["final_value"]:,.2f})')
        print('='*80)


if __name__ == '__main__':
    # 运行测试
    unittest.main(verbosity=2)

