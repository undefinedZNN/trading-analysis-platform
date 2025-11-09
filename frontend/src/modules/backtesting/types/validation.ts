// frontend/src/modules/backtesting/types/validation.ts

export interface TypeScriptError {
  line: number;
  column: number;
  message: string;
  code: number;
  category: 'error' | 'warning' | 'suggestion' | 'message';
  file?: string;
  length?: number;
}

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

export interface ValidationResult {
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

export type ErrorType = 'typescript' | 'eslint';
export type ErrorSeverity = 'error' | 'warning';

export interface FilterOptions {
  type?: ErrorType | 'all';
  severity?: ErrorSeverity | 'all';
}

