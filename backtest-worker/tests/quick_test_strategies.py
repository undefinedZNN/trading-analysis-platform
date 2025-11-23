# -*- coding: utf-8 -*-
"""
快速策略测试脚本
不依赖外部数据，仅验证策略加载和基本逻辑
"""

import sys
import os

# 添加路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def test_imports():
    """测试策略导入"""
    print('='*80)
    print('测试 1: 策略模块导入')
    print('='*80)
    
    try:
        from src.backtrader_integration.strategy import (
            StrategyFactory,
            ReversalPatternStrategy,
            HighFrequencyStrategy,
            PendingOrderStrategy,
            PyramidStrategy,
            RandomStrategy
        )
        print('✓ 所有策略模块导入成功')
        return True
    except ImportError as e:
        print(f'✗ 导入失败: {e}')
        return False

def test_registration():
    """测试策略注册"""
    print('\n' + '='*80)
    print('测试 2: 策略工厂注册')
    print('='*80)
    
    try:
        from src.backtrader_integration.strategy import StrategyFactory
        
        strategies = [
            ('ma_cross', 'MA交叉策略'),
            ('rsi', 'RSI超买超卖策略'),
            ('three_line_momentum', '三线动量+DMI策略'),
            ('reversal_pattern', '反转形态策略'),
            ('high_frequency', '最高频策略'),
            ('pending_order', '挂单策略'),
            ('pyramid', '金字塔加仓策略'),
            ('random', '随机策略'),
        ]
        
        success_count = 0
        for strategy_name, description in strategies:
            try:
                info = StrategyFactory.get_strategy_info(strategy_name)
                if info:
                    print(f'✓ {strategy_name:25s}: {info.get("description", description)}')
                    success_count += 1
                else:
                    print(f'✗ {strategy_name:25s}: 信息为空')
            except Exception as e:
                print(f'✗ {strategy_name:25s}: {e}')
        
        print(f'\n成功注册: {success_count}/{len(strategies)} 个策略')
        return success_count == len(strategies)
        
    except Exception as e:
        print(f'✗ 测试失败: {e}')
        import traceback
        traceback.print_exc()
        return False

def test_strategy_params():
    """测试策略参数"""
    print('\n' + '='*80)
    print('测试 3: 策略参数检查')
    print('='*80)
    
    try:
        from src.backtrader_integration.strategy import StrategyFactory
        
        test_strategies = [
            'reversal_pattern',
            'high_frequency',
            'pending_order',
            'pyramid',
            'random'
        ]
        
        for strategy_name in test_strategies:
            info = StrategyFactory.get_strategy_info(strategy_name)
            params = info.get('params', {})
            print(f'\n{strategy_name}:')
            print(f'  参数数量: {len(params)}')
            
            # 显示前3个参数作为示例
            for i, (key, value) in enumerate(list(params.items())[:3]):
                print(f'  - {key}: {value}')
            
            if len(params) > 3:
                print(f'  ... 还有 {len(params)-3} 个参数')
        
        return True
        
    except Exception as e:
        print(f'✗ 测试失败: {e}')
        return False

def test_strategy_instantiation():
    """测试策略实例化（不需要backtrader）"""
    print('\n' + '='*80)
    print('测试 4: 策略类检查')
    print('='*80)
    
    try:
        from src.backtrader_integration.strategy import (
            ReversalPatternStrategy,
            HighFrequencyStrategy,
            PendingOrderStrategy,
            PyramidStrategy,
            RandomStrategy
        )
        
        strategies = [
            ('ReversalPatternStrategy', ReversalPatternStrategy),
            ('HighFrequencyStrategy', HighFrequencyStrategy),
            ('PendingOrderStrategy', PendingOrderStrategy),
            ('PyramidStrategy', PyramidStrategy),
            ('RandomStrategy', RandomStrategy),
        ]
        
        for name, strategy_class in strategies:
            # 检查类属性
            has_params = hasattr(strategy_class, 'params')
            has_description = hasattr(strategy_class, 'description')
            
            print(f'✓ {name:30s}: params={has_params}, description={has_description}')
            
            if has_description:
                print(f'  描述: {strategy_class.description[:60]}...')
        
        return True
        
    except Exception as e:
        print(f'✗ 测试失败: {e}')
        import traceback
        traceback.print_exc()
        return False

def main():
    """主测试函数"""
    print('\n' + '='*80)
    print('🧪 高级策略快速测试')
    print('='*80 + '\n')
    
    results = []
    
    # 测试1: 导入
    results.append(('导入测试', test_imports()))
    
    # 测试2: 注册
    results.append(('注册测试', test_registration()))
    
    # 测试3: 参数
    results.append(('参数测试', test_strategy_params()))
    
    # 测试4: 实例化
    results.append(('类检查测试', test_strategy_instantiation()))
    
    # 汇总结果
    print('\n' + '='*80)
    print('📊 测试结果汇总')
    print('='*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = '✅ 通过' if result else '❌ 失败'
        print(f'{test_name:20s}: {status}')
    
    print('='*80)
    print(f'总计: {passed}/{total} 个测试通过 ({passed/total*100:.1f}%)')
    print('='*80)
    
    if passed == total:
        print('\n🎉 所有测试通过！')
        return 0
    else:
        print(f'\n⚠️  {total-passed} 个测试失败')
        return 1

if __name__ == '__main__':
    sys.exit(main())

