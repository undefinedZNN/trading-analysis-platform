"""
策略执行模块

提供：
- BaseStrategy: 策略基类
- StrategyFactory: 策略工厂
- StrategyValidator: 策略验证器
- MACrossStrategy: MA 交叉策略
- RSIStrategy: RSI 超买超卖策略
- ThreeLineMomentumStrategy: 三线动量 + DMI 策略
"""

from .base_strategy import (
    BaseStrategy,
    StrategyFactory,
    StrategyValidator,
)
from .ma_cross_strategy import MACrossStrategy
from .rsi_strategy import RSIStrategy
from .three_line_momentum_strategy import ThreeLineMomentumStrategy

# 自动注册内置策略
StrategyFactory.register('ma_cross', MACrossStrategy)
StrategyFactory.register('rsi', RSIStrategy)
StrategyFactory.register('three_line_momentum', ThreeLineMomentumStrategy)

__all__ = [
    'BaseStrategy',
    'StrategyFactory',
    'StrategyValidator',
    'MACrossStrategy',
    'RSIStrategy',
    'ThreeLineMomentumStrategy',
]

