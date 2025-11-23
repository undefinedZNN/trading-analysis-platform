# -*- coding: utf-8 -*-
"""
随机策略 (Random Strategy)
测试：Monte Carlo风格压力测试、随机开平仓、引擎稳定性
"""

import random
import backtrader as bt
from .base_strategy import BaseStrategy


class RandomStrategy(BaseStrategy):
    """
    随机策略
    
    以随机方式决定开仓/平仓，用于Monte Carlo风格压力测试
    检查引擎在无逻辑约束、频繁开平仓下是否稳定
    """
    
    params = (
        ('entry_prob', 0.1),           # 空仓时开仓概率
        ('long_prob', 0.5),            # 开仓时做多概率
        ('close_prob', 0.1),           # 有仓时平仓概率
        ('max_hold_bars', 50),         # 单笔交易最多持仓K线数
        ('use_sl_tp', True),           # 是否使用止损止盈
        ('sl_min', 10.0),              # 最小止损点数
        ('sl_max', 50.0),              # 最大止损点数
        ('tp_min', 10.0),              # 最小止盈点数
        ('tp_max', 50.0),              # 最大止盈点数
        ('random_seed', None),         # 随机种子（用于可重现测试）
    )
    
    def __init__(self):
        super().__init__()
        
        # 设置随机种子
        if self.params.random_seed is not None:
            random.seed(self.params.random_seed)
        
        # 持仓跟踪
        self.entry_bar_index = None
        self.entry_price = None
        self.stop_loss = None
        self.take_profit = None
        self.direction = None  # 'long' or 'short'
        
    def next(self):
        """每根K线执行"""
        current_bar_index = len(self.data)
        
        # 如果有持仓，检查平仓条件
        if self.position:
            # 检查止损止盈
            if self.params.use_sl_tp:
                if self.direction == 'long':
                    if self.data.low[0] <= self.stop_loss:
                        self.close()
                        self.log(f'随机多头止损触发: {self.stop_loss:.2f}')
                        self._reset_vars()
                        return
                    
                    if self.data.high[0] >= self.take_profit:
                        self.close()
                        self.log(f'随机多头止盈触发: {self.take_profit:.2f}')
                        self._reset_vars()
                        return
                
                elif self.direction == 'short':
                    if self.data.high[0] >= self.stop_loss:
                        self.close()
                        self.log(f'随机空头止损触发: {self.stop_loss:.2f}')
                        self._reset_vars()
                        return
                    
                    if self.data.low[0] <= self.take_profit:
                        self.close()
                        self.log(f'随机空头止盈触发: {self.take_profit:.2f}')
                        self._reset_vars()
                        return
            
            # 随机平仓条件
            if random.random() < self.params.close_prob:
                self.close()
                self.log(f'随机平仓触发 (概率={self.params.close_prob})')
                self._reset_vars()
                return
            
            # 时间平仓条件
            if self.entry_bar_index is not None:
                if current_bar_index - self.entry_bar_index >= self.params.max_hold_bars:
                    self.close()
                    self.log(f'随机时间平仓 (持仓{self.params.max_hold_bars}根K线)')
                    self._reset_vars()
                    return
        
        # 如果空仓，随机开仓
        else:
            # 随机开仓条件
            if random.random() < self.params.entry_prob:
                # 随机决定方向
                if random.random() < self.params.long_prob:
                    self._random_long()
                else:
                    self._random_short()
    
    def _random_long(self):
        """随机开多仓"""
        self.entry_price = self.data.close[0]
        self.entry_bar_index = len(self.data)
        self.direction = 'long'
        
        if self.params.use_sl_tp:
            # 随机生成止损止盈点数
            sl_pips = random.uniform(self.params.sl_min, self.params.sl_max)
            tp_pips = random.uniform(self.params.tp_min, self.params.tp_max)
            
            self.stop_loss = self.entry_price - sl_pips
            self.take_profit = self.entry_price + tp_pips
            
            self.log(f'随机开多: 入场={self.entry_price:.2f}, '
                    f'SL={self.stop_loss:.2f} ({sl_pips:.1f}), '
                    f'TP={self.take_profit:.2f} ({tp_pips:.1f})')
        else:
            self.log(f'随机开多: 入场={self.entry_price:.2f} (无SL/TP)')
        
        self.buy()
    
    def _random_short(self):
        """随机开空仓"""
        self.entry_price = self.data.close[0]
        self.entry_bar_index = len(self.data)
        self.direction = 'short'
        
        if self.params.use_sl_tp:
            # 随机生成止损止盈点数
            sl_pips = random.uniform(self.params.sl_min, self.params.sl_max)
            tp_pips = random.uniform(self.params.tp_min, self.params.tp_max)
            
            self.stop_loss = self.entry_price + sl_pips
            self.take_profit = self.entry_price - tp_pips
            
            self.log(f'随机开空: 入场={self.entry_price:.2f}, '
                    f'SL={self.stop_loss:.2f} ({sl_pips:.1f}), '
                    f'TP={self.take_profit:.2f} ({tp_pips:.1f})')
        else:
            self.log(f'随机开空: 入场={self.entry_price:.2f} (无SL/TP)')
        
        self.sell()
    
    def _reset_vars(self):
        """重置变量"""
        self.entry_bar_index = None
        self.entry_price = None
        self.stop_loss = None
        self.take_profit = None
        self.direction = None


# 策略描述
RandomStrategy.description = '随机策略 - Monte Carlo压力测试，随机开平仓，测试引擎稳定性'

