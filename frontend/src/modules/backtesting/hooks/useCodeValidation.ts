// frontend/src/modules/backtesting/hooks/useCodeValidation.ts

import { useState, useCallback, useRef } from 'react';
import { validateCode, type ValidationResponse } from '../services/validationApi';
import type { ValidationResult } from '../types/validation';

interface UseCodeValidationResult {
  validationResult: ValidationResult | null;
  isValidating: boolean;
  error: string | null;
  validate: (code: string) => Promise<void>;
  clear: () => void;
}

/**
 * 代码校验Hook
 * 管理校验状态、API调用和错误处理
 */
export const useCodeValidation = (): UseCodeValidationResult => {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 执行代码校验
   */
  const validate = useCallback(async (code: string) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的AbortController
    abortControllerRef.current = new AbortController();

    setIsValidating(true);
    setError(null);

    try {
      const response: ValidationResponse = await validateCode({
        code,
        language: 'typescript',
      });

      // 转换响应格式为前端需要的格式
      const result: ValidationResult = {
        typeScript: {
          valid: response.typeScript.valid,
          errors: response.typeScript.errors.map((e) => ({
            ...e,
            category: e.category as 'error' | 'warning' | 'suggestion' | 'message',
          })),
          warnings: response.typeScript.warnings.map((w) => ({
            ...w,
            category: w.category as 'error' | 'warning' | 'suggestion' | 'message',
          })),
          executionTime: response.typeScript.executionTime,
        },
        eslint: {
          valid: response.eslint.valid,
          errors: response.eslint.errors.map((e) => ({
            ...e,
            severity: e.severity as 'error' | 'warning',
          })),
          warnings: response.eslint.warnings.map((w) => ({
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
      // 忽略取消的请求
      if (err instanceof Error && err.name === 'CanceledError') {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '校验失败';
      setError(errorMessage);
      setValidationResult(null);
    } finally {
      setIsValidating(false);
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * 清除校验结果和错误
   */
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

