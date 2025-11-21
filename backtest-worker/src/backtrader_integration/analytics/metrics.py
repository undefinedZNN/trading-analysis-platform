"""
统计指标计算

提供独立的指标计算函数。
"""

import numpy as np
from typing import List, Tuple, Optional


def calculate_sharpe_ratio(
    returns: np.ndarray,
    risk_free_rate: float = 0.0,
    periods: int = 252
) -> float:
    """
    计算夏普比率
    
    Args:
        returns: 收益率数组
        risk_free_rate: 无风险利率（年化）
        periods: 年化周期数（默认252个交易日）
    
    Returns:
        夏普比率
    """
    if len(returns) == 0:
        return 0.0
    
    avg_return = np.mean(returns)
    std_return = np.std(returns)
    
    if std_return == 0:
        return 0.0
    
    # 年化
    sharpe = (avg_return - risk_free_rate / periods) / std_return * np.sqrt(periods)
    
    return sharpe


def calculate_sortino_ratio(
    returns: np.ndarray,
    target_return: float = 0.0,
    periods: int = 252
) -> float:
    """
    计算索提诺比率
    
    Args:
        returns: 收益率数组
        target_return: 目标收益率
        periods: 年化周期数
    
    Returns:
        索提诺比率
    """
    if len(returns) == 0:
        return 0.0
    
    avg_return = np.mean(returns)
    
    # 下行偏差
    downside_returns = returns[returns < target_return]
    if len(downside_returns) == 0:
        return 0.0
    
    downside_std = np.std(downside_returns)
    
    if downside_std == 0:
        return 0.0
    
    sortino = (avg_return - target_return) / downside_std * np.sqrt(periods)
    
    return sortino


def calculate_max_drawdown(equity_curve: np.ndarray) -> Tuple[float, float, int, int]:
    """
    计算最大回撤
    
    Args:
        equity_curve: 权益曲线数组
    
    Returns:
        (最大回撤金额, 最大回撤百分比, 开始索引, 结束索引)
    """
    if len(equity_curve) == 0:
        return 0.0, 0.0, 0, 0
    
    peak = equity_curve[0]
    peak_idx = 0
    max_dd = 0.0
    max_dd_pct = 0.0
    start_idx = 0
    end_idx = 0
    
    for i, value in enumerate(equity_curve):
        if value > peak:
            peak = value
            peak_idx = i
        
        dd = peak - value
        dd_pct = dd / peak if peak > 0 else 0.0
        
        if dd_pct > max_dd_pct:
            max_dd = dd
            max_dd_pct = dd_pct
            start_idx = peak_idx
            end_idx = i
    
    return max_dd, max_dd_pct, start_idx, end_idx


def calculate_calmar_ratio(
    annualized_return: float,
    max_drawdown_pct: float
) -> float:
    """
    计算卡玛比率
    
    Args:
        annualized_return: 年化收益率
        max_drawdown_pct: 最大回撤百分比
    
    Returns:
        卡玛比率
    """
    if max_drawdown_pct == 0:
        return 0.0
    
    return annualized_return / abs(max_drawdown_pct)


def calculate_win_rate(trades: List[float]) -> float:
    """
    计算胜率
    
    Args:
        trades: 交易盈亏列表
    
    Returns:
        胜率（0-1）
    """
    if len(trades) == 0:
        return 0.0
    
    winning_trades = len([t for t in trades if t > 0])
    return winning_trades / len(trades)


def calculate_profit_factor(trades: List[float]) -> float:
    """
    计算盈亏比
    
    Args:
        trades: 交易盈亏列表
    
    Returns:
        盈亏比
    """
    if len(trades) == 0:
        return 0.0
    
    total_profit = sum(t for t in trades if t > 0)
    total_loss = abs(sum(t for t in trades if t < 0))
    
    if total_loss == 0:
        return float('inf') if total_profit > 0 else 0.0
    
    return total_profit / total_loss


def calculate_expectancy(trades: List[float]) -> float:
    """
    计算期望值（每笔交易的平均盈亏）
    
    Args:
        trades: 交易盈亏列表
    
    Returns:
        期望值
    """
    if len(trades) == 0:
        return 0.0
    
    return np.mean(trades)


def calculate_volatility(returns: np.ndarray, periods: int = 252) -> float:
    """
    计算波动率（年化）
    
    Args:
        returns: 收益率数组
        periods: 年化周期数
    
    Returns:
        年化波动率
    """
    if len(returns) == 0:
        return 0.0
    
    return np.std(returns) * np.sqrt(periods)


def calculate_annualized_return(
    total_return: float,
    days: int
) -> float:
    """
    计算年化收益率
    
    Args:
        total_return: 总收益率
        days: 交易天数
    
    Returns:
        年化收益率
    """
    if days == 0:
        return 0.0
    
    years = days / 365.0
    if years == 0:
        return 0.0
    
    annualized = (1 + total_return) ** (1 / years) - 1
    
    return annualized


def calculate_recovery_factor(
    net_profit: float,
    max_drawdown: float
) -> float:
    """
    计算恢复因子
    
    Args:
        net_profit: 净利润
        max_drawdown: 最大回撤金额
    
    Returns:
        恢复因子
    """
    if max_drawdown == 0:
        return 0.0
    
    return net_profit / abs(max_drawdown)


def calculate_information_ratio(
    returns: np.ndarray,
    benchmark_returns: np.ndarray,
    periods: int = 252
) -> float:
    """
    计算信息比率
    
    Args:
        returns: 策略收益率数组
        benchmark_returns: 基准收益率数组
        periods: 年化周期数
    
    Returns:
        信息比率
    """
    if len(returns) == 0 or len(benchmark_returns) == 0:
        return 0.0
    
    if len(returns) != len(benchmark_returns):
        min_len = min(len(returns), len(benchmark_returns))
        returns = returns[:min_len]
        benchmark_returns = benchmark_returns[:min_len]
    
    excess_returns = returns - benchmark_returns
    tracking_error = np.std(excess_returns)
    
    if tracking_error == 0:
        return 0.0
    
    return np.mean(excess_returns) / tracking_error * np.sqrt(periods)

