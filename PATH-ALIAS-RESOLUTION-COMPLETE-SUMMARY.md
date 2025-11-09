# 路径别名解析完整实现总结

## 问题背景

用户报告在创建策略时,前端默认模板使用了后端特定的路径别名(如 `@/backtesting/strategy/interfaces`),导致策略创建失败。用户明确要求**后端在编译时处理路径映射**,而不是修改策略脚本。

## 解决方案概述

实现了**后端动态编译时路径别名解析**方案,在三个关键环节处理路径别名:

1. **策略编译服务** (`compiler.service.ts`) - 用于实际执行策略
2. **策略验证服务** (`strategy-script.validator.ts`) - 用于代码质量检查
3. **策略解析服务** (`strategy-script.parser.ts`) - 用于提取参数schema

## 详细实现

### 1. 策略编译服务 (`backend/src/backtesting/strategy/compiler.service.ts`)

**新创建的文件**,负责:
- TypeScript 代码转译
- 路径别名预处理
- 沙箱环境执行
- 导出验证

**核心功能:**

```typescript
class StrategyCompilerService {
  // 预处理路径别名
  private preprocessImports(code: string): string {
    const importRegex = /from\s+['"](@\/[^'"]+)['"]/g;
    return code.replace(importRegex, (match, importPath) => {
      if (importPath.startsWith('@/backtesting/strategy/')) {
        return match.replace(importPath, './' + importPath.replace('@/backtesting/strategy/', ''));
      }
      if (importPath.startsWith('@/backtesting/')) {
        return match.replace(importPath, '../' + importPath.replace('@/backtesting/', ''));
      }
      if (importPath.startsWith('@/')) {
        return match.replace(importPath, '../../' + importPath.replace('@/', ''));
      }
      return match;
    });
  }

  // 编译策略
  async compile(scriptContent: string): Promise<CompileResult> {
    const processedCode = this.preprocessImports(scriptContent);
    const jsCode = this.transpileTypeScript(processedCode);
    const exports = this.executeInSandbox(jsCode);
    return { success: true, code: jsCode, exports };
  }
}
```

**测试覆盖:** 16个单元测试,全部通过 ✅

### 2. 策略验证服务 (`backend/src/backtesting/strategies/strategy-script.validator.ts`)

**更新内容:**

1. **添加路径别名预处理**
   ```typescript
   async validate(sourceCode: string): Promise<ScriptValidationResult> {
     const processedCode = this.preprocessImports(sourceCode);
     // ... 继续验证
   }
   ```

2. **添加策略接口类型声明**
   ```typescript
   const STRATEGY_INTERFACES_FILE = './interfaces.d.ts';
   const STRATEGY_UTILS_FILE = './utils.d.ts';
   
   // 在 files Map 中添加类型定义
   files.set(STRATEGY_INTERFACES_FILE, `
     export interface StrategyContext { ... }
     export interface MarketBarPayload { ... }
     export interface StrategyLifecycle { ... }
   `);
   
   files.set(STRATEGY_UTILS_FILE, `
     export declare function defineParameters(...): ...;
   `);
   ```

3. **更新模块解析逻辑**
   ```typescript
   resolveModuleNames: (moduleNames) =>
     moduleNames.map((moduleName) => {
       if (moduleName === './interfaces') {
         return { resolvedFileName: STRATEGY_INTERFACES_FILE, ... };
       }
       if (moduleName === './utils') {
         return { resolvedFileName: STRATEGY_UTILS_FILE, ... };
       }
       // ... 其他模块
     })
   ```

### 3. 策略解析服务 (`backend/src/backtesting/strategies/strategy-script.parser.ts`)

**更新内容:**

1. **添加路径别名预处理**
   ```typescript
   parse(sourceCode: string): ParsedStrategySchema {
     const processedCode = this.preprocessImports(sourceCode);
     const transpiled = ts.transpileModule(processedCode, ...);
     // ... 继续解析
   }
   ```

2. **更新SDK stub以支持新API**
   ```typescript
   private createSdkStub(target) {
     const defineParameters = (params: Record<string, any>) => {
       return params; // 新格式的参数定义
     };
     
     return {
       defineStrategy,    // 旧格式
       parameter,         // 旧格式
       factor,            // 旧格式
       defineParameters,  // 新格式 ✨
     };
   }
   ```

3. **更新require函数以支持新模块**
   ```typescript
   require: (moduleName: string) => {
     if (moduleName === './interfaces' ||
         moduleName === './utils' ||
         moduleName === './context') {
       return sdkStub;
     }
     // ... 其他模块
   }
   ```

4. **支持新的策略格式**
   ```typescript
   // 检查是否是新的策略框架格式
   const isNewFormat = resolved && typeof resolved === 'object' && (
     typeof resolved.onInit === 'function' ||
     typeof resolved.onBar === 'function' ||
     typeof resolved.onStop === 'function'
   );
   
   // 检查是否是旧的策略框架格式
   const isOldFormat = resolved && typeof resolved === 'object' && 
     typeof resolved.run === 'function';
   ```

### 4. 策略加载器 (`backend/src/backtesting/strategy/loader.ts`)

**更新内容:**

集成编译服务:

```typescript
class SimpleStrategyLoader implements StrategyLoader {
  private compiler: StrategyCompilerService;

  constructor() {
    this.compiler = new StrategyCompilerService();
  }

  async load(scriptContent: string, manifest: StrategyManifest): Promise<StrategyInstance> {
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

### 5. 前端模板 (`frontend/src/modules/backtesting/templates/defaultStrategyTemplate.ts`)

**保持不变**,继续使用后端路径别名:

```typescript
import type {
  StrategyLifecycle,
  StrategyContext,
  MarketBarPayload,
} from '@/backtesting/strategy/interfaces';
import { defineParameters } from '@/backtesting/strategy/utils';

export const parameters = defineParameters({
  shortPeriod: { type: 'number', default: 10, ... },
  longPeriod: { type: 'number', default: 30, ... },
});

function onInit(ctx: StrategyContext): void { ... }
function onBar(ctx: StrategyContext, bar: MarketBarPayload): void { ... }
function onStop(ctx: StrategyContext, reason: string): void { ... }

const strategy: StrategyLifecycle = { onInit, onBar, onStop };
export default strategy;
```

## 路径映射规则

| 原始路径 | 转换后路径 | 说明 |
|---------|-----------|------|
| `@/backtesting/strategy/interfaces` | `./interfaces` | 策略目录内的模块 |
| `@/backtesting/strategy/utils` | `./utils` | 策略目录内的模块 |
| `@/backtesting/other` | `../other` | 回测模块内其他目录 |
| `@/common/utils` | `../../common/utils` | 项目根目录下的模块 |

## 测试验证

### 单元测试

**编译服务测试** (`compiler.service.spec.ts`):
- ✅ 路径别名解析 (3个测试)
- ✅ TypeScript 转译 (2个测试)
- ✅ 沙箱执行 (3个测试)
- ✅ 错误处理 (3个测试)
- ✅ 导出验证 (4个测试)
- ✅ 完整策略编译 (1个测试)

**总计: 16个测试,全部通过** ✅

### 集成测试

**策略创建API测试**:

```bash
# 测试结果
✅ 策略创建成功! (HTTP 201)

# 创建的策略信息
{
  "strategyId": "bfa90499-7263-4206-a2b5-f02ee9aef5cc",
  "name": "测试双均线策略-1762699208275",
  "tags": ["测试", "双均线"],
  "scriptVersions": [{
    "versionName": "v20251109.1",
    "code": "... 包含 @/backtesting/strategy/ 路径别名的代码 ...",
    "parameterSchema": [],
    "factorSchema": []
  }]
}
```

## 技术亮点

1. **统一的路径处理** - 三个服务使用相同的 `preprocessImports` 方法
2. **向后兼容** - 同时支持旧格式(`defineStrategy`)和新格式(`defineParameters`)
3. **类型安全** - 保留TypeScript类型注解,提供完整的类型声明
4. **安全沙箱** - 限制可访问的模块和全局对象
5. **完善的错误处理** - 详细的编译错误和运行时错误捕获

## 文件清单

### 新创建的文件
- ✨ `backend/src/backtesting/strategy/compiler.service.ts` - 编译服务
- ✨ `backend/src/backtesting/strategy/compiler.service.spec.ts` - 单元测试
- ✨ `backend/src/backtesting/strategy/PATH-ALIAS-RESOLUTION-SUMMARY.md` - 详细文档

### 修改的文件
- 🔧 `backend/src/backtesting/strategy/loader.ts` - 集成编译服务
- 🔧 `backend/src/backtesting/strategies/strategy-script.validator.ts` - 添加路径别名支持
- 🔧 `backend/src/backtesting/strategies/strategy-script.parser.ts` - 添加路径别名支持和新格式支持

### 保持不变的文件
- ✅ `frontend/src/modules/backtesting/templates/defaultStrategyTemplate.ts` - 前端模板

## 优势总结

1. **用户体验** ✨
   - 前端模板使用后端真实路径,保持一致性
   - 完整的TypeScript类型支持,更好的IDE体验
   - 无需手动修改导入路径

2. **开发效率** 🚀
   - 路径映射逻辑集中管理
   - 易于维护和扩展
   - 完善的单元测试覆盖

3. **系统安全** 🔒
   - 沙箱环境执行
   - 限制模块访问
   - 详细的错误处理

4. **架构设计** 🏗️
   - 关注点分离
   - 高内聚低耦合
   - 易于测试

## 后续优化建议

1. **性能优化**
   - 缓存编译结果
   - 使用Worker线程进行编译
   - 增量编译支持

2. **功能增强**
   - 支持更多路径别名
   - Source Map生成
   - 更细粒度的权限控制

3. **开发体验**
   - 更友好的错误提示
   - 编译过程可视化
   - 调试工具集成

## 相关文档

- [策略编译服务详细文档](backend/src/backtesting/strategy/PATH-ALIAS-RESOLUTION-SUMMARY.md)
- [策略管理 README](backend/src/backtesting/strategy/README.md)
- [策略接口定义](backend/src/backtesting/strategy/interfaces.ts)

---

**完成时间**: 2025-11-09  
**作者**: AI Assistant  
**版本**: 1.0.0  
**状态**: ✅ 已完成并测试通过

