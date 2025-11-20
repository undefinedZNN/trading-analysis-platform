# 策略参数传递 - 快速指南

**版本**: v1.0  
**更新时间**: 2025-11-20  
**状态**: ✅ 已确认

---

## 🎯 方案概述

**核心方案**: **前端动态配置 + Worker 校验**

- 用户在前端手动配置参数（名称、类型、默认值）
- 参数定义保存到数据库
- Worker 执行时校验参数是否与代码中的 `params` 匹配
- 校验失败则终止任务并报错

---

## 🔄 完整流程

```
1. 用户编写策略代码（定义 params）
   ↓
2. 用户在前端配置参数
   - 参数名称（必须与代码一致）
   - 参数类型（int/float/bool/str）
   - 默认值
   - 约束条件（min/max）
   ↓
3. 保存到数据库
   ↓
4. 创建回测任务
   - 前端加载参数
   - 用户修改参数值
   ↓
5. Backend 基础验证（类型、约束）
   ↓
6. 发送任务到 Worker
   ↓
7. Worker 加载策略类
   ↓
8. Worker 校验参数 ⭐ 关键
   - 检查参数名称是否匹配
   - 检查参数类型是否兼容
   - 校验失败 → 终止任务
   - 校验通过 → 继续执行
   ↓
9. 运行回测
```

---

## 💾 数据库

```sql
-- 参数定义表
CREATE TABLE strategy_parameters (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,     -- int, float, bool, str
  default_value TEXT NOT NULL,
  description TEXT,
  constraints JSONB,             -- {min, max, options}
  UNIQUE(strategy_id, name)
);

-- 任务表（扩展）
ALTER TABLE backtest_tasks ADD COLUMN parameters JSONB;
```

---

## ⚙️ Worker 校验逻辑

```python
def _validate_parameters(self, StrategyClass, user_params):
    """校验参数是否匹配"""
    
    # 1. 提取策略中定义的参数
    strategy_params = self._extract_strategy_params(StrategyClass)
    # 例如: {'fast_period': {'type': 'int', 'default': 10}}
    
    # 2. 检查参数名称
    strategy_param_names = set(strategy_params.keys())
    user_param_names = set(user_params.keys())
    
    extra_params = user_param_names - strategy_param_names
    if extra_params:
        return {'valid': False, 'errors': [f'Unknown parameters: {extra_params}']}
    
    # 3. 检查参数类型
    for name, value in user_params.items():
        if name in strategy_params:
            expected_type = strategy_params[name]['type']
            actual_type = type(value).__name__
            
            if not self._is_type_compatible(expected_type, actual_type):
                return {
                    'valid': False,
                    'errors': [f'{name}: expected {expected_type}, got {actual_type}']
                }
    
    return {'valid': True, 'errors': []}
```

---

## 🎨 前端 UI

```
┌─────────────────────────────────────────────────────┐
│ 策略编辑                                 [保存]     │
├─────────────────────────────────────────────────────┤
│ 【代码】                                             │
│  class MACrossStrategy(bt.Strategy):               │
│      params = (                                    │
│          ('fast_period', 10),                      │
│          ('slow_period', 20),                      │
│      )                                             │
│                                                     │
│ 【参数配置】                        [+ 添加参数]   │
│  ┌───────────────────────────────────────────────┐ │
│  │ 参数名: fast_period                           │ │
│  │ 类型: [int ▼]  默认值: [10]                  │ │
│  │ 约束: 最小 [1] 最大 [100]                     │ │
│  │ 描述: 快速均线周期                            │ │
│  └───────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────┐ │
│  │ 参数名: slow_period                           │ │
│  │ 类型: [int ▼]  默认值: [20]                  │ │
│  │ 约束: 最小 [1] 最大 [100]                     │ │
│  │ 描述: 慢速均线周期                            │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 📡 API

### 保存策略和参数

```typescript
POST /api/strategies

Request:
{
  "name": "MA Cross",
  "code": "...",
  "className": "MACrossStrategy",
  "parameters": [
    {
      "name": "fast_period",
      "type": "int",
      "defaultValue": 10,
      "constraints": {"min": 1, "max": 100}
    },
    {
      "name": "slow_period",
      "type": "int",
      "defaultValue": 20,
      "constraints": {"min": 1, "max": 100}
    }
  ]
}
```

### 创建回测任务

```typescript
POST /api/backtests

Request:
{
  "strategyId": "strategy-001",
  "datasetId": "dataset-001",
  "parameters": {
    "fast_period": 15,    // 用户修改
    "slow_period": 30     // 用户修改
  }
}
```

---

## ❌ 错误处理

### 校验失败场景

#### 1. 参数名称不匹配

**策略代码**:
```python
params = (('fast_period', 10),)
```

**用户传入**:
```python
{'fast_ma': 15}  # ❌ 错误的名称
```

**Worker 行为**:
- 终止任务
- 发送错误: `Unknown parameters: fast_ma`
- 任务状态: `FAILED`

#### 2. 参数类型不匹配

**策略代码**:
```python
params = (('fast_period', 10),)  # int
```

**用户传入**:
```python
{'fast_period': "15"}  # ❌ str 而不是 int
```

**Worker 行为**:
- 终止任务
- 发送错误: `fast_period: expected int, got str`
- 任务状态: `FAILED`

### 错误消息格式

```json
{
  "taskId": "task-001",
  "status": "FAILED",
  "error": {
    "type": "PARAMETER_VALIDATION_ERROR",
    "message": "Strategy parameters validation failed",
    "code": "INVALID_PARAMETERS",
    "details": [
      "Unknown parameters: fast_ma, slow_ma",
      "Parameter 'stop_loss': expected float, got str"
    ]
  },
  "failedAt": "2025-11-20T10:05:15Z"
}
```

---

## ✅ 支持的参数类型

| 类型 | Python | 前端控件 | 示例 |
|------|--------|---------|------|
| **int** | `int` | InputNumber (step=1) | `10` |
| **float** | `float` | InputNumber (step=0.01) | `0.05` |
| **bool** | `bool` | Switch | `True` |
| **str** | `str` | Input / Select | `"long"` |

---

## 🔧 约束条件

```typescript
{
  "constraints": {
    "min": 1,              // 最小值（int/float）
    "max": 100,            // 最大值（int/float）
    "options": ["a", "b"]  // 可选值（str）
  }
}
```

---

## 💡 关键点

1. ✅ **参数名称必须与代码一致**
   - 用户在前端配置时要确保参数名与代码中的 `params` 一致

2. ✅ **Worker 强校验**
   - 加载策略后立即校验
   - 不匹配则终止任务

3. ✅ **类型兼容性**
   - `int` 可以转为 `float`
   - 其他类型必须严格匹配

4. ✅ **缺失参数使用默认值**
   - 用户未提供的参数使用策略中定义的默认值

5. ✅ **参数历史记录**
   - 每次回测的参数值保存在 `backtest_tasks.parameters`

---

## 📋 实施检查清单

- [ ] 前端实现参数配置表单
- [ ] Backend 实现参数 CRUD API
- [ ] Backend 实现基础参数验证
- [ ] Worker 实现参数校验逻辑
- [ ] Worker 实现错误处理和消息发送
- [ ] 数据库迁移脚本
- [ ] 前端实现错误展示

---

**完整设计文档**: [strategy-parameters-design.md](./strategy-parameters-design.md)

