"""
因子收集器（Backtrader Observer）

重构自 POC: poc/backtrader-poc/src/03_strategy_with_factors.py
"""

import backtrader as bt
import pandas as pd
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class FactorCollector(bt.Observer):
    """
    因子收集器
    
    功能：
    - 收集入场因子（entry_factors）
    - 收集持仓因子（holding_factors）
    - 收集出场因子（exit_factors）
    - 支持自定义因子
    """
    
    lines = ('entry_factors', 'holding_factors', 'exit_factors',)
    
    def __init__(self):
        """初始化因子收集器"""
        self.trades: List[Dict[str, Any]] = []
        self.current_trade_info: Dict[int, Dict[str, Any]] = {}  # order_ref -> trade_info
        self.strategy = None
        
        logger.info("FactorCollector initialized")
    
    def set_strategy(self, strategy: bt.Strategy) -> None:
        """
        设置策略实例
        
        Args:
            strategy: Backtrader 策略实例
        """
        self.strategy = strategy
        logger.debug(f"Strategy set: {strategy.__class__.__name__}")
    
    def record_entry_factors(
        self,
        order: bt.Order,
        price: float,
        size: float,
        commission: float,
        **custom_factors
    ) -> None:
        """
        记录入场因子
        
        Args:
            order: 订单对象
            price: 入场价格
            size: 入场数量
            commission: 手续费
            **custom_factors: 自定义因子（例如 sma_fast, sma_slow, close, volume 等）
        """
        if not self.strategy:
            logger.warning("Strategy not set, cannot record entry factors")
            return
        
        factors = {
            'entry_datetime': self.strategy.data.datetime.datetime(0),
            'entry_price': price,
            'entry_size': size,
            'entry_order_ref': order.ref,
            'entry_commission': commission,
            **custom_factors  # 支持自定义因子
        }
        
        self.current_trade_info[order.ref] = factors
        
        logger.debug(f"Entry factors recorded: order_ref={order.ref}, price={price:.2f}, size={size}")
    
    def record_holding_factors(
        self,
        order_ref: int,
        **custom_factors
    ) -> None:
        """
        记录持仓因子
        
        Args:
            order_ref: 入场订单编号
            **custom_factors: 自定义因子（例如当前价格、持仓天数、浮动盈亏等）
        """
        if order_ref not in self.current_trade_info:
            logger.warning(f"Entry order {order_ref} not found, cannot record holding factors")
            return
        
        # 将持仓因子添加到对应的入场信息中
        if 'holding_factors' not in self.current_trade_info[order_ref]:
            self.current_trade_info[order_ref]['holding_factors'] = []
        
        self.current_trade_info[order_ref]['holding_factors'].append({
            'datetime': self.strategy.data.datetime.datetime(0),
            **custom_factors
        })
        
        logger.debug(f"Holding factors recorded: order_ref={order_ref}")
    
    def record_exit_factors(
        self,
        order: bt.Order,
        pnl: float,
        pnl_percent: float,
        holding_bars: int,
        **custom_factors
    ) -> None:
        """
        记录出场因子
        
        Args:
            order: 订单对象
            pnl: 盈亏金额
            pnl_percent: 盈亏比例
            holding_bars: 持仓K线数
            **custom_factors: 自定义因子
        """
        # 查找对应的入场订单
        entry_order_ref = self._find_entry_order_ref(order.ref)
        
        if entry_order_ref is None or entry_order_ref not in self.current_trade_info:
            logger.warning(f"Entry order for exit order {order.ref} not found")
            return
        
        # 获取入场信息
        entry_factors = self.current_trade_info.pop(entry_order_ref)
        
        # 出场因子
        exit_factors = {
            'exit_datetime': self.strategy.data.datetime.datetime(0),
            'exit_price': order.executed.price,
            'exit_size': order.executed.size,
            'exit_order_ref': order.ref,
            'exit_commission': order.executed.comm,
            'pnl': pnl,
            'pnl_percent': pnl_percent,
            'holding_bars': holding_bars,
            **custom_factors
        }
        
        # 合并入场和出场因子
        full_trade_record = {**entry_factors, **exit_factors}
        
        self.trades.append(full_trade_record)
        
        logger.debug(f"Exit factors recorded: order_ref={order.ref}, pnl={pnl:.2f}, pnl_percent={pnl_percent:.2%}")
    
    def _find_entry_order_ref(self, exit_order_ref: int) -> Optional[int]:
        """
        查找入场订单编号
        
        简化假设：卖出订单的 ref 比买入订单大 1
        实际系统中需要更严谨的匹配逻辑
        
        Args:
            exit_order_ref: 出场订单编号
            
        Returns:
            入场订单编号 or None
        """
        entry_order_ref = exit_order_ref - 1
        
        if entry_order_ref in self.current_trade_info:
            return entry_order_ref
        
        # 如果找不到，尝试遍历所有已记录的入场订单
        for order_ref in list(self.current_trade_info.keys()):
            if order_ref < exit_order_ref:
                return order_ref
        
        return None
    
    def get_trades_df(self) -> pd.DataFrame:
        """
        获取所有交易的 DataFrame
        
        Returns:
            交易记录 DataFrame
        """
        if not self.trades:
            return pd.DataFrame()
        
        return pd.DataFrame(self.trades)
    
    def get_trades_count(self) -> int:
        """获取交易数量"""
        return len(self.trades)
    
    def get_stats(self) -> Dict[str, Any]:
        """
        获取因子收集统计信息
        
        Returns:
            统计信息字典
        """
        trades_df = self.get_trades_df()
        
        if trades_df.empty:
            return {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0.0,
                'avg_pnl': 0.0,
                'total_pnl': 0.0,
            }
        
        winning_trades = trades_df[trades_df['pnl'] > 0]
        losing_trades = trades_df[trades_df['pnl'] < 0]
        
        return {
            'total_trades': len(trades_df),
            'winning_trades': len(winning_trades),
            'losing_trades': len(losing_trades),
            'win_rate': (len(winning_trades) / len(trades_df)) * 100 if len(trades_df) > 0 else 0.0,
            'avg_pnl': trades_df['pnl'].mean(),
            'total_pnl': trades_df['pnl'].sum(),
        }
    
    def clear(self) -> None:
        """清空所有交易记录"""
        self.trades.clear()
        self.current_trade_info.clear()
        logger.info("FactorCollector cleared")
    
    def export_to_parquet(self, file_path: str) -> None:
        """
        导出交易记录到 Parquet 文件
        
        Args:
            file_path: 输出文件路径
        """
        trades_df = self.get_trades_df()
        
        if trades_df.empty:
            logger.warning("No trades to export")
            return
        
        trades_df.to_parquet(file_path, index=False)
        logger.info(f"Trades exported to: {file_path}, rows={len(trades_df)}")

