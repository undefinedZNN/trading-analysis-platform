"""
Checkpoint 管理器

用于保存和恢复回测状态，支持断点续跑。
重构自 POC: poc/backtrader-poc/src/06_checkpoint_resume.py
"""

import os
import pickle
import json
import time
import logging
from collections import deque
from concurrent.futures import ThreadPoolExecutor, Future
from typing import Dict, Any, Optional, List
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class CheckpointManager:
    """
    Checkpoint 管理器
    
    功能：
    - 保存回测状态到文件
    - 从文件恢复回测状态
    - 管理多个 Checkpoint
    - 自动清理旧 Checkpoint
    """
    
    def __init__(
        self,
        checkpoint_dir: str = './checkpoints',
        max_checkpoints: int = 5,
        task_id: str = 'default',
        async_write: bool = True,
        max_pending_writes: int = 2,
        worker_threads: int = 1,
    ):
        """
        初始化 Checkpoint 管理器
        
        Args:
            checkpoint_dir: Checkpoint 存储目录
            max_checkpoints: 最大保留的 Checkpoint 数量
            task_id: 任务ID（用于区分不同任务）
            async_write: 是否异步写入（降低阻塞，提升性能）
            max_pending_writes: 最大允许的未完成写任务数，超过后会阻塞等待
            worker_threads: 异步写线程数量（默认1，保持顺序和低开销）
        """
        self.checkpoint_dir = Path(checkpoint_dir)
        self.max_checkpoints = max_checkpoints
        self.task_id = task_id
        self.async_write = async_write
        self.max_pending_writes = max_pending_writes
        
        # 创建目录
        self.task_dir = self.checkpoint_dir / task_id
        self.task_dir.mkdir(parents=True, exist_ok=True)
        
        # 异步写入资源
        self._executor: Optional[ThreadPoolExecutor] = None
        self._pending: deque[Future] = deque()
        if self.async_write:
            self._executor = ThreadPoolExecutor(
                max_workers=max(1, worker_threads),
                thread_name_prefix=f"checkpoint-{task_id}",
            )
        
        logger.info(
            f"CheckpointManager initialized: dir={self.task_dir}, "
            f"max={max_checkpoints}, task_id={task_id}, "
            f"async_write={self.async_write}"
        )
    
    def save_checkpoint(
        self,
        current_bar: int,
        total_bars: int,
        strategy_state: Dict[str, Any],
        cerebro_state: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        保存 Checkpoint
        
        Args:
            current_bar: 当前 K 线索引
            total_bars: 总 K 线数
            strategy_state: 策略状态（持仓、订单、自定义变量等）
            cerebro_state: Cerebro 状态（可选）
            metadata: 额外的元数据（可选）
        
        Returns:
            Checkpoint 文件路径
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        checkpoint_name = f'checkpoint_{current_bar}_{timestamp}'
        checkpoint_path = self.task_dir / f'{checkpoint_name}.pkl'
        metadata_path = self.task_dir / f'{checkpoint_name}.json'
        
        try:
            checkpoint_data = self._build_checkpoint_data(
                current_bar=current_bar,
                total_bars=total_bars,
                strategy_state= strategy_state,
                cerebro_state=cerebro_state,
                timestamp=timestamp,
            )
            metadata_info = self._build_metadata(
                checkpoint_name=checkpoint_name,
                current_bar=current_bar,
                total_bars=total_bars,
                progress=checkpoint_data['progress'],
                timestamp=timestamp,
                extra_metadata=metadata,
                checkpoint_path=checkpoint_path,
            )

            if self.async_write and self._executor:
                self._throttle_pending()
                future = self._executor.submit(
                    self._write_checkpoint_files,
                    checkpoint_path,
                    metadata_path,
                    checkpoint_data,
                    metadata_info,
                )
                self._pending.append(future)
            else:
                self._write_checkpoint_files(
                    checkpoint_path,
                    metadata_path,
                    checkpoint_data,
                    metadata_info,
                )
            
        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}", exc_info=True)
            raise
        
        return str(checkpoint_path)
    
    def _build_checkpoint_data(
        self,
        current_bar: int,
        total_bars: int,
        strategy_state: Dict[str, Any],
        cerebro_state: Optional[Dict[str, Any]],
        timestamp: str,
    ) -> Dict[str, Any]:
        return {
            'version': '1.0',
            'task_id': self.task_id,
            'current_bar': current_bar,
            'total_bars': total_bars,
            'progress': (current_bar / total_bars * 100) if total_bars > 0 else 0,
            'strategy_state': strategy_state,
            'cerebro_state': cerebro_state,
            'timestamp': time.time(),
            'datetime': timestamp,
        }
    
    def _build_metadata(
        self,
        checkpoint_name: str,
        current_bar: int,
        total_bars: int,
        progress: float,
        timestamp: str,
        extra_metadata: Optional[Dict[str, Any]],
        checkpoint_path: Path,
    ) -> Dict[str, Any]:
        return {
            'task_id': self.task_id,
            'checkpoint_name': checkpoint_name,
            'current_bar': current_bar,
            'total_bars': total_bars,
            'progress': progress,
            'timestamp': timestamp,
            'file_size': None,  # 写入后更新
            'metadata': extra_metadata or {},
        }
    
    def _write_checkpoint_files(
        self,
        checkpoint_path: Path,
        metadata_path: Path,
        checkpoint_data: Dict[str, Any],
        metadata_info: Dict[str, Any],
    ) -> None:
        # 保存二进制数据（使用 pickle）
        with open(checkpoint_path, 'wb') as f:
            pickle.dump(checkpoint_data, f, protocol=pickle.HIGHEST_PROTOCOL)
        
        # 保存元数据（使用 JSON，方便查看）
        metadata_info['file_size'] = os.path.getsize(checkpoint_path)
        with open(metadata_path, 'w') as f:
            json.dump(metadata_info, f, indent=2, ensure_ascii=False)
        
        logger.info(
            f"Checkpoint saved: {checkpoint_path.stem}, "
            f"bar={checkpoint_data['current_bar']}/{checkpoint_data['total_bars']} "
            f"({checkpoint_data['progress']:.1f}%), "
            f"size={metadata_info['file_size']/1024:.1f}KB"
        )
        
        # 清理旧的 Checkpoint
        self._cleanup_old_checkpoints()
    
    def _throttle_pending(self) -> None:
        """控制未完成写任务数量，避免积压导致内存暴涨"""
        while self._pending and len(self._pending) >= self.max_pending_writes:
            future = self._pending.popleft()
            try:
                future.result(timeout=10)
            except Exception as e:
                logger.warning(f"Async checkpoint write failed: {e}")
    
    def close(self) -> None:
        """关闭异步线程池，等待未完成的写任务"""
        if self._executor:
            for future in list(self._pending):
                try:
                    future.result(timeout=10)
                except Exception as e:
                    logger.warning(f"Pending checkpoint write failed: {e}")
            self._executor.shutdown(wait=True)
    
    def load_checkpoint(self, checkpoint_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        加载 Checkpoint
        
        Args:
            checkpoint_name: Checkpoint 名称（不带扩展名）
                           如果为 None，则加载最新的 Checkpoint
        
        Returns:
            Checkpoint 数据，如果不存在则返回 None
        """
        try:
            if checkpoint_name:
                checkpoint_path = self.task_dir / f'{checkpoint_name}.pkl'
            else:
                # 查找最新的 Checkpoint
                checkpoint_path = self._find_latest_checkpoint()
            
            if not checkpoint_path or not checkpoint_path.exists():
                logger.warning(f"Checkpoint not found: {checkpoint_name or 'latest'}")
                return None
            
            # 加载数据
            with open(checkpoint_path, 'rb') as f:
                checkpoint_data = pickle.load(f)
            
            logger.info(
                f"Checkpoint loaded: {checkpoint_path.stem}, "
                f"bar={checkpoint_data['current_bar']}/{checkpoint_data['total_bars']} "
                f"({checkpoint_data['progress']:.1f}%)"
            )
            
            return checkpoint_data
            
        except Exception as e:
            logger.error(f"Failed to load checkpoint: {e}", exc_info=True)
            return None
    
    def list_checkpoints(self) -> List[Dict[str, Any]]:
        """
        列出所有 Checkpoint
        
        Returns:
            Checkpoint 列表（按时间倒序）
        """
        checkpoints = []
        
        try:
            # 查找所有 .json 元数据文件
            for metadata_path in self.task_dir.glob('*.json'):
                try:
                    with open(metadata_path, 'r') as f:
                        metadata = json.load(f)
                    checkpoints.append(metadata)
                except Exception as e:
                    logger.warning(f"Failed to read metadata: {metadata_path}, error={e}")
            
            # 按时间戳倒序排序
            checkpoints.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            logger.debug(f"Found {len(checkpoints)} checkpoints")
            
        except Exception as e:
            logger.error(f"Failed to list checkpoints: {e}", exc_info=True)
        
        return checkpoints
    
    def delete_checkpoint(self, checkpoint_name: str) -> bool:
        """
        删除指定的 Checkpoint
        
        Args:
            checkpoint_name: Checkpoint 名称（不带扩展名）
        
        Returns:
            是否删除成功
        """
        try:
            checkpoint_path = self.task_dir / f'{checkpoint_name}.pkl'
            metadata_path = self.task_dir / f'{checkpoint_name}.json'
            
            deleted = False
            
            if checkpoint_path.exists():
                checkpoint_path.unlink()
                deleted = True
            
            if metadata_path.exists():
                metadata_path.unlink()
                deleted = True
            
            if deleted:
                logger.info(f"Checkpoint deleted: {checkpoint_name}")
                return True
            else:
                logger.warning(f"Checkpoint not found: {checkpoint_name}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to delete checkpoint: {e}", exc_info=True)
            return False
    
    def clear_all_checkpoints(self) -> int:
        """
        清空所有 Checkpoint
        
        Returns:
            删除的 Checkpoint 数量
        """
        count = 0
        
        try:
            for checkpoint_path in self.task_dir.glob('checkpoint_*.pkl'):
                checkpoint_path.unlink()
                count += 1
            
            for metadata_path in self.task_dir.glob('checkpoint_*.json'):
                metadata_path.unlink()
            
            logger.info(f"All checkpoints cleared: {count} checkpoints deleted")
            
        except Exception as e:
            logger.error(f"Failed to clear checkpoints: {e}", exc_info=True)
        
        return count
    
    def _find_latest_checkpoint(self) -> Optional[Path]:
        """查找最新的 Checkpoint"""
        checkpoints = list(self.task_dir.glob('checkpoint_*.pkl'))
        
        if not checkpoints:
            return None
        
        # 按修改时间排序，返回最新的
        latest = max(checkpoints, key=lambda p: p.stat().st_mtime)
        return latest
    
    def _cleanup_old_checkpoints(self) -> None:
        """清理旧的 Checkpoint（保留最新的 N 个）"""
        if self.max_checkpoints <= 0:
            return
        
        try:
            # 获取所有 Checkpoint（按时间排序）
            checkpoints = list(self.task_dir.glob('checkpoint_*.pkl'))
            checkpoints.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            
            # 删除超出数量的 Checkpoint
            for old_checkpoint in checkpoints[self.max_checkpoints:]:
                try:
                    # 删除 .pkl 文件
                    old_checkpoint.unlink()
                    
                    # 删除对应的 .json 文件
                    metadata_path = old_checkpoint.with_suffix('.json')
                    if metadata_path.exists():
                        metadata_path.unlink()
                    
                    logger.debug(f"Old checkpoint deleted: {old_checkpoint.stem}")
                    
                except Exception as e:
                    logger.warning(f"Failed to delete old checkpoint: {e}")
            
        except Exception as e:
            logger.error(f"Failed to cleanup checkpoints: {e}", exc_info=True)


class CheckpointTrigger:
    """
    Checkpoint 触发器
    
    用于在回测过程中自动触发 Checkpoint 保存。
    """
    
    def __init__(
        self,
        manager: CheckpointManager,
        interval: int = 1000,
        min_interval_seconds: float = 60.0
    ):
        """
        初始化触发器
        
        Args:
            manager: CheckpointManager 实例
            interval: 触发间隔（K线数）
            min_interval_seconds: 最小时间间隔（秒）
        """
        self.manager = manager
        self.interval = interval
        self.min_interval_seconds = min_interval_seconds
        
        self.last_checkpoint_bar = 0
        self.last_checkpoint_time = 0.0
        
        logger.info(
            f"CheckpointTrigger initialized: interval={interval} bars, "
            f"min_time={min_interval_seconds}s"
        )
    
    def should_checkpoint(self, current_bar: int) -> bool:
        """
        判断是否应该保存 Checkpoint
        
        Args:
            current_bar: 当前 K 线索引
        
        Returns:
            是否应该保存
        """
        # 条件1：达到 K 线间隔
        bars_since_last = current_bar - self.last_checkpoint_bar
        if bars_since_last < self.interval:
            return False
        
        # 条件2：达到时间间隔
        current_time = time.time()
        time_since_last = current_time - self.last_checkpoint_time
        if time_since_last < self.min_interval_seconds:
            return False
        
        return True
    
    def mark_checkpoint_saved(self, current_bar: int) -> None:
        """
        标记 Checkpoint 已保存
        
        Args:
            current_bar: 当前 K 线索引
        """
        self.last_checkpoint_bar = current_bar
        self.last_checkpoint_time = time.time()
