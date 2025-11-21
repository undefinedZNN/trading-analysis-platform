"""
统计分析模块

提供：
- BacktestAnalyzer: 回测分析器
- 各种统计指标计算函数
"""

from .backtest_analyzer import (
    BacktestAnalyzer,
    create_analyzer_from_cerebro,
)

from .metrics import (
    calculate_sharpe_ratio,
    calculate_sortino_ratio,
    calculate_max_drawdown,
    calculate_calmar_ratio,
    calculate_win_rate,
    calculate_profit_factor,
    calculate_expectancy,
    calculate_volatility,
    calculate_annualized_return,
    calculate_recovery_factor,
    calculate_information_ratio,
)

__all__ = [
    # 分析器
    'BacktestAnalyzer',
    'create_analyzer_from_cerebro',
    
    # 指标函数
    'calculate_sharpe_ratio',
    'calculate_sortino_ratio',
    'calculate_max_drawdown',
    'calculate_calmar_ratio',
    'calculate_win_rate',
    'calculate_profit_factor',
    'calculate_expectancy',
    'calculate_volatility',
    'calculate_annualized_return',
    'calculate_recovery_factor',
    'calculate_information_ratio',
]

