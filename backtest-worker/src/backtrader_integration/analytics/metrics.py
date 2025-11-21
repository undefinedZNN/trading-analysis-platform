"""
回测指标计算

提供各种回测统计指标的计算方法。
"""

import numpy as np
import pandas as pd
import logging
from typing import List, Tuple, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class MetricsCalculator:
    """
    指标计算器
    
    提供各种回测指标的计算方法。
    """
    
    @staticmethod
    def sharpe_ratio(
        returns: np.ndarray,
        risk_free_rate: float = 0.0,
        periods_per_year: int = 252
    ) -> float:
        """
        计算夏普比率
        
        Args:
            returns: 收益率序列
            risk_free_rate: 无风险利率（年化）
            periods_per_year: 每年的交易周期数（默认252个交易日）
        
        Returns:
            夏普比率
        """
        if len(returns) == 0:
            return 0.0
        
        # 计算平均收益率和标准差
        mean_return = np.mean(returns)
        std_return = np.std(returns, ddof=1)
        
        if std_return == 0:
            return 0.0
        
        # 夏普比率 = (平均收益率 - 无风险利率) / 收益率标准差 * sqrt(periods)
        sharpe = (mean_return - risk_free_rate / periods_per_year) / std_return * np.sqrt(periods_per_year)
        
        return float(sharpe)
    
    @staticmethod
    def sortino_ratio(
        returns: np.ndarray,
        risk_free_rate: float = 0.0,
        periods_per_year: int = 252
    ) -> float:
        """
        计算索提诺比率（Sortino Ratio）
        
        只考虑下行波动率。
        
        Args:
            returns: 收益率序列
            risk_free_rate: 无风险利率
            periods_per_year: 每年的交易周期数
        
        Returns:
            索提诺比率
        """
        if len(returns) == 0:
            return 0.0
        
        mean_return = np.mean(returns)
        
        # 只计算负收益的标准差（下行风险）
        negative_returns = returns[returns < 0]
        if len(negative_returns) == 0:
            return 0.0
        
        downside_std = np.std(negative_returns, ddof=1)
        
        if downside_std == 0:
            return 0.0
        
        sortino = (mean_return - risk_free_rate / periods_per_year) / downside_std * np.sqrt(periods_per_year)
        
        return float(sortino)
    
    @staticmethod
    def max_drawdown(equity_curve: np.ndarray) -> Tuple[float, int, int, int]:
        """
        计算最大回撤
        
        Args:
            equity_curve: 权益曲线
        
        Returns:
            (最大回撤百分比, 开始索引, 谷底索引, 结束索引)
        """
        if len(equity_curve) == 0:
            return 0.0, 0, 0, 0
        
        # 计算累计最大值
        cummax = np.maximum.accumulate(equity_curve)
        
        # 计算回撤
        drawdown = (equity_curve - cummax) / cummax
        
        # 找到最大回撤
        max_dd_idx = np.argmin(drawdown)
        max_dd = drawdown[max_dd_idx]
        
        # 找到回撤开始点（最大回撤之前的最高点）
        start_idx = np.argmax(equity_curve[:max_dd_idx + 1]) if max_dd_idx > 0 else 0
        
        # 找到回撤结束点（最大回撤之后恢复到新高的点）
        end_idx = max_dd_idx
        if max_dd_idx < len(equity_curve) - 1:
            for i in range(max_dd_idx + 1, len(equity_curve)):
                if equity_curve[i] >= cummax[start_idx]:
                    end_idx = i
                    break
        
        return float(abs(max_dd)), start_idx, max_dd_idx, end_idx
    
    @staticmethod
    def calmar_ratio(
        total_return: float,
        max_drawdown: float,
        years: float = 1.0
    ) -> float:
        """
        计算卡玛比率（Calmar Ratio）
        
        年化收益率 / 最大回撤
        
        Args:
            total_return: 总收益率
            max_drawdown: 最大回撤（正数）
            years: 时间跨度（年）
        
        Returns:
            卡玛比率
        """
        if max_drawdown == 0 or years == 0:
            return 0.0
        
        annualized_return = (1 + total_return) ** (1 / years) - 1
        calmar = annualized_return / max_drawdown
        
        return float(calmar)
    
    @staticmethod
    def win_rate(trades: List[float]) -> float:
        """
        计算胜率
        
        Args:
            trades: 交易盈亏列表
        
        Returns:
            胜率（0-1）
        """
        if len(trades) == 0:
            return 0.0
        
        winning_trades = sum(1 for t in trades if t > 0)
        win_rate = winning_trades / len(trades)
        
        return float(win_rate)
    
    @staticmethod
    def profit_factor(trades: List[float]) -> float:
        """
        计算盈亏比（Profit Factor）
        
        总盈利 / 总亏损
        
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
        
        return float(total_profit / total_loss)
    
    @staticmethod
    def average_win_loss_ratio(trades: List[float]) -> float:
        """
        计算平均盈亏比
        
        平均盈利 / 平均亏损
        
        Args:
            trades: 交易盈亏列表
        
        Returns:
            平均盈亏比
        """
        if len(trades) == 0:
            return 0.0
        
        winning_trades = [t for t in trades if t > 0]
        losing_trades = [t for t in trades if t < 0]
        
        if len(winning_trades) == 0 or len(losing_trades) == 0:
            return 0.0
        
        avg_win = np.mean(winning_trades)
        avg_loss = abs(np.mean(losing_trades))
        
        if avg_loss == 0:
            return 0.0
        
        return float(avg_win / avg_loss)
    
    @staticmethod
    def max_consecutive_wins(trades: List[float]) -> int:
        """
        计算最大连续盈利次数
        
        Args:
            trades: 交易盈亏列表
        
        Returns:
            最大连续盈利次数
        """
        if len(trades) == 0:
            return 0
        
        max_wins = 0
        current_wins = 0
        
        for trade in trades:
            if trade > 0:
                current_wins += 1
                max_wins = max(max_wins, current_wins)
            else:
                current_wins = 0
        
        return max_wins
    
    @staticmethod
    def max_consecutive_losses(trades: List[float]) -> int:
        """
        计算最大连续亏损次数
        
        Args:
            trades: 交易盈亏列表
        
        Returns:
            最大连续亏损次数
        """
        if len(trades) == 0:
            return 0
        
        max_losses = 0
        current_losses = 0
        
        for trade in trades:
            if trade < 0:
                current_losses += 1
                max_losses = max(max_losses, current_losses)
            else:
                current_losses = 0
        
        return max_losses
    
    @staticmethod
    def average_holding_period(holding_periods: List[int]) -> float:
        """
        计算平均持仓周期
        
        Args:
            holding_periods: 持仓周期列表（K线数）
        
        Returns:
            平均持仓周期
        """
        if len(holding_periods) == 0:
            return 0.0
        
        return float(np.mean(holding_periods))
    
    @staticmethod
    def expectancy(trades: List[float]) -> float:
        """
        计算期望值
        
        期望值 = (胜率 × 平均盈利) - (败率 × 平均亏损)
        
        Args:
            trades: 交易盈亏列表
        
        Returns:
            期望值
        """
        if len(trades) == 0:
            return 0.0
        
        winning_trades = [t for t in trades if t > 0]
        losing_trades = [t for t in trades if t < 0]
        
        win_rate = len(winning_trades) / len(trades)
        loss_rate = 1 - win_rate
        
        avg_win = np.mean(winning_trades) if winning_trades else 0
        avg_loss = abs(np.mean(losing_trades)) if losing_trades else 0
        
        expectancy = (win_rate * avg_win) - (loss_rate * avg_loss)
        
        return float(expectancy)
    
    @staticmethod
    def annualized_return(
        total_return: float,
        start_date: datetime,
        end_date: datetime
    ) -> float:
        """
        计算年化收益率
        
        Args:
            total_return: 总收益率
            start_date: 开始日期
            end_date: 结束日期
        
        Returns:
            年化收益率
        """
        days = (end_date - start_date).days
        if days <= 0:
            return 0.0
        
        years = days / 365.25
        annualized = (1 + total_return) ** (1 / years) - 1
        
        return float(annualized)
    
    @staticmethod
    def annualized_volatility(
        returns: np.ndarray,
        periods_per_year: int = 252
    ) -> float:
        """
        计算年化波动率
        
        Args:
            returns: 收益率序列
            periods_per_year: 每年的交易周期数
        
        Returns:
            年化波动率
        """
        if len(returns) == 0:
            return 0.0
        
        volatility = np.std(returns, ddof=1) * np.sqrt(periods_per_year)
        
        return float(volatility)
