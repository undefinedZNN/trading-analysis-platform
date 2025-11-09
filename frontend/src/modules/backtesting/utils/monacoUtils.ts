// frontend/src/modules/backtesting/utils/monacoUtils.ts

import type * as Monaco from 'monaco-editor';
import type { TypeScriptError, ESLintError } from '../types/validation';

/**
 * 将TypeScript和ESLint错误转换为Monaco标记格式
 */
export const convertToMonacoMarkers = (
  typeScriptErrors: TypeScriptError[] = [],
  typeScriptWarnings: TypeScriptError[] = [],
  eslintErrors: ESLintError[] = [],
  eslintWarnings: ESLintError[] = [],
  monaco: typeof Monaco,
): Monaco.editor.IMarkerData[] => {
  const markers: Monaco.editor.IMarkerData[] = [];

  // TypeScript错误
  typeScriptErrors.forEach((error) => {
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: error.line,
      startColumn: error.column,
      endLineNumber: error.line,
      endColumn: error.column + (error.length || 1),
      message: `${error.message} (TS${error.code})`,
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
      message: `${warning.message} (TS${warning.code})`,
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
      message: `${error.message}${error.ruleId ? ` (${error.ruleId})` : ''}${error.fixable ? ' [可修复]' : ''}`,
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
      message: `${warning.message}${warning.ruleId ? ` (${warning.ruleId})` : ''}${warning.fixable ? ' [可修复]' : ''}`,
      code: warning.ruleId || undefined,
    });
  });

  return markers;
};

/**
 * 配置Monaco编辑器选项
 */
export const getDefaultEditorOptions = (): Monaco.editor.IStandaloneEditorConstructionOptions => {
  return {
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
    theme: 'vs-dark',
    renderValidationDecorations: 'on',
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    folding: true,
    foldingStrategy: 'indentation',
    showFoldingControls: 'always',
    formatOnPaste: true,
    formatOnType: true,
  };
};

