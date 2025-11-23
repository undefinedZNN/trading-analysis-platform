# -*- coding: utf-8 -*-
"""
最高频策略 (High-Frequency Strategy)
测试：极高频率交易、压力测试、按时间平仓
"""

import backtrader as bt
from .base_strategy import BaseStrategy


class HighFrequencyStrategy(BaseStrategy):
    """
    最高频策略
    
    几乎每根K线都交易，用于压测引擎性能
    支持：always_long、always_short、alt_long_short 模式
    """
    
    params = (
        ('mode', 'always_long'),      # 交易模式：always_long, always_short, alt_long_short
        ('hold_bars', 1),              # 持仓K线数量
        ('use_sl_tp', False),          # 是否使用止损止盈
        ('fixed_sl_pips', 10.0),       # 固定止损点数
        ('fixed_tp_pips', 10.0),       # 固定止盈点数
    )
    
    def __init__(self):
        super().__init__()
        
        # 跟踪入场K线索引
        self.entry_bar_index = None
        
        # 交替模式下的下一个方向
        self.next_side = 'long'  # long or short
        
        # 止损止盈价格
        self.stop_loss = None
        self.take_profit = None
        
    def next(self):
        """每根K线执行"""
        current_bar_index = len(self.data)
        
        # 如果有持仓，检查平仓条件
        if self.position:
            # 按时间平仓
            if self.entry_bar_index is not None:
                if current_bar_index - self.entry_bar_index >= self.params.hold_bars:
                    self.close()
                    self.log(f'按时间平仓 (持仓{self.params.hold_bars}根K线)')
                    self.entry_bar_index = None
                    
                    # 交替模式：切换方向
                    if self.params.mode == 'alt_long_short':
                        self.next_side = 'short' if self.next_side == 'long' else 'long'
                    return
            
            # 如果启用止损止盈，检查触发
            if self.params.use_sl_tp:
                if self.position.size > 0:  # 多头
                    if self.data.low[0] <= self.stop_loss:
                        self.close()
                        self.log(f'多头止损触发: {self.stop_loss:.2f}')
                        self.entry_bar_index = None
                        if self.params.mode == 'alt_long_short':
                            self.next_side = 'short'
                        return
                    
                    if self.data.high[0] >= self.take_profit:
                        self.close()
                        self.log(f'多头止盈触发: {self.take_profit:.2f}')
                        self.entry_bar_index = None
                        if self.params.mode == 'alt_long_short':
                            self.next_side = 'short'
                        return
                
                elif self.position.size < 0:  # 空头
                    if self.data.high[0] >= self.stop_loss:
                        self.close()
                        self.log(f'空头止损触发: {self.stop_loss:.2f}')
                        self.entry_bar_index = None
                        if self.params.mode == 'alt_long_short':
                            self.next_side = 'long'
                        return
                    
                    if self.data.low[0] <= self.take_profit:
                        self.close()
                        self.log(f'空头止盈触发: {self.take_profit:.2f}')
                        self.entry_bar_index = None
                        if self.params.mode == 'alt_long_short':
                            self.next_side = 'long'
                        return
        
        # 如果空仓，根据模式开仓
        if not self.position:
            if self.params.mode == 'always_long':
                self._enter_long()
            elif self.params.mode == 'always_short':
                self._enter_short()
            elif self.params.mode == 'alt_long_short':
                if self.next_side == 'long':
                    self._enter_long()
                else:
                    self._enter_short()
    
    def _enter_long(self):
        """开多仓"""
        entry_price = self.data.close[0]
        self.entry_bar_index = len(self.data)
        
        if self.params.use_sl_tp:
            self.stop_loss = entry_price - self.params.fixed_sl_pips
            self.take_profit = entry_price + self.params.fixed_tp_pips
            self.log(f'开多: 入场={entry_price:.2f}, SL={self.stop_loss:.2f}, TP={self.take_profit:.2f}')
        else:
            self.log(f'开多: 入场={entry_price:.2f} (按时间平仓)')
        
        self.buy()
    
    def _enter_short(self):
        """开空仓"""
        entry_price = self.data.close[0]
        self.entry_bar_index = len(self.data)
        
        if self.params.use_sl_tp:
            self.stop_loss = entry_price + self.params.fixed_sl_pips
            self.take_profit = entry_price - self.params.fixed_tp_pips
            self.log(f'开空: 入场={entry_price:.2f}, SL={self.stop_loss:.2f}, TP={self.take_profit:.2f}')
        else:
            self.log(f'开空: 入场={entry_price:.2f} (按时间平仓)')
        
        self.sell()


# 策略描述
HighFrequencyStrategy.description = '最高频策略 - 压力测试，每根K线交易，按时间或SL/TP平仓'

