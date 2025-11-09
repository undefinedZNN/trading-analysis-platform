// backend/src/backtesting/strategy/validators/typescript-checker.types.ts

export interface TypeScriptError {
  line: number;           // 错误所在行号（从1开始）
  column: number;         // 错误所在列号（从1开始）
  message: string;        // 错误消息
  code: number;           // TypeScript错误代码
  category: 'error' | 'warning' | 'suggestion' | 'message'; // 错误类别
  file?: string;          // 文件名（可选）
  length?: number;        // 错误文本长度
}

export interface TypeScriptCheckResult {
  valid: boolean;         // 是否通过类型检查
  errors: TypeScriptError[];    // 错误列表
  warnings: TypeScriptError[];  // 警告列表
  executionTime: number;  // 执行时间（毫秒）
}

export interface TypeScriptCheckerOptions {
  timeout?: number;       // 超时时间（毫秒），默认3000
  strict?: boolean;       // 是否启用严格模式，默认true
  target?: string;        // 编译目标，默认ES2020
  lib?: string[];         // 包含的库文件
}

