#!/usr/bin/env python3
"""
最简单的回测测试 - 直接使用Backtrader，不走Worker逻辑
"""

import sys
import backtrader as bt
from pathlib import Path
from datetime import datetime
import pandas as pd
import logging

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

# 添加项目路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from src.backtrader_integration.factors.factor_collector import FactorCollector


class SimpleStrategy(bt.Strategy):
    """简单的双均线策略"""
    
    params = (
        ('fast', 10),
        ('slow', 20),
        ('printlog', True),
    )
    
    def __init__(self):
        self.sma_fast = bt.indicators.SMA(self.data.close, period=self.p.fast)
        self.sma_slow = bt.indicators.SMA(self.data.close, period=self.p.slow)
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
        
        # 添加因子收集器
        self.factor_collector = FactorCollector()
        self.factor_collector.set_strategy(self)
        
        self.order = None
        self.entry_price = None
        self.entry_bar = None
        self.trade_count = 0
        
        logger.info("Strategy initialized")
    
    def notify_order(self, order):
        """订单通知"""
        if order.status in [order.Submitted, order.Accepted]:
            return
        
        if order.status == order.Completed:
            if order.isbuy():
                logger.info(f"BUY EXECUTED: price={order.executed.price:.2f}, size={order.executed.size}, ref={order.ref}")
                self.entry_price = order.executed.price
                self.entry_bar = len(self)
                
                # 记录入场因子
                self.factor_collector.record_entry_factors(
                    order=order,
                    price=order.executed.price,
                    size=order.executed.size,
                    commission=order.executed.comm,
                    sma_fast=self.sma_fast[0],
                    sma_slow=self.sma_slow[0],
                    close=self.data.close[0],
                    volume=self.data.volume[0],
                )
                
            elif order.issell():
                logger.info(f"SELL EXECUTED: price={order.executed.price:.2f}, size={order.executed.size}, ref={order.ref}")
                
                if self.entry_price:
                    pnl = (order.executed.price - self.entry_price) * order.executed.size
                    pnl_percent = ((order.executed.price - self.entry_price) / self.entry_price) * 100
                    holding_bars = len(self) - self.entry_bar
                    
                    logger.info(f"TRADE PNL: ${pnl:.2f} ({pnl_percent:.2f}%)")
                    
                    # 记录出场因子
                    self.factor_collector.record_exit_factors(
                        order=order,
                        pnl=pnl,
                        pnl_percent=pnl_percent,
                        holding_bars=holding_bars,
                        sma_fast=self.sma_fast[0],
                        sma_slow=self.sma_slow[0],
                        close=self.data.close[0],
                        volume=self.data.volume[0],
                    )
                    
                    self.trade_count += 1
                    self.entry_price = None
                    self.entry_bar = None
        
        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            logger.warning(f"Order {order.status}: ref={order.ref}")
        
        self.order = None
    
    def next(self):
        """策略逻辑"""
        # 检查是否有未完成订单
        if self.order:
            return
        
        # 没有持仓
        if not self.position:
            # 金叉 - 买入
            if self.crossover > 0:
                logger.info(f"BUY SIGNAL: fast={self.sma_fast[0]:.2f}, slow={self.sma_slow[0]:.2f}, close={self.data.close[0]:.2f}")
                self.order = self.buy()
        # 有持仓
        else:
            # 死叉 - 卖出
            if self.crossover < 0:
                logger.info(f"SELL SIGNAL: fast={self.sma_fast[0]:.2f}, slow={self.sma_slow[0]:.2f}, close={self.data.close[0]:.2f}")
                self.order = self.sell()
    
    def stop(self):
        """策略结束"""
        logger.info(f"Strategy completed:")
        logger.info(f"  Total trades: {self.trade_count}")
        logger.info(f"  Factor collector trades: {self.factor_collector.get_trades_count()}")
        logger.info(f"  Final value: {self.broker.getvalue():.2f}")


def test_simple_backtest():
    """简单回测测试"""
    print("=" * 80)
    print("  简单回测测试")
    print("=" * 80)
    print()
    
    # 加载数据
    data_file = project_root.parent / 'backend' / 'storage' / 'datasets' / 'ES-23' / 'ES' / '5m' / 'agg_5m_from_1s.parquet'
    print(f"加载数据: {data_file}")
    
    df = pd.read_parquet(data_file)
    
    # 过滤时间范围
    start_date = pd.Timestamp('2022-12-15', tz='UTC')
    end_date = pd.Timestamp('2022-12-16', tz='UTC')
    
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
    df = df[(df['timestamp'] >= start_date) & (df['timestamp'] < end_date)]
    
    print(f"数据范围: {df['timestamp'].min()} 到 {df['timestamp'].max()}")
    print(f"数据条数: {len(df)}")
    print()
    
    # 准备Backtrader数据
    df = df.set_index('timestamp')
    df = df.rename(columns={
        'open': 'open',
        'high': 'high',
        'low': 'low',
        'close': 'close',
        'volume': 'volume'
    })
    
    # 创建Cerebro
    cerebro = bt.Cerebro()
    
    # 添加策略
    cerebro.addstrategy(SimpleStrategy, fast=10, slow=20)
    
    # 添加数据
    data = bt.feeds.PandasData(dataname=df)
    cerebro.adddata(data)
    
    # 设置初始资金
    initial_cash = 100000
    cerebro.broker.setcash(initial_cash)
    
    # 设置手续费
    cerebro.broker.setcommission(commission=0.0005)
    
    print("=" * 80)
    print("  开始回测")
    print("=" * 80)
    print()
    
    print(f"初始资金: ${initial_cash:,.2f}")
    print()
    
    # 运行回测
    strategies = cerebro.run()
    strategy = strategies[0]
    
    final_value = cerebro.broker.getvalue()
    pnl = final_value - initial_cash
    pnl_percent = (pnl / initial_cash) * 100
    
    print()
    print("=" * 80)
    print("  回测结果")
    print("=" * 80)
    print()
    print(f"最终资金: ${final_value:,.2f}")
    print(f"总收益: ${pnl:,.2f} ({pnl_percent:.2f}%)")
    print(f"策略记录的交易数: {strategy.trade_count}")
    print(f"FactorCollector记录的交易数: {strategy.factor_collector.get_trades_count()}")
    print()
    
    # 检查交易记录
    trades_df = strategy.factor_collector.get_trades_df()
    print(f"交易DataFrame行数: {len(trades_df)}")
    
    if len(trades_df) > 0:
        print()
        print("前5条交易记录:")
        print(trades_df[['entry_datetime', 'entry_price', 'exit_datetime', 'exit_price', 'pnl', 'pnl_percent']].head())
    else:
        print()
        print("⚠️  FactorCollector中没有交易记录！")
        print()
        print("调试信息:")
        print(f"  • current_trade_info: {strategy.factor_collector.current_trade_info}")
        print(f"  • trades list: {strategy.factor_collector.trades}")
    
    print()
    print("=" * 80)
    
    return strategy


if __name__ == '__main__':
    strategy = test_simple_backtest()

