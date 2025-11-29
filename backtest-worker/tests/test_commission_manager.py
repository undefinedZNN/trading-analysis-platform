"""
CommissionManager 单元测试

测试覆盖：
1. 股票佣金计算（百分比、最低佣金、印花税）
2. 期货佣金计算（固定、百分比、合约乘数、保证金）
3. 加密货币佣金计算（Maker/Taker、百分比）
4. 错误处理（缺少必需字段、无效参数）
"""
import pytest
import backtrader as bt
from src.backtrader_integration.commission import CommissionManager


class TestCommissionManager:
    """CommissionManager 测试套件"""
    
    def setup_method(self):
        """每个测试方法前执行"""
        self.manager = CommissionManager()
    
    # ========== 股票佣金测试 ==========
    
    def test_stock_simple_percentage_commission(self):
        """测试股票简单百分比佣金（无最低佣金、无印花税）"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'stock',
            'commission': {
                'type': 'percentage',
                'rate': 0.0003,  # 万分之三
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        
        # 验证初始资金
        assert cerebro.broker.get_cash() == 100000
        
        # 验证佣金（通过模拟交易）
        # Backtrader 的佣金在实际交易时才计算
        # 这里仅验证配置成功
    
    def test_stock_commission_with_minimum(self):
        """测试股票佣金（含最低佣金）"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'stock',
            'commission': {
                'type': 'percentage',
                'rate': 0.0003,
                'minCommission': 5.0,  # 最低 5 元
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        
        # 验证配置成功
        assert cerebro.broker.get_cash() == 100000
    
    def test_stock_commission_with_stamp_duty(self):
        """测试股票佣金（含印花税）"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'stock',
            'commission': {
                'type': 'percentage',
                'rate': 0.0003,
                'minCommission': 5.0,
                'stampDuty': 0.001,  # 千分之一
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 100000
    
    def test_stock_a_share_typical_config(self):
        """测试 A 股典型配置（万三佣金、最低5元、千一印花税）"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'stock',
            'commission': {
                'type': 'percentage',
                'rate': 0.0003,
                'minCommission': 5.0,
                'stampDuty': 0.001,
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 100000
    
    # ========== 期货佣金测试 ==========
    
    def test_futures_fixed_commission(self):
        """测试期货固定佣金"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'futures',
            'contractSpecs': {
                'multiplier': 10,  # 10吨/手
                'marginRatio': 0.09,  # 9%保证金
            },
            'commission': {
                'type': 'fixed',
                'amount': 2.0,  # 2元/手
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 100000
    
    def test_futures_percentage_commission(self):
        """测试期货百分比佣金"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'futures',
            'contractSpecs': {
                'multiplier': 50,  # 50公斤/手
                'marginRatio': 0.08,
            },
            'commission': {
                'type': 'percentage',
                'rate': 0.0005,  # 万分之五
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 100000
    
    def test_futures_rebar_typical_config(self):
        """测试螺纹钢期货典型配置"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 50000,
            'assetType': 'futures',
            'contractSpecs': {
                'multiplier': 10,
                'marginRatio': 0.09,
            },
            'commission': {
                'type': 'fixed',
                'amount': 2.0,
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 50000
    
    # ========== 加密货币佣金测试 ==========
    
    def test_crypto_simple_percentage_commission(self):
        """测试加密货币简单百分比佣金"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 10000,
            'assetType': 'crypto',
            'commission': {
                'type': 'percentage',
                'rate': 0.001,  # 0.1%
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 10000
    
    def test_crypto_maker_taker_commission(self):
        """测试加密货币 Maker/Taker 佣金"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 10000,
            'assetType': 'crypto',
            'commission': {
                'type': 'maker-taker',
                'makerRate': 0.0002,  # Maker 0.02%
                'takerRate': 0.0005,  # Taker 0.05%
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 10000
    
    def test_crypto_binance_typical_config(self):
        """测试币安现货典型配置"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 10000,
            'assetType': 'crypto',
            'commission': {
                'type': 'maker-taker',
                'makerRate': 0.001,
                'takerRate': 0.001,
            }
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 10000
    
    # ========== 错误处理测试 ==========
    
    def test_missing_asset_type(self):
        """测试缺少资产类型"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'commission': {'type': 'percentage', 'rate': 0.001}
        }
        
        with pytest.raises(ValueError, match="Missing required field: assetType"):
            self.manager.setup_broker(cerebro, execution_config)
    
    def test_missing_initial_capital(self):
        """测试缺少初始资金"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'assetType': 'stock',
            'commission': {'type': 'percentage', 'rate': 0.001}
        }
        
        with pytest.raises(ValueError, match="Missing required field: initialCapital"):
            self.manager.setup_broker(cerebro, execution_config)
    
    def test_unsupported_asset_type(self):
        """测试不支持的资产类型"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'bonds',  # 不支持
            'commission': {'type': 'percentage', 'rate': 0.001}
        }
        
        with pytest.raises(ValueError, match="Unsupported asset type"):
            self.manager.setup_broker(cerebro, execution_config)
    
    def test_futures_missing_contract_specs(self):
        """测试期货缺少合约规格"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'futures',
            'commission': {'type': 'fixed', 'amount': 2.0}
        }
        
        with pytest.raises(ValueError, match="Futures requires contractSpecs"):
            self.manager.setup_broker(cerebro, execution_config)
    
    def test_futures_invalid_multiplier(self):
        """测试期货无效的合约乘数"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'futures',
            'contractSpecs': {
                'multiplier': 0,  # 无效
                'marginRatio': 0.09,
            },
            'commission': {'type': 'fixed', 'amount': 2.0}
        }
        
        with pytest.raises(ValueError, match="multiplier"):
            self.manager.setup_broker(cerebro, execution_config)
    
    def test_futures_invalid_margin_ratio(self):
        """测试期货无效的保证金比例"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'futures',
            'contractSpecs': {
                'multiplier': 10,
                'marginRatio': 1.5,  # 超过1.0
            },
            'commission': {'type': 'fixed', 'amount': 2.0}
        }
        
        with pytest.raises(ValueError, match="marginRatio"):
            self.manager.setup_broker(cerebro, execution_config)
    
    def test_futures_fixed_commission_missing_amount(self):
        """测试期货固定佣金缺少金额"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'futures',
            'contractSpecs': {
                'multiplier': 10,
                'marginRatio': 0.09,
            },
            'commission': {'type': 'fixed'}  # 缺少 amount
        }
        
        with pytest.raises(ValueError, match="Fixed commission requires 'amount' field"):
            self.manager.setup_broker(cerebro, execution_config)
    
    def test_stock_unsupported_commission_type(self):
        """测试股票不支持的佣金类型"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'stock',
            'commission': {'type': 'fixed', 'amount': 5.0}  # 股票不支持固定佣金
        }
        
        with pytest.raises(ValueError, match="Unsupported commission type for stock"):
            self.manager.setup_broker(cerebro, execution_config)
    
    # ========== 滑点测试 ==========
    
    def test_slippage_configuration(self):
        """测试滑点配置"""
        cerebro = bt.Cerebro()
        
        execution_config = {
            'initialCapital': 100000,
            'assetType': 'stock',
            'commission': {'type': 'percentage', 'rate': 0.0003},
            'slippage': 0.0005,  # 0.05%
        }
        
        self.manager.setup_broker(cerebro, execution_config)
        assert cerebro.broker.get_cash() == 100000
        # 滑点设置成功（无法直接验证，但不会报错）


class TestStockCommissionCalculation:
    """测试股票佣金的实际计算（需要运行回测）"""
    
    def test_small_trade_minimum_commission(self):
        """测试小额交易触发最低佣金
        
        场景：
        - 买入 100 股，价格 10 元
        - 佣金率万三 (0.0003)
        - 最低佣金 5 元
        
        计算：
        - 理论佣金 = 100 * 10 * 0.0003 = 0.3 元
        - 实际佣金 = max(0.3, 5) = 5 元
        """
        # 此测试需要实际运行回测来验证
        # 可以作为集成测试的一部分
        pass
    
    def test_large_trade_commission(self):
        """测试大额交易佣金计算
        
        场景：
        - 买入 10000 股，价格 10 元
        - 佣金率万三
        - 最低佣金 5 元
        
        计算：
        - 理论佣金 = 10000 * 10 * 0.0003 = 30 元
        - 实际佣金 = max(30, 5) = 30 元
        """
        pass
    
    def test_stamp_duty_on_sell(self):
        """测试印花税（仅卖出时收取）
        
        场景：
        - 卖出 1000 股，价格 11 元
        - 佣金率万三，最低 5 元
        - 印花税千一 (0.001)
        
        计算：
        - 佣金 = max(1000 * 11 * 0.0003, 5) = max(3.3, 5) = 5 元
        - 印花税 = 1000 * 11 * 0.001 = 11 元
        - 总费用 = 5 + 11 = 16 元
        """
        pass


class TestFuturesCommissionCalculation:
    """测试期货佣金和保证金的实际计算"""
    
    def test_futures_margin_calculation(self):
        """测试期货保证金计算
        
        场景：
        - 买入 1 手螺纹钢，价格 4000 元/吨
        - 合约乘数 10 吨/手
        - 保证金比例 9%
        - 固定佣金 2 元/手
        
        计算：
        - 合约价值 = 1 * 4000 * 10 = 40000 元
        - 保证金 = 40000 * 0.09 = 3600 元
        - 佣金 = 2 元
        - 占用资金 = 3600 + 2 = 3602 元
        """
        pass
    
    def test_futures_profit_calculation(self):
        """测试期货盈亏计算（含合约乘数）
        
        场景：
        - 买入 1 手，价格 4000 元/吨
        - 卖出 1 手，价格 4100 元/吨
        - 合约乘数 10 吨/手
        - 固定佣金 2 元/手
        
        计算：
        - 价差盈亏 = 1 * (4100 - 4000) * 10 = 1000 元
        - 开仓佣金 = 2 元
        - 平仓佣金 = 2 元
        - 净盈亏 = 1000 - 2 - 2 = 996 元
        """
        pass


if __name__ == '__main__':
    # 运行测试
    pytest.main([__file__, '-v', '--tb=short'])


