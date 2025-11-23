# -*- coding: utf-8 -*-
"""
简单的策略注册验证脚本
"""

import sys
import os

# 添加路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from src.backtrader_integration.strategy import (
        StrategyFactory,
        ReversalPatternStrategy,
        HighFrequencyStrategy,
        PendingOrderStrategy,
        PyramidStrategy,
        RandomStrategy
    )
    
    print('='*80)
    print('策略注册验证')
    print('='*80)
    
    strategies = [
        ('ma_cross', 'MA交叉策略'),
        ('rsi', 'RSI超买超卖策略'),
        ('three_line_momentum', '三线动量+DMI策略'),
        ('reversal_pattern', '反转形态策略'),
        ('high_frequency', '最高频策略'),
        ('pending_order', '挂单策略'),
        ('pyramid', '金字塔加仓策略'),
        ('random', '随机策略'),
    ]
    
    success_count = 0
    for strategy_name, description in strategies:
        try:
            info = StrategyFactory.get_strategy_info(strategy_name)
            print(f'✓ {strategy_name:25s}: {info.get("description", description)}')
            success_count += 1
        except Exception as e:
            print(f'✗ {strategy_name:25s}: 注册失败 - {e}')
    
    print('='*80)
    print(f'成功注册: {success_count}/{len(strategies)} 个策略')
    print('='*80)
    
    if success_count == len(strategies):
        print('\n✅ 所有策略已成功注册!')
        sys.exit(0)
    else:
        print(f'\n⚠️  {len(strategies) - success_count} 个策略注册失败')
        sys.exit(1)

except ImportError as e:
    print(f'导入错误: {e}')
    sys.exit(1)
except Exception as e:
    print(f'未知错误: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)

