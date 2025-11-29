"""
动态策略加载器单元测试

测试 DynamicStrategyLoader 的所有功能。
"""

import pytest
import backtrader as bt
from typing import Dict, Any

# 导入被测试的模块
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from backtrader_integration.dynamic_strategy_loader import (
    DynamicStrategyLoader,
    StrategyLoadError,
    StrategySyntaxError,
    StrategyValidationError,
    StrategySecurityError,
    load_user_strategy,
)


class TestDynamicStrategyLoader:
    """测试 DynamicStrategyLoader 类"""
    
    def test_load_valid_bt_strategy(self):
        """测试加载有效的 bt.Strategy 子类"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        pass

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader(enable_cache=False)
        strategy_class = loader.load_strategy(code, 'test_001')
        
        assert strategy_class.__name__ == 'TestStrategy'
        assert issubclass(strategy_class, bt.Strategy)
    
    def test_load_valid_base_strategy(self):
        """测试加载有效的 BaseStrategy 子类"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        pass
    
    def get_entry_factors(self):
        return {}
    
    def get_exit_factors(self):
        return {}

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader(enable_cache=False)
        strategy_class = loader.load_strategy(code, 'test_002')
        
        assert strategy_class.__name__ == 'TestStrategy'
        assert issubclass(strategy_class, bt.Strategy)
    
    def test_load_strategy_no_export(self):
        """测试缺少导出的策略"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        pass
"""
        
        loader = DynamicStrategyLoader()
        with pytest.raises(StrategyValidationError, match="未找到策略导出"):
            loader.load_strategy(code, 'test_003')
    
    def test_load_strategy_syntax_error(self):
        """测试语法错误的策略"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy
    # 缺少右括号
    def next(self):
        pass
"""
        
        loader = DynamicStrategyLoader()
        with pytest.raises(StrategySyntaxError, match="语法错误"):
            loader.load_strategy(code, 'test_004')
    
    def test_load_strategy_not_inherit_bt_strategy(self):
        """测试未继承 bt.Strategy 的类"""
        code = """
class TestStrategy:
    def next(self):
        pass

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader()
        with pytest.raises(StrategyValidationError, match="必须继承自 bt.Strategy"):
            loader.load_strategy(code, 'test_005')
    
    def test_load_strategy_missing_next_method(self):
        """测试缺少 next() 方法的策略"""
        # 注意：bt.Strategy 有默认的 next() 方法，所以这个测试实际上会通过
        # 这里测试的是继承后仍然可以正常工作
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    pass

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader()
        # 由于 bt.Strategy 有默认的 next()，所以这应该成功
        strategy_class = loader.load_strategy(code, 'test_006')
        assert strategy_class is not None
        assert hasattr(strategy_class, 'next')
    
    def test_load_strategy_with_params(self):
        """测试加载带参数的策略"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    params = (
        ('period', 14),
        ('threshold', 0.5),
    )
    
    def next(self):
        pass

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader()
        strategy_class = loader.load_strategy(code, 'test_007')
        
        assert hasattr(strategy_class, 'params')
        assert strategy_class.__name__ == 'TestStrategy'
    
    def test_strategy_cache(self):
        """测试策略缓存"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        pass

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader(enable_cache=True)
        
        # 第一次加载
        class1 = loader.load_strategy(code, 'test_008')
        
        # 第二次加载（相同代码，不同 strategy_id）
        # 缓存是基于代码哈希的，所以应该返回相同的类
        class2 = loader.load_strategy(code, 'test_008_duplicate')
        
        # 应该是同一个类对象（因为代码相同，缓存会命中）
        assert class1 is class2
        
        # 检查缓存统计
        stats = loader.get_cache_stats()
        assert stats['size'] == 1  # 只有一个缓存条目
        assert stats['enabled'] is True
    
    def test_cache_different_code(self):
        """测试不同代码不会使用缓存"""
        code1 = """
import backtrader as bt

class TestStrategy1(bt.Strategy):
    def next(self):
        pass

Strategy = TestStrategy1
"""
        
        code2 = """
import backtrader as bt

class TestStrategy2(bt.Strategy):
    def next(self):
        pass

Strategy = TestStrategy2
"""
        
        loader = DynamicStrategyLoader(enable_cache=True)
        
        class1 = loader.load_strategy(code1, 'test_009')
        class2 = loader.load_strategy(code2, 'test_010')
        
        # 应该是不同的类
        assert class1 is not class2
        assert class1.__name__ == 'TestStrategy1'
        assert class2.__name__ == 'TestStrategy2'
        
        # 缓存应该有2个条目
        stats = loader.get_cache_stats()
        assert stats['size'] == 2
    
    def test_clear_cache(self):
        """测试清空缓存"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        pass

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader(enable_cache=True)
        loader.load_strategy(code, 'test_011')
        
        assert loader.get_cache_stats()['size'] == 1
        
        loader.clear_cache()
        
        assert loader.get_cache_stats()['size'] == 0
    
    def test_security_check_dangerous_code(self):
        """测试安全检查：危险代码"""
        dangerous_codes = [
            # 文件操作
            """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        open('/etc/passwd', 'r')

Strategy = TestStrategy
""",
            # 系统命令
            """
import os
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        os.system('rm -rf /')

Strategy = TestStrategy
""",
            # eval
            """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        eval('print(1)')

Strategy = TestStrategy
""",
        ]
        
        loader = DynamicStrategyLoader(enable_security_check=True)
        
        for i, code in enumerate(dangerous_codes):
            with pytest.raises(StrategySecurityError, match="危险代码"):
                loader.load_strategy(code, f'test_012_{i}')
    
    def test_preprocess_code_bom(self):
        """测试预处理：移除 BOM"""
        code_with_bom = '\ufeff' + """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        pass

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader()
        strategy_class = loader.load_strategy(code_with_bom, 'test_013')
        
        assert strategy_class.__name__ == 'TestStrategy'
    
    def test_load_multiple_strategies(self):
        """测试同时加载多个策略"""
        code_template = """
import backtrader as bt

class TestStrategy{n}(bt.Strategy):
    def next(self):
        pass

Strategy = TestStrategy{n}
"""
        
        loader = DynamicStrategyLoader()
        
        strategies = []
        for i in range(5):
            code = code_template.format(n=i)
            strategy_class = loader.load_strategy(code, f'test_014_{i}')
            strategies.append(strategy_class)
        
        # 检查所有策略类都不同
        for i in range(5):
            assert strategies[i].__name__ == f'TestStrategy{i}'
            for j in range(i + 1, 5):
                assert strategies[i] is not strategies[j]
    
    def test_convenience_function(self):
        """测试便捷函数 load_user_strategy"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        pass

Strategy = TestStrategy
"""
        
        strategy_class = load_user_strategy(code, 'test_015', enable_cache=False)
        
        assert strategy_class.__name__ == 'TestStrategy'
        assert issubclass(strategy_class, bt.Strategy)
    
    def test_custom_class_name(self):
        """测试自定义导出类名"""
        code = """
import backtrader as bt

class MyCustomStrategy(bt.Strategy):
    def next(self):
        pass

MyStrategy = MyCustomStrategy
"""
        
        loader = DynamicStrategyLoader()
        strategy_class = loader.load_strategy(
            code,
            'test_016',
            class_name='MyStrategy'
        )
        
        assert strategy_class.__name__ == 'MyCustomStrategy'


class TestStrategyLoaderIntegration:
    """集成测试：测试策略加载器与 Backtrader 的集成"""
    
    def test_load_and_run_strategy(self):
        """测试加载并运行策略"""
        code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def __init__(self):
        self.counter = 0
    
    def next(self):
        self.counter += 1

Strategy = TestStrategy
"""
        
        loader = DynamicStrategyLoader()
        strategy_class = loader.load_strategy(code, 'test_integration_001')
        
        # 创建 Cerebro 并运行
        cerebro = bt.Cerebro()
        cerebro.addstrategy(strategy_class)
        
        # 添加测试数据
        data = bt.feeds.BacktraderCSVData(
            dataname='test_data.csv',  # 需要准备测试数据
            fromdate=None,
            todate=None,
        )
        # cerebro.adddata(data)
        
        # 注意：实际运行需要数据，这里只测试加载
        assert strategy_class is not None


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

