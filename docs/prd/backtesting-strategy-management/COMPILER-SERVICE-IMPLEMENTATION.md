# 策略编译服务实现文档

## 📋 概述

本文档描述了策略编译服务的完整实现，用于解决策略脚本中的路径别名解析问题。

## 🎯 问题描述

### 原始问题
用户创建策略时，策略脚本包含后端的导入语句：
```typescript
import type { StrategyLifecycle, StrategyContext, MarketBarPayload } from '@/backtesting/strategy/interfaces';
import { defineParameters } from '@/backtesting/strategy/utils';
```

这些路径别名 `@/backtesting/strategy/` 在后端需要被正确解析为实际的文件路径。

### 解决方案
创建一个完整的策略编译服务，在后端动态编译时处理路径别名，而不是修改策略脚本。

## 🏗️ 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                    前端（用户界面）                       │
│  - 用户编写策略脚本（包含 @/ 路径别名）                  │
│  - 提交策略代码到后端                                    │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              后端 API（策略创建接口）                     │
│  - 接收策略脚本代码                                      │
│  - 调用策略加载器                                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│         StrategyLoader（策略加载器）                     │
│  - 调用编译服务                                          │
│  - 验证编译结果                                          │
│  - 创建策略实例                                          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│    StrategyCompilerService（策略编译服务）               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 1. preprocessImports()                          │   │
│  │    - 替换路径别名为相对路径                     │   │
│  │    - @/backtesting/strategy/ -> ./              │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 2. transpileTypeScript()                        │   │
│  │    - 使用 TypeScript Compiler API               │   │
│  │    - 转译为 JavaScript                          │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 3. executeInSandbox()                           │   │
│  │    - 在 VM 沙箱中执行                           │   │
│  │    - 提取模块导出                               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 📝 实现细节

### 1. StrategyCompilerService

**文件**: `backend/src/backtesting/strategy/compiler.service.ts`

#### 核心方法

##### compile()
```typescript
async compile(
  scriptContent: string,
  options: CompileOptions = {}
): Promise<CompileResult>
```

编译策略脚本的主流程：
1. 预处理导入语句
2. TypeScript 转译
3. 沙箱执行
4. 返回编译结果

##### preprocessImports()
```typescript
private preprocessImports(code: string): string
```

处理路径别名映射：
- `@/backtesting/strategy/interfaces` → `./interfaces`
- `@/backtesting/strategy/utils` → `./utils`
- `@/backtesting/` → `../`
- `@/` → `../../`

##### transpileTypeScript()
```typescript
private transpileTypeScript(code: string, errors: string[]): string
```

使用 TypeScript Compiler API 转译：
- 配置编译选项（target: ES2020, module: CommonJS）
- 收集编译诊断信息
- 返回 JavaScript 代码

##### executeInSandbox()
```typescript
private executeInSandbox(code: string, timeout: number): any
```

在安全的 VM 沙箱中执行：
- 创建受限的执行上下文
- 禁止访问危险的全局对象
- 提供受限的 require 函数
- 设置执行超时

##### validateExports()
```typescript
validateExports(exports: any): { valid: boolean; errors: string[] }
```

验证编译后的导出：
- 检查 default 导出
- 检查 parameters 导出
- 验证生命周期函数

### 2. SimpleStrategyLoader 更新

**文件**: `backend/src/backtesting/strategy/loader.ts`

#### 更新内容

```typescript
export class SimpleStrategyLoader implements StrategyLoader {
  private compiler: StrategyCompilerService;

  constructor() {
    this.compiler = new StrategyCompilerService();
  }

  async load(
    scriptContent: string,
    manifest: StrategyManifest
  ): Promise<StrategyInstance> {
    // 1. 编译脚本
    const compileResult = await this.compiler.compile(scriptContent);
    
    // 2. 验证导出
    const validation = this.compiler.validateExports(compileResult.exports);
    
    // 3. 创建策略实例
    return {
      lifecycle: compileResult.exports.default,
      manifest,
      parameters: compileResult.exports.parameters || {},
      customFeatures: compileResult.exports.customFeatures,
    };
  }
}
```

### 3. 前端模板恢复

**文件**: `frontend/src/modules/backtesting/templates/defaultStrategyTemplate.ts`

恢复为标准格式，包含完整的导入语句：

```typescript
import type {
  StrategyLifecycle,
  StrategyContext,
  MarketBarPayload,
} from '@/backtesting/strategy/interfaces';
import { defineParameters } from '@/backtesting/strategy/utils';

export const parameters = defineParameters({ ... });

function onInit(ctx: StrategyContext): void { ... }
function onBar(ctx: StrategyContext, bar: MarketBarPayload): void { ... }
function onStop(ctx: StrategyContext, reason: string): void { ... }

const strategy: StrategyLifecycle = { onInit, onBar, onStop };
export default strategy;
```

## 🔧 技术特点

### 1. 路径别名解析
- ✅ 自动处理 `@/` 路径别名
- ✅ 支持多级路径映射
- ✅ 保持代码可读性

### 2. TypeScript 支持
- ✅ 完整的 TypeScript 类型检查
- ✅ 自动转译为 JavaScript
- ✅ 保留类型安全

### 3. 安全沙箱
- ✅ VM 隔离执行
- ✅ 受限的全局对象访问
- ✅ 受控的模块导入
- ✅ 执行超时保护

### 4. 错误处理
- ✅ 详细的编译错误信息
- ✅ TypeScript 诊断信息
- ✅ 运行时错误捕获

## 📊 性能指标

| 操作 | 预期时间 |
|------|---------|
| 路径预处理 | < 1ms |
| TypeScript 转译 | < 100ms |
| 沙箱执行 | < 50ms |
| 总编译时间 | < 200ms |

## 🧪 测试

### 测试用例

1. **路径别名解析测试**
   ```typescript
   // 输入
   import { X } from '@/backtesting/strategy/interfaces';
   
   // 输出
   import { X } from './interfaces';
   ```

2. **TypeScript 转译测试**
   ```typescript
   // 输入
   function onInit(ctx: StrategyContext): void { }
   
   // 输出
   function onInit(ctx) { }
   ```

3. **沙箱执行测试**
   - 验证模块导出
   - 验证全局对象限制
   - 验证超时机制

### 运行测试

```bash
cd backend
npm test -- strategy/compiler.service.spec.ts
```

## 🚀 使用示例

### 创建策略

```typescript
// 前端提交的代码（包含路径别名）
const strategyCode = `
import type { StrategyLifecycle, StrategyContext } from '@/backtesting/strategy/interfaces';
import { defineParameters } from '@/backtesting/strategy/utils';

export const parameters = defineParameters({ ... });

function onInit(ctx: StrategyContext): void { ... }

const strategy: StrategyLifecycle = { onInit };
export default strategy;
`;

// 后端处理
const loader = new SimpleStrategyLoader();
const instance = await loader.load(strategyCode, manifest);

// 策略实例可以直接使用
const sandbox = new StrategySandbox(instance, context);
await sandbox.start(eventBus);
```

## ⚠️ 注意事项

### 1. 安全性
- 沙箱环境限制了危险操作
- 不允许访问文件系统
- 不允许访问网络
- 不允许访问进程信息

### 2. 性能
- 编译结果可以缓存
- 避免重复编译相同代码
- 设置合理的超时时间

### 3. 兼容性
- 支持 TypeScript 4.x+
- 支持 Node.js 14+
- 兼容现有策略脚本

## 📚 相关文档

- [策略开发指南](./strategy-management-detail.md)
- [StrategySandbox 文档](../../backend/src/backtesting/strategy/README.md)
- [策略示例](../../backend/src/backtesting/strategy/examples/)

## 🎯 未来改进

### 短期
- [ ] 添加编译缓存机制
- [ ] 优化路径解析性能
- [ ] 增强错误提示

### 长期
- [ ] 支持更多路径别名
- [ ] 支持 ES Module
- [ ] 支持 Source Map
- [ ] 集成 Babel 转译

## ✅ 完成状态

| 功能 | 状态 |
|------|------|
| 路径别名解析 | ✅ 完成 |
| TypeScript 转译 | ✅ 完成 |
| 沙箱执行 | ✅ 完成 |
| 错误处理 | ✅ 完成 |
| 导出验证 | ✅ 完成 |
| 集成到加载器 | ✅ 完成 |
| 前端模板恢复 | ✅ 完成 |
| 文档编写 | ✅ 完成 |

---

**创建时间**: 2024-11-10  
**最后更新**: 2024-11-10  
**版本**: 1.0.0  
**状态**: ✅ 已完成

