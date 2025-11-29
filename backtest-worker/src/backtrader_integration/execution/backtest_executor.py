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
from ..segmented_backtester import SegmentedBacktester
from ..commission import CommissionManager
from ..dynamic_strategy_loader import (
    DynamicStrategyLoader,
    StrategyLoadError,
    StrategySyntaxError,
    StrategyValidationError,
    StrategySecurityError,
)

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
            
            logger.info(f"[ProgressTracker] Sending progress: {progress:.1f}% ({self.current_bar}/{self.total_bars})")
            
            success = self.rabbitmq_client.send_progress(
                task_id=self.task_id,
                worker_id=self.worker_id,  # 添加worker_id参数
                progress=progress,
                message=f'Processing... {progress:.1f}%',
                details={
                    'processed_bars': self.current_bar,
                    'total_bars': self.total_bars,
                    'current_date': datetime.now().isoformat(),
                }
            )
            
            if success:
                logger.info(f"[ProgressTracker] Progress sent successfully")
            else:
                logger.warning(f"[ProgressTracker] Failed to send progress")
            
            self.last_report_time = current_time


class RabbitMQStrategy(bt.Strategy):
    """
    集成RabbitMQ的多周期回测策略
    
    支持：
    - 多周期数据：基于高周期计算指标，使用1秒数据精确成交
    - 进度上报和因子收集
    """
    
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
        ('task_id', None),
        ('worker_id', None),
        ('rabbitmq_client', None),
        ('strategy_timeframe', '5m'),  # 策略信号周期
        ('total_bars', 0),  # 数据总行数
    )
    
    def __init__(self):
        # 数据引用
        self.data_1s = self.datas[0]  # 1秒数据（用于精确成交）
        
        # 如果有重采样数据，使用它计算指标；否则使用1秒数据
        if len(self.datas) > 1:
            self.signal_data = self.datas[1]  # 重采样后的数据（如5分钟）
            logger.info(f"Using multi-timeframe: 1s for execution, {self.p.strategy_timeframe} for signals")
        else:
            self.signal_data = self.data_1s  # 只有1秒数据
            logger.info(f"Using single timeframe: 1s for both signals and execution")
        
        # 基于信号数据计算均线
        self.sma_fast = bt.indicators.SimpleMovingAverage(
            self.signal_data.close, period=self.p.fast_period
        )
        self.sma_slow = bt.indicators.SimpleMovingAverage(
            self.signal_data.close, period=self.p.slow_period
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
        
        # 多周期跟踪
        self.last_signal_len = 0  # 用于检测信号数据新Bar
    
    def start(self):
        """策略开始时调用"""
        # 设置 FactorCollector 的策略引用（重要！）
        self.factor_collector.set_strategy(self)
        logger.info("FactorCollector strategy reference set")
        
        # 🔍 调试：记录初始状态
        logger.info(f"[Strategy] Initialization:")
        logger.info(f"[Strategy]   - Fast period: {self.p.fast_period}, Slow period: {self.p.slow_period}")
        logger.info(f"[Strategy]   - Signal timeframe: {self.p.strategy_timeframe}")
        logger.info(f"[Strategy]   - Number of data feeds: {len(self.datas)}")
        logger.info(f"[Strategy]   - Data feed 0 (1s): {len(self.data_1s) if hasattr(self.data_1s, '__len__') else 'N/A'}")
        if len(self.datas) > 1:
            logger.info(f"[Strategy]   - Data feed 1 (signal): {len(self.signal_data) if hasattr(self.signal_data, '__len__') else 'N/A'}")
        logger.info(f"[Strategy]   - Initial cash: {self.broker.get_cash():.2f}")
        logger.info(f"[Strategy]   - FactorCollector: {self.factor_collector}")
        
        # 初始化进度跟踪器（基于1秒数据）
        if self.p.rabbitmq_client and self.p.task_id:
            total_bars = self.p.total_bars if self.p.total_bars > 0 else len(self.data_1s)
            self.progress_tracker = ProgressTracker(
                total_bars=total_bars,
                rabbitmq_client=self.p.rabbitmq_client,
                task_id=self.p.task_id,
                worker_id=self.p.worker_id,
            )
            logger.info(f"[Strategy] Progress tracker initialized: {total_bars} bars")
            
            # 初始化信号数据长度
            self.last_signal_len = 0
    
    def notify_order(self, order):
        """订单状态通知"""
        if order.status in [order.Submitted, order.Accepted]:
            logger.debug(f"[Order] Status: {order.status}, ref={order.ref}")
            return
        
        if order.status in [order.Completed]:
            if order.isbuy():
                logger.info(f"[Order] BUY COMPLETED: ref={order.ref}, price={order.executed.price:.2f}, "
                           f"size={order.executed.size}, comm={order.executed.comm:.2f}")
                
                # 判断是开多仓还是平空仓
                # 如果之前没有持仓，则是开多仓；如果之前有负持仓，则是平空仓
                is_entry = (self.entry_price is None)
                
                if is_entry:
                    # 开多仓
                    self.entry_price = order.executed.price
                    self.entry_bar = len(self)
                    
                    # 记录入场因子（做多）
                    logger.debug(f"[FactorCollector] Recording entry factors for LONG order {order.ref}")
                    self.factor_collector.record_entry_factors(
                        order=order,
                        price=order.executed.price,
                        size=order.executed.size,
                        commission=order.executed.comm,
                        direction='long',  # 明确指定做多
                        sma_fast=self.sma_fast[0],
                        sma_slow=self.sma_slow[0],
                        close=self.data_1s.close[0],
                        volume=self.data_1s.volume[0],
                    )
                    logger.info(f"[FactorCollector] LONG entry recorded. Total trades: {self.factor_collector.get_trades_count()}")
                else:
                    # 平空仓，处理出场
                    logger.info(f"[Order] Closing SHORT position")
                    self._handle_exit_order(order)
                
            elif order.issell():
                logger.info(f"[Order] SELL COMPLETED: ref={order.ref}, price={order.executed.price:.2f}, "
                           f"size={order.executed.size}, comm={order.executed.comm:.2f}")
                
                # 判断是开空仓还是平多仓
                # 如果之前没有持仓，则是开空仓；如果之前有正持仓，则是平多仓
                is_entry = (self.entry_price is None)
                
                if is_entry:
                    # 开空仓
                    self.entry_price = order.executed.price
                    self.entry_bar = len(self)
                    
                    # 记录入场因子（做空）
                    logger.debug(f"[FactorCollector] Recording entry factors for SHORT order {order.ref}")
                    self.factor_collector.record_entry_factors(
                        order=order,
                        price=order.executed.price,
                        size=order.executed.size,
                        commission=order.executed.comm,
                        direction='short',  # 明确指定做空
                        sma_fast=self.sma_fast[0],
                        sma_slow=self.sma_slow[0],
                        close=self.data_1s.close[0],
                        volume=self.data_1s.volume[0],
                    )
                    logger.info(f"[FactorCollector] SHORT entry recorded. Total trades: {self.factor_collector.get_trades_count()}")
                else:
                    # 平多仓，处理出场
                    logger.info(f"[Order] Closing LONG position")
                    self._handle_exit_order(order)
        
        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            logger.warning(f"[Order] {order.status}: ref={order.ref}")
        
        self.order = None
    
    def _handle_exit_order(self, order):
        """处理出场订单"""
        # 计算盈亏
        if self.entry_price:
            # ✅ 修复：使用 position.size 的绝对值（持仓数量）
            # 而不是 order.executed.size（卖出时为负）
            position_size = abs(order.executed.size)
            price_diff = order.executed.price - self.entry_price
            
            # ✅ 修复：考虑合约乘数（通过 broker 的 comminfo 获取）
            # 注意：pnl 应该已经包含了合约乘数的计算
            # 但这里我们手动计算以确保正确性
            comminfo = self.broker.getcommissioninfo(self.data_1s)
            multiplier = comminfo.p.mult if hasattr(comminfo.p, 'mult') else 1
            
            # 计算净盈亏（考虑合约乘数但不含佣金）
            pnl = price_diff * position_size * multiplier
            pnl_percent = (price_diff / self.entry_price) * 100
            holding_bars = len(self) - self.entry_bar if self.entry_bar else 0
            
            logger.info(f"[Trade] PNL: ${pnl:.2f} ({pnl_percent:.2f}%), holding: {holding_bars} bars, multiplier: {multiplier}")
            
            # 记录出场因子（使用1秒数据的指标和成交量）
            # FactorCollector会从order对象获取price/size/commission
            logger.debug(f"[FactorCollector] Recording exit factors for order {order.ref}")
            self.factor_collector.record_exit_factors(
                order=order,
                pnl=pnl,
                pnl_percent=pnl_percent,
                holding_bars=holding_bars,
                sma_fast=self.sma_fast[0],
                sma_slow=self.sma_slow[0],
                close=self.data_1s.close[0],
                volume=self.data_1s.volume[0],
            )
            
            self.trade_count += 1
            logger.info(f"[FactorCollector] Exit recorded. Total trades: {self.factor_collector.get_trades_count()}")
            
            self.entry_price = None
            self.entry_bar = None
        else:
            logger.warning(f"[Order] Exit order {order.ref} completed but no entry_price found")
    
    def next(self):
        """策略逻辑（每1秒调用一次）"""
        self.bar_count += 1
        
        # 每10000条bar输出一次日志（避免日志过多）
        if self.bar_count % 10000 == 0:
            logger.info(f"Processing bar {self.bar_count}/{self.p.total_bars} ({(self.bar_count/self.p.total_bars*100):.1f}%)")
        
        # 更新进度
        if self.progress_tracker:
            self.progress_tracker.update(self.bar_count)
        
        # 检查信号数据是否有新Bar（多周期模式）
        current_signal_len = len(self.signal_data)
        is_new_signal_bar = current_signal_len > self.last_signal_len
        
        # 🔍 调试：每100个信号bar打印一次状态
        if is_new_signal_bar and current_signal_len % 100 == 0:
            logger.info(f"[DEBUG] Signal bar {current_signal_len}: "
                       f"SMA_fast={self.sma_fast[0]:.2f}, "
                       f"SMA_slow={self.sma_slow[0]:.2f}, "
                       f"CrossOver={self.crossover[0]}, "
                       f"Position={self.position.size if self.position else 0}")
        
        if is_new_signal_bar:
            self.last_signal_len = current_signal_len
            
            # 🔍 调试：前20个信号bar详细记录
            if current_signal_len <= 20:
                logger.info(f"[DEBUG] New signal bar #{current_signal_len}: "
                           f"fast={self.sma_fast[0]:.2f}, slow={self.sma_slow[0]:.2f}, "
                           f"cross={self.crossover[0]}, has_SMA={len(self.signal_data) >= self.p.slow_period}")
            
            # 信号周期新Bar，检查交易信号
            self._check_trading_signals()
    
    def _check_trading_signals(self):
        """检查交易信号（仅在信号周期新Bar时调用）"""
        # 检查是否有未完成订单
        if self.order:
            logger.debug(f"[Signal] Skipping: pending order {self.order.ref}")
            return
        
        # 等待指标计算完成
        signal_len = len(self.signal_data)
        if signal_len < self.p.slow_period:
            if signal_len <= self.p.slow_period + 5:  # 前几个bar打印
                logger.info(f"[Signal] Warmup: {signal_len}/{self.p.slow_period} bars (need {self.p.slow_period - signal_len} more)")
            return
        
        # 🔍 详细日志：每20个信号bar打印一次状态
        if signal_len % 20 == 0:
            logger.info(f"[Signal] Bar {signal_len}: fast={self.sma_fast[0]:.2f}, slow={self.sma_slow[0]:.2f}, "
                       f"cross={self.crossover[0]}, pos={self.position.size if self.position else 0}")
        
        # 检查持仓状态
        has_position = self.position and self.position.size != 0
        
        # 没有持仓
        if not has_position:
            # 金叉 - 买入信号
            if self.crossover > 0:
                # 使用1秒数据的当前价格下单
                current_price = self.data_1s.close[0]
                cash = self.broker.get_cash()
                logger.info(f"[SIGNAL] 🔵 BUY at bar {signal_len}: "
                           f"fast={self.sma_fast[0]:.2f}, slow={self.sma_slow[0]:.2f}, "
                           f"price={current_price:.2f}, cash={cash:.2f}")
                self.order = self.buy()
                if self.order:
                    logger.info(f"[ORDER] Buy order created: ref={self.order.ref}")
                else:
                    logger.warning(f"[ORDER] Failed to create buy order! Cash={cash:.2f}")
        
        # 有持仓
        else:
            # 死叉 - 卖出信号
            if self.crossover < 0:
                current_price = self.data_1s.close[0]
                logger.info(f"[SIGNAL] 🔴 SELL at bar {signal_len}: "
                           f"fast={self.sma_fast[0]:.2f}, slow={self.sma_slow[0]:.2f}, "
                           f"price={current_price:.2f}, position={self.position.size}")
                self.order = self.sell()
                if self.order:
                    logger.info(f"[ORDER] Sell order created: ref={self.order.ref}")
                else:
                    logger.warning(f"[ORDER] Failed to create sell order!")


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
        self.commission_manager = CommissionManager()
        
        # 动态策略加载器
        self.strategy_loader = DynamicStrategyLoader(
            enable_cache=True,
            cache_size=100,
            enable_security_check=True,
            load_timeout=5,
        )
        
        logger.info(f"BacktestExecutor initialized: worker_id={worker_id}, strategy_loader enabled")
    
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
            
            # 2. 检查是否启用分段回测（内存优化）
            memory_opt = task_message.get('dataConfig', {}).get('memoryOptimization', {})
            enable_segmented = memory_opt.get('enableSegmented', False)
            
            if enable_segmented:
                logger.info(f"[BacktestExecutor] Using SEGMENTED backtest mode for memory optimization")
                return self._execute_segmented_backtest(task_message, memory_opt)
            else:
                logger.info(f"[BacktestExecutor] Using STANDARD backtest mode")
                return self._execute_standard_backtest(task_message)
                
        except Exception as e:
            logger.error(f"Failed to execute backtest for task {task_id}: {e}", exc_info=True)
            # 发送错误状态
            self.rabbitmq_client.send_message(
                routing_key='error',
                message={
                    'task_id': task_id,
                    'worker_id': self.worker_id,
                    'error': str(e),
                    'timestamp': time.time(),
                }
            )
            raise
    
    def _execute_standard_backtest(self, task_message: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行标准回测（完整数据加载）
        
        Args:
            task_message: 任务消息
            
        Returns:
            回测结果摘要
        """
        task_id = task_message['taskId']
        
        try:
            # 2. 创建Cerebro实例
            cerebro = bt.Cerebro()
            
            # 3. 提取执行配置
            initial_capital = task_message['executionConfig']['initialCapital']
            
            # 4. 配置Broker（初始资金、佣金、保证金等）
            # 使用 CommissionManager 根据资产类型自动配置
            self.commission_manager.setup_broker(cerebro, task_message['executionConfig'])
            logger.info(
                f"Broker configured: initial_capital={initial_capital}, "
                f"assetType={task_message['executionConfig'].get('assetType')}, "
                f"commission={task_message['executionConfig'].get('commission', {}).get('type')}"
            )
            
            # 5. 加载数据（始终加载1秒数据）
            dataset_path = task_message['dataConfig']['datasetPath']
            strategy_timeframe = task_message['dataConfig'].get('timeframe', '5m')
            logger.info(f"Loading dataset from: {dataset_path}")
            logger.info(f"Strategy timeframe: {strategy_timeframe}")
            
            # 发送数据加载进度
            self.rabbitmq_client.send_progress(
                task_id=task_id,
                worker_id=self.worker_id,  # 添加worker_id
                progress=5.0,
                message='Loading 1-second data...',
                details={'dataset': dataset_path, 'strategy_timeframe': strategy_timeframe}
            )
            
            # 加载1秒数据（基础数据）
            data_1s, data_length_1s = self._load_data(dataset_path, task_message['dataConfig'])
            cerebro.adddata(data_1s, name='1s')
            logger.info(f"1-second data loaded: {data_length_1s} bars")
            
            # 根据策略周期重采样
            timeframe_map = {
                '1s': None,  # 不需要重采样
                '5s': (bt.TimeFrame.Seconds, 5),
                '15s': (bt.TimeFrame.Seconds, 15),
                '30s': (bt.TimeFrame.Seconds, 30),
                '1m': (bt.TimeFrame.Minutes, 1),
                '5m': (bt.TimeFrame.Minutes, 5),
                '15m': (bt.TimeFrame.Minutes, 15),
                '30m': (bt.TimeFrame.Minutes, 30),
                '1h': (bt.TimeFrame.Minutes, 60),
                '4h': (bt.TimeFrame.Minutes, 240),
                '1d': (bt.TimeFrame.Days, 1),
            }
            
            if strategy_timeframe != '1s' and strategy_timeframe in timeframe_map:
                tf, compression = timeframe_map[strategy_timeframe]
                logger.info(f"Resampling to {strategy_timeframe} (timeframe={tf}, compression={compression})")
                cerebro.resampledata(
                    data_1s,
                    timeframe=tf,
                    compression=compression,
                    name=strategy_timeframe
                )
                logger.info(f"Resampled data added: {strategy_timeframe}")
            
            # 数据加载完成
            logger.info(f"Dataset loaded successfully, preparing to run backtest...")
            self.rabbitmq_client.send_progress(
                task_id=task_id,
                worker_id=self.worker_id,  # 添加worker_id
                progress=10.0,
                message=f'Dataset loaded, using {strategy_timeframe} signals with 1s execution...',
                details={'dataset': dataset_path, 'timeframe': strategy_timeframe}
            )
            
            # 6. 添加策略（动态加载或使用默认策略）
            strategy_code = task_message.get('strategyCode')
            strategy_id = task_message.get('strategyId')
            strategy_params = task_message.get('strategyParameters', {})
            
            if strategy_code and strategy_id:
                # 动态加载用户策略
                try:
                    logger.info(f"Loading user strategy: {strategy_id}")
                    
                    StrategyClass = self.strategy_loader.load_strategy(
                        strategy_code=strategy_code,
                        strategy_id=strategy_id,
                        class_name='Strategy',  # 期望的导出名
                        validate=True,
                    )
                    
                    # 添加到 Cerebro
                    # 注意：用户策略可能不接受 task_id, worker_id 等参数
                    # 只传递 strategyParameters 中定义的参数
                    cerebro.addstrategy(
                        StrategyClass,
                        **strategy_params  # 只传递用户参数
                    )
                    
                    # 🔥 重要：添加 FactorCollector（用于收集交易数据）
                    cerebro.addobserver(FactorCollector)
                    
                    logger.info(f"User strategy loaded: {StrategyClass.__name__}")
                    
                    # 发送进度
                    self.rabbitmq_client.send_progress(
                        task_id=task_id,
                        worker_id=self.worker_id,
                        progress=12.0,
                        message=f'User strategy loaded: {StrategyClass.__name__}',
                        details={'strategy_id': strategy_id, 'strategy_class': StrategyClass.__name__}
                    )
                    
                except StrategySyntaxError as e:
                    error_msg = f'策略代码语法错误: {str(e)}'
                    logger.error(f"Failed to load user strategy: {error_msg}")
                    self.rabbitmq_client.send_message(
                        routing_key='error',
                        message={
                            'taskId': task_id,
                            'workerId': self.worker_id,
                            'error': error_msg,
                            'errorType': 'strategy_syntax_error',
                            'timestamp': time.time(),
                        }
                    )
                    raise ValueError(error_msg)
                    
                except StrategyValidationError as e:
                    error_msg = f'策略验证失败: {str(e)}'
                    logger.error(f"Failed to load user strategy: {error_msg}")
                    self.rabbitmq_client.send_message(
                        routing_key='error',
                        message={
                            'taskId': task_id,
                            'workerId': self.worker_id,
                            'error': error_msg,
                            'errorType': 'strategy_validation_error',
                            'timestamp': time.time(),
                        }
                    )
                    raise ValueError(error_msg)
                    
                except StrategySecurityError as e:
                    error_msg = f'策略安全检查失败: {str(e)}'
                    logger.error(f"Failed to load user strategy: {error_msg}")
                    self.rabbitmq_client.send_message(
                        routing_key='error',
                        message={
                            'taskId': task_id,
                            'workerId': self.worker_id,
                            'error': error_msg,
                            'errorType': 'strategy_security_error',
                            'timestamp': time.time(),
                        }
                    )
                    raise ValueError(error_msg)
                    
                except Exception as e:
                    error_msg = f'策略加载失败: {str(e)}'
                    logger.error(f"Failed to load user strategy: {error_msg}", exc_info=True)
                    self.rabbitmq_client.send_message(
                        routing_key='error',
                        message={
                            'taskId': task_id,
                            'workerId': self.worker_id,
                            'error': error_msg,
                            'errorType': 'strategy_loading_error',
                            'timestamp': time.time(),
                        }
                    )
                    raise ValueError(error_msg)
            else:
                # 回退：使用默认策略（向后兼容）
                logger.warning("No strategy code provided, using default RabbitMQStrategy")
                cerebro.addstrategy(
                    RabbitMQStrategy,
                    fast_period=strategy_params.get('fast', 10),
                    slow_period=strategy_params.get('slow', 20),
                    task_id=task_id,
                    worker_id=self.worker_id,
                    rabbitmq_client=self.rabbitmq_client,
                    strategy_timeframe=strategy_timeframe,  # 传递策略周期
                    total_bars=data_length_1s,  # 传递数据总行数
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
            
            # 9. 🔥 关键修复: 从FactorCollector提取交易数据
            # 注意：用户策略可能没有 trade_count 和 bar_count 属性
            if hasattr(strategy, 'trade_count'):
                logger.info(f"[Result] Strategy trade_count: {strategy.trade_count}")
            
            trades = []
            if hasattr(strategy, 'factor_collector') and strategy.factor_collector is not None:
                logger.info(f"[Result] FactorCollector trades: {strategy.factor_collector.get_trades_count()}")
                trades = strategy.factor_collector.trades  # 获取交易记录
                logger.info(f"[Result] Extracted {len(trades)} trades from FactorCollector")
                
                if len(trades) > 0:
                    logger.info(f"[Result] First trade: {trades[0]}")
                    logger.info(f"[Result] Last trade: {trades[-1]}")
                else:
                    logger.warning(f"[Result] No trades found! This is unexpected if there were signals.")
            else:
                # 用户策略可能没有使用 FactorCollector 或者初始化失败
                logger.warning("[Result] Strategy does not have factor_collector or it is None, no trades will be recorded")
            
            # 10. 提取权益曲线（简化版）
            # 使用数据长度作为 bar_count
            bar_count = getattr(strategy, 'bar_count', data_length_1s)
            equity_curve = self._extract_equity_curve(cerebro, initial_capital, final_value, bar_count)
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
                # 文件路径：Backend期望格式
                'files': {
                    'trades': f'backtests/{task_id}/trades.parquet',
                    'equity': f'backtests/{task_id}/equity.parquet',
                },
                # 保留兼容性
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
    
    def _execute_segmented_backtest(self, task_message: Dict[str, Any], memory_opt: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行分段回测（内存优化模式）
        
        Args:
            task_message: 任务消息
            memory_opt: 内存优化配置
            
        Returns:
            回测结果摘要
        """
        task_id = task_message['taskId']
        
        logger.info(f"[SegmentedBacktest] Starting segmented backtest for task {task_id}")
        logger.info(f"[SegmentedBacktest] Configuration: {memory_opt}")
        
        try:
            # 1. 获取配置
            dataset_path = task_message['dataConfig']['datasetPath']
            data_config = task_message['dataConfig']
            time_range = data_config['timeRange']
            
            start_date = datetime.fromisoformat(time_range['start'].replace('Z', ''))
            end_date = datetime.fromisoformat(time_range['end'].replace('Z', ''))
            
            initial_capital = task_message['executionConfig']['initialCapital']
            commission = task_message['executionConfig'].get('commission', 0.001)
            
            segment_days = memory_opt.get('segmentDays', 15)
            lookback_days = memory_opt.get('lookbackDays', 2)
            enable_exactbars = memory_opt.get('enableExactbars', True)
            
            logger.info(f"[SegmentedBacktest] Date range: {start_date} to {end_date}")
            logger.info(f"[SegmentedBacktest] Segment config: {segment_days} days/segment, {lookback_days} days lookback")
            logger.info(f"[SegmentedBacktest] Exactbars: {enable_exactbars}")
            
            # 2. 发送进度
            self.rabbitmq_client.send_progress(
                task_id=task_id,
                worker_id=self.worker_id,  # 添加worker_id
                progress=5.0,
                message=f'Initializing segmented backtest ({segment_days} days/segment)...',
                details={
                    'mode': 'segmented',
                    'segment_days': segment_days,
                    'lookback_days': lookback_days,
                    'exactbars': enable_exactbars,
                }
            )
            
            # 3. 创建SegmentedBacktester
            backtester = SegmentedBacktester(
                dataset_path=dataset_path,
                strategy_class=RabbitMQStrategy,
                strategy_params={
                    'fast_period': task_message.get('strategyParameters', {}).get('fast', 10),
                    'slow_period': task_message.get('strategyParameters', {}).get('slow', 20),
                    'task_id': task_id,
                    'worker_id': self.worker_id,
                    'rabbitmq_client': self.rabbitmq_client,
                    'strategy_timeframe': data_config.get('timeframe', '5m'),
                },
                segment_days=segment_days,
                lookback_days=lookback_days,
                initial_cash=initial_capital,
                commission=commission,
                enable_exactbars=enable_exactbars,
            )
            
            # 4. 执行分段回测
            start_time = time.time()
            
            logger.info(f"[SegmentedBacktest] Running segmented backtest...")
            result = backtester.run(start_date, end_date)
            
            execution_time = time.time() - start_time
            logger.info(f"[SegmentedBacktest] Completed in {execution_time:.2f}s")
            logger.info(f"[SegmentedBacktest] Segments processed: {result['num_segments']}")
            logger.info(f"[SegmentedBacktest] Final value: ${result['final_value']:,.2f}")
            logger.info(f"[SegmentedBacktest] Peak memory: {result['peak_memory_mb']:.2f} MB")
            
            # 5. 生成简化的权益曲线和交易记录
            # TODO: SegmentedBacktester需要返回完整的trades和equity数据
            trades = []
            equity_curve = self._generate_equity_curve_from_segments(result, initial_capital)
            
            # 6. 计算统计指标
            total_return = result['total_return_pct']
            stats = {
                'total_return': total_return,
                'annualized_return': 0,  # TODO
                'max_drawdown_percent': 0,  # TODO
                'sharpe_ratio': 0,  # TODO
                'total_trades': 0,  # TODO
                'win_rate': 0,  # TODO
                'profit_factor': 0,  # TODO
            }
            
            # 7. 保存结果文件
            trades_file_path = self.parquet_writer.save_trades(task_id, trades)
            equity_file_path = self.parquet_writer.save_equity_curve(task_id, equity_curve)
            
            logger.info(f"[SegmentedBacktest] Trades saved: {trades_file_path}")
            logger.info(f"[SegmentedBacktest] Equity curve saved: {equity_file_path}")
            
            # 8. 构建结果摘要
            result_summary = {
                'taskId': task_id,
                'initialCapital': initial_capital,
                'finalCapital': result['final_value'],
                'totalReturn': total_return,
                'annualizedReturn': stats.get('annualized_return', 0),
                'maxDrawdown': stats.get('max_drawdown_percent', 0),
                'sharpeRatio': stats.get('sharpe_ratio', 0),
                'totalTrades': stats['total_trades'],
                'winRate': stats['win_rate'],
                'profitLossRatio': stats.get('profit_factor', 0),
                'processedBars': 0,  # TODO: 计算总Bar数
                'executionTime': execution_time,
                # 文件路径：Backend期望格式
                'files': {
                    'trades': f'backtests/{task_id}/trades.parquet',
                    'equity': f'backtests/{task_id}/equity.parquet',
                },
                # 保留兼容性
                'tradesFilePath': f'backtests/{task_id}/trades.parquet',
                'equityFilePath': f'backtests/{task_id}/equity.parquet',
                # 新增：分段回测特有指标
                'segmentedMode': True,
                'numSegments': result['num_segments'],
                'peakMemoryMB': result['peak_memory_mb'],
            }
            
            # 9. 发送完成状态
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
            
            # 10. 发送结果
            self.rabbitmq_client.send_result(
                task_id=task_id,
                status='COMPLETED',
                result=result_summary,
            )
            
            logger.info(f"[SegmentedBacktest] Task {task_id} completed successfully")
            
            return result_summary
            
        except Exception as e:
            logger.error(f"[SegmentedBacktest] Task {task_id} failed: {e}", exc_info=True)
            
            # 发送错误状态
            import traceback
            self.rabbitmq_client.send_error(
                task_id=task_id,
                error_code='SEGMENTED_EXECUTION_ERROR',
                error_message=str(e),
                stack_trace=traceback.format_exc(),
            )
            
            raise
    
    def _generate_equity_curve_from_segments(self, result: Dict[str, Any], initial_capital: float) -> list:
        """
        从分段结果生成权益曲线
        
        Args:
            result: 分段回测结果
            initial_capital: 初始资金
            
        Returns:
            权益曲线数据点列表
        """
        equity_curve = []
        
        # 添加起始点
        equity_curve.append({
            'timestamp': result['segments'][0]['start'].isoformat(),
            'equity': initial_capital,
        })
        
        # 添加每段的结束点
        for segment in result['segments']:
            equity_curve.append({
                'timestamp': segment['end'].isoformat(),
                'equity': segment['final_value'],
            })
        
        return equity_curve
    
    def _load_data(self, dataset_path: str, data_config: Dict[str, Any]) -> tuple[bt.DataBase, int]:
        """
        加载数据
        
        Args:
            dataset_path: 数据集路径（支持相对路径和绝对路径）
            data_config: 数据配置
            
        Returns:
            Tuple[Backtrader数据源, 数据行数]
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
        
        logger.info(f"[DataLoad] Loaded {len(df)} rows from {df.index.min()} to {df.index.max()}")
        
        # 🔍 关键修复: 根据startDate和endDate过滤数据
        if 'startDate' in data_config and 'endDate' in data_config:
            start_date = pd.Timestamp(data_config['startDate'])
            end_date = pd.Timestamp(data_config['endDate'])
            
            # 移除时区信息以匹配df.index
            if start_date.tz is not None:
                start_date = start_date.tz_localize(None)
            if end_date.tz is not None:
                end_date = end_date.tz_localize(None)
            
            logger.info(f"[DataLoad] Filtering data: {start_date} to {end_date}")
            
            # 过滤数据
            df_before = len(df)
            df = df[(df.index >= start_date) & (df.index < end_date)]
            df_after = len(df)
            
            logger.info(f"[DataLoad] Filtered: {df_before} → {df_after} rows ({df_after/df_before*100:.1f}%)")
            
            if df.empty:
                raise ValueError(f"No data found in range {start_date} to {end_date}")
        else:
            logger.warning(f"[DataLoad] No time range specified, using all {len(df)} rows")
        
        # 记录数据行数
        data_length = len(df)
        logger.info(f"[DataLoad] Final data: {data_length} rows, range: {df.index.min()} to {df.index.max()}")
        
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
        
        return data, data_length
    
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

