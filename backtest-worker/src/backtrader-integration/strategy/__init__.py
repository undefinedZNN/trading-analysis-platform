"""
策略执行模块

提供：
- BaseStrategy: 策略基类
- StrategyFactory: 策略工厂
- StrategyValidator: 策略验证器
- MACrossStrategy: 示例 MA 交叉策略
"""

from .base_strategy import (
    BaseStrategy,
    StrategyFactory,
    StrategyValidator,
)
from .ma_cross_strategy import MACrossStrategy

# 自动注册内置策略
StrategyFactory.register('ma_cross', MACrossStrategy)

__all__ = [
    'BaseStrategy',
    'StrategyFactory',
    'StrategyValidator',
    'MACrossStrategy',
]

