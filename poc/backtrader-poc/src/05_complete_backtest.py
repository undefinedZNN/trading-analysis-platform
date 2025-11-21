#!/usr/bin/env python3
"""
POC Day 5 - 完整回测脚本 + 统计指标
集成所有组件：数据加载、策略执行、因子收集、进度上报、统计指标计算
"""

import backtrader as bt
import pandas as pd
import json
import os
import sys
import time
from datetime import datetime
from typing import Dict, Any, List

# 导入之前实现的模块
sys.path.insert(0, os.path.dirname(__file__))
from cached_datafeed import CachedParquetDataFeed

# 导入 RabbitMQ 模块（从 04_rabbitmq_communication.py）
import importlib.util
spec = importlib.util.spec_from_file_location("rabbitmq_module", os.path.join(os.path.dirname(__file__), "04_rabbitmq_communication.py"))
rabbitmq_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rabbitmq_module)
BacktestMessageSender = rabbitmq_module.BacktestMessageSender
MessageType = rabbitmq_module.MessageType


class ProgressTracker:
    """进度跟踪器"""
    
    def __init__(self, total_bars: int, message_sender: BacktestMessageSender, task_id: str):
        self.total_bars = total_bars
        self.current_bar = 0
        self.message_sender = message_sender
        self.task_id = task_id
        self.last_report_time = time.time()
        self.report_interval = 1.0  # 每秒上报一次
        
    def update(self, bar_index: int):
        """更新进度"""
        self.current_bar = bar_index
        
        # 检查是否需要上报
        current_time = time.time()
        if current_time - self.last_report_time >= self.report_interval:
            progress = (self.current_bar / self.total_bars) * 100 if self.total_bars > 0 else 0
            self.message_sender.send_task_progress(
                task_id=self.task_id,
                progress=progress,
                current_bar=self.current_bar,
                total_bars=self.total_bars,
            )
            self.last_report_time = current_time


class FactorCollector:
    """因子收集器"""
    
    def __init__(self):
        self.factors_data = []
        self.current_position_factors = None  # 只保存最近一次入场的因子
    
    def get_factors_data(self):
        """获取收集的因子数据"""
        return self.factors_data
    
    def record_entry_factors(self, datetime_obj, order, **factors):
        """记录入场因子（固化）"""
        entry_factors = {
            'entry_datetime': datetime_obj,
            'entry_price': order.executed.price,
            'entry_size': order.executed.size,
            'entry_order_ref': order.ref,
            **factors  # 入场时的其他因子
        }
        
        # 保存到当前持仓因子（简化为单一持仓）
        self.current_position_factors = entry_factors.copy()
    
    def record_exit_factors(self, datetime_obj, order, pnl, pnl_percent, **factors):
        """记录出场因子（固化）"""
        # 获取入场时的因子
        entry_factors = self.current_position_factors if self.current_position_factors else {}
        
        # 合并入场因子和出场因子
        trade_record = {
            **entry_factors,  # 入场因子
            'exit_datetime': datetime_obj,
            'exit_price': order.executed.price,
            'exit_size': order.executed.size,
            'exit_order_ref': order.ref,
            'pnl': pnl,
            'pnl_percent': pnl_percent,
            **factors  # 出场因子
        }
        
        self.factors_data.append(trade_record)
        
        # 清理已完成的持仓因子
        self.current_position_factors = None


class CompleteMAStrategy(bt.Strategy):
    """
    完整的 MA 双均线策略
    集成进度跟踪和因子收集
    """
    
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
        ('printlog', False),
        ('task_id', 'default_task'),
        ('message_sender', None),
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
        
        # 因子收集器
        self.factor_collector = FactorCollector()
        
        # 进度跟踪器
        self.progress_tracker = None
        if self.p.message_sender:
            # 获取数据总长度（需要在 start 中初始化）
            pass
        
        # 记录订单
        self.order = None
        self.entry_price = None
        self.entry_bar = None
        
        # 统计
        self.trade_count = 0
        self.bar_count = 0
    
    def start(self):
        """策略开始时调用"""
        # 初始化进度跟踪器
        if self.p.message_sender:
            # 获取数据长度
            total_bars = len(self.data)
            self.progress_tracker = ProgressTracker(
                total_bars=total_bars,
                message_sender=self.p.message_sender,
                task_id=self.p.task_id,
            )
    
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
                self.log(f'  ✅ 买入执行: 价格={order.executed.price:.2f}, 数量={order.executed.size:.0f}')
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
                self.log(f'  ✅ 卖出执行: 价格={order.executed.price:.2f}, 数量={order.executed.size:.0f}')
                
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
        self.bar_count += 1
        
        # 更新进度
        if self.progress_tracker:
            self.progress_tracker.update(self.bar_count)
        
        # 检查是否有未完成订单
        if self.order:
            return
        
        # 没有持仓
        if not self.position:
            # 金叉 - 买入信号
            if self.crossover > 0:
                self.log(f'  🔵 买入信号')
                self.order = self.buy()
        
        # 有持仓
        else:
            # 死叉 - 卖出信号
            if self.crossover < 0:
                self.log(f'  🔴 卖出信号')
                self.order = self.sell()


class BacktestAnalyzer:
    """回测结果分析器"""
    
    @staticmethod
    def calculate_statistics(
        initial_cash: float,
        final_value: float,
        trades: List[Dict[str, Any]],
        equity_curve: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        计算回测统计指标
        
        Args:
            initial_cash: 初始资金
            final_value: 最终资金
            trades: 交易记录
            equity_curve: 权益曲线（可选）
        
        Returns:
            统计指标字典
        """
        # 基础指标
        total_pnl = final_value - initial_cash
        total_return = (total_pnl / initial_cash) * 100
        
        # 交易统计
        total_trades = len(trades)
        
        if total_trades == 0:
            return {
                'initial_cash': initial_cash,
                'final_value': final_value,
                'total_pnl': total_pnl,
                'total_return': total_return,
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'avg_pnl': 0,
                'avg_winning_pnl': 0,
                'avg_losing_pnl': 0,
                'max_winning_pnl': 0,
                'max_losing_pnl': 0,
                'profit_factor': 0,
                'max_drawdown': 0,
                'max_drawdown_percent': 0,
                'sharpe_ratio': 0,
            }
        
        # 盈亏分析
        pnl_list = [trade['pnl'] for trade in trades]
        winning_trades = [trade for trade in trades if trade['pnl'] > 0]
        losing_trades = [trade for trade in trades if trade['pnl'] < 0]
        
        total_winning = len(winning_trades)
        total_losing = len(losing_trades)
        win_rate = (total_winning / total_trades) * 100 if total_trades > 0 else 0
        
        avg_pnl = sum(pnl_list) / len(pnl_list)
        avg_winning_pnl = sum([t['pnl'] for t in winning_trades]) / len(winning_trades) if winning_trades else 0
        avg_losing_pnl = sum([t['pnl'] for t in losing_trades]) / len(losing_trades) if losing_trades else 0
        
        max_winning_pnl = max([t['pnl'] for t in winning_trades]) if winning_trades else 0
        max_losing_pnl = min([t['pnl'] for t in losing_trades]) if losing_trades else 0
        
        # 盈亏比
        total_profit = sum([t['pnl'] for t in winning_trades])
        total_loss = abs(sum([t['pnl'] for t in losing_trades]))
        profit_factor = total_profit / total_loss if total_loss > 0 else float('inf')
        
        # 最大回撤（简化版，基于交易记录）
        max_drawdown = 0
        max_drawdown_percent = 0
        
        if trades:
            cumulative_pnl = 0
            peak = initial_cash
            
            for trade in trades:
                cumulative_pnl += trade['pnl']
                current_value = initial_cash + cumulative_pnl
                
                if current_value > peak:
                    peak = current_value
                
                drawdown = peak - current_value
                drawdown_percent = (drawdown / peak) * 100 if peak > 0 else 0
                
                if drawdown > max_drawdown:
                    max_drawdown = drawdown
                    max_drawdown_percent = drawdown_percent
        
        # 夏普比率（简化版）
        if len(pnl_list) > 1:
            returns = pd.Series(pnl_list)
            sharpe_ratio = (returns.mean() / returns.std()) * (252 ** 0.5) if returns.std() > 0 else 0
        else:
            sharpe_ratio = 0
        
        return {
            'initial_cash': initial_cash,
            'final_value': final_value,
            'total_pnl': total_pnl,
            'total_return': total_return,
            'total_trades': total_trades,
            'winning_trades': total_winning,
            'losing_trades': total_losing,
            'win_rate': win_rate,
            'avg_pnl': avg_pnl,
            'avg_winning_pnl': avg_winning_pnl,
            'avg_losing_pnl': avg_losing_pnl,
            'max_winning_pnl': max_winning_pnl,
            'max_losing_pnl': max_losing_pnl,
            'profit_factor': profit_factor,
            'max_drawdown': max_drawdown,
            'max_drawdown_percent': max_drawdown_percent,
            'sharpe_ratio': sharpe_ratio,
        }


def run_complete_backtest(
    symbol: str = 'ES',
    start_date: str = '2022-12-15 00:06:15',
    end_date: str = '2022-12-15 23:59:59',
    aggregate_timeframe: str = '1min',
    initial_cash: float = 100000.0,
    commission: float = 0.001,
    fast_period: int = 10,
    slow_period: int = 20,
    task_id: str = 'backtest_001',
    enable_rabbitmq: bool = True,
    output_dir: str = '../results',
    printlog: bool = False,
) -> Dict[str, Any]:
    """
    运行完整回测
    
    Args:
        symbol: 品种代码
        start_date: 开始日期
        end_date: 结束日期
        aggregate_timeframe: 聚合时间周期
        initial_cash: 初始资金
        commission: 手续费率
        fast_period: 快线周期
        slow_period: 慢线周期
        task_id: 任务ID
        enable_rabbitmq: 是否启用 RabbitMQ
        output_dir: 输出目录
        printlog: 是否打印日志
    
    Returns:
        回测结果字典
    """
    print("🚀 POC Day 5 - 完整回测脚本")
    print("=" * 60)
    
    # 1. 初始化 RabbitMQ（如果启用）
    message_sender = None
    if enable_rabbitmq:
        print("\n📡 连接到 RabbitMQ...")
        message_sender = BacktestMessageSender()
        if not message_sender.connect():
            print("⚠️  RabbitMQ 连接失败，将禁用进度上报")
            message_sender = None
    
    # 2. 发送任务开始消息
    if message_sender:
        message_sender.send_task_started(
            task_id=task_id,
            strategy_name="MA_Strategy",
            params={
                'symbol': symbol,
                'start_date': start_date,
                'end_date': end_date,
                'fast_period': fast_period,
                'slow_period': slow_period,
                'initial_cash': initial_cash,
            }
        )
    
    # 3. 创建 Cerebro
    cerebro = bt.Cerebro()
    cerebro.broker.setcash(initial_cash)
    cerebro.broker.setcommission(commission=commission)
    
    # 4. 添加数据源
    print(f"\n📊 加载数据...")
    print(f"  品种: {symbol}")
    print(f"  时间范围: {start_date} ~ {end_date}")
    print(f"  时间周期: {aggregate_timeframe}")
    
    data = CachedParquetDataFeed(
        symbol=symbol,
        start_date=start_date,
        end_date=end_date,
        aggregate_timeframe=aggregate_timeframe,
    )
    cerebro.adddata(data)
    
    # 5. 添加策略
    cerebro.addstrategy(
        CompleteMAStrategy,
        fast_period=fast_period,
        slow_period=slow_period,
        printlog=printlog,
        task_id=task_id,
        message_sender=message_sender,
    )
    
    # 6. 运行回测
    print("\n" + "=" * 60)
    print("开始回测...")
    print("=" * 60)
    
    start_time = time.time()
    strategies = cerebro.run()
    elapsed = time.time() - start_time
    
    strategy = strategies[0]
    
    # 7. 获取结果
    final_value = cerebro.broker.getvalue()
    trades = strategy.factor_collector.get_factors_data()
    
    # 8. 计算统计指标
    print("\n📊 计算统计指标...")
    statistics = BacktestAnalyzer.calculate_statistics(
        initial_cash=initial_cash,
        final_value=final_value,
        trades=trades,
    )
    
    # 9. 保存结果
    os.makedirs(output_dir, exist_ok=True)
    
    # 9.1 保存交易记录（Parquet）
    trades_file = os.path.join(output_dir, f'{task_id}_trades.parquet')
    if trades:
        df_trades = pd.DataFrame(trades)
        df_trades.to_parquet(trades_file, index=False)
        print(f"  ✅ 交易记录已保存: {trades_file}")
    else:
        print(f"  ⚠️  无交易记录")
    
    # 9.2 保存统计结果（JSON）
    result = {
        'task_id': task_id,
        'parameters': {
            'symbol': symbol,
            'start_date': start_date,
            'end_date': end_date,
            'aggregate_timeframe': aggregate_timeframe,
            'initial_cash': initial_cash,
            'commission': commission,
            'fast_period': fast_period,
            'slow_period': slow_period,
        },
        'statistics': statistics,
        'execution': {
            'elapsed_seconds': elapsed,
            'trades_count': len(trades),
        },
        'files': {
            'trades': trades_file if trades else None,
        },
        'timestamp': datetime.now().isoformat(),
    }
    
    result_file = os.path.join(output_dir, f'{task_id}_result.json')
    with open(result_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"  ✅ 统计结果已保存: {result_file}")
    
    # 10. 发送任务完成消息
    if message_sender:
        message_sender.send_task_completed(
            task_id=task_id,
            result={
                'final_value': final_value,
                'total_pnl': statistics['total_pnl'],
                'total_return': statistics['total_return'],
                'total_trades': statistics['total_trades'],
                'win_rate': statistics['win_rate'],
                'elapsed_seconds': elapsed,
            }
        )
        message_sender.disconnect()
    
    # 11. 打印结果摘要
    print("\n" + "=" * 60)
    print("📊 回测结果摘要")
    print("=" * 60)
    
    print(f"\n💰 资金情况:")
    print(f"  初始资金: ${statistics['initial_cash']:,.2f}")
    print(f"  最终资金: ${statistics['final_value']:,.2f}")
    print(f"  盈亏金额: ${statistics['total_pnl']:,.2f}")
    print(f"  盈亏比例: {statistics['total_return']:+.2f}%")
    
    print(f"\n📈 交易统计:")
    print(f"  总交易数: {statistics['total_trades']}")
    print(f"  盈利交易: {statistics['winning_trades']}")
    print(f"  亏损交易: {statistics['losing_trades']}")
    print(f"  胜率: {statistics['win_rate']:.2f}%")
    print(f"  平均盈亏: ${statistics['avg_pnl']:.2f}")
    print(f"  盈亏比: {statistics['profit_factor']:.2f}")
    
    print(f"\n📉 风险指标:")
    print(f"  最大回撤: ${statistics['max_drawdown']:.2f} ({statistics['max_drawdown_percent']:.2f}%)")
    print(f"  夏普比率: {statistics['sharpe_ratio']:.2f}")
    
    print(f"\n⏱️  执行时间: {elapsed:.2f} 秒")
    
    print("\n✅ 完整回测执行成功！")
    
    return result


if __name__ == "__main__":
    result = run_complete_backtest(
        symbol='ES',
        start_date='2022-12-15 00:06:15',
        end_date='2022-12-15 23:59:59',
        aggregate_timeframe='1min',
        initial_cash=100000.0,
        commission=0.001,
        fast_period=10,
        slow_period=20,
        task_id='backtest_day5_001',
        enable_rabbitmq=True,
        output_dir='../results',
        printlog=False,
    )
    
    print(f"\n📄 结果文件:")
    print(f"  - {result['files']['trades']}")
    print(f"  - {result['files']['trades'].replace('_trades.parquet', '_result.json')}")

