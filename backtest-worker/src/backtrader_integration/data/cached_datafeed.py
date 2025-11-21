"""
Backtrader DataFeed with Parquet + DuckDB + LRU Cache

重构自 POC: poc/backtrader-poc/src/cached_datafeed.py
"""

import backtrader as bt
import pandas as pd
import duckdb
import os
import time
import logging
from collections import OrderedDict
from typing import Optional, Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)


class LRUCache:
    """
    LRU (Least Recently Used) 缓存
    用于缓存市场数据，减少重复读取 Parquet 文件
    """
    
    def __init__(self, capacity_mb: int = 2048):
        """
        初始化 LRU 缓存
        
        Args:
            capacity_mb: 缓存容量（MB），默认 2GB
        """
        self.capacity_mb = capacity_mb
        self.cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self.current_size_mb = 0.0
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        
        logger.info(f"LRU Cache initialized: capacity={capacity_mb}MB")
    
    def _get_size_mb(self, df: pd.DataFrame) -> float:
        """计算 DataFrame 的内存大小（MB）"""
        return df.memory_usage(deep=True).sum() / (1024 ** 2)
    
    def get(self, key: str) -> Optional[pd.DataFrame]:
        """
        从缓存获取数据
        
        Args:
            key: 缓存键
            
        Returns:
            DataFrame 或 None
        """
        if key not in self.cache:
            self.misses += 1
            logger.debug(f"Cache miss: {key}")
            return None
        
        self.hits += 1
        self.cache.move_to_end(key)  # 移到最后（最近使用）
        logger.debug(f"Cache hit: {key}")
        return self.cache[key]['data']
    
    def put(self, key: str, value_df: pd.DataFrame) -> None:
        """
        将数据放入缓存
        
        Args:
            key: 缓存键
            value_df: 要缓存的 DataFrame
        """
        size_mb = self._get_size_mb(value_df)
        
        # 如果 key 已存在，先删除
        if key in self.cache:
            old_size = self.cache[key]['size_mb']
            self.current_size_mb -= old_size
            del self.cache[key]
        
        # 如果超过容量，淘汰最久未使用的数据
        while self.current_size_mb + size_mb > self.capacity_mb and self.cache:
            oldest_key, oldest_value = self.cache.popitem(last=False)
            self.current_size_mb -= oldest_value['size_mb']
            self.evictions += 1
            logger.debug(f"Cache eviction: {oldest_key} ({oldest_value['size_mb']:.2f}MB)")
        
        # 添加新数据
        self.cache[key] = {
            'data': value_df,
            'size_mb': size_mb
        }
        self.current_size_mb += size_mb
        self.cache.move_to_end(key)
        logger.debug(f"Cache put: {key} ({size_mb:.2f}MB), total={self.current_size_mb:.2f}MB")
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        total_accesses = self.hits + self.misses
        hit_rate = (self.hits / total_accesses * 100) if total_accesses > 0 else 0.0
        
        return {
            'hit_rate': hit_rate,
            'hits': self.hits,
            'misses': self.misses,
            'evictions': self.evictions,
            'current_size_mb': self.current_size_mb,
            'capacity_mb': self.capacity_mb,
            'item_count': len(self.cache)
        }
    
    def clear(self) -> None:
        """清空缓存"""
        self.cache.clear()
        self.current_size_mb = 0.0
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        logger.info("Cache cleared")


# 全局缓存实例
_global_cache: Optional[LRUCache] = None


def get_global_cache(capacity_mb: int = 2048) -> LRUCache:
    """获取全局缓存实例（单例）"""
    global _global_cache
    if _global_cache is None:
        _global_cache = LRUCache(capacity_mb)
    return _global_cache


class CachedParquetDataFeed(bt.feeds.PandasData):
    """
    支持缓存的 Parquet DataFeed
    
    功能：
    - 使用 DuckDB 读取 Parquet 文件
    - LRU 缓存减少重复读取
    - 支持数据聚合（1秒 → 1分钟/5分钟/1小时/1天）
    - 支持按天分区的数据读取
    """
    
    params = (
        ('symbol', None),  # 品种代码，例如 'ES'
        ('start_date', None),  # 开始日期
        ('end_date', None),  # 结束日期
        ('aggregate_timeframe', '1min'),  # 聚合时间周期
        ('base_path', '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets'),  # 数据根目录
        ('use_cache', True),  # 是否使用缓存
        ('cache_capacity_mb', 2048),  # 缓存容量（MB）
    )
    
    def __init__(self, **kwargs):
        """初始化 DataFeed"""
        # 参数验证
        if not self.p.symbol:
            raise ValueError("symbol parameter is required")
        if not self.p.start_date or not self.p.end_date:
            raise ValueError("start_date and end_date parameters are required")
        
        # 生成缓存键
        self.cache_key = f"{self.p.symbol}_{self.p.start_date}_{self.p.end_date}_{self.p.aggregate_timeframe}"
        
        # 获取缓存实例
        self.cache = get_global_cache(self.p.cache_capacity_mb) if self.p.use_cache else None
        
        # 加载数据
        self.df = self._load_data()
        
        # 设置 dataname 参数（DataFrame）
        self.p.dataname = self.df
        
        # 调用父类初始化（PandasData）
        super().__init__()
        
        logger.info(f"DataFeed initialized: {self.cache_key}, rows={len(self.df)}")
    
    def _load_data(self) -> pd.DataFrame:
        """加载数据（带缓存）"""
        # 尝试从缓存获取
        if self.cache:
            cached_df = self.cache.get(self.cache_key)
            if cached_df is not None:
                logger.info(f"Data loaded from cache: {self.cache_key}")
                return cached_df
        
        # 缓存未命中，从 Parquet 读取
        logger.info(f"Loading data from Parquet: {self.cache_key}")
        start_time = time.time()
        
        try:
            df = self._read_from_parquet()
            elapsed = time.time() - start_time
            logger.info(f"Data loaded: {self.cache_key}, rows={len(df)}, elapsed={elapsed:.3f}s")
            
            # 放入缓存
            if self.cache and not df.empty:
                self.cache.put(self.cache_key, df)
            
            return df
            
        except Exception as e:
            logger.error(f"Failed to load data: {self.cache_key}, error={e}", exc_info=True)
            raise
    
    def _read_from_parquet(self) -> pd.DataFrame:
        """从 Parquet 文件读取数据"""
        # 构建文件路径列表（按天分区）
        all_parquet_files = self._get_parquet_files()
        
        if not all_parquet_files:
            logger.warning(f"No Parquet files found for {self.cache_key}")
            return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        
        # 使用 DuckDB 读取
        con = duckdb.connect(database=':memory:', read_only=False)
        
        try:
            query_sql = f"""
            SELECT * FROM read_parquet({all_parquet_files})
            WHERE timestamp BETWEEN '{self.p.start_date}' AND '{self.p.end_date}'
            ORDER BY timestamp
            """
            
            raw_df = con.execute(query_sql).fetchdf()
            
            if raw_df.empty:
                logger.warning(f"No data in date range: {self.p.start_date} ~ {self.p.end_date}")
                return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            
            # 聚合数据
            df_agg = self._aggregate_data(raw_df)
            
            return df_agg
            
        finally:
            con.close()
    
    def _get_parquet_files(self) -> List[str]:
        """获取 Parquet 文件路径列表"""
        files = []
        
        current_date = pd.to_datetime(self.p.start_date).normalize()
        end_date = pd.to_datetime(self.p.end_date).normalize()
        
        while current_date <= end_date:
            date_str = current_date.strftime('%Y-%m-%d')
            # 路径格式: {base_path}/{symbol}/{symbol}/1s/dt={date}/**/*.parquet
            path_pattern = os.path.join(
                self.p.base_path,
                self.p.symbol,
                self.p.symbol,
                '1s',
                f'dt={date_str}',
                '**',
                '*.parquet'
            )
            
            # 检查路径是否存在
            base_dir = os.path.dirname(path_pattern.split('**')[0])
            if os.path.exists(base_dir):
                files.append(path_pattern)
            else:
                logger.debug(f"Path not exists: {base_dir}")
            
            current_date += pd.Timedelta(days=1)
        
        return files
    
    def _aggregate_data(self, raw_df: pd.DataFrame) -> pd.DataFrame:
        """聚合数据"""
        logger.debug(f"Aggregating data to {self.p.aggregate_timeframe}")
        start_time = time.time()
        
        # 转换时间戳
        raw_df['timestamp'] = pd.to_datetime(raw_df['timestamp'])
        raw_df = raw_df.set_index('timestamp')
        
        # 确保所需列存在
        for col in ['open', 'high', 'low', 'close', 'volume']:
            if col not in raw_df.columns:
                raw_df[col] = 0.0
        
        # 聚合规则
        agg_dict = {
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }
        
        # 时间周期映射
        timeframe_map = {
            '1min': '1min',
            '5min': '5min',
            '1hour': '1H',
            '1day': '1D',
        }
        
        resample_freq = timeframe_map.get(self.p.aggregate_timeframe)
        if not resample_freq:
            raise ValueError(f"Unsupported aggregate_timeframe: {self.p.aggregate_timeframe}")
        
        # 聚合
        df_agg = raw_df.resample(resample_freq).agg(agg_dict).dropna()
        
        elapsed = time.time() - start_time
        logger.debug(f"Aggregation complete: rows={len(df_agg)}, elapsed={elapsed:.3f}s")
        
        return df_agg
    
    def start(self):
        """Backtrader 启动时调用"""
        if self.df is None or self.df.empty:
            logger.warning(f"DataFeed has no data: {self.cache_key}")
            return
        
        super().start()


def get_cache_stats() -> Dict[str, Any]:
    """获取全局缓存统计信息"""
    cache = get_global_cache()
    return cache.get_stats()


def clear_cache() -> None:
    """清空全局缓存"""
    cache = get_global_cache()
    cache.clear()

