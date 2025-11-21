#!/usr/bin/env python3
"""
POC Day 3 - 实现 MA 双均线策略 + 因子收集
验证策略执行和因子收集功能
"""

import backtrader as bt
from datetime import datetime
import pandas as pd
import os
import sys

# 导入 Day 2 的 CachedParquetDataFeed
sys.path.insert(0, os.path.dirname(__file__))
from cached_datafeed import CachedParquetDataFeed


class FactorCollector:
    """
    因子收集器（简化版，不继承 Observer）
    负责在交易的各个阶段收集因子数据
    """
    
    def __init__(self):
        self.factors_data = []
        self.current_position_factors = {}
    
    def get_factors_data(self):
        """获取收集的因子数据"""
        return self.factors_data
    
    def record_entry_factors(self, datetime_obj, order, **factors):
        """记录入场因子（固化）"""
        factors['entry_datetime'] = datetime_obj
        factors['entry_price'] = order.executed.price
        factors['entry_size'] = order.executed.size
        factors['order_ref'] = order.ref
        
        # 保存到持仓期间的因子字典
        self.current_position_factors[order.ref] = factors.copy()
        
        print(f"  📊 入场因子固化: order_ref={order.ref}, sma_fast={factors.get('sma_fast'):.2f}, sma_slow={factors.get('sma_slow'):.2f}")
    
    def record_exit_factors(self, datetime_obj, order, pnl, pnl_percent, **factors):
        """记录出场因子（固化）"""
        # 获取入场时的因子
        entry_factors = self.current_position_factors.get(order.ref, {})
        
        # 合并入场因子和出场因子
        trade_record = {
            **entry_factors,  # 入场因子
            'exit_datetime': datetime_obj,
            'exit_price': order.executed.price,
            'exit_size': order.executed.size,
            'pnl': pnl,
            'pnl_percent': pnl_percent,
            **factors  # 出场因子
        }
        
        self.factors_data.append(trade_record)
        
        # 清理已完成的持仓因子
        if order.ref in self.current_position_factors:
            del self.current_position_factors[order.ref]
        
        print(f"  📊 出场因子固化: order_ref={order.ref}, pnl={pnl:.2f}, pnl_percent={pnl_percent:.2%}")


class MAStrategy(bt.Strategy):
    """
    简单的 MA 双均线策略
    - 快线上穿慢线：买入
    - 快线下穿慢线：卖出
    """
    
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
        ('printlog', True),
    )
    
    def __init__(self):
        # 计算均线
        self.sma_fast = bt.indicators.SimpleMovingAverage(
            self.data.close, period=self.p.fast_period
        )
        self.sma_slow = bt.indicators.SimpleMovingAverage(
            self.data.close, period=self.p.slow_period
        )
        
        # 交叉信号
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
        
        # 添加因子收集器
        self.factor_collector = FactorCollector()
        
        # 记录订单
        self.order = None
        self.entry_price = None
        self.entry_bar = None
        
        # 统计
        self.trade_count = 0
        
    def log(self, txt, dt=None):
        """日志输出"""
        if self.p.printlog:
            dt = dt or self.datetime.datetime()
            print(f'{dt.isoformat()} {txt}')
    
    def notify_order(self, order):
        """订单状态通知"""
        if order.status in [order.Submitted, order.Accepted]:
            return
        
        if order.status in [order.Completed]:
            if order.isbuy():
                self.log(f'  ✅ 买入执行: 价格={order.executed.price:.2f}, 数量={order.executed.size:.0f}, 成本={order.executed.value:.2f}, 手续费={order.executed.comm:.2f}')
                self.entry_price = order.executed.price
                self.entry_bar = len(self)
                
                # 记录入场因子
                self.factor_collector.record_entry_factors(
                    self.datetime.datetime(),
                    order,
                    sma_fast=self.sma_fast[0],
                    sma_slow=self.sma_slow[0],
                    close=self.data.close[0],
                    volume=self.data.volume[0],
                )
                
            elif order.issell():
                self.log(f'  ✅ 卖出执行: 价格={order.executed.price:.2f}, 数量={order.executed.size:.0f}, 成本={order.executed.value:.2f}, 手续费={order.executed.comm:.2f}')
                
                # 计算盈亏
                if self.entry_price:
                    pnl = order.executed.price - self.entry_price
                    pnl_percent = pnl / self.entry_price
                    
                    # 记录出场因子
                    self.factor_collector.record_exit_factors(
                        self.datetime.datetime(),
                        order,
                        pnl=pnl,
                        pnl_percent=pnl_percent,
                        sma_fast=self.sma_fast[0],
                        sma_slow=self.sma_slow[0],
                        close=self.data.close[0],
                        volume=self.data.volume[0],
                        holding_bars=len(self) - self.entry_bar if self.entry_bar else 0,
                    )
                    
                    self.trade_count += 1
                    self.entry_price = None
                    self.entry_bar = None
        
        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            self.log(f'  ❌ 订单取消/保证金不足/拒绝')
        
        self.order = None
    
    def next(self):
        """策略逻辑"""
        # 检查是否有未完成订单
        if self.order:
            return
        
        # 没有持仓
        if not self.position:
            # 金叉 - 买入信号
            if self.crossover > 0:
                self.log(f'  🔵 买入信号: SMA_Fast={self.sma_fast[0]:.2f} > SMA_Slow={self.sma_slow[0]:.2f}')
                self.order = self.buy()
        
        # 有持仓
        else:
            # 死叉 - 卖出信号
            if self.crossover < 0:
                self.log(f'  🔴 卖出信号: SMA_Fast={self.sma_fast[0]:.2f} < SMA_Slow={self.sma_slow[0]:.2f}')
                self.order = self.sell()
    
    def stop(self):
        """回测结束"""
        self.log(f'\n📊 策略执行完成')
        self.log(f'  - 参数: fast={self.p.fast_period}, slow={self.p.slow_period}')
        self.log(f'  - 最终资金: {self.broker.getvalue():.2f}')
        self.log(f'  - 交易次数: {self.trade_count}')


def run_backtest_with_factors():
    """运行带因子收集的回测"""
    print("🚀 POC Day 3 - MA 双均线策略 + 因子收集")
    print("=" * 60)
    
    # 创建 Cerebro
    cerebro = bt.Cerebro()
    
    # 设置初始资金
    initial_cash = 100000.0
    cerebro.broker.setcash(initial_cash)
    
    # 设置手续费（0.1%）
    cerebro.broker.setcommission(commission=0.001)
    
    # 添加数据源（使用带缓存的 DataFeed）
    print("\n📊 加载数据...")
    data = CachedParquetDataFeed(
        symbol='ES',
        start_date='2022-12-15 00:06:15',
        end_date='2022-12-15 23:59:59',
        aggregate_timeframe='1min'
    )
    cerebro.adddata(data)
    
    # 添加策略
    cerebro.addstrategy(MAStrategy, fast_period=10, slow_period=20, printlog=True)
    
    # 运行回测
    print("\n" + "=" * 60)
    print("开始回测...")
    print("=" * 60)
    
    start_time = datetime.now()
    strategies = cerebro.run()
    elapsed = (datetime.now() - start_time).total_seconds()
    
    strategy = strategies[0]
    
    # 获取因子数据
    factors_data = strategy.factor_collector.get_factors_data()
    
    # 统计结果
    print("\n" + "=" * 60)
    print("📊 回测结果")
    print("=" * 60)
    
    final_value = cerebro.broker.getvalue()
    pnl = final_value - initial_cash
    pnl_percent = (pnl / initial_cash) * 100
    
    print(f"\n💰 资金情况:")
    print(f"  初始资金: ${initial_cash:,.2f}")
    print(f"  最终资金: ${final_value:,.2f}")
    print(f"  盈亏金额: ${pnl:,.2f}")
    print(f"  盈亏比例: {pnl_percent:+.2f}%")
    
    print(f"\n📈 交易统计:")
    print(f"  交易次数: {len(factors_data)}")
    print(f"  回测耗时: {elapsed:.2f} 秒")
    
    # 因子数据统计
    if factors_data:
        df_factors = pd.DataFrame(factors_data)
        
        print(f"\n📊 因子数据:")
        print(f"  收集记录数: {len(df_factors)}")
        print(f"  因子字段: {list(df_factors.columns)}")
        
        print(f"\n🎯 交易明细（前5条）:")
        print(df_factors.head().to_string())
        
        # 保存到 Parquet
        output_dir = os.path.join(os.path.dirname(__file__), "../results")
        os.makedirs(output_dir, exist_ok=True)
        output_file = os.path.join(output_dir, "trades_with_factors.parquet")
        
        df_factors.to_parquet(output_file, index=False)
        print(f"\n💾 因子数据已保存: {output_file}")
        
        # 盈亏统计
        winning_trades = df_factors[df_factors['pnl'] > 0]
        losing_trades = df_factors[df_factors['pnl'] < 0]
        
        print(f"\n📊 盈亏分析:")
        print(f"  盈利交易: {len(winning_trades)} ({len(winning_trades)/len(df_factors)*100:.1f}%)")
        print(f"  亏损交易: {len(losing_trades)} ({len(losing_trades)/len(df_factors)*100:.1f}%)")
        
        if len(winning_trades) > 0:
            print(f"  平均盈利: ${winning_trades['pnl'].mean():.2f}")
        if len(losing_trades) > 0:
            print(f"  平均亏损: ${losing_trades['pnl'].mean():.2f}")
    else:
        print(f"\n⚠️  未产生交易记录")
    
    # 验证结果
    print(f"\n{'='*60}")
    print("✅ 测试结果")
    print('='*60)
    
    success = True
    
    # 检查是否产生了交易
    if len(factors_data) > 0:
        print(f"✅ 策略产生交易: {len(factors_data)} 笔")
    else:
        print(f"⚠️  策略未产生交易（可能需要更长的数据周期）")
        success = False
    
    # 检查因子是否正确收集
    if factors_data and 'sma_fast' in df_factors.columns and 'sma_slow' in df_factors.columns:
        print(f"✅ 因子收集正常: 包含 {len(df_factors.columns)} 个字段")
    elif factors_data:
        print(f"⚠️  因子字段不完整")
        success = False
    
    # 检查 Parquet 文件
    if os.path.exists(output_file):
        print(f"✅ Parquet 文件生成成功")
    else:
        print(f"❌ Parquet 文件生成失败")
        success = False
    
    print(f"\n✅ MA 双均线策略 + 因子收集测试{'通过' if success else '部分完成'}！")
    
    return success


if __name__ == "__main__":
    success = run_backtest_with_factors()
    exit(0 if success else 1)

