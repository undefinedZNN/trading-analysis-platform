// backend/src/backtesting/strategy/validators/eslint-checker.types.ts

export interface ESLintError {
  line: number;           // 错误所在行号
  column: number;         // 错误所在列号
  endLine?: number;       // 错误结束行号
  endColumn?: number;     // 错误结束列号
  message: string;        // 错误消息
  ruleId: string | null;  // 规则ID
  severity: 'error' | 'warning'; // 严重级别
  fixable: boolean;       // 是否可自动修复
}

export interface ESLintCheckResult {
  valid: boolean;                // 是否通过检查
  errors: ESLintError[];         // 错误列表
  warnings: ESLintError[];       // 警告列表
  fixableErrorCount: number;     // 可修复错误数
  fixableWarningCount: number;   // 可修复警告数
  executionTime: number;         // 执行时间（毫秒）
}

export interface ESLintCheckerOptions {
  rules?: Record<string, any>;      // 自定义规则
  env?: Record<string, boolean>;    // 环境配置
  globals?: Record<string, boolean>; // 全局变量
}

