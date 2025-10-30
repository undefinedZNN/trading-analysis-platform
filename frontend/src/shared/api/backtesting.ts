import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000/api/v1/backtesting',
  timeout: 10000,
});

export interface BacktestingHealth {
  status: string;
  module: string;
  timestamp: string;
}

export interface StrategyVersionSummary {
  scriptVersionId: string;
  versionName: string;
  isMaster: boolean;
  remark?: string | null;
  updatedAt: string;
  createdAt: string;
  code?: string;
  parameterSchema?: unknown;
  factorSchema?: unknown;
  lastReferencedAt?: string | null;
}

export interface StrategySummary {
  strategyId: string;
  name: string;
  description?: string | null;
  tags: string[];
  defaultScriptVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
  masterVersion: StrategyVersionSummary | null;
  latestVersion: StrategyVersionSummary | null;
  versionsCount: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListStrategiesQuery {
  page?: number;
  pageSize?: number;
  keyword?: string | null;
  tags?: string[];
}

export interface StrategyDetail extends StrategySummary {
  scriptVersions: StrategyVersionSummary[];
}

export interface CreateStrategyRequest {
  name: string;
  description?: string | null;
  tags?: string[];
  createdBy?: string | null;
  initialVersion: {
    code: string;
    versionName?: string;
    remark?: string | null;
    isMaster?: boolean;
  };
}

export interface CreateStrategyVersionRequest {
  code: string;
  versionName?: string;
  remark?: string | null;
  isMaster?: boolean;
  createdBy?: string | null;
}

export interface UpdateStrategyRequest {
  description?: string | null;
  tags?: string[];
  updatedBy?: string | null;
}

export interface UpdateStrategyVersionRequest {
  versionName?: string;
  remark?: string | null;
  code?: string;
  setMaster?: boolean;
  updatedBy?: string | null;
}

export async function fetchBacktestingHealth() {
  const { data } = await client.get<BacktestingHealth>('/health');
  return data;
}

export async function listStrategies(params: ListStrategiesQuery = {}) {
  const { data } = await client.get<PaginatedResponse<StrategySummary>>(
    '/strategies',
    { params },
  );
  return data;
}

export async function fetchStrategy(strategyId: string) {
  const { data } = await client.get<StrategyDetail>(`/strategies/${strategyId}`);
  return data;
}

export async function fetchStrategyTags() {
  const { data } = await client.get<string[]>('/strategies/tags');
  return data;
}

export async function createStrategy(payload: CreateStrategyRequest) {
  const { data } = await client.post<StrategyDetail>('/strategies', payload);
  return data;
}

export async function updateStrategy(
  strategyId: string,
  payload: UpdateStrategyRequest,
) {
  const { data } = await client.patch<StrategyDetail>(
    `/strategies/${strategyId}`,
    payload,
  );
  return data;
}

export async function createStrategyVersion(
  strategyId: string,
  payload: CreateStrategyVersionRequest,
) {
  const { data } = await client.post<StrategyDetail>(
    `/strategies/${strategyId}/script-versions`,
    payload,
  );
  return data;
}

export async function updateStrategyVersion(
  strategyId: string,
  versionId: string,
  payload: UpdateStrategyVersionRequest,
) {
  const { data } = await client.patch<StrategyDetail>(
    `/strategies/${strategyId}/script-versions/${versionId}`,
    payload,
  );
  return data;
}

export interface VersionCodeDiffSegment {
  type: 'equal' | 'added' | 'removed';
  value: string;
}

export interface VersionFieldDiff<T> {
  added: T[];
  removed: T[];
  changed: Array<{ before: T; after: T }>;
  unchanged: T[];
}

export interface VersionDiffResponse {
  baseVersion: StrategyVersionSummary;
  compareVersion: StrategyVersionSummary;
  codeDiff: VersionCodeDiffSegment[];
  parameterDiff: VersionFieldDiff<Record<string, unknown>>;
  factorDiff: VersionFieldDiff<Record<string, unknown>>;
}

export async function fetchStrategyVersionDiff(
  strategyId: string,
  versionId: string,
  params: { compareVersionId?: string; compareVersionName?: string },
) {
  const { data } = await client.get<VersionDiffResponse>(
    `/strategies/${strategyId}/script-versions/${versionId}/diff`,
    { params },
  );
  return data;
}
