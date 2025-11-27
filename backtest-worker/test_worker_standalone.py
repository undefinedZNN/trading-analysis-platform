#!/usr/bin/env python3
"""
独立测试Worker回测功能
不依赖RabbitMQ，直接调用BacktestExecutor
"""

import sys
import os
from pathlib import Path
from datetime import datetime, timezone

# 添加项目路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from src.backtrader_integration.execution.backtest_executor import BacktestExecutor

class MockRabbitMQClient:
    """Mock RabbitMQ client for standalone testing"""
    
    def __init__(self):
        self.messages = []
    
    def send_message(self, routing_key, message):
        """记录消息但不实际发送"""
        self.messages.append({
            'routing_key': routing_key,
            'message': message
        })
        print(f"  [MockMQ] {routing_key}: {message.get('status', message.get('progress', 'message'))}")
    
    def send_status(self, task_id, worker_id, status, message=None, details=None):
        """Mock发送状态"""
        print(f"  [MockMQ] Status: {status}")
    
    def send_progress(self, task_id, worker_id, progress, message=None, **kwargs):
        """Mock发送进度"""
        if int(progress) % 10 == 0:  # 只打印每10%
            print(f"  [MockMQ] Progress: {progress:.1f}%")
    
    def send_result(self, task_id, status, result):
        """Mock发送结果"""
        print(f"  [MockMQ] Result: status={status}, trades={result.get('total_trades', 0)}")
        return True
    
    def send_error(self, task_id, error_code, error_message, stack_trace=None):
        """Mock发送错误"""
        print(f"  [MockMQ] Error: {error_code} - {error_message}")
        return True

def test_backtest_standalone():
    """独立测试回测功能"""
    
    print("=" * 80)
    print("  独立测试Worker回测功能")
    print("=" * 80)
    print()
    
    # 测试配置
    task_id = f"test-standalone-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    worker_id = "test-worker-01"
    
    # 使用5分钟数据进行测试
    dataset_path = "ES-23/ES/5m/agg_5m_from_1s.parquet"
    
    task_message = {
        'taskId': task_id,
        'strategyId': 'test-strategy-001',
        'scriptVersionId': 'test-version-001',
        'dataConfig': {
            'datasetPath': dataset_path,
            'startDate': '2022-12-15T00:00:00Z',
            'endDate': '2022-12-16T00:00:00Z',  # 1天数据
            'timeframe': '5m'  # 5分钟周期
        },
        'strategyParameters': {
            'fast': 10,
            'slow': 20,
            'initial_cash': 100000
        },
        'executionConfig': {
            'initialCapital': 100000,
            'leverage': 1,
            'slippage': 0,
            'fees': {
                'makerFee': 0.0002,
                'takerFee': 0.0005
            }
        }
    }
    
    print(f"任务ID: {task_id}")
    print(f"数据集: {dataset_path}")
    print(f"时间范围: {task_message['dataConfig']['startDate']} 到 {task_message['dataConfig']['endDate']}")
    print(f"策略参数: fast={task_message['strategyParameters']['fast']}, slow={task_message['strategyParameters']['slow']}")
    print()
    
    # 创建执行器（使用Mock RabbitMQ client）
    print("=" * 80)
    print("  初始化BacktestExecutor")
    print("=" * 80)
    print()
    
    mock_rabbitmq = MockRabbitMQClient()
    
    executor = BacktestExecutor(
        rabbitmq_client=mock_rabbitmq,  # 使用Mock
        worker_id=worker_id,
        backend_url=None
    )
    
    # 执行回测
    print("=" * 80)
    print("  开始执行回测")
    print("=" * 80)
    print()
    
    try:
        result = executor.execute_backtest(task_message)
        
        print()
        print("=" * 80)
        print("  回测完成")
        print("=" * 80)
        print()
        
        # 显示结果
        print("📊 回测结果:")
        print(f"  • 初始资金: ${result.get('initial_cash', 'N/A')}")
        print(f"  • 最终资金: ${result.get('final_cash', 'N/A')}")
        print(f"  • 总收益: ${result.get('total_profit', 'N/A')}")
        print(f"  • 收益率: {result.get('total_return', 'N/A')}%")
        print(f"  • 总交易数: {result.get('total_trades', 0)}")
        print(f"  • 处理Bar数: {result.get('total_bars', 'N/A')}")
        print()
        
        print("📋 原始结果数据:")
        for key, value in sorted(result.items()):
            print(f"  • {key}: {value}")
        print()
        
        # 检查文件
        print("=" * 80)
        print("  检查生成的文件")
        print("=" * 80)
        print()
        
        result_dir = project_root / 'backend' / 'storage' / 'backtest-results' / task_id
        
        if result_dir.exists():
            print(f"✅ 结果目录存在: {result_dir}")
            print()
            
            # 检查各个文件
            files_to_check = [
                ('trades.parquet', '交易记录'),
                ('equity.parquet', '权益曲线'),
                ('summary.json', '摘要信息')
            ]
            
            for filename, desc in files_to_check:
                file_path = result_dir / filename
                if file_path.exists():
                    file_size = file_path.stat().st_size
                    print(f"✅ {desc} ({filename}): {file_size:,} bytes")
                    
                    # 如果是trades.parquet，读取并显示记录数
                    if filename == 'trades.parquet':
                        try:
                            import pandas as pd
                            trades_df = pd.read_parquet(file_path)
                            print(f"   → 包含 {len(trades_df)} 条交易记录")
                            
                            if len(trades_df) > 0:
                                print()
                                print("   前5条交易记录:")
                                print(trades_df.head().to_string(index=False))
                            else:
                                print("   ⚠️  警告: 交易记录为空！")
                        except Exception as e:
                            print(f"   ❌ 读取失败: {e}")
                else:
                    print(f"❌ {desc} ({filename}): 文件不存在")
                print()
        else:
            print(f"❌ 结果目录不存在: {result_dir}")
            print()
        
        # 返回结果
        return result
        
    except Exception as e:
        print()
        print("=" * 80)
        print("  ❌ 回测执行失败")
        print("=" * 80)
        print()
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == '__main__':
    print()
    print("╔══════════════════════════════════════════════════════════════════════╗")
    print("║                                                                      ║")
    print("║          Worker独立功能测试                                           ║")
    print("║          (不依赖RabbitMQ，直接测试核心回测功能)                        ║")
    print("║                                                                      ║")
    print("╚══════════════════════════════════════════════════════════════════════╝")
    print()
    
    result = test_backtest_standalone()
    
    print()
    print("=" * 80)
    print("  测试总结")
    print("=" * 80)
    print()
    
    if result:
        if result['total_trades'] > 0:
            print("✅ 测试成功！")
            print(f"   • 生成了 {result['total_trades']} 笔交易")
            print(f"   • 收益率: {result['total_return']:.2f}%")
            print()
            print("结论: Worker核心功能正常！")
        else:
            print("⚠️  测试完成，但没有交易")
            print("   这可能是:")
            print("   1. 数据时间范围内没有符合条件的交易信号")
            print("   2. 策略参数需要调整")
            print("   3. 策略逻辑有问题")
            print()
            print("建议: 检查策略逻辑或调整时间范围")
    else:
        print("❌ 测试失败")
        print("   请检查上面的错误信息")
    
    print()
    print("=" * 80)

