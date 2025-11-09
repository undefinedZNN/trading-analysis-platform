# 路径别名解析方案总结

## 问题背景

前端策略模板使用了后端特定的路径别名(如 `@/backtesting/strategy/interfaces`),这些路径在前端环境中无法直接使用。用户反馈表示不希望修改策略脚本本身,而是要求后端在编译时处理路径映射。

## 解决方案

### 核心思路

**后端动态编译时处理路径别名** - 在策略脚本加载和编译阶段,由后端的 `StrategyCompilerService` 自动解析和转换路径别名为相对路径。

### 实现细节

#### 1. 创建策略编译服务 (`compiler.service.ts`)

负责:
- TypeScript 代码转译
- 路径别名预处理
- 沙箱环境执行
- 导出验证

**路径别名映射规则:**

```typescript
// 原始导入                                    -> 转换后
'@/backtesting/strategy/interfaces'         -> './interfaces'
'@/backtesting/strategy/utils'              -> './utils'
'@/backtesting/other'                       -> '../other'
'@/common/utils'                            -> '../../common/utils'
```

#### 2. 更新策略加载器 (`loader.ts`)

集成 `StrategyCompilerService`,在 `load()` 方法中:

1. 调用编译服务编译脚本
2. 验证编译结果和导出
3. 提取生命周期、参数和自定义特征
4. 返回策略实例

#### 3. 前端模板保持不变 (`defaultStrategyTemplate.ts`)

前端模板继续使用后端路径别名和 TypeScript 类型注解:

```typescript
import type {
  StrategyLifecycle,
  StrategyContext,
  MarketBarPayload,
} from '@/backtesting/strategy/interfaces';
import { defineParameters } from '@/backtesting/strategy/utils';
```

后端会在编译时自动处理这些导入。

## 技术实现

### 路径别名预处理

```typescript
private preprocessImports(code: string): string {
  const importRegex = /from\s+['"](@\/[^'"]+)['"]/g;
  
  return code.replace(importRegex, (match, importPath) => {
    // @/backtesting/strategy/ -> ./
    if (importPath.startsWith('@/backtesting/strategy/')) {
      const relativePath = './' + importPath.replace('@/backtesting/strategy/', '');
      return match.replace(importPath, relativePath);
    }
    // @/backtesting/ -> ../
    if (importPath.startsWith('@/backtesting/')) {
      const relativePath = '../' + importPath.replace('@/backtesting/', '');
      return match.replace(importPath, relativePath);
    }
    // @/ -> ../../
    if (importPath.startsWith('@/')) {
      const relativePath = '../../' + importPath.replace('@/', '');
      return match.replace(importPath, relativePath);
    }
    return match;
  });
}
```

### TypeScript 转译

使用 TypeScript Compiler API 的 `transpileModule`:

```typescript
const result = ts.transpileModule(code, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    // ... 其他选项
  },
  reportDiagnostics: true,
});
```

### 沙箱执行

使用 Node.js `vm` 模块在受限环境中执行编译后的代码:

```typescript
const sandbox = {
  module: moduleObject,
  exports: moduleExports,
  require: this.createRequireFunction(),
  // 允许的全局对象
  console, Date, Math, JSON, ...
  // 禁止的全局对象
  process: undefined,
  global: undefined,
};

vm.runInNewContext(code, sandbox, { timeout });
```

## 测试覆盖

### 单元测试 (`compiler.service.spec.ts`)

- ✅ 路径别名解析 (3个测试)
- ✅ TypeScript 转译 (2个测试)
- ✅ 沙箱执行 (3个测试)
- ✅ 错误处理 (3个测试)
- ✅ 导出验证 (4个测试)
- ✅ 完整策略编译 (1个测试)

**总计: 16个测试,全部通过**

### 集成测试

验证了从前端模板到后端编译的完整流程:

1. 创建策略加载器
2. 编译包含路径别名的策略脚本
3. 验证策略实例结构
4. 验证生命周期函数
5. 验证参数定义

## 优势

1. **前端模板保持一致性** - 使用后端的真实路径和类型定义
2. **类型安全** - 保留 TypeScript 类型注解,提供更好的开发体验
3. **安全性** - 在沙箱环境中执行,限制可访问的模块和全局对象
4. **可维护性** - 路径映射逻辑集中在编译服务中,易于维护
5. **错误处理** - 完善的编译错误和运行时错误捕获

## 使用示例

### 前端创建策略

```typescript
// 前端使用默认模板
import { defaultStrategyTemplate } from './templates/defaultStrategyTemplate';

// 提交策略
await createStrategy({
  name: '双均线策略',
  code: defaultStrategyTemplate,
  // ...
});
```

### 后端处理

```typescript
// 后端自动编译
const loader = new SimpleStrategyLoader();
const instance = await loader.load(scriptContent, manifest);

// 策略已准备就绪,可以运行
```

## 文件清单

- `backend/src/backtesting/strategy/compiler.service.ts` - 编译服务实现
- `backend/src/backtesting/strategy/compiler.service.spec.ts` - 单元测试
- `backend/src/backtesting/strategy/loader.ts` - 更新的加载器
- `frontend/src/modules/backtesting/templates/defaultStrategyTemplate.ts` - 前端模板

## 后续优化建议

1. **缓存编译结果** - 对相同的脚本内容缓存编译结果
2. **更细粒度的权限控制** - 根据策略类型允许不同的模块访问
3. **编译性能优化** - 考虑使用 Worker 线程进行编译
4. **Source Map 支持** - 生成 Source Map 以便调试
5. **更多的路径别名** - 支持更多的项目路径别名

## 相关文档

- [策略管理 README](./README.md)
- [策略接口定义](./interfaces.ts)
- [策略工具函数](./utils.ts)

---

**创建时间**: 2025-11-09  
**作者**: AI Assistant  
**版本**: 1.0.0

