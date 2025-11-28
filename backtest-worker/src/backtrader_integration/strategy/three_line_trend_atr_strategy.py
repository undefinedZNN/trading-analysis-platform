"""
三线趋势 + DMI + ATR 策略（含影线缺口过滤）

入场条件（k1, k2, k3 为连续 3 根 K 线，k3 收盘时检查）：
1) 方向一致：多头三连阳 / 空头三连阴（过滤十字星）
2) 结构：多头低点抬升且高点抬升；空头高点下降且低点下降
3) DMI 方向确认：+DI > -DI（多）；+DI < -DI（空）
4) 影线缺口比率 >= min_wick_gap_ratio
5) 三根平均波幅与 ATR 的百分差 <= k_atr_ratio
执行：在 k3 收盘下单（建议在 Runner 侧开启 cheat_on_close），SL=第1根低/高点，TP=等距扩展。
"""

import backtrader as bt
from typing import Dict, Any
from .base_strategy import BaseStrategy


class ThreeLineTrendAtrStrategy(BaseStrategy):
    """
    三线趋势 + DMI + ATR 策略

    参数：
    - dmi_period: DMI 周期（默认 14）
    - atr_period: ATR 周期（默认 14）
    - min_body_ratio: 最小实体占比，过滤十字星（默认 0.001）
    - min_wick_gap_ratio: 影线缺口最小百分比（默认 0，单位 %）
    - k_atr_ratio: 平均波幅与 ATR 的允许百分差（默认 25，单位 %）
    - stake_pct: 可用资金占比建仓（默认 0.95）
    """

    params = (
        ("dmi_period", 14),
        ("atr_period", 14),
        ("min_body_ratio", 0.001),
        ("min_wick_gap_ratio", 0.0),
        ("k_atr_ratio", 25.0),
        ("stake_pct", 0.95),
    )

    def __init__(self):
        super().__init__()

        self.dmi = bt.indicators.DirectionalMovementIndex(self.data, period=self.p.dmi_period)
        self.plus_di = self.dmi.plusDI
        self.minus_di = self.dmi.minusDI

        self.atr = bt.indicators.AverageTrueRange(self.data, period=self.p.atr_period)

        self.stop_price = None
        self.take_profit = None
        self.entry_type = None  # "long" / "short"
        self.entry_price = None

        # 缓存入场时的因子，便于在退出时复用
        self._last_wick_gap_ratio = 0.0
        self._last_atr_diff_percent = 0.0
        self._last_trend_dir = "none"

    def _is_directional_candle(self, idx: int, bullish: bool) -> bool:
        close = self.data.close[idx]
        open_price = self.data.open[idx]
        body = abs(close - open_price)
        total_range = self.data.high[idx] - self.data.low[idx]

        # 过滤十字星/极小实体
        if total_range > 0 and (body / total_range) < self.p.min_body_ratio:
            return False

        return close > open_price if bullish else close < open_price

    def _calc_wick_gap_ratio(self, bullish: bool) -> float:
        h1, h2, h3 = self.data.high[-2], self.data.high[-1], self.data.high[0]
        l1, l2, l3 = self.data.low[-2], self.data.low[-1], self.data.low[0]

        total_range = max(h1, h2, h3) - min(l1, l2, l3)
        if total_range <= 0:
            return 0.0

        if bullish:
            wick_gap = max(0.0, l3 - h1)
        else:
            wick_gap = max(0.0, l1 - h3)

        return (wick_gap / total_range) * 100.0

    def _calc_atr_diff_percent(self) -> tuple[float, float]:
        h1, h2, h3 = self.data.high[-2], self.data.high[-1], self.data.high[0]
        l1, l2, l3 = self.data.low[-2], self.data.low[-1], self.data.low[0]

        k_range1, k_range2, k_range3 = h1 - l1, h2 - l2, h3 - l3
        avg_range = (k_range1 + k_range2 + k_range3) / 3.0
        atr_value = self.atr[0]

        if atr_value <= 0:
            return atr_value, float("inf")

        atr_diff_percent = abs(atr_value - avg_range) / atr_value * 100.0
        return atr_value, atr_diff_percent

    def _check_bullish_setup(self) -> bool:
        # 1) 连续三阳且非十字
        if not (
            self._is_directional_candle(-2, bullish=True)
            and self._is_directional_candle(-1, bullish=True)
            and self._is_directional_candle(0, bullish=True)
        ):
            return False

        # 2) 低点/高点抬升
        if not (self.data.low[-1] > self.data.low[-2] and self.data.low[0] > self.data.low[-1]):
            return False
        if not (self.data.high[-1] >= self.data.high[-2] and self.data.high[0] >= self.data.high[-1]):
            return False

        # 3) DMI 多头
        if self.plus_di[0] <= self.minus_di[0]:
            return False

        # 4) 影线缺口
        wick_ratio = self._calc_wick_gap_ratio(bullish=True)
        if wick_ratio < self.p.min_wick_gap_ratio:
            return False

        # 5) ATR 差
        atr_value, atr_diff = self._calc_atr_diff_percent()
        if atr_diff > self.p.k_atr_ratio:
            return False

        # 缓存因子
        self._last_wick_gap_ratio = wick_ratio
        self._last_atr_diff_percent = atr_diff
        self._last_trend_dir = "up"
        return True

    def _check_bearish_setup(self) -> bool:
        if not (
            self._is_directional_candle(-2, bullish=False)
            and self._is_directional_candle(-1, bullish=False)
            and self._is_directional_candle(0, bullish=False)
        ):
            return False

        if not (self.data.high[-1] < self.data.high[-2] and self.data.high[0] < self.data.high[-1]):
            return False
        if not (self.data.low[-1] <= self.data.low[-2] and self.data.low[0] <= self.data.low[-1]):
            return False

        if self.plus_di[0] >= self.minus_di[0]:
            return False

        wick_ratio = self._calc_wick_gap_ratio(bullish=False)
        if wick_ratio < self.p.min_wick_gap_ratio:
            return False

        atr_value, atr_diff = self._calc_atr_diff_percent()
        if atr_diff > self.p.k_atr_ratio:
            return False

        self._last_wick_gap_ratio = wick_ratio
        self._last_atr_diff_percent = atr_diff
        self._last_trend_dir = "down"
        return True

    def _calc_position_size(self) -> int:
        cash = self.broker.getcash()
        price = self.data.close[0]
        size = int((cash * self.p.stake_pct) / price)
        return max(size, 0)

    def get_entry_factors(self) -> Dict[str, Any]:
        return {
            "trendDirection": self._last_trend_dir,
            "wickGapRatio": self._last_wick_gap_ratio,
            "atrValue": self.atr[0],
            "atrDiffPercent": self._last_atr_diff_percent,
            "plusDI": self.plus_di[0],
            "minusDI": self.minus_di[0],
            "k1_high": self.data.high[-2],
            "k1_low": self.data.low[-2],
            "k3_close": self.data.close[0],
            "stop_price": self.stop_price if self.stop_price else 0,
            "take_profit": self.take_profit if self.take_profit else 0,
            "entry_type": self.entry_type if self.entry_type else "none",
        }

    def get_exit_factors(self) -> Dict[str, Any]:
        return {
            "trendDirection": self._last_trend_dir,
            "wickGapRatio": self._last_wick_gap_ratio,
            "atrValue": self.atr[0],
            "atrDiffPercent": self._last_atr_diff_percent,
            "close": self.data.close[0],
            "stop_price": self.stop_price if self.stop_price else 0,
            "take_profit": self.take_profit if self.take_profit else 0,
            "entry_type": self.entry_type if self.entry_type else "none",
        }

    def next(self) -> None:
        if len(self.data) < max(3, self.p.dmi_period, self.p.atr_period):
            return
        if self.order:
            return

        # 开仓
        if not self.position:
            size = self._calc_position_size()
            if size <= 0:
                return

            price = self.data.close[0]
            if self._check_bullish_setup():
                self.entry_price = price
                self.entry_type = "long"
                self.stop_price = self.data.low[-2]
                self.take_profit = 2 * price - self.data.low[-2]
                self.order = self.buy(size=size, exectype=bt.Order.Market)
                self.log(
                    f"BUY @close signal: price={price:.4f}, sl={self.stop_price:.4f}, tp={self.take_profit:.4f}, size={size}"
                )
            elif self._check_bearish_setup():
                self.entry_price = price
                self.entry_type = "short"
                self.stop_price = self.data.high[-2]
                self.take_profit = 2 * price - self.data.high[-2]
                self.order = self.sell(size=size, exectype=bt.Order.Market)
                self.log(
                    f"SELL @close signal: price={price:.4f}, sl={self.stop_price:.4f}, tp={self.take_profit:.4f}, size={size}"
                )
            return

        # 持仓止盈/止损
        if self.entry_type == "long":
            if self.take_profit and self.data.high[0] >= self.take_profit:
                self.log(f"LONG TP hit: {self.take_profit:.4f}")
                self.order = self.sell(size=self.position.size, exectype=bt.Order.Market)
            elif self.stop_price and self.data.low[0] <= self.stop_price:
                self.log(f"LONG SL hit: {self.stop_price:.4f}")
                self.order = self.sell(size=self.position.size, exectype=bt.Order.Market)
        elif self.entry_type == "short":
            if self.take_profit and self.data.low[0] <= self.take_profit:
                self.log(f"SHORT TP hit: {self.take_profit:.4f}")
                self.order = self.buy(size=abs(self.position.size), exectype=bt.Order.Market)
            elif self.stop_price and self.data.high[0] >= self.stop_price:
                self.log(f"SHORT SL hit: {self.stop_price:.4f}")
                self.order = self.buy(size=abs(self.position.size), exectype=bt.Order.Market)

    def notify_order(self, order: bt.Order) -> None:
        super().notify_order(order)
        # 清理状态
        if order.status in [order.Completed, order.Canceled, order.Rejected]:
            if not self.position:
                self.entry_type = None
                self.entry_price = None
                self.stop_price = None
                self.take_profit = None
