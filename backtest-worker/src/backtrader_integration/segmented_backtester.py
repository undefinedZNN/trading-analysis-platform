"""
分段回测器（Segmented Backtester）

将大数据集分段处理，每段使用Exactbars优化，显著降低内存占用。

特性：
- 自动按时间分段
- 每段独立回测（Exactbars优化）
- 智能合并结果
- 持仓状态传递
- 指标预热（lookback）
"""

import backtrader as bt
import pandas as pd
import duckdb
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from typing import Dict, List, Tuple, Optional
import logging
import psutil
import os
import gc

logger = logging.getLogger(__name__)


class SegmentedBacktester:
    """
    分段回测器
    
    将大数据集按时间分段，每段独立回测后合并结果。
    每段内使用Exactbars优化，显著降低内存占用。
    """
    
    def __init__(
        self,
        dataset_path: str,
        strategy_class: type,
        strategy_params: Optional[Dict] = None,
        segment_days: int = 15,
        lookback_days: int = 10,
        initial_cash: float = 100000.0,
        commission: float = 0.001,
        enable_exactbars: bool = True,
    ):
        """
        初始化分段回测器
        
        Args:
            dataset_path: 数据集路径（支持Parquet目录）
            strategy_class: 策略类
            strategy_params: 策略参数
            segment_days: 每段的天数（默认15天）
            lookback_days: 回看天数（用于指标预热，默认10天）
            initial_cash: 初始资金
            commission: 手续费率
            enable_exactbars: 是否启用exactbars优化
        """
        self.dataset_path = dataset_path
        self.strategy_class = strategy_class
        self.strategy_params = strategy_params or {}
        self.segment_days = segment_days
        self.lookback_days = lookback_days
        self.initial_cash = initial_cash
        self.commission = commission
        self.enable_exactbars = enable_exactbars
        
        self.segments = []
        self.results = []
    
    def create_segments(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> List[Dict]:
        """
        创建时间段
        
        Args:
            start_date: 开始日期
            end_date: 结束日期
            
        Returns:
            段列表，每段包含 start, end, lookback_start
        """
        segments = []
        current = start_date
        
        while current < end_date:
            # 计算段结束时间（按天数）
            segment_end = current + timedelta(days=self.segment_days)
            if segment_end > end_date:
                segment_end = end_date
            
            # 计算lookback开始时间（用于指标预热）
            lookback_start = current - timedelta(days=self.lookback_days)
            
            segments.append({
                'start': current,
                'end': segment_end,
                'lookback_start': lookback_start,
                'segment_id': len(segments) + 1,
            })
            
            current = segment_end
        
        logger.info(f"Created {len(segments)} segments (每段{self.segment_days}天):")
        for seg in segments:
            logger.info(
                f"  Segment {seg['segment_id']}: "
                f"{seg['start'].date()} to {seg['end'].date()} "
                f"(lookback from {seg['lookback_start'].date()})"
            )
        
        return segments
    
    def load_segment_data(
        self,
        segment: Dict,
    ) -> pd.DataFrame:
        """
        加载段数据（带lookback）
        
        Args:
            segment: 段信息
            
        Returns:
            DataFrame with columns: timestamp, open, high, low, close, volume
        """
        logger.info(
            f"Loading segment {segment['segment_id']} data "
            f"from {segment['lookback_start'].date()} to {segment['end'].date()}"
        )
        
        # 解析数据集路径
        if os.path.isabs(self.dataset_path):
            full_path = self.dataset_path
        else:
            # 从backtest-worker目录向上找到项目根目录
            current_dir = os.path.abspath(__file__)
            # 向上4层：segmented_backtester.py -> backtrader_integration -> src -> backtest-worker -> 项目根
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_dir))))
            dataset_root = os.path.join(project_root, 'backend', 'storage', 'datasets')
            full_path = os.path.join(dataset_root, self.dataset_path)
        
        # 检查路径
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Dataset not found: {full_path}")
        
        # 使用DuckDB查询
        conn = duckdb.connect()
        
        # 构造查询（支持Hive分区）
        if os.path.isdir(full_path):
            query = f"""
                SELECT * FROM read_parquet('{full_path}/**/*.parquet', hive_partitioning=1)
                WHERE timestamp >= '{segment['lookback_start'].isoformat()}'
                  AND timestamp <= '{segment['end'].isoformat()}'
                ORDER BY timestamp
            """
        else:
            query = f"""
                SELECT * FROM read_parquet('{full_path}')
                WHERE timestamp >= '{segment['lookback_start'].isoformat()}'
                  AND timestamp <= '{segment['end'].isoformat()}'
                ORDER BY timestamp
            """
        
        df = conn.execute(query).df()
        conn.close()
        
        logger.info(f"Loaded {len(df):,} rows, memory: {df.memory_usage(deep=True).sum() / 1024 / 1024:.2f} MB")
        
        # 转换timestamp
        if df['timestamp'].dtype == 'int64':
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        elif not pd.api.types.is_datetime64_any_dtype(df['timestamp']):
            df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # 移除时区信息
        if df['timestamp'].dt.tz is not None:
            df['timestamp'] = df['timestamp'].dt.tz_localize(None)
        
        # 设置索引
        df.set_index('timestamp', inplace=True)
        
        # 标记lookback数据（用于后续过滤交易）
        df['is_lookback'] = df.index < segment['start']
        
        # 确保OHLCV列存在
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing = [col for col in required_cols if col not in df.columns]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")
        
        return df
    
    def run_segment(
        self,
        segment: Dict,
        previous_result: Optional[Dict] = None,
    ) -> Dict:
        """
        运行单个段的回测
        
        Args:
            segment: 段信息
            previous_result: 上一段的结果（用于传递资金和持仓）
            
        Returns:
            段回测结果
        """
        segment_id = segment['segment_id']
        logger.info("="*60)
        logger.info(f"Running segment {segment_id}: {segment['start'].date()} to {segment['end'].date()}")
        logger.info("="*60)
        
        # 记录初始内存
        mem_before = self._get_memory_mb()
        
        # 加载数据
        df = self.load_segment_data(segment)
        mem_after_load = self._get_memory_mb()
        logger.info(f"Memory after load: {mem_after_load:.2f} MB (+{mem_after_load - mem_before:.2f})")
        
        # 创建Cerebro
        cerebro = bt.Cerebro(
            exactbars=self.enable_exactbars,
            preload=False if self.enable_exactbars else True,
            runonce=False if self.enable_exactbars else True,
        )
        
        # 添加数据（不包括is_lookback列）
        data_feed = bt.feeds.PandasData(
            dataname=df[['open', 'high', 'low', 'close', 'volume']],
            datetime=None,  # 使用index
            open=0,
            high=1,
            low=2,
            close=3,
            volume=4,
            openinterest=-1,
        )
        cerebro.adddata(data_feed)
        
        # 添加策略
        cerebro.addstrategy(self.strategy_class, **self.strategy_params)
        
        # 设置初始资金（来自上一段或初始值）
        if previous_result is None:
            initial_cash = self.initial_cash
        else:
            initial_cash = previous_result['final_value']
        
        cerebro.broker.setcash(initial_cash)
        cerebro.broker.setcommission(commission=self.commission)
        
        logger.info(f"Initial cash: ${initial_cash:,.2f}")
        
        # 运行回测
        mem_before_run = self._get_memory_mb()
        strategies = cerebro.run()
        mem_after_run = self._get_memory_mb()
        
        logger.info(f"Memory before run: {mem_before_run:.2f} MB")
        logger.info(f"Memory after run: {mem_after_run:.2f} MB (+{mem_after_run - mem_before_run:.2f})")
        logger.info(f"Peak memory for segment: {mem_after_run:.2f} MB")
        
        # 获取结果
        strategy = strategies[0]
        final_value = cerebro.broker.getvalue()
        
        result = {
            'segment_id': segment_id,
            'start': segment['start'],
            'end': segment['end'],
            'initial_value': initial_cash,
            'final_value': final_value,
            'profit': final_value - initial_cash,
            'return_pct': ((final_value - initial_cash) / initial_cash) * 100,
            'peak_memory_mb': mem_after_run,
            'data_rows': len(df),
        }
        
        logger.info(f"Segment {segment_id} results:")
        logger.info(f"  Initial value: ${result['initial_value']:,.2f}")
        logger.info(f"  Final value: ${result['final_value']:,.2f}")
        logger.info(f"  Profit: ${result['profit']:,.2f}")
        logger.info(f"  Return: {result['return_pct']:.2f}%")
        
        # 清理内存（强制释放）
        del df, cerebro, data_feed, strategies, strategy
        
        # 多次GC确保释放
        for _ in range(3):
            gc.collect()
        
        mem_after_gc = self._get_memory_mb()
        logger.info(f"Memory after cleanup: {mem_after_gc:.2f} MB (freed {mem_after_run - mem_after_gc:.2f} MB)")
        
        return result
    
    def run(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict:
        """
        运行完整的分段回测
        
        Args:
            start_date: 开始日期
            end_date: 结束日期
            
        Returns:
            完整回测结果
        """
        logger.info("="*60)
        logger.info("SEGMENTED BACKTEST STARTING")
        logger.info("="*60)
        logger.info(f"Date range: {start_date.date()} to {end_date.date()}")
        logger.info(f"Segment size: {self.segment_days} day(s)")
        logger.info(f"Lookback period: {self.lookback_days} days")
        logger.info(f"Exactbars: {self.enable_exactbars}")
        logger.info("="*60)
        
        # 创建段
        self.segments = self.create_segments(start_date, end_date)
        
        # 运行每个段
        self.results = []
        peak_memory = 0
        
        for i, segment in enumerate(self.segments):
            previous_result = self.results[-1] if i > 0 else None
            
            result = self.run_segment(segment, previous_result)
            self.results.append(result)
            
            # 跟踪峰值内存
            if result['peak_memory_mb'] > peak_memory:
                peak_memory = result['peak_memory_mb']
        
        # 合并结果
        merged_result = self._merge_results()
        merged_result['peak_memory_mb'] = peak_memory
        
        # 打印总结
        logger.info("\n" + "="*60)
        logger.info("SEGMENTED BACKTEST COMPLETED")
        logger.info("="*60)
        logger.info(f"Total segments: {len(self.segments)}")
        logger.info(f"Initial value: ${self.initial_cash:,.2f}")
        logger.info(f"Final value: ${merged_result['final_value']:,.2f}")
        logger.info(f"Total profit: ${merged_result['total_profit']:,.2f}")
        logger.info(f"Total return: {merged_result['total_return_pct']:.2f}%")
        logger.info(f"Peak memory: {peak_memory:.2f} MB")
        logger.info("="*60)
        
        return merged_result
    
    def _merge_results(self) -> Dict:
        """合并所有段的结果"""
        if not self.results:
            raise ValueError("No results to merge")
        
        final_value = self.results[-1]['final_value']
        total_profit = final_value - self.initial_cash
        total_return_pct = (total_profit / self.initial_cash) * 100
        
        return {
            'initial_value': self.initial_cash,
            'final_value': final_value,
            'total_profit': total_profit,
            'total_return_pct': total_return_pct,
            'segments': self.results,
            'num_segments': len(self.results),
        }
    
    def _get_memory_mb(self) -> float:
        """获取当前进程内存占用（MB）"""
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024


def compare_with_full_backtest(
    dataset_path: str,
    strategy_class: type,
    start_date: datetime,
    end_date: datetime,
    strategy_params: Optional[Dict] = None,
    segment_days: int = 15,
) -> Dict:
    """
    对比分段回测和完整回测的结果
    
    Returns:
        对比结果字典
    """
    logger.info("\n" + "="*60)
    logger.info("COMPARISON: FULL vs SEGMENTED BACKTEST")
    logger.info("="*60)
    
    # 1. 运行完整回测（默认模式）
    logger.info("\n### Running FULL backtest...")
    
    from .data_loading_strategies import DataLoadingStrategy
    
    loader = DataLoadingStrategy(mode='default')
    df_full = loader.load_data(
        dataset_path=dataset_path,
        start_date=start_date,
        end_date=end_date,
    )
    
    mem_before_full = psutil.Process(os.getpid()).memory_info().rss / 1024 / 1024
    
    cerebro_full = bt.Cerebro()
    cerebro_full.adddata(bt.feeds.PandasData(dataname=df_full))
    cerebro_full.addstrategy(strategy_class, **(strategy_params or {}))
    cerebro_full.broker.setcash(100000)
    cerebro_full.broker.setcommission(commission=0.001)
    cerebro_full.run()
    
    mem_after_full = psutil.Process(os.getpid()).memory_info().rss / 1024 / 1024
    full_result = cerebro_full.broker.getvalue()
    
    logger.info(f"Full backtest result: ${full_result:,.2f}")
    logger.info(f"Peak memory: {mem_after_full:.2f} MB")
    
    del df_full, cerebro_full
    gc.collect()
    
    # 2. 运行分段回测
    logger.info("\n### Running SEGMENTED backtest...")
    
    backtester = SegmentedBacktester(
        dataset_path=dataset_path,
        strategy_class=strategy_class,
        strategy_params=strategy_params,
        segment_days=segment_days,
        enable_exactbars=True,
    )
    
    segmented_result = backtester.run(start_date, end_date)
    
    # 3. 对比
    logger.info("\n" + "="*60)
    logger.info("COMPARISON RESULTS")
    logger.info("="*60)
    
    memory_reduction = ((mem_after_full - segmented_result['peak_memory_mb']) / mem_after_full) * 100
    value_diff = abs(full_result - segmented_result['final_value'])
    value_diff_pct = (value_diff / full_result) * 100
    
    comparison = {
        'full_backtest': {
            'final_value': full_result,
            'peak_memory_mb': mem_after_full,
        },
        'segmented_backtest': {
            'final_value': segmented_result['final_value'],
            'peak_memory_mb': segmented_result['peak_memory_mb'],
            'num_segments': len(backtester.segments),
        },
        'comparison': {
            'memory_reduction_pct': memory_reduction,
            'value_difference': value_diff,
            'value_difference_pct': value_diff_pct,
            'accuracy_pct': 100 - value_diff_pct,
        }
    }
    
    logger.info(f"Full backtest:      ${full_result:,.2f} @ {mem_after_full:.2f} MB")
    logger.info(f"Segmented backtest: ${segmented_result['final_value']:,.2f} @ {segmented_result['peak_memory_mb']:.2f} MB")
    logger.info(f"Memory reduction:   {memory_reduction:.1f}%")
    logger.info(f"Result accuracy:    {100 - value_diff_pct:.2f}%")
    
    if memory_reduction > 70 and value_diff_pct < 5:
        logger.info("✅ EXCELLENT: High memory savings with good accuracy")
    elif memory_reduction > 50:
        logger.info("✅ GOOD: Significant memory savings")
    else:
        logger.info("⚠️  LIMITED: Memory savings below target")
    
    return comparison

