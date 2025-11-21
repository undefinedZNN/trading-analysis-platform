#!/usr/bin/env python3
"""
POC Day 6 - 断点续跑实现
实现 Checkpoint 保存和恢复机制，支持回测任务的断点续跑
"""

import backtrader as bt
import pandas as pd
import json
import os
import sys
import time
import pickle
from datetime import datetime
from typing import Dict, Any, List, Optional

# 导入之前实现的模块
sys.path.insert(0, os.path.dirname(__file__))
from cached_datafeed import CachedParquetDataFeed

# 导入 RabbitMQ 模块
import importlib.util
spec = importlib.util.spec_from_file_location("rabbitmq_module", os.path.join(os.path.dirname(__file__), "04_rabbitmq_communication.py"))
rabbitmq_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rabbitmq_module)
BacktestMessageSender = rabbitmq_module.BacktestMessageSender


class CheckpointManager:
    """
    Checkpoint 管理器
    负责保存和恢复回测状态
    """
    
    def __init__(self, checkpoint_dir: str = '../checkpoints', checkpoint_interval: int = 1000):
        """
        初始化 Checkpoint 管理器
        
        Args:
            checkpoint_dir: Checkpoint 保存目录
            checkpoint_interval: Checkpoint 保存间隔（K线数）
        """
        self.checkpoint_dir = checkpoint_dir
        self.checkpoint_interval = checkpoint_interval
        os.makedirs(checkpoint_dir, exist_ok=True)
        
        self.save_count = 0
        self.save_time_total = 0
    
    def save_checkpoint(self, task_id: str, bar_index: int, state: Dict[str, Any]) -> bool:
        """
        保存 Checkpoint
        
        Args:
            task_id: 任务ID
            bar_index: 当前K线索引
            state: 状态数据
        
        Returns:
            bool: 是否保存成功
        """
        try:
            start_time = time.time()
            
            checkpoint_file = os.path.join(self.checkpoint_dir, f'{task_id}_checkpoint_{bar_index}.pkl')
            
            checkpoint_data = {
                'task_id': task_id,
                'bar_index': bar_index,
                'timestamp': datetime.now().isoformat(),
                'state': state,
            }
            
            with open(checkpoint_file, 'wb') as f:
                pickle.dump(checkpoint_data, f)
            
            elapsed = time.time() - start_time
            self.save_count += 1
            self.save_time_total += elapsed
            
            print(f"  💾 Checkpoint 已保存: bar={bar_index}, 耗时={elapsed*1000:.2f}ms")
            
            return True
            
        except Exception as e:
            print(f"  ❌ Checkpoint 保存失败: {e}")
            return False
    
    def load_latest_checkpoint(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        加载最新的 Checkpoint
        
        Args:
            task_id: 任务ID
        
        Returns:
            Checkpoint 数据，如果不存在则返回 None
        """
        try:
            # 查找所有该任务的 Checkpoint 文件
            checkpoint_files = [
                f for f in os.listdir(self.checkpoint_dir)
                if f.startswith(f'{task_id}_checkpoint_') and f.endswith('.pkl')
            ]
            
            if not checkpoint_files:
                print(f"  ℹ️  未找到 Checkpoint 文件")
                return None
            
            # 按 bar_index 排序，获取最新的
            checkpoint_files.sort(key=lambda x: int(x.split('_')[-1].replace('.pkl', '')), reverse=True)
            latest_file = checkpoint_files[0]
            
            checkpoint_path = os.path.join(self.checkpoint_dir, latest_file)
            
            with open(checkpoint_path, 'rb') as f:
                checkpoint_data = pickle.load(f)
            
            print(f"  ✅ 加载 Checkpoint: bar={checkpoint_data['bar_index']}, 时间={checkpoint_data['timestamp']}")
            
            return checkpoint_data
            
        except Exception as e:
            print(f"  ❌ Checkpoint 加载失败: {e}")
            return None
    
    def clean_checkpoints(self, task_id: str):
        """
        清理 Checkpoint 文件
        
        Args:
            task_id: 任务ID
        """
        try:
            checkpoint_files = [
                f for f in os.listdir(self.checkpoint_dir)
                if f.startswith(f'{task_id}_checkpoint_') and f.endswith('.pkl')
            ]
            
            for f in checkpoint_files:
                os.remove(os.path.join(self.checkpoint_dir, f))
            
            print(f"  🗑️  已清理 {len(checkpoint_files)} 个 Checkpoint 文件")
            
        except Exception as e:
            print(f"  ⚠️  清理 Checkpoint 失败: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """获取 Checkpoint 统计信息"""
        avg_time = (self.save_time_total / self.save_count) if self.save_count > 0 else 0
        return {
            'save_count': self.save_count,
            'total_time_ms': self.save_time_total * 1000,
            'avg_time_ms': avg_time * 1000,
        }


class CheckpointStrategy(bt.Strategy):
    """
    支持断点续跑的策略
    """
    
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
        ('task_id', 'default_task'),
        ('checkpoint_manager', None),
        ('resume_from_bar', 0),  # 从哪个 bar 恢复
        ('printlog', False),
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
        
        # 交易记录
        self.trades = []
        self.current_position_entry = None
        
        # 订单
        self.order = None
        
        # 统计
        self.bar_count = 0
        self.trade_count = 0
        
        # 恢复标志
        self.resuming = self.p.resume_from_bar > 0
        self.resume_complete = False
    
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
                self.log(f'  买入: 价格={order.executed.price:.2f}')
                self.current_position_entry = {
                    'entry_datetime': self.datetime.datetime(),
                    'entry_price': order.executed.price,
                    'entry_size': order.executed.size,
                }
                
            elif order.issell():
                self.log(f'  卖出: 价格={order.executed.price:.2f}')
                
                if self.current_position_entry:
                    pnl = order.executed.price - self.current_position_entry['entry_price']
                    pnl_percent = pnl / self.current_position_entry['entry_price']
                    
                    trade_record = {
                        **self.current_position_entry,
                        'exit_datetime': self.datetime.datetime(),
                        'exit_price': order.executed.price,
                        'exit_size': order.executed.size,
                        'pnl': pnl,
                        'pnl_percent': pnl_percent,
                    }
                    
                    self.trades.append(trade_record)
                    self.trade_count += 1
                    self.current_position_entry = None
        
        self.order = None
    
    def next(self):
        """策略逻辑"""
        self.bar_count += 1
        
        # 标记恢复完成（当达到 resume_from_bar 时）
        if self.resuming and not self.resume_complete and self.bar_count > self.p.resume_from_bar:
            self.resume_complete = True
            print(f"  ✅ 恢复完成，从 bar {self.bar_count} 开始保存新的 Checkpoint")
        
        # 保存 Checkpoint（如果不是在恢复阶段）
        # 在恢复阶段（bar_count <= resume_from_bar）不保存 Checkpoint，避免覆盖
        if self.p.checkpoint_manager and self.bar_count % self.p.checkpoint_manager.checkpoint_interval == 0:
            if not self.resuming or self.bar_count > self.p.resume_from_bar:
                state = self.get_state()
                self.p.checkpoint_manager.save_checkpoint(
                    task_id=self.p.task_id,
                    bar_index=self.bar_count,
                    state=state,
                )
        
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
    
    def get_state(self) -> Dict[str, Any]:
        """获取当前状态"""
        return {
            'bar_count': self.bar_count,
            'trade_count': self.trade_count,
            'trades': self.trades.copy(),
            'current_position_entry': self.current_position_entry.copy() if self.current_position_entry else None,
            'broker_cash': self.broker.getcash(),
            'broker_value': self.broker.getvalue(),
        }
    
    def restore_state(self, state: Dict[str, Any]):
        """恢复状态"""
        self.bar_count = state.get('bar_count', 0)
        self.trade_count = state.get('trade_count', 0)
        self.trades = state.get('trades', []).copy()
        self.current_position_entry = state.get('current_position_entry')
        # 注意：broker 的状态无法直接恢复，需要通过重放交易来恢复


def run_backtest_with_checkpoint(
    task_id: str = 'checkpoint_test_001',
    symbol: str = 'ES',
    start_date: str = '2022-12-15 00:06:15',
    end_date: str = '2022-12-15 23:59:59',
    aggregate_timeframe: str = '1min',
    initial_cash: float = 100000.0,
    checkpoint_interval: int = 30,  # 每 30 根 K 线保存一次（用于测试，实际应该是 1000）
    resume: bool = False,
    simulate_crash_at_bar: Optional[int] = None,  # 模拟在某个 bar 崩溃
    output_dir: str = '../results',
    checkpoint_dir: str = '../checkpoints',
    printlog: bool = False,
) -> Dict[str, Any]:
    """
    运行带 Checkpoint 的回测
    
    Args:
        task_id: 任务ID
        symbol: 品种代码
        start_date: 开始日期
        end_date: 结束日期
        aggregate_timeframe: 聚合时间周期
        initial_cash: 初始资金
        checkpoint_interval: Checkpoint 保存间隔
        resume: 是否从 Checkpoint 恢复
        simulate_crash_at_bar: 模拟崩溃的 bar 索引
        output_dir: 输出目录
        checkpoint_dir: Checkpoint 目录
        printlog: 是否打印日志
    
    Returns:
        回测结果字典
    """
    print("🚀 POC Day 6 - 断点续跑测试")
    print("=" * 60)
    
    # 1. 初始化 Checkpoint 管理器
    checkpoint_manager = CheckpointManager(
        checkpoint_dir=checkpoint_dir,
        checkpoint_interval=checkpoint_interval,
    )
    
    # 2. 如果是恢复模式，加载 Checkpoint
    resume_from_bar = 0
    if resume:
        print("\n📂 尝试加载 Checkpoint...")
        checkpoint_data = checkpoint_manager.load_latest_checkpoint(task_id)
        
        if checkpoint_data:
            resume_from_bar = checkpoint_data['bar_index']
            print(f"  ✅ 将从 bar {resume_from_bar} 恢复")
        else:
            print(f"  ℹ️  未找到 Checkpoint，将从头开始")
    
    # 3. 创建 Cerebro
    cerebro = bt.Cerebro()
    cerebro.broker.setcash(initial_cash)
    cerebro.broker.setcommission(commission=0.001)
    
    # 4. 添加数据源
    print(f"\n📊 加载数据...")
    data = CachedParquetDataFeed(
        symbol=symbol,
        start_date=start_date,
        end_date=end_date,
        aggregate_timeframe=aggregate_timeframe,
    )
    cerebro.adddata(data)
    
    # 5. 添加策略
    cerebro.addstrategy(
        CheckpointStrategy,
        fast_period=10,
        slow_period=20,
        task_id=task_id,
        checkpoint_manager=checkpoint_manager,
        resume_from_bar=resume_from_bar,
        printlog=printlog,
    )
    
    # 6. 运行回测
    print("\n" + "=" * 60)
    if resume:
        print(f"恢复回测... (从 bar {resume_from_bar})")
    else:
        print("开始回测...")
    print("=" * 60)
    
    start_time = time.time()
    
    try:
        strategies = cerebro.run()
        strategy = strategies[0]
        
        # 模拟崩溃
        if simulate_crash_at_bar and strategy.bar_count >= simulate_crash_at_bar:
            raise Exception(f"模拟崩溃: 在 bar {strategy.bar_count} 处中断")
        
    except Exception as e:
        print(f"\n💥 回测中断: {e}")
        print(f"  - 已处理 K 线数: {strategy.bar_count if 'strategy' in locals() else 0}")
        print(f"  - 已完成交易数: {strategy.trade_count if 'strategy' in locals() else 0}")
        return {
            'status': 'crashed',
            'error': str(e),
            'bar_count': strategy.bar_count if 'strategy' in locals() else 0,
        }
    
    elapsed = time.time() - start_time
    
    # 7. 获取结果
    final_value = cerebro.broker.getvalue()
    trades = strategy.trades
    
    # 8. 统计
    print("\n" + "=" * 60)
    print("📊 回测结果")
    print("=" * 60)
    
    print(f"\n💰 资金情况:")
    print(f"  初始资金: ${initial_cash:,.2f}")
    print(f"  最终资金: ${final_value:,.2f}")
    print(f"  盈亏金额: ${final_value - initial_cash:,.2f}")
    
    print(f"\n📈 执行统计:")
    print(f"  处理 K 线数: {strategy.bar_count}")
    print(f"  交易次数: {len(trades)}")
    print(f"  执行时间: {elapsed:.2f} 秒")
    
    # 9. Checkpoint 统计
    checkpoint_stats = checkpoint_manager.get_stats()
    print(f"\n💾 Checkpoint 统计:")
    print(f"  保存次数: {checkpoint_stats['save_count']}")
    print(f"  总耗时: {checkpoint_stats['total_time_ms']:.2f} ms")
    print(f"  平均耗时: {checkpoint_stats['avg_time_ms']:.2f} ms")
    
    if checkpoint_stats['save_count'] > 0:
        checkpoint_overhead = (checkpoint_stats['total_time_ms'] / 1000) / elapsed * 100
        print(f"  性能开销: {checkpoint_overhead:.2f}%")
    
    # 10. 保存结果
    os.makedirs(output_dir, exist_ok=True)
    
    result = {
        'status': 'completed',
        'task_id': task_id,
        'execution': {
            'bar_count': strategy.bar_count,
            'trade_count': len(trades),
            'elapsed_seconds': elapsed,
            'resumed_from_bar': resume_from_bar,
        },
        'checkpoint': checkpoint_stats,
        'final_value': final_value,
        'timestamp': datetime.now().isoformat(),
    }
    
    result_file = os.path.join(output_dir, f'{task_id}_result.json')
    with open(result_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\n  ✅ 结果已保存: {result_file}")
    
    print("\n✅ 回测执行成功！")
    
    return result


def test_checkpoint_resume():
    """测试断点续跑功能"""
    print("🧪 测试断点续跑功能")
    print("=" * 60)
    
    task_id = 'checkpoint_test_001'
    checkpoint_dir = '../checkpoints'
    
    # 清理之前的 Checkpoint
    checkpoint_manager = CheckpointManager(checkpoint_dir=checkpoint_dir)
    checkpoint_manager.clean_checkpoints(task_id)
    
    # 1. 第一次运行：模拟在 bar 60 崩溃
    print("\n" + "=" * 60)
    print("第 1 次运行：模拟崩溃")
    print("=" * 60)
    
    result1 = run_backtest_with_checkpoint(
        task_id=task_id,
        checkpoint_interval=30,
        simulate_crash_at_bar=60,
        resume=False,
        printlog=False,
    )
    
    if result1['status'] != 'crashed':
        print("❌ 测试失败：未能模拟崩溃")
        return False
    
    print(f"\n✅ 第 1 次运行在 bar {result1['bar_count']} 崩溃")
    
    # 2. 第二次运行：从 Checkpoint 恢复
    print("\n" + "=" * 60)
    print("第 2 次运行：从 Checkpoint 恢复")
    print("=" * 60)
    
    result2 = run_backtest_with_checkpoint(
        task_id=task_id,
        checkpoint_interval=30,
        resume=True,
        printlog=False,
    )
    
    if result2['status'] != 'completed':
        print("❌ 测试失败：恢复后未能完成")
        return False
    
    print(f"\n✅ 第 2 次运行成功完成，处理了 {result2['execution']['bar_count']} 根 K 线")
    
    # 3. 第三次运行：完整运行（用于对比）
    print("\n" + "=" * 60)
    print("第 3 次运行：完整运行（对比基准）")
    print("=" * 60)
    
    # 清理 Checkpoint
    checkpoint_manager.clean_checkpoints(task_id)
    
    result3 = run_backtest_with_checkpoint(
        task_id=f'{task_id}_baseline',
        checkpoint_interval=30,
        resume=False,
        printlog=False,
    )
    
    # 4. 对比结果
    print("\n" + "=" * 60)
    print("📊 结果对比")
    print("=" * 60)
    
    print(f"\n恢复运行:")
    print(f"  K 线数: {result2['execution']['bar_count']}")
    print(f"  交易数: {result2['execution']['trade_count']}")
    print(f"  最终资金: ${result2['final_value']:,.2f}")
    
    print(f"\n完整运行:")
    print(f"  K 线数: {result3['execution']['bar_count']}")
    print(f"  交易数: {result3['execution']['trade_count']}")
    print(f"  最终资金: ${result3['final_value']:,.2f}")
    
    # 5. 验证
    print("\n" + "=" * 60)
    print("✅ 验证结果")
    print("=" * 60)
    
    success = True
    
    # 验证 K 线数
    if result2['execution']['bar_count'] == result3['execution']['bar_count']:
        print(f"✅ K 线数一致: {result2['execution']['bar_count']}")
    else:
        print(f"❌ K 线数不一致: {result2['execution']['bar_count']} vs {result3['execution']['bar_count']}")
        success = False
    
    # 验证交易数
    if result2['execution']['trade_count'] == result3['execution']['trade_count']:
        print(f"✅ 交易数一致: {result2['execution']['trade_count']}")
    else:
        print(f"❌ 交易数不一致: {result2['execution']['trade_count']} vs {result3['execution']['trade_count']}")
        success = False
    
    # 验证最终资金（允许小数点误差）
    if abs(result2['final_value'] - result3['final_value']) < 0.01:
        print(f"✅ 最终资金一致: ${result2['final_value']:,.2f}")
    else:
        print(f"❌ 最终资金不一致: ${result2['final_value']:,.2f} vs ${result3['final_value']:,.2f}")
        success = False
    
    # 验证 Checkpoint 开销
    if result2['checkpoint']['save_count'] > 0:
        checkpoint_overhead = (result2['checkpoint']['total_time_ms'] / 1000) / result2['execution']['elapsed_seconds'] * 100
        if checkpoint_overhead < 5.0:
            print(f"✅ Checkpoint 开销在可接受范围内: {checkpoint_overhead:.2f}% < 5%")
        else:
            print(f"⚠️  Checkpoint 开销较高: {checkpoint_overhead:.2f}% >= 5%")
    
    # 清理
    checkpoint_manager.clean_checkpoints(task_id)
    checkpoint_manager.clean_checkpoints(f'{task_id}_baseline')
    
    print(f"\n{'✅ 断点续跑测试通过！' if success else '❌ 断点续跑测试失败！'}")
    
    return success


if __name__ == "__main__":
    success = test_checkpoint_resume()
    exit(0 if success else 1)

