#!/usr/bin/env python3
"""
大规模数据测试 - 验证Worker在大数据集上的性能和正确性
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta

# 添加项目路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from test_worker_standalone import MockRabbitMQClient, BacktestExecutor

def test_large_scale():
    """大规模数据测试"""
    
    print("╔══════════════════════════════════════════════════════════════════════╗")
    print("║                                                                      ║")
    print("║          大规模数据测试                                               ║")
    print("║          (测试Worker在大数据集上的性能)                               ║")
    print("║                                                                      ║")
    print("╚══════════════════════════════════════════════════════════════════════╝")
    print()
    
    # 测试场景
    test_scenarios = [
        {
            'name': '3天测试 (小规模)',
            'start_date': '2022-12-15T00:00:00Z',
            'end_date': '2022-12-18T00:00:00Z',
            'expected_bars': 276 * 3,  # 约828条
        },
        {
            'name': '7天测试 (中规模)',
            'start_date': '2022-12-15T00:00:00Z',
            'end_date': '2022-12-22T00:00:00Z',
            'expected_bars': 276 * 7,  # 约1932条
        },
        {
            'name': '30天测试 (大规模)',
            'start_date': '2022-12-01T00:00:00Z',
            'end_date': '2022-12-31T00:00:00Z',
            'expected_bars': 276 * 30,  # 约8280条
        }
    ]
    
    results = []
    
    for i, scenario in enumerate(test_scenarios, 1):
        print("=" * 80)
        print(f"  测试场景 {i}/{len(test_scenarios)}: {scenario['name']}")
        print("=" * 80)
        print()
        
        task_id = f"test-largescale-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        worker_id = "test-worker-01"
        
        task_message = {
            'taskId': task_id,
            'strategyId': 'test-strategy-001',
            'scriptVersionId': 'test-version-001',
            'dataConfig': {
                'datasetPath': 'ES-23/ES/5m/agg_5m_from_1s.parquet',
                'startDate': scenario['start_date'],
                'endDate': scenario['end_date'],
                'timeframe': '5m'
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
        
        print(f"时间范围: {scenario['start_date']} 到 {scenario['end_date']}")
        print(f"预期数据量: 约{scenario['expected_bars']}条")
        print()
        
        # 创建执行器
        mock_rabbitmq = MockRabbitMQClient()
        executor = BacktestExecutor(
            rabbitmq_client=mock_rabbitmq,
            worker_id=worker_id,
            backend_url=None
        )
        
        # 执行回测
        import time
        start_time = time.time()
        
        try:
            result = executor.execute_backtest(task_message)
            execution_time = time.time() - start_time
            
            # 收集结果
            scenario_result = {
                'name': scenario['name'],
                'status': 'success',
                'execution_time': execution_time,
                'processed_bars': result.get('processedBars', 0),
                'total_trades': result.get('totalTrades', 0),
                'final_capital': result.get('finalCapital', 0),
                'total_return': result.get('totalReturn', 0),
            }
            
            print()
            print("✅ 测试完成")
            print(f"  • 执行时间: {execution_time:.2f}秒")
            print(f"  • 处理Bar数: {result.get('processedBars', 0)}")
            print(f"  • 交易数: {result.get('totalTrades', 0)}")
            print(f"  • 最终资金: ${result.get('finalCapital', 0):,.2f}")
            print(f"  • 收益率: {result.get('totalReturn', 0):.2f}%")
            print(f"  • 处理速度: {result.get('processedBars', 0)/execution_time:.0f} bars/秒")
            print()
            
        except Exception as e:
            print()
            print(f"❌ 测试失败: {e}")
            print()
            import traceback
            traceback.print_exc()
            
            scenario_result = {
                'name': scenario['name'],
                'status': 'failed',
                'error': str(e),
                'execution_time': time.time() - start_time,
            }
        
        results.append(scenario_result)
    
    # 打印总结
    print()
    print("=" * 80)
    print("  测试总结")
    print("=" * 80)
    print()
    
    print(f"{'场景':<20} {'状态':<10} {'耗时':<10} {'Bars':<10} {'交易':<8} {'收益率':<10}")
    print("-" * 80)
    
    for r in results:
        if r['status'] == 'success':
            print(f"{r['name']:<20} "
                  f"{'✅':<10} "
                  f"{r['execution_time']:.2f}s{'':<5} "
                  f"{r['processed_bars']:<10} "
                  f"{r['total_trades']:<8} "
                  f"{r['total_return']:.2f}%")
        else:
            print(f"{r['name']:<20} {'❌':<10} {r['execution_time']:.2f}s{'':<5} {'N/A':<10} {'N/A':<8} {'N/A':<10}")
    
    print()
    print("=" * 80)
    
    # 成功率
    success_count = sum(1 for r in results if r['status'] == 'success')
    print(f"\n✅ 成功: {success_count}/{len(results)}")
    
    if success_count > 0:
        avg_time = sum(r['execution_time'] for r in results if r['status'] == 'success') / success_count
        total_bars = sum(r.get('processed_bars', 0) for r in results if r['status'] == 'success')
        total_trades = sum(r.get('total_trades', 0) for r in results if r['status'] == 'success')
        
        print(f"📊 平均执行时间: {avg_time:.2f}秒")
        print(f"📊 总处理Bars: {total_bars:,}")
        print(f"📊 总交易数: {total_trades}")
    
    print()
    print("=" * 80)
    
    return results


if __name__ == '__main__':
    results = test_large_scale()
    
    # 判断是否全部成功
    all_success = all(r['status'] == 'success' for r in results)
    
    if all_success:
        print("\n🎉 所有测试场景通过！Worker在大规模数据上工作正常。\n")
        sys.exit(0)
    else:
        print("\n⚠️  部分测试场景失败，请检查错误信息。\n")
        sys.exit(1)

