# -*- coding: utf-8 -*-
"""
挂单策略 (Pending Order Strategy)
测试：限价挂单、价格触达逻辑、挂单生命周期
"""

import backtrader as bt
from .base_strategy import BaseStrategy


class PendingOrderStrategy(BaseStrategy):
    """
    挂单策略
    
    突破后等待回踩，通过限价单入场
    测试挂单创建、成交、取消逻辑
    """
    
    params = (
        ('breakout_lookback', 20),     # 突破检测回溯期
        ('pullback_ratio', 0.5),       # 回踩比例
        ('order_expire_bars', 5),      # 挂单过期K线数
        ('rr_tp', 2.0),                # 止盈R倍数
        ('rr_sl', 1.0),                # 止损R倍数
        ('fixed_sl_pips', 20.0),       # 固定止损点数（用于计算1R）
    )
    
    def __init__(self):
        super().__init__()
        
        # 挂单状态
        self.pending_order = None           # 挂单对象
        self.pending_order_type = None      # 'buy_limit' or 'sell_limit'
        self.pending_price = None           # 挂单价格
        self.order_created_bar_index = None # 挂单创建时的K线索引
        
        # 突破信息
        self.breakout_price = None
        self.swing_low = None
        self.swing_high = None
        
        # 持仓信息
        self.entry_price = None
        self.stop_loss = None
        self.take_profit = None
        
    def next(self):
        """每根K线执行"""
        current_bar_index = len(self.data)
        
        # 确保有足够历史数据
        if len(self.data) < self.params.breakout_lookback + 1:
            return
        
        # 如果有持仓，检查止损止盈
        if self.position:
            if self.position.size > 0:  # 多头
                if self.data.low[0] <= self.stop_loss:
                    self.close()
                    self.log(f'多头止损触发: {self.stop_loss:.2f}')
                    self._reset_vars()
                    return
                
                if self.data.high[0] >= self.take_profit:
                    self.close()
                    self.log(f'多头止盈触发: {self.take_profit:.2f}')
                    self._reset_vars()
                    return
            
            elif self.position.size < 0:  # 空头
                if self.data.high[0] >= self.stop_loss:
                    self.close()
                    self.log(f'空头止损触发: {self.stop_loss:.2f}')
                    self._reset_vars()
                    return
                
                if self.data.low[0] <= self.take_profit:
                    self.close()
                    self.log(f'空头止盈触发: {self.take_profit:.2f}')
                    self._reset_vars()
                    return
            
            return  # 有持仓就不再检测新信号
        
        # 检查挂单状态
        if self.pending_order:
            # 检查挂单是否过期
            if current_bar_index - self.order_created_bar_index >= self.params.order_expire_bars:
                self.log(f'挂单过期，取消挂单: {self.pending_price:.2f}')
                self.pending_order = None
                self.pending_order_type = None
                self.pending_price = None
                self.order_created_bar_index = None
                return
            
            # 检查挂单是否被触发
            if self.pending_order_type == 'buy_limit':
                # 买入限价单：当前K线最低价触及或低于挂单价
                if self.data.low[0] <= self.pending_price:
                    self.log(f'买入限价单触发: {self.pending_price:.2f}')
                    self._execute_buy_limit()
                    return
            
            elif self.pending_order_type == 'sell_limit':
                # 卖出限价单：当前K线最高价触及或高于挂单价
                if self.data.high[0] >= self.pending_price:
                    self.log(f'卖出限价单触发: {self.pending_price:.2f}')
                    self._execute_sell_limit()
                    return
            
            return  # 有挂单就不再检测新突破
        
        # 检测突破
        self._detect_breakout()
    
    def _detect_breakout(self):
        """检测突破并设置挂单"""
        # 计算最近N根K线的高低点
        recent_high = max([self.data.high[-i] for i in range(self.params.breakout_lookback)])
        recent_low = min([self.data.low[-i] for i in range(self.params.breakout_lookback)])
        
        current_close = self.data.close[0]
        
        # 检测向上突破
        if current_close > recent_high:
            self.breakout_price = current_close
            self.swing_low = recent_low
            
            # 计算回踩目标价（限价买入）
            pullback_price = self.breakout_price - self.params.pullback_ratio * (
                self.breakout_price - self.swing_low
            )
            
            self.pending_price = pullback_price
            self.pending_order_type = 'buy_limit'
            self.pending_order = True  # 标记有挂单
            self.order_created_bar_index = len(self.data)
            
            self.log(f'检测到向上突破 {self.breakout_price:.2f}，'
                    f'挂买入限价单 @ {pullback_price:.2f}')
        
        # 检测向下突破
        elif current_close < recent_low:
            self.breakout_price = current_close
            self.swing_high = recent_high
            
            # 计算回踩目标价（限价卖出）
            pullback_price = self.breakout_price + self.params.pullback_ratio * (
                self.swing_high - self.breakout_price
            )
            
            self.pending_price = pullback_price
            self.pending_order_type = 'sell_limit'
            self.pending_order = True
            self.order_created_bar_index = len(self.data)
            
            self.log(f'检测到向下突破 {self.breakout_price:.2f}，'
                    f'挂卖出限价单 @ {pullback_price:.2f}')
    
    def _execute_buy_limit(self):
        """执行买入限价单"""
        self.entry_price = self.pending_price
        
        # 止损设在摆动低点下方
        self.stop_loss = min(self.swing_low, self.entry_price - self.params.fixed_sl_pips)
        
        # 计算1R和止盈
        one_r = self.entry_price - self.stop_loss
        self.take_profit = self.entry_price + self.params.rr_tp * one_r
        
        # 清除挂单信息
        self.pending_order = None
        self.pending_order_type = None
        self.pending_price = None
        
        # 开多仓
        self.buy()
        self.log(f'开多: 入场={self.entry_price:.2f}, 止损={self.stop_loss:.2f}, '
                f'止盈={self.take_profit:.2f}')
    
    def _execute_sell_limit(self):
        """执行卖出限价单"""
        self.entry_price = self.pending_price
        
        # 止损设在摆动高点上方
        self.stop_loss = max(self.swing_high, self.entry_price + self.params.fixed_sl_pips)
        
        # 计算1R和止盈
        one_r = self.stop_loss - self.entry_price
        self.take_profit = self.entry_price - self.params.rr_tp * one_r
        
        # 清除挂单信息
        self.pending_order = None
        self.pending_order_type = None
        self.pending_price = None
        
        # 开空仓
        self.sell()
        self.log(f'开空: 入场={self.entry_price:.2f}, 止损={self.stop_loss:.2f}, '
                f'止盈={self.take_profit:.2f}')
    
    def _reset_vars(self):
        """重置变量"""
        self.entry_price = None
        self.stop_loss = None
        self.take_profit = None
        self.breakout_price = None
        self.swing_low = None
        self.swing_high = None


# 策略描述
PendingOrderStrategy.description = '挂单策略 - 测试限价挂单、突破回踩、挂单过期逻辑'

