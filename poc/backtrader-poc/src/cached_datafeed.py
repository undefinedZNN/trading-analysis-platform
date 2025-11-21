"""
可复用的带缓存的 Parquet DataFeed
从 02_cached_datafeed.py 中提取，供其他脚本使用
"""

import backtrader as bt
import pandas as pd
import duckdb
import os
import time
from collections import OrderedDict

# --- 配置 ---
PARQUET_BASE_PATH = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/ES/ES/1s/'
CACHE_CAPACITY_MB = 2048  # 2GB


# --- LRU 缓存实现 ---
class LRUCache:
    def __init__(self, capacity_mb):
        self.capacity_mb = capacity_mb
        self.cache = OrderedDict()
        self.current_size_mb = 0
        self.hits = 0
        self.misses = 0
        self.evictions = 0

    def _get_size_mb(self, df):
        return df.memory_usage(deep=True).sum() / (1024 ** 2)

    def get(self, key):
        if key not in self.cache:
            self.misses += 1
            return None
        self.hits += 1
        self.cache.move_to_end(key)
        return self.cache[key]['data']

    def put(self, key, value_df):
        size_mb = self._get_size_mb(value_df)

        if key in self.cache:
            old_size = self.cache[key]['size_mb']
            self.current_size_mb -= old_size
            del self.cache[key]

        while self.current_size_mb + size_mb > self.capacity_mb and self.cache:
            oldest_key, oldest_value = self.cache.popitem(last=False)
            self.current_size_mb -= oldest_value['size_mb']
            self.evictions += 1
            print(f"  ⚠️ 缓存淘汰: {oldest_key} ({oldest_value['size_mb']:.2f} MB)")

        self.cache[key] = {
            'data': value_df,
            'size_mb': size_mb
        }
        self.current_size_mb += size_mb
        self.cache.move_to_end(key)
        print(f"  ✅ 缓存写入: {key} ({size_mb:.2f} MB), 总大小: {self.current_size_mb:.2f} MB")

    def get_stats(self):
        total_accesses = self.hits + self.misses
        hit_rate = (self.hits / total_accesses * 100) if total_accesses > 0 else 0
        return {
            'hit_rate': hit_rate,
            'hits': self.hits,
            'misses': self.misses,
            'evictions': self.evictions,
            'current_size_mb': self.current_size_mb,
            'capacity_mb': self.capacity_mb,
            'item_count': len(self.cache)
        }

    def clear(self):
        self.cache.clear()
        self.current_size_mb = 0
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        print("🗑️ 缓存已清空")


# 全局缓存实例
data_cache = LRUCache(CACHE_CAPACITY_MB)


# --- 自定义 Backtrader DataFeed ---
class CachedParquetDataFeed(bt.feeds.PandasData):
    """
    带缓存的 Parquet DataFeed
    """
    params = (
        ('symbol', 'ES'),
        ('start_date', None),
        ('end_date', None),
        ('aggregate_timeframe', '1min'),  # 聚合时间周期
        ('timeframe', bt.TimeFrame.Minutes),  # Backtrader 内部使用的时间周期
        ('compression', 1),  # 时间周期压缩倍数
        ('datetime', None),  # DataFrame 的时间戳列（None 表示使用索引）
        ('open', 'open'),
        ('high', 'high'),
        ('low', 'low'),
        ('close', 'close'),
        ('volume', 'volume'),
        ('openinterest', -1),  # -1 表示不使用
    )

    def __init__(self):
        if self.p.start_date is None or self.p.end_date is None:
            raise ValueError("start_date and end_date must be provided")

        self.cache_key = f"{self.p.symbol}_{self.p.start_date}_{self.p.end_date}_{self.p.aggregate_timeframe}"
        self.df = None
        
        # 先加载数据
        self._load_data()
        
        # 将 DataFrame 赋值给 dataname
        self.p.dataname = self.df
        
        # 调用父类初始化
        super(CachedParquetDataFeed, self).__init__()

    def _load_data(self):
        """加载数据（带缓存）"""
        print(f"\n📊 加载数据: {self.cache_key}")
        cached_df = data_cache.get(self.cache_key)

        if cached_df is not None:
            self.df = cached_df
            print("  🎯 缓存命中！")
        else:
            # 缓存未命中，从 Parquet 读取并聚合
            print("  ⚙️  从 Parquet 读取数据...")
            start_time = time.time()
            
            # 构建 Parquet 文件路径（按天分区）
            all_parquet_files = []
            current_date = pd.to_datetime(self.p.start_date).normalize()
            end_date_norm = pd.to_datetime(self.p.end_date).normalize()

            while current_date <= end_date_norm:
                date_str = current_date.strftime('%Y-%m-%d')
                path_pattern = os.path.join(PARQUET_BASE_PATH, f'dt={date_str}', '**', '*.parquet')
                all_parquet_files.append(path_pattern)
                current_date += pd.Timedelta(days=1)
            
            if not all_parquet_files:
                raise FileNotFoundError(f"No parquet files found for the date range {self.p.start_date} to {self.p.end_date}")

            # 使用 DuckDB 读取所有匹配的 Parquet 文件
            con = duckdb.connect(database=':memory:', read_only=False)
            
            # 构建查询SQL
            file_list_str = "[" + ", ".join(f"'{f}'" for f in all_parquet_files) + "]"
            query_sql = f"""
            SELECT * FROM read_parquet({file_list_str})
            WHERE timestamp BETWEEN '{self.p.start_date}' AND '{self.p.end_date}'
            ORDER BY timestamp
            """
            
            raw_df = con.execute(query_sql).fetchdf()
            con.close()
            
            end_time = time.time()
            print(f"  ✅ 读取完成！行数: {len(raw_df)}, 耗时: {end_time - start_time:.2f}秒")

            # 聚合数据
            if len(raw_df) > 0:
                print(f"  ⚙️  聚合到 {self.p.aggregate_timeframe}...")
                start_time = time.time()
                raw_df['timestamp'] = pd.to_datetime(raw_df['timestamp'])
                raw_df = raw_df.set_index('timestamp')

                # 定义聚合规则
                agg_dict = {
                    'open': 'first',
                    'high': 'max',
                    'low': 'min',
                    'close': 'last',
                    'volume': 'sum'
                }
                
                # 确保所有需要的列都存在
                for col in ['open', 'high', 'low', 'close', 'volume']:
                    if col not in raw_df.columns:
                        raw_df[col] = 0

                # 聚合到指定时间周期
                if self.p.aggregate_timeframe == '1min':
                    resample_freq = '1min'
                elif self.p.aggregate_timeframe == '5min':
                    resample_freq = '5min'
                elif self.p.aggregate_timeframe == '1hour':
                    resample_freq = '1h'
                elif self.p.aggregate_timeframe == '1day':
                    resample_freq = '1D'
                else:
                    raise ValueError(f"Unsupported aggregate_timeframe: {self.p.aggregate_timeframe}")

                df_agg = raw_df.resample(resample_freq).agg(agg_dict).dropna()
                
                end_time = time.time()
                print(f"  ✅ 聚合完成！行数: {len(df_agg)}, 耗时: {end_time - start_time:.2f}秒")

                self.df = df_agg
                data_cache.put(self.cache_key, self.df)
            else:
                print("  ⚠️  未找到数据")
                self.df = pd.DataFrame(columns=['open', 'high', 'low', 'close', 'volume'])


def get_cache_stats():
    """获取缓存统计信息"""
    return data_cache.get_stats()


def clear_cache():
    """清空缓存"""
    data_cache.clear()

