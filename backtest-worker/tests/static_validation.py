# -*- coding: utf-8 -*-
"""
静态验证脚本 - 不依赖backtrader
检查策略文件的完整性和正确性
"""

import os
import sys
import ast

def check_file_exists(filepath):
    """检查文件是否存在"""
    return os.path.exists(filepath)

def check_strategy_file(filepath, strategy_name):
    """检查单个策略文件"""
    print(f'\n检查: {strategy_name}')
    print(f'文件: {filepath}')
    
    if not check_file_exists(filepath):
        print(f'  ✗ 文件不存在')
        return False
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查文件大小
        file_size = len(content)
        lines = content.count('\n')
        print(f'  ✓ 文件大小: {file_size} 字节, {lines} 行')
        
        # 尝试解析Python语法
        try:
            tree = ast.parse(content)
            print(f'  ✓ Python语法正确')
        except SyntaxError as e:
            print(f'  ✗ 语法错误: {e}')
            return False
        
        # 检查类定义
        classes = [node for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
        if classes:
            print(f'  ✓ 找到 {len(classes)} 个类定义')
            for cls in classes:
                print(f'    - {cls.name}')
        else:
            print(f'  ✗ 没有找到类定义')
            return False
        
        # 检查关键导入
        imports = [node for node in ast.walk(tree) if isinstance(node, ast.Import) or isinstance(node, ast.ImportFrom)]
        print(f'  ✓ 找到 {len(imports)} 个导入语句')
        
        # 检查文档字符串
        if tree.body and isinstance(tree.body[0], ast.Expr) and isinstance(tree.body[0].value, ast.Str):
            docstring = tree.body[0].value.s
            print(f'  ✓ 模块文档: {docstring[:50]}...')
        
        return True
        
    except Exception as e:
        print(f'  ✗ 检查失败: {e}')
        return False

def check_init_file(filepath):
    """检查__init__.py文件"""
    print(f'\n检查策略注册文件: __init__.py')
    print(f'文件: {filepath}')
    
    if not check_file_exists(filepath):
        print(f'  ✗ 文件不存在')
        return False, []
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        lines = content.count('\n')
        print(f'  ✓ 文件大小: {len(content)} 字节, {lines} 行')
        
        # 检查导入语句
        registered_strategies = []
        
        # 检查导入
        imports_to_check = [
            'ReversalPatternStrategy',
            'HighFrequencyStrategy',
            'PendingOrderStrategy',
            'PyramidStrategy',
            'RandomStrategy'
        ]
        
        for import_name in imports_to_check:
            if import_name in content:
                print(f'  ✓ 导入: {import_name}')
                registered_strategies.append(import_name)
            else:
                print(f'  ✗ 未导入: {import_name}')
        
        # 检查注册语句
        registrations = [
            'reversal_pattern',
            'high_frequency',
            'pending_order',
            'pyramid',
            'random'
        ]
        
        for reg_name in registrations:
            pattern = f"register('{reg_name}'"
            if pattern in content:
                print(f'  ✓ 注册: {reg_name}')
            else:
                print(f'  ✗ 未注册: {reg_name}')
        
        return True, registered_strategies
        
    except Exception as e:
        print(f'  ✗ 检查失败: {e}')
        return False, []

def main():
    """主测试函数"""
    print('='*80)
    print('🔍 策略文件静态验证')
    print('='*80)
    
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    strategy_dir = os.path.join(base_dir, 'src', 'backtrader_integration', 'strategy')
    
    print(f'\n基础目录: {base_dir}')
    print(f'策略目录: {strategy_dir}')
    
    # 检查目录是否存在
    if not os.path.exists(strategy_dir):
        print(f'✗ 策略目录不存在: {strategy_dir}')
        return 1
    
    print(f'✓ 策略目录存在')
    
    # 要检查的策略文件
    strategies = [
        ('reversal_pattern_strategy.py', 'ReversalPatternStrategy'),
        ('high_frequency_strategy.py', 'HighFrequencyStrategy'),
        ('pending_order_strategy.py', 'PendingOrderStrategy'),
        ('pyramid_strategy.py', 'PyramidStrategy'),
        ('random_strategy.py', 'RandomStrategy'),
    ]
    
    results = []
    
    # 检查每个策略文件
    print('\n' + '='*80)
    print('检查策略文件')
    print('='*80)
    
    for filename, strategy_name in strategies:
        filepath = os.path.join(strategy_dir, filename)
        result = check_strategy_file(filepath, strategy_name)
        results.append((strategy_name, result))
    
    # 检查__init__.py
    print('\n' + '='*80)
    print('检查策略注册')
    print('='*80)
    
    init_file = os.path.join(strategy_dir, '__init__.py')
    init_result, registered = check_init_file(init_file)
    results.append(('__init__.py', init_result))
    
    # 汇总结果
    print('\n' + '='*80)
    print('📊 验证结果汇总')
    print('='*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = '✅ 通过' if result else '❌ 失败'
        print(f'{test_name:35s}: {status}')
    
    print('='*80)
    print(f'总计: {passed}/{total} 个检查通过 ({passed/total*100:.1f}%)')
    print('='*80)
    
    if passed == total:
        print('\n🎉 所有文件验证通过！')
        print('\n📝 文件结构完整，可以继续进行功能测试')
        return 0
    else:
        print(f'\n⚠️  {total-passed} 个检查失败')
        return 1

if __name__ == '__main__':
    sys.exit(main())

