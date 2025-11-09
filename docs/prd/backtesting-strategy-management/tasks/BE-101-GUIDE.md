# BE-101: TypeScript类型检查服务 - 开发指南

## 📋 任务信息

- **任务编号**: BE-101
- **任务名称**: TypeScript类型检查服务
- **优先级**: P0
- **预估工时**: 1天
- **依赖**: 无

## 🎯 任务目标

实现TypeScript类型检查服务，用于验证策略脚本的类型正确性。该服务将在用户保存策略脚本时自动执行类型检查，并返回详细的错误信息。

## 📝 验收标准

- [ ] 能够检测TypeScript类型错误
- [ ] 返回结构化错误信息
- [ ] 执行超时控制（< 3秒）
- [ ] 单元测试覆盖率 ≥ 80%

## 🏗️ 技术方案

### 方案选择

我们将使用 **TypeScript Compiler API** 来实现类型检查：

**优点**:
- 官方API，稳定可靠
- 完整的类型检查能力
- 详细的错误信息
- 支持增量编译

**替代方案**:
- `ts-node`: 太重，不适合服务端
- `esbuild`: 主要用于构建，类型检查不够详细
- `swc`: 速度快但类型检查功能有限

### 核心功能

1. **类型检查**: 使用 `ts.createProgram` 创建程序并检查类型
2. **错误收集**: 收集语法错误和语义错误
3. **错误格式化**: 将TypeScript错误转换为结构化格式
4. **超时控制**: 使用 `Promise.race` 实现超时控制
5. **虚拟文件系统**: 支持内存中的文件系统，无需写入磁盘

## 📐 架构设计

```
TypeScriptCheckerService
├── check(code: string): Promise<CheckResult>
│   ├── 创建虚拟文件系统
│   ├── 配置编译选项
│   ├── 创建Program
│   ├── 获取诊断信息
│   └── 格式化错误
├── formatDiagnostic(diagnostic): TypeScriptError
└── createCompilerHost(): CompilerHost
```

## 🔧 实现步骤

### Step 1: 定义类型接口 (10分钟)

创建 `typescript-checker.types.ts`：

```typescript
export interface TypeScriptError {
  line: number;
  column: number;
  message: string;
  code: number;
  category: 'error' | 'warning' | 'suggestion' | 'message';
  file?: string;
}

export interface TypeScriptCheckResult {
  valid: boolean;
  errors: TypeScriptError[];
  warnings: TypeScriptError[];
  executionTime: number; // ms
}
```

### Step 2: 实现TypeScript检查服务 (40分钟)

创建 `typescript-checker.service.ts`：

**核心要点**:
1. 使用 `ts.createCompilerHost` 创建虚拟文件系统
2. 配置严格的编译选项
3. 使用 `ts.createProgram` 创建程序
4. 获取 `getPreEmitDiagnostics` 和 `getSemanticDiagnostics`
5. 格式化诊断信息

**关键配置**:
```typescript
const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  strict: true,
  noImplicitAny: true,
  strictNullChecks: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
};
```

### Step 3: 实现超时控制 (15分钟)

使用 `Promise.race` 实现超时：

```typescript
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('TypeScript check timeout')), 3000);
});

const checkPromise = this.performCheck(code);

return Promise.race([checkPromise, timeoutPromise]);
```

### Step 4: 编写单元测试 (30分钟)

创建 `typescript-checker.service.spec.ts`：

**测试用例**:
1. 应该检测到类型错误
2. 应该检测到未定义的变量
3. 应该检测到类型不匹配
4. 应该通过正确的代码
5. 应该返回结构化错误信息
6. 应该在超时时抛出错误
7. 应该区分错误和警告
8. 应该包含行号和列号

### Step 5: 集成到Strategy模块 (10分钟)

1. 在 `strategy.module.ts` 中添加 `TypeScriptCheckerService`
2. 在 `validators/index.ts` 中导出服务

### Step 6: 编写集成测试 (20分钟)

创建 `typescript-checker.integration.spec.ts`：

**测试场景**:
1. 真实策略脚本的类型检查
2. 复杂类型的检查
3. 导入语句的检查
4. 接口实现的检查

### Step 7: 编写文档和示例 (15分钟)

1. 创建 `typescript-checker.example.ts`
2. 更新 `validators/README.md`

## 📚 参考资料

### TypeScript Compiler API

- [官方文档](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [ts.createProgram](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#getting-the-type-checker)
- [Diagnostics](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#getting-diagnostics)

### 策略脚本类型定义

策略脚本需要实现的接口：

```typescript
interface StrategyContext {
  parameters: Record<string, any>;
  factors: Record<string, any>;
  emit: (event: TradeEvent) => void;
}

interface StrategyScript {
  parameters: Record<string, FieldSchema>;
  factors: Record<string, FieldSchema>;
  onInit?: (ctx: StrategyContext) => void;
  onBar: (ctx: StrategyContext, bar: BarData) => void;
  onTick?: (ctx: StrategyContext, tick: TickData) => void;
}
```

## 🧪 测试用例示例

### 测试用例1: 检测类型错误

```typescript
const code = `
  const x: number = "hello"; // 类型错误
`;

const result = await service.check(code);
expect(result.valid).toBe(false);
expect(result.errors.length).toBeGreaterThan(0);
expect(result.errors[0].message).toContain('Type');
```

### 测试用例2: 检测未定义变量

```typescript
const code = `
  console.log(undefinedVar); // 未定义
`;

const result = await service.check(code);
expect(result.valid).toBe(false);
expect(result.errors[0].message).toContain('Cannot find name');
```

### 测试用例3: 正确的代码

```typescript
const code = `
  const x: number = 42;
  const y: string = "hello";
`;

const result = await service.check(code);
expect(result.valid).toBe(true);
expect(result.errors).toHaveLength(0);
```

## ⚠️ 注意事项

1. **性能优化**:
   - 使用虚拟文件系统，避免磁盘I/O
   - 缓存类型定义文件
   - 考虑使用Worker线程隔离

2. **错误处理**:
   - 捕获编译器崩溃
   - 处理超时情况
   - 提供友好的错误消息

3. **安全性**:
   - 限制内存使用
   - 超时控制
   - 禁止访问文件系统

4. **兼容性**:
   - 支持策略脚本的类型定义
   - 兼容不同的TypeScript版本
   - 处理第三方库的类型定义

## 🎯 完成检查清单

- [ ] Step 1: 定义类型接口
- [ ] Step 2: 实现TypeScript检查服务
- [ ] Step 3: 实现超时控制
- [ ] Step 4: 编写单元测试（≥8个用例）
- [ ] Step 5: 集成到Strategy模块
- [ ] Step 6: 编写集成测试
- [ ] Step 7: 编写文档和示例
- [ ] 所有测试通过
- [ ] 无Linter错误
- [ ] 代码审查通过

## 📊 预期交付物

1. `typescript-checker.types.ts` - 类型定义
2. `typescript-checker.service.ts` - 服务实现
3. `typescript-checker.service.spec.ts` - 单元测试
4. `typescript-checker.integration.spec.ts` - 集成测试
5. `typescript-checker.example.ts` - 使用示例
6. 更新 `validators/README.md`
7. 更新 `strategy.module.ts`

## 🚀 开始开发

准备好了吗？让我们开始吧！

```bash
# 1. 安装TypeScript（如果还没有）
npm install typescript --save

# 2. 创建类型定义文件
touch src/backtesting/strategy/validators/typescript-checker.types.ts

# 3. 创建服务文件
touch src/backtesting/strategy/validators/typescript-checker.service.ts

# 4. 开始编码！
```

---

**预计完成时间**: 2-3小时  
**难度**: ⭐⭐⭐⭐ (中高)  
**关键技术**: TypeScript Compiler API, 虚拟文件系统, Promise超时控制

