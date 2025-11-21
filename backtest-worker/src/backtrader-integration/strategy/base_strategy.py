"""
Backtrader 策略基类和工厂

重构自 POC: poc/backtrader-poc/src/03_strategy_with_factors.py
"""

import backtrader as bt
import logging
from typing import Dict, Any, Optional, Type, List
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class BaseStrategy(bt.Strategy, ABC):
    """
    Backtrader 策略基类
    
    所有自定义策略都应该继承此类，并实现必要的方法。
    提供：
    - 统一的因子收集接口
    - 统一的日志记录
    - 统一的订单管理
    - 统一的参数验证
    """
    
    params = (
        ('printlog', False),  # 是否打印日志
        ('task_id', 'default_task'),  # 任务ID
    )
    
    def __init__(self):
        """初始化策略"""
        # 订单管理
        self.order = None
        self.trade_entry_bar = None
        
        # 因子收集器（由外部设置）
        self.factor_collector = None
        
        # 消息发送器（由外部设置）
        self.message_sender = None
        
        logger.info(f"Strategy initialized: {self.__class__.__name__}, task_id={self.p.task_id}")
    
    def log(self, txt: str, dt=None, level: str = 'INFO') -> None:
        """
        记录日志
        
        Args:
            txt: 日志内容
            dt: 日期时间（默认使用当前 K 线时间）
            level: 日志级别
        """
        if self.p.printlog:
            dt = dt or self.datas[0].datetime.datetime(0)
            log_msg = f'{dt.isoformat()} [{self.p.task_id}] {txt}'
            
            if level == 'DEBUG':
                logger.debug(log_msg)
            elif level == 'INFO':
                logger.info(log_msg)
            elif level == 'WARNING':
                logger.warning(log_msg)
            elif level == 'ERROR':
                logger.error(log_msg)
            else:
                logger.info(log_msg)
    
    def set_factor_collector(self, collector) -> None:
        """设置因子收集器"""
        self.factor_collector = collector
        if collector:
            collector.set_strategy(self)
            self.log("Factor collector set", level='DEBUG')
    
    def set_message_sender(self, sender) -> None:
        """设置消息发送器"""
        self.message_sender = sender
        self.log("Message sender set", level='DEBUG')
    
    def notify_order(self, order: bt.Order) -> None:
        """
        订单通知回调
        
        Args:
            order: 订单对象
        """
        if order.status in [order.Submitted, order.Accepted]:
            # 订单已提交/接受，等待执行
            return
        
        if order.status in [order.Completed]:
            if order.isbuy():
                self._handle_buy_completed(order)
            elif order.issell():
                self._handle_sell_completed(order)
            
            self.order = None
            
        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            self.log(f'Order failed: status={order.getstatusname()}, ref={order.ref}', level='WARNING')
            self.order = None
    
    def _handle_buy_completed(self, order: bt.Order) -> None:
        """
        处理买入订单完成
        
        Args:
            order: 订单对象
        """
        self.log(
            f'BUY EXECUTED: price={order.executed.price:.2f}, '
            f'size={order.executed.size}, cost={order.executed.value:.2f}, '
            f'comm={order.executed.comm:.2f}'
        )
        
        self.trade_entry_bar = len(self.data) - 1
        
        # 收集入场因子
        if self.factor_collector:
            entry_factors = self.get_entry_factors()
            self.factor_collector.record_entry_factors(
                order=order,
                price=order.executed.price,
                size=order.executed.size,
                commission=order.executed.comm,
                **entry_factors
            )
    
    def _handle_sell_completed(self, order: bt.Order) -> None:
        """
        处理卖出订单完成
        
        Args:
            order: 订单对象
        """
        pnl = order.executed.pnl
        pnl_percent = (order.executed.pnlcomm / order.executed.value) if order.executed.value else 0
        holding_bars = (len(self.data) - 1) - self.trade_entry_bar if self.trade_entry_bar is not None else 0
        
        self.log(
            f'SELL EXECUTED: price={order.executed.price:.2f}, '
            f'size={order.executed.size}, pnl={pnl:.2f}, '
            f'pnl%={pnl_percent:.2%}'
        )
        
        # 收集出场因子
        if self.factor_collector:
            exit_factors = self.get_exit_factors()
            self.factor_collector.record_exit_factors(
                order=order,
                pnl=pnl,
                pnl_percent=pnl_percent,
                holding_bars=holding_bars,
                **exit_factors
            )
        
        self.trade_entry_bar = None
    
    def notify_trade(self, trade: bt.Trade) -> None:
        """
        交易通知回调
        
        Args:
            trade: 交易对象
        """
        if not trade.isclosed:
            return
        
        self.log(f'TRADE PROFIT: gross={trade.pnl:.2f}, net={trade.pnlcomm:.2f}')
    
    @abstractmethod
    def get_entry_factors(self) -> Dict[str, Any]:
        """
        获取入场因子
        
        子类必须实现此方法，返回自定义的入场因子。
        
        Returns:
            因子字典，例如：
            {
                'sma_fast': self.sma_fast[0],
                'sma_slow': self.sma_slow[0],
                'close': self.data.close[0],
                'volume': self.data.volume[0],
            }
        """
        pass
    
    @abstractmethod
    def get_exit_factors(self) -> Dict[str, Any]:
        """
        获取出场因子
        
        子类必须实现此方法，返回自定义的出场因子。
        
        Returns:
            因子字典
        """
        pass
    
    @abstractmethod
    def next(self) -> None:
        """
        策略逻辑（每根 K 线调用一次）
        
        子类必须实现此方法，定义策略的交易逻辑。
        """
        pass
    
    def stop(self) -> None:
        """策略结束回调"""
        self.log(f'Strategy finished: final_value={self.broker.getvalue():.2f}')


class StrategyFactory:
    """
    策略工厂
    
    用于注册和创建策略实例。
    """
    
    _strategies: Dict[str, Type[BaseStrategy]] = {}
    
    @classmethod
    def register(cls, name: str, strategy_class: Type[BaseStrategy]) -> None:
        """
        注册策略
        
        Args:
            name: 策略名称
            strategy_class: 策略类
        """
        if not issubclass(strategy_class, BaseStrategy):
            raise ValueError(f"Strategy class must inherit from BaseStrategy")
        
        cls._strategies[name] = strategy_class
        logger.info(f"Strategy registered: {name} -> {strategy_class.__name__}")
    
    @classmethod
    def create(cls, name: str, **params) -> Type[BaseStrategy]:
        """
        创建策略实例
        
        Args:
            name: 策略名称
            **params: 策略参数
        
        Returns:
            策略类（未实例化）
        """
        if name not in cls._strategies:
            available = ', '.join(cls._strategies.keys())
            raise ValueError(f"Strategy '{name}' not found. Available: {available}")
        
        strategy_class = cls._strategies[name]
        
        # 创建带参数的策略类
        if params:
            # 使用 type() 动态创建子类，设置默认参数
            new_params = tuple((k, v) for k, v in params.items())
            strategy_class = type(
                strategy_class.__name__,
                (strategy_class,),
                {'params': strategy_class.params + new_params}
            )
        
        logger.info(f"Strategy created: {name} with params={params}")
        return strategy_class
    
    @classmethod
    def list_strategies(cls) -> List[str]:
        """列出所有已注册的策略"""
        return list(cls._strategies.keys())
    
    @classmethod
    def get_strategy_info(cls, name: str) -> Dict[str, Any]:
        """
        获取策略信息
        
        Args:
            name: 策略名称
        
        Returns:
            策略信息字典
        """
        if name not in cls._strategies:
            raise ValueError(f"Strategy '{name}' not found")
        
        strategy_class = cls._strategies[name]
        
        return {
            'name': name,
            'class': strategy_class.__name__,
            'params': dict(strategy_class.params),
            'doc': strategy_class.__doc__,
        }


# 策略验证器
class StrategyValidator:
    """
    策略验证器
    
    用于验证策略代码的正确性和安全性。
    """
    
    @staticmethod
    def validate_strategy_class(strategy_class: Type) -> tuple[bool, Optional[str]]:
        """
        验证策略类
        
        Args:
            strategy_class: 策略类
        
        Returns:
            (是否有效, 错误信息)
        """
        # 检查是否继承自 BaseStrategy
        if not issubclass(strategy_class, BaseStrategy):
            return False, "Strategy must inherit from BaseStrategy"
        
        # 检查必要方法是否实现
        required_methods = ['get_entry_factors', 'get_exit_factors', 'next']
        for method in required_methods:
            if not hasattr(strategy_class, method):
                return False, f"Strategy must implement method: {method}"
        
        return True, None
    
    @staticmethod
    def validate_strategy_params(params: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        验证策略参数
        
        Args:
            params: 策略参数
        
        Returns:
            (是否有效, 错误信息)
        """
        # 检查参数类型
        for key, value in params.items():
            if not isinstance(key, str):
                return False, f"Parameter key must be string: {key}"
            
            # 检查值的类型（基本类型）
            if not isinstance(value, (int, float, str, bool, type(None))):
                return False, f"Parameter value must be basic type: {key}={value}"
        
        return True, None

