# BE-102: ESLint校验服务 - 开发指南

## 📋 任务信息

- **任务编号**: BE-102
- **任务名称**: ESLint校验服务
- **优先级**: P0
- **预估工时**: 0.5天
- **依赖**: 无

## 🎯 任务目标

实现ESLint校验服务，用于检查策略脚本的代码规范和潜在问题。该服务将在用户保存策略脚本时自动执行ESLint检查，并返回详细的错误和警告信息。

## 📝 验收标准

- [ ] 能够检测代码规范问题
- [ ] 支持可配置的规则集
- [ ] 返回结构化错误信息
- [ ] 单元测试覆盖率 ≥ 80%

## 🏗️ 技术方案

### 方案选择

我们将使用 **ESLint** 的编程API来实现代码规范检查：

**优点**:
- 行业标准，生态丰富
- 可配置的规则集
- 详细的错误信息
- 支持自定义规则

**核心库**:
- `eslint`: ESLint核心库
- `@typescript-eslint/parser`: TypeScript解析器
- `@typescript-eslint/eslint-plugin`: TypeScript规则插件

### 核心功能

1. **代码规范检查**: 使用ESLint.lintText检查代码
2. **规则配置**: 配置适合策略脚本的规则集
3. **错误格式化**: 将ESLint结果转换为结构化格式
4. **严重级别分类**: 区分error、warning、suggestion
5. **可修复问题标记**: 标记哪些问题可以自动修复

## 📐 架构设计

```
ESLintCheckerService
├── check(code: string, options?): Promise<ESLintCheckResult>
│   ├── 创建ESLint实例
│   ├── 配置规则
│   ├── 执行lint
│   └── 格式化结果
├── getDefaultConfig(): ESLintConfig
├── formatResult(result): ESLintError[]
└── getSeverityName(severity): string
```

## 🔧 实现步骤

### Step 1: 定义类型接口 (10分钟)

创建 `eslint-checker.types.ts`：

```typescript
export interface ESLintError {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  ruleId: string | null;
  severity: 'error' | 'warning';
  fixable: boolean;
}

export interface ESLintCheckResult {
  valid: boolean;
  errors: ESLintError[];
  warnings: ESLintError[];
  fixableErrorCount: number;
  fixableWarningCount: number;
  executionTime: number;
}

export interface ESLintCheckerOptions {
  rules?: Record<string, any>;
  env?: Record<string, boolean>;
  globals?: Record<string, boolean>;
}
```

### Step 2: 安装依赖 (5分钟)

```bash
cd backend
npm install eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --save
```

### Step 3: 实现ESLint检查服务 (30分钟)

创建 `eslint-checker.service.ts`：

**核心要点**:
1. 使用 `ESLint` 类创建实例
2. 配置TypeScript解析器和插件
3. 使用 `lintText` 方法检查代码
4. 格式化lint结果

**关键配置**:
```typescript
const eslintConfig = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'no-unused-vars': 'error',
    'no-undef': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    // ... 更多规则
  },
};
```

### Step 4: 编写单元测试 (20分钟)

创建 `eslint-checker.service.spec.ts`：

**测试用例**:
1. 应该通过符合规范的代码
2. 应该检测到未使用的变量
3. 应该检测到未定义的变量
4. 应该检测到console.log
5. 应该区分错误和警告
6. 应该标记可修复的问题
7. 应该返回结构化错误信息
8. 应该支持自定义规则

### Step 5: 集成到Strategy模块 (5分钟)

1. 在 `strategy.module.ts` 中添加 `ESLintCheckerService`
2. 在 `validators/index.ts` 中导出服务

### Step 6: 编写集成测试 (15分钟)

创建 `eslint-checker.integration.spec.ts`：

**测试场景**:
1. 真实策略脚本的ESLint检查
2. 多种规则的检查
3. 可修复问题的检测
4. 自定义规则的应用

### Step 7: 编写文档和示例 (10分钟)

1. 创建 `eslint-checker.example.ts`
2. 更新 `validators/README.md`

## 📚 ESLint规则配置

### 推荐规则集

```typescript
const rules = {
  // 变量相关
  'no-unused-vars': 'off', // 关闭JS规则
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
  }],
  'no-undef': 'error',
  
  // 代码质量
  'no-console': 'warn',
  'no-debugger': 'error',
  'no-alert': 'error',
  
  // TypeScript特定
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/no-inferrable-types': 'warn',
  
  // 最佳实践
  'eqeqeq': ['error', 'always'],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  
  // 代码风格
  'semi': ['error', 'always'],
  'quotes': ['error', 'single'],
  'indent': ['error', 2],
};
```

## 🧪 测试用例示例

### 测试用例1: 检测未使用的变量

```typescript
const code = `
  const unusedVar = 42;
  const usedVar = 10;
  console.log(usedVar);
`;

const result = await service.check(code);
expect(result.valid).toBe(false);
expect(result.errors.some(e => e.ruleId === '@typescript-eslint/no-unused-vars')).toBe(true);
```

### 测试用例2: 检测console.log

```typescript
const code = `
  console.log('debug message');
`;

const result = await service.check(code);
expect(result.warnings.some(w => w.ruleId === 'no-console')).toBe(true);
```

### 测试用例3: 正确的代码

```typescript
const code = `
  const x = 42;
  const y = x + 10;
  return y;
`;

const result = await service.check(code);
expect(result.valid).toBe(true);
expect(result.errors).toHaveLength(0);
```

## ⚠️ 注意事项

1. **性能优化**:
   - 缓存ESLint实例
   - 避免重复创建配置
   - 考虑使用Worker线程

2. **规则配置**:
   - 适合策略脚本的规则集
   - 不要过于严格
   - 允许必要的灵活性

3. **错误处理**:
   - 捕获ESLint内部错误
   - 处理解析失败
   - 提供友好的错误消息

4. **兼容性**:
   - 与TypeScript检查器配合
   - 避免规则冲突
   - 统一错误格式

## 🎯 完成检查清单

- [ ] Step 1: 定义类型接口
- [ ] Step 2: 安装ESLint依赖
- [ ] Step 3: 实现ESLint检查服务
- [ ] Step 4: 编写单元测试（≥8个用例）
- [ ] Step 5: 集成到Strategy模块
- [ ] Step 6: 编写集成测试
- [ ] Step 7: 编写文档和示例
- [ ] 所有测试通过
- [ ] 无Linter错误
- [ ] 代码审查通过

## 📊 预期交付物

1. `eslint-checker.types.ts` - 类型定义
2. `eslint-checker.service.ts` - 服务实现
3. `eslint-checker.service.spec.ts` - 单元测试
4. `eslint-checker.integration.spec.ts` - 集成测试
5. `eslint-checker.example.ts` - 使用示例
6. 更新 `validators/README.md`
7. 更新 `strategy.module.ts`

## 🚀 开始开发

准备好了吗？让我们开始吧！

```bash
# 1. 安装ESLint依赖
cd backend
npm install eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --save

# 2. 创建类型定义文件
touch src/backtesting/strategy/validators/eslint-checker.types.ts

# 3. 创建服务文件
touch src/backtesting/strategy/validators/eslint-checker.service.ts

# 4. 开始编码！
```

---

**预计完成时间**: 1.5小时  
**难度**: ⭐⭐⭐ (中等)  
**关键技术**: ESLint API, TypeScript规则配置, 错误格式化

