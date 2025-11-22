"""
Backtrader 策略基类和工厂

重构自 POC: poc/backtrader-poc/src/03_strategy_with_factors.py
"""

import backtrader as bt
import logging
from typing import Dict, Any, Optional, Type, List, Tuple

logger = logging.getLogger(__name__)


class BaseStrategy(bt.Strategy):
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
        
        # 因子收集器（由外部设置或自动查找）
        self.factor_collector = None
        self._factor_collector_initialized = False
        
        # 消息发送器（由外部设置）
        self.message_sender = None
        
        # Checkpoint 管理器（由外部设置）
        self.checkpoint_manager = None
        self.checkpoint_trigger = None
        
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
    
    def start(self) -> None:
        """
        策略开始时调用（Backtrader回调）
        
        自动初始化因子收集器等组件
        """
        self._init_factor_collector()
    
    def _init_factor_collector(self) -> None:
        """
        自动初始化因子收集器
        
        从策略的observers中查找FactorCollector并自动关联
        """
        if self._factor_collector_initialized:
            return
        
        self._factor_collector_initialized = True
        
        # 尝试从observers中查找FactorCollector
        if hasattr(self, 'getobservers'):
            for obs in self.getobservers():
                if obs.__class__.__name__ == 'FactorCollector':
                    self.set_factor_collector(obs)
                    self.log("FactorCollector auto-discovered", level='DEBUG')
                    break
    
    def set_factor_collector(self, collector) -> None:
        """设置因子收集器"""
        self.factor_collector = collector
        if collector is not None:
            collector.set_strategy(self)
            self.log("Factor collector set", level='DEBUG')
    
    def set_message_sender(self, sender) -> None:
        """设置消息发送器"""
        self.message_sender = sender
        self.log("Message sender set", level='DEBUG')
    
    def set_checkpoint_manager(self, manager, trigger=None) -> None:
        """
        设置 Checkpoint 管理器
        
        Args:
            manager: CheckpointManager 实例
            trigger: CheckpointTrigger 实例（可选）
        """
        self.checkpoint_manager = manager
        self.checkpoint_trigger = trigger
        self.log("Checkpoint manager set", level='DEBUG')
    
    def should_save_checkpoint(self) -> bool:
        """
        判断是否应该保存 Checkpoint
        
        Returns:
            是否应该保存
        """
        if not self.checkpoint_trigger:
            return False
        
        current_bar = len(self.data)
        return self.checkpoint_trigger.should_checkpoint(current_bar)
    
    def save_checkpoint(self, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        保存 Checkpoint
        
        Args:
            metadata: 额外的元数据
        
        Returns:
            是否保存成功
        """
        if not self.checkpoint_manager:
            return False
        
        try:
            from ..checkpoint import create_checkpoint_from_strategy
            
            current_bar = len(self.data)
            # 注意：total_bars 需要从外部传入或估算
            total_bars = getattr(self, '_total_bars', 0)
            
            # 创建 Checkpoint 数据
            checkpoint_data = create_checkpoint_from_strategy(
                strategy=self,
                current_bar=current_bar,
                total_bars=total_bars
            )
            
            # 保存
            self.checkpoint_manager.save_checkpoint(
                current_bar=current_bar,
                total_bars=total_bars,
                strategy_state=checkpoint_data['strategy_state'],
                cerebro_state=checkpoint_data.get('cerebro_state'),
                metadata=metadata
            )
            
            # 标记已保存
            if self.checkpoint_trigger:
                self.checkpoint_trigger.mark_checkpoint_saved(current_bar)
            
            self.log(f"Checkpoint saved at bar {current_bar}", level='INFO')
            return True
            
        except Exception as e:
            self.log(f"Failed to save checkpoint: {e}", level='ERROR')
            return False
    
    def get_custom_state(self) -> Dict[str, Any]:
        """
        获取自定义状态（供子类重写）
        
        子类可以重写此方法来保存自定义状态。
        
        Returns:
            自定义状态字典
        """
        return {}
    
    def restore_custom_state(self, state: Dict[str, Any]) -> None:
        """
        恢复自定义状态（供子类重写）
        
        子类可以重写此方法来恢复自定义状态。
        
        Args:
            state: 自定义状态字典
        """
        pass
    
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
        if self.factor_collector is not None:
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
        # 获取盈亏（注意：卖出订单的 executed 对象没有 pnl）
        # 需要从 Position 或 Trade 获取
        pnl = 0.0  # 暂时设为0，实际会在 notify_trade 中获取
        pnl_percent = 0.0
        holding_bars = (len(self.data) - 1) - self.trade_entry_bar if self.trade_entry_bar is not None else 0
        
        self.log(
            f'SELL EXECUTED: price={order.executed.price:.2f}, '
            f'size={order.executed.size}'
        )
        
        # 注意：pnl 会在 notify_trade 中获取
        
        self.trade_entry_bar = None
    
    def notify_trade(self, trade: bt.Trade) -> None:
        """
        交易通知回调
        
        Args:
            trade: 交易对象
        """
        if not trade.isclosed:
            return
        
        pnl = trade.pnl
        pnl_net = trade.pnlcomm
        pnl_percent = (pnl_net / trade.value) if trade.value else 0
        holding_bars = trade.barlen
        
        self.log(f'TRADE PROFIT: gross={pnl:.2f}, net={pnl_net:.2f}, bars={holding_bars}')
        
        # 收集出场因子（在交易关闭时）
        if self.factor_collector is not None:
            exit_factors = self.get_exit_factors()
            self.factor_collector.record_exit_factors(
                order=None,  # Trade 回调中没有 order 对象
                pnl=pnl,
                pnl_percent=pnl_percent,
                holding_bars=holding_bars,
                **exit_factors
            )
    
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
        raise NotImplementedError("Subclass must implement get_entry_factors()")
    
    def get_exit_factors(self) -> Dict[str, Any]:
        """
        获取出场因子
        
        子类必须实现此方法，返回自定义的出场因子。
        
        Returns:
            因子字典
        """
        raise NotImplementedError("Subclass must implement get_exit_factors()")
    
    def next(self) -> None:
        """
        策略逻辑（每根 K 线调用一次）
        
        子类必须实现此方法，定义策略的交易逻辑。
        """
        raise NotImplementedError("Subclass must implement next()")
    
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
    def create(cls, name: str, **params) -> Tuple[Type[BaseStrategy], Dict[str, Any]]:
        """
        创建策略
        
        Args:
            name: 策略名称
            **params: 策略参数
        
        Returns:
            (策略类, 参数字典) - 用于 cerebro.addstrategy()
        """
        if name not in cls._strategies:
            available = ', '.join(cls._strategies.keys())
            raise ValueError(f"Strategy '{name}' not found. Available: {available}")
        
        strategy_class = cls._strategies[name]
        
        logger.info(f"Strategy created: {name} with params={params}")
        return strategy_class, params
    
    @classmethod
    def add_to_cerebro(cls, cerebro: bt.Cerebro, name: str, **params):
        """
        将策略添加到 Cerebro
        
        Args:
            cerebro: Cerebro 实例
            name: 策略名称
            **params: 策略参数
        
        Returns:
            None
        """
        strategy_class, strategy_params = cls.create(name, **params)
        cerebro.addstrategy(strategy_class, **strategy_params)
    
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
        
        # 获取参数（Backtrader 的 params 是一个特殊的对象）
        params_dict = {}
        try:
            # 尝试从 _getpairsbase() 获取参数
            if hasattr(strategy_class, '_getpairsbase'):
                params_pairs = strategy_class._getpairsbase()
                params_dict = dict(params_pairs) if params_pairs else {}
        except:
            pass
        
        return {
            'name': name,
            'class': strategy_class.__name__,
            'params': params_dict,
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

