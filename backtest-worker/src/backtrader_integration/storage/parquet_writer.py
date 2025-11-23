# -*- coding: utf-8 -*-
"""
Parquet Writer - 回测结果数据写入工具

负责将回测数据（交易明细、权益曲线）保存为 Parquet 格式
"""

import os
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)


class ParquetWriter:
    """
    Parquet 文件写入器
    
    将回测结果数据保存为 Parquet 格式，用于高效存储和查询
    """
    
    def __init__(self, storage_base_path: str = None):
        """
        初始化 ParquetWriter
        
        Args:
            storage_base_path: 存储基础路径，默认为 backend/storage/backtest-results
        """
        if storage_base_path is None:
            # 默认路径：相对于项目根目录
            current_dir = Path(__file__).parent
            project_root = current_dir.parent.parent.parent.parent
            storage_base_path = project_root / 'backend' / 'storage' / 'backtest-results'
        
        self.storage_base_path = Path(storage_base_path)
        logger.info(f"ParquetWriter initialized with base path: {self.storage_base_path}")
    
    def save_trades(
        self,
        task_id: str,
        trades: List[Dict[str, Any]]
    ) -> str:
        """
        保存交易数据到 Parquet 文件
        
        Args:
            task_id: 任务ID
            trades: 交易数据列表
            
        Returns:
            相对文件路径
        """
        logger.info(f"Saving {len(trades)} trades for task {task_id}")
        
        try:
            # 创建任务目录
            task_dir = self._ensure_task_directory(task_id)
            
            # 生成文件名
            timestamp = int(datetime.now().timestamp() * 1000)
            file_name = f"trades_{timestamp}.parquet"
            file_path = task_dir / file_name
            
            # 转换为 DataFrame
            df = pd.DataFrame(trades)
            
            # 确保数据类型正确
            if len(df) > 0:
                # 时间字段转换为 datetime
                if 'entry_time' in df.columns:
                    df['entry_time'] = pd.to_datetime(df['entry_time'])
                if 'exit_time' in df.columns:
                    df['exit_time'] = pd.to_datetime(df['exit_time'])
                
                # 数值字段确保为 float
                numeric_cols = ['entry_price', 'exit_price', 'size', 'pnl', 'commission']
                for col in numeric_cols:
                    if col in df.columns:
                        df[col] = df[col].astype(float)
            
            # 写入 Parquet
            df.to_parquet(
                file_path,
                engine='pyarrow',
                compression='snappy',
                index=False
            )
            
            # 返回相对路径
            relative_path = str(file_path.relative_to(self.storage_base_path))
            logger.info(f"Trades saved to: {relative_path}")
            
            return relative_path
            
        except Exception as e:
            logger.error(f"Failed to save trades for task {task_id}: {e}")
            raise
    
    def save_equity_curve(
        self,
        task_id: str,
        equity_curve: List[Dict[str, Any]]
    ) -> str:
        """
        保存权益曲线到 Parquet 文件
        
        Args:
            task_id: 任务ID
            equity_curve: 权益曲线数据列表
            
        Returns:
            相对文件路径
        """
        logger.info(f"Saving {len(equity_curve)} equity points for task {task_id}")
        
        try:
            # 创建任务目录
            task_dir = self._ensure_task_directory(task_id)
            
            # 生成文件名
            timestamp = int(datetime.now().timestamp() * 1000)
            file_name = f"equity_{timestamp}.parquet"
            file_path = task_dir / file_name
            
            # 转换为 DataFrame
            df = pd.DataFrame(equity_curve)
            
            # 确保数据类型正确
            if len(df) > 0:
                # 时间字段转换为 datetime
                if 'datetime' in df.columns:
                    df['datetime'] = pd.to_datetime(df['datetime'])
                
                # 数值字段确保为 float
                numeric_cols = ['value', 'cash']
                for col in numeric_cols:
                    if col in df.columns:
                        df[col] = df[col].astype(float)
            
            # 写入 Parquet
            df.to_parquet(
                file_path,
                engine='pyarrow',
                compression='snappy',
                index=False
            )
            
            # 返回相对路径
            relative_path = str(file_path.relative_to(self.storage_base_path))
            logger.info(f"Equity curve saved to: {relative_path}")
            
            return relative_path
            
        except Exception as e:
            logger.error(f"Failed to save equity curve for task {task_id}: {e}")
            raise
    
    def save_factors(
        self,
        task_id: str,
        factors: List[Dict[str, Any]]
    ) -> str:
        """
        保存因子数据到 Parquet 文件
        
        Args:
            task_id: 任务ID
            factors: 因子数据列表
            
        Returns:
            相对文件路径
        """
        logger.info(f"Saving {len(factors)} factor records for task {task_id}")
        
        try:
            # 创建任务目录
            task_dir = self._ensure_task_directory(task_id)
            
            # 生成文件名
            timestamp = int(datetime.now().timestamp() * 1000)
            file_name = f"factors_{timestamp}.parquet"
            file_path = task_dir / file_name
            
            # 转换为 DataFrame
            df = pd.DataFrame(factors)
            
            # 写入 Parquet
            df.to_parquet(
                file_path,
                engine='pyarrow',
                compression='snappy',
                index=False
            )
            
            # 返回相对路径
            relative_path = str(file_path.relative_to(self.storage_base_path))
            logger.info(f"Factors saved to: {relative_path}")
            
            return relative_path
            
        except Exception as e:
            logger.error(f"Failed to save factors for task {task_id}: {e}")
            raise
    
    def _ensure_task_directory(self, task_id: str) -> Path:
        """
        确保任务目录存在
        
        Args:
            task_id: 任务ID
            
        Returns:
            任务目录路径
        """
        task_dir = self.storage_base_path / task_id
        task_dir.mkdir(parents=True, exist_ok=True)
        return task_dir
    
    def delete_task_files(self, task_id: str) -> None:
        """
        删除任务的所有文件
        
        Args:
            task_id: 任务ID
        """
        logger.info(f"Deleting files for task {task_id}")
        
        try:
            task_dir = self.storage_base_path / task_id
            
            if task_dir.exists():
                import shutil
                shutil.rmtree(task_dir)
                logger.info(f"Task files deleted: {task_dir}")
            else:
                logger.warning(f"Task directory not found: {task_dir}")
                
        except Exception as e:
            logger.error(f"Failed to delete task files for {task_id}: {e}")
            raise


def extract_trades_from_strategy(strategy) -> List[Dict[str, Any]]:
    """
    从策略中提取交易数据
    
    Args:
        strategy: Backtrader 策略实例
        
    Returns:
        交易数据列表
    """
    trades = []
    
    # 从 FactorCollector 中获取交易数据
    if hasattr(strategy, 'factor_collector') and strategy.factor_collector:
        trades_data = strategy.factor_collector.trades
        
        for trade in trades_data:
            # 转换为标准格式
            trade_dict = {
                'entry_time': trade.get('entry_time', ''),
                'entry_price': float(trade.get('entry_price', 0)),
                'exit_time': trade.get('exit_time', ''),
                'exit_price': float(trade.get('exit_price', 0)),
                'size': float(trade.get('size', 0)),
                'direction': trade.get('direction', 'long'),
                'pnl': float(trade.get('pnl', 0)),
                'commission': float(trade.get('commission', 0)),
            }
            
            # 添加因子数据
            if 'entry_factors' in trade:
                trade_dict['entry_factors'] = json.dumps(trade['entry_factors'])
            
            if 'holding_factors' in trade:
                trade_dict['holding_factors'] = json.dumps(trade['holding_factors'])
            
            if 'exit_factors' in trade:
                trade_dict['exit_factors'] = json.dumps(trade['exit_factors'])
            
            trades.append(trade_dict)
    
    logger.info(f"Extracted {len(trades)} trades from strategy")
    return trades


def extract_equity_curve_from_cerebro(cerebro) -> List[Dict[str, Any]]:
    """
    从 Cerebro 中提取权益曲线
    
    Args:
        cerebro: Backtrader Cerebro 实例
        
    Returns:
        权益曲线数据列表
    """
    equity_curve = []
    
    try:
        # 获取第一个策略
        strategy = cerebro.runstrats[0][0]
        
        # 从 Value observer 中提取数据
        if hasattr(strategy, '_observers'):
            for observer in strategy._observers:
                if observer.__class__.__name__ == 'Value':
                    # 提取权益曲线数据
                    for i in range(len(observer.array)):
                        value = observer.array[i]
                        
                        # 跳过 nan 值
                        if pd.isna(value):
                            continue
                        
                        # 获取对应的时间
                        if i < len(strategy.datas[0]):
                            dt = strategy.datas[0].datetime.datetime(ago=-i)
                            
                            equity_point = {
                                'datetime': dt.isoformat(),
                                'value': float(value),
                                'cash': float(cerebro.broker.get_cash())  # 简化处理
                            }
                            equity_curve.append(equity_point)
                    break
        
        logger.info(f"Extracted {len(equity_curve)} equity points from cerebro")
        
    except Exception as e:
        logger.error(f"Failed to extract equity curve: {e}")
        raise
    
    return equity_curve

