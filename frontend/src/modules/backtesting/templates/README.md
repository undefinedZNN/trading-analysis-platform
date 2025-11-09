# 策略脚本模板

## 📝 概述

本目录包含策略脚本的默认模板，用于帮助用户快速创建新的交易策略。

## 📦 模板列表

### 1. 完整策略模板 (Full Template)

**文件**: `defaultStrategyTemplate.ts`

**特点**:
- ✅ 完整的双均线交叉策略实现
- ✅ 包含详细的注释和说明
- ✅ 完整的参数和因子定义
- ✅ 止损止盈逻辑
- ✅ 辅助函数示例
- ✅ 完整的生命周期函数

**适用场景**:
- 学习策略开发
- 快速原型开发
- 参考示例代码

**代码结构**:
```typescript
// 1. 参数定义
export const parameters = { ... }

// 2. 因子定义
export const factors = { ... }

// 3. 接口定义
interface BarData { ... }
interface StrategyContext { ... }
interface Signal { ... }

// 4. 辅助函数
function calculateSMA() { ... }
function detectCrossover() { ... }

// 5. 生命周期函数
export function onInit() { ... }
export function onBar() { ... }
export function onSignal() { ... }
export function onFinish() { ... }
```

### 2. 简化策略模板 (Simple Template)

**特点**:
- ✅ 最小化的代码结构
- ✅ 基本的参数和因子定义
- ✅ 必要的生命周期函数
- ✅ 适合快速开始

**适用场景**:
- 快速开始新策略
- 简单策略实现
- 自定义开发

## 🚀 使用方法

### 在前端页面中使用

```typescript
import { getDefaultStrategyTemplate } from '../templates/defaultStrategyTemplate';

// 获取完整模板
const fullTemplate = getDefaultStrategyTemplate('full');

// 获取简化模板
const simpleTemplate = getDefaultStrategyTemplate('simple');
```

### 在创建策略时使用

```typescript
// 新建策略时的默认代码
const [code, setCode] = useState(getDefaultStrategyTemplate('full'));
```

## 📚 策略脚本规范

### 必需导出

所有策略脚本必须导出以下内容：

1. **parameters** - 策略参数定义
```typescript
export const parameters = {
  paramName: {
    type: 'number' | 'string' | 'boolean' | 'select',
    label: '参数标签',
    default: 默认值,
    // ... 其他配置
  }
}
```

2. **factors** - 因子定义
```typescript
export const factors = {
  factorName: {
    type: 'number' | 'string' | 'boolean',
    label: '因子标签',
    description: '因子说明',
  }
}
```

3. **生命周期函数**
```typescript
// 初始化
export function onInit(context: StrategyContext): void { ... }

// 计算因子
export function onBar(context: StrategyContext): void { ... }

// 生成信号
export function onSignal(context: StrategyContext): Signal | null { ... }

// 结束
export function onFinish(context: StrategyContext): void { ... }
```

### 参数类型说明

#### number 类型
```typescript
{
  type: 'number',
  label: '周期',
  default: 20,
  min: 5,        // 可选：最小值
  max: 100,      // 可选：最大值
  step: 1,       // 可选：步长
  description: '计算周期', // 可选：说明
}
```

#### string 类型
```typescript
{
  type: 'string',
  label: '标题',
  default: 'My Strategy',
  maxLength: 50,  // 可选：最大长度
  description: '策略标题',
}
```

#### boolean 类型
```typescript
{
  type: 'boolean',
  label: '启用止损',
  default: true,
  description: '是否启用止损功能',
}
```

#### select 类型
```typescript
{
  type: 'select',
  label: '均线类型',
  default: 'SMA',
  options: [
    { label: '简单移动平均', value: 'SMA' },
    { label: '指数移动平均', value: 'EMA' },
    { label: '加权移动平均', value: 'WMA' },
  ],
  description: '选择均线计算方法',
}
```

### Context 对象说明

```typescript
interface StrategyContext {
  // 历史Bar数据数组
  bars: BarData[];
  
  // 当前Bar数据
  currentBar: BarData;
  
  // 当前持仓（null表示无持仓）
  position: Position | null;
  
  // 策略参数
  parameters: typeof parameters;
  
  // 因子值（可读写）
  factors: Record<string, number>;
}
```

### Signal 对象说明

```typescript
interface Signal {
  // 信号类型
  type: 'buy' | 'sell' | 'close';
  
  // 价格
  price: number;
  
  // 数量
  quantity: number;
  
  // 原因说明
  reason: string;
}
```

## 🎯 最佳实践

### 1. 参数命名
- 使用驼峰命名法
- 名称要有意义
- 添加详细的描述

### 2. 因子计算
- 在 `onBar` 函数中计算
- 确保有足够的历史数据
- 处理边界情况

### 3. 信号生成
- 在 `onSignal` 函数中生成
- 返回 `null` 表示无信号
- 提供清晰的信号原因

### 4. 错误处理
- 检查数据有效性
- 处理边界条件
- 添加必要的日志

### 5. 性能优化
- 避免重复计算
- 使用合适的数据结构
- 注意内存使用

## 📖 示例策略

### 双均线交叉策略

完整模板中包含了一个完整的双均线交叉策略示例，包括：

1. **参数定义**
   - 短期均线周期
   - 长期均线周期
   - 止损百分比
   - 止盈百分比

2. **因子计算**
   - 短期移动平均线
   - 长期移动平均线
   - 均线差值
   - 交叉信号

3. **交易逻辑**
   - 金叉买入
   - 死叉卖出
   - 止损止盈

4. **辅助函数**
   - SMA计算
   - 交叉检测

## 🔧 开发工具

### TypeScript类型检查

所有模板都包含完整的TypeScript类型定义，确保：
- 类型安全
- IDE智能提示
- 编译时错误检查

### ESLint代码检查

模板遵循ESLint规则，确保：
- 代码风格一致
- 最佳实践
- 潜在问题检测

## 📝 更新日志

### v1.0.0 (2024-11-10)
- ✅ 创建完整策略模板
- ✅ 创建简化策略模板
- ✅ 添加模板选择功能
- ✅ 完善文档说明

## 🤝 贡献

欢迎贡献更多的策略模板！

### 贡献指南

1. 创建新的模板文件
2. 遵循现有的代码规范
3. 添加详细的注释
4. 更新README文档
5. 提交Pull Request

## 📞 支持

如有问题，请联系开发团队或查看项目文档。

---

**最后更新**: 2024-11-10  
**版本**: 1.0.0

