# FE-103: 校验触发与流程 - 开发指南

## 📋 任务信息

- **任务编号**: FE-103
- **任务名称**: 校验触发与流程
- **优先级**: P0
- **预估工时**: 0.5天
- **依赖**: FE-101 ✅, FE-102 ✅

## 🎯 任务目标

实现完整的代码校验流程，包括调用后端API、处理校验结果、错误处理、加载状态管理等。将前端组件与后端服务完整集成。

## 📝 验收标准

- [ ] 调用后端校验API
- [ ] 处理校验结果并更新UI
- [ ] 错误处理和用户提示
- [ ] 加载状态管理

## 🏗️ 技术方案

### API服务层

创建一个专门的API服务来处理与后端的通信：

```typescript
// validationApi.ts
interface ValidationRequest {
  code: string;
  language?: string;
}

interface ValidationResponse {
  typeScript: {
    valid: boolean;
    errors: TypeScriptError[];
    warnings: TypeScriptError[];
    executionTime: number;
  };
  eslint: {
    valid: boolean;
    errors: ESLintError[];
    warnings: ESLintError[];
    fixableErrorCount: number;
    fixableWarningCount: number;
    executionTime: number;
  };
}

export const validateCode = async (
  request: ValidationRequest
): Promise<ValidationResponse> => {
  // 调用后端API
};
```

### React Hook封装

创建一个自定义Hook来管理校验状态和流程：

```typescript
// useCodeValidation.ts
interface UseCodeValidationResult {
  validationResult: ValidationResult | null;
  isValidating: boolean;
  error: string | null;
  validate: (code: string) => Promise<void>;
  clear: () => void;
}

export const useCodeValidation = (): UseCodeValidationResult => {
  // 状态管理
  // API调用
  // 错误处理
};
```

## 🔧 实现步骤

### Step 1: 创建API服务 (10分钟)

创建 `frontend/src/modules/backtesting/services/validationApi.ts`

**关键功能**:
- 定义API请求/响应类型
- 实现API调用函数
- 错误处理和重试逻辑

### Step 2: 创建自定义Hook (15分钟)

创建 `frontend/src/modules/backtesting/hooks/useCodeValidation.ts`

**关键功能**:
- 管理校验状态（loading, result, error）
- 封装API调用逻辑
- 提供清除和重置功能

### Step 3: 集成到演示页面 (10分钟)

更新 `ValidationResultDemo.tsx`，使用真实的API调用

**关键功能**:
- 替换模拟数据为真实API调用
- 处理加载状态
- 显示错误提示

### Step 4: 添加错误处理 (5分钟)

- 网络错误处理
- API错误处理
- 用户友好的错误提示

## 📐 详细设计

### API服务设计

```typescript
// frontend/src/modules/backtesting/services/validationApi.ts

import axios from 'axios';
import type { ValidationResult } from '../types/validation';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface ValidationRequest {
  code: string;
  language?: string;
}

export interface ValidationResponse {
  typeScript: {
    valid: boolean;
    errors: Array<{
      line: number;
      column: number;
      message: string;
      code: number;
      category: string;
      file?: string;
      length?: number;
    }>;
    warnings: Array<{
      line: number;
      column: number;
      message: string;
      code: number;
      category: string;
      file?: string;
      length?: number;
    }>;
    executionTime: number;
  };
  eslint: {
    valid: boolean;
    errors: Array<{
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
      message: string;
      ruleId: string | null;
      severity: string;
      fixable: boolean;
    }>;
    warnings: Array<{
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
      message: string;
      ruleId: string | null;
      severity: string;
      fixable: boolean;
    }>;
    fixableErrorCount: number;
    fixableWarningCount: number;
    executionTime: number;
  };
}

export const validateCode = async (
  request: ValidationRequest
): Promise<ValidationResponse> => {
  try {
    const response = await axios.post<ValidationResponse>(
      `${API_BASE_URL}/api/backtesting/strategies/validate`,
      request,
      {
        timeout: 30000, // 30秒超时
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // 服务器返回错误
        throw new Error(error.response.data?.message || '校验失败');
      } else if (error.request) {
        // 网络错误
        throw new Error('网络连接失败，请检查网络设置');
      }
    }
    throw new Error('未知错误');
  }
};
```

### Hook设计

```typescript
// frontend/src/modules/backtesting/hooks/useCodeValidation.ts

import { useState, useCallback } from 'react';
import { validateCode, type ValidationResponse } from '../services/validationApi';
import type { ValidationResult } from '../types/validation';

interface UseCodeValidationResult {
  validationResult: ValidationResult | null;
  isValidating: boolean;
  error: string | null;
  validate: (code: string) => Promise<void>;
  clear: () => void;
}

export const useCodeValidation = (): UseCodeValidationResult => {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(async (code: string) => {
    setIsValidating(true);
    setError(null);

    try {
      const response = await validateCode({ code, language: 'typescript' });
      
      // 转换响应格式为前端需要的格式
      const result: ValidationResult = {
        typeScript: {
          valid: response.typeScript.valid,
          errors: response.typeScript.errors.map(e => ({
            ...e,
            category: e.category as 'error' | 'warning' | 'suggestion' | 'message',
          })),
          warnings: response.typeScript.warnings.map(w => ({
            ...w,
            category: w.category as 'error' | 'warning' | 'suggestion' | 'message',
          })),
          executionTime: response.typeScript.executionTime,
        },
        eslint: {
          valid: response.eslint.valid,
          errors: response.eslint.errors.map(e => ({
            ...e,
            severity: e.severity as 'error' | 'warning',
          })),
          warnings: response.eslint.warnings.map(w => ({
            ...w,
            severity: w.severity as 'error' | 'warning',
          })),
          fixableErrorCount: response.eslint.fixableErrorCount,
          fixableWarningCount: response.eslint.fixableWarningCount,
          executionTime: response.eslint.executionTime,
        },
      };

      setValidationResult(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '校验失败';
      setError(errorMessage);
      setValidationResult(null);
    } finally {
      setIsValidating(false);
    }
  }, []);

  const clear = useCallback(() => {
    setValidationResult(null);
    setError(null);
  }, []);

  return {
    validationResult,
    isValidating,
    error,
    validate,
    clear,
  };
};
```

### 演示页面集成

```typescript
// 更新 ValidationResultDemo.tsx

const ValidationResultDemo: React.FC = () => {
  const [code, setCode] = useState(`...`);
  const { validationResult, isValidating, error, validate, clear } = useCodeValidation();

  const handleValidate = async () => {
    await validate(code);
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    // 可选：自动清除之前的校验结果
    // clear();
  };

  return (
    <div>
      {/* 显示错误提示 */}
      {error && (
        <Alert
          message="校验失败"
          description={error}
          type="error"
          closable
          onClose={clear}
        />
      )}

      {/* 编辑器 */}
      <CodeEditorWithValidation
        value={code}
        onChange={handleCodeChange}
        typeScriptErrors={validationResult?.typeScript.errors}
        typeScriptWarnings={validationResult?.typeScript.warnings}
        eslintErrors={validationResult?.eslint.errors}
        eslintWarnings={validationResult?.eslint.warnings}
        onValidationRequest={handleValidate}
      />

      {/* 校验结果 */}
      <ValidationResultPanel
        typeScriptErrors={validationResult?.typeScript.errors}
        typeScriptWarnings={validationResult?.typeScript.warnings}
        eslintErrors={validationResult?.eslint.errors}
        eslintWarnings={validationResult?.eslint.warnings}
        loading={isValidating}
      />
    </div>
  );
};
```

## 🎨 用户体验优化

### 1. 加载状态
- 显示加载动画
- 禁用校验按钮
- 显示"正在校验..."提示

### 2. 错误提示
- 使用Alert组件显示错误
- 可关闭的错误提示
- 友好的错误信息

### 3. 自动校验
- 可选：代码变化后自动校验（防抖）
- 键盘快捷键触发校验
- 保存时自动校验

### 4. 性能优化
- 防抖处理频繁校验
- 取消未完成的请求
- 缓存校验结果

## ⚠️ 注意事项

1. **API端点配置**:
   - 使用环境变量配置API地址
   - 开发环境和生产环境分离

2. **错误处理**:
   - 网络错误
   - 超时错误
   - 服务器错误
   - 参数错误

3. **性能优化**:
   - 防抖处理（避免频繁调用）
   - 请求取消（组件卸载时）
   - 结果缓存（相同代码不重复校验）

4. **用户体验**:
   - 加载状态清晰
   - 错误提示友好
   - 操作反馈及时

## 🧪 测试要点

### 功能测试
- [ ] 校验按钮触发校验
- [ ] 键盘快捷键触发校验
- [ ] 校验结果正确显示
- [ ] 错误提示正确显示
- [ ] 加载状态正确显示

### 错误处理测试
- [ ] 网络断开时的处理
- [ ] API返回错误时的处理
- [ ] 超时时的处理
- [ ] 无效代码的处理

### 性能测试
- [ ] 大文件校验不卡顿
- [ ] 频繁校验不崩溃
- [ ] 内存使用正常

## 🎯 完成检查清单

- [ ] Step 1: 创建API服务
- [ ] Step 2: 创建自定义Hook
- [ ] Step 3: 集成到演示页面
- [ ] Step 4: 添加错误处理
- [ ] 无ESLint错误
- [ ] 功能测试通过
- [ ] 错误处理测试通过
- [ ] 代码审查通过

## 📊 预期交付物

1. `validationApi.ts` - API服务
2. `useCodeValidation.ts` - 自定义Hook
3. 更新 `ValidationResultDemo.tsx` - 集成真实API
4. 环境变量配置文件

## 🚀 开始开发

准备好了吗？让我们完成Sprint 1.1的最后一个任务！

```bash
# 1. 确保后端服务运行
cd backend && npm run start:dev

# 2. 确保前端服务运行
cd frontend && npm run dev

# 3. 开始编码！
```

---

**预计完成时间**: 0.5-1小时  
**难度**: ⭐⭐⭐ (中)  
**关键技术**: Axios, React Hooks, 错误处理, 状态管理

