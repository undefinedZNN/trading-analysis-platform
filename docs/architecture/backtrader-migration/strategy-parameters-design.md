# 策略自定义参数传递方案

**版本**: v2.0  
**创建时间**: 2025-11-20  
**更新时间**: 2025-11-20  
**状态**: ✅ 方案已确认

---

## 📋 目录

1. [需求背景](#需求背景)
2. [方案确认](#方案确认)
3. [参数流转全流程](#参数流转全流程)
4. [前端参数配置](#前端参数配置)
5. [数据库设计](#数据库设计)
6. [Worker 参数校验](#worker-参数校验)
7. [API 设计](#api-设计)
8. [错误处理](#错误处理)

---

## 🎯 需求背景

### 用户场景

用户在编写 Python 策略时，会在代码中定义参数：

```python
# 用户的策略代码
class MACrossStrategy(bt.Strategy):
    params = (
        ('fast_period', 10),      # 快速均线周期
        ('slow_period', 20),      # 慢速均线周期
        ('stop_loss', 0.05),      # 止损比例
        ('take_profit', 0.10),    # 止盈比例
    )
    
    def __init__(self):
        self.sma_fast = bt.indicators.SMA(period=self.params.fast_period)
        self.sma_slow = bt.indicators.SMA(period=self.params.slow_period)
    
    def next(self):
        if not self.position:
            if self.sma_fast[0] > self.sma_slow[0]:
                self.buy()
        # ...
```

### 核心需求

1. **前端配置参数**: 用户通过前端表单动态配置策略参数（与代码分离）
2. **参数存储**: 参数定义保存到数据库
3. **参数传递**: 参数能正确传递到 Worker 并应用到策略
4. **Worker 校验**: Worker 在初始化阶段校验传入的参数是否与策略代码中的 `params` 匹配
5. **校验失败处理**: 参数不合法时，结束回测任务并报错
6. **参数历史**: 记录每次回测使用的参数值

---

## ✅ 方案确认

**已确认的方案**: **前端动态配置 + Worker 校验**

### 核心特点

1. ✅ **前端手动配置参数**
   - 用户在前端表单中定义参数（名称、类型、默认值、约束）
   - 不依赖代码解析
   - 参数定义与代码分离

2. ✅ **参数存储到数据库**
   - 参数定义保存在 `strategy_parameters` 表
   - 每次回测的参数值保存在 `backtest_tasks` 表

3. ✅ **Worker 初始化阶段校验**
   - Worker 加载策略类后，检查策略中的 `params` 定义
   - 对比用户传入的参数与策略实际定义的参数
   - 校验通过：继续执行回测
   - 校验失败：终止任务，发送错误消息

### 优点

- ✅ 实现简单，无需代码解析
- ✅ 用户体验直观
- ✅ 参数与代码解耦
- ✅ Worker 端强校验，确保参数正确

### 注意事项

- ⚠️ 用户需要手动保持参数定义与代码一致
- ⚠️ 如果代码中的 `params` 变化，用户需要更新前端参数配置

---

## 🔄 参数流转全流程

```
┌──────────────────────────────────────────────────────────────┐
│ Step 1: 用户编写策略代码                                      │
│ - 在代码中定义 params                                         │
└──────────────────────────────────────────────────────────────┘
    │
    │ 保存策略代码
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 2: 用户在前端配置参数                                    │
│ - 点击"添加参数"按钮                                          │
│ - 填写参数名称、类型、默认值、约束                             │
│ - 参数定义与代码分离管理                                       │
└──────────────────────────────────────────────────────────────┘
    │
    │ 保存参数定义
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 3: Backend 保存参数到数据库                              │
│ - strategy_parameters 表                                      │
│ - 关联到策略 ID                                               │
└──────────────────────────────────────────────────────────────┘
    │
    │ 参数已保存
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 4: 用户创建回测任务                                      │
│ - 选择策略                                                    │
│ - 前端加载该策略的参数定义                                     │
│ - 用户修改参数值（或使用默认值）                               │
└──────────────────────────────────────────────────────────────┘
    │
    │ 提交回测任务
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 5: Backend 基础验证                                      │
│ - 类型检查（int/float/bool/str）                             │
│ - 约束检查（min/max/options）                                │
└──────────────────────────────────────────────────────────────┘
    │
    │ 验证通过
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 6: Backend 发布任务到 RabbitMQ                           │
│ - 策略代码                                                    │
│ - 策略类名                                                    │
│ - 用户配置的参数值                                            │
└──────────────────────────────────────────────────────────────┘
    │
    │ 消息
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 7: Worker 接收任务                                       │
│ - 加载策略代码                                                │
│ - 动态导入策略类                                              │
└──────────────────────────────────────────────────────────────┘
    │
    │ 策略类已加载
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 8: Worker 校验参数（关键步骤）⭐                        │
│ - 检查策略类的 params 定义                                    │
│ - 对比用户传入的参数                                          │
│ - 校验参数名称是否匹配                                        │
│ - 校验参数类型是否兼容                                        │
└──────────────────────────────────────────────────────────────┘
    │
    ├── 校验失败 ❌
    │   ▼
    │   ┌──────────────────────────────────────────────────────┐
    │   │ Worker 终止任务                                      │
    │   │ - 发送错误消息到 backtest.error                      │
    │   │ - 任务状态: FAILED                                   │
    │   │ - 错误类型: PARAMETER_VALIDATION_ERROR              │
    │   └──────────────────────────────────────────────────────┘
    │
    └── 校验通过 ✅
        ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 9: Worker 实例化策略并执行                               │
│ - cerebro.addstrategy(StrategyClass, **params)               │
│ - 运行回测                                                    │
└──────────────────────────────────────────────────────────────┘
    │
    │ 回测完成
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 10: 保存结果和参数                                       │
│ - 回测结果                                                    │
│ - 使用的参数值（用于复现）                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎨 前端参数配置

### UI 设计

用户在策略编辑页面，除了编写代码，还需要配置参数：

```
┌─────────────────────────────────────────────────────────────┐
│ 策略编辑                                          [保存]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 【代码编辑器】                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ import backtrader as bt                            │   │
│  │                                                     │   │
│  │ class MACrossStrategy(bt.Strategy):                │   │
│  │     params = (                                     │   │
│  │         ('fast_period', 10),                       │   │
│  │         ('slow_period', 20),                       │   │
│  │     )                                              │   │
│  │     ...                                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│ 【参数配置】                                   [+ 添加参数]  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 参数 1                                    [删除]     │   │
│  │ ┌───────────────┬───────────────┬─────────────────┐ │   │
│  │ │ 参数名        │ 类型          │ 默认值           │ │   │
│  │ │ fast_period   │ [int     ▼]  │ [10        ]    │ │   │
│  │ └───────────────┴───────────────┴─────────────────┘ │   │
│  │ ┌───────────────────────────────────────────────────┐ │
│  │ │ 约束: 最小值 [1  ] 最大值 [100]                  │ │
│  │ │ 描述: 快速均线周期                                │ │
│  │ └───────────────────────────────────────────────────┘ │
│  │                                                      │   │
│  │ 参数 2                                    [删除]     │   │
│  │ ┌───────────────┬───────────────┬─────────────────┐ │   │
│  │ │ 参数名        │ 类型          │ 默认值           │ │   │
│  │ │ slow_period   │ [int     ▼]  │ [20        ]    │ │   │
│  │ └───────────────┴───────────────┴─────────────────┘ │   │
│  │ ┌───────────────────────────────────────────────────┐ │
│  │ │ 约束: 最小值 [1  ] 最大值 [100]                  │ │
│  │ │ 描述: 慢速均线周期                                │ │
│  │ └───────────────────────────────────────────────────┘ │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 添加参数表单

```tsx
// 参数配置组件
interface ParameterConfig {
  id: string;
  name: string;              // 参数名称（必须与代码中一致）
  type: 'int' | 'float' | 'bool' | 'str';
  defaultValue: any;
  description?: string;
  constraints?: {
    min?: number;
    max?: number;
    options?: string[];
  };
}

// React 组件
function ParameterConfigForm() {
  const [parameters, setParameters] = useState<ParameterConfig[]>([]);
  
  const addParameter = () => {
    setParameters([...parameters, {
      id: uuid(),
      name: '',
      type: 'int',
      defaultValue: 0,
    }]);
  };
  
  const removeParameter = (id: string) => {
    setParameters(parameters.filter(p => p.id !== id));
  };
  
  const updateParameter = (id: string, field: string, value: any) => {
    setParameters(parameters.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };
  
  return (
    <div>
      <Button onClick={addParameter}>+ 添加参数</Button>
      
      {parameters.map((param, index) => (
        <Card key={param.id}>
          <h4>参数 {index + 1}</h4>
          
          <FormItem label="参数名称" required>
            <Input
              value={param.name}
              onChange={(e) => updateParameter(param.id, 'name', e.target.value)}
              placeholder="必须与代码中的参数名一致"
            />
          </FormItem>
          
          <FormItem label="类型" required>
            <Select
              value={param.type}
              onChange={(value) => updateParameter(param.id, 'type', value)}
            >
              <Option value="int">整数 (int)</Option>
              <Option value="float">浮点数 (float)</Option>
              <Option value="bool">布尔值 (bool)</Option>
              <Option value="str">字符串 (str)</Option>
            </Select>
          </FormItem>
          
          <FormItem label="默认值" required>
            {param.type === 'bool' ? (
              <Switch
                checked={param.defaultValue}
                onChange={(checked) => updateParameter(param.id, 'defaultValue', checked)}
              />
            ) : param.type === 'int' || param.type === 'float' ? (
              <InputNumber
                value={param.defaultValue}
                onChange={(value) => updateParameter(param.id, 'defaultValue', value)}
                step={param.type === 'int' ? 1 : 0.01}
              />
            ) : (
              <Input
                value={param.defaultValue}
                onChange={(e) => updateParameter(param.id, 'defaultValue', e.target.value)}
              />
            )}
          </FormItem>
          
          <FormItem label="约束条件">
            <Row gutter={16}>
              <Col span={12}>
                <Input
                  addonBefore="最小值"
                  type="number"
                  value={param.constraints?.min}
                  onChange={(e) => updateParameter(param.id, 'constraints', {
                    ...param.constraints,
                    min: Number(e.target.value)
                  })}
                />
              </Col>
              <Col span={12}>
                <Input
                  addonBefore="最大值"
                  type="number"
                  value={param.constraints?.max}
                  onChange={(e) => updateParameter(param.id, 'constraints', {
                    ...param.constraints,
                    max: Number(e.target.value)
                  })}
                />
              </Col>
            </Row>
          </FormItem>
          
          <FormItem label="描述">
            <Input.TextArea
              value={param.description}
              onChange={(e) => updateParameter(param.id, 'description', e.target.value)}
              placeholder="参数说明"
            />
          </FormItem>
          
          <Button danger onClick={() => removeParameter(param.id)}>
            删除
          </Button>
        </Card>
      ))}
    </div>
  );
}
```

---

## 💾 数据库设计


### 表结构

#### strategies 表

```sql
CREATE TABLE strategies (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  code TEXT NOT NULL,                    -- Python 策略代码
  class_name VARCHAR(255) NOT NULL,      -- 策略类名
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);
```

#### strategy_parameters 表

```sql
CREATE TABLE strategy_parameters (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,            -- 参数名称
  type VARCHAR(50) NOT NULL,             -- 参数类型: int, float, str, bool
  default_value TEXT NOT NULL,           -- 默认值（JSON 格式）
  description TEXT,                      -- 参数描述
  constraints JSONB,                     -- 约束条件 {min, max, options}
  order_index INTEGER,                   -- 显示顺序
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(strategy_id, name)
);
```

**示例数据**:
```json
{
  "id": "param-001",
  "strategy_id": "strategy-001",
  "name": "fast_period",
  "type": "int",
  "default_value": "10",
  "description": "快速均线周期",
  "constraints": {
    "min": 1,
    "max": 100
  },
  "order_index": 0
}
```

#### backtest_tasks 表（扩展）

```sql
ALTER TABLE backtest_tasks ADD COLUMN parameters JSONB;
```

**用于保存每次回测使用的参数值**：
```json
{
  "taskId": "task-001",
  "parameters": {
    "fast_period": 15,
    "slow_period": 30,
    "stop_loss": 0.05
  }
}
```

---

## ⚙️ Worker 参数校验

这是核心的校验逻辑，确保用户传入的参数与策略代码中的定义一致。

### 校验流程

```python
# Worker 执行器
class BacktestExecutor:
    def execute_task(self, task):
        task_id = task['taskId']
        
        try:
            # 1. 加载策略代码
            strategy_code = task['strategy']['code']
            strategy_class_name = task['strategy']['className']
            
            # 2. 动态导入策略类
            strategy_module = self._load_strategy(strategy_code)
            StrategyClass = getattr(strategy_module, strategy_class_name)
            
            # 3. 获取用户传入的参数
            user_params = task['parameters']  # {'fast_period': 15, 'slow_period': 30}
            
            # 4. 校验参数（关键步骤）⭐
            validation_result = self._validate_parameters(StrategyClass, user_params)
            
            if not validation_result['valid']:
                # 校验失败，终止任务
                self._handle_validation_error(task_id, validation_result['errors'])
                return
            
            # 5. 校验通过，继续执行
            result = self._run_backtest(StrategyClass, user_params, task)
            
            # 6. 发送成功结果
            self._publish_result(task_id, result)
            
        except Exception as e:
            self._handle_execution_error(task_id, e)
    
    def _validate_parameters(self, StrategyClass, user_params):
        """
        校验用户传入的参数是否与策略定义匹配
        
        Returns:
            {
                'valid': bool,
                'errors': List[str],
                'warnings': List[str]
            }
        """
        errors = []
        warnings = []
        
        # 1. 获取策略类中定义的参数
        strategy_params = self._extract_strategy_params(StrategyClass)
        
        if not strategy_params:
            # 策略没有定义 params，但用户传入了参数
            if user_params:
                warnings.append(
                    f"Strategy {StrategyClass.__name__} has no params defined, "
                    f"but {len(user_params)} parameters were provided"
                )
            return {'valid': True, 'errors': [], 'warnings': warnings}
        
        # 2. 检查用户传入的参数是否都在策略中定义
        strategy_param_names = set(strategy_params.keys())
        user_param_names = set(user_params.keys())
        
        # 2.1 检查多余的参数
        extra_params = user_param_names - strategy_param_names
        if extra_params:
            errors.append(
                f"Unknown parameters: {', '.join(extra_params)}. "
                f"Strategy only defines: {', '.join(strategy_param_names)}"
            )
        
        # 2.2 检查缺失的参数（可选，如果策略有默认值就不算错误）
        missing_params = strategy_param_names - user_param_names
        if missing_params:
            warnings.append(
                f"Parameters not provided (will use default values): {', '.join(missing_params)}"
            )
        
        # 3. 检查参数类型
        for param_name, param_value in user_params.items():
            if param_name in strategy_params:
                expected_type = strategy_params[param_name]['type']
                actual_type = type(param_value).__name__
                
                if not self._is_type_compatible(expected_type, actual_type):
                    errors.append(
                        f"Parameter '{param_name}': expected {expected_type}, "
                        f"but got {actual_type}"
                    )
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }
    
    def _extract_strategy_params(self, StrategyClass):
        """
        从策略类中提取 params 定义
        
        Returns:
            {
                'param_name': {'type': 'int', 'default': 10},
                ...
            }
        """
        if not hasattr(StrategyClass, 'params'):
            return {}
        
        params_def = {}
        
        # Backtrader 的 params 可以是 tuple 或 dict
        if isinstance(StrategyClass.params, tuple):
            # 格式: (('name', default_value), ...)
            for item in StrategyClass.params:
                if isinstance(item, tuple) and len(item) == 2:
                    param_name, default_value = item
                    params_def[param_name] = {
                        'type': type(default_value).__name__,
                        'default': default_value
                    }
        elif isinstance(StrategyClass.params, dict):
            # 格式: {'name': default_value, ...}
            for param_name, default_value in StrategyClass.params.items():
                params_def[param_name] = {
                    'type': type(default_value).__name__,
                    'default': default_value
                }
        
        return params_def
    
    def _is_type_compatible(self, expected_type, actual_type):
        """检查类型兼容性"""
        # 基本类型映射
        type_mapping = {
            'int': ['int', 'long'],
            'float': ['float', 'int'],  # int 可以转为 float
            'bool': ['bool'],
            'str': ['str'],
        }
        
        if expected_type in type_mapping:
            return actual_type in type_mapping[expected_type]
        
        return expected_type == actual_type
    
    def _handle_validation_error(self, task_id, errors):
        """处理参数校验失败"""
        logger.error(f"[{task_id}] Parameter validation failed: {errors}")
        
        # 发送错误消息到 RabbitMQ
        self.publish_error({
            'taskId': task_id,
            'status': 'FAILED',
            'error': {
                'type': 'PARAMETER_VALIDATION_ERROR',
                'message': 'Strategy parameters validation failed',
                'code': 'INVALID_PARAMETERS',
                'details': errors
            },
            'failedAt': datetime.now().isoformat()
        })
        
        # 更新任务状态
        self.publish_status({
            'taskId': task_id,
            'status': 'FAILED',
            'workerId': self.worker_id,
            'timestamp': datetime.now().isoformat()
        })
    
    def _load_strategy(self, code: str):
        """动态加载策略代码"""
        import types
        module = types.ModuleType('user_strategy')
        exec(code, module.__dict__)
        return module
```

### 校验示例

#### 示例 1: 参数匹配（校验通过）✅

**策略代码**:
```python
class MACrossStrategy(bt.Strategy):
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
    )
```

**用户传入**:
```python
user_params = {
    'fast_period': 15,
    'slow_period': 30
}
```

**校验结果**:
```python
{
    'valid': True,
    'errors': [],
    'warnings': []
}
```

---

#### 示例 2: 参数名称不匹配（校验失败）❌

**策略代码**:
```python
class MACrossStrategy(bt.Strategy):
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
    )
```

**用户传入**:
```python
user_params = {
    'fast_ma': 15,        # ❌ 错误的参数名
    'slow_ma': 30         # ❌ 错误的参数名
}
```

**校验结果**:
```python
{
    'valid': False,
    'errors': [
        "Unknown parameters: fast_ma, slow_ma. Strategy only defines: fast_period, slow_period"
    ],
    'warnings': []
}
```

**Worker 行为**: 终止任务，发送错误消息

---

#### 示例 3: 参数类型不匹配（校验失败）❌

**策略代码**:
```python
class MACrossStrategy(bt.Strategy):
    params = (
        ('fast_period', 10),    # int
        ('stop_loss', 0.05),    # float
    )
```

**用户传入**:
```python
user_params = {
    'fast_period': "15",      # ❌ 应该是 int，但传入了 str
    'stop_loss': 0.05         # ✅ 正确
}
```

**校验结果**:
```python
{
    'valid': False,
    'errors': [
        "Parameter 'fast_period': expected int, but got str"
    ],
    'warnings': []
}
```

---

#### 示例 4: 缺少参数（警告，但不失败）⚠️

**策略代码**:
```python
class MACrossStrategy(bt.Strategy):
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
        ('stop_loss', 0.05),
    )
```

**用户传入**:
```python
user_params = {
    'fast_period': 15,
    'slow_period': 30
    # 'stop_loss' 未提供，将使用默认值 0.05
}
```

**校验结果**:
```python
{
    'valid': True,
    'errors': [],
    'warnings': [
        "Parameters not provided (will use default values): stop_loss"
    ]
}
```

**Worker 行为**: 继续执行，使用策略中的默认值

---

## 📡 API 设计

### 1. 保存策略和参数

**保存策略**:

```typescript
// NestJS Service
@Injectable()
export class ParameterParserService {
  async parseStrategyParameters(code: string): Promise<StrategyParameter[]> {
    // 调用 Python 脚本解析参数
    const result = await this.executePython('parse_params.py', code);
    return result.parameters;
  }
  
  private async executePython(script: string, input: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [
        path.join(__dirname, 'scripts', script),
      ]);
      
      python.stdin.write(input);
      python.stdin.end();
      
      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      python.on('close', (code) => {
        if (code === 0) {
          resolve(JSON.parse(output));
        } else {
          reject(new Error('Parse failed'));
        }
      });
    });
  }
}
```

**Python 解析脚本** (`parse_params.py`):

```python
#!/usr/bin/env python3
import ast
import sys
import json
from typing import List, Dict, Any

class StrategyParameterExtractor(ast.NodeVisitor):
    """提取策略参数"""
    
    def __init__(self):
        self.parameters = []
        self.current_class = None
    
    def visit_ClassDef(self, node):
        """访问类定义"""
        # 检查是否继承自 bt.Strategy
        is_strategy = self._is_strategy_class(node)
        if is_strategy:
            self.current_class = node.name
            # 查找 params 定义
            self._extract_params(node)
        self.generic_visit(node)
    
    def _is_strategy_class(self, node) -> bool:
        """检查是否是策略类"""
        for base in node.bases:
            if isinstance(base, ast.Attribute):
                if base.attr == 'Strategy':
                    return True
            elif isinstance(base, ast.Name):
                if base.id in ['Strategy', 'SignalStrategy']:
                    return True
        return False
    
    def _extract_params(self, class_node):
        """从类中提取参数定义"""
        for item in class_node.body:
            # 查找 params = (...) 赋值
            if isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name) and target.id == 'params':
                        self._parse_params_tuple(item.value)
    
    def _parse_params_tuple(self, node):
        """解析 params 元组"""
        if isinstance(node, ast.Tuple):
            for param in node.elts:
                param_info = self._parse_single_param(param)
                if param_info:
                    self.parameters.append(param_info)
    
    def _parse_single_param(self, node) -> Dict[str, Any]:
        """解析单个参数"""
        if isinstance(node, ast.Tuple) and len(node.elts) == 2:
            # 格式: ('param_name', default_value)
            name_node = node.elts[0]
            value_node = node.elts[1]
            
            if isinstance(name_node, ast.Constant):
                name = name_node.value
                default_value = self._extract_value(value_node)
                param_type = self._infer_type(default_value)
                
                return {
                    'name': name,
                    'type': param_type,
                    'default_value': default_value,
                }
        return None
    
    def _extract_value(self, node) -> Any:
        """提取节点的值"""
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.Num):  # Python < 3.8
            return node.n
        elif isinstance(node, ast.Str):  # Python < 3.8
            return node.s
        elif isinstance(node, ast.NameConstant):  # Python < 3.8
            return node.value
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            # 负数
            return -self._extract_value(node.operand)
        return None
    
    def _infer_type(self, value) -> str:
        """推断参数类型"""
        if isinstance(value, bool):
            return 'bool'
        elif isinstance(value, int):
            return 'int'
        elif isinstance(value, float):
            return 'float'
        elif isinstance(value, str):
            return 'str'
        else:
            return 'unknown'

def parse_strategy_parameters(code: str) -> List[Dict[str, Any]]:
    """解析策略代码，提取参数"""
    try:
        tree = ast.parse(code)
        extractor = StrategyParameterExtractor()
        extractor.visit(tree)
        return extractor.parameters
    except SyntaxError as e:
        return {
            'error': 'Syntax error in code',
            'message': str(e),
            'line': e.lineno
        }

if __name__ == '__main__':
    # 从 stdin 读取代码
    code = sys.stdin.read()
    
    # 解析参数
    result = parse_strategy_parameters(code)
    
    # 输出 JSON
    print(json.dumps({
        'parameters': result if isinstance(result, list) else [],
        'error': result if isinstance(result, dict) else None
    }))
```

**测试示例**:

```python
# 输入代码
code = """
import backtrader as bt

class MACrossStrategy(bt.Strategy):
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
        ('stop_loss', 0.05),
        ('take_profit', 0.10),
        ('enable_trailing', True),
    )
    
    def __init__(self):
        pass
"""

# 输出结果
{
  "parameters": [
    {"name": "fast_period", "type": "int", "default_value": 10},
    {"name": "slow_period", "type": "int", "default_value": 20},
    {"name": "stop_loss", "type": "float", "default_value": 0.05},
    {"name": "take_profit", "type": "float", "default_value": 0.10},
    {"name": "enable_trailing", "type": "bool", "default_value": true}
  ],
  "error": null
}
```

---

### API 设计

#### 1. 保存策略并解析参数

```typescript
POST /api/strategies

Request:
{
  "name": "MA Cross Strategy",
  "code": "import backtrader as bt\n\nclass MACrossStrategy(bt.Strategy):\n    ...",
  "className": "MACrossStrategy"
}

Response:
{
  "id": "strategy-001",
  "name": "MA Cross Strategy",
  "code": "...",
  "className": "MACrossStrategy",
  "parameters": [
    {
      "id": "param-001",
      "name": "fast_period",
      "type": "int",
      "defaultValue": 10,
      "description": null
    },
    {
      "id": "param-002",
      "name": "slow_period",
      "type": "int",
      "defaultValue": 20,
      "description": null
    }
  ],
  "createdAt": "2025-11-20T10:00:00Z"
}
```

#### 2. 获取策略参数

```typescript
GET /api/strategies/:id/parameters

Response:
{
  "strategyId": "strategy-001",
  "parameters": [
    {
      "id": "param-001",
      "name": "fast_period",
      "type": "int",
      "defaultValue": 10,
      "constraints": {"min": 1, "max": 100}
    },
    {
      "id": "param-002",
      "name": "slow_period",
      "type": "int",
      "defaultValue": 20,
      "constraints": {"min": 1, "max": 100}
    }
  ]
}
```

#### 3. 创建回测任务（带参数）

```typescript
POST /api/backtests

Request:
{
  "strategyId": "strategy-001",
  "datasetId": "dataset-001",
  "parameters": {
    "fast_period": 15,      // 用户修改的值
    "slow_period": 30,      // 用户修改的值
    "stop_loss": 0.05       // 使用默认值
  },
  "config": {
    "initialCash": 100000,
    "commission": 0.001
  }
}

Response:
{
  "taskId": "task-001",
  "status": "QUEUED",
  "parameters": {
    "fast_period": 15,
    "slow_period": 30,
    "stop_loss": 0.05,
    "take_profit": 0.10,   // 未提供，使用默认值
    "enable_trailing": true // 未提供，使用默认值
  }
}
```

---

### Worker 端参数应用

```python
# Worker 执行器
class BacktestExecutor:
    def execute_task(self, task):
        # 1. 加载策略代码
        strategy_code = task['strategy']['code']
        strategy_class_name = task['strategy']['className']
        
        # 2. 动态导入策略类
        strategy_module = self._load_strategy(strategy_code)
        StrategyClass = getattr(strategy_module, strategy_class_name)
        
        # 3. 获取用户提供的参数
        user_params = task['parameters']  # {'fast_period': 15, 'slow_period': 30}
        
        # 4. 创建 Cerebro 实例
        cerebro = bt.Cerebro()
        
        # 5. 添加策略（传入参数）
        cerebro.addstrategy(StrategyClass, **user_params)
        
        # 6. 添加数据
        data = self._load_data(task['data'])
        cerebro.adddata(data)
        
        # 7. 运行回测
        results = cerebro.run()
        
        return results
    
    def _load_strategy(self, code: str):
        """动态加载策略代码"""
        import types
        module = types.ModuleType('user_strategy')
        exec(code, module.__dict__)
        return module
```

**Backtrader 参数应用机制**:

```python
# Backtrader 内部机制
class Strategy:
    params = (
        ('fast_period', 10),
        ('slow_period', 20),
    )
    
    def __init__(self):
        # self.params.fast_period 会使用传入的值
        print(self.params.fast_period)  # 输出: 15（用户提供）
        print(self.params.slow_period)  # 输出: 30（用户提供）

# 实例化时传入参数
cerebro.addstrategy(Strategy, fast_period=15, slow_period=30)
```

---

## 🎨 参数类型系统

### 支持的参数类型

| 类型 | Python 类型 | 前端类型 | 默认值示例 | 验证规则 |
|------|------------|---------|-----------|---------|
| **int** | `int` | `number` | `10` | min, max |
| **float** | `float` | `number` | `0.05` | min, max, decimals |
| **bool** | `bool` | `boolean` | `True` | - |
| **str** | `str` | `string` | `'MA'` | maxLength, pattern |
| **enum** | `str` | `select` | `'long'` | options |

### 参数约束定义

通过注释定义参数约束：

```python
class MACrossStrategy(bt.Strategy):
    params = (
        ('fast_period', 10),      # @min:1 @max:100 @desc:快速均线周期
        ('slow_period', 20),      # @min:1 @max:100 @desc:慢速均线周期
        ('stop_loss', 0.05),      # @min:0 @max:1 @decimals:4 @desc:止损比例
        ('side', 'long'),         # @options:long,short,both @desc:交易方向
    )
```

**解析器增强** (parse_params.py):

```python
def _extract_description_and_constraints(self, node) -> Dict[str, Any]:
    """从注释提取描述和约束"""
    result = {
        'description': None,
        'constraints': {}
    }
    
    # 获取注释（如果有）
    if hasattr(node, 'comment'):
        comment = node.comment
        # 解析 @tag:value 格式
        import re
        
        # @desc:描述
        desc_match = re.search(r'@desc:([^@]+)', comment)
        if desc_match:
            result['description'] = desc_match.group(1).strip()
        
        # @min:value
        min_match = re.search(r'@min:(\d+\.?\d*)', comment)
        if min_match:
            result['constraints']['min'] = float(min_match.group(1))
        
        # @max:value
        max_match = re.search(r'@max:(\d+\.?\d*)', comment)
        if max_match:
            result['constraints']['max'] = float(max_match.group(1))
        
        # @options:value1,value2,value3
        options_match = re.search(r'@options:([^@]+)', comment)
        if options_match:
            options = [opt.strip() for opt in options_match.group(1).split(',')]
            result['constraints']['options'] = options
    
    return result
```

---

## 🎨 前端交互设计

### 策略编辑页面

```typescript
// 页面结构
<StrategyEditor>
  <CodeEditor />           {/* Monaco Editor */}
  <ParametersPanel />      {/* 参数配置面板 */}
  <SaveButton />
</StrategyEditor>

// 参数配置面板
<ParametersPanel>
  <ParameterForm>
    {parameters.map(param => (
      <ParameterInput key={param.id} parameter={param} />
    ))}
  </ParameterForm>
</ParametersPanel>
```

### 参数输入组件

```tsx
// ParameterInput.tsx
interface ParameterInputProps {
  parameter: StrategyParameter;
  value: any;
  onChange: (value: any) => void;
}

function ParameterInput({ parameter, value, onChange }: ParameterInputProps) {
  const { name, type, defaultValue, description, constraints } = parameter;
  
  // 根据类型渲染不同的输入控件
  switch (type) {
    case 'int':
    case 'float':
      return (
        <FormItem label={name} tooltip={description}>
          <InputNumber
            value={value ?? defaultValue}
            onChange={onChange}
            min={constraints?.min}
            max={constraints?.max}
            step={type === 'int' ? 1 : 0.01}
            precision={type === 'float' ? (constraints?.decimals || 2) : 0}
          />
          <span className="default-hint">默认: {defaultValue}</span>
        </FormItem>
      );
    
    case 'bool':
      return (
        <FormItem label={name} tooltip={description}>
          <Switch
            checked={value ?? defaultValue}
            onChange={onChange}
          />
          <span className="default-hint">默认: {defaultValue ? '开启' : '关闭'}</span>
        </FormItem>
      );
    
    case 'str':
      if (constraints?.options) {
        // 枚举类型
        return (
          <FormItem label={name} tooltip={description}>
            <Select value={value ?? defaultValue} onChange={onChange}>
              {constraints.options.map(opt => (
                <Select.Option key={opt} value={opt}>{opt}</Select.Option>
              ))}
            </Select>
          </FormItem>
        );
      } else {
        // 普通字符串
        return (
          <FormItem label={name} tooltip={description}>
            <Input
              value={value ?? defaultValue}
              onChange={(e) => onChange(e.target.value)}
              maxLength={constraints?.maxLength}
            />
          </FormItem>
        );
      }
    
    default:
      return null;
  }
}
```

### UI 示例

```
┌─────────────────────────────────────────────────────────┐
│ 策略编辑                                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  策略代码：                                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │ import backtrader as bt                          │ │
│  │                                                   │ │
│  │ class MACrossStrategy(bt.Strategy):              │ │
│  │     params = (                                   │ │
│  │         ('fast_period', 10),  # 快速均线周期      │ │
│  │         ('slow_period', 20),  # 慢速均线周期      │ │
│  │     )                                            │ │
│  │                                                   │ │
│  │     def __init__(self):                          │ │
│  │         ...                                      │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  策略参数：                                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 快速均线周期 (fast_period)              ℹ️        │ │
│  │ [    15    ] ▲▼                                  │ │
│  │ 默认: 10         范围: 1 - 100                   │ │
│  │                                                   │ │
│  │ 慢速均线周期 (slow_period)              ℹ️        │ │
│  │ [    30    ] ▲▼                                  │ │
│  │ 默认: 20         范围: 1 - 100                   │ │
│  │                                                   │ │
│  │ 止损比例 (stop_loss)                    ℹ️        │ │
│  │ [   0.05   ] ▲▼                                  │ │
│  │ 默认: 0.05       范围: 0 - 1                     │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  [ 保存策略 ]  [ 开始回测 ]                              │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ 参数验证

### Backend 验证

```typescript
// NestJS DTO
class CreateBacktestDto {
  @IsUUID()
  strategyId: string;
  
  @IsObject()
  @ValidateNested()
  parameters: Record<string, any>;
}

// 参数验证服务
@Injectable()
export class ParameterValidationService {
  async validateParameters(
    strategyId: string,
    userParams: Record<string, any>
  ): Promise<ValidationResult> {
    // 1. 获取策略的参数定义
    const paramDefs = await this.strategyParametersRepo.find({ strategyId });
    
    const errors = [];
    
    // 2. 验证每个参数
    for (const [key, value] of Object.entries(userParams)) {
      const paramDef = paramDefs.find(p => p.name === key);
      
      if (!paramDef) {
        errors.push(`Unknown parameter: ${key}`);
        continue;
      }
      
      // 类型验证
      if (!this.validateType(value, paramDef.type)) {
        errors.push(`Invalid type for ${key}: expected ${paramDef.type}`);
      }
      
      // 约束验证
      if (paramDef.constraints) {
        const constraintError = this.validateConstraints(
          key,
          value,
          paramDef.constraints
        );
        if (constraintError) {
          errors.push(constraintError);
        }
      }
    }
    
    // 3. 填充默认值
    const finalParams = { ...userParams };
    for (const paramDef of paramDefs) {
      if (!(paramDef.name in finalParams)) {
        finalParams[paramDef.name] = paramDef.defaultValue;
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      parameters: finalParams
    };
  }
  
  private validateType(value: any, type: string): boolean {
    switch (type) {
      case 'int':
        return Number.isInteger(value);
      case 'float':
        return typeof value === 'number';
      case 'bool':
        return typeof value === 'boolean';
      case 'str':
        return typeof value === 'string';
      default:
        return false;
    }
  }
  
  private validateConstraints(
    name: string,
    value: any,
    constraints: any
  ): string | null {
    // min/max 验证
    if ('min' in constraints && value < constraints.min) {
      return `${name} must be >= ${constraints.min}`;
    }
    if ('max' in constraints && value > constraints.max) {
      return `${name} must be <= ${constraints.max}`;
    }
    
    // options 验证
    if ('options' in constraints && !constraints.options.includes(value)) {
      return `${name} must be one of: ${constraints.options.join(', ')}`;
    }
    
    return null;
  }
}
```

---

## ❓ 待确认问题

### 1. 参数解析方式

**问题**: 使用哪种方式解析策略参数？

**选项**:
- **A. 静态 AST 解析** ⭐ 推荐
  - Backend 使用 Python AST 解析
  - 保存到数据库
  - 前端从数据库读取
  
- **B. 动态发现**
  - Worker 动态加载策略提取参数
  - 需要额外的 RabbitMQ 通信
  
- **C. 手动配置**
  - 用户在前端手动定义参数

**你的选择**: [ ] A / [ ] B / [ ] C

---

### 2. 参数约束定义方式

**问题**: 如何定义参数的约束条件（min, max等）？

**选项**:
- **A. 通过注释** ⭐ 推荐
  ```python
  ('fast_period', 10),  # @min:1 @max:100 @desc:快速均线周期
  ```
  
- **B. 通过 docstring**
  ```python
  """
  Parameters:
    - fast_period (int): 快速均线周期 [1-100]
  """
  ```
  
- **C. 不支持约束**
  - 只支持基本类型
  - 前端不做验证

**你的选择**: [ ] A / [ ] B / [ ] C

---

### 3. 参数默认值策略

**问题**: 用户创建回测时，如果没有提供某个参数值，如何处理？

**选项**:
- **A. 使用策略中定义的默认值** ⭐ 推荐
  - 参数可选
  - 未提供时使用策略中的默认值
  
- **B. 强制用户填写所有参数**
  - 参数必填
  - 前端展示默认值但用户必须确认

**你的选择**: [ ] A / [ ] B

---

### 4. 参数历史记录

**问题**: 是否保存每次回测使用的参数值？

**选项**:
- **A. 保存** ⭐ 推荐
  - 便于复现
  - 可以对比不同参数的结果
  - 占用数据库空间
  
- **B. 不保存**
  - 节省空间
  - 无法复现

**你的选择**: [ ] A / [ ] B

---

### 5. 参数版本管理

**问题**: 当用户修改策略代码时，参数可能变化，如何处理？

**选项**:
- **A. 自动更新参数定义** ⭐ 推荐
  - 保存策略时重新解析参数
  - 覆盖旧的参数定义
  - 简单直接
  
- **B. 版本化管理**
  - 每次修改创建新版本
  - 保留历史版本的参数定义
  - 复杂但更灵活

**你的选择**: [ ] A / [ ] B

---

### 6. 复杂参数类型支持

**问题**: 是否支持复杂的参数类型（列表、字典等）？

**选项**:
- **A. 只支持基本类型** ⭐ 推荐
  - int, float, bool, str
  - 前端易于实现
  - 满足大多数需求
  
- **B. 支持复杂类型**
  - list, dict, tuple
  - 前端实现复杂
  - 验证困难

**你的选择**: [ ] A / [ ] B

**如果选 A，用户需要复杂类型怎么办？**
- 可以使用 JSON 字符串
- 在策略代码中解析

---

## 📋 确认清单

请确认以下问题：

- [ ] 参数解析方式是否满足需求？
- [ ] 参数约束定义方式是否清晰？
- [ ] 参数验证逻辑是否完善？
- [ ] 前端交互设计是否合理？
- [ ] 6 个待确认问题的答案

---

**下一步**: 确认这些设计后，我会创建详细的实现代码示例和数据库迁移脚本。

