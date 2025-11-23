# -*- coding: utf-8 -*-
"""
Backtest Completion Handler - 回测完成处理器

负责在回测完成后的后续处理：
1. 提取回测数据
2. 保存到 Parquet 文件
3. 更新任务文件路径
4. 通知 Backend 生成主结果
"""

import logging
from typing import Dict, Any, Optional
import requests
import os

from ..storage import (
    ParquetWriter,
    extract_trades_from_strategy,
    extract_equity_curve_from_cerebro,
)
from ..messaging import RabbitMQClient

logger = logging.getLogger(__name__)


class BacktestCompletionHandler:
    """
    回测完成处理器
    
    协调回测完成后的所有后续操作
    """
    
    def __init__(
        self,
        parquet_writer: ParquetWriter = None,
        rabbitmq_client: RabbitMQClient = None,
        backend_api_url: str = None,
    ):
        """
        初始化处理器
        
        Args:
            parquet_writer: Parquet 写入器实例
            rabbitmq_client: RabbitMQ 客户端实例
            backend_api_url: Backend API 地址
        """
        self.parquet_writer = parquet_writer or ParquetWriter()
        self.rabbitmq_client = rabbitmq_client
        
        # Backend API 地址
        if backend_api_url is None:
            backend_api_url = os.environ.get(
                'BACKEND_API_URL',
                'http://localhost:3000'
            )
        self.backend_api_url = backend_api_url.rstrip('/')
        
        logger.info(f"BacktestCompletionHandler initialized with backend: {self.backend_api_url}")
    
    async def handle_completion(
        self,
        task_id: str,
        strategy,
        cerebro,
        initial_cash: float = 100000.0,
    ) -> Dict[str, Any]:
        """
        处理回测完成
        
        Args:
            task_id: 任务ID
            strategy: Backtrader 策略实例
            cerebro: Backtrader Cerebro 实例
            initial_cash: 初始资金
            
        Returns:
            处理结果
        """
        logger.info(f"Handling backtest completion for task {task_id}")
        
        result = {
            'task_id': task_id,
            'success': False,
            'trades_file_path': None,
            'equity_file_path': None,
            'error': None,
        }
        
        try:
            # 1. 提取交易数据
            logger.info("Step 1: Extracting trades data")
            trades = extract_trades_from_strategy(strategy)
            logger.info(f"Extracted {len(trades)} trades")
            
            # 2. 提取权益曲线
            logger.info("Step 2: Extracting equity curve")
            equity_curve = extract_equity_curve_from_cerebro(cerebro)
            logger.info(f"Extracted {len(equity_curve)} equity points")
            
            # 3. 保存交易数据到 Parquet
            logger.info("Step 3: Saving trades to Parquet")
            trades_file_path = self.parquet_writer.save_trades(task_id, trades)
            result['trades_file_path'] = trades_file_path
            logger.info(f"Trades saved: {trades_file_path}")
            
            # 4. 保存权益曲线到 Parquet
            logger.info("Step 4: Saving equity curve to Parquet")
            equity_file_path = self.parquet_writer.save_equity_curve(task_id, equity_curve)
            result['equity_file_path'] = equity_file_path
            logger.info(f"Equity curve saved: {equity_file_path}")
            
            # 5. 更新任务文件路径
            logger.info("Step 5: Updating task file paths")
            await self._update_task_file_paths(
                task_id,
                trades_file_path,
                equity_file_path
            )
            logger.info("Task file paths updated")
            
            # 6. 通知 Backend 生成主结果
            logger.info("Step 6: Notifying backend to generate primary result")
            await self._notify_backend_to_generate_result(task_id)
            logger.info("Backend notified")
            
            # 7. 发送完成消息到 RabbitMQ
            if self.rabbitmq_client:
                logger.info("Step 7: Sending completion message to RabbitMQ")
                await self._send_completion_message(
                    task_id,
                    trades_file_path,
                    equity_file_path,
                    len(trades),
                    cerebro.broker.get_value(),
                    initial_cash,
                )
                logger.info("Completion message sent")
            
            result['success'] = True
            logger.info(f"Backtest completion handled successfully for task {task_id}")
            
        except Exception as e:
            logger.error(f"Failed to handle backtest completion for task {task_id}: {e}")
            result['error'] = str(e)
            raise
        
        return result
    
    async def _update_task_file_paths(
        self,
        task_id: str,
        trades_file_path: str,
        equity_file_path: str,
    ) -> None:
        """
        更新任务的文件路径
        
        Args:
            task_id: 任务ID
            trades_file_path: 交易文件路径
            equity_file_path: 权益曲线文件路径
        """
        try:
            # 调用 Backend API 更新任务
            url = f"{self.backend_api_url}/backtest/tasks/{task_id}/file-paths"
            
            payload = {
                'tradesFilePath': trades_file_path,
                'equityFilePath': equity_file_path,
            }
            
            response = requests.patch(url, json=payload, timeout=10)
            response.raise_for_status()
            
            logger.info(f"Task file paths updated via API: {url}")
            
        except Exception as e:
            logger.error(f"Failed to update task file paths: {e}")
            # 不抛出异常，因为这不是关键步骤
    
    async def _notify_backend_to_generate_result(self, task_id: str) -> None:
        """
        通知 Backend 生成主结果
        
        Args:
            task_id: 任务ID
        """
        try:
            if self.rabbitmq_client:
                # 通过 RabbitMQ 发送消息
                message = {
                    'taskId': task_id,
                    'timestamp': logger.time(),
                }
                
                await self.rabbitmq_client.send_message(
                    routing_key='result.primary.generate',
                    message=message,
                )
                
                logger.info(f"Sent result generation request via RabbitMQ for task {task_id}")
            else:
                # 直接调用 Backend API
                url = f"{self.backend_api_url}/backtest/tasks/{task_id}/generate-primary-result"
                
                response = requests.post(url, timeout=30)
                response.raise_for_status()
                
                logger.info(f"Triggered result generation via API: {url}")
                
        except Exception as e:
            logger.error(f"Failed to notify backend to generate result: {e}")
            # 不抛出异常，Backend 可以稍后手动触发
    
    async def _send_completion_message(
        self,
        task_id: str,
        trades_file_path: str,
        equity_file_path: str,
        trades_count: int,
        final_value: float,
        initial_cash: float,
    ) -> None:
        """
        发送回测完成消息到 RabbitMQ
        
        Args:
            task_id: 任务ID
            trades_file_path: 交易文件路径
            equity_file_path: 权益曲线文件路径
            trades_count: 交易数量
            final_value: 最终权益
            initial_cash: 初始资金
        """
        try:
            if not self.rabbitmq_client:
                return
            
            message = {
                'taskId': task_id,
                'status': 'completed',
                'tradesFilePath': trades_file_path,
                'equityFilePath': equity_file_path,
                'tradesCount': trades_count,
                'finalValue': final_value,
                'initialCash': initial_cash,
                'totalPnl': final_value - initial_cash,
                'totalReturnPct': ((final_value - initial_cash) / initial_cash) * 100,
                'timestamp': logger.time(),
            }
            
            await self.rabbitmq_client.send_message(
                routing_key='backtest.completed',
                message=message,
            )
            
            logger.info(f"Sent completion message to RabbitMQ for task {task_id}")
            
        except Exception as e:
            logger.error(f"Failed to send completion message: {e}")
            # 不抛出异常


# 便捷函数
async def handle_backtest_completion(
    task_id: str,
    strategy,
    cerebro,
    initial_cash: float = 100000.0,
    parquet_writer: ParquetWriter = None,
    rabbitmq_client: RabbitMQClient = None,
) -> Dict[str, Any]:
    """
    处理回测完成的便捷函数
    
    Args:
        task_id: 任务ID
        strategy: Backtrader 策略实例
        cerebro: Backtrader Cerebro 实例
        initial_cash: 初始资金
        parquet_writer: Parquet 写入器实例
        rabbitmq_client: RabbitMQ 客户端实例
        
    Returns:
        处理结果
    """
    handler = BacktestCompletionHandler(
        parquet_writer=parquet_writer,
        rabbitmq_client=rabbitmq_client,
    )
    
    return await handler.handle_completion(
        task_id,
        strategy,
        cerebro,
        initial_cash,
    )

