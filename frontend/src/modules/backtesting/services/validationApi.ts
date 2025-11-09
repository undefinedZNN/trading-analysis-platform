// frontend/src/modules/backtesting/services/validationApi.ts

import axios from 'axios';

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

/**
 * 调用后端API校验代码
 */
export const validateCode = async (
  request: ValidationRequest
): Promise<ValidationResponse> => {
  try {
    const response = await axios.post<ValidationResponse>(
      `${API_BASE_URL}/api/backtesting/strategies/validate`,
      request,
      {
        timeout: 30000, // 30秒超时
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // 服务器返回错误
        const message = error.response.data?.message || '校验失败';
        throw new Error(message);
      } else if (error.request) {
        // 网络错误
        throw new Error('网络连接失败，请检查网络设置或确保后端服务正在运行');
      } else if (error.code === 'ECONNABORTED') {
        // 超时错误
        throw new Error('请求超时，请稍后重试');
      }
    }
    throw new Error('未知错误，请稍后重试');
  }
};

