"""
动态策略加载器

负责安全地加载和验证用户上传的策略代码。

功能：
- 动态加载用户策略代码
- 安全性检查和验证
- 策略类缓存
- 错误处理

作者：AI Assistant
创建日期：2025-11-29
版本：v1.0
"""

import types
import sys
import hashlib
import logging
import re
import signal
from typing import Type, Dict, Any, Optional, List
from collections import OrderedDict

import backtrader as bt

logger = logging.getLogger(__name__)


class StrategyLoadError(Exception):
    """策略加载错误基类"""
    pass


class StrategySyntaxError(StrategyLoadError):
    """策略代码语法错误"""
    pass


class StrategyValidationError(StrategyLoadError):
    """策略验证错误"""
    pass


class StrategySecurityError(StrategyLoadError):
    """策略安全错误"""
    pass


class DynamicStrategyLoader:
    """
    动态策略加载器
    
    功能：
    - 动态加载用户策略代码
    - 安全性检查和验证
    - 策略类缓存
    - 错误处理
    
    使用示例：
    ```python
    loader = DynamicStrategyLoader(enable_cache=True)
    
    try:
        strategy_class = loader.load_strategy(
            strategy_code=code,
            strategy_id='abc-123',
            class_name='Strategy',
        )
        cerebro.addstrategy(strategy_class, **params)
    except StrategyLoadError as e:
        logger.error(f"Failed to load strategy: {e}")
    ```
    """
    
    # 允许导入的模块白名单
    ALLOWED_MODULES = {
        # 核心库
        'backtrader', 'bt',
        'typing', 'math', 'datetime', 'decimal', 'enum', 'collections',
        'itertools', 'functools', 're',
        
        # 数据分析库
        'pandas', 'numpy', 'pd', 'np',
        
        # 技术指标库（如果安装了）
        'talib',
        
        # 内部模块
        'base_strategy', 'BaseStrategy',
    }
    
    # 禁用的内置函数
    FORBIDDEN_BUILTINS = {
        'eval', 'exec', 'compile',
        'open', '__import__',
        'input', 'breakpoint',
        'globals', 'locals', 'vars',
    }
    
    # 危险代码模式（用于预检查）
    DANGEROUS_PATTERNS = {
        r'__import__\s*\(': '使用了 __import__',
        r'\bexec\s*\(': '使用了 exec',
        r'\beval\s*\(': '使用了 eval',
        r'\bopen\s*\(': '使用了文件操作 open()',
        r'os\.system': '使用了系统命令 os.system',
        r'subprocess': '使用了子进程 subprocess',
        r'socket\.': '使用了网络操作 socket',
        r'requests\.': '使用了网络请求 requests',
        r'urllib': '使用了网络请求 urllib',
    }
    
    def __init__(
        self,
        enable_cache: bool = True,
        cache_size: int = 100,
        enable_security_check: bool = True,
        load_timeout: int = 5,
    ):
        """
        初始化加载器
        
        Args:
            enable_cache: 是否启用策略类缓存
            cache_size: 缓存大小（LRU）
            enable_security_check: 是否启用安全检查
            load_timeout: 加载超时时间（秒）
        """
        self.enable_cache = enable_cache
        self.cache_size = cache_size
        self.enable_security_check = enable_security_check
        self.load_timeout = load_timeout
        
        # LRU 缓存
        self._cache: OrderedDict[str, Type[bt.Strategy]] = OrderedDict()
        
        logger.info(
            f"DynamicStrategyLoader initialized: "
            f"cache={enable_cache}, cache_size={cache_size}, "
            f"security_check={enable_security_check}, timeout={load_timeout}s"
        )
    
    def load_strategy(
        self,
        strategy_code: str,
        strategy_id: str,
        class_name: str = 'Strategy',
        validate: bool = True,
    ) -> Type[bt.Strategy]:
        """
        加载用户策略代码
        
        Args:
            strategy_code: 策略代码（Python）
            strategy_id: 策略ID（用于命名空间隔离）
            class_name: 导出的类名（默认 'Strategy'）
            validate: 是否执行验证
            
        Returns:
            策略类（未实例化）
            
        Raises:
            StrategySyntaxError: 语法错误
            StrategyValidationError: 验证失败
            StrategySecurityError: 安全检查失败
            StrategyLoadError: 其他加载错误
        """
        logger.info(f"Loading strategy: {strategy_id}, class_name={class_name}")
        
        # 预处理代码（在计算缓存键之前）
        processed_code = self._preprocess_code(strategy_code)
        
        # 1. 检查缓存（使用预处理后的代码计算哈希）
        if self.enable_cache:
            cache_key = self._get_cache_key(processed_code)
            cached_class = self._get_from_cache(cache_key)
            if cached_class:
                logger.info(f"Strategy loaded from cache: {strategy_id}")
                return cached_class
        
        # 2. 安全检查
        if self.enable_security_check:
            self._security_check(processed_code)
        
        # 3. 创建隔离模块
        module = self._create_isolated_module(strategy_id)
        
        # 4. 执行代码（带超时控制）
        try:
            self._execute_code_with_timeout(processed_code, module)
        except SyntaxError as e:
            error_msg = f"策略代码语法错误（行 {e.lineno}）: {e.msg}"
            logger.error(f"Syntax error in strategy {strategy_id}: {error_msg}")
            raise StrategySyntaxError(error_msg) from e
        except TimeoutError as e:
            error_msg = f"策略代码执行超时（超过 {self.load_timeout} 秒）"
            logger.error(f"Timeout loading strategy {strategy_id}")
            raise StrategyLoadError(error_msg) from e
        except Exception as e:
            error_msg = f"策略代码执行错误: {str(e)}"
            logger.error(f"Execution error in strategy {strategy_id}: {error_msg}", exc_info=True)
            raise StrategyLoadError(error_msg) from e
        
        # 6. 提取策略类
        strategy_class = module.__dict__.get(class_name)
        if not strategy_class:
            error_msg = (
                f"未找到策略导出。请确保代码末尾包含: {class_name} = YourStrategyClass\n"
                f"例如：Strategy = MyStrategy"
            )
            logger.error(f"Export not found in strategy {strategy_id}")
            raise StrategyValidationError(error_msg)
        
        # 7. 验证策略类
        if validate:
            self._validate_strategy_class(strategy_class, strategy_id)
        
        # 8. 注册到 sys.modules（Backtrader 需要从 sys.modules 中查找模块）
        sys.modules[module.__name__] = module
        logger.debug(f"Module registered to sys.modules: {module.__name__}")
        
        # 9. 缓存策略类（使用预处理后的代码）
        if self.enable_cache:
            cache_key = self._get_cache_key(processed_code)
            self._put_to_cache(cache_key, strategy_class)
        
        logger.info(f"Strategy loaded successfully: {strategy_class.__name__} (id={strategy_id})")
        return strategy_class
    
    def _create_isolated_module(self, strategy_id: str) -> types.ModuleType:
        """
        创建隔离的模块命名空间
        
        Args:
            strategy_id: 策略ID
            
        Returns:
            模块对象
        """
        # 生成唯一模块名（避免冲突）
        module_name = f'user_strategy_{strategy_id.replace("-", "_")}'
        module = types.ModuleType(module_name)
        
        # 注入必要的依赖
        import backtrader as bt
        from typing import Dict, Any, Optional, List, Tuple, Union
        
        module.__dict__.update({
            # Backtrader
            'backtrader': bt,
            'bt': bt,
            
            # Typing
            'Dict': Dict,
            'Any': Any,
            'Optional': Optional,
            'List': List,
            'Tuple': Tuple,
            'Union': Union,
            
            # 常用模块
            'math': __import__('math'),
            'datetime': __import__('datetime'),
            'decimal': __import__('decimal'),
            'enum': __import__('enum'),
        })
        
        # 注入 BaseStrategy（如果存在）
        try:
            # 获取 BaseStrategy 类
            import sys
            import os
            
            # 获取项目根目录并添加到 sys.path
            current_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.dirname(os.path.dirname(current_dir))  # backtest-worker/src
            
            if project_root not in sys.path:
                sys.path.insert(0, project_root)
            
            try:
                # 导入 BaseStrategy
                from backtrader_integration.strategy.base_strategy import BaseStrategy
                module.__dict__['BaseStrategy'] = BaseStrategy
                logger.debug(f"BaseStrategy injected into module {module_name}")
            except ImportError as e:
                logger.warning(f"Failed to import BaseStrategy: {e}")
                raise
            finally:
                # 清理 sys.path
                if project_root in sys.path:
                    sys.path.remove(project_root)
                    
        except (ImportError, Exception) as e:
            logger.warning(
                f"BaseStrategy not found for module {module_name}: {e}, "
                "users must use bt.Strategy directly"
            )
        
        # 尝试注入常用库（可选）
        try:
            import pandas as pd
            module.__dict__['pandas'] = pd
            module.__dict__['pd'] = pd
        except ImportError:
            pass
        
        try:
            import numpy as np
            module.__dict__['numpy'] = np
            module.__dict__['np'] = np
        except ImportError:
            pass
        
        logger.debug(f"Isolated module created: {module_name}")
        return module
    
    def _execute_code_with_timeout(
        self,
        code: str,
        module: types.ModuleType,
    ) -> None:
        """
        执行代码（带超时控制）
        
        Args:
            code: 策略代码
            module: 模块对象
            
        Raises:
            TimeoutError: 执行超时
            SyntaxError: 语法错误
            Exception: 其他执行错误
        """
        def timeout_handler(signum, frame):
            raise TimeoutError("Code execution timeout")
        
        # 设置超时
        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(self.load_timeout)
        
        try:
            # 执行代码
            exec(code, module.__dict__)
        finally:
            # 取消超时
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
    
    def _preprocess_code(self, code: str) -> str:
        """
        预处理策略代码
        
        Args:
            code: 原始代码
            
        Returns:
            处理后的代码
        """
        # 移除 BOM
        if code.startswith('\ufeff'):
            code = code[1:]
        
        # 移除首尾空白
        code = code.strip()
        
        # 替换相对导入为直接使用（因为我们已经在模块中注入了 BaseStrategy）
        # from .base_strategy import BaseStrategy -> # 已注入 BaseStrategy
        import re
        code = re.sub(
            r'from\s+\.base_strategy\s+import\s+BaseStrategy',
            '# BaseStrategy已通过模块注入',
            code
        )
        # from .strategy.base_strategy import BaseStrategy
        code = re.sub(
            r'from\s+\.strategy\.base_strategy\s+import\s+BaseStrategy',
            '# BaseStrategy已通过模块注入',
            code
        )
        
        # 确保代码以换行符结尾
        if not code.endswith('\n'):
            code += '\n'
        
        return code
    
    def _security_check(self, code: str) -> None:
        """
        安全检查（检测危险代码模式）
        
        Args:
            code: 策略代码
            
        Raises:
            StrategySecurityError: 发现危险代码
        """
        warnings = []
        
        for pattern, description in self.DANGEROUS_PATTERNS.items():
            if re.search(pattern, code):
                warnings.append(description)
        
        if warnings:
            error_msg = "检测到危险代码模式:\n" + "\n".join(f"  - {w}" for w in warnings)
            logger.warning(f"Security check failed: {error_msg}")
            raise StrategySecurityError(error_msg)
        
        logger.debug("Security check passed")
    
    def _validate_strategy_class(
        self,
        strategy_class: Any,
        strategy_id: str,
    ) -> None:
        """
        验证策略类
        
        Args:
            strategy_class: 策略类
            strategy_id: 策略ID（用于日志）
            
        Raises:
            StrategyValidationError: 验证失败
        """
        # 1. 检查是否是类
        if not isinstance(strategy_class, type):
            raise StrategyValidationError(
                f"Strategy 必须是类，当前类型: {type(strategy_class).__name__}"
            )
        
        # 2. 检查继承关系
        if not issubclass(strategy_class, bt.Strategy):
            raise StrategyValidationError(
                "策略类必须继承自 bt.Strategy 或 BaseStrategy"
            )
        
        # 3. 检查必需方法
        # 注意：bt.Strategy 本身有默认的 next() 方法，所以实际上所有子类都会有这个方法
        # 这个检查主要是确保方法存在（虽然总是会通过）
        if not hasattr(strategy_class, 'next'):
            raise StrategyValidationError(
                "策略类必须实现 next() 方法"
            )
        
        # 4. 检查 BaseStrategy 的必需方法（如果继承自 BaseStrategy）
        try:
            # 尝试导入 BaseStrategy
            try:
                from .strategy.base_strategy import BaseStrategy
            except ImportError:
                from backtrader_integration.strategy.base_strategy import BaseStrategy
            
            if issubclass(strategy_class, BaseStrategy):
                required_methods = ['get_entry_factors', 'get_exit_factors']
                missing_methods = [
                    method for method in required_methods
                    if not hasattr(strategy_class, method)
                ]
                
                if missing_methods:
                    raise StrategyValidationError(
                        f"BaseStrategy 子类必须实现以下方法: {', '.join(missing_methods)}"
                    )
                
                logger.debug(f"Strategy {strategy_id} validated as BaseStrategy subclass")
        except ImportError:
            # BaseStrategy 不可用，跳过此检查
            pass
        
        logger.debug(f"Strategy class validated: {strategy_class.__name__}")
    
    def _get_cache_key(self, code: str) -> str:
        """
        生成缓存键
        
        Args:
            code: 策略代码
            
        Returns:
            缓存键（代码的 SHA256 哈希）
        """
        return hashlib.sha256(code.encode('utf-8')).hexdigest()
    
    def _get_from_cache(self, cache_key: str) -> Optional[Type[bt.Strategy]]:
        """
        从缓存获取策略类
        
        Args:
            cache_key: 缓存键
            
        Returns:
            策略类，如果不存在则返回 None
        """
        if cache_key in self._cache:
            # LRU: 移到末尾（最近使用）
            self._cache.move_to_end(cache_key)
            return self._cache[cache_key]
        return None
    
    def _put_to_cache(self, cache_key: str, strategy_class: Type[bt.Strategy]) -> None:
        """
        将策略类放入缓存
        
        Args:
            cache_key: 缓存键
            strategy_class: 策略类
        """
        self._cache[cache_key] = strategy_class
        self._cache.move_to_end(cache_key)
        
        # LRU 淘汰
        while len(self._cache) > self.cache_size:
            evicted_key = next(iter(self._cache))
            del self._cache[evicted_key]
            logger.debug(f"Cache eviction: removed key {evicted_key[:8]}...")
        
        logger.debug(f"Strategy cached: key={cache_key[:8]}..., cache_size={len(self._cache)}")
    
    def clear_cache(self) -> None:
        """清空缓存"""
        count = len(self._cache)
        self._cache.clear()
        logger.info(f"Strategy cache cleared: {count} entries removed")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        获取缓存统计信息
        
        Returns:
            缓存统计信息
        """
        return {
            'size': len(self._cache),
            'max_size': self.cache_size,
            'enabled': self.enable_cache,
        }
    
    def unload_strategy(self, strategy_id: str) -> None:
        """
        卸载策略（从 sys.modules 中移除）
        
        Args:
            strategy_id: 策略ID
        """
        module_name = f'user_strategy_{strategy_id.replace("-", "_")}'
        if module_name in sys.modules:
            del sys.modules[module_name]
            logger.info(f"Strategy unloaded from sys.modules: {module_name}")
        else:
            logger.debug(f"Strategy not found in sys.modules: {module_name}")


# 便捷函数
def load_user_strategy(
    strategy_code: str,
    strategy_id: str,
    class_name: str = 'Strategy',
    **kwargs
) -> Type[bt.Strategy]:
    """
    便捷函数：加载用户策略
    
    Args:
        strategy_code: 策略代码
        strategy_id: 策略ID
        class_name: 导出的类名
        **kwargs: 传递给 DynamicStrategyLoader 的参数
        
    Returns:
        策略类
    """
    loader = DynamicStrategyLoader(**kwargs)
    return loader.load_strategy(strategy_code, strategy_id, class_name)

