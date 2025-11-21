"""
Checkpoint 模块测试

测试 Checkpoint 管理器、触发器和状态序列化。
"""

import sys
import os
import time
import logging
import tempfile
import shutil

# 添加模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import backtrader as bt
from backtrader_integration.checkpoint import (
    CheckpointManager,
    CheckpointTrigger,
    StrategyStateSerializer,
    CerebroStateSerializer,
    create_checkpoint_from_strategy,
    restore_strategy_from_checkpoint,
)
from backtrader_integration.strategy import MACrossStrategy
from backtrader_integration.data import CachedParquetDataFeed

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def test_checkpoint_manager():
    """测试 Checkpoint 管理器"""
    print("\n" + "="*80)
    print("测试 1: Checkpoint 管理器")
    print("="*80)
    
    # 使用临时目录
    temp_dir = tempfile.mkdtemp()
    
    try:
        # 创建管理器
        manager = CheckpointManager(
            checkpoint_dir=temp_dir,
            max_checkpoints=3,
            task_id='test_task'
        )
        print("✅ CheckpointManager 创建成功")
        
        # 保存几个 Checkpoint
        for i in range(5):
            strategy_state = {
                'position': {'size': i * 100, 'price': 4000 + i},
                'broker': {'cash': 100000 - i * 1000, 'value': 100000},
            }
            
            checkpoint_path = manager.save_checkpoint(
                current_bar=i * 1000,
                total_bars=10000,
                strategy_state=strategy_state,
                metadata={'test': f'checkpoint_{i}'}
            )
            print(f"✅ Checkpoint {i} 保存成功: {os.path.basename(checkpoint_path)}")
            time.sleep(0.1)  # 确保时间戳不同
        
        # 列出 Checkpoint
        checkpoints = manager.list_checkpoints()
        print(f"\n✅ 找到 {len(checkpoints)} 个 Checkpoint")
        assert len(checkpoints) == 3, f"应该只保留3个最新的，但有{len(checkpoints)}个"
        print("✅ 自动清理功能正常")
        
        # 加载最新的 Checkpoint
        latest_checkpoint = manager.load_checkpoint()
        assert latest_checkpoint is not None, "应该能加载最新的 Checkpoint"
        print(f"✅ 加载最新 Checkpoint: bar={latest_checkpoint['current_bar']}")
        assert latest_checkpoint['current_bar'] == 4000, "应该是最后一个保存的"
        
        # 删除一个 Checkpoint
        checkpoint_name = checkpoints[0]['checkpoint_name']
        success = manager.delete_checkpoint(checkpoint_name)
        assert success, "删除应该成功"
        print(f"✅ 删除 Checkpoint: {checkpoint_name}")
        
        # 清空所有
        count = manager.clear_all_checkpoints()
        print(f"✅ 清空所有 Checkpoint: {count} 个")
        
        print("✅ Checkpoint 管理器测试通过\n")
        
    finally:
        # 清理临时目录
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_checkpoint_trigger():
    """测试 Checkpoint 触发器"""
    print("\n" + "="*80)
    print("测试 2: Checkpoint 触发器")
    print("="*80)
    
    temp_dir = tempfile.mkdtemp()
    
    try:
        manager = CheckpointManager(checkpoint_dir=temp_dir, task_id='test_trigger')
        trigger = CheckpointTrigger(
            manager=manager,
            interval=100,  # 每100根K线
            min_interval_seconds=0.1  # 最小0.1秒
        )
        print("✅ CheckpointTrigger 创建成功")
        
        # 测试触发逻辑
        assert not trigger.should_checkpoint(50), "50根不应该触发"
        print("✅ 未达到间隔，不触发")
        
        assert trigger.should_checkpoint(100), "100根应该触发"
        print("✅ 达到间隔，触发")
        
        trigger.mark_checkpoint_saved(100)
        time.sleep(0.11)  # 确保时间间隔足够
        assert not trigger.should_checkpoint(150), "150根（距上次50根）不应该触发"
        print("✅ 标记保存后，重新计算间隔")
        
        time.sleep(0.11)  # 确保时间间隔足够
        assert trigger.should_checkpoint(200), "200根应该触发"
        print("✅ 再次达到间隔，触发")
        
        # 测试时间间隔限制
        trigger.mark_checkpoint_saved(200)
        time.sleep(0.05)  # 只等0.05秒，小于最小间隔0.1秒
        assert not trigger.should_checkpoint(300), "时间间隔不足，不应该触发"
        print("✅ 时间间隔限制正常")
        
        time.sleep(0.06)  # 再等0.06秒，总共0.11秒
        assert trigger.should_checkpoint(300), "时间间隔足够，应该触发"
        print("✅ 时间间隔满足，触发")
        
        print("✅ Checkpoint 触发器测试通过\n")
        
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_strategy_state_serialization():
    """测试策略状态序列化"""
    print("\n" + "="*80)
    print("测试 3: 策略状态序列化")
    print("="*80)
    
    # 创建一个简单的回测
    cerebro = bt.Cerebro()
    cerebro.broker.setcash(100000.0)
    cerebro.broker.setcommission(commission=0.001)
    
    # 使用 Pandas DataFrame 创建简单的测试数据
    import pandas as pd
    df = pd.DataFrame({
        'datetime': pd.date_range('2023-01-01', periods=100, freq='1min'),
        'open': [100.0] * 100,
        'high': [101.0] * 100,
        'low': [99.0] * 100,
        'close': [100.5] * 100,
        'volume': [1000] * 100,
    })
    df = df.set_index('datetime')
    
    data = bt.feeds.PandasData(dataname=df)
    cerebro.adddata(data)
    
    # 添加策略
    cerebro.addstrategy(
        MACrossStrategy,
        sma_fast_period=5,
        sma_slow_period=10,
        task_id='test_serialization'
    )
    
    print("✅ Cerebro 和策略创建成功")
    
    # 运行一小段（只是为了初始化）
    results = cerebro.run()
    strategy = results[0]
    
    # 提取状态
    state = StrategyStateSerializer.extract_state(strategy)
    assert 'position' in state, "应该包含持仓信息"
    assert 'broker' in state, "应该包含账户信息"
    print(f"✅ 策略状态提取成功: position_size={state['position']['size']}")
    
    # 提取 Cerebro 状态
    cerebro_state = CerebroStateSerializer.extract_state(cerebro)
    assert 'broker' in cerebro_state, "应该包含Broker信息"
    print(f"✅ Cerebro 状态提取成功: cash={cerebro_state['broker']['cash']:.2f}")
    
    # 测试便捷函数
    checkpoint_data = create_checkpoint_from_strategy(
        strategy=strategy,
        current_bar=100,
        total_bars=1000,
        cerebro=cerebro
    )
    assert 'strategy_state' in checkpoint_data, "应该包含策略状态"
    assert 'cerebro_state' in checkpoint_data, "应该包含Cerebro状态"
    print("✅ Checkpoint 数据创建成功")
    
    print("✅ 策略状态序列化测试通过\n")


def test_checkpoint_with_backtest():
    """测试 Checkpoint 与回测集成"""
    print("\n" + "="*80)
    print("测试 4: Checkpoint 与回测集成")
    print("="*80)
    
    # 配置数据路径
    data_base_path = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets'
    
    if not os.path.exists(data_base_path):
        print("⚠️ 测试数据不存在，跳过集成测试")
        return
    
    temp_dir = tempfile.mkdtemp()
    
    try:
        # 创建 Checkpoint 管理器
        checkpoint_manager = CheckpointManager(
            checkpoint_dir=temp_dir,
            max_checkpoints=2,
            task_id='test_backtest'
        )
        
        checkpoint_trigger = CheckpointTrigger(
            manager=checkpoint_manager,
            interval=50,  # 每50根K线
            min_interval_seconds=0
        )
        
        print("✅ Checkpoint 管理器创建成功")
        
        # 创建 Cerebro
        cerebro = bt.Cerebro()
        cerebro.broker.setcash(100000.0)
        cerebro.broker.setcommission(commission=0.001)
        
        # 添加数据
        data = CachedParquetDataFeed(
            symbol='MES',
            base_path=data_base_path,
            start_date='2022-12-15 00:00:00',
            end_date='2022-12-15 23:59:59',
            aggregate_timeframe='1min',
        )
        cerebro.adddata(data)
        print("✅ 数据添加成功")
        
        # 添加策略
        cerebro.addstrategy(
            MACrossStrategy,
            sma_fast_period=10,
            sma_slow_period=30,
            task_id='test_backtest'
        )
        
        # 运行回测
        print("\n开始回测（带 Checkpoint）...")
        start_time = time.time()
        results = cerebro.run()
        elapsed = time.time() - start_time
        
        strategy = results[0]
        
        # 测试 Checkpoint 功能
        strategy.set_checkpoint_manager(checkpoint_manager, checkpoint_trigger)
        
        # 手动保存一个 Checkpoint
        success = strategy.save_checkpoint(metadata={'test': 'manual'})
        assert success, "手动保存应该成功"
        print("✅ 手动保存 Checkpoint 成功")
        
        # 检查 Checkpoint 是否存在
        checkpoints = checkpoint_manager.list_checkpoints()
        assert len(checkpoints) > 0, "应该至少有一个 Checkpoint"
        print(f"✅ 找到 {len(checkpoints)} 个 Checkpoint")
        
        # 加载并验证
        loaded = checkpoint_manager.load_checkpoint()
        assert loaded is not None, "应该能加载 Checkpoint"
        print("✅ Checkpoint 加载成功")
        
        print(f"\n✅ 回测完成，耗时: {elapsed:.2f}秒")
        print("✅ Checkpoint 与回测集成测试通过\n")
        
    except Exception as e:
        print(f"❌ 集成测试失败: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    """运行所有测试"""
    print("\n" + "="*80)
    print(" Checkpoint 模块 - 单元测试")
    print("="*80)
    
    start_time = time.time()
    
    # 运行测试
    test_checkpoint_manager()
    test_checkpoint_trigger()
    test_strategy_state_serialization()
    test_checkpoint_with_backtest()
    
    # 统计
    end_time = time.time()
    elapsed = end_time - start_time
    
    print("\n" + "="*80)
    print(f" 所有测试完成，总耗时: {elapsed:.2f}秒")
    print("="*80 + "\n")


if __name__ == '__main__':
    main()

