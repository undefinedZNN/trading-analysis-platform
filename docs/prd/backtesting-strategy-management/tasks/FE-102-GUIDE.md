# FE-102: Monaco编辑器错误标记 - 开发指南

## 📋 任务信息

- **任务编号**: FE-102
- **任务名称**: Monaco编辑器错误标记
- **优先级**: P0
- **预估工时**: 1天
- **依赖**: FE-101 ✅

## 🎯 任务目标

在Monaco编辑器中标记TypeScript和ESLint的错误位置，提供实时的视觉反馈。用户可以在编辑器中直接看到错误的位置，并通过Hover查看错误详情。

## 📝 验收标准

- [ ] 在编辑器中标记错误位置（红色波浪线）
- [ ] 在编辑器中标记警告位置（黄色波浪线）
- [ ] Hover显示错误详情
- [ ] 性能优化（大文件不卡顿）

## 🏗️ 技术方案

### Monaco Editor API

Monaco Editor提供了强大的标记API：

```typescript
// 设置模型标记
monaco.editor.setModelMarkers(model, 'owner', markers);

// 标记格式
interface IMarkerData {
  severity: MarkerSeverity;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  code?: string;
}
```

### 严重级别映射

```typescript
// Monaco Editor的严重级别
enum MarkerSeverity {
  Hint = 1,
  Info = 2,
  Warning = 4,
  Error = 8
}
```

## 📐 组件设计

### CodeEditorWithValidation组件

```typescript
interface CodeEditorWithValidationProps {
  value: string;
  onChange: (value: string) => void;
  typeScriptErrors?: TypeScriptError[];
  typeScriptWarnings?: TypeScriptError[];
  eslintErrors?: ESLintError[];
  eslintWarnings?: ESLintError[];
  language?: string;
  height?: string;
  onValidationRequest?: () => void;
}
```

## 🔧 实现步骤

### Step 1: 创建Monaco编辑器包装组件 (20分钟)

创建 `frontend/src/modules/backtesting/components/CodeEditorWithValidation.tsx`

**关键功能**:
- 集成@monaco-editor/react
- 配置编辑器选项
- 处理代码变化

### Step 2: 实现错误标记转换 (15分钟)

创建工具函数将TypeScript和ESLint错误转换为Monaco标记格式：

```typescript
function convertToMonacoMarkers(
  typeScriptErrors: TypeScriptError[],
  eslintErrors: ESLintError[]
): monaco.editor.IMarkerData[]
```

### Step 3: 实现标记更新逻辑 (20分钟)

- 监听错误数据变化
- 更新Monaco编辑器标记
- 处理标记清除

### Step 4: 优化性能 (15分钟)

- 使用useCallback避免不必要的重渲染
- 使用useMemo缓存标记转换结果
- 防抖处理频繁更新

### Step 5: 添加Hover提示增强 (10分钟)

- 自定义Hover内容
- 显示错误代码和规则ID
- 显示修复建议

### Step 6: 集成到演示页面 (10分钟)

更新ValidationResultDemo页面，集成CodeEditorWithValidation组件

## 🎨 UI效果

### 错误标记

```
代码编辑器
┌─────────────────────────────────────┐
│ 1  const x: number = "hello";       │ ← 红色波浪线
│ 2  console.log(x);                  │ ← 黄色波浪线
│ 3                                   │
│ 4  const y = 42;                    │
└─────────────────────────────────────┘
```

### Hover提示

```
┌─────────────────────────────────────┐
│ Type 'string' is not assignable to  │
│ type 'number'.                      │
│                                     │
│ TS2322                              │
└─────────────────────────────────────┘
```

## 📚 Monaco Editor配置

### 编辑器选项

```typescript
const editorOptions = {
  minimap: { enabled: true },
  fontSize: 14,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on',
  theme: 'vs-dark',
  // 启用错误标记
  renderValidationDecorations: 'on',
};
```

### 语言配置

```typescript
// TypeScript语言配置
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ES2020,
  allowNonTsExtensions: true,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  module: monaco.languages.typescript.ModuleKind.CommonJS,
  noEmit: true,
  esModuleInterop: true,
  jsx: monaco.languages.typescript.JsxEmit.React,
  allowJs: true,
  typeRoots: ['node_modules/@types'],
});
```

## 🔧 核心代码示例

### 转换错误为标记

```typescript
const convertToMonacoMarkers = (
  typeScriptErrors: TypeScriptError[] = [],
  typeScriptWarnings: TypeScriptError[] = [],
  eslintErrors: ESLintError[] = [],
  eslintWarnings: ESLintError[] = [],
): monaco.editor.IMarkerData[] => {
  const markers: monaco.editor.IMarkerData[] = [];

  // TypeScript错误
  typeScriptErrors.forEach((error) => {
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: error.line,
      startColumn: error.column,
      endLineNumber: error.line,
      endColumn: error.column + (error.length || 1),
      message: error.message,
      code: `TS${error.code}`,
    });
  });

  // TypeScript警告
  typeScriptWarnings.forEach((warning) => {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      startLineNumber: warning.line,
      startColumn: warning.column,
      endLineNumber: warning.line,
      endColumn: warning.column + (warning.length || 1),
      message: warning.message,
      code: `TS${warning.code}`,
    });
  });

  // ESLint错误
  eslintErrors.forEach((error) => {
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: error.line,
      startColumn: error.column,
      endLineNumber: error.endLine || error.line,
      endColumn: error.endColumn || error.column + 1,
      message: error.message,
      code: error.ruleId || undefined,
    });
  });

  // ESLint警告
  eslintWarnings.forEach((warning) => {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      startLineNumber: warning.line,
      startColumn: warning.column,
      endLineNumber: warning.endLine || warning.line,
      endColumn: warning.endColumn || warning.column + 1,
      message: warning.message,
      code: warning.ruleId || undefined,
    });
  });

  return markers;
};
```

### 更新标记

```typescript
useEffect(() => {
  if (!editorRef.current) return;

  const model = editorRef.current.getModel();
  if (!model) return;

  const markers = convertToMonacoMarkers(
    typeScriptErrors,
    typeScriptWarnings,
    eslintErrors,
    eslintWarnings,
  );

  monaco.editor.setModelMarkers(model, 'validation', markers);

  return () => {
    // 清理标记
    if (model) {
      monaco.editor.setModelMarkers(model, 'validation', []);
    }
  };
}, [typeScriptErrors, typeScriptWarnings, eslintErrors, eslintWarnings]);
```

## ⚠️ 注意事项

1. **性能优化**:
   - 避免频繁更新标记
   - 使用防抖处理
   - 大文件时限制标记数量

2. **内存管理**:
   - 组件卸载时清理标记
   - 避免内存泄漏

3. **用户体验**:
   - 标记要清晰可见
   - Hover提示要及时
   - 不要阻塞编辑

4. **兼容性**:
   - 处理Monaco未加载的情况
   - 处理模型不存在的情况

## 🎯 完成检查清单

- [ ] Step 1: 创建Monaco编辑器包装组件
- [ ] Step 2: 实现错误标记转换
- [ ] Step 3: 实现标记更新逻辑
- [ ] Step 4: 优化性能
- [ ] Step 5: 添加Hover提示增强
- [ ] Step 6: 集成到演示页面
- [ ] 无ESLint错误
- [ ] 性能测试通过
- [ ] 代码审查通过

## 📊 预期交付物

1. `CodeEditorWithValidation.tsx` - Monaco编辑器包装组件
2. `monacoUtils.ts` - Monaco工具函数
3. 更新 `ValidationResultDemo.tsx` - 演示页面

## 🚀 开始开发

准备好了吗？让我们开始吧！

```bash
# 1. 确保Monaco Editor已安装
npm list @monaco-editor/react

# 2. 启动开发服务器
npm run dev

# 3. 开始编码！
```

---

**预计完成时间**: 1.5小时  
**难度**: ⭐⭐⭐⭐ (中高)  
**关键技术**: Monaco Editor API, React Hooks, 性能优化

