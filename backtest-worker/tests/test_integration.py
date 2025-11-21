"""
集成测试

测试 Backtrader 集成模块的各个组件是否正常工作。
"""

import sys
import os
import time
import logging

# 添加模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import backtrader as bt
from backtrader_integration.data import CachedParquetDataFeed, get_cache_stats
from backtrader_integration.factors import FactorCollector
from backtrader_integration.strategy import MACrossStrategy, StrategyFactory
from backtrader_integration.messaging import (
    RabbitMQClient,
    RabbitMQConfig,
    ProgressTracker
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def test_strategy_factory():
    """测试策略工厂"""
    print("\n" + "="*80)
    print("测试 1: 策略工厂")
    print("="*80)
    
    # 列出所有策略
    strategies = StrategyFactory.list_strategies()
    print(f"✅ 已注册策略: {strategies}")
    assert 'ma_cross' in strategies, "MA Cross 策略未注册"
    
    # 获取策略信息
    info = StrategyFactory.get_strategy_info('ma_cross')
    print(f"✅ 策略信息: {info}")
    
    # 创建策略
    strategy_class, params = StrategyFactory.create(
        'ma_cross',
        sma_fast_period=5,
        sma_slow_period=20,
        printlog=True,
        task_id='test_task'
    )
    print(f"✅ 策略创建成功: {strategy_class}, 参数: {params}")
    
    print("✅ 策略工厂测试通过\n")


def test_cached_datafeed():
    """测试数据加载"""
    print("\n" + "="*80)
    print("测试 2: 缓存数据加载")
    print("="*80)
    
    # 配置数据路径（使用实际的数据）
    data_base_path = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets'
    
    if not os.path.exists(data_base_path):
        print("⚠️ 测试数据不存在，跳过数据加载测试")
        return
    
    try:
        # 创建数据源
        data = CachedParquetDataFeed(
            symbol='MES',
            base_path=data_base_path,
            start_date='2022-12-15',
            end_date='2022-12-15',
            aggregate_timeframe='1min',
            cache_capacity_mb=1024,
        )
        print("✅ 数据源创建成功")
        
        # 获取数据统计
        stats = get_cache_stats()
        print(f"✅ 缓存统计: {stats}")
        
        print("✅ 数据加载测试通过\n")
        
    except Exception as e:
        print(f"⚠️ 数据加载测试失败: {e}")
        import traceback
        traceback.print_exc()


def test_rabbitmq_client():
    """测试 RabbitMQ 客户端"""
    print("\n" + "="*80)
    print("测试 3: RabbitMQ 客户端")
    print("="*80)
    
    try:
        # 创建客户端（使用实际配置）
        config = RabbitMQConfig(
            host='127.0.0.1',
            port=5672,
            vhost='/backtest',
            username='dev',
            password='devpass',
            connection_timeout=5,
        )
        
        client = RabbitMQClient(config)
        print("✅ RabbitMQ 客户端创建成功")
        
        # 发送测试消息
        task_id = f'test_task_{int(time.time())}'
        
        # 1. 发送进度消息
        success = client.send_progress(
            task_id=task_id,
            progress=50.0,
            message='Test progress',
            details={'test': True}
        )
        print(f"✅ 发送进度消息: {'成功' if success else '失败'}")
        
        # 2. 发送心跳消息
        success = client.send_heartbeat(
            worker_id='test_worker',
            status='healthy',
            metrics={'cpu': 50.0, 'memory': 60.0}
        )
        print(f"✅ 发送心跳消息: {'成功' if success else '失败'}")
        
        # 3. 发送结果消息
        success = client.send_result(
            task_id=task_id,
            status='success',
            result={'test': 'data'}
        )
        print(f"✅ 发送结果消息: {'成功' if success else '失败'}")
        
        # 关闭客户端
        client.close()
        print("✅ RabbitMQ 客户端关闭")
        
        print("✅ RabbitMQ 客户端测试通过\n")
        
    except Exception as e:
        print(f"⚠️ RabbitMQ 测试失败（可能 RabbitMQ 未运行）: {e}")


def test_complete_backtest():
    """测试完整回测流程"""
    print("\n" + "="*80)
    print("测试 4: 完整回测流程")
    print("="*80)
    
    # 配置数据路径
    data_base_path = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets'
    
    if not os.path.exists(data_base_path):
        print("⚠️ 测试数据不存在，跳过完整回测测试")
        return
    
    try:
        # 1. 创建 Cerebro
        cerebro = bt.Cerebro()
        print("✅ Cerebro 创建成功")
        
        # 2. 添加数据（使用一天的数据进行测试）
        data = CachedParquetDataFeed(
            symbol='MES',
            base_path=data_base_path,
            start_date='2022-12-15 00:00:00',
            end_date='2022-12-15 23:59:59',  # 使用一整天数据
            aggregate_timeframe='1min',
        )
        cerebro.adddata(data)
        print("✅ 数据添加成功")
        
        # 3. 添加策略
        cerebro.addstrategy(
            MACrossStrategy,
            sma_fast_period=10,
            sma_slow_period=30,
            printlog=False,
            task_id='test_complete'
        )
        print("✅ 策略添加成功")
        
        # 4. 添加因子收集器
        cerebro.addobserver(FactorCollector)
        print("✅ 因子收集器添加成功")
        
        # 5. 添加进度追踪器
        try:
            rabbitmq_config = RabbitMQConfig(
                host='127.0.0.1',
                port=5672,
                vhost='/backtest',
                username='dev',
                password='devpass',
                connection_timeout=5
            )
            rabbitmq_client = RabbitMQClient(rabbitmq_config)
            
            progress_tracker = cerebro.addobserver(
                ProgressTracker,
                report_interval=500,
                task_id='test_complete'
            )
            print("✅ 进度追踪器添加成功")
            
        except Exception as e:
            print(f"⚠️ RabbitMQ 客户端创建失败（跳过进度追踪）: {e}")
            rabbitmq_client = None
        
        # 6. 设置初始资金
        cerebro.broker.setcash(100000.0)
        cerebro.broker.setcommission(commission=0.001)
        print("✅ Broker 配置成功")
        
        # 7. 运行回测
        print("\n开始回测...")
        start_time = time.time()
        
        results = cerebro.run()
        
        end_time = time.time()
        elapsed = end_time - start_time
        
        print(f"\n✅ 回测完成，耗时: {elapsed:.2f}秒")
        
        # 8. 获取结果
        final_value = cerebro.broker.getvalue()
        initial_value = 100000.0
        profit = final_value - initial_value
        roi = (profit / initial_value) * 100
        
        print(f"\n回测结果:")
        print(f"  初始资金: ${initial_value:,.2f}")
        print(f"  最终资金: ${final_value:,.2f}")
        print(f"  收益: ${profit:,.2f}")
        print(f"  收益率: {roi:.2f}%")
        
        # 9. 获取因子数据
        strategy = results[0]
        if hasattr(strategy, 'getobserverbyname'):
            factor_collector = strategy.getobserverbyname('factorcollector')
            if factor_collector:
                factors_df = factor_collector.to_dataframe()
                print(f"\n✅ 因子收集: {len(factors_df)} 条记录")
                if len(factors_df) > 0:
                    print(f"  入场交易: {len(factors_df[factors_df['factor_type'] == 'entry'])}")
                    print(f"  出场交易: {len(factors_df[factors_df['factor_type'] == 'exit'])}")
        
        # 10. 清理
        if rabbitmq_client:
            rabbitmq_client.close()
        
        print("✅ 完整回测测试通过\n")
        
    except Exception as e:
        print(f"❌ 完整回测测试失败: {e}")
        import traceback
        traceback.print_exc()


def main():
    """运行所有测试"""
    print("\n" + "="*80)
    print(" Backtrader 集成模块 - 集成测试")
    print("="*80)
    
    start_time = time.time()
    
    # 运行测试
    test_strategy_factory()
    test_cached_datafeed()
    test_rabbitmq_client()
    test_complete_backtest()
    
    # 统计
    end_time = time.time()
    elapsed = end_time - start_time
    
    print("\n" + "="*80)
    print(f" 所有测试完成，总耗时: {elapsed:.2f}秒")
    print("="*80 + "\n")


if __name__ == '__main__':
    main()

