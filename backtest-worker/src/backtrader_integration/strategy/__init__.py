"""
策略执行模块

提供：
- BaseStrategy: 策略基类
- StrategyFactory: 策略工厂
- StrategyValidator: 策略验证器
- MACrossStrategy: MA 交叉策略
- RSIStrategy: RSI 超买超卖策略
- ThreeLineMomentumStrategy: 三线动量 + DMI 策略
- ReversalPatternStrategy: 反转形态策略 (Pin Bar & Engulfing)
- HighFrequencyStrategy: 最高频策略 (压力测试)
- PendingOrderStrategy: 挂单策略 (限价单测试)
- PyramidStrategy: 金字塔加仓策略 (多仓位管理)
- RandomStrategy: 随机策略 (Monte Carlo 压力测试)
"""

from .base_strategy import (
    BaseStrategy,
    StrategyFactory,
    StrategyValidator,
)
from .ma_cross_strategy import MACrossStrategy
from .rsi_strategy import RSIStrategy
from .three_line_momentum_strategy import ThreeLineMomentumStrategy
from .reversal_pattern_strategy import ReversalPatternStrategy
from .high_frequency_strategy import HighFrequencyStrategy
from .pending_order_strategy import PendingOrderStrategy
from .pyramid_strategy import PyramidStrategy
from .random_strategy import RandomStrategy
from .three_line_trend_atr_strategy import ThreeLineTrendAtrStrategy

# 自动注册内置策略
StrategyFactory.register('ma_cross', MACrossStrategy)
StrategyFactory.register('rsi', RSIStrategy)
StrategyFactory.register('three_line_momentum', ThreeLineMomentumStrategy)
StrategyFactory.register('reversal_pattern', ReversalPatternStrategy)
StrategyFactory.register('high_frequency', HighFrequencyStrategy)
StrategyFactory.register('pending_order', PendingOrderStrategy)
StrategyFactory.register('pyramid', PyramidStrategy)
StrategyFactory.register('random', RandomStrategy)
StrategyFactory.register('three_line_trend_atr', ThreeLineTrendAtrStrategy)

__all__ = [
    'BaseStrategy',
    'StrategyFactory',
    'StrategyValidator',
    'MACrossStrategy',
    'RSIStrategy',
    'ThreeLineMomentumStrategy',
    'ReversalPatternStrategy',
    'HighFrequencyStrategy',
    'PendingOrderStrategy',
    'PyramidStrategy',
    'RandomStrategy',
    'ThreeLineTrendAtrStrategy',
]
