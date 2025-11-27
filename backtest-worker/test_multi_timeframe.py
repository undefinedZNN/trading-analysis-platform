"""
测试多周期回测功能

使用小数据集（5分钟数据）测试多周期实现
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

import json
from backtrader_integration.messaging import RabbitMQClient
from backtrader_integration.execution import BacktestExecutor

# 模拟RabbitMQ客户端（用于测试）
class MockRabbitMQClient:
    def send_progress(self, task_id, progress, message, details=None):
        print(f"[Progress] {progress:.1f}% - {message}")
        if details:
            print(f"           Details: {details}")
    
    def send_message(self, routing_key, message):
        print(f"[Message] {routing_key}: {message.get('status', 'N/A')}")
    
    def send_result(self, task_id, **kwargs):
        print(f"[Result] Task {task_id} completed")
        print(f"         Final Value: ${kwargs.get('final_value', 0):,.2f}")
        print(f"         PnL: ${kwargs.get('total_pnl', 0):,.2f}")
    
    def send_error(self, task_id, error_message, error_type='ExecutionError'):
        print(f"[Error] {error_type}: {error_message}")


def test_multi_timeframe():
    """测试多周期回测"""
    
    print("=" * 80)
    print("多周期回测测试")
    print("=" * 80)
    
    # 创建executor
    mock_client = MockRabbitMQClient()
    executor = BacktestExecutor(
        rabbitmq_client=mock_client,
        worker_id="test-worker-001"
    )
    
    # 创建测试任务（使用5分钟数据）
    task_message = {
        'taskId': 'test-task-001',
        'strategyId': 'test-strategy',
        'scriptVersionId': 'test-version',
        'dataConfig': {
            'datasetPath': 'ES-23/ES/5m/agg_5m_from_1s.parquet',  # 使用5分钟聚合数据
            'timeframe': '5m',  # 策略周期：5分钟
            'symbol': 'ES',
            'exchange': 'CME',
        },
        'executionConfig': {
            'initialCapital': 100000,
            'commission': 0.001,
        },
        'strategyParameters': {
            'fast': 10,
            'slow': 20,
        }
    }
    
    print("\n📋 任务配置:")
    print(f"   数据路径: {task_message['dataConfig']['datasetPath']}")
    print(f"   策略周期: {task_message['dataConfig']['timeframe']}")
    print(f"   初始资金: ${task_message['executionConfig']['initialCapital']:,.2f}")
    print(f"   策略参数: fast={task_message['strategyParameters']['fast']}, slow={task_message['strategyParameters']['slow']}")
    
    print("\n🚀 开始执行回测...\n")
    
    try:
        result = executor.execute_backtest(task_message)
        
        print("\n" + "=" * 80)
        print("✅ 回测完成！")
        print("=" * 80)
        print(f"最终资金: ${result.get('final_value', 0):,.2f}")
        print(f"总盈亏:   ${result.get('total_pnl', 0):,.2f}")
        print(f"收益率:   {result.get('total_return', 0):.2f}%")
        print(f"交易次数: {result.get('total_trades', 0)}")
        print(f"执行时间: {result.get('execution_time', 0):.2f}秒")
        print("=" * 80)
        
        # 检查结果文件
        print("\n📁 检查结果文件...")
        result_dir = f"/Volumes/CODE/trading-analysis-platform/backend/storage/backtest-results/backtests/{task_message['taskId']}"
        
        equity_file = f"{result_dir}/equity.parquet"
        trades_file = f"{result_dir}/trades.parquet"
        
        if os.path.exists(equity_file):
            size_mb = os.path.getsize(equity_file) / 1024 / 1024
            print(f"   ✅ equity.parquet: {size_mb:.2f} MB")
        else:
            print(f"   ❌ equity.parquet: 未找到")
        
        if os.path.exists(trades_file):
            size_mb = os.path.getsize(trades_file) / 1024 / 1024
            print(f"   ✅ trades.parquet: {size_mb:.2f} MB")
        else:
            print(f"   ❌ trades.parquet: 未找到")
        
        return True
        
    except Exception as e:
        print("\n" + "=" * 80)
        print("❌ 回测失败！")
        print("=" * 80)
        print(f"错误: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    print("\n🧪 多周期回测功能测试\n")
    
    # 说明
    print("📖 测试说明:")
    print("   - 使用5分钟聚合数据进行测试")
    print("   - 策略信号基于5分钟K线")
    print("   - 成交价格使用真实数据（无Bar内误差）")
    print("   - 预计执行时间: 2-3秒")
    print()
    
    input("按回车键开始测试...")
    
    success = test_multi_timeframe()
    
    if success:
        print("\n✅ 测试成功！多周期功能正常工作。")
    else:
        print("\n❌ 测试失败，请检查错误信息。")

