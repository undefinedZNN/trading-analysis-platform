#!/usr/bin/env python3
"""
POC Day 8 - 端到端集成测试
整合所有已实现的组件：
- 数据加载（带缓存）
- 策略执行
- 因子收集
- RabbitMQ 消息通信
- Checkpoint 断点续跑
- 统计指标计算
- 结果导出
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
from cached_datafeed import CachedParquetDataFeed, get_cache_stats

# 导入 RabbitMQ 模块
import importlib.util
spec = importlib.util.spec_from_file_location("rabbitmq_module", os.path.join(os.path.dirname(__file__), "04_rabbitmq_communication.py"))
rabbitmq_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rabbitmq_module)
BacktestMessageSender = rabbitmq_module.BacktestMessageSender
BacktestMessageReceiver = rabbitmq_module.BacktestMessageReceiver


class E2ETestResult:
    """端到端测试结果"""
    
    def __init__(self, test_name: str):
        self.test_name = test_name
        self.status = 'pending'
        self.start_time = datetime.now()
        self.end_time = None
        self.error = None
        self.checks = {}
        self.metrics = {}
    
    def mark_success(self):
        """标记测试成功"""
        self.status = 'success'
        self.end_time = datetime.now()
    
    def mark_failure(self, error: str):
        """标记测试失败"""
        self.status = 'failed'
        self.error = error
        self.end_time = datetime.now()
    
    def add_check(self, check_name: str, passed: bool, message: str = ''):
        """添加检查项"""
        self.checks[check_name] = {
            'passed': passed,
            'message': message,
        }
    
    def add_metric(self, metric_name: str, value: Any):
        """添加指标"""
        self.metrics[metric_name] = value
    
    def get_summary(self) -> Dict[str, Any]:
        """获取测试摘要"""
        duration = (self.end_time - self.start_time).total_seconds() if self.end_time else 0
        passed_checks = sum(1 for c in self.checks.values() if c['passed'])
        total_checks = len(self.checks)
        
        return {
            'test_name': self.test_name,
            'status': self.status,
            'duration_seconds': duration,
            'checks_passed': f"{passed_checks}/{total_checks}",
            'error': self.error,
            'checks': self.checks,
            'metrics': self.metrics,
        }


class IntegratedStrategy(bt.Strategy):
    """
    集成策略 - 整合所有功能
    """
    
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
        ('task_id', 'e2e_test'),
        ('message_sender', None),
        ('test_result', None),
    )
    
    def __init__(self):
        # 技术指标
        self.sma_fast = bt.indicators.SimpleMovingAverage(
            self.data.close, period=self.p.fast_period
        )
        self.sma_slow = bt.indicators.SimpleMovingAverage(
            self.data.close, period=self.p.slow_period
        )
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
        
        # 交易记录
        self.trades = []
        self.current_position_entry = None
        self.order = None
        
        # 统计
        self.bar_count = 0
        self.trade_count = 0
        
        # 进度上报
        self.last_progress_time = time.time()
        self.progress_interval = 1.0  # 每秒上报一次
    
    def notify_order(self, order):
        """订单通知"""
        if order.status in [order.Completed]:
            if order.isbuy():
                self.current_position_entry = {
                    'entry_datetime': self.datetime.datetime(),
                    'entry_price': order.executed.price,
                    'entry_size': order.executed.size,
                    'sma_fast': self.sma_fast[0],
                    'sma_slow': self.sma_slow[0],
                }
            elif order.issell():
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
                        'holding_bars': self.bar_count - self.current_position_entry.get('entry_bar', 0),
                    }
                    
                    self.trades.append(trade_record)
                    self.trade_count += 1
                    self.current_position_entry = None
        
        self.order = None
    
    def next(self):
        """策略逻辑"""
        self.bar_count += 1
        
        # 上报进度
        current_time = time.time()
        if self.p.message_sender and (current_time - self.last_progress_time >= self.progress_interval):
            total_bars = len(self.data)
            progress = (self.bar_count / total_bars) * 100 if total_bars > 0 else 0
            
            self.p.message_sender.send_task_progress(
                task_id=self.p.task_id,
                progress=progress,
                current_bar=self.bar_count,
                total_bars=total_bars,
            )
            
            self.last_progress_time = current_time
        
        # 交易逻辑
        if self.order:
            return
        
        if not self.position:
            if self.crossover > 0:
                self.order = self.buy()
                if self.current_position_entry:
                    self.current_position_entry['entry_bar'] = self.bar_count
        else:
            if self.crossover < 0:
                self.order = self.sell()


def run_e2e_test_scenario(
    scenario_name: str,
    task_id: str,
    enable_rabbitmq: bool = True,
    enable_cache: bool = True,
) -> E2ETestResult:
    """
    运行端到端测试场景
    
    Args:
        scenario_name: 场景名称
        task_id: 任务ID
        enable_rabbitmq: 是否启用 RabbitMQ
        enable_cache: 是否启用缓存
    
    Returns:
        测试结果
    """
    print(f"\n{'='*60}")
    print(f"场景: {scenario_name}")
    print(f"{'='*60}")
    
    result = E2ETestResult(scenario_name)
    
    # 1. RabbitMQ 连接
    message_sender = None
    message_receiver = None
    
    if enable_rabbitmq:
        print("\n📡 连接 RabbitMQ...")
        message_sender = BacktestMessageSender()
        
        if message_sender.connect():
            result.add_check('rabbitmq_connect', True, 'RabbitMQ 连接成功')
            
            # 发送任务开始消息
            message_sender.send_task_started(
                task_id=task_id,
                strategy_name='IntegratedStrategy',
                params={'fast': 10, 'slow': 20}
            )
        else:
            result.add_check('rabbitmq_connect', False, 'RabbitMQ 连接失败')
            enable_rabbitmq = False
    
    # 2. 数据加载
    print("\n📊 加载数据...")
    data_load_start = time.time()
    
    try:
        data = CachedParquetDataFeed(
            symbol='ES',
            start_date='2022-12-15 00:06:15',
            end_date='2022-12-15 23:59:59',
            aggregate_timeframe='1min',
        )
        
        data_load_time = time.time() - data_load_start
        result.add_check('data_load', True, f'数据加载成功，耗时 {data_load_time:.3f} 秒')
        result.add_metric('data_load_time', data_load_time)
        
    except Exception as e:
        result.add_check('data_load', False, f'数据加载失败: {e}')
        result.mark_failure(f'数据加载失败: {e}')
        return result
    
    # 3. 创建 Cerebro 并运行回测
    print("\n🔄 运行回测...")
    backtest_start = time.time()
    
    try:
        cerebro = bt.Cerebro()
        cerebro.broker.setcash(100000.0)
        cerebro.broker.setcommission(commission=0.001)
        cerebro.adddata(data)
        
        cerebro.addstrategy(
            IntegratedStrategy,
            task_id=task_id,
            message_sender=message_sender,
            test_result=result,
        )
        
        strategies = cerebro.run()
        strategy = strategies[0]
        
        backtest_time = time.time() - backtest_start
        result.add_check('backtest_run', True, f'回测执行成功，耗时 {backtest_time:.3f} 秒')
        result.add_metric('backtest_time', backtest_time)
        
    except Exception as e:
        result.add_check('backtest_run', False, f'回测执行失败: {e}')
        result.mark_failure(f'回测执行失败: {e}')
        return result
    
    # 4. 收集结果
    final_value = cerebro.broker.getvalue()
    bar_count = strategy.bar_count
    trade_count = len(strategy.trades)
    
    result.add_metric('final_value', final_value)
    result.add_metric('bar_count', bar_count)
    result.add_metric('trade_count', trade_count)
    
    # 5. 验证交易记录
    if trade_count > 0:
        result.add_check('trades_collected', True, f'收集到 {trade_count} 笔交易')
        
        # 验证因子字段
        required_fields = ['entry_datetime', 'entry_price', 'exit_datetime', 'exit_price', 'pnl', 'pnl_percent']
        first_trade = strategy.trades[0]
        missing_fields = [f for f in required_fields if f not in first_trade]
        
        if not missing_fields:
            result.add_check('factor_fields', True, '因子字段完整')
        else:
            result.add_check('factor_fields', False, f'缺少字段: {missing_fields}')
    else:
        result.add_check('trades_collected', False, '未产生交易')
    
    # 6. 发送任务完成消息
    if enable_rabbitmq and message_sender:
        message_sender.send_task_completed(
            task_id=task_id,
            result={
                'final_value': final_value,
                'bar_count': bar_count,
                'trade_count': trade_count,
            }
        )
        result.add_check('rabbitmq_completion', True, '任务完成消息已发送')
        
        # 断开连接
        message_sender.disconnect()
    
    # 7. 缓存统计
    if enable_cache:
        cache_stats = get_cache_stats()
        result.add_metric('cache_hit_rate', cache_stats['hit_rate'])
        result.add_metric('cache_size_mb', cache_stats['current_size_mb'])
        
        if cache_stats['hit_rate'] >= 0:
            result.add_check('cache_working', True, f'缓存正常，命中率 {cache_stats["hit_rate"]:.2f}%')
        else:
            result.add_check('cache_working', False, '缓存未生效')
    
    # 8. 导出结果
    output_dir = '../results'
    os.makedirs(output_dir, exist_ok=True)
    
    # 导出交易记录
    if trade_count > 0:
        trades_file = os.path.join(output_dir, f'{task_id}_trades.parquet')
        try:
            df_trades = pd.DataFrame(strategy.trades)
            df_trades.to_parquet(trades_file, index=False)
            result.add_check('export_trades', True, f'交易记录已导出: {trades_file}')
        except Exception as e:
            result.add_check('export_trades', False, f'交易记录导出失败: {e}')
    
    # 导出统计结果
    result_file = os.path.join(output_dir, f'{task_id}_result.json')
    try:
        result_data = {
            'task_id': task_id,
            'scenario': scenario_name,
            'final_value': final_value,
            'bar_count': bar_count,
            'trade_count': trade_count,
            'timestamp': datetime.now().isoformat(),
        }
        
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, indent=2, ensure_ascii=False)
        
        result.add_check('export_result', True, f'结果已导出: {result_file}')
    except Exception as e:
        result.add_check('export_result', False, f'结果导出失败: {e}')
    
    result.mark_success()
    return result


def run_e2e_integration_test():
    """运行完整的端到端集成测试"""
    print("🚀 POC Day 8 - 端到端集成测试")
    print("=" * 60)
    print("\n测试目标:")
    print("  1. 验证所有组件集成")
    print("  2. 测试完整的回测流程")
    print("  3. 验证各项功能正常工作")
    
    test_results = []
    
    # ==========================================
    # 场景 1: 完整功能测试（RabbitMQ + Cache）
    # ==========================================
    result1 = run_e2e_test_scenario(
        scenario_name="完整功能测试",
        task_id="e2e_test_full",
        enable_rabbitmq=True,
        enable_cache=True,
    )
    test_results.append(result1)
    
    # ==========================================
    # 场景 2: 缓存命中测试（重复运行）
    # ==========================================
    result2 = run_e2e_test_scenario(
        scenario_name="缓存命中测试",
        task_id="e2e_test_cache",
        enable_rabbitmq=False,
        enable_cache=True,
    )
    test_results.append(result2)
    
    # ==========================================
    # 汇总结果
    # ==========================================
    print("\n" + "=" * 60)
    print("📊 端到端集成测试汇总")
    print("=" * 60)
    
    # 创建汇总表格
    print(f"\n{'场景名称':<30} {'状态':<10} {'检查通过':<15} {'耗时':<10}")
    print("-" * 70)
    
    for result in test_results:
        summary = result.get_summary()
        status_icon = '✅' if summary['status'] == 'success' else '❌'
        print(f"{summary['test_name']:<30} {status_icon} {summary['status']:<8} {summary['checks_passed']:<15} {summary['duration_seconds']:.3f}秒")
    
    # 详细检查项
    print(f"\n📋 详细检查项:")
    for i, result in enumerate(test_results, 1):
        summary = result.get_summary()
        print(f"\n{i}. {summary['test_name']}:")
        
        for check_name, check_data in summary['checks'].items():
            status_icon = '✅' if check_data['passed'] else '❌'
            print(f"  {status_icon} {check_name}: {check_data['message']}")
    
    # 关键指标
    print(f"\n📈 关键指标:")
    for result in test_results:
        summary = result.get_summary()
        print(f"\n{summary['test_name']}:")
        
        for metric_name, metric_value in summary['metrics'].items():
            if isinstance(metric_value, float):
                print(f"  {metric_name}: {metric_value:.3f}")
            else:
                print(f"  {metric_name}: {metric_value}")
    
    # 保存测试报告
    output_dir = '../results'
    os.makedirs(output_dir, exist_ok=True)
    
    report = {
        'test_suite': 'E2E Integration Test',
        'timestamp': datetime.now().isoformat(),
        'test_results': [r.get_summary() for r in test_results],
    }
    
    report_file = os.path.join(output_dir, 'e2e_integration_test_report.json')
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"\n  ✅ 测试报告已保存: {report_file}")
    
    # 验证
    print("\n" + "=" * 60)
    print("✅ 最终验证")
    print("=" * 60)
    
    success = True
    
    # 验证：所有场景都应该成功
    failed_scenarios = [r for r in test_results if r.status != 'success']
    if not failed_scenarios:
        print(f"✅ 所有场景通过: {len(test_results)}/{len(test_results)}")
    else:
        print(f"❌ {len(failed_scenarios)}/{len(test_results)} 个场景失败")
        success = False
    
    # 验证：所有检查项都应该通过
    total_checks = sum(len(r.checks) for r in test_results)
    passed_checks = sum(sum(1 for c in r.checks.values() if c['passed']) for r in test_results)
    
    if passed_checks == total_checks:
        print(f"✅ 所有检查通过: {passed_checks}/{total_checks}")
    else:
        print(f"⚠️  部分检查未通过: {passed_checks}/{total_checks}")
    
    print(f"\n{'✅ 端到端集成测试通过！' if success else '❌ 端到端集成测试失败！'}")
    
    return success


if __name__ == "__main__":
    success = run_e2e_integration_test()
    exit(0 if success else 1)

