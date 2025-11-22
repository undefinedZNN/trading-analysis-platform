"""
回测分析器

从 Backtrader 结果中提取数据并计算各种统计指标。
重构自 POC: poc/backtrader-poc/src/05_complete_backtest.py
"""

import numpy as np
import pandas as pd
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import backtrader as bt

from .metrics import MetricsCalculator

logger = logging.getLogger(__name__)


class BacktestAnalyzer:
    """
    回测分析器
    
    从 Backtrader 结果中提取数据并计算统计指标。
    """
    
    def __init__(self):
        """初始化分析器"""
        self.metrics_calc = MetricsCalculator()
        logger.info("BacktestAnalyzer initialized")
    
    def analyze(
        self,
        cerebro: bt.Cerebro,
        strategy: bt.Strategy,
        initial_cash: float = 100000.0
    ) -> Dict[str, Any]:
        """
        分析回测结果
        
        Args:
            cerebro: Cerebro 实例
            strategy: 策略实例
            initial_cash: 初始资金
        
        Returns:
            分析结果字典
        """
        logger.info("Starting backtest analysis...")
        
        try:
            # 基础信息
            final_value = cerebro.broker.getvalue()
            total_return = (final_value - initial_cash) / initial_cash
            
            # 提取交易数据
            trades_data = self._extract_trades_data(strategy)
            
            # 提取权益曲线
            equity_curve = self._extract_equity_curve(strategy, initial_cash)
            
            # 计算各项指标
            results = {
                # 基础指标
                'initial_cash': initial_cash,
                'final_value': final_value,
                'total_return': total_return,
                'total_return_pct': total_return * 100,
                
                # 交易统计
                'total_trades': len(trades_data['pnl']),
                'winning_trades': sum(1 for p in trades_data['pnl'] if p > 0),
                'losing_trades': sum(1 for p in trades_data['pnl'] if p < 0),
                
                # 胜率和盈亏
                'win_rate': self.metrics_calc.win_rate(trades_data['pnl']),
                'profit_factor': self.metrics_calc.profit_factor(trades_data['pnl']),
                'avg_win_loss_ratio': self.metrics_calc.average_win_loss_ratio(trades_data['pnl']),
                
                # 期望值
                'expectancy': self.metrics_calc.expectancy(trades_data['pnl']),
                
                # 连续盈亏
                'max_consecutive_wins': self.metrics_calc.max_consecutive_wins(trades_data['pnl']),
                'max_consecutive_losses': self.metrics_calc.max_consecutive_losses(trades_data['pnl']),
                
                # 持仓统计
                'avg_holding_period': self.metrics_calc.average_holding_period(trades_data['holding_periods']),
                
                # 盈亏统计
                'total_profit': sum(p for p in trades_data['pnl'] if p > 0),
                'total_loss': sum(p for p in trades_data['pnl'] if p < 0),
                'avg_profit_per_trade': np.mean(trades_data['pnl']) if trades_data['pnl'] else 0,
                'max_profit': max(trades_data['pnl']) if trades_data['pnl'] else 0,
                'max_loss': min(trades_data['pnl']) if trades_data['pnl'] else 0,
            }
            
            # 权益曲线指标
            if len(equity_curve) > 0:
                returns = np.diff(equity_curve) / equity_curve[:-1]
                
                # 夏普比率
                results['sharpe_ratio'] = self.metrics_calc.sharpe_ratio(returns)
                results['sortino_ratio'] = self.metrics_calc.sortino_ratio(returns)
                
                # 最大回撤
                max_dd, dd_start, dd_valley, dd_end = self.metrics_calc.max_drawdown(equity_curve)
                results['max_drawdown'] = max_dd
                results['max_drawdown_pct'] = max_dd * 100
                results['max_drawdown_start_idx'] = dd_start
                results['max_drawdown_valley_idx'] = dd_valley
                results['max_drawdown_end_idx'] = dd_end
                
                # 卡玛比率
                if 'start_date' in trades_data and 'end_date' in trades_data:
                    years = (trades_data['end_date'] - trades_data['start_date']).days / 365.25
                    results['calmar_ratio'] = self.metrics_calc.calmar_ratio(
                        total_return, max_dd, max(years, 0.001)
                    )
                    
                    # 年化收益率
                    results['annualized_return'] = self.metrics_calc.annualized_return(
                        total_return, trades_data['start_date'], trades_data['end_date']
                    )
                    results['annualized_return_pct'] = results['annualized_return'] * 100
                else:
                    results['calmar_ratio'] = 0.0
                    results['annualized_return'] = 0.0
                    results['annualized_return_pct'] = 0.0
                
                # 年化波动率
                results['annualized_volatility'] = self.metrics_calc.annualized_volatility(returns)
                results['annualized_volatility_pct'] = results['annualized_volatility'] * 100
            
            else:
                # 没有权益曲线数据
                results.update({
                    'sharpe_ratio': 0.0,
                    'sortino_ratio': 0.0,
                    'max_drawdown': 0.0,
                    'max_drawdown_pct': 0.0,
                    'calmar_ratio': 0.0,
                    'annualized_return': 0.0,
                    'annualized_return_pct': 0.0,
                    'annualized_volatility': 0.0,
                    'annualized_volatility_pct': 0.0,
                })
            
            # 数据序列
            results['equity_curve'] = equity_curve.tolist() if len(equity_curve) > 0 else []
            results['trades'] = trades_data
            
            logger.info(
                f"Analysis completed: total_return={results['total_return_pct']:.2f}%, "
                f"sharpe={results['sharpe_ratio']:.2f}, "
                f"max_dd={results['max_drawdown_pct']:.2f}%"
            )
            
            return results
            
        except Exception as e:
            logger.error(f"Failed to analyze backtest: {e}", exc_info=True)
            return self._get_empty_results(initial_cash)
    
    def _extract_trades_data(self, strategy: bt.Strategy) -> Dict[str, Any]:
        """
        从策略中提取交易数据
        
        Args:
            strategy: 策略实例
        
        Returns:
            交易数据字典
        """
        trades_data = {
            'pnl': [],
            'holding_periods': [],
            'entry_dates': [],
            'exit_dates': [],
            'start_date': None,
            'end_date': None,
        }
        
        try:
            # 尝试从 Backtrader 的内部数据结构获取交易信息
            # 注意：这需要策略记录交易信息
            
            # 如果策略有自定义的交易记录
            if hasattr(strategy, '_trades'):
                for trade in strategy._trades:
                    if 'pnl' in trade:
                        trades_data['pnl'].append(trade['pnl'])
                    if 'holding_period' in trade:
                        trades_data['holding_periods'].append(trade['holding_period'])
            
            # 尝试从因子收集器获取交易数据
            # 优先使用 strategy.factor_collector（BaseStrategy设置的）
            if hasattr(strategy, 'factor_collector') and strategy.factor_collector is not None:
                try:
                    factor_collector = strategy.factor_collector
                    
                    # 直接从trades列表获取（包含完整的入场和出场信息）
                    for trade in factor_collector.trades:
                        if 'pnl' in trade:
                            trades_data['pnl'].append(trade['pnl'])
                        if 'holding_bars' in trade:
                            trades_data['holding_periods'].append(trade['holding_bars'])
                        if 'entry_datetime' in trade:
                            if trades_data['start_date'] is None or trade['entry_datetime'] < trades_data['start_date']:
                                trades_data['start_date'] = trade['entry_datetime']
                        if 'exit_datetime' in trade:
                            if trades_data['end_date'] is None or trade['exit_datetime'] > trades_data['end_date']:
                                trades_data['end_date'] = trade['exit_datetime']
                
                except Exception as e:
                    logger.warning(f"Could not extract trades from factor collector: {e}")
            
            # 如果没有找到日期，使用数据的日期范围
            if trades_data['start_date'] is None and hasattr(strategy, 'data'):
                try:
                    if len(strategy.data) > 0:
                        trades_data['start_date'] = strategy.data.datetime.datetime(0)
                        trades_data['end_date'] = strategy.data.datetime.datetime(-1)
                except:
                    pass
            
            # 使用默认日期
            if trades_data['start_date'] is None:
                trades_data['start_date'] = datetime.now()
                trades_data['end_date'] = datetime.now()
            
        except Exception as e:
            logger.warning(f"Failed to extract trades data: {e}")
        
        return trades_data
    
    def _extract_equity_curve(
        self,
        strategy: bt.Strategy,
        initial_cash: float
    ) -> np.ndarray:
        """
        提取权益曲线
        
        Args:
            strategy: 策略实例
            initial_cash: 初始资金
        
        Returns:
            权益曲线数组
        """
        equity_curve = []
        
        try:
            # 尝试从策略的观察者获取权益曲线
            # 使用 getobservers() 方法而不是 _observers 属性
            if hasattr(strategy, 'getobservers'):
                for observer in strategy.getobservers():
                    # Backtrader 的内置 Value 观察者
                    if observer.__class__.__name__ == 'Value':
                        # 使用 .array 属性提取所有权益值
                        value_line = observer.lines.value
                        equity_array = value_line.array
                        
                        # 过滤有效值（>0 且不是 nan）
                        for value in equity_array:
                            if value > 0 and value == value:  # value == value 用于过滤 nan
                                equity_curve.append(value)
                        
                        logger.debug(f"Extracted {len(equity_curve)} equity curve points from Value observer")
                        break
            
            # 如果没有找到，尝试从策略本身构建权益曲线
            if len(equity_curve) == 0:
                logger.warning("No Value observer found, using simple equity curve (initial + final)")
                equity_curve = [initial_cash, strategy.broker.getvalue()]
        
        except Exception as e:
            logger.warning(f"Failed to extract equity curve: {e}")
            equity_curve = [initial_cash, strategy.broker.getvalue()]
        
        return np.array(equity_curve)
    
    def _get_empty_results(self, initial_cash: float) -> Dict[str, Any]:
        """
        获取空的结果字典
        
        Args:
            initial_cash: 初始资金
        
        Returns:
            空结果字典
        """
        return {
            'initial_cash': initial_cash,
            'final_value': initial_cash,
            'total_return': 0.0,
            'total_return_pct': 0.0,
            'total_trades': 0,
            'winning_trades': 0,
            'losing_trades': 0,
            'win_rate': 0.0,
            'profit_factor': 0.0,
            'avg_win_loss_ratio': 0.0,
            'expectancy': 0.0,
            'max_consecutive_wins': 0,
            'max_consecutive_losses': 0,
            'avg_holding_period': 0.0,
            'total_profit': 0.0,
            'total_loss': 0.0,
            'avg_profit_per_trade': 0.0,
            'max_profit': 0.0,
            'max_loss': 0.0,
            'sharpe_ratio': 0.0,
            'sortino_ratio': 0.0,
            'max_drawdown': 0.0,
            'max_drawdown_pct': 0.0,
            'calmar_ratio': 0.0,
            'annualized_return': 0.0,
            'annualized_return_pct': 0.0,
            'annualized_volatility': 0.0,
            'annualized_volatility_pct': 0.0,
            'equity_curve': [],
            'trades': {'pnl': [], 'holding_periods': []},
        }
    
    def format_results(self, results: Dict[str, Any]) -> str:
        """
        格式化结果为可读字符串
        
        Args:
            results: 分析结果
        
        Returns:
            格式化的字符串
        """
        lines = [
            "=" * 80,
            " 回测分析报告",
            "=" * 80,
            "",
            "【资金情况】",
            f"  初始资金: ${results['initial_cash']:,.2f}",
            f"  最终资金: ${results['final_value']:,.2f}",
            f"  总收益: ${results['final_value'] - results['initial_cash']:,.2f}",
            f"  总收益率: {results['total_return_pct']:.2f}%",
            f"  年化收益率: {results.get('annualized_return_pct', 0):.2f}%",
            "",
            "【风险指标】",
            f"  夏普比率: {results.get('sharpe_ratio', 0):.3f}",
            f"  索提诺比率: {results.get('sortino_ratio', 0):.3f}",
            f"  最大回撤: {results.get('max_drawdown_pct', 0):.2f}%",
            f"  卡玛比率: {results.get('calmar_ratio', 0):.3f}",
            f"  年化波动率: {results.get('annualized_volatility_pct', 0):.2f}%",
            "",
            "【交易统计】",
            f"  总交易次数: {results['total_trades']}",
            f"  盈利交易: {results['winning_trades']} ({results['winning_trades']/results['total_trades']*100:.1f}%)" if results['total_trades'] > 0 else "  盈利交易: 0",
            f"  亏损交易: {results['losing_trades']} ({results['losing_trades']/results['total_trades']*100:.1f}%)" if results['total_trades'] > 0 else "  亏损交易: 0",
            f"  胜率: {results['win_rate']*100:.2f}%",
            "",
            "【盈亏分析】",
            f"  总盈利: ${results.get('total_profit', 0):,.2f}",
            f"  总亏损: ${results.get('total_loss', 0):,.2f}",
            f"  盈亏比: {results.get('profit_factor', 0):.2f}",
            f"  平均盈亏比: {results.get('avg_win_loss_ratio', 0):.2f}",
            f"  期望值: ${results.get('expectancy', 0):.2f}",
            f"  平均每笔盈亏: ${results.get('avg_profit_per_trade', 0):.2f}",
            f"  最大盈利: ${results.get('max_profit', 0):.2f}",
            f"  最大亏损: ${results.get('max_loss', 0):.2f}",
            "",
            "【持仓统计】",
            f"  平均持仓周期: {results.get('avg_holding_period', 0):.1f} bars",
            f"  最大连胜: {results.get('max_consecutive_wins', 0)} 次",
            f"  最大连亏: {results.get('max_consecutive_losses', 0)} 次",
            "",
            "=" * 80,
        ]
        
        return "\n".join(lines)
