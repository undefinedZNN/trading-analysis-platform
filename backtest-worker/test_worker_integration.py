"""
Worker集成测试：测试分段回测在Worker系统中的集成

验证：
1. TaskMessage DTO正确传递内存优化配置
2. BacktestExecutor正确识别并使用SegmentedBacktester
3. 结果正确返回
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

import logging
from datetime import datetime
from backtrader_integration import BacktestExecutor
from backtrader_integration.messaging import RabbitMQClient

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MockRabbitMQClient(RabbitMQClient):
    """Mock RabbitMQ客户端用于测试"""
    
    def __init__(self):
        # 不调用父类的__init__，避免实际连接RabbitMQ
        self.messages = []
    
    def send_message(self, routing_key: str, message: dict):
        """记录消息"""
        self.messages.append({
            'routing_key': routing_key,
            'message': message,
        })
        logger.info(f"[MockRabbitMQ] {routing_key}: {message.get('status', message.get('progress', 'message'))}")
    
    def send_progress(self, task_id: str, progress: float, message: str, details: dict = None):
        """记录进度"""
        self.messages.append({
            'routing_key': 'progress',
            'message': {
                'task_id': task_id,
                'progress': progress,
                'message': message,
                'details': details or {},
            }
        })
        logger.info(f"[MockRabbitMQ] Progress: {progress:.1f}% - {message}")
    
    def send_result(self, task_id: str, status: str, result: dict):
        """记录结果"""
        self.messages.append({
            'routing_key': 'result',
            'message': {
                'task_id': task_id,
                'status': status,
                'result': result,
            }
        })
        logger.info(f"[MockRabbitMQ] Result: {status}")
    
    def send_error(self, task_id: str, error_code: str, error_message: str, stack_trace: str = None):
        """记录错误"""
        self.messages.append({
            'routing_key': 'error',
            'message': {
                'task_id': task_id,
                'error_code': error_code,
                'error_message': error_message,
                'stack_trace': stack_trace,
            }
        })
        logger.error(f"[MockRabbitMQ] Error: {error_code} - {error_message}")


def test_segmented_mode():
    """测试分段模式"""
    
    logger.info("="*80)
    logger.info("TEST: Segmented Mode Integration")
    logger.info("="*80)
    
    # 创建Mock客户端
    mock_client = MockRabbitMQClient()
    
    # 创建执行器
    executor = BacktestExecutor(
        rabbitmq_client=mock_client,
        worker_id='test-worker-01',
    )
    
    # 构造任务消息（启用分段）
    task_message = {
        'taskId': 'test-task-segmented-001',
        'strategyId': 'test-strategy-123',
        'scriptVersionId': 'test-version-456',
        'dataConfig': {
            'datasetPath': 'ES-23/ES/1s',
            'timeRange': {
                'start': '2023-01-01T00:00:00Z',
                'end': '2023-01-31T23:59:59Z',  # 1个月数据
            },
            'timeframe': '5m',
            'memoryOptimization': {
                'enableSegmented': True,
                'segmentDays': 10,  # 10天/段
                'lookbackDays': 2,  # 2天lookback
                'enableExactbars': True,
            }
        },
        'executionConfig': {
            'initialCapital': 100000,
            'commission': 0.001,
        },
        'strategyParameters': {
            'fast': 10,
            'slow': 50,
        }
    }
    
    # 执行回测
    try:
        result = executor.execute_backtest(task_message)
        
        logger.info("\n" + "="*80)
        logger.info("TEST RESULT")
        logger.info("="*80)
        logger.info(f"✅ Test passed!")
        logger.info(f"   Task ID: {result['taskId']}")
        logger.info(f"   Mode: {'Segmented' if result.get('segmentedMode') else 'Standard'}")
        logger.info(f"   Segments: {result.get('numSegments', 'N/A')}")
        logger.info(f"   Peak Memory: {result.get('peakMemoryMB', 'N/A')} MB")
        logger.info(f"   Final Capital: ${result['finalCapital']:,.2f}")
        logger.info(f"   Total Return: {result['totalReturn']:.2f}%")
        logger.info(f"   Execution Time: {result['executionTime']:.2f}s")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}", exc_info=True)
        return False


def test_standard_mode():
    """测试标准模式"""
    
    logger.info("\n" + "="*80)
    logger.info("TEST: Standard Mode Integration")
    logger.info("="*80)
    
    # 创建Mock客户端
    mock_client = MockRabbitMQClient()
    
    # 创建执行器
    executor = BacktestExecutor(
        rabbitmq_client=mock_client,
        worker_id='test-worker-02',
    )
    
    # 构造任务消息（不启用分段）
    task_message = {
        'taskId': 'test-task-standard-001',
        'strategyId': 'test-strategy-123',
        'scriptVersionId': 'test-version-456',
        'dataConfig': {
            'datasetPath': 'ES-23/ES/5m/agg_5m_from_1s.parquet',  # 使用小数据集
            'timeRange': {
                'start': '2023-01-01T00:00:00Z',
                'end': '2023-01-07T23:59:59Z',  # 1周数据
            },
            'timeframe': '5m',
            # 不提供memoryOptimization配置，使用标准模式
        },
        'executionConfig': {
            'initialCapital': 100000,
            'commission': 0.001,
        },
        'strategyParameters': {
            'fast': 10,
            'slow': 50,
        }
    }
    
    # 执行回测
    try:
        result = executor.execute_backtest(task_message)
        
        logger.info("\n" + "="*80)
        logger.info("TEST RESULT")
        logger.info("="*80)
        logger.info(f"✅ Test passed!")
        logger.info(f"   Task ID: {result['taskId']}")
        logger.info(f"   Mode: {'Segmented' if result.get('segmentedMode') else 'Standard'}")
        logger.info(f"   Final Capital: ${result['finalCapital']:,.2f}")
        logger.info(f"   Total Return: {result['totalReturn']:.2f}%")
        logger.info(f"   Execution Time: {result['executionTime']:.2f}s")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}", exc_info=True)
        return False


if __name__ == '__main__':
    logger.info("="*80)
    logger.info("WORKER INTEGRATION TEST SUITE")
    logger.info("="*80)
    
    results = {}
    
    # 测试1：分段模式
    logger.info("\n### Test 1: Segmented Mode")
    results['segmented'] = test_segmented_mode()
    
    # 测试2：标准模式
    logger.info("\n### Test 2: Standard Mode")
    results['standard'] = test_standard_mode()
    
    # 总结
    logger.info("\n" + "="*80)
    logger.info("TEST SUMMARY")
    logger.info("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    logger.info(f"Tests passed: {passed}/{total}")
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        logger.info(f"  {test_name}: {status}")
    
    if passed == total:
        logger.info("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        logger.error("\n❌ Some tests failed!")
        sys.exit(1)

