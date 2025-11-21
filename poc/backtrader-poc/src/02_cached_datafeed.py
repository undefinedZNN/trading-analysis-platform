#!/usr/bin/env python3
"""
POC Day 2 - 实现带 LRU 缓存的 Parquet DataFeed
这是核心组件，用于 Backtrader 回测
"""

import backtrader as bt
import duckdb
import pandas as pd
from datetime import datetime
from collections import OrderedDict


class LRUCache:
    """LRU 缓存实现"""
    
    def __init__(self, capacity_mb=2048):
        self.capacity_mb = capacity_mb
        self.cache = OrderedDict()
        self.current_size_mb = 0
        self.stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0
        }
    
    def get(self, key):
        """获取缓存数据"""
        if key not in self.cache:
            self.stats['misses'] += 1
            return None
        
        # 移到末尾（最近使用）
        self.cache.move_to_end(key)
        self.stats['hits'] += 1
        return self.cache[key]['data']
    
    def put(self, key, value):
        """写入缓存"""
        # 计算数据大小
        size_mb = value.memory_usage(deep=True).sum() / (1024 ** 2)
        
        # 如果已存在，先删除
        if key in self.cache:
            old_size = self.cache[key]['size_mb']
            self.current_size_mb -= old_size
            del self.cache[key]
        
        # 检查容量，需要时淘汰旧数据
        while self.current_size_mb + size_mb > self.capacity_mb and self.cache:
            oldest_key, oldest_value = self.cache.popitem(last=False)
            self.current_size_mb -= oldest_value['size_mb']
            self.stats['evictions'] += 1
            print(f"  ⚠️  缓存淘汰: {oldest_key} ({oldest_value['size_mb']:.2f} MB)")
        
        # 写入缓存
        self.cache[key] = {
            'data': value,
            'size_mb': size_mb,
            'cached_at': datetime.now()
        }
        self.current_size_mb += size_mb
        self.cache.move_to_end(key)
        print(f"  ✅ 缓存写入: {key} ({size_mb:.2f} MB), 总大小: {self.current_size_mb:.2f} MB")
    
    def get_stats(self):
        """获取缓存统计"""
        total_requests = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'hits': self.stats['hits'],
            'misses': self.stats['misses'],
            'hit_rate': hit_rate,
            'evictions': self.stats['evictions'],
            'current_size_mb': self.current_size_mb,
            'capacity_mb': self.capacity_mb,
            'items_count': len(self.cache)
        }


class CachedParquetDataFeed(bt.DataBase):
    """带缓存的 Parquet DataFeed"""
    
    # 类级别缓存（所有实例共享）
    _cache = LRUCache(capacity_mb=2048)
    
    params = (
        ('symbol', 'ES'),
        ('data_path', '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/ES/ES/1s/**/*.parquet'),
        ('start_date', None),
        ('end_date', None),
        ('aggregate_timeframe', '1min'),  # 聚合到1分钟（用于缓存键）
    )
    
    def __init__(self):
        super(CachedParquetDataFeed, self).__init__()
        self.data = None
        self.idx = 0
    
    def start(self):
        """DataFeed 启动时加载数据"""
        super(CachedParquetDataFeed, self).start()
        
        # 生成缓存键
        cache_key = f"{self.p.symbol}_{self.p.start_date}_{self.p.end_date}_{self.p.aggregate_timeframe}"
        
        print(f"\n📊 加载数据: {cache_key}")
        
        # 从缓存获取
        cached_data = self._cache.get(cache_key)
        if cached_data is not None:
            self.data = cached_data
            print(f"  🎯 缓存命中！")
            return
        
        # 缓存未命中，从 Parquet 读取
        print(f"  ⚙️  从 Parquet 读取数据...")
        start_time = datetime.now()
        
        try:
            conn = duckdb.connect()
            
            # 构建查询
            query = f"""
            SELECT 
                timestamp,
                open,
                high,
                low,
                close,
                volume
            FROM read_parquet('{self.p.data_path}')
            WHERE 1=1
            """
            
            if self.p.start_date:
                query += f" AND timestamp >= '{self.p.start_date}'"
            if self.p.end_date:
                query += f" AND timestamp <= '{self.p.end_date}'"
            
            query += " ORDER BY timestamp"
            
            # 执行查询
            df = conn.execute(query).fetchdf()
            conn.close()
            
            elapsed = (datetime.now() - start_time).total_seconds()
            print(f"  ✅ 读取完成！行数: {len(df):,}, 耗时: {elapsed:.2f}秒")
            
            # 聚合到指定时间周期
            if self.p.aggregate_timeframe == '1min':
                print(f"  ⚙️  聚合到 1 分钟...")
                df = self._aggregate_to_minutes(df)
                print(f"  ✅ 聚合完成！行数: {len(df):,}")
            
            self.data = df
            
            # 写入缓存
            self._cache.put(cache_key, df)
            
        except Exception as e:
            print(f"  ❌ 读取数据失败: {e}")
            raise
    
    def _aggregate_to_minutes(self, df):
        """聚合到分钟级别"""
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)
        
        # 聚合规则
        agg_dict = {
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }
        
        # 按分钟聚合
        df_1min = df.resample('1T').agg(agg_dict).dropna()
        df_1min.reset_index(inplace=True)
        
        return df_1min
    
    def _load(self):
        """加载下一根K线"""
        if self.idx >= len(self.data):
            return False
        
        row = self.data.iloc[self.idx]
        
        # 设置 Backtrader 数据线
        self.lines.datetime[0] = bt.date2num(row['timestamp'])
        self.lines.open[0] = row['open']
        self.lines.high[0] = row['high']
        self.lines.low[0] = row['low']
        self.lines.close[0] = row['close']
        self.lines.volume[0] = row['volume']
        
        self.idx += 1
        return True
    
    @classmethod
    def get_cache_stats(cls):
        """获取缓存统计"""
        return cls._cache.get_stats()


def test_cached_datafeed():
    """测试带缓存的 DataFeed"""
    print("🚀 POC Day 2 - 测试带缓存的 Parquet DataFeed")
    print("=" * 60)
    
    # 测试场景：读取相同数据3次，验证缓存效果
    test_params = {
        'symbol': 'ES',
        'start_date': '2022-12-15',
        'end_date': '2022-12-16',
        'aggregate_timeframe': '1min'
    }
    
    print(f"\n📋 测试参数:")
    for k, v in test_params.items():
        print(f"  {k}: {v}")
    
    # 第一次加载（缓存未命中）
    print(f"\n{'='*60}")
    print("第 1 次加载（预期：缓存未命中）")
    print('='*60)
    
    cerebro1 = bt.Cerebro()
    data1 = CachedParquetDataFeed(**test_params)
    cerebro1.adddata(data1)
    
    start_time = datetime.now()
    cerebro1.run()
    elapsed1 = (datetime.now() - start_time).total_seconds()
    print(f"\n⏱️  总耗时: {elapsed1:.2f} 秒")
    
    # 第二次加载（缓存命中）
    print(f"\n{'='*60}")
    print("第 2 次加载（预期：缓存命中）")
    print('='*60)
    
    cerebro2 = bt.Cerebro()
    data2 = CachedParquetDataFeed(**test_params)
    cerebro2.adddata(data2)
    
    start_time = datetime.now()
    cerebro2.run()
    elapsed2 = (datetime.now() - start_time).total_seconds()
    print(f"\n⏱️  总耗时: {elapsed2:.2f} 秒")
    
    # 第三次加载（缓存命中）
    print(f"\n{'='*60}")
    print("第 3 次加载（预期：缓存命中）")
    print('='*60)
    
    cerebro3 = bt.Cerebro()
    data3 = CachedParquetDataFeed(**test_params)
    cerebro3.adddata(data3)
    
    start_time = datetime.now()
    cerebro3.run()
    elapsed3 = (datetime.now() - start_time).total_seconds()
    print(f"\n⏱️  总耗时: {elapsed3:.2f} 秒")
    
    # 统计结果
    print(f"\n{'='*60}")
    print("📊 缓存统计")
    print('='*60)
    
    stats = CachedParquetDataFeed.get_cache_stats()
    print(f"\n缓存命中率: {stats['hit_rate']:.2f}%")
    print(f"命中次数: {stats['hits']}")
    print(f"未命中次数: {stats['misses']}")
    print(f"淘汰次数: {stats['evictions']}")
    print(f"当前大小: {stats['current_size_mb']:.2f} MB / {stats['capacity_mb']:.2f} MB")
    print(f"缓存项数: {stats['items_count']}")
    
    print(f"\n📈 性能对比:")
    print(f"第 1 次（无缓存）: {elapsed1:.2f} 秒")
    print(f"第 2 次（有缓存）: {elapsed2:.2f} 秒")
    print(f"第 3 次（有缓存）: {elapsed3:.2f} 秒")
    
    if elapsed1 > 0:
        speedup = elapsed1 / ((elapsed2 + elapsed3) / 2)
        print(f"\n🚀 性能提升: {speedup:.1f}x")
    
    # 验证是否达标
    print(f"\n{'='*60}")
    print("✅ 测试结果")
    print('='*60)
    
    success = True
    
    if stats['hit_rate'] >= 66:  # 3次请求，2次命中 = 66.7%
        print(f"✅ 缓存命中率达标: {stats['hit_rate']:.2f}% >= 66%")
    else:
        print(f"❌ 缓存命中率未达标: {stats['hit_rate']:.2f}% < 66%")
        success = False
    
    if speedup > 5:
        print(f"✅ 性能提升达标: {speedup:.1f}x > 5x")
    else:
        print(f"⚠️  性能提升: {speedup:.1f}x （第一次测试，数据量小）")
    
    print(f"\n✅ 带缓存的 DataFeed 测试{'通过' if success else '需要优化'}！")
    return success


if __name__ == "__main__":
    success = test_cached_datafeed()
    exit(0 if success else 1)

