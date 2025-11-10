/**
 * 版本对比API服务
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

/**
 * 对比模式
 */
export const CompareMode = {
  CODE: 'code',
  SCHEMA: 'schema',
  FULL: 'full',
} as const;

export type CompareMode = typeof CompareMode[keyof typeof CompareMode];

/**
 * 差异类型
 */
export const DiffType = {
  ADDED: 'added',
  REMOVED: 'removed',
  MODIFIED: 'modified',
  UNCHANGED: 'unchanged',
} as const;

export type DiffType = typeof DiffType[keyof typeof DiffType];

/**
 * 版本信息
 */
export interface VersionInfo {
  id: string;
  version: string;
  createdAt: string;
}

/**
 * 代码行差异
 */
export interface CodeLineDiff {
  lineNumber: number;
  type: DiffType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * 代码块差异
 */
export interface CodeBlockDiff {
  startLine: number;
  endLine: number;
  type: DiffType;
  lines: CodeLineDiff[];
}

/**
 * 代码差异结果
 */
export interface CodeDiffResult {
  sourceCode: string;
  targetCode: string;
  diffBlocks: CodeBlockDiff[];
  stats: {
    addedLines: number;
    removedLines: number;
    modifiedLines: number;
    unchangedLines: number;
  };
}

/**
 * Schema字段差异
 */
export interface SchemaFieldDiff {
  fieldName: string;
  type: DiffType;
  sourceValue?: any;
  targetValue?: any;
  description?: string;
}

/**
 * Schema差异结果
 */
export interface SchemaDiffResult {
  parameters: {
    added: SchemaFieldDiff[];
    removed: SchemaFieldDiff[];
    modified: SchemaFieldDiff[];
  };
  factors: {
    added: SchemaFieldDiff[];
    removed: SchemaFieldDiff[];
    modified: SchemaFieldDiff[];
  };
}

/**
 * 版本对比响应
 */
export interface CompareVersionsResponse {
  strategyId: string;
  sourceVersion: VersionInfo;
  targetVersion: VersionInfo;
  mode: CompareMode;
  codeDiff?: CodeDiffResult;
  schemaDiff?: SchemaDiffResult;
  comparedAt: string;
  hasDifferences: boolean;
}

/**
 * 版本对比请求
 */
export interface CompareVersionsRequest {
  sourceVersionId: string;
  targetVersionId: string;
  mode?: CompareMode;
}

/**
 * 可对比版本
 */
export interface VersionForCompare {
  id: string;
  version: string;
  createdAt: string;
  isActive: boolean;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  entryCount: number;
  estimatedSize: number;
}

/**
 * 版本对比API
 */
export class VersionCompareApi {
  /**
   * 对比两个版本
   */
  static async compareVersions(
    strategyId: string,
    request: CompareVersionsRequest
  ): Promise<CompareVersionsResponse> {
    const response = await axios.post<CompareVersionsResponse>(
      `${API_BASE_URL}/backtesting/strategies/${strategyId}/compare`,
      request
    );
    return response.data;
  }

  /**
   * 获取可对比的版本列表
   */
  static async getVersionsForCompare(
    strategyId: string
  ): Promise<VersionForCompare[]> {
    const response = await axios.get<VersionForCompare[]>(
      `${API_BASE_URL}/backtesting/strategies/${strategyId}/versions-for-compare`
    );
    return response.data;
  }

  /**
   * 获取缓存统计
   */
  static async getCacheStats(): Promise<CacheStats> {
    const response = await axios.get<CacheStats>(
      `${API_BASE_URL}/backtesting/strategies/cache/stats`
    );
    return response.data;
  }

  /**
   * 清空缓存
   */
  static async clearCache(): Promise<{ message: string }> {
    const response = await axios.post<{ message: string }>(
      `${API_BASE_URL}/backtesting/strategies/cache/clear`
    );
    return response.data;
  }
}

export default VersionCompareApi;

