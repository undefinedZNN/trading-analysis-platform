"""
多周期策略示例

演示如何使用1秒数据进行精确成交模拟，同时基于5分钟数据生成交易信号。
"""

import backtrader as bt
import pandas as pd
from datetime import datetime


class MultiTimeframeStrategy(bt.Strategy):
    """
    多周期均线策略
    
    - 信号：基于5分钟均线交叉
    - 成交：使用1秒数据当前价格
    - 止损/止盈：每1秒检查
    """
    
    params = (
        ('fast_period', 10),      # 快速均线周期（5分钟）
        ('slow_period', 20),      # 慢速均线周期（5分钟）
        ('stop_loss_pct', 0.01),  # 止损百分比（1%）
        ('take_profit_pct', 0.02), # 止盈百分比（2%）
        ('printlog', True),       # 打印日志
    )
    
    def __init__(self):
        # 数据引用
        self.data_1s = self.datas[0]    # 1秒数据（主数据）
        self.data_5m = self.datas[1]    # 5分钟数据（信号数据）
        
        # 基于5分钟数据计算指标
        self.sma_fast = bt.indicators.SimpleMovingAverage(
            self.data_5m.close, 
            period=self.p.fast_period
        )
        self.sma_slow = bt.indicators.SimpleMovingAverage(
            self.data_5m.close, 
            period=self.p.slow_period
        )
        
        # 交叉信号
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
        
        # 持仓追踪
        self.order = None
        self.entry_price = None
        self.entry_time = None
        self.stop_loss_price = None
        self.take_profit_price = None
        
        # 统计
        self.trade_count = 0
        self.last_5m_len = 0  # 用于检测5分钟新Bar
        
    def log(self, txt, dt=None):
        """日志输出"""
        if self.p.printlog:
            dt = dt or self.data_1s.datetime.datetime(0)
            print(f'[{dt.isoformat()}] {txt}')
    
    def notify_order(self, order):
        """订单状态通知"""
        if order.status in [order.Submitted, order.Accepted]:
            return
        
        if order.status in [order.Completed]:
            if order.isbuy():
                self.log(f'BUY EXECUTED: Price={order.executed.price:.2f}, '
                        f'Cost={order.executed.value:.2f}, '
                        f'Commission={order.executed.comm:.2f}')
            else:
                self.log(f'SELL EXECUTED: Price={order.executed.price:.2f}, '
                        f'Cost={order.executed.value:.2f}, '
                        f'Commission={order.executed.comm:.2f}')
        
        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            self.log(f'Order Canceled/Margin/Rejected')
        
        self.order = None
    
    def notify_trade(self, trade):
        """交易完成通知"""
        if not trade.isclosed:
            return
        
        self.trade_count += 1
        self.log(f'TRADE #{self.trade_count} CLOSED: '
                f'PnL={trade.pnl:.2f}, PnL%={trade.pnlcomm/trade.value*100:.2f}%')
    
    def next(self):
        """策略主逻辑（每1秒调用一次）"""
        
        # === 1. 检查5分钟新Bar ===
        current_5m_len = len(self.data_5m)
        is_new_5m_bar = current_5m_len > self.last_5m_len
        
        if is_new_5m_bar:
            self.last_5m_len = current_5m_len
            
            # 5分钟Bar收盘，检查交易信号
            self._check_entry_signals()
        
        # === 2. 每1秒检查止损/止盈 ===
        if self.position:
            self._check_exit_conditions()
    
    def _check_entry_signals(self):
        """检查入场信号（基于5分钟数据）"""
        
        # 已有订单或持仓，不再开仓
        if self.order or self.position:
            return
        
        # 等待指标计算完成
        if len(self.data_5m) < self.p.slow_period:
            return
        
        current_price = self.data_1s.close[0]  # 使用1秒数据的当前价格
        
        # 金叉 - 买入信号
        if self.crossover[0] > 0:
            self.log(f'🔔 BUY SIGNAL: SMA_Fast={self.sma_fast[0]:.2f}, '
                    f'SMA_Slow={self.sma_slow[0]:.2f}, '
                    f'Current Price (1s)={current_price:.2f}')
            
            # 计算止损/止盈价格
            self.entry_price = current_price
            self.stop_loss_price = current_price * (1 - self.p.stop_loss_pct)
            self.take_profit_price = current_price * (1 + self.p.take_profit_pct)
            
            self.log(f'   Stop Loss: {self.stop_loss_price:.2f}, '
                    f'Take Profit: {self.take_profit_price:.2f}')
            
            # 使用1秒数据的当前价格开仓
            self.order = self.buy()
            self.entry_time = self.data_1s.datetime.datetime(0)
        
        # 死叉 - 如果有持仓则卖出（这里简化为只做多）
        elif self.crossover[0] < 0 and self.position:
            self.log(f'🔔 SELL SIGNAL: SMA_Fast={self.sma_fast[0]:.2f}, '
                    f'SMA_Slow={self.sma_slow[0]:.2f}')
            self.order = self.close()
    
    def _check_exit_conditions(self):
        """检查出场条件（每1秒检查）"""
        
        if not self.position or self.order:
            return
        
        current_price = self.data_1s.close[0]
        
        # 止损
        if current_price <= self.stop_loss_price:
            holding_time = self.data_1s.datetime.datetime(0) - self.entry_time
            self.log(f'🛑 STOP LOSS TRIGGERED: '
                    f'Entry={self.entry_price:.2f}, '
                    f'Current={current_price:.2f}, '
                    f'Loss={(current_price/self.entry_price-1)*100:.2f}%, '
                    f'Holding={holding_time}')
            self.order = self.close()
        
        # 止盈
        elif current_price >= self.take_profit_price:
            holding_time = self.data_1s.datetime.datetime(0) - self.entry_time
            self.log(f'💰 TAKE PROFIT TRIGGERED: '
                    f'Entry={self.entry_price:.2f}, '
                    f'Current={current_price:.2f}, '
                    f'Profit={(current_price/self.entry_price-1)*100:.2f}%, '
                    f'Holding={holding_time}')
            self.order = self.close()
    
    def stop(self):
        """回测结束"""
        self.log(f'========================================')
        self.log(f'Backtest Complete!')
        self.log(f'Total Trades: {self.trade_count}')
        self.log(f'Final Portfolio Value: {self.broker.getvalue():.2f}')
        self.log(f'========================================')


def run_multi_timeframe_backtest():
    """运行多周期回测示例"""
    
    print("=" * 70)
    print("多周期回测示例")
    print("=" * 70)
    
    cerebro = bt.Cerebro()
    
    # === 1. 加载1秒数据 ===
    # 这里使用模拟数据，实际应该从Parquet加载
    print("\n📊 加载数据...")
    
    # 模拟1秒数据（实际应该从Parquet加载）
    dates = pd.date_range('2023-01-01 09:30:00', '2023-01-01 16:00:00', freq='1S')
    df_1s = pd.DataFrame({
        'datetime': dates,
        'open': 4000 + pd.Series(range(len(dates))).apply(lambda x: x % 100),
        'high': 4001 + pd.Series(range(len(dates))).apply(lambda x: x % 100),
        'low': 3999 + pd.Series(range(len(dates))).apply(lambda x: x % 100),
        'close': 4000 + pd.Series(range(len(dates))).apply(lambda x: x % 100),
        'volume': 100,
    })
    df_1s.set_index('datetime', inplace=True)
    
    print(f"   1秒数据: {len(df_1s)} bars")
    
    # 创建1秒数据Feed
    data_1s = bt.feeds.PandasData(dataname=df_1s)
    cerebro.adddata(data_1s, name='1s')
    
    # === 2. 重采样为5分钟数据 ===
    cerebro.resampledata(
        data_1s,
        timeframe=bt.TimeFrame.Minutes,
        compression=5,
        name='5m'
    )
    print(f"   5分钟数据: ~{len(df_1s) // 300} bars (重采样)")
    
    # === 3. 添加策略 ===
    cerebro.addstrategy(
        MultiTimeframeStrategy,
        fast_period=10,
        slow_period=20,
        stop_loss_pct=0.01,
        take_profit_pct=0.02,
    )
    
    # === 4. 设置资金和手续费 ===
    initial_capital = 100000
    cerebro.broker.setcash(initial_capital)
    cerebro.broker.setcommission(commission=0.001)  # 0.1%手续费
    
    print(f"\n💰 初始资金: ${initial_capital:,.2f}")
    print(f"   手续费: 0.1%")
    
    # === 5. 运行回测 ===
    print(f"\n🚀 开始回测...\n")
    cerebro.run()
    
    # === 6. 输出结果 ===
    final_value = cerebro.broker.getvalue()
    pnl = final_value - initial_capital
    roi = (pnl / initial_capital) * 100
    
    print("\n" + "=" * 70)
    print("📊 回测结果")
    print("=" * 70)
    print(f"初始资金: ${initial_capital:,.2f}")
    print(f"最终资金: ${final_value:,.2f}")
    print(f"净盈亏:   ${pnl:,.2f}")
    print(f"收益率:   {roi:.2f}%")
    print("=" * 70)


if __name__ == '__main__':
    run_multi_timeframe_backtest()


