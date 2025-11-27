"""
简化测试：验证exactbars的基本原理
使用小数据集测试内存占用
"""

import backtrader as bt
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import psutil
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_memory_mb():
    """获取当前内存占用（MB）"""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024


def create_sample_data(num_bars=100000):
    """创建测试数据"""
    start_date = datetime(2023, 1, 1)
    dates = [start_date + timedelta(seconds=i) for i in range(num_bars)]
    
    np.random.seed(42)
    close = np.random.randn(num_bars).cumsum() + 4000
    
    df = pd.DataFrame({
        'open': close + np.random.randn(num_bars) * 0.5,
        'high': close + abs(np.random.randn(num_bars)) * 1.0,
        'low': close - abs(np.random.randn(num_bars)) * 1.0,
        'close': close,
        'volume': np.random.randint(100, 1000, num_bars),
    }, index=pd.DatetimeIndex(dates))
    
    return df


class SimpleStrategy(bt.Strategy):
    def __init__(self):
        self.sma = bt.indicators.SMA(period=50)
    
    def next(self):
        if not self.position and self.data.close[0] > self.sma[0]:
            self.buy()
        elif self.position and self.data.close[0] < self.sma[0]:
            self.sell()


def test_mode(mode_name, exactbars, preload, runonce, data):
    """测试指定模式"""
    logger.info("="*60)
    logger.info(f"Testing: {mode_name}")
    logger.info(f"  exactbars={exactbars}, preload={preload}, runonce={runonce}")
    logger.info("="*60)
    
    mem_before = get_memory_mb()
    
    # 创建Cerebro
    cerebro = bt.Cerebro(
        exactbars=exactbars,
        preload=preload,
        runonce=runonce,
    )
    
    # 添加数据
    cerebro.adddata(bt.feeds.PandasData(dataname=data.copy()))
    cerebro.addstrategy(SimpleStrategy)
    cerebro.broker.setcash(100000)
    
    mem_after_setup = get_memory_mb()
    
    # 运行
    cerebro.run()
    
    mem_after_run = get_memory_mb()
    
    logger.info(f"Memory before: {mem_before:.2f} MB")
    logger.info(f"Memory after setup: {mem_after_setup:.2f} MB (+{mem_after_setup - mem_before:.2f})")
    logger.info(f"Memory after run: {mem_after_run:.2f} MB (+{mem_after_run - mem_before:.2f})")
    logger.info(f"Final value: ${cerebro.broker.getvalue():,.2f}")
    
    return {
        'mode': mode_name,
        'memory_increase': mem_after_run - mem_before,
    }


if __name__ == '__main__':
    # 创建测试数据（10万条）
    logger.info("Creating test data (100,000 bars)...")
    data = create_sample_data(100000)
    data_size_mb = data.memory_usage(deep=True).sum() / 1024 / 1024
    logger.info(f"Data size: {data_size_mb:.2f} MB")
    logger.info(f"Data shape: {data.shape}")
    
    print("\n" + "="*60)
    print("EXACTBARS BEHAVIOR TEST")
    print("="*60 + "\n")
    
    # 测试1：默认模式
    result1 = test_mode(
        "Default (preload=True, runonce=True)",
        exactbars=False,
        preload=True,
        runonce=True,
        data=data
    )
    
    import gc
    gc.collect()
    
    # 测试2：exactbars模式
    result2 = test_mode(
        "Exactbars (preload=False, runonce=False)",
        exactbars=True,
        preload=False,
        runonce=False,
        data=data
    )
    
    # 对比
    print("\n" + "="*60)
    print("COMPARISON")
    print("="*60)
    print(f"Default memory increase:   {result1['memory_increase']:.2f} MB")
    print(f"Exactbars memory increase: {result2['memory_increase']:.2f} MB")
    
    reduction = result1['memory_increase'] - result2['memory_increase']
    reduction_pct = (reduction / result1['memory_increase']) * 100
    
    print(f"\nMemory saved: {reduction:.2f} MB ({reduction_pct:.1f}%)")
    
    if reduction_pct > 10:
        print("✅ Exactbars is working! Significant memory reduction.")
    else:
        print("⚠️  Limited benefit - data is already in memory via DataFrame")

