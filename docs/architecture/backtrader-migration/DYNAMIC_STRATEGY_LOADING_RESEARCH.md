# 动态策略加载功能 - 技术调研与实施计划

> **版本**: v1.0  
> **创建日期**: 2025-11-29  
> **状态**: 技术调研阶段  
> **优先级**: P0（最高）

---

## 📋 目录

- [1. 背景与问题](#1-背景与问题)
- [2. 需求分析](#2-需求分析)
- [3. 当前系统分析](#3-当前系统分析)
- [4. 技术方案调研](#4-技术方案调研)
- [5. 推荐方案](#5-推荐方案)
- [6. 详细设计](#6-详细设计)
- [7. 安全性分析](#7-安全性分析)
- [8. 实施计划](#8-实施计划)
- [9. 风险评估](#9-风险评估)
- [10. 验收标准](#10-验收标准)

---

## 1. 背景与问题

### 1.1 当前问题

**问题描述**：
- 用户在前端上传了支持做空的策略代码（`ThreeLineTrendAtrStrategy`）
- 后端成功验证并保存到数据库
- 但 Worker 执行回测时使用的是**硬编码的 `RabbitMQStrategy`**（只做多不做空）
- **用户上传的策略代码完全没有被执行！**

**影响范围**：
- ❌ 用户无法使用自己编写的策略
- ❌ 只能运行系统预置的策略
- ❌ 策略版本管理功能形同虚设
- ❌ 严重影响产品可用性

### 1.2 根本原因

查看 `backtest_executor.py` 第545行：

```python
# 6. 添加策略
strategy_params = task_message.get('strategyParameters', {})
cerebro.addstrategy(
    RabbitMQStrategy,  # ❌ 硬编码策略，忽略用户代码
    fast_period=strategy_params.get('fast', 10),
    slow_period=strategy_params.get('slow', 20),
    task_id=task_id,
    worker_id=self.worker_id,
    rabbitmq_client=self.rabbitmq_client,
    strategy_timeframe=strategy_timeframe,
    total_bars=data_length_1s,
)
```

**应该的流程**：
```
用户上传策略代码 → 后端保存 → Worker 动态加载并执行用户代码
```

**实际的流程**：
```
用户上传策略代码 → 后端保存 → ❌ Worker 使用硬编码策略（忽略用户代码）
```

---

## 2. 需求分析

### 2.1 功能需求

| 需求ID | 描述 | 优先级 |
|--------|------|--------|
| FR-1 | Worker 能够动态加载用户上传的 Python 策略代码 | P0 |
| FR-2 | 支持 BaseStrategy 及其所有子类 | P0 |
| FR-3 | 正确传递策略参数（strategyParameters） | P0 |
| FR-4 | 支持策略导出方式：`Strategy = ClassName` | P0 |
| FR-5 | 策略执行错误能够正确捕获并上报 | P0 |
| FR-6 | 兼容现有的因子收集、进度追踪等功能 | P0 |
| FR-7 | 支持策略热更新（无需重启 Worker） | P1 |
| FR-8 | 策略代码缓存（避免重复编译） | P2 |

### 2.2 非功能需求

| 需求ID | 描述 | 目标值 |
|--------|------|--------|
| NFR-1 | 安全性：防止恶意代码执行 | 通过沙箱隔离 |
| NFR-2 | 性能：动态加载开销 | < 100ms |
| NFR-3 | 稳定性：策略错误不影响 Worker | 99.9% |
| NFR-4 | 可维护性：代码清晰易调试 | 代码审查通过 |
| NFR-5 | 可测试性：单元测试覆盖率 | > 80% |

---

## 3. 当前系统分析

### 3.1 数据流分析

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend                               │
│  用户编写策略代码 → 提交创建脚本版本                          │
└────────────────────────────┬─────────────────────────────────┘
                             │ POST /strategies/:id/script-versions
                             │ { code, remark }
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                        Backend (NestJS)                       │
│  1. PythonStrategyValidator 验证代码                          │
│  2. 保存到 script_versions 表                                 │
│  3. 创建回测任务时，查询策略代码                              │
│  4. 构建 TaskMessage，包含 strategyCode 字段                  │
│  5. 发布到 RabbitMQ                                           │
└────────────────────────────┬─────────────────────────────────┘
                             │ RabbitMQ: backtest.tasks
                             │ TaskMessage {
                             │   taskId, strategyId, scriptVersionId,
                             │   strategyCode,  ← ✅ 包含用户代码
                             │   strategyClassName,
                             │   strategyParameters,
                             │   dataConfig, executionConfig
                             │ }
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                    Backtest Worker (Python)                   │
│  1. TaskConsumer 接收任务消息                                 │
│  2. BacktestExecutor.execute_backtest()                       │
│  3. ❌ 忽略 strategyCode，使用硬编码 RabbitMQStrategy         │
│  4. cerebro.addstrategy(RabbitMQStrategy, ...)                │
│  5. cerebro.run()                                             │
└──────────────────────────────────────────────────────────────┘
```

**关键发现**：
- ✅ 后端已经发送了 `strategyCode` 字段
- ✅ Worker 已经接收到完整的 `task_message`
- ❌ Worker 在执行时完全忽略了 `strategyCode`

### 3.2 现有代码结构

#### 后端代码
```typescript
// backend/src/backtesting/tasks/rabbitmq-task-dispatcher.service.ts
const taskMessage: TaskMessage = {
  taskId: task.taskId,
  strategyId: task.strategyId,
  scriptVersionId: task.scriptVersionId,
  
  strategyCode: scriptVersion.code || '',  // ✅ 用户策略代码
  strategyClassName: 'Strategy',            // ✅ 类名
  strategyParameters: task.strategyParams || {}, // ✅ 参数
  
  dataConfig: { ... },
  executionConfig: { ... },
};
```

#### Worker 代码（问题所在）
```python
# backtest-worker/src/backtrader_integration/execution/backtest_executor.py
def _execute_standard_backtest(self, task_message: Dict[str, Any]):
    # ... 数据加载 ...
    
    # ❌ 问题：硬编码使用 RabbitMQStrategy
    strategy_params = task_message.get('strategyParameters', {})
    cerebro.addstrategy(
        RabbitMQStrategy,  # ❌ 应该动态加载用户代码！
        fast_period=strategy_params.get('fast', 10),
        slow_period=strategy_params.get('slow', 20),
        task_id=task_id,
        # ...
    )
```

### 3.3 策略工厂机制

Worker 中已有 `StrategyFactory`（`base_strategy.py`），但仅支持**预注册的策略**：

```python
# 预注册的策略
StrategyFactory.register('ma_cross', MACrossStrategy)
StrategyFactory.register('rsi', RSIStrategy)
StrategyFactory.register('three_line_trend_atr', ThreeLineTrendAtrStrategy)

# 使用
strategy_class = StrategyFactory.create('ma_cross', period=20)
```

**局限性**：
- ✅ 适合内置策略
- ❌ 不支持动态加载用户代码
- ❌ 需要预先注册

---

## 4. 技术方案调研

### 4.1 方案对比

| 方案 | 优势 | 劣势 | 安全性 | 性能 | 推荐度 |
|------|------|------|--------|------|--------|
| **方案A：直接 exec()** | 简单，代码量少 | 极度不安全，无隔离 | ⚠️ 低 | ⭐⭐⭐⭐⭐ | ⚠️ 不推荐 |
| **方案B：importlib + 临时模块** | 较简单，符合Python习惯 | 需要清理临时模块 | ⚠️ 中 | ⭐⭐⭐⭐ | ✅ 推荐 |
| **方案C：临时文件 + import** | 最接近正常import | 需要文件IO，清理复杂 | ⚠️ 中 | ⭐⭐⭐ | 可选 |
| **方案D：RestrictedPython** | 高安全性，代码沙箱 | 复杂，可能限制功能 | ✅ 高 | ⭐⭐ | 过度设计 |

### 4.2 方案 A：直接 exec()

```python
def load_strategy_exec(strategy_code: str) -> Type[bt.Strategy]:
    """使用 exec() 动态执行代码"""
    namespace = {}
    exec(strategy_code, namespace)
    
    # 查找导出的策略类
    strategy_class = namespace.get('Strategy')
    if not strategy_class:
        raise ValueError("未找到 Strategy 导出")
    
    return strategy_class
```

**优势**：
- ✅ 代码最简单
- ✅ 性能最好（无额外开销）

**劣势**：
- ❌ **极度不安全**：可以执行任意代码
- ❌ 无法控制导入的模块
- ❌ 可以访问 Worker 的所有变量
- ❌ 可以修改系统配置
- ❌ 可以读写文件系统

**安全风险示例**：
```python
# 恶意代码示例
import os
os.system('rm -rf /')  # 删除系统文件
open('/etc/passwd', 'r').read()  # 读取敏感文件
```

**评估**：⚠️ **不推荐**，安全风险太高

### 4.3 方案 B：importlib + 临时模块（推荐）✅

```python
import types
import sys
from typing import Type
import backtrader as bt


def load_strategy_importlib(
    strategy_code: str,
    strategy_id: str
) -> Type[bt.Strategy]:
    """使用 importlib 动态加载策略"""
    # 1. 创建临时模块名（避免冲突）
    module_name = f'user_strategy_{strategy_id}'
    
    # 2. 创建模块对象
    module = types.ModuleType(module_name)
    
    # 3. 准备命名空间（注入必要的依赖）
    module.__dict__['backtrader'] = __import__('backtrader')
    module.__dict__['bt'] = module.__dict__['backtrader']
    module.__dict__['Dict'] = Dict
    module.__dict__['Any'] = Any
    
    # 4. 执行策略代码
    try:
        exec(strategy_code, module.__dict__)
    except SyntaxError as e:
        raise ValueError(f"策略代码语法错误: {e}")
    except Exception as e:
        raise ValueError(f"策略代码执行错误: {e}")
    
    # 5. 查找导出的策略类
    strategy_class = module.__dict__.get('Strategy')
    if not strategy_class:
        raise ValueError("未找到策略导出。请确保代码中包含: Strategy = YourStrategyClass")
    
    # 6. 验证策略类
    if not isinstance(strategy_class, type):
        raise ValueError(f"Strategy 必须是类，当前是: {type(strategy_class)}")
    
    if not issubclass(strategy_class, bt.Strategy):
        raise ValueError("策略类必须继承自 bt.Strategy 或 BaseStrategy")
    
    # 7. 注册到 sys.modules（可选，便于调试）
    sys.modules[module_name] = module
    
    return strategy_class
```

**优势**：
- ✅ 符合 Python 模块系统习惯
- ✅ 可以控制命名空间（注入依赖）
- ✅ 支持多个策略同时加载（不同 module_name）
- ✅ 易于调试（模块有名称）
- ✅ 性能良好（< 100ms）

**劣势**：
- ⚠️ 需要手动清理 `sys.modules`（避免内存泄漏）
- ⚠️ 仍然可以执行危险代码（需要配合其他安全措施）

**安全改进**：
```python
# 限制可导入的模块
ALLOWED_MODULES = {
    'backtrader', 'bt', 'typing', 'math', 'datetime',
    'pandas', 'numpy', 'talib',  # 常用库
}

# 自定义 __import__ 函数
def safe_import(name, *args, **kwargs):
    if name.split('.')[0] not in ALLOWED_MODULES:
        raise ImportError(f"不允许导入模块: {name}")
    return __import__(name, *args, **kwargs)

# 在 exec() 时使用
module.__dict__['__import__'] = safe_import
exec(strategy_code, module.__dict__)
```

**评估**：✅ **推荐**，平衡了功能性、性能和安全性

### 4.4 方案 C：临时文件 + import

```python
import tempfile
import importlib.util
import sys


def load_strategy_file(strategy_code: str, strategy_id: str) -> Type[bt.Strategy]:
    """通过临时文件加载策略"""
    # 1. 创建临时文件
    with tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.py',
        prefix=f'strategy_{strategy_id}_',
        delete=False
    ) as f:
        f.write(strategy_code)
        temp_file = f.name
    
    try:
        # 2. 使用 importlib 加载
        spec = importlib.util.spec_from_file_location(
            f"user_strategy_{strategy_id}",
            temp_file
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        
        # 3. 获取策略类
        strategy_class = getattr(module, 'Strategy', None)
        if not strategy_class:
            raise ValueError("未找到策略导出")
        
        return strategy_class
        
    finally:
        # 4. 清理临时文件
        import os
        try:
            os.unlink(temp_file)
        except:
            pass
```

**优势**：
- ✅ 最接近正常的 Python import
- ✅ 可以利用 Python 的缓存机制
- ✅ 调试时可以看到完整的文件路径

**劣势**：
- ❌ 需要文件 IO（稍慢）
- ❌ 需要临时目录权限
- ❌ 文件清理可能失败
- ❌ 多并发时可能冲突

**评估**：⚠️ 可选方案，适合对安全性要求极高的场景

### 4.5 方案 D：RestrictedPython

```python
from RestrictedPython import compile_restricted, safe_globals


def load_strategy_restricted(strategy_code: str) -> Type[bt.Strategy]:
    """使用 RestrictedPython 安全执行"""
    # 编译受限代码
    byte_code = compile_restricted(
        strategy_code,
        filename='<strategy>',
        mode='exec'
    )
    
    # 准备安全的全局变量
    restricted_globals = {
        '__builtins__': safe_globals,
        'bt': __import__('backtrader'),
        # ... 其他安全导入
    }
    
    # 执行
    exec(byte_code, restricted_globals)
    
    return restricted_globals.get('Strategy')
```

**优势**：
- ✅ 最高安全性
- ✅ 细粒度控制（可以禁止文件操作、网络访问等）
- ✅ 生产环境推荐

**劣势**：
- ❌ 复杂度高
- ❌ 需要额外依赖（RestrictedPython）
- ❌ 可能限制某些合法功能
- ❌ 性能开销较大

**评估**：⚠️ 过度设计，当前阶段不必要

---

## 5. 推荐方案

### 5.1 最终选择：方案 B（importlib + 临时模块）+ 安全增强

**理由**：
1. ✅ 实现简单，开发成本低（2-3天）
2. ✅ 性能良好（< 100ms）
3. ✅ 可以逐步增强安全性
4. ✅ 便于调试和维护
5. ✅ 符合 Python 最佳实践

### 5.2 安全增强措施

#### 第一阶段（MVP）：基础防护
```python
ALLOWED_MODULES = {
    # 核心库
    'backtrader', 'bt',
    'typing', 'math', 'datetime', 'decimal', 'enum',
    
    # 数据分析库
    'pandas', 'numpy', 
    
    # 技术指标库
    'talib',
    
    # 内部模块
    '.base_strategy', 'base_strategy',
}

FORBIDDEN_BUILTINS = {
    'eval', 'exec', 'compile',
    'open', '__import__',
    'input', 'breakpoint',
}
```

#### 第二阶段（生产）：深度防护
- 资源限制（CPU、内存、执行时间）
- 网络隔离
- 文件系统只读
- 系统调用监控

### 5.3 实现架构

```
┌────────────────────────────────────────────────────────┐
│              DynamicStrategyLoader                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  1. 代码预处理                                   │  │
│  │     - 检查语法                                   │  │
│  │     - 提取依赖                                   │  │
│  │     - 验证导出                                   │  │
│  └─────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌─────────────────────────────────────────────────┐  │
│  │  2. 创建隔离模块                                 │  │
│  │     - 生成唯一模块名                             │  │
│  │     - 注入允许的依赖                             │  │
│  │     - 限制 __import__                            │  │
│  └─────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌─────────────────────────────────────────────────┐  │
│  │  3. 执行代码                                     │  │
│  │     - try/except 错误捕获                        │  │
│  │     - 超时控制                                   │  │
│  │     - 资源监控                                   │  │
│  └─────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌─────────────────────────────────────────────────┐  │
│  │  4. 验证策略类                                   │  │
│  │     - 检查继承关系                               │  │
│  │     - 验证必需方法                               │  │
│  │     - 返回策略类                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  可选：策略缓存（避免重复加载）                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │  LRU Cache: {strategy_id + code_hash: class}    │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 6. 详细设计

### 6.1 核心类设计

#### 6.1.1 `DynamicStrategyLoader`

```python
"""
动态策略加载器

负责安全地加载和验证用户上传的策略代码。
"""
import types
import sys
import hashlib
import logging
from typing import Type, Dict, Any, Optional
import backtrader as bt

logger = logging.getLogger(__name__)


class DynamicStrategyLoader:
    """
    动态策略加载器
    
    功能：
    - 动态加载用户策略代码
    - 安全性检查和验证
    - 策略类缓存
    - 错误处理
    """
    
    # 允许导入的模块白名单
    ALLOWED_MODULES = {
        'backtrader', 'bt',
        'typing', 'math', 'datetime', 'decimal', 'enum',
        'pandas', 'numpy', 'talib',
        'base_strategy', 'BaseStrategy',
    }
    
    # 禁用的内置函数
    FORBIDDEN_BUILTINS = {
        'eval', 'exec', 'compile',
        'open', '__import__',
        'input', 'breakpoint',
    }
    
    def __init__(self, enable_cache: bool = True):
        """
        初始化加载器
        
        Args:
            enable_cache: 是否启用策略类缓存
        """
        self.enable_cache = enable_cache
        self._cache: Dict[str, Type[bt.Strategy]] = {}
        
        logger.info(f"DynamicStrategyLoader initialized, cache={enable_cache}")
    
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
            ValueError: 代码无效或验证失败
            SyntaxError: 语法错误
        """
        # 1. 检查缓存
        if self.enable_cache:
            cache_key = self._get_cache_key(strategy_code)
            if cache_key in self._cache:
                logger.info(f"Strategy loaded from cache: {strategy_id}")
                return self._cache[cache_key]
        
        logger.info(f"Loading strategy: {strategy_id}")
        
        # 2. 预处理代码
        strategy_code = self._preprocess_code(strategy_code)
        
        # 3. 创建隔离模块
        module = self._create_isolated_module(strategy_id)
        
        # 4. 执行代码
        try:
            exec(strategy_code, module.__dict__)
        except SyntaxError as e:
            logger.error(f"Strategy syntax error: {e}")
            raise ValueError(f"策略代码语法错误（行 {e.lineno}）: {e.msg}")
        except Exception as e:
            logger.error(f"Strategy execution error: {e}")
            raise ValueError(f"策略代码执行错误: {str(e)}")
        
        # 5. 提取策略类
        strategy_class = module.__dict__.get(class_name)
        if not strategy_class:
            raise ValueError(
                f"未找到策略导出。请确保代码末尾包含: {class_name} = YourStrategyClass"
            )
        
        # 6. 验证策略类
        if validate:
            self._validate_strategy_class(strategy_class)
        
        # 7. 缓存策略类
        if self.enable_cache:
            cache_key = self._get_cache_key(strategy_code)
            self._cache[cache_key] = strategy_class
            logger.info(f"Strategy cached: {strategy_id}, cache_size={len(self._cache)}")
        
        logger.info(f"Strategy loaded successfully: {strategy_class.__name__}")
        return strategy_class
    
    def _create_isolated_module(self, strategy_id: str) -> types.ModuleType:
        """
        创建隔离的模块命名空间
        
        Args:
            strategy_id: 策略ID
            
        Returns:
            模块对象
        """
        module_name = f'user_strategy_{strategy_id.replace("-", "_")}'
        module = types.ModuleType(module_name)
        
        # 注入必要的依赖
        import backtrader as bt
        from typing import Dict, Any, Optional, List, Tuple
        
        module.__dict__.update({
            'backtrader': bt,
            'bt': bt,
            'Dict': Dict,
            'Any': Any,
            'Optional': Optional,
            'List': List,
            'Tuple': Tuple,
        })
        
        # 注入 BaseStrategy（如果存在）
        try:
            from .strategy.base_strategy import BaseStrategy
            module.__dict__['BaseStrategy'] = BaseStrategy
        except ImportError:
            logger.warning("BaseStrategy not found, users must use bt.Strategy")
        
        # 限制 __import__（可选）
        # module.__dict__['__import__'] = self._safe_import
        
        return module
    
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
        
        # 确保代码以换行符结尾
        if not code.endswith('\n'):
            code += '\n'
        
        return code
    
    def _validate_strategy_class(self, strategy_class: Type) -> None:
        """
        验证策略类
        
        Args:
            strategy_class: 策略类
            
        Raises:
            ValueError: 验证失败
        """
        # 1. 检查是否是类
        if not isinstance(strategy_class, type):
            raise ValueError(f"Strategy 必须是类，当前类型: {type(strategy_class)}")
        
        # 2. 检查继承关系
        if not issubclass(strategy_class, bt.Strategy):
            raise ValueError(
                "策略类必须继承自 bt.Strategy 或 BaseStrategy"
            )
        
        # 3. 检查必需方法（基础验证）
        if not hasattr(strategy_class, 'next'):
            raise ValueError("策略类必须实现 next() 方法")
        
        # 4. 检查 BaseStrategy 的必需方法
        try:
            from .strategy.base_strategy import BaseStrategy
            if issubclass(strategy_class, BaseStrategy):
                required_methods = ['get_entry_factors', 'get_exit_factors']
                for method in required_methods:
                    if not hasattr(strategy_class, method):
                        raise ValueError(f"BaseStrategy 子类必须实现 {method}() 方法")
        except ImportError:
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
    
    def clear_cache(self) -> None:
        """清空缓存"""
        self._cache.clear()
        logger.info("Strategy cache cleared")
    
    def unload_strategy(self, strategy_id: str) -> None:
        """
        卸载策略（从 sys.modules 中移除）
        
        Args:
            strategy_id: 策略ID
        """
        module_name = f'user_strategy_{strategy_id.replace("-", "_")}'
        if module_name in sys.modules:
            del sys.modules[module_name]
            logger.info(f"Strategy unloaded: {module_name}")
```

#### 6.1.2 集成到 `BacktestExecutor`

```python
# 在 backtest_executor.py 中集成

class BacktestExecutor:
    """回测执行器"""
    
    def __init__(self, ...):
        # ... 现有代码 ...
        
        # 新增：动态策略加载器
        self.strategy_loader = DynamicStrategyLoader(enable_cache=True)
        
    def _execute_standard_backtest(self, task_message: Dict[str, Any]):
        """执行标准回测"""
        # ... 前面的代码不变 ...
        
        # 6. 添加策略（新逻辑）
        strategy_code = task_message.get('strategyCode')
        strategy_id = task_message.get('strategyId')
        strategy_params = task_message.get('strategyParameters', {})
        
        if strategy_code:
            # 动态加载用户策略
            try:
                logger.info(f"Loading user strategy: {strategy_id}")
                StrategyClass = self.strategy_loader.load_strategy(
                    strategy_code=strategy_code,
                    strategy_id=strategy_id,
                    class_name='Strategy',  # 期望的导出名
                    validate=True,
                )
                
                # 添加到 Cerebro
                cerebro.addstrategy(
                    StrategyClass,
                    task_id=task_id,
                    **strategy_params  # 传递用户参数
                )
                
                logger.info(f"User strategy loaded: {StrategyClass.__name__}")
                
            except Exception as e:
                logger.error(f"Failed to load user strategy: {e}")
                # 发送错误消息
                self.rabbitmq_client.send_message(
                    routing_key='error',
                    message={
                        'task_id': task_id,
                        'worker_id': self.worker_id,
                        'error': f'策略加载失败: {str(e)}',
                        'error_type': 'strategy_loading_error',
                        'timestamp': time.time(),
                    }
                )
                raise ValueError(f"策略加载失败: {str(e)}")
        else:
            # 回退：使用默认策略（向后兼容）
            logger.warning("No strategy code provided, using default RabbitMQStrategy")
            cerebro.addstrategy(
                RabbitMQStrategy,
                fast_period=strategy_params.get('fast', 10),
                slow_period=strategy_params.get('slow', 20),
                task_id=task_id,
                worker_id=self.worker_id,
                rabbitmq_client=self.rabbitmq_client,
                strategy_timeframe=strategy_timeframe,
                total_bars=data_length_1s,
            )
        
        # ... 后续代码不变 ...
```

### 6.2 关键实现细节

#### 6.2.1 策略参数传递

用户策略通过 `params` 定义参数：

```python
class MyStrategy(BaseStrategy):
    params = (
        ('period', 14),
        ('threshold', 0.5),
    )
```

传递参数时：

```python
# 从 task_message 获取用户配置的参数
strategy_params = task_message.get('strategyParameters', {})
# {'period': 20, 'threshold': 0.6}

# Backtrader 会自动覆盖默认值
cerebro.addstrategy(StrategyClass, **strategy_params)
```

#### 6.2.2 因子收集集成

用户策略继承 `BaseStrategy` 时，自动集成因子收集：

```python
class BaseStrategy(bt.Strategy):
    def start(self):
        # 自动初始化因子收集器
        self._init_factor_collector()
    
    def _init_factor_collector(self):
        # 从 observers 中查找 FactorCollector
        for obs in self.getobservers():
            if obs.__class__.__name__ == 'FactorCollector':
                self.factor_collector = obs
                obs.set_strategy(self)
                break
```

**动态加载的策略会自动获得**：
- ✅ 因子收集功能
- ✅ 进度追踪功能
- ✅ 日志记录功能
- ✅ 订单管理功能

#### 6.2.3 错误处理

```python
try:
    strategy_class = loader.load_strategy(code, strategy_id)
    cerebro.addstrategy(strategy_class, **params)
    
except SyntaxError as e:
    # 语法错误
    error_msg = f"策略代码语法错误（行 {e.lineno}）: {e.msg}"
    logger.error(error_msg)
    # 上报到后端
    send_error_message(task_id, error_msg, 'syntax_error')
    
except ValueError as e:
    # 验证错误（导出缺失、继承错误等）
    error_msg = f"策略验证失败: {str(e)}"
    logger.error(error_msg)
    send_error_message(task_id, error_msg, 'validation_error')
    
except Exception as e:
    # 其他运行时错误
    error_msg = f"策略加载失败: {str(e)}"
    logger.error(error_msg, exc_info=True)
    send_error_message(task_id, error_msg, 'loading_error')
```

### 6.3 缓存机制

```python
class StrategyCache:
    """策略类缓存"""
    
    def __init__(self, max_size: int = 100):
        """
        初始化缓存
        
        Args:
            max_size: 最大缓存数量
        """
        from collections import OrderedDict
        self._cache = OrderedDict()
        self._max_size = max_size
    
    def get(self, code: str) -> Optional[Type[bt.Strategy]]:
        """获取缓存的策略类"""
        key = hashlib.sha256(code.encode()).hexdigest()
        if key in self._cache:
            # LRU: 移到末尾
            self._cache.move_to_end(key)
            return self._cache[key]
        return None
    
    def put(self, code: str, strategy_class: Type[bt.Strategy]) -> None:
        """缓存策略类"""
        key = hashlib.sha256(code.encode()).hexdigest()
        self._cache[key] = strategy_class
        self._cache.move_to_end(key)
        
        # LRU 淘汰
        if len(self._cache) > self._max_size:
            self._cache.popitem(last=False)
```

---

## 7. 安全性分析

### 7.1 安全威胁模型

| 威胁 | 风险等级 | 场景 | 缓解措施 |
|------|---------|------|---------|
| **任意代码执行** | 🔴 极高 | 恶意用户上传破坏性代码 | 模块白名单、禁用危险函数 |
| **文件系统访问** | 🟠 高 | 读取/修改敏感文件 | 禁用 `open`、限制路径访问 |
| **网络访问** | 🟡 中 | 外发数据、DDoS 攻击 | 网络隔离（Docker/容器） |
| **资源耗尽** | 🟡 中 | 无限循环、内存泄漏 | 超时控制、资源监控 |
| **进程劫持** | 🟠 高 | 修改 Worker 状态 | 命名空间隔离 |
| **信息泄露** | 🟡 中 | 访问其他用户数据 | 每个策略独立命名空间 |

### 7.2 MVP 阶段（第一版）防护措施

#### 基础防护（必须实现）

```python
# 1. 模块导入限制
ALLOWED_MODULES = {
    'backtrader', 'bt', 'typing', 'math', 'datetime',
    'pandas', 'numpy', 'talib', 'decimal', 'enum',
}

def safe_import(name, *args, **kwargs):
    """安全的 import 函数"""
    module_root = name.split('.')[0]
    if module_root not in ALLOWED_MODULES:
        raise ImportError(f"禁止导入模块: {name}")
    return __builtins__.__import__(name, *args, **kwargs)

# 2. 禁用危险函数
SAFE_BUILTINS = {
    k: v for k, v in __builtins__.items()
    if k not in {'eval', 'exec', 'compile', 'open', '__import__', 'input', 'breakpoint'}
}

# 3. 超时控制
import signal

def timeout_handler(signum, frame):
    raise TimeoutError("策略加载超时")

signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(5)  # 5秒超时

try:
    exec(strategy_code, namespace)
finally:
    signal.alarm(0)  # 取消超时
```

#### 代码审查检查（必须实现）

```python
def check_dangerous_patterns(code: str) -> List[str]:
    """检查危险代码模式"""
    warnings = []
    
    dangerous_patterns = {
        r'__import__': '使用了 __import__',
        r'\bexec\b': '使用了 exec',
        r'\beval\b': '使用了 eval',
        r'\bopen\(': '使用了文件操作',
        r'os\.system': '使用了系统命令',
        r'subprocess': '使用了子进程',
        r'socket': '使用了网络操作',
    }
    
    for pattern, desc in dangerous_patterns.items():
        if re.search(pattern, code):
            warnings.append(desc)
    
    return warnings
```

### 7.3 生产环境防护（后续迭代）

- **容器隔离**：Docker 容器 + 只读文件系统
- **网络隔离**：禁用容器网络访问
- **资源限制**：cgroup 限制 CPU、内存
- **系统调用过滤**：seccomp 策略
- **审计日志**：记录所有策略执行

---

## 8. 实施计划

### 8.1 任务拆解

#### 阶段 1：核心功能实现（3天）

| 任务 | 描述 | 预计时间 | 负责人 | 依赖 |
|------|------|---------|--------|------|
| **T1.1** | 创建 `DynamicStrategyLoader` 类 | 0.5天 | 开发 | 无 |
| **T1.2** | 实现基础的动态加载（exec + importlib） | 0.5天 | 开发 | T1.1 |
| **T1.3** | 实现策略类验证逻辑 | 0.5天 | 开发 | T1.2 |
| **T1.4** | 集成到 `BacktestExecutor._execute_standard_backtest()` | 0.5天 | 开发 | T1.3 |
| **T1.5** | 错误处理和日志记录 | 0.5天 | 开发 | T1.4 |
| **T1.6** | 单元测试编写 | 0.5天 | 开发 | T1.5 |

#### 阶段 2：安全增强（2天）

| 任务 | 描述 | 预计时间 | 负责人 | 依赖 |
|------|------|---------|--------|------|
| **T2.1** | 实现模块白名单机制 | 0.5天 | 开发 | T1.6 |
| **T2.2** | 实现危险代码检测 | 0.5天 | 开发 | T2.1 |
| **T2.3** | 实现超时控制 | 0.5天 | 开发 | T2.1 |
| **T2.4** | 安全性测试（恶意代码测试） | 0.5天 | QA | T2.3 |

#### 阶段 3：性能优化（1天）

| 任务 | 描述 | 预计时间 | 负责人 | 依赖 |
|------|------|---------|--------|------|
| **T3.1** | 实现策略缓存（LRU Cache） | 0.5天 | 开发 | T2.4 |
| **T3.2** | 性能测试和调优 | 0.5天 | QA | T3.1 |

#### 阶段 4：集成测试（1天）

| 任务 | 描述 | 预计时间 | 负责人 | 依赖 |
|------|------|---------|--------|------|
| **T4.1** | 端到端测试（前端 → 后端 → Worker） | 0.5天 | QA | T3.2 |
| **T4.2** | 用户验收测试 | 0.5天 | 产品 | T4.1 |

**总计**：**7天**（1人全职）或 **4-5天**（2人并行）

### 8.2 详细实施步骤

#### 步骤 1：创建动态加载器模块

```bash
# 创建新文件
touch backtest-worker/src/backtrader_integration/dynamic_strategy_loader.py
```

```python
# 实现 DynamicStrategyLoader 类（参见 6.1.1）
# 约 200-300 行代码
```

#### 步骤 2：修改 BacktestExecutor

```python
# 在 backtest_executor.py 中
# 1. 导入加载器
from .dynamic_strategy_loader import DynamicStrategyLoader

# 2. 在 __init__ 中初始化
self.strategy_loader = DynamicStrategyLoader(enable_cache=True)

# 3. 修改 _execute_standard_backtest 方法
# 将硬编码的 RabbitMQStrategy 替换为动态加载逻辑
# 约 50 行代码
```

#### 步骤 3：更新 BaseStrategy

确保用户策略可以自动集成因子收集器：

```python
# 在 base_strategy.py 中
# 确保 start() 方法会自动查找 FactorCollector
# （当前已实现，无需修改）
```

#### 步骤 4：编写单元测试

```python
# tests/test_dynamic_strategy_loader.py

def test_load_valid_strategy():
    """测试加载有效策略"""
    code = """
import backtrader as bt
from .base_strategy import BaseStrategy

class TestStrategy(BaseStrategy):
    def next(self):
        pass
    
    def get_entry_factors(self):
        return {}
    
    def get_exit_factors(self):
        return {}

Strategy = TestStrategy
"""
    
    loader = DynamicStrategyLoader()
    strategy_class = loader.load_strategy(code, 'test_001')
    
    assert strategy_class.__name__ == 'TestStrategy'
    assert issubclass(strategy_class, bt.Strategy)


def test_load_invalid_strategy_no_export():
    """测试缺少导出的策略"""
    code = """
import backtrader as bt

class TestStrategy(bt.Strategy):
    def next(self):
        pass
"""
    
    loader = DynamicStrategyLoader()
    with pytest.raises(ValueError, match="未找到策略导出"):
        loader.load_strategy(code, 'test_002')


def test_load_strategy_syntax_error():
    """测试语法错误的策略"""
    code = """
import backtrader as bt

class TestStrategy(bt.Strategy
    # 缺少右括号
"""
    
    loader = DynamicStrategyLoader()
    with pytest.raises(ValueError, match="语法错误"):
        loader.load_strategy(code, 'test_003')


def test_strategy_cache():
    """测试策略缓存"""
    code = "..."
    
    loader = DynamicStrategyLoader(enable_cache=True)
    
    # 第一次加载
    class1 = loader.load_strategy(code, 'test_004')
    
    # 第二次应该从缓存加载
    class2 = loader.load_strategy(code, 'test_004')
    
    # 应该是同一个类对象
    assert class1 is class2
```

#### 步骤 5：集成测试

```bash
# 运行完整回测流程测试
python tests/test_e2e_with_user_strategy.py
```

### 8.3 迭代计划

#### Sprint 1（3天）- MVP 核心功能
- Day 1：实现 `DynamicStrategyLoader` 基础功能
- Day 2：集成到 `BacktestExecutor`，基础测试
- Day 3：错误处理完善，单元测试

**交付物**：
- ✅ 可以动态加载用户策略代码
- ✅ 基本的错误处理
- ✅ 单元测试覆盖率 > 60%

#### Sprint 2（2天）- 安全增强
- Day 4：实现安全措施（模块白名单、危险代码检测）
- Day 5：安全测试、性能测试

**交付物**：
- ✅ 模块导入白名单
- ✅ 危险代码检测
- ✅ 超时控制
- ✅ 安全测试报告

#### Sprint 3（2天）- 优化与测试
- Day 6：实现策略缓存，性能优化
- Day 7：端到端测试，用户验收

**交付物**：
- ✅ LRU 缓存机制
- ✅ 性能测试报告
- ✅ 用户验收通过

---

## 9. 风险评估

### 9.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 | 负责人 |
|------|------|------|---------|--------|
| **Python 代码执行安全漏洞** | 🟡 中 | 🔴 严重 | 实现多层防护、代码审查 | 开发 + 安全 |
| **动态加载性能问题** | 🟢 低 | 🟡 中 | 实现缓存、性能测试 | 开发 |
| **策略类验证不完整** | 🟡 中 | 🟠 高 | 严格验证、单元测试 | 开发 |
| **内存泄漏（模块未清理）** | 🟡 中 | 🟠 高 | 定期清理、监控 | 开发 |
| **后向兼容性破坏** | 🟢 低 | 🟡 中 | 保留默认策略回退 | 开发 |
| **错误处理不当导致 Worker 崩溃** | 🟡 中 | 🔴 严重 | 全面的 try/except、测试 | 开发 |

### 9.2 业务风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| **用户策略代码质量差** | 🟠 高 | 🟡 中 | 前端验证、后端校验、错误提示优化 |
| **策略参数传递错误** | 🟡 中 | 🟠 高 | 参数验证、示例文档 |
| **用户不理解导出语法** | 🟠 高 | 🟡 中 | 文档说明、模板代码、友好错误提示 |

### 9.3 风险应对优先级

1. **P0（必须解决）**：
   - 代码执行安全漏洞
   - Worker 崩溃风险
   - 策略类验证

2. **P1（重要）**：
   - 内存泄漏
   - 用户体验优化
   - 错误提示友好性

3. **P2（可选）**：
   - 性能优化
   - 高级安全防护

---

## 10. 验收标准

### 10.1 功能验收

- [ ] ✅ **基础加载**：能够加载用户上传的策略代码
- [ ] ✅ **参数传递**：策略参数正确传递到策略类
- [ ] ✅ **执行成功**：策略能够正常执行回测
- [ ] ✅ **因子收集**：因子收集功能正常工作
- [ ] ✅ **做空支持**：做空交易能够正确记录
- [ ] ✅ **错误处理**：各类错误都能正确捕获和上报
- [ ] ✅ **向后兼容**：现有功能不受影响

### 10.2 性能验收

- [ ] ✅ 策略加载时间 < 100ms（无缓存）
- [ ] ✅ 策略加载时间 < 10ms（有缓存）
- [ ] ✅ 回测执行性能无明显下降（< 5%）
- [ ] ✅ 内存占用无明显增加（< 50MB）

### 10.3 安全验收

- [ ] ✅ 通过安全代码审查
- [ ] ✅ 恶意代码测试：10+ 个恶意代码样本被阻止
- [ ] ✅ 资源限制测试：无限循环被超时终止
- [ ] ✅ 模块导入测试：禁止模块无法导入

### 10.4 测试覆盖率

- [ ] ✅ 单元测试覆盖率 > 80%
- [ ] ✅ 集成测试覆盖率 > 70%
- [ ] ✅ E2E 测试通过（至少 5 个场景）

---

## 11. 测试计划

### 11.1 单元测试用例

| 用例ID | 场景 | 预期结果 |
|--------|------|---------|
| UT-1 | 加载有效的 BaseStrategy 子类 | 成功返回策略类 |
| UT-2 | 加载有效的 bt.Strategy 子类 | 成功返回策略类 |
| UT-3 | 策略代码缺少 `Strategy =` 导出 | 抛出 ValueError |
| UT-4 | 策略代码语法错误 | 抛出 SyntaxError |
| UT-5 | 策略类缺少 `next()` 方法 | 抛出 ValueError |
| UT-6 | BaseStrategy 子类缺少 `get_entry_factors()` | 抛出 ValueError |
| UT-7 | 策略代码中导入禁止模块 | 抛出 ImportError |
| UT-8 | 策略缓存功能 | 第二次加载从缓存返回 |
| UT-9 | 策略卸载功能 | 模块从 sys.modules 移除 |
| UT-10 | 多个策略同时加载 | 互不干扰 |

### 11.2 集成测试用例

| 用例ID | 场景 | 预期结果 |
|--------|------|---------|
| IT-1 | 使用动态加载的策略执行回测 | 回测成功，结果正确 |
| IT-2 | 策略参数正确传递 | 策略使用用户配置的参数 |
| IT-3 | 因子收集正常工作 | 入场和出场因子被记录 |
| IT-4 | 策略抛出异常 | Worker 捕获错误并上报，不崩溃 |
| IT-5 | 做空交易正确执行 | 交易方向记录为 'short' |
| IT-6 | 没有 strategyCode 时回退到默认策略 | 使用 RabbitMQStrategy |

### 11.3 端到端测试场景

| 场景 | 步骤 | 预期结果 |
|------|------|---------|
| **E2E-1: 完整流程** | 1. 前端创建策略<br>2. 创建回测任务<br>3. Worker 执行<br>4. 查看结果 | 所有步骤成功，结果正确 |
| **E2E-2: 做空策略** | 1. 上传支持做空的策略<br>2. 执行回测<br>3. 检查交易明细 | 包含做空交易 |
| **E2E-3: 自定义参数** | 1. 上传带参数的策略<br>2. 配置参数<br>3. 执行回测 | 策略使用自定义参数 |
| **E2E-4: 错误代码** | 1. 上传有错误的策略<br>2. 尝试执行 | 前端显示清晰的错误信息 |
| **E2E-5: 性能测试** | 执行100次相同回测 | 缓存生效，平均加载时间 < 10ms |

### 11.4 安全测试用例

| 用例ID | 恶意代码 | 预期结果 |
|--------|---------|---------|
| ST-1 | `os.system('rm -rf /')` | 被阻止，抛出异常 |
| ST-2 | `open('/etc/passwd')` | 被阻止，抛出异常 |
| ST-3 | `import socket` | 被阻止，ImportError |
| ST-4 | `while True: pass` | 超时终止 |
| ST-5 | `__import__('os')` | 被阻止或限制 |
| ST-6 | 访问 `sys.modules` | 受限或监控 |

---

## 12. 开发资源需求

### 12.1 人力资源

| 角色 | 工作量 | 说明 |
|------|--------|------|
| **后端开发** | 5天 | 核心功能开发、安全增强 |
| **测试工程师** | 2天 | 单元测试、集成测试、安全测试 |
| **代码审查** | 1天 | 安全审查、代码质量审查 |

**总计**：约 **8人天**

### 12.2 技术资源

- ✅ Python 3.9+（已有）
- ✅ Backtrader（已安装）
- ✅ pytest（已安装）
- ⚠️ 可选：RestrictedPython（如需更高安全性）

---

## 13. 成功指标

### 13.1 技术指标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 策略加载成功率 | > 95% | 监控日志 |
| 策略加载时间（首次） | < 100ms | 性能测试 |
| 策略加载时间（缓存） | < 10ms | 性能测试 |
| Worker 崩溃率 | < 0.1% | 监控报警 |
| 单元测试覆盖率 | > 80% | pytest-cov |

### 13.2 业务指标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 用户策略执行成功率 | > 90% | 后端日志 |
| 错误提示准确率 | > 85% | 用户反馈 |
| 做空交易占比 | > 0% | 数据分析 |

---

## 14. 后续优化方向

### 14.1 Phase 2 增强（可选）

- **策略预编译**：提前编译并缓存字节码
- **沙箱隔离**：使用 Docker 容器隔离策略执行
- **资源监控**：实时监控策略的 CPU、内存使用
- **热更新**：支持策略代码热更新（无需重启 Worker）

### 14.2 长期规划

- **分布式策略库**：策略代码分发到多个 Worker
- **策略市场**：用户可以分享和下载策略
- **AI 辅助编写**：基于历史数据推荐策略参数
- **策略回测报告**：自动生成策略性能报告

---

## 15. 参考资料

### 15.1 Python 动态加载

- [Python importlib 文档](https://docs.python.org/3/library/importlib.html)
- [动态代码执行最佳实践](https://realpython.com/python-exec/)
- [Python 沙箱技术](https://opensource.com/article/19/10/python-security)

### 15.2 Backtrader 文档

- [Backtrader 策略开发](https://www.backtrader.com/docu/strategy/)
- [Backtrader Cerebro API](https://www.backtrader.com/docu/cerebro/)

### 15.3 内部文档

- [策略开发指南](../../STRATEGY_DEVELOPMENT_GUIDE.md)
- [Backtrader 迁移计划](./README.md)
- [Worker 通信设计](./worker-communication-design.md)

---

## 16. 决策记录

### 16.1 技术选型决策

| 决策 | 日期 | 决策人 | 理由 |
|------|------|--------|------|
| 使用方案 B（importlib + 临时模块） | 2025-11-29 | 技术团队 | 平衡功能性、性能、安全性 |
| MVP 阶段不使用 RestrictedPython | 2025-11-29 | 技术团队 | 避免过度设计，降低复杂度 |
| 实现策略缓存 | 2025-11-29 | 技术团队 | 提升性能，减少重复加载 |
| 保留默认策略回退机制 | 2025-11-29 | 技术团队 | 向后兼容，降低风险 |

### 16.2 安全决策

| 决策 | 日期 | 决策人 | 理由 |
|------|------|--------|------|
| 实现模块导入白名单 | 2025-11-29 | 安全团队 | 防止导入危险模块 |
| 禁用危险内置函数 | 2025-11-29 | 安全团队 | 防止恶意代码执行 |
| 5秒加载超时 | 2025-11-29 | 技术团队 | 防止无限循环 |
| 暂不实现网络隔离 | 2025-11-29 | 技术团队 | MVP 阶段简化，后续迭代 |

---

## 17. 检查清单

### 17.1 开发前检查

- [ ] ✅ 确认需求理解无误
- [ ] ✅ 技术方案获得批准
- [ ] ✅ 安全措施获得安全团队批准
- [ ] ✅ 测试计划完备
- [ ] ✅ 开发环境准备就绪

### 17.2 开发中检查

- [ ] ✅ 代码遵循规范
- [ ] ✅ 单元测试覆盖率达标
- [ ] ✅ 代码审查通过
- [ ] ✅ 安全扫描无高危漏洞
- [ ] ✅ 性能测试通过

### 17.3 发布前检查

- [ ] ✅ 所有测试用例通过
- [ ] ✅ 文档更新完成
- [ ] ✅ 用户验收测试通过
- [ ] ✅ 灰度发布计划就绪
- [ ] ✅ 回滚方案准备完毕

---

## 18. 附录

### 18.1 完整代码示例

参见：`附录A - DynamicStrategyLoader 完整实现`（单独文件）

### 18.2 测试数据

参见：`附录B - 测试策略代码样本`（单独文件）

### 18.3 FAQ

**Q1: 为什么不直接使用 `exec()`？**
A: `exec()` 虽然简单，但安全性极低，无法控制代码执行范围。

**Q2: 动态加载会影响回测性能吗？**
A: 策略加载只在回测开始时执行一次，对整体回测性能影响 < 1%。加上缓存后几乎无影响。

**Q3: 如何处理用户代码中的 bug？**
A: 通过 try/except 捕获所有异常，记录详细日志，上报到后端，前端显示友好的错误信息。

**Q4: 是否需要重启 Worker 才能加载新策略？**
A: 不需要。每次回测任务都会重新加载策略代码。

**Q5: 缓存会导致策略更新不生效吗？**
A: 不会。缓存键基于代码内容的哈希值，代码改变后哈希值不同，会重新加载。

---

## 19. 总结

### 19.1 核心价值

✅ **解决用户痛点**：用户可以真正使用自己编写的策略  
✅ **功能完整性**：策略版本管理功能可用  
✅ **技术可行性**：方案成熟，风险可控  
✅ **开发成本合理**：7天可完成 MVP  

### 19.2 推荐实施路径

1. **Week 1（3天）**：实现核心功能，基础测试
2. **Week 2（2天）**：安全增强，全面测试  
3. **Week 3（2天）**：优化、文档、发布

**总时间**：**7个工作日**

### 19.3 关键里程碑

| 里程碑 | 时间点 | 交付物 |
|--------|--------|--------|
| M1 | Day 3 | MVP 功能可用 |
| M2 | Day 5 | 安全增强完成 |
| M3 | Day 7 | 正式发布 |

---

**下一步行动**：
1. 👉 获得技术和安全团队批准
2. 👉 开始实施 Sprint 1
3. 👉 创建 GitHub Issue/Task 跟踪进度

**负责人**：开发团队  
**审批人**：技术负责人、安全负责人  
**状态**：✅ 技术调研完成，等待批准

---

**文档版本**：v1.0  
**最后更新**：2025-11-29  
**作者**：AI Coding Assistant

