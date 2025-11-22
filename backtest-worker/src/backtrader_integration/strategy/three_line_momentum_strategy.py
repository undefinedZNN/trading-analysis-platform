"""
三线动量 + DMI 策略

入场条件：
1. 连续 3 根同方向 K 线（多头三连阳 或 空头三连阴）
2. 高低点抬升/下降结构
3. DMI 趋势过滤（+DI vs -DI）
4. 在第 3 根 K 线收盘时开仓
5. 止损设置在第 1 根 K 线的高/低点
"""

import backtrader as bt
from typing import Dict, Any
from .base_strategy import BaseStrategy


class ThreeLineMomentumStrategy(BaseStrategy):
    """
    三线动量 + DMI 策略
    
    策略逻辑：
    - 多头入场：
      1. 连续 3 根阳线（close > open）
      2. 低点抬升（low2 > low1, low3 > low2）
      3. 高点抬升（high2 >= high1, high3 >= high2）
      4. +DI > -DI（DMI 确认多头趋势）
      5. 止损：第 1 根 K 线的最低点
    
    - 空头入场：
      1. 连续 3 根阴线（close < open）
      2. 高点下降（high2 < high1, high3 < high2）
      3. 低点下降（low2 <= low1, low3 <= low2）
      4. +DI < -DI（DMI 确认空头趋势）
      5. 止损：第 1 根 K 线的最高点
    
    参数：
    - dmi_period: DMI 周期（默认 14）
    - min_body_ratio: 最小实体比例，过滤十字星（默认 0.001）
    - strict_structure: 是否严格要求高低点结构（默认 True）
    """
    
    params = (
        ('dmi_period', 14),
        ('min_body_ratio', 0.001),  # K线实体占比，过滤十字星
        ('strict_structure', True),  # 是否严格要求高低点结构
    )
    
    def __init__(self):
        """初始化策略指标"""
        super().__init__()
        
        # 计算 DMI 指标
        self.dmi = bt.indicators.DirectionalMovementIndex(
            self.data,
            period=self.p.dmi_period
        )
        
        # +DI 和 -DI
        self.plus_di = self.dmi.plusDI
        self.minus_di = self.dmi.minusDI
        
        # 止损价格
        self.stop_price = None
        self.entry_type = None  # 'long' or 'short'
        
        self.log(
            f"Three Line Momentum + DMI Strategy initialized: "
            f"dmi_period={self.p.dmi_period}, "
            f"strict_structure={self.p.strict_structure}"
        )
    
    def _is_bullish_candle(self, idx: int = 0) -> bool:
        """
        判断是否为阳线
        
        Args:
            idx: K线索引（0=当前，-1=前一根）
        
        Returns:
            是否为阳线
        """
        close = self.data.close[idx]
        open_price = self.data.open[idx]
        
        # 过滤十字星
        body = abs(close - open_price)
        total_range = self.data.high[idx] - self.data.low[idx]
        
        if total_range > 0 and (body / total_range) < self.p.min_body_ratio:
            return False  # 十字星，无方向
        
        return close > open_price
    
    def _is_bearish_candle(self, idx: int = 0) -> bool:
        """
        判断是否为阴线
        
        Args:
            idx: K线索引
        
        Returns:
            是否为阴线
        """
        close = self.data.close[idx]
        open_price = self.data.open[idx]
        
        # 过滤十字星
        body = abs(close - open_price)
        total_range = self.data.high[idx] - self.data.low[idx]
        
        if total_range > 0 and (body / total_range) < self.p.min_body_ratio:
            return False  # 十字星，无方向
        
        return close < open_price
    
    def _check_bullish_pattern(self) -> bool:
        """
        检查多头形态
        
        Returns:
            是否满足多头入场条件
        """
        # 1. 检查连续 3 根阳线
        if not (self._is_bullish_candle(-2) and 
                self._is_bullish_candle(-1) and 
                self._is_bullish_candle(0)):
            return False
        
        # 2. 检查高低点抬升结构
        low1 = self.data.low[-2]
        low2 = self.data.low[-1]
        low3 = self.data.low[0]
        
        high1 = self.data.high[-2]
        high2 = self.data.high[-1]
        high3 = self.data.high[0]
        
        if self.p.strict_structure:
            # 严格模式：低点抬升 + 高点抬升
            if not (low2 > low1 and low3 > low2):
                return False
            if not (high2 >= high1 and high3 >= high2):
                return False
        else:
            # 宽松模式：只要求低点抬升
            if not (low2 > low1 and low3 > low2):
                return False
        
        # 3. 检查 DMI 趋势确认（+DI > -DI）
        if self.plus_di[0] <= self.minus_di[0]:
            return False
        
        return True
    
    def _check_bearish_pattern(self) -> bool:
        """
        检查空头形态
        
        Returns:
            是否满足空头入场条件
        """
        # 1. 检查连续 3 根阴线
        if not (self._is_bearish_candle(-2) and 
                self._is_bearish_candle(-1) and 
                self._is_bearish_candle(0)):
            return False
        
        # 2. 检查高低点下降结构
        low1 = self.data.low[-2]
        low2 = self.data.low[-1]
        low3 = self.data.low[0]
        
        high1 = self.data.high[-2]
        high2 = self.data.high[-1]
        high3 = self.data.high[0]
        
        if self.p.strict_structure:
            # 严格模式：高点下降 + 低点下降
            if not (high2 < high1 and high3 < high2):
                return False
            if not (low2 <= low1 and low3 <= low2):
                return False
        else:
            # 宽松模式：只要求高点下降
            if not (high2 < high1 and high3 < high2):
                return False
        
        # 3. 检查 DMI 趋势确认（+DI < -DI）
        if self.plus_di[0] >= self.minus_di[0]:
            return False
        
        return True
    
    def get_entry_factors(self) -> Dict[str, Any]:
        """
        获取入场因子
        
        Returns:
            入场因子字典
        """
        return {
            'plus_di': self.plus_di[0],
            'minus_di': self.minus_di[0],
            'k1_high': self.data.high[-2],
            'k1_low': self.data.low[-2],
            'k2_high': self.data.high[-1],
            'k2_low': self.data.low[-1],
            'k3_high': self.data.high[0],
            'k3_low': self.data.low[0],
            'k3_close': self.data.close[0],
            'k3_open': self.data.open[0],
            'entry_type': self.entry_type if self.entry_type else 'none',
            'stop_price': self.stop_price if self.stop_price else 0,
        }
    
    def get_exit_factors(self) -> Dict[str, Any]:
        """
        获取出场因子
        
        Returns:
            出场因子字典
        """
        return {
            'plus_di': self.plus_di[0],
            'minus_di': self.minus_di[0],
            'close': self.data.close[0],
            'stop_price': self.stop_price if self.stop_price else 0,
            'entry_type': self.entry_type if self.entry_type else 'none',
        }
    
    def next(self) -> None:
        """
        策略逻辑（每根 K 线调用一次）
        """
        # 跳过还没有足够数据的情况（至少需要 3 根 K 线 + DMI 周期）
        if len(self.data) < max(3, self.p.dmi_period):
            return
        
        # 如果有未完成的订单，等待
        if self.order:
            return
        
        # 检查是否持仓
        if not self.position:
            # 无持仓，检查入场信号
            
            # 检查多头形态
            if self._check_bullish_pattern():
                # 计算可用资金的 95% 作为买入金额
                cash = self.broker.getcash()
                size = int((cash * 0.95) / self.data.close[0])
                
                if size > 0:
                    # 止损价格：第 1 根 K 线的最低点
                    self.stop_price = self.data.low[-2]
                    self.entry_type = 'long'
                    
                    self.log(
                        f'BUY SIGNAL (三线多头): close={self.data.close[0]:.2f}, '
                        f'+DI={self.plus_di[0]:.2f}, -DI={self.minus_di[0]:.2f}, '
                        f'stop={self.stop_price:.2f}, size={size}'
                    )
                    self.order = self.buy(size=size)
            
            # 检查空头形态
            elif self._check_bearish_pattern():
                # 计算可用资金的 95% 作为卖空金额
                cash = self.broker.getcash()
                size = int((cash * 0.95) / self.data.close[0])
                
                if size > 0:
                    # 止损价格：第 1 根 K 线的最高点
                    self.stop_price = self.data.high[-2]
                    self.entry_type = 'short'
                    
                    self.log(
                        f'SELL SIGNAL (三线空头): close={self.data.close[0]:.2f}, '
                        f'+DI={self.plus_di[0]:.2f}, -DI={self.minus_di[0]:.2f}, '
                        f'stop={self.stop_price:.2f}, size={size}'
                    )
                    self.order = self.sell(size=size)
        
        else:
            # 有持仓，检查止损
            if self.entry_type == 'long' and self.stop_price:
                # 多头止损：价格跌破止损位
                if self.data.close[0] < self.stop_price:
                    self.log(
                        f'SELL SIGNAL (多头止损): close={self.data.close[0]:.2f}, '
                        f'stop={self.stop_price:.2f}, position={self.position.size}'
                    )
                    self.order = self.sell(size=self.position.size)
                    self.stop_price = None
                    self.entry_type = None
            
            elif self.entry_type == 'short' and self.stop_price:
                # 空头止损：价格突破止损位
                if self.data.close[0] > self.stop_price:
                    self.log(
                        f'BUY SIGNAL (空头止损): close={self.data.close[0]:.2f}, '
                        f'stop={self.stop_price:.2f}, position={self.position.size}'
                    )
                    self.order = self.buy(size=abs(self.position.size))
                    self.stop_price = None
                    self.entry_type = None

