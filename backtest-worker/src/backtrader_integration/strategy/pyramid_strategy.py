# -*- coding: utf-8 -*-
"""
多仓/加仓策略 (Pyramid Strategy)
测试：同方向多次加仓、头寸平均价、总体止损管理、部分平仓
"""

import backtrader as bt
from .base_strategy import BaseStrategy


class PyramidStrategy(BaseStrategy):
    """
    金字塔加仓策略
    
    趋势明显时多次加仓，测试多仓位管理、部分平仓逻辑
    """
    
    params = (
        ('trend_ma_len', 50),          # 趋势判断均线
        ('breakout_lookback', 20),     # 突破检测回溯期
        ('add_step_r', 1.0),           # 每移动多少R加一次仓
        ('max_add_times', 3),          # 最多加仓次数
        ('initial_rr_sl', 1.0),        # 初始止损R倍数
        ('global_rr_tp', 3.0),         # 整体止盈R倍数
        ('partial_tp_ratio', 0.5),     # 部分止盈比例
        ('partial_tp_r', 2.0),         # 达到多少R时部分止盈
    )
    
    def __init__(self):
        super().__init__()
        
        # 趋势均线
        self.ma = bt.indicators.SimpleMovingAverage(
            self.data.close,
            period=self.params.trend_ma_len
        )
        
        # 多仓位跟踪
        self.positions_info = []       # 每个仓位的信息 [{'size': x, 'entry': y}, ...]
        self.entry_price_1 = None      # 第一次入场价
        self.stop_loss_global = None   # 全局止损
        self.take_profit_global = None # 全局止盈
        self.one_r = None              # 1R大小
        self.add_count = 0             # 已加仓次数
        self.direction = None          # 'long' or 'short'
        self.partial_tp_done = False   # 是否已执行部分止盈
        
    def next(self):
        """每根K线执行"""
        # 确保有足够历史数据
        if len(self.data) < max(self.params.trend_ma_len, self.params.breakout_lookback) + 1:
            return
        
        # 如果有持仓，管理仓位
        if self.position:
            self._manage_positions()
            return
        
        # 空仓时，寻找入场机会
        trend = self._get_trend()
        signal = self._detect_entry_signal(trend)
        
        if signal == 'long':
            self._initial_long_entry()
        elif signal == 'short':
            self._initial_short_entry()
    
    def _get_trend(self):
        """判断趋势"""
        if self.data.close[0] > self.ma[0]:
            return 'up'
        elif self.data.close[0] < self.ma[0]:
            return 'down'
        return 'neutral'
    
    def _detect_entry_signal(self, trend):
        """检测入场信号"""
        # 计算最近N根K线的高低点
        recent_high = max([self.data.high[-i] for i in range(self.params.breakout_lookback)])
        recent_low = min([self.data.low[-i] for i in range(self.params.breakout_lookback)])
        
        current_close = self.data.close[0]
        
        # 趋势向上 + 突破高点 = 做多
        if trend == 'up' and current_close > recent_high:
            self.log(f'检测到向上突破，趋势向上')
            return 'long'
        
        # 趋势向下 + 突破低点 = 做空
        if trend == 'down' and current_close < recent_low:
            self.log(f'检测到向下突破，趋势向下')
            return 'short'
        
        return None
    
    def _initial_long_entry(self):
        """初次做多入场"""
        self.entry_price_1 = self.data.close[0]
        self.direction = 'long'
        self.add_count = 0
        self.partial_tp_done = False
        
        # 计算止损和1R
        self.one_r = self.entry_price_1 * 0.02  # 简化：2%作为1R
        self.stop_loss_global = self.entry_price_1 - self.params.initial_rr_sl * self.one_r
        self.take_profit_global = self.entry_price_1 + self.params.global_rr_tp * self.one_r
        
        # 记录仓位
        size = self.params.stake if hasattr(self.params, 'stake') else 1
        self.positions_info = [{'size': size, 'entry': self.entry_price_1}]
        
        self.buy(size=size)
        self.log(f'初次开多: 入场={self.entry_price_1:.2f}, 止损={self.stop_loss_global:.2f}, '
                f'止盈={self.take_profit_global:.2f}, 1R={self.one_r:.2f}')
    
    def _initial_short_entry(self):
        """初次做空入场"""
        self.entry_price_1 = self.data.close[0]
        self.direction = 'short'
        self.add_count = 0
        self.partial_tp_done = False
        
        # 计算止损和1R
        self.one_r = self.entry_price_1 * 0.02  # 简化：2%作为1R
        self.stop_loss_global = self.entry_price_1 + self.params.initial_rr_sl * self.one_r
        self.take_profit_global = self.entry_price_1 - self.params.global_rr_tp * self.one_r
        
        # 记录仓位
        size = self.params.stake if hasattr(self.params, 'stake') else 1
        self.positions_info = [{'size': size, 'entry': self.entry_price_1}]
        
        self.sell(size=size)
        self.log(f'初次开空: 入场={self.entry_price_1:.2f}, 止损={self.stop_loss_global:.2f}, '
                f'止盈={self.take_profit_global:.2f}, 1R={self.one_r:.2f}')
    
    def _manage_positions(self):
        """管理已有仓位"""
        current_price = self.data.close[0]
        
        if self.direction == 'long':
            # 检查全局止损
            if self.data.low[0] <= self.stop_loss_global:
                self.close()
                self.log(f'多头全局止损触发: {self.stop_loss_global:.2f}')
                self._reset_vars()
                return
            
            # 检查全局止盈
            if self.data.high[0] >= self.take_profit_global:
                self.close()
                self.log(f'多头全局止盈触发: {self.take_profit_global:.2f}')
                self._reset_vars()
                return
            
            # 检查部分止盈
            if not self.partial_tp_done:
                if current_price >= self.entry_price_1 + self.params.partial_tp_r * self.one_r:
                    self._partial_close()
                    return
            
            # 检查加仓条件
            if self.add_count < self.params.max_add_times:
                target_price = self.entry_price_1 + (self.add_count + 1) * self.params.add_step_r * self.one_r
                if current_price >= target_price:
                    self._add_long()
        
        elif self.direction == 'short':
            # 检查全局止损
            if self.data.high[0] >= self.stop_loss_global:
                self.close()
                self.log(f'空头全局止损触发: {self.stop_loss_global:.2f}')
                self._reset_vars()
                return
            
            # 检查全局止盈
            if self.data.low[0] <= self.take_profit_global:
                self.close()
                self.log(f'空头全局止盈触发: {self.take_profit_global:.2f}')
                self._reset_vars()
                return
            
            # 检查部分止盈
            if not self.partial_tp_done:
                if current_price <= self.entry_price_1 - self.params.partial_tp_r * self.one_r:
                    self._partial_close()
                    return
            
            # 检查加仓条件
            if self.add_count < self.params.max_add_times:
                target_price = self.entry_price_1 - (self.add_count + 1) * self.params.add_step_r * self.one_r
                if current_price <= target_price:
                    self._add_short()
    
    def _add_long(self):
        """加多仓"""
        add_price = self.data.close[0]
        size = self.params.stake if hasattr(self.params, 'stake') else 1
        
        self.positions_info.append({'size': size, 'entry': add_price})
        self.add_count += 1
        
        self.buy(size=size)
        self.log(f'加多仓#{self.add_count}: 价格={add_price:.2f}')
    
    def _add_short(self):
        """加空仓"""
        add_price = self.data.close[0]
        size = self.params.stake if hasattr(self.params, 'stake') else 1
        
        self.positions_info.append({'size': size, 'entry': add_price})
        self.add_count += 1
        
        self.sell(size=size)
        self.log(f'加空仓#{self.add_count}: 价格={add_price:.2f}')
    
    def _partial_close(self):
        """部分平仓"""
        if not self.position:
            return
        
        # 计算平仓数量
        total_size = abs(self.position.size)
        close_size = int(total_size * self.params.partial_tp_ratio)
        
        if close_size > 0:
            if self.direction == 'long':
                self.sell(size=close_size)
            else:
                self.buy(size=close_size)
            
            self.partial_tp_done = True
            self.log(f'部分平仓 {self.params.partial_tp_ratio*100:.0f}% '
                    f'({close_size}/{total_size}仓位)')
    
    def _reset_vars(self):
        """重置变量"""
        self.positions_info = []
        self.entry_price_1 = None
        self.stop_loss_global = None
        self.take_profit_global = None
        self.one_r = None
        self.add_count = 0
        self.direction = None
        self.partial_tp_done = False


# 策略描述
PyramidStrategy.description = '金字塔加仓策略 - 测试多次加仓、部分平仓、整体止损止盈'

