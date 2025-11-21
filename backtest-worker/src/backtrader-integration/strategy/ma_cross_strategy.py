"""
MA 均线交叉策略

示例策略，演示如何使用 BaseStrategy。
重构自 POC: poc/backtrader-poc/src/03_strategy_with_factors.py
"""

import backtrader as bt
from typing import Dict, Any
from .base_strategy import BaseStrategy


class MACrossStrategy(BaseStrategy):
    """
    双均线交叉策略
    
    策略逻辑：
    - 当快速均线上穿慢速均线时，买入
    - 当快速均线下穿慢速均线时，卖出
    
    参数：
    - sma_fast_period: 快速均线周期（默认 10）
    - sma_slow_period: 慢速均线周期（默认 30）
    """
    
    params = (
        ('sma_fast_period', 10),
        ('sma_slow_period', 30),
    )
    
    def __init__(self):
        """初始化策略指标"""
        super().__init__()
        
        # 计算均线
        self.sma_fast = bt.indicators.SimpleMovingAverage(
            self.data.close,
            period=self.p.sma_fast_period
        )
        self.sma_slow = bt.indicators.SimpleMovingAverage(
            self.data.close,
            period=self.p.sma_slow_period
        )
        
        # 交叉信号
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
        
        self.log(
            f"MA Cross Strategy initialized: "
            f"fast={self.p.sma_fast_period}, slow={self.p.sma_slow_period}"
        )
    
    def get_entry_factors(self) -> Dict[str, Any]:
        """
        获取入场因子
        
        Returns:
            入场因子字典
        """
        return {
            'sma_fast': self.sma_fast[0],
            'sma_slow': self.sma_slow[0],
            'sma_fast_slope': self.sma_fast[0] - self.sma_fast[-1] if len(self.sma_fast) > 1 else 0,
            'sma_slow_slope': self.sma_slow[0] - self.sma_slow[-1] if len(self.sma_slow) > 1 else 0,
            'close': self.data.close[0],
            'open': self.data.open[0],
            'high': self.data.high[0],
            'low': self.data.low[0],
            'volume': self.data.volume[0] if hasattr(self.data, 'volume') else 0,
            'crossover_value': self.crossover[0],
        }
    
    def get_exit_factors(self) -> Dict[str, Any]:
        """
        获取出场因子
        
        Returns:
            出场因子字典
        """
        return {
            'sma_fast': self.sma_fast[0],
            'sma_slow': self.sma_slow[0],
            'sma_fast_slope': self.sma_fast[0] - self.sma_fast[-1] if len(self.sma_fast) > 1 else 0,
            'sma_slow_slope': self.sma_slow[0] - self.sma_slow[-1] if len(self.sma_slow) > 1 else 0,
            'close': self.data.close[0],
            'crossover_value': self.crossover[0],
        }
    
    def next(self) -> None:
        """
        策略逻辑（每根 K 线调用一次）
        """
        # 跳过还没有足够数据的情况
        if len(self.data) < self.p.sma_slow_period:
            return
        
        # 如果有未完成的订单，等待
        if self.order:
            return
        
        # 检查是否持仓
        if not self.position:
            # 无持仓，检查买入信号
            if self.crossover > 0:  # 快线上穿慢线
                # 计算可用资金的 95% 作为买入金额
                cash = self.broker.getcash()
                size = int((cash * 0.95) / self.data.close[0])
                
                if size > 0:
                    self.log(
                        f'BUY SIGNAL: close={self.data.close[0]:.2f}, '
                        f'sma_fast={self.sma_fast[0]:.2f}, sma_slow={self.sma_slow[0]:.2f}, '
                        f'size={size}'
                    )
                    self.order = self.buy(size=size)
        
        else:
            # 有持仓，检查卖出信号
            if self.crossover < 0:  # 快线下穿慢线
                self.log(
                    f'SELL SIGNAL: close={self.data.close[0]:.2f}, '
                    f'sma_fast={self.sma_fast[0]:.2f}, sma_slow={self.sma_slow[0]:.2f}, '
                    f'position={self.position.size}'
                )
                self.order = self.sell(size=self.position.size)

