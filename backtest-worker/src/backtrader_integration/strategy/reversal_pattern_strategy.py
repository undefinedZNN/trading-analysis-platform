# -*- coding: utf-8 -*-
"""
反转形态策略 (Reversal Pattern Strategy)
测试：Pin Bar + Engulfing 形态识别、趋势过滤、R倍数止损止盈、移动止损
"""

import backtrader as bt
from .base_strategy import BaseStrategy


class ReversalPatternStrategy(BaseStrategy):
    """
    反转形态策略
    
    利用典型K线反转形态（Pin Bar、Engulfing）+ 趋势过滤
    测试形态识别、固定R止损/止盈、移动止损/打平逻辑
    """
    
    params = (
        ('ma_len', 50),                    # 趋势判断均线长度
        ('pin_long_wick_ratio', 0.66),     # Pin Bar主影线占整根K线比例
        ('max_body_ratio', 0.3),           # Pin Bar实体占K线最大比例
        ('engulfing_ratio', 1.2),          # 吞没形态实体倍数
        ('rr_tp', 2.0),                    # 止盈R倍数
        ('rr_be', 1.0),                    # 打平R倍数
        ('rr_trail', 1.5),                 # 启用追踪止损的R倍数
        ('buffer_pips', 0.0),              # 止损缓冲点数
    )
    
    def __init__(self):
        super().__init__()
        
        # 趋势判断均线
        self.ma = bt.indicators.SimpleMovingAverage(
            self.data.close,
            period=self.params.ma_len
        )
        
        # 跟踪当前持仓的R值和关键价位
        self.entry_price = None
        self.stop_loss = None
        self.take_profit = None
        self.one_r = None
        self.highest_since_entry = None
        self.lowest_since_entry = None
        self.be_moved = False      # 是否已移动到打平
        self.trail_active = False  # 是否已启用追踪止损
        
    def next(self):
        """每根K线执行"""
        # 更新最高/最低价（用于打平和追踪止损）
        if self.position:
            if self.position.size > 0:  # 多头
                if self.highest_since_entry is None:
                    self.highest_since_entry = self.data.high[0]
                else:
                    self.highest_since_entry = max(self.highest_since_entry, self.data.high[0])
                
                # 检查打平条件
                if not self.be_moved and self.one_r:
                    if self.highest_since_entry >= self.entry_price + self.params.rr_be * self.one_r:
                        self.stop_loss = self.entry_price
                        self.be_moved = True
                        self.log(f'移动止损到打平: {self.stop_loss:.2f}')
                
                # 检查追踪止损条件
                if not self.trail_active and self.one_r:
                    if self.highest_since_entry >= self.entry_price + self.params.rr_trail * self.one_r:
                        self.trail_active = True
                        self.log(f'启用追踪止损')
                
                # 追踪止损逻辑
                if self.trail_active and self.one_r:
                    trailing_stop = self.highest_since_entry - self.one_r
                    if trailing_stop > self.stop_loss:
                        self.stop_loss = trailing_stop
                        self.log(f'追踪止损更新: {self.stop_loss:.2f}')
                
                # 检查止损/止盈
                if self.data.low[0] <= self.stop_loss:
                    self.close()
                    self.log(f'多头止损触发: {self.stop_loss:.2f}')
                    self._reset_trade_vars()
                    return
                
                if self.data.high[0] >= self.take_profit:
                    self.close()
                    self.log(f'多头止盈触发: {self.take_profit:.2f}')
                    self._reset_trade_vars()
                    return
                    
            elif self.position.size < 0:  # 空头
                if self.lowest_since_entry is None:
                    self.lowest_since_entry = self.data.low[0]
                else:
                    self.lowest_since_entry = min(self.lowest_since_entry, self.data.low[0])
                
                # 检查打平条件
                if not self.be_moved and self.one_r:
                    if self.lowest_since_entry <= self.entry_price - self.params.rr_be * self.one_r:
                        self.stop_loss = self.entry_price
                        self.be_moved = True
                        self.log(f'移动止损到打平: {self.stop_loss:.2f}')
                
                # 检查追踪止损条件
                if not self.trail_active and self.one_r:
                    if self.lowest_since_entry <= self.entry_price - self.params.rr_trail * self.one_r:
                        self.trail_active = True
                        self.log(f'启用追踪止损')
                
                # 追踪止损逻辑
                if self.trail_active and self.one_r:
                    trailing_stop = self.lowest_since_entry + self.one_r
                    if trailing_stop < self.stop_loss:
                        self.stop_loss = trailing_stop
                        self.log(f'追踪止损更新: {self.stop_loss:.2f}')
                
                # 检查止损/止盈
                if self.data.high[0] >= self.stop_loss:
                    self.close()
                    self.log(f'空头止损触发: {self.stop_loss:.2f}')
                    self._reset_trade_vars()
                    return
                
                if self.data.low[0] <= self.take_profit:
                    self.close()
                    self.log(f'空头止盈触发: {self.take_profit:.2f}')
                    self._reset_trade_vars()
                    return
        
        # 如果已有持仓，不再寻找新信号
        if self.position:
            return
        
        # 判断趋势
        trend = self._get_trend()
        
        # 检测形态信号
        signal = self._detect_patterns(trend)
        
        if signal == 'long':
            self._enter_long()
        elif signal == 'short':
            self._enter_short()
    
    def _get_trend(self):
        """判断趋势"""
        if self.data.close[0] > self.ma[0]:
            return 'up'
        elif self.data.close[0] < self.ma[0]:
            return 'down'
        return 'neutral'
    
    def _detect_patterns(self, trend):
        """检测反转形态"""
        # 确保有足够的历史数据
        if len(self.data) < 2:
            return None
        
        # 当前K线数据
        o, h, l, c = self.data.open[0], self.data.high[0], self.data.low[0], self.data.close[0]
        range_val = h - l
        
        if range_val <= 0:
            return None
        
        body = abs(c - o)
        lower_wick = min(o, c) - l
        upper_wick = h - max(o, c)
        
        # 前一根K线数据
        o1, h1, l1, c1 = self.data.open[-1], self.data.high[-1], self.data.low[-1], self.data.close[-1]
        body1 = abs(c1 - o1)
        
        # 检测看涨Pin Bar
        if trend == 'up':
            # Pin Bar多头
            if (body / range_val <= self.params.max_body_ratio and
                lower_wick / range_val >= self.params.pin_long_wick_ratio and
                (h - max(o, c)) / range_val < 0.2):
                self.log(f'检测到看涨Pin Bar')
                return 'long'
            
            # 看涨吞没
            if (c1 < o1 and c > o and  # 前阴后阳
                o <= c1 and c >= o1 and  # 完全包住
                body >= self.params.engulfing_ratio * body1):  # 实体更大
                self.log(f'检测到看涨吞没')
                return 'long'
        
        # 检测看跌Pin Bar
        elif trend == 'down':
            # Pin Bar空头
            if (body / range_val <= self.params.max_body_ratio and
                upper_wick / range_val >= self.params.pin_long_wick_ratio and
                (min(o, c) - l) / range_val < 0.2):
                self.log(f'检测到看跌Pin Bar')
                return 'short'
            
            # 看跌吞没
            if (c1 > o1 and c < o and  # 前阳后阴
                o >= c1 and c <= o1 and  # 完全包住
                body >= self.params.engulfing_ratio * body1):  # 实体更大
                self.log(f'检测到看跌吞没')
                return 'short'
        
        return None
    
    def _enter_long(self):
        """开多仓"""
        self.entry_price = self.data.close[0]
        
        # 止损设在当前K线低点下方
        self.stop_loss = self.data.low[0] - self.params.buffer_pips
        
        # 计算1R
        self.one_r = self.entry_price - self.stop_loss
        
        # 止盈
        self.take_profit = self.entry_price + self.params.rr_tp * self.one_r
        
        # 重置跟踪变量
        self.highest_since_entry = self.data.high[0]
        self.be_moved = False
        self.trail_active = False
        
        self.buy()
        self.log(f'开多: 入场={self.entry_price:.2f}, 止损={self.stop_loss:.2f}, '
                f'止盈={self.take_profit:.2f}, 1R={self.one_r:.2f}')
    
    def _enter_short(self):
        """开空仓"""
        self.entry_price = self.data.close[0]
        
        # 止损设在当前K线高点上方
        self.stop_loss = self.data.high[0] + self.params.buffer_pips
        
        # 计算1R
        self.one_r = self.stop_loss - self.entry_price
        
        # 止盈
        self.take_profit = self.entry_price - self.params.rr_tp * self.one_r
        
        # 重置跟踪变量
        self.lowest_since_entry = self.data.low[0]
        self.be_moved = False
        self.trail_active = False
        
        self.sell()
        self.log(f'开空: 入场={self.entry_price:.2f}, 止损={self.stop_loss:.2f}, '
                f'止盈={self.take_profit:.2f}, 1R={self.one_r:.2f}')
    
    def _reset_trade_vars(self):
        """重置交易变量"""
        self.entry_price = None
        self.stop_loss = None
        self.take_profit = None
        self.one_r = None
        self.highest_since_entry = None
        self.lowest_since_entry = None
        self.be_moved = False
        self.trail_active = False


# 策略描述（用于注册）
ReversalPatternStrategy.description = '反转形态策略 - 测试Pin Bar和Engulfing形态识别、R倍数止损止盈、移动止损'

