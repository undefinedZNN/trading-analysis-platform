"""
RSI 超买超卖策略

经典的 RSI 反转策略：
- RSI < 30 时买入（超卖）
- RSI > 70 时卖出（超买）
"""

import backtrader as bt
from typing import Dict, Any
from .base_strategy import BaseStrategy


class RSIStrategy(BaseStrategy):
    """
    RSI 超买超卖策略
    
    策略逻辑：
    - 当 RSI 低于超卖线（默认30）时，买入
    - 当 RSI 高于超买线（默认70）时，卖出
    - 可选：使用止损止盈
    
    参数：
    - rsi_period: RSI 周期（默认 14）
    - rsi_oversold: 超卖线（默认 30）
    - rsi_overbought: 超买线（默认 70）
    - use_stop_loss: 是否使用止损（默认 False）
    - stop_loss_pct: 止损百分比（默认 2%）
    """
    
    params = (
        ('rsi_period', 14),
        ('rsi_oversold', 30),
        ('rsi_overbought', 70),
        ('use_stop_loss', False),
        ('stop_loss_pct', 0.02),
    )
    
    def __init__(self):
        """初始化策略指标"""
        super().__init__()
        
        # 计算 RSI
        self.rsi = bt.indicators.RSI(
            self.data.close,
            period=self.p.rsi_period
        )
        
        # 止损价格
        self.stop_price = None
        
        self.log(
            f"RSI Strategy initialized: "
            f"period={self.p.rsi_period}, "
            f"oversold={self.p.rsi_oversold}, "
            f"overbought={self.p.rsi_overbought}"
        )
    
    def get_entry_factors(self) -> Dict[str, Any]:
        """
        获取入场因子
        
        Returns:
            入场因子字典
        """
        return {
            'rsi': self.rsi[0],
            'rsi_oversold': self.p.rsi_oversold,
            'rsi_overbought': self.p.rsi_overbought,
            'close': self.data.close[0],
            'open': self.data.open[0],
            'high': self.data.high[0],
            'low': self.data.low[0],
            'volume': self.data.volume[0] if hasattr(self.data, 'volume') else 0,
        }
    
    def get_exit_factors(self) -> Dict[str, Any]:
        """
        获取出场因子
        
        Returns:
            出场因子字典
        """
        return {
            'rsi': self.rsi[0],
            'close': self.data.close[0],
            'stop_price': self.stop_price if self.stop_price else 0,
        }
    
    def next(self) -> None:
        """
        策略逻辑（每根 K 线调用一次）
        """
        # 跳过还没有足够数据的情况
        if len(self.data) < self.p.rsi_period:
            return
        
        # 如果有未完成的订单，等待
        if self.order:
            return
        
        # 检查是否持仓
        if not self.position:
            # 无持仓，检查买入信号（RSI 超卖）
            if self.rsi[0] < self.p.rsi_oversold:
                # 计算可用资金的 95% 作为买入金额
                cash = self.broker.getcash()
                size = int((cash * 0.95) / self.data.close[0])
                
                if size > 0:
                    self.log(
                        f'BUY SIGNAL (RSI超卖): close={self.data.close[0]:.2f}, '
                        f'rsi={self.rsi[0]:.2f}, size={size}'
                    )
                    self.order = self.buy(size=size)
                    
                    # 设置止损价格
                    if self.p.use_stop_loss:
                        self.stop_price = self.data.close[0] * (1 - self.p.stop_loss_pct)
        
        else:
            # 有持仓，检查卖出信号
            
            # 信号1：RSI 超买
            if self.rsi[0] > self.p.rsi_overbought:
                self.log(
                    f'SELL SIGNAL (RSI超买): close={self.data.close[0]:.2f}, '
                    f'rsi={self.rsi[0]:.2f}, position={self.position.size}'
                )
                self.order = self.sell(size=self.position.size)
                self.stop_price = None
            
            # 信号2：触发止损
            elif self.p.use_stop_loss and self.stop_price:
                if self.data.close[0] < self.stop_price:
                    self.log(
                        f'SELL SIGNAL (止损): close={self.data.close[0]:.2f}, '
                        f'stop={self.stop_price:.2f}, position={self.position.size}'
                    )
                    self.order = self.sell(size=self.position.size)
                    self.stop_price = None

