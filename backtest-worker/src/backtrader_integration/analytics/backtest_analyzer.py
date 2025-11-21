"""
回测分析器

用于计算回测的各种统计指标。
重构自 POC: poc/backtrader-poc/src/05_complete_backtest.py
"""

import numpy as np
import pandas as pd
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class BacktestAnalyzer:
    """
    回测分析器
    
    计算回测的统计指标：
    - 收益率指标：总收益率、年化收益率
    - 风险指标：夏普比率、最大回撤、波动率
    - 交易指标：胜率、盈亏比、平均持仓时间
    - 其他指标：交易次数、卡玛比率等
    """
    
    def __init__(self):
        """初始化分析器"""
        self.trades: List[Dict[str, Any]] = []
        self.equity_curve: List[Dict[str, Any]] = []
        self.initial_cash = 0.0
        self.final_value = 0.0
        
        logger.info("BacktestAnalyzer initialized")
    
    def add_trade(self, trade_data: Dict[str, Any]) -> None:
        """
        添加交易记录
        
        Args:
            trade_data: 交易数据字典，包含：
                - entry_date: 入场日期
                - exit_date: 出场日期
                - entry_price: 入场价格
                - exit_price: 出场价格
                - size: 仓位大小
                - pnl: 盈亏
                - pnl_percent: 盈亏百分比
                - commission: 佣金
                - holding_bars: 持仓K线数
        """
        self.trades.append(trade_data)
        logger.debug(f"Trade added: pnl={trade_data.get('pnl', 0):.2f}")
    
    def add_equity_point(self, date: datetime, value: float, cash: float) -> None:
        """
        添加权益曲线点
        
        Args:
            date: 日期
            value: 账户总价值
            cash: 可用现金
        """
        self.equity_curve.append({
            'date': date,
            'value': value,
            'cash': cash,
        })
    
    def set_initial_cash(self, cash: float) -> None:
        """设置初始资金"""
        self.initial_cash = cash
    
    def set_final_value(self, value: float) -> None:
        """设置最终价值"""
        self.final_value = value
    
    def analyze(self) -> Dict[str, Any]:
        """
        执行完整分析
        
        Returns:
            包含所有统计指标的字典
        """
        logger.info("Starting backtest analysis...")
        
        results = {
            'summary': self._calculate_summary(),
            'returns': self._calculate_returns(),
            'risk': self._calculate_risk(),
            'trades': self._calculate_trade_stats(),
            'equity': self._analyze_equity_curve(),
        }
        
        logger.info(f"Analysis completed: total_return={results['returns']['total_return']:.2%}")
        
        return results
    
    def _calculate_summary(self) -> Dict[str, Any]:
        """计算摘要信息"""
        return {
            'initial_cash': self.initial_cash,
            'final_value': self.final_value,
            'total_trades': len(self.trades),
            'winning_trades': len([t for t in self.trades if t.get('pnl', 0) > 0]),
            'losing_trades': len([t for t in self.trades if t.get('pnl', 0) < 0]),
        }
    
    def _calculate_returns(self) -> Dict[str, Any]:
        """计算收益率指标"""
        if self.initial_cash == 0:
            return {
                'total_return': 0.0,
                'annualized_return': 0.0,
            }
        
        # 总收益率
        total_return = (self.final_value - self.initial_cash) / self.initial_cash
        
        # 年化收益率（假设交易天数）
        if len(self.equity_curve) > 1:
            days = (self.equity_curve[-1]['date'] - self.equity_curve[0]['date']).days
            years = max(days / 365.0, 1/365.0)  # 至少1天
            annualized_return = (1 + total_return) ** (1 / years) - 1
        else:
            annualized_return = 0.0
        
        return {
            'total_return': total_return,
            'annualized_return': annualized_return,
            'absolute_profit': self.final_value - self.initial_cash,
        }
    
    def _calculate_risk(self) -> Dict[str, Any]:
        """计算风险指标"""
        if len(self.equity_curve) < 2:
            return {
                'sharpe_ratio': 0.0,
                'max_drawdown': 0.0,
                'max_drawdown_percent': 0.0,
                'volatility': 0.0,
                'calmar_ratio': 0.0,
            }
        
        # 计算日收益率
        values = [point['value'] for point in self.equity_curve]
        returns = np.diff(values) / values[:-1]
        
        # 波动率（年化）
        volatility = np.std(returns) * np.sqrt(252) if len(returns) > 0 else 0.0
        
        # 夏普比率（假设无风险利率为 0）
        if volatility > 0:
            avg_return = np.mean(returns)
            sharpe_ratio = (avg_return * 252) / volatility  # 年化
        else:
            sharpe_ratio = 0.0
        
        # 最大回撤
        max_dd, max_dd_pct = self._calculate_max_drawdown(values)
        
        # 卡玛比率（年化收益率 / 最大回撤）
        returns_data = self._calculate_returns()
        annualized_return = returns_data['annualized_return']
        calmar_ratio = annualized_return / abs(max_dd_pct) if max_dd_pct != 0 else 0.0
        
        return {
            'sharpe_ratio': sharpe_ratio,
            'max_drawdown': max_dd,
            'max_drawdown_percent': max_dd_pct,
            'volatility': volatility,
            'calmar_ratio': calmar_ratio,
            'sortino_ratio': self._calculate_sortino_ratio(returns),
        }
    
    def _calculate_max_drawdown(self, values: List[float]) -> tuple:
        """
        计算最大回撤
        
        Args:
            values: 权益值列表
        
        Returns:
            (最大回撤金额, 最大回撤百分比)
        """
        if not values or len(values) < 2:
            return 0.0, 0.0
        
        peak = values[0]
        max_dd = 0.0
        max_dd_pct = 0.0
        
        for value in values:
            if value > peak:
                peak = value
            
            dd = peak - value
            dd_pct = dd / peak if peak > 0 else 0.0
            
            if dd > max_dd:
                max_dd = dd
                max_dd_pct = dd_pct
        
        return max_dd, max_dd_pct
    
    def _calculate_sortino_ratio(self, returns: np.ndarray) -> float:
        """
        计算索提诺比率（只考虑下行波动率）
        
        Args:
            returns: 收益率数组
        
        Returns:
            索提诺比率
        """
        if len(returns) == 0:
            return 0.0
        
        avg_return = np.mean(returns)
        
        # 下行偏差（只考虑负收益）
        downside_returns = returns[returns < 0]
        if len(downside_returns) > 0:
            downside_std = np.std(downside_returns) * np.sqrt(252)
            if downside_std > 0:
                return (avg_return * 252) / downside_std
        
        return 0.0
    
    def _calculate_trade_stats(self) -> Dict[str, Any]:
        """计算交易统计"""
        if not self.trades:
            return {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0.0,
                'profit_factor': 0.0,
                'avg_profit': 0.0,
                'avg_loss': 0.0,
                'avg_win': 0.0,
                'max_win': 0.0,
                'max_loss': 0.0,
                'avg_holding_bars': 0.0,
            }
        
        # 分类交易
        winning_trades = [t for t in self.trades if t.get('pnl', 0) > 0]
        losing_trades = [t for t in self.trades if t.get('pnl', 0) < 0]
        
        # 胜率
        win_rate = len(winning_trades) / len(self.trades) if self.trades else 0.0
        
        # 盈亏比
        total_profit = sum(t['pnl'] for t in winning_trades)
        total_loss = abs(sum(t['pnl'] for t in losing_trades))
        profit_factor = total_profit / total_loss if total_loss > 0 else 0.0
        
        # 平均值
        avg_profit = np.mean([t['pnl'] for t in self.trades]) if self.trades else 0.0
        avg_win = np.mean([t['pnl'] for t in winning_trades]) if winning_trades else 0.0
        avg_loss = np.mean([t['pnl'] for t in losing_trades]) if losing_trades else 0.0
        
        # 最大值
        max_win = max([t['pnl'] for t in winning_trades]) if winning_trades else 0.0
        max_loss = min([t['pnl'] for t in losing_trades]) if losing_trades else 0.0
        
        # 平均持仓时间
        avg_holding_bars = np.mean([t.get('holding_bars', 0) for t in self.trades]) if self.trades else 0.0
        
        return {
            'total_trades': len(self.trades),
            'winning_trades': len(winning_trades),
            'losing_trades': len(losing_trades),
            'win_rate': win_rate,
            'profit_factor': profit_factor,
            'avg_profit': avg_profit,
            'avg_loss': avg_loss,
            'avg_win': avg_win,
            'max_win': max_win,
            'max_loss': max_loss,
            'avg_holding_bars': avg_holding_bars,
            'expectancy': avg_profit,  # 期望值
        }
    
    def _analyze_equity_curve(self) -> Dict[str, Any]:
        """分析权益曲线"""
        if len(self.equity_curve) < 2:
            return {
                'total_points': 0,
                'start_date': None,
                'end_date': None,
                'duration_days': 0,
            }
        
        return {
            'total_points': len(self.equity_curve),
            'start_date': self.equity_curve[0]['date'],
            'end_date': self.equity_curve[-1]['date'],
            'duration_days': (self.equity_curve[-1]['date'] - self.equity_curve[0]['date']).days,
        }
    
    def to_dict(self) -> Dict[str, Any]:
        """
        转换为字典（用于保存）
        
        Returns:
            包含所有数据的字典
        """
        return {
            'trades': self.trades,
            'equity_curve': [
                {
                    'date': point['date'].isoformat(),
                    'value': point['value'],
                    'cash': point['cash'],
                }
                for point in self.equity_curve
            ],
            'initial_cash': self.initial_cash,
            'final_value': self.final_value,
            'analysis': self.analyze(),
        }
    
    def to_dataframe(self) -> pd.DataFrame:
        """
        将交易记录转换为 DataFrame
        
        Returns:
            交易记录 DataFrame
        """
        if not self.trades:
            return pd.DataFrame()
        
        return pd.DataFrame(self.trades)
    
    def get_equity_curve_df(self) -> pd.DataFrame:
        """
        获取权益曲线 DataFrame
        
        Returns:
            权益曲线 DataFrame
        """
        if not self.equity_curve:
            return pd.DataFrame()
        
        df = pd.DataFrame(self.equity_curve)
        df = df.set_index('date')
        return df
    
    def print_summary(self) -> None:
        """打印摘要报告"""
        results = self.analyze()
        
        print("\n" + "="*60)
        print(" 回测分析报告")
        print("="*60)
        
        # 摘要
        print("\n【摘要】")
        summary = results['summary']
        print(f"  初始资金: ${summary['initial_cash']:,.2f}")
        print(f"  最终资金: ${summary['final_value']:,.2f}")
        print(f"  总交易次数: {summary['total_trades']}")
        print(f"  盈利次数: {summary['winning_trades']}")
        print(f"  亏损次数: {summary['losing_trades']}")
        
        # 收益
        print("\n【收益指标】")
        returns = results['returns']
        print(f"  总收益率: {returns['total_return']:.2%}")
        print(f"  年化收益率: {returns['annualized_return']:.2%}")
        print(f"  绝对收益: ${returns['absolute_profit']:,.2f}")
        
        # 风险
        print("\n【风险指标】")
        risk = results['risk']
        print(f"  夏普比率: {risk['sharpe_ratio']:.2f}")
        print(f"  最大回撤: ${risk['max_drawdown']:,.2f} ({risk['max_drawdown_percent']:.2%})")
        print(f"  波动率: {risk['volatility']:.2%}")
        print(f"  卡玛比率: {risk['calmar_ratio']:.2f}")
        print(f"  索提诺比率: {risk['sortino_ratio']:.2f}")
        
        # 交易
        print("\n【交易指标】")
        trades = results['trades']
        print(f"  胜率: {trades['win_rate']:.2%}")
        print(f"  盈亏比: {trades['profit_factor']:.2f}")
        print(f"  平均盈利: ${trades['avg_win']:.2f}")
        print(f"  平均亏损: ${trades['avg_loss']:.2f}")
        print(f"  最大盈利: ${trades['max_win']:.2f}")
        print(f"  最大亏损: ${trades['max_loss']:.2f}")
        print(f"  平均持仓: {trades['avg_holding_bars']:.1f} bars")
        print(f"  期望值: ${trades['expectancy']:.2f}")
        
        print("\n" + "="*60 + "\n")


def create_analyzer_from_cerebro(cerebro, initial_cash: float = 100000.0) -> BacktestAnalyzer:
    """
    从 Cerebro 创建分析器（便捷函数）
    
    Args:
        cerebro: Backtrader Cerebro 实例（已运行）
        initial_cash: 初始资金
    
    Returns:
        BacktestAnalyzer 实例
    """
    analyzer = BacktestAnalyzer()
    analyzer.set_initial_cash(initial_cash)
    analyzer.set_final_value(cerebro.broker.getvalue())
    
    return analyzer

