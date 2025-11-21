"""
策略状态序列化

用于保存和恢复策略的状态（持仓、订单、自定义变量等）。
"""

import logging
from typing import Dict, Any, Optional
import backtrader as bt

logger = logging.getLogger(__name__)


class StrategyStateSerializer:
    """
    策略状态序列化器
    
    负责提取和恢复策略状态。
    """
    
    @staticmethod
    def extract_state(strategy: bt.Strategy) -> Dict[str, Any]:
        """
        提取策略状态
        
        Args:
            strategy: Backtrader 策略实例
        
        Returns:
            策略状态字典
        """
        try:
            state = {
                'version': '1.0',
                'strategy_name': strategy.__class__.__name__,
                
                # 持仓信息
                'position': {
                    'size': strategy.position.size if strategy.position else 0,
                    'price': strategy.position.price if strategy.position else 0,
                },
                
                # 订单信息
                'order': {
                    'has_order': strategy.order is not None,
                    'order_ref': strategy.order.ref if strategy.order else None,
                },
                
                # 账户信息
                'broker': {
                    'cash': strategy.broker.getcash(),
                    'value': strategy.broker.getvalue(),
                },
                
                # 自定义状态（如果策略定义了）
                'custom_state': {},
            }
            
            # 提取自定义状态
            if hasattr(strategy, 'get_custom_state'):
                try:
                    state['custom_state'] = strategy.get_custom_state()
                except Exception as e:
                    logger.warning(f"Failed to extract custom state: {e}")
            
            # 提取策略的自定义属性（以 checkpoint_ 开头）
            for attr_name in dir(strategy):
                if attr_name.startswith('checkpoint_'):
                    try:
                        attr_value = getattr(strategy, attr_name)
                        # 只保存基本类型
                        if isinstance(attr_value, (int, float, str, bool, list, dict, tuple)):
                            state['custom_state'][attr_name] = attr_value
                    except Exception as e:
                        logger.warning(f"Failed to extract attribute {attr_name}: {e}")
            
            logger.debug(
                f"Strategy state extracted: position_size={state['position']['size']}, "
                f"cash={state['broker']['cash']:.2f}"
            )
            
            return state
            
        except Exception as e:
            logger.error(f"Failed to extract strategy state: {e}", exc_info=True)
            return {}
    
    @staticmethod
    def restore_state(strategy: bt.Strategy, state: Dict[str, Any]) -> bool:
        """
        恢复策略状态
        
        Args:
            strategy: Backtrader 策略实例
            state: 策略状态字典
        
        Returns:
            是否恢复成功
        """
        try:
            # 恢复持仓（注意：Backtrader 的持仓是只读的，这里只是记录）
            if 'position' in state:
                position_state = state['position']
                logger.info(
                    f"Position state: size={position_state.get('size', 0)}, "
                    f"price={position_state.get('price', 0):.2f}"
                )
                # 实际持仓需要通过重放交易来恢复
            
            # 恢复自定义状态
            if 'custom_state' in state:
                for key, value in state['custom_state'].items():
                    try:
                        setattr(strategy, key, value)
                        logger.debug(f"Restored custom attribute: {key}={value}")
                    except Exception as e:
                        logger.warning(f"Failed to restore attribute {key}: {e}")
            
            # 调用自定义恢复方法（如果存在）
            if hasattr(strategy, 'restore_custom_state'):
                try:
                    strategy.restore_custom_state(state.get('custom_state', {}))
                except Exception as e:
                    logger.warning(f"Failed to restore custom state: {e}")
            
            logger.info("Strategy state restored successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to restore strategy state: {e}", exc_info=True)
            return False


class CerebroStateSerializer:
    """
    Cerebro 状态序列化器
    
    负责提取和恢复 Cerebro 的状态。
    """
    
    @staticmethod
    def extract_state(cerebro: bt.Cerebro) -> Dict[str, Any]:
        """
        提取 Cerebro 状态
        
        Args:
            cerebro: Backtrader Cerebro 实例
        
        Returns:
            Cerebro 状态字典
        """
        try:
            state = {
                'version': '1.0',
                
                # Broker 信息
                'broker': {
                    'cash': cerebro.broker.getcash(),
                    'value': cerebro.broker.getvalue(),
                    'commission': getattr(cerebro.broker, 'commission', 0),
                },
                
                # 数据源信息
                'datas': [],
            }
            
            # 提取数据源信息
            for data in cerebro.datas:
                data_info = {
                    'name': data._name if hasattr(data, '_name') else 'unknown',
                    'len': len(data) if hasattr(data, '__len__') else 0,
                }
                state['datas'].append(data_info)
            
            logger.debug(
                f"Cerebro state extracted: cash={state['broker']['cash']:.2f}, "
                f"datas={len(state['datas'])}"
            )
            
            return state
            
        except Exception as e:
            logger.error(f"Failed to extract cerebro state: {e}", exc_info=True)
            return {}
    
    @staticmethod
    def restore_state(cerebro: bt.Cerebro, state: Dict[str, Any]) -> bool:
        """
        恢复 Cerebro 状态
        
        Args:
            cerebro: Backtrader Cerebro 实例
            state: Cerebro 状态字典
        
        Returns:
            是否恢复成功
        """
        try:
            # 恢复 Broker 设置
            if 'broker' in state:
                broker_state = state['broker']
                
                # 设置初始资金（如果需要）
                if 'cash' in broker_state:
                    cash = broker_state['cash']
                    cerebro.broker.setcash(cash)
                    logger.info(f"Broker cash set: {cash:.2f}")
                
                # 设置佣金
                if 'commission' in broker_state:
                    commission = broker_state['commission']
                    cerebro.broker.setcommission(commission=commission)
                    logger.info(f"Broker commission set: {commission}")
            
            logger.info("Cerebro state restored successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to restore cerebro state: {e}", exc_info=True)
            return False


def create_checkpoint_from_strategy(
    strategy: bt.Strategy,
    current_bar: int,
    total_bars: int,
    cerebro: Optional[bt.Cerebro] = None
) -> Dict[str, Any]:
    """
    从策略创建 Checkpoint 数据
    
    这是一个便捷函数，用于快速创建 Checkpoint。
    
    Args:
        strategy: Backtrader 策略实例
        current_bar: 当前 K 线索引
        total_bars: 总 K 线数
        cerebro: Cerebro 实例（可选）
    
    Returns:
        可用于保存的 Checkpoint 数据
    """
    checkpoint_data = {
        'current_bar': current_bar,
        'total_bars': total_bars,
        'strategy_state': StrategyStateSerializer.extract_state(strategy),
    }
    
    if cerebro:
        checkpoint_data['cerebro_state'] = CerebroStateSerializer.extract_state(cerebro)
    
    return checkpoint_data


def restore_strategy_from_checkpoint(
    strategy: bt.Strategy,
    checkpoint_data: Dict[str, Any],
    cerebro: Optional[bt.Cerebro] = None
) -> bool:
    """
    从 Checkpoint 恢复策略
    
    这是一个便捷函数，用于快速恢复策略状态。
    
    Args:
        strategy: Backtrader 策略实例
        checkpoint_data: Checkpoint 数据
        cerebro: Cerebro 实例（可选）
    
    Returns:
        是否恢复成功
    """
    success = True
    
    # 恢复策略状态
    if 'strategy_state' in checkpoint_data:
        if not StrategyStateSerializer.restore_state(strategy, checkpoint_data['strategy_state']):
            success = False
    
    # 恢复 Cerebro 状态
    if cerebro and 'cerebro_state' in checkpoint_data:
        if not CerebroStateSerializer.restore_state(cerebro, checkpoint_data['cerebro_state']):
            success = False
    
    return success

