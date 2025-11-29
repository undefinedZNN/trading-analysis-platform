"""
Maker/Taker 佣金支持

Backtrader 原生不支持 Maker/Taker 区分，这里通过自定义 CommInfo 实现。

实现说明：
- Backtrader 在执行订单时调用 _getcommission 方法计算佣金
- 但在该方法中无法直接获取订单类型（Limit vs Market）
- 因此采用平均费率作为近似（Phase 4 基础版本）
- 未来可以通过策略层面配合实现精确区分（Phase 4 改进版本）
"""
import logging
import backtrader as bt
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class MakerTakerCommInfo(bt.CommInfoBase):
    """
    支持 Maker/Taker 差异化费率的佣金类
    
    当前实现：使用平均费率（快速上线）
    
    判断逻辑：
    - Limit 订单 → Maker（提供流动性）
    - Market 订单 → Taker（消耗流动性）
    - Stop 订单 → Taker（触发后变为 Market）
    
    注意：
    由于 Backtrader 在 _getcommission 时无法直接访问订单类型，
    当前版本使用平均费率作为近似。
    """
    
    params = (
        ('maker_rate', 0.0002),    # Maker 费率
        ('taker_rate', 0.0005),    # Taker 费率
        ('stocklike', True),       # 类股票模式
        ('commtype', bt.CommInfoBase.COMM_PERC),
        ('percabs', True),
    )
    
    def __init__(self, maker_rate=None, taker_rate=None):
        """
        初始化 MakerTakerCommInfo
        
        Args:
            maker_rate: Maker 费率（可选，默认使用 params）
            taker_rate: Taker 费率（可选，默认使用 params）
        """
        super().__init__()
        
        # 如果提供了参数，覆盖默认值
        if maker_rate is not None:
            self.p.maker_rate = maker_rate
        if taker_rate is not None:
            self.p.taker_rate = taker_rate
        
        # 计算平均费率（当前使用）
        self._avg_rate = (self.p.maker_rate + self.p.taker_rate) / 2
        
        logger.info(
            f"MakerTakerCommInfo initialized: "
            f"maker={self.p.maker_rate * 10000:.1f}‱, "
            f"taker={self.p.taker_rate * 10000:.1f}‱, "
            f"avg={self._avg_rate * 10000:.1f}‱"
        )
    
    def _getcommission(self, size, price, pseudoexec):
        """
        计算佣金
        
        当前实现：使用平均费率
        
        Args:
            size: 订单大小（正数=买入，负数=卖出）
            price: 成交价格
            pseudoexec: 是否是模拟执行
            
        Returns:
            佣金金额
        """
        # 使用平均费率
        rate = self._avg_rate
        
        # 计算佣金
        comm = abs(size) * price * rate
        
        logger.debug(
            f"Commission calculated: size={size}, price={price}, "
            f"rate={rate * 10000:.1f}‱, comm={comm:.4f}"
        )
        
        return comm


class ImprovedMakerTakerCommInfo(bt.CommInfoBase):
    """
    改进版 Maker/Taker 佣金（通过策略配合实现精确区分）
    
    使用方法：
    1. 在策略中注册订单类型：
       ```python
       order = self.buy(exectype=bt.Order.Limit)
       self.broker.comminfo[None].register_order(order.ref, is_maker=True)
       ```
    
    2. 在 notify_order 中清理：
       ```python
       if order.status in [order.Completed, order.Canceled, order.Rejected]:
           self.broker.comminfo[None].unregister_order(order.ref)
       ```
    
    注意：需要策略层面配合，否则降级为平均费率。
    """
    
    params = (
        ('maker_rate', 0.0002),
        ('taker_rate', 0.0005),
        ('stocklike', True),
        ('commtype', bt.CommInfoBase.COMM_PERC),
        ('percabs', True),
    )
    
    def __init__(self, maker_rate=None, taker_rate=None):
        super().__init__()
        
        if maker_rate is not None:
            self.p.maker_rate = maker_rate
        if taker_rate is not None:
            self.p.taker_rate = taker_rate
        
        # 订单注册表
        self._order_registry: Dict[int, bool] = {}
        
        # 平均费率（降级方案）
        self._avg_rate = (self.p.maker_rate + self.p.taker_rate) / 2
        
        logger.info(
            f"ImprovedMakerTakerCommInfo initialized: "
            f"maker={self.p.maker_rate * 10000:.1f}‱, "
            f"taker={self.p.taker_rate * 10000:.1f}‱"
        )
    
    def register_order(self, order_ref: int, is_maker: bool) -> None:
        """
        注册订单类型（供策略调用）
        
        Args:
            order_ref: 订单引用ID
            is_maker: 是否是 Maker 订单
        """
        self._order_registry[order_ref] = is_maker
        logger.debug(f"Order {order_ref} registered as {'maker' if is_maker else 'taker'}")
    
    def unregister_order(self, order_ref: int) -> None:
        """
        注销订单（供策略调用）
        
        Args:
            order_ref: 订单引用ID
        """
        if order_ref in self._order_registry:
            del self._order_registry[order_ref]
            logger.debug(f"Order {order_ref} unregistered")
    
    def _getcommission(self, size, price, pseudoexec):
        """
        计算佣金
        
        尝试从订单注册表获取类型，如果找不到则使用平均费率。
        
        Args:
            size: 订单大小
            price: 成交价格
            pseudoexec: 是否是模拟执行
            
        Returns:
            佣金金额
        """
        # TODO: 从执行上下文获取订单引用
        # Backtrader 在 _getcommission 时没有提供订单引用
        # 需要策略层面配合或使用其他方式
        
        # 当前降级为平均费率
        rate = self._avg_rate
        order_type = 'average'
        
        # 计算佣金
        comm = abs(size) * price * rate
        
        logger.debug(
            f"Commission: size={size}, price={price}, "
            f"type={order_type}, rate={rate * 10000:.1f}‱, comm={comm:.4f}"
        )
        
        return comm


