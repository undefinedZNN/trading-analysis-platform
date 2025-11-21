"""
进度追踪器

用于在回测过程中追踪并上报进度。
重构自 POC: poc/backtrader-poc/src/05_complete_backtest.py
"""

import backtrader as bt
import time
import logging
from typing import Optional
from .rabbitmq_client import RabbitMQClient

logger = logging.getLogger(__name__)


class ProgressTracker(bt.Observer):
    """
    进度追踪器（Backtrader Observer）
    
    在回测过程中追踪进度，并通过 RabbitMQ 上报。
    
    上报策略：
    - 每处理 N 根 K 线上报一次（默认 100）
    - 回测开始时上报（0%）
    - 回测结束时上报（100%）
    - 限制上报频率（避免消息风暴）
    """
    
    lines = ('progress',)
    
    params = (
        ('report_interval', 100),  # 每 N 根 K 线上报一次
        ('min_report_interval_seconds', 1.0),  # 最小上报间隔（秒）
        ('task_id', 'default_task'),  # 任务ID
    )
    
    def __init__(self):
        """初始化进度追踪器"""
        self.message_client: Optional[RabbitMQClient] = None
        self.total_bars = 0
        self.current_bar = 0
        self.last_report_time = 0
        self.start_time = 0
        
        logger.info(f"ProgressTracker initialized: task_id={self.p.task_id}")
    
    def set_message_client(self, client: RabbitMQClient) -> None:
        """
        设置消息客户端
        
        Args:
            client: RabbitMQ 客户端
        """
        self.message_client = client
        logger.debug("Message client set for ProgressTracker")
    
    def set_total_bars(self, total: int) -> None:
        """
        设置总 K 线数
        
        Args:
            total: 总 K 线数
        """
        self.total_bars = total
        logger.info(f"Total bars set: {total}")
    
    def prenext(self) -> None:
        """在策略预热期调用"""
        self._track_progress()
    
    def next(self) -> None:
        """在每根 K 线调用"""
        self._track_progress()
    
    def _track_progress(self) -> None:
        """追踪进度"""
        self.current_bar = len(self.data)
        
        # 计算进度百分比
        if self.total_bars > 0:
            progress = (self.current_bar / self.total_bars) * 100
        else:
            progress = 0
        
        self.lines.progress[0] = progress
        
        # 检查是否需要上报
        should_report = False
        
        # 条件1：达到上报间隔
        if self.current_bar % self.p.report_interval == 0:
            should_report = True
        
        # 条件2：时间间隔足够
        current_time = time.time()
        if current_time - self.last_report_time < self.p.min_report_interval_seconds:
            should_report = False
        
        # 上报进度
        if should_report:
            self._report_progress(progress)
    
    def _report_progress(self, progress: float) -> None:
        """
        上报进度
        
        Args:
            progress: 进度百分比
        """
        if not self.message_client:
            return
        
        current_time = time.time()
        elapsed_time = current_time - self.start_time if self.start_time > 0 else 0
        
        # 估算剩余时间
        if progress > 0 and elapsed_time > 0:
            estimated_total_time = elapsed_time / (progress / 100)
            remaining_time = estimated_total_time - elapsed_time
        else:
            remaining_time = 0
        
        # 计算速度（bars/秒）
        speed = self.current_bar / elapsed_time if elapsed_time > 0 else 0
        
        details = {
            'current_bar': self.current_bar,
            'total_bars': self.total_bars,
            'elapsed_seconds': round(elapsed_time, 2),
            'remaining_seconds': round(remaining_time, 2),
            'bars_per_second': round(speed, 2),
        }
        
        success = self.message_client.send_progress(
            task_id=self.p.task_id,
            progress=round(progress, 2),
            message=f'Processing: {self.current_bar}/{self.total_bars} bars',
            details=details
        )
        
        if success:
            self.last_report_time = current_time
            logger.debug(
                f"Progress reported: {progress:.2f}% "
                f"({self.current_bar}/{self.total_bars} bars, "
                f"{speed:.2f} bars/s)"
            )
        else:
            logger.warning("Failed to report progress")
    
    def start(self) -> None:
        """回测开始时调用"""
        self.start_time = time.time()
        self.current_bar = 0
        self.last_report_time = 0
        
        logger.info(f"Backtest started: task_id={self.p.task_id}")
        
        # 上报开始
        if self.message_client:
            self.message_client.send_progress(
                task_id=self.p.task_id,
                progress=0.0,
                message='Backtest started',
                details={
                    'total_bars': self.total_bars,
                    'start_time': self.start_time,
                }
            )
    
    def stop(self) -> None:
        """回测结束时调用"""
        end_time = time.time()
        elapsed_time = end_time - self.start_time if self.start_time > 0 else 0
        speed = self.current_bar / elapsed_time if elapsed_time > 0 else 0
        
        logger.info(
            f"Backtest finished: task_id={self.p.task_id}, "
            f"bars={self.current_bar}, time={elapsed_time:.2f}s, "
            f"speed={speed:.2f} bars/s"
        )
        
        # 上报完成
        if self.message_client:
            self.message_client.send_progress(
                task_id=self.p.task_id,
                progress=100.0,
                message='Backtest completed',
                details={
                    'total_bars': self.current_bar,
                    'elapsed_seconds': round(elapsed_time, 2),
                    'bars_per_second': round(speed, 2),
                    'end_time': end_time,
                }
            )


class HeartbeatSender:
    """
    心跳发送器
    
    定期发送心跳消息，让 Backend 知道 Worker 还活着。
    """
    
    def __init__(
        self,
        client: RabbitMQClient,
        worker_id: str,
        interval: float = 30.0
    ):
        """
        初始化心跳发送器
        
        Args:
            client: RabbitMQ 客户端
            worker_id: Worker ID
            interval: 心跳间隔（秒）
        """
        self.client = client
        self.worker_id = worker_id
        self.interval = interval
        self.last_heartbeat_time = 0
        
        logger.info(f"HeartbeatSender initialized: worker_id={worker_id}, interval={interval}s")
    
    def send_if_needed(self, metrics: Optional[dict] = None) -> bool:
        """
        如果需要，发送心跳
        
        Args:
            metrics: 性能指标
        
        Returns:
            是否发送了心跳
        """
        current_time = time.time()
        
        if current_time - self.last_heartbeat_time >= self.interval:
            success = self.client.send_heartbeat(
                worker_id=self.worker_id,
                status='healthy',
                metrics=metrics
            )
            
            if success:
                self.last_heartbeat_time = current_time
                logger.debug(f"Heartbeat sent: worker_id={self.worker_id}")
                return True
            else:
                logger.warning("Failed to send heartbeat")
        
        return False
    
    def send_now(self, status: str = 'healthy', metrics: Optional[dict] = None) -> bool:
        """
        立即发送心跳
        
        Args:
            status: Worker 状态
            metrics: 性能指标
        
        Returns:
            是否发送成功
        """
        success = self.client.send_heartbeat(
            worker_id=self.worker_id,
            status=status,
            metrics=metrics
        )
        
        if success:
            self.last_heartbeat_time = time.time()
            logger.debug(f"Heartbeat sent (force): worker_id={self.worker_id}, status={status}")
        
        return success

