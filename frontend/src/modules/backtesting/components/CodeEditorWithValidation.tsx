// frontend/src/modules/backtesting/components/CodeEditorWithValidation.tsx

import React, { useRef, useEffect, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import type { TypeScriptError, ESLintError } from '../types/validation';
import { convertToMonacoMarkers, getDefaultEditorOptions } from '../utils/monacoUtils';

interface CodeEditorWithValidationProps {
  value: string;
  onChange?: (value: string) => void;
  typeScriptErrors?: TypeScriptError[];
  typeScriptWarnings?: TypeScriptError[];
  eslintErrors?: ESLintError[];
  eslintWarnings?: ESLintError[];
  language?: string;
  height?: string;
  theme?: string;
  readOnly?: boolean;
  onValidationRequest?: () => void;
}

const CodeEditorWithValidation: React.FC<CodeEditorWithValidationProps> = ({
  value,
  onChange,
  typeScriptErrors = [],
  typeScriptWarnings = [],
  eslintErrors = [],
  eslintWarnings = [],
  language = 'typescript',
  height = '600px',
  theme = 'vs-dark',
  readOnly = false,
  onValidationRequest,
}) => {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  // 编辑器挂载时的回调
  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 配置TypeScript编译选项
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

    // 禁用Monaco自带的TypeScript诊断（我们使用自己的）
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    // 添加键盘快捷键：Ctrl+S / Cmd+S 触发校验
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onValidationRequest) {
        onValidationRequest();
      }
    });
  }, [onValidationRequest]);

  // 处理代码变化
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  }, [onChange]);

  // 更新错误标记
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    // 转换错误为Monaco标记
    const markers = convertToMonacoMarkers(
      typeScriptErrors,
      typeScriptWarnings,
      eslintErrors,
      eslintWarnings,
      monacoRef.current,
    );

    // 设置标记
    monacoRef.current.editor.setModelMarkers(model, 'validation', markers);

    // 清理函数
    return () => {
      if (model && monacoRef.current) {
        monacoRef.current.editor.setModelMarkers(model, 'validation', []);
      }
    };
  }, [typeScriptErrors, typeScriptWarnings, eslintErrors, eslintWarnings]);

  return (
    <Editor
      height={height}
      language={language}
      theme={theme}
      value={value}
      onChange={handleEditorChange}
      onMount={handleEditorDidMount}
      options={{
        ...getDefaultEditorOptions(),
        readOnly,
      }}
    />
  );
};

export default CodeEditorWithValidation;

