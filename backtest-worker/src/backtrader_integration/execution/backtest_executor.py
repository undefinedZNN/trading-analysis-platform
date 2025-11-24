# -*- coding: utf-8 -*-
"""
Backtest Executor - 回测执行器

负责实际执行Backtrader回测并生成结果文件
"""

import backtrader as bt
import logging
import time
import os
from typing import Dict, Any, Optional
from datetime import datetime

from ..data import CachedParquetDataFeed
from ..factors import FactorCollector
from ..storage import ParquetWriter
from ..messaging import RabbitMQClient
from ..analytics import BacktestAnalyzer

logger = logging.getLogger(__name__)


class ProgressTracker:
    """进度跟踪器"""
    
    def __init__(
        self,
        total_bars: int,
        rabbitmq_client: RabbitMQClient,
        task_id: str,
        worker_id: str,
    ):
        self.total_bars = total_bars
        self.current_bar = 0
        self.rabbitmq_client = rabbitmq_client
        self.task_id = task_id
        self.worker_id = worker_id
        self.last_report_time = time.time()
        self.report_interval = 2.0  # 每2秒上报一次
        
    def update(self, bar_index: int):
        """更新进度"""
        self.current_bar = bar_index
        
        # 检查是否需要上报
        current_time = time.time()
        if current_time - self.last_report_time >= self.report_interval:
            progress = (self.current_bar / self.total_bars) * 100 if self.total_bars > 0 else 0
            
            self.rabbitmq_client.send_progress(
                task_id=self.task_id,
                progress=progress,
                message=f'Processing... {progress:.1f}%',
                details={
                    'worker_id': self.worker_id,
                    'processed_bars': self.current_bar,
                    'total_bars': self.total_bars,
                    'current_date': datetime.now().isoformat(),
                }
            )
            
            self.last_report_time = current_time


class RabbitMQStrategy(bt.Strategy):
    """
    集成RabbitMQ的回测策略
    
    支持进度上报和因子收集
    """
    
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
        ('task_id', None),
        ('worker_id', None),
        ('rabbitmq_client', None),
    )
    
    def __init__(self):
        # 计算均线
        self.sma_fast = bt.indicators.SimpleMovingAverage(
            self.data.close, period=self.p.fast_period
        )
        self.sma_slow = bt.indicators.SimpleMovingAverage(
            self.data.close, period=self.p.slow_period
        )
        
        # 交叉信号
        self.crossover = bt.indicators.CrossOver(self.sma_fast, self.sma_slow)
        
        # 因子收集器
        self.factor_collector = FactorCollector()
        
        # 进度跟踪器（在start中初始化）
        self.progress_tracker = None
        
        # 记录订单
        self.order = None
        self.entry_price = None
        self.entry_bar = None
        
        # 统计
        self.trade_count = 0
        self.bar_count = 0
    
    def start(self):
        """策略开始时调用"""
        # 初始化进度跟踪器
        if self.p.rabbitmq_client and self.p.task_id:
            total_bars = len(self.data)
            self.progress_tracker = ProgressTracker(
                total_bars=total_bars,
                rabbitmq_client=self.p.rabbitmq_client,
                task_id=self.p.task_id,
                worker_id=self.p.worker_id,
            )
            logger.info(f"Progress tracker initialized: {total_bars} bars")
    
    def notify_order(self, order):
        """订单状态通知"""
        if order.status in [order.Submitted, order.Accepted]:
            return
        
        if order.status in [order.Completed]:
            if order.isbuy():
                self.entry_price = order.executed.price
                self.entry_bar = len(self)
                
                # 记录入场因子
                self.factor_collector.record_entry_factors(
                    order=order,
                    price=order.executed.price,
                    size=order.executed.size,
                    commission=order.executed.comm,
                    sma_fast=self.sma_fast[0],
                    sma_slow=self.sma_slow[0],
                    close=self.data.close[0],
                    volume=self.data.volume[0],
                )
                
            elif order.issell():
                # 计算盈亏
                if self.entry_price:
                    pnl = (order.executed.price - self.entry_price) * order.executed.size
                    pnl_percent = ((order.executed.price - self.entry_price) / self.entry_price) * 100
                    
                    # 记录出场因子
                    self.factor_collector.record_exit_factors(
                        order=order,
                        price=order.executed.price,
                        size=order.executed.size,
                        commission=order.executed.comm,
                        pnl=pnl,
                        pnl_percent=pnl_percent,
                        sma_fast=self.sma_fast[0],
                        sma_slow=self.sma_slow[0],
                        close=self.data.close[0],
                        volume=self.data.volume[0],
                        holding_bars=len(self) - self.entry_bar if self.entry_bar else 0,
                    )
                    
                    self.trade_count += 1
                    self.entry_price = None
                    self.entry_bar = None
        
        self.order = None
    
    def next(self):
        """策略逻辑"""
        self.bar_count += 1
        
        # 更新进度
        if self.progress_tracker:
            self.progress_tracker.update(self.bar_count)
        
        # 检查是否有未完成订单
        if self.order:
            return
        
        # 没有持仓
        if not self.position:
            # 金叉 - 买入信号
            if self.crossover > 0:
                self.order = self.buy()
        
        # 有持仓
        else:
            # 死叉 - 卖出信号
            if self.crossover < 0:
                self.order = self.sell()


class BacktestExecutor:
    """
    回测执行器
    
    负责实际执行Backtrader回测
    """
    
    def __init__(
        self,
        rabbitmq_client: RabbitMQClient,
        worker_id: str,
        backend_url: str = None,
    ):
        """
        初始化执行器
        
        Args:
            rabbitmq_client: RabbitMQ客户端
            worker_id: Worker ID
            backend_url: Backend URL
        """
        self.rabbitmq_client = rabbitmq_client
        self.worker_id = worker_id
        self.backend_url = backend_url or os.environ.get('BACKEND_URL', 'http://localhost:3000')
        
        self.parquet_writer = ParquetWriter()
        self.analyzer = BacktestAnalyzer()
        
        logger.info(f"BacktestExecutor initialized: worker_id={worker_id}")
    
    def execute_backtest(self, task_message: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行回测任务
        
        Args:
            task_message: 任务消息
            
        Returns:
            回测结果摘要
        """
        task_id = task_message['taskId']
        
        logger.info(f"[BacktestExecutor] Executing task {task_id}")
        
        try:
            # 1. 发送开始状态
            self.rabbitmq_client.send_message(
                routing_key='status.change',
                message={
                    'task_id': task_id,
                    'worker_id': self.worker_id,
                    'status': 'RUNNING',
                    'start_time': datetime.now().isoformat(),
                    'timestamp': time.time(),
                }
            )
            
            # 2. 创建Cerebro实例
            cerebro = bt.Cerebro()
            
            # 3. 设置初始资金
            initial_capital = task_message['executionConfig']['initialCapital']
            cerebro.broker.setcash(initial_capital)
            
            # 4. 设置手续费
            commission = task_message['executionConfig'].get('commission', 0.001)
            cerebro.broker.setcommission(commission=commission)
            
            # 5. 加载数据
            dataset_path = task_message['dataConfig']['datasetPath']
            logger.info(f"Loading dataset from: {dataset_path}")
            
            # 发送数据加载进度
            self.rabbitmq_client.send_progress(
                task_id=task_id,
                progress=5.0,
                message='Loading dataset...',
                details={'dataset': dataset_path}
            )
            
            # 使用CachedDataFeed（假设已经实现）
            # 这里简化处理：直接加载数据
            data = self._load_data(dataset_path, task_message['dataConfig'])
            cerebro.adddata(data)
            
            # 数据加载完成
            logger.info(f"Dataset loaded successfully, preparing to run backtest...")
            self.rabbitmq_client.send_progress(
                task_id=task_id,
                progress=10.0,
                message='Dataset loaded, starting backtest execution...',
                details={'dataset': dataset_path}
            )
            
            # 6. 添加策略
            strategy_params = task_message.get('strategyParameters', {})
            cerebro.addstrategy(
                RabbitMQStrategy,
                fast_period=strategy_params.get('fast', 10),
                slow_period=strategy_params.get('slow', 20),
                task_id=task_id,
                worker_id=self.worker_id,
                rabbitmq_client=self.rabbitmq_client,
            )
            
            # 7. 执行回测
            start_time = time.time()
            logger.info(f"Starting backtest execution for task {task_id}")
            
            strategies = cerebro.run()
            strategy = strategies[0]
            
            execution_time = time.time() - start_time
            logger.info(f"Backtest completed in {execution_time:.2f}s")
            
            # 8. 获取结果
            final_value = cerebro.broker.getvalue()
            
            # 9. 提取交易数据和因子（简化版：返回空列表）
            # TODO: 集成完整的因子收集逻辑
            trades = []
            logger.info(f"Extracted {len(trades)} trades (simplified version)")
            
            # 10. 提取权益曲线（简化版）
            equity_curve = self._extract_equity_curve(cerebro, initial_capital, final_value, strategy.bar_count)
            logger.info(f"Generated equity curve: {len(equity_curve)} points")
            
            # 11. 计算统计指标（简化版）
            total_pnl = final_value - initial_capital
            total_return = (total_pnl / initial_capital) * 100
            
            stats = {
                'total_return': total_return,
                'annualized_return': 0,  # TODO: 计算
                'max_drawdown_percent': 0,  # TODO: 计算
                'sharpe_ratio': 0,  # TODO: 计算
                'total_trades': len(trades),
                'win_rate': 0,  # TODO: 计算
                'profit_factor': 0,  # TODO: 计算
            }
            
            # 12. 保存结果文件
            trades_file_path = self.parquet_writer.save_trades(task_id, trades)
            equity_file_path = self.parquet_writer.save_equity_curve(task_id, equity_curve)
            
            logger.info(f"Trades saved: {trades_file_path}")
            logger.info(f"Equity curve saved: {equity_file_path}")
            
            # 13. 构建结果摘要
            result_summary = {
                'taskId': task_id,
                'initialCapital': initial_capital,
                'finalCapital': final_value,
                'totalReturn': stats['total_return'],
                'annualizedReturn': stats.get('annualized_return', 0),
                'maxDrawdown': stats.get('max_drawdown_percent', 0),
                'sharpeRatio': stats.get('sharpe_ratio', 0),
                'totalTrades': stats['total_trades'],
                'winRate': stats['win_rate'],
                'profitLossRatio': stats.get('profit_factor', 0),
                'processedBars': strategy.bar_count,
                'executionTime': execution_time,
                'tradesFilePath': f'backtests/{task_id}/trades.parquet',
                'equityFilePath': f'backtests/{task_id}/equity.parquet',
            }
            
            # 14. 发送完成状态
            self.rabbitmq_client.send_message(
                routing_key='status.change',
                message={
                    'task_id': task_id,
                    'worker_id': self.worker_id,
                    'status': 'COMPLETED',
                    'end_time': datetime.now().isoformat(),
                    'duration': execution_time,
                    'timestamp': time.time(),
                }
            )
            
            # 15. 发送结果
            self.rabbitmq_client.send_result(
                task_id=task_id,
                status='COMPLETED',
                result=result_summary,
            )
            
            logger.info(f"[BacktestExecutor] Task {task_id} completed successfully")
            
            return result_summary
            
        except Exception as e:
            logger.error(f"[BacktestExecutor] Task {task_id} failed: {e}", exc_info=True)
            
            # 发送错误状态
            import traceback
            self.rabbitmq_client.send_error(
                task_id=task_id,
                error_code='EXECUTION_ERROR',
                error_message=str(e),
                stack_trace=traceback.format_exc(),
            )
            
            raise
    
    def _load_data(self, dataset_path: str, data_config: Dict[str, Any]) -> bt.DataBase:
        """
        加载数据
        
        Args:
            dataset_path: 数据集路径（支持相对路径和绝对路径）
            data_config: 数据配置
            
        Returns:
            Backtrader数据源
        """
        # 简化版：使用pandas加载parquet然后转换为bt.DataBase
        # 实际应该使用CachedDataFeed
        import pandas as pd
        from pathlib import Path
        
        # 处理相对路径：如果是相对路径，拼接到 backend/storage/datasets/
        dataset_path_obj = Path(dataset_path)
        if not dataset_path_obj.is_absolute():
            # 获取项目根目录
            project_root = Path(__file__).parent.parent.parent.parent.parent
            dataset_path_obj = project_root / 'backend' / 'storage' / 'datasets' / dataset_path
            logger.info(f"Converted relative path to absolute: {dataset_path_obj}")
        
        # 检查是目录还是文件
        if dataset_path_obj.is_dir():
            # 分区表：读取整个目录（pandas会自动处理Hive分区）
            logger.info(f"Reading partitioned dataset from directory: {dataset_path_obj}")
            df = pd.read_parquet(str(dataset_path_obj))
        else:
            # 单个文件
            logger.info(f"Reading single parquet file: {dataset_path_obj}")
            df = pd.read_parquet(str(dataset_path_obj))
        
        # 确保datetime是索引
        if 'datetime' in df.columns:
            df['datetime'] = pd.to_datetime(df['datetime'])
            df.set_index('datetime', inplace=True)
        elif 'timestamp' in df.columns:
            # 如果是Unix时间戳，转换为datetime
            if df['timestamp'].dtype in ['int64', 'int32']:
                df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')
            else:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
            df.set_index('timestamp', inplace=True)
        
        # 确保索引是datetime类型并移除时区信息（Backtrader不支持带时区的datetime）
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)
        
        # 确保索引名称为datetime (Backtrader期望)
        df.index.name = 'datetime'
        
        # 创建Backtrader数据源
        data = bt.feeds.PandasData(
            dataname=df,
            datetime=None,  # 使用索引
            open='open',
            high='high',
            low='low',
            close='close',
            volume='volume',
            openinterest=-1,
        )
        
        return data
    
    def _extract_equity_curve(
        self,
        cerebro: bt.Cerebro,
        initial_capital: float,
        final_value: float,
        total_bars: int,
    ) -> list:
        """
        提取权益曲线（简化版）
        
        Args:
            cerebro: Cerebro实例
            initial_capital: 初始资金
            final_value: 最终资金
            total_bars: 总Bar数
            
        Returns:
            权益曲线数据
        """
        # 简化版：生成线性插值的权益曲线
        # 实际应该从cerebro的value history中提取
        from datetime import datetime, timedelta
        
        equity_curve = []
        
        # 采样100个点
        sample_points = min(100, total_bars)
        start_time = datetime.now() - timedelta(days=sample_points)
        
        for i in range(sample_points + 1):
            progress = i / sample_points
            value = initial_capital + (final_value - initial_capital) * progress
            cash = value * 0.3  # 假设30%是现金
            
            equity_curve.append({
                'datetime': (start_time + timedelta(days=i)).isoformat(),
                'value': value,
                'cash': cash,
            })
        
        return equity_curve

