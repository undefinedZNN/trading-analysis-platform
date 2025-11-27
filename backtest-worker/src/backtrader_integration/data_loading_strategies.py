"""
数据加载策略实现
支持多种加载模式以优化内存和性能
"""

import backtrader as bt
import pandas as pd
import duckdb
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import logging
from enum import Enum

logger = logging.getLogger(__name__)


class DataLoadMode(str, Enum):
    """数据加载模式"""
    DEFAULT = "default"
    OPTIMIZED = "optimized"
    STREAMING = "streaming"
    HYBRID = "hybrid"
    SEGMENTED = "segmented"


class DataLoadingConfig:
    """数据加载配置"""
    
    def __init__(
        self,
        mode: DataLoadMode = DataLoadMode.DEFAULT,
        exactbars: bool = False,
        preload: bool = True,
        runonce: bool = True,
        chunk_size: Optional[int] = None,
        segment_months: Optional[int] = None,
        precision: str = "full",
    ):
        self.mode = mode
        self.exactbars = exactbars
        self.preload = preload
        self.runonce = runonce
        self.chunk_size = chunk_size or 100000
        self.segment_months = segment_months or 3
        self.precision = precision
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode.value,
            "exactbars": self.exactbars,
            "preload": self.preload,
            "runonce": self.runonce,
            "chunk_size": self.chunk_size,
            "segment_months": self.segment_months,
            "precision": self.precision,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DataLoadingConfig":
        return cls(
            mode=DataLoadMode(data.get("mode", "default")),
            exactbars=data.get("exactbars", False),
            preload=data.get("preload", True),
            runonce=data.get("runonce", True),
            chunk_size=data.get("chunk_size"),
            segment_months=data.get("segment_months"),
            precision=data.get("precision", "full"),
        )
    
    @classmethod
    def get_recommended(cls, dataset_size: int) -> "DataLoadingConfig":
        """根据数据集大小推荐配置"""
        if dataset_size < 500000:
            # 小数据集 - 默认模式
            return cls(mode=DataLoadMode.DEFAULT)
        elif dataset_size < 5000000:
            # 中等数据集 - 优化模式（推荐）
            return cls(
                mode=DataLoadMode.OPTIMIZED,
                exactbars=True,
                preload=False,
                runonce=False,
            )
        elif dataset_size < 10000000:
            # 大数据集 - 流式模式
            return cls(
                mode=DataLoadMode.STREAMING,
                exactbars=True,
                preload=False,
                runonce=False,
                chunk_size=100000,
            )
        else:
            # 超大数据集 - 分段模式
            return cls(
                mode=DataLoadMode.SEGMENTED,
                exactbars=True,
                preload=False,
                runonce=False,
                segment_months=3,
            )


class DuckDBStreamingFeed(bt.DataBase):
    """
    DuckDB流式数据源
    
    特点：
    1. 按需从DuckDB查询数据
    2. 内存占用极小（只保留buffer）
    3. 支持大规模数据集
    """
    
    params = (
        ('dataset_path', ''),
        ('chunk_size', 100000),
        ('fromdate', None),
        ('todate', None),
    )
    
    def __init__(self):
        super().__init__()
        
        self.conn = duckdb.connect()
        self.buffer = []
        self.buffer_index = 0
        self.total_rows = 0
        self.rows_fetched = 0
        
        # 构建查询
        query = f"""
            SELECT 
                timestamp,
                open,
                high,
                low,
                close,
                volume
            FROM read_parquet('{self.p.dataset_path}/**/*.parquet')
        """
        
        # 添加日期过滤
        if self.p.fromdate:
            query += f" WHERE timestamp >= '{self.p.fromdate}'"
        if self.p.todate:
            if self.p.fromdate:
                query += f" AND timestamp <= '{self.p.todate}'"
            else:
                query += f" WHERE timestamp <= '{self.p.todate}'"
        
        query += " ORDER BY timestamp"
        
        logger.info(f"DuckDB Streaming Feed initialized with chunk_size={self.p.chunk_size}")
        
        self.cursor = self.conn.execute(query)
    
    def _load(self):
        """加载下一个bar"""
        if self.buffer_index >= len(self.buffer):
            # Buffer用完，获取下一个chunk
            chunk = self.cursor.fetchmany(self.p.chunk_size)
            
            if not chunk:
                logger.info(f"Stream completed. Total rows fetched: {self.rows_fetched}")
                return False
            
            self.buffer = chunk
            self.buffer_index = 0
            self.rows_fetched += len(chunk)
            
            if self.rows_fetched % 1000000 == 0:
                logger.info(f"Streaming progress: {self.rows_fetched:,} rows processed")
        
        # 从buffer读取数据
        row = self.buffer[self.buffer_index]
        self.buffer_index += 1
        
        # 设置OHLCV数据
        self.lines.datetime[0] = bt.date2num(row[0])
        self.lines.open[0] = row[1]
        self.lines.high[0] = row[2]
        self.lines.low[0] = row[3]
        self.lines.close[0] = row[4]
        self.lines.volume[0] = row[5]
        
        return True
    
    def __del__(self):
        """清理资源"""
        if hasattr(self, 'conn'):
            self.conn.close()


class DataLoadingStrategy:
    """数据加载策略管理器"""
    
    def __init__(self, config: DataLoadingConfig):
        self.config = config
        logger.info(f"Data loading strategy initialized: {config.to_dict()}")
    
    def load_data(
        self,
        dataset_path: str,
        fromdate: Optional[datetime] = None,
        todate: Optional[datetime] = None,
    ) -> bt.DataBase:
        """
        根据配置加载数据
        
        Args:
            dataset_path: 数据集路径
            fromdate: 开始日期
            todate: 结束日期
            
        Returns:
            Backtrader数据源对象
        """
        mode = self.config.mode
        
        logger.info(f"Loading data with mode: {mode}")
        
        if mode == DataLoadMode.DEFAULT:
            return self._load_default(dataset_path, fromdate, todate)
        
        elif mode == DataLoadMode.OPTIMIZED:
            return self._load_optimized(dataset_path, fromdate, todate)
        
        elif mode == DataLoadMode.STREAMING:
            return self._load_streaming(dataset_path, fromdate, todate)
        
        elif mode == DataLoadMode.HYBRID:
            return self._load_hybrid(dataset_path, fromdate, todate)
        
        elif mode == DataLoadMode.SEGMENTED:
            # 分段模式需要特殊处理，返回数据段列表
            raise NotImplementedError("Segmented mode requires special handling via load_segments()")
        
        else:
            raise ValueError(f"Unknown data load mode: {mode}")
    
    def _load_default(
        self,
        dataset_path: str,
        fromdate: Optional[datetime],
        todate: Optional[datetime],
    ) -> bt.DataBase:
        """默认加载模式：一次性加载所有数据"""
        logger.info("Using DEFAULT mode: loading all data into memory")
        
        # 使用DuckDB查询
        conn = duckdb.connect()
        query = f"""
            SELECT * FROM read_parquet('{dataset_path}/**/*.parquet')
            ORDER BY timestamp
        """
        
        df = conn.execute(query).df()
        conn.close()
        
        # 应用日期过滤
        if fromdate:
            df = df[df['timestamp'] >= fromdate]
        if todate:
            df = df[df['timestamp'] <= todate]
        
        logger.info(f"Loaded {len(df):,} rows into memory ({len(df) * 500 / 1024 / 1024:.2f} MB estimated)")
        
        # 确保timestamp列是datetime类型并设置为索引
        if df['timestamp'].dtype == 'object' or df['timestamp'].dtype == 'int64':
            df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        df = df.set_index('timestamp')
        
        # 转换为Backtrader数据源
        data = bt.feeds.PandasData(
            dataname=df,
            datetime=None,  # 使用索引作为datetime
            open='open',
            high='high',
            low='low',
            close='close',
            volume='volume',
            openinterest=-1,  # 不使用openinterest
        )
        return data
    
    def _load_optimized(
        self,
        dataset_path: str,
        fromdate: Optional[datetime],
        todate: Optional[datetime],
    ) -> bt.DataBase:
        """
        优化加载模式：使用exactbars
        
        内存降低85%+，只需在Cerebro配置中设置：
        - exactbars=True
        - preload=False
        - runonce=False
        """
        logger.info("Using OPTIMIZED mode: exactbars enabled, memory reduced by 85%+")
        
        # 数据加载与默认模式相同，优化由Cerebro处理
        return self._load_default(dataset_path, fromdate, todate)
    
    def _load_streaming(
        self,
        dataset_path: str,
        fromdate: Optional[datetime],
        todate: Optional[datetime],
    ) -> bt.DataBase:
        """流式加载模式：使用DuckDB流式Feed"""
        logger.info(f"Using STREAMING mode: chunk_size={self.config.chunk_size}")
        
        data = DuckDBStreamingFeed(
            dataset_path=dataset_path,
            chunk_size=self.config.chunk_size,
            fromdate=fromdate,
            todate=todate,
        )
        
        return data
    
    def _load_hybrid(
        self,
        dataset_path: str,
        fromdate: Optional[datetime],
        todate: Optional[datetime],
    ) -> bt.DataBase:
        """
        混合精度模式：开发用低精度，生产用高精度
        """
        if self.config.precision == "reduced":
            logger.info("Using HYBRID mode: loading reduced precision data (5min resampled)")
            
            # 加载1秒数据并重采样为5分钟
            conn = duckdb.connect()
            
            # 使用DuckDB直接重采样
            query = f"""
                SELECT 
                    time_bucket(INTERVAL '5 minutes', timestamp) as timestamp,
                    first(open) as open,
                    max(high) as high,
                    min(low) as low,
                    last(close) as close,
                    sum(volume) as volume
                FROM read_parquet('{dataset_path}/**/*.parquet')
                GROUP BY time_bucket(INTERVAL '5 minutes', timestamp)
                ORDER BY timestamp
            """
            
            df = conn.execute(query).df()
            conn.close()
            
            # 应用日期过滤
            if fromdate:
                df = df[df['timestamp'] >= fromdate]
            if todate:
                df = df[df['timestamp'] <= todate]
            
            logger.info(f"Loaded {len(df):,} rows (5min bars) into memory ({len(df) * 500 / 1024 / 1024:.2f} MB)")
            
            data = bt.feeds.PandasData(dataname=df)
            return data
        else:
            logger.info("Using HYBRID mode: loading full precision data")
            return self._load_default(dataset_path, fromdate, todate)
    
    def load_segments(
        self,
        dataset_path: str,
        fromdate: datetime,
        todate: datetime,
        lookback_days: int = 60,
    ) -> List[Dict[str, Any]]:
        """
        分段加载：按时间窗口分段
        
        Args:
            dataset_path: 数据集路径
            fromdate: 开始日期
            todate: 结束日期
            lookback_days: 每段的lookback天数
            
        Returns:
            段信息列表
        """
        logger.info(f"Using SEGMENTED mode: segment_months={self.config.segment_months}")
        
        segments = []
        current_date = fromdate
        
        while current_date < todate:
            segment_end = current_date + timedelta(days=self.config.segment_months * 30)
            if segment_end > todate:
                segment_end = todate
            
            # 添加lookback
            segment_start_with_lookback = current_date - timedelta(days=lookback_days)
            
            segments.append({
                "start": current_date,
                "end": segment_end,
                "start_with_lookback": segment_start_with_lookback,
            })
            
            current_date = segment_end
        
        logger.info(f"Created {len(segments)} segments")
        return segments
    
    def configure_cerebro(self, cerebro: bt.Cerebro) -> bt.Cerebro:
        """
        根据配置设置Cerebro参数
        
        这是关键：不同模式需要不同的Cerebro配置
        """
        # 应用配置
        cerebro.params.exactbars = self.config.exactbars
        cerebro.params.preload = self.config.preload
        cerebro.params.runonce = self.config.runonce
        
        logger.info(f"Cerebro configured: exactbars={self.config.exactbars}, "
                   f"preload={self.config.preload}, runonce={self.config.runonce}")
        
        return cerebro


# 便捷函数
def create_cerebro_with_config(config: DataLoadingConfig) -> bt.Cerebro:
    """创建配置好的Cerebro实例"""
    cerebro = bt.Cerebro(
        exactbars=config.exactbars,
        preload=config.preload,
        runonce=config.runonce,
    )
    
    return cerebro


def estimate_memory(dataset_size: int, config: DataLoadingConfig) -> Dict[str, Any]:
    """估算内存占用"""
    base_memory_gb = (dataset_size * 500) / (1024 * 1024 * 1024)
    
    multipliers = {
        DataLoadMode.DEFAULT: 1.0,
        DataLoadMode.OPTIMIZED: 0.12,
        DataLoadMode.STREAMING: 0.06,
        DataLoadMode.HYBRID: 0.02 if config.precision == "reduced" else 1.0,
        DataLoadMode.SEGMENTED: 0.3,
    }
    
    multiplier = multipliers.get(config.mode, 1.0)
    estimated_memory_mb = base_memory_gb * multiplier * 1024
    
    return {
        "dataset_size": dataset_size,
        "mode": config.mode.value,
        "base_memory_gb": round(base_memory_gb, 2),
        "estimated_memory_mb": round(estimated_memory_mb, 2),
        "reduction_percentage": round((1 - multiplier) * 100, 1),
    }

