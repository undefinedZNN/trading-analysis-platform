"""
佣金管理器

负责根据资产类型和佣金配置，正确设置 Backtrader 的 Broker 佣金。
支持：股票、期货、加密货币等不同资产类型的佣金模型。
"""
import logging
import backtrader as bt
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class CommissionManager:
    """
    佣金管理器
    
    负责将后端传递的佣金配置应用到 Backtrader Broker。
    根据不同的资产类型（股票、期货、加密货币）使用不同的佣金模型。
    """
    
    def setup_broker(
        self, 
        cerebro: bt.Cerebro, 
        execution_config: Dict[str, Any]
    ) -> None:
        """
        根据配置设置 Broker 佣金
        
        Args:
            cerebro: Backtrader Cerebro 实例
            execution_config: 执行配置，包含：
                - assetType: 资产类型 ('stock' | 'futures' | 'crypto')
                - contractSpecs: 合约规格（期货必需）
                - commission: 佣金配置
                - slippage: 滑点
                
        Raises:
            ValueError: 如果配置无效或缺少必需字段
        """
        asset_type = execution_config.get('assetType')
        
        if not asset_type:
            raise ValueError("Missing required field: assetType")
        
        logger.info(f"Setting up broker for asset type: {asset_type}")
        
        # 1. 设置初始资金
        initial_capital = execution_config.get('initialCapital')
        if not initial_capital:
            raise ValueError("Missing required field: initialCapital")
        
        cerebro.broker.setcash(initial_capital)
        logger.info(f"Initial capital set: {initial_capital}")
        
        # 2. 根据资产类型配置佣金
        if asset_type == 'stock':
            self._setup_stock_commission(cerebro, execution_config)
        elif asset_type == 'futures':
            self._setup_futures_commission(cerebro, execution_config)
        elif asset_type == 'crypto':
            self._setup_crypto_commission(cerebro, execution_config)
        else:
            raise ValueError(f"Unsupported asset type: {asset_type}")
        
        # 3. 设置滑点
        slippage = execution_config.get('slippage', 0)
        if slippage > 0:
            cerebro.broker.set_slippage_perc(slippage)
            logger.info(f"Slippage set to: {slippage}")
    
    def _setup_stock_commission(
        self, 
        cerebro: bt.Cerebro, 
        execution_config: Dict[str, Any]
    ) -> None:
        """
        配置股票佣金
        
        支持：
        - 百分比佣金
        - 最低佣金限制
        - 印花税（仅卖出时收取）
        
        Args:
            cerebro: Backtrader Cerebro 实例
            execution_config: 执行配置
        """
        commission_config = execution_config.get('commission', {})
        contract_specs = execution_config.get('contractSpecs', {})
        
        comm_type = commission_config.get('type')
        
        if not comm_type:
            raise ValueError("Missing commission type for stock")
        
        logger.info(f"Setting up stock commission, type: {comm_type}")
        
        if comm_type == 'percentage':
            self._setup_stock_percentage_commission(cerebro, commission_config)
        else:
            raise ValueError(f"Unsupported commission type for stock: {comm_type}")
    
    def _setup_stock_percentage_commission(
        self,
        cerebro: bt.Cerebro,
        commission_config: Dict[str, Any]
    ) -> None:
        """
        配置股票百分比佣金（支持最低佣金和印花税）
        
        Args:
            cerebro: Backtrader Cerebro 实例
            commission_config: 佣金配置
        """
        rate = commission_config.get('rate', 0.0003)
        min_commission = commission_config.get('minCommission', 0)
        stamp_duty = commission_config.get('stampDuty', 0)
        
        logger.info(
            f"Stock commission config: rate={rate * 10000:.1f}‱, "
            f"min={min_commission}, stamp_duty={stamp_duty * 1000:.1f}‰"
        )
        
        # 如果有最低佣金或印花税，需要自定义 CommInfo
        if min_commission > 0 or stamp_duty > 0:
            class StockCommInfo(bt.CommInfoBase):
                """
                自定义股票佣金信息类
                
                支持：
                - 百分比佣金
                - 最低佣金限制
                - 印花税（仅卖出时）
                """
                params = (
                    ('commission', rate),
                    ('min_commission', min_commission),
                    ('stamp_duty', stamp_duty),
                    ('stocklike', True),
                    ('commtype', bt.CommInfoBase.COMM_PERC),
                    ('percabs', True),
                )
                
                def _getcommission(self, size, price, pseudoexec):
                    """
                    计算佣金
                    
                    Args:
                        size: 交易数量（正数=买入，负数=卖出）
                        price: 成交价格
                        pseudoexec: 是否是模拟执行
                        
                    Returns:
                        佣金金额
                    """
                    # 基础佣金
                    comm = abs(size) * price * self.p.commission
                    
                    # 应用最低佣金
                    if self.p.min_commission > 0:
                        comm = max(comm, self.p.min_commission)
                    
                    # 印花税（仅卖出时收取）
                    if size < 0 and self.p.stamp_duty > 0:
                        stamp = abs(size) * price * self.p.stamp_duty
                        comm += stamp
                    
                    return comm
            
            cerebro.broker.addcommissioninfo(StockCommInfo())
            
            logger.info(
                f"✅ Stock commission configured with custom CommInfo: "
                f"rate={rate * 10000:.1f}‱, min={min_commission}, stamp_duty={stamp_duty * 1000:.1f}‰"
            )
        else:
            # 简单百分比佣金
            cerebro.broker.setcommission(
                commission=rate,
                stocklike=True,
                commtype=bt.CommInfoBase.COMM_PERC,
                percabs=True
            )
            logger.info(f"✅ Stock commission configured: {rate * 10000:.1f}‱")
    
    def _setup_futures_commission(
        self, 
        cerebro: bt.Cerebro, 
        execution_config: Dict[str, Any]
    ) -> None:
        """
        配置期货佣金
        
        支持：
        - 固定佣金（每手固定金额）
        - 百分比佣金
        - 合约乘数
        - 保证金比例
        
        Args:
            cerebro: Backtrader Cerebro 实例
            execution_config: 执行配置
        """
        commission_config = execution_config.get('commission', {})
        contract_specs = execution_config.get('contractSpecs')
        
        if not contract_specs:
            raise ValueError("Futures requires contractSpecs")
        
        # 提取合约规格
        multiplier = contract_specs.get('multiplier')
        margin_ratio = contract_specs.get('marginRatio')
        
        if not multiplier or multiplier < 1:
            raise ValueError("Futures contractSpecs must include multiplier (>= 1)")
        
        if margin_ratio is None or margin_ratio < 0 or margin_ratio > 1:
            raise ValueError("Futures contractSpecs must include marginRatio (0-1)")
        
        comm_type = commission_config.get('type')
        
        if not comm_type:
            raise ValueError("Missing commission type for futures")
        
        logger.info(
            f"Setting up futures commission, type: {comm_type}, "
            f"multiplier: {multiplier}, margin: {margin_ratio * 100}%"
        )
        
        if comm_type == 'fixed':
            # 固定佣金
            amount = commission_config.get('amount')
            if amount is None:
                raise ValueError("Fixed commission requires 'amount' field")
            
            cerebro.broker.setcommission(
                commission=amount,
                mult=multiplier,
                margin=None,
                automargin=margin_ratio,
                stocklike=False,
                commtype=bt.CommInfoBase.COMM_FIXED
            )
            logger.info(f"✅ Futures fixed commission set: {amount} per contract")
            
        elif comm_type == 'percentage':
            # 百分比佣金
            rate = commission_config.get('rate')
            if rate is None:
                raise ValueError("Percentage commission requires 'rate' field")
            
            cerebro.broker.setcommission(
                commission=rate,
                mult=multiplier,
                margin=None,
                automargin=margin_ratio,
                stocklike=False,
                commtype=bt.CommInfoBase.COMM_PERC,
                percabs=True
            )
            logger.info(f"✅ Futures percentage commission set: {rate * 10000:.1f}‱")
            
        elif comm_type == 'maker-taker':
            # Maker/Taker 差异化费率（期货交易所也可能使用）
            try:
                from .maker_taker_commission import MakerTakerCommInfo
                
                maker_rate = commission_config.get('makerRate', 0.0002)
                taker_rate = commission_config.get('takerRate', 0.0004)
                
                # 为期货配置 Maker/Taker 佣金
                class FuturesMakerTakerCommInfo(MakerTakerCommInfo):
                    """期货的 Maker/Taker 佣金"""
                    params = (
                        ('maker_rate', maker_rate),
                        ('taker_rate', taker_rate),
                        ('mult', multiplier),
                        ('margin', None),
                        ('automargin', margin_ratio),
                        ('stocklike', False),
                    )
                
                cerebro.broker.addcommissioninfo(FuturesMakerTakerCommInfo())
                
                logger.info(
                    f"✅ Futures Maker/Taker commission set: "
                    f"maker={maker_rate * 10000:.1f}‱, taker={taker_rate * 10000:.1f}‱"
                )
            except ImportError:
                # 如果还未实现 MakerTakerCommInfo，使用平均费率
                logger.warning(
                    "MakerTakerCommInfo not implemented yet, using average rate for futures"
                )
                maker_rate = commission_config.get('makerRate', 0.0002)
                taker_rate = commission_config.get('takerRate', 0.0004)
                avg_rate = (maker_rate + taker_rate) / 2
                
                cerebro.broker.setcommission(
                    commission=avg_rate,
                    mult=multiplier,
                    margin=None,
                    automargin=margin_ratio,
                    stocklike=False,
                    commtype=bt.CommInfoBase.COMM_PERC,
                    percabs=True
                )
                logger.info(f"✅ Futures commission set (average): {avg_rate * 10000:.1f}‱")
        else:
            raise ValueError(f"Unsupported commission type for futures: {comm_type}")
        
        logger.info(
            f"✅ Futures broker configured: mult={multiplier}, margin={margin_ratio * 100}%"
        )
    
    def _setup_crypto_commission(
        self,
        cerebro: bt.Cerebro,
        execution_config: Dict[str, Any]
    ) -> None:
        """
        配置加密货币佣金
        
        支持：
        - Maker/Taker 差异化费率
        - 简单百分比佣金
        
        Args:
            cerebro: Backtrader Cerebro 实例
            execution_config: 执行配置
        """
        commission_config = execution_config.get('commission', {})
        comm_type = commission_config.get('type')
        
        if not comm_type:
            raise ValueError("Missing commission type for crypto")
        
        logger.info(f"Setting up crypto commission, type: {comm_type}")
        
        if comm_type == 'maker-taker':
            # Maker/Taker 差异化费率
            # 导入 MakerTakerCommInfo（在 Phase 4.2 实现）
            try:
                from .maker_taker_commission import MakerTakerCommInfo
                
                maker_rate = commission_config.get('makerRate', 0.001)
                taker_rate = commission_config.get('takerRate', 0.001)
                
                cerebro.broker.addcommissioninfo(
                    MakerTakerCommInfo(
                        maker_rate=maker_rate,
                        taker_rate=taker_rate
                    )
                )
                
                logger.info(
                    f"✅ Maker/Taker commission set: "
                    f"maker={maker_rate * 10000:.1f}‱, taker={taker_rate * 10000:.1f}‱"
                )
            except ImportError:
                # 如果还未实现 MakerTakerCommInfo，使用平均费率
                logger.warning(
                    "MakerTakerCommInfo not implemented yet, using average rate"
                )
                maker_rate = commission_config.get('makerRate', 0.001)
                taker_rate = commission_config.get('takerRate', 0.001)
                avg_rate = (maker_rate + taker_rate) / 2
                
                cerebro.broker.setcommission(
                    commission=avg_rate,
                    stocklike=True,
                    commtype=bt.CommInfoBase.COMM_PERC,
                    percabs=True
                )
                logger.info(f"✅ Crypto commission set (average): {avg_rate * 10000:.1f}‱")
            
        elif comm_type == 'percentage':
            # 简单百分比佣金
            rate = commission_config.get('rate', 0.001)
            
            cerebro.broker.setcommission(
                commission=rate,
                stocklike=True,
                commtype=bt.CommInfoBase.COMM_PERC,
                percabs=True
            )
            logger.info(f"✅ Crypto commission set: {rate * 10000:.1f}‱")
        else:
            raise ValueError(f"Unsupported commission type for crypto: {comm_type}")


