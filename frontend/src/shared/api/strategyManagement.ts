import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000/api/v1/strategy-management',
  timeout: 10000,
});

export interface StrategyDto {
  strategyId: number;
  name: string;
  tags: string[];
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListStrategiesQuery {
  page?: number;
  pageSize?: number;
  keyword?: string | null;
  tags?: string[];
}

export interface CreateStrategyPayload {
  name: string;
  tags?: string[];
  description?: string | null;
  createdBy?: string | null;
}

export interface UpdateStrategyPayload {
  name?: string;
  tags?: string[];
  description?: string | null;
  updatedBy?: string | null;
}

export async function listStrategies(params: ListStrategiesQuery = {}) {
  const { data } = await client.get<PaginatedResponse<StrategyDto>>('/strategies', {
    params,
  });
  return data;
}

export async function createStrategy(payload: CreateStrategyPayload) {
  const { data } = await client.post<StrategyDto>('/strategies', payload);
  return data;
}

export async function updateStrategy(strategyId: number, payload: UpdateStrategyPayload) {
  const { data } = await client.patch<StrategyDto>(`/strategies/${strategyId}`, payload);
  return data;
}

export async function deleteStrategy(strategyId: number, operator?: string) {
  await client.delete(`/strategies/${strategyId}`, {
    data: { operator },
  });
}

export async function getStrategy(strategyId: number) {
  const { data } = await client.get<StrategyDto>(`/strategies/${strategyId}`);
  return data;
}

export interface StrategyScriptDto {
  scriptId: number;
  strategyId: number;
  versionCode: string;
  description?: string | null;
  changelog?: string | null;
  scriptSource: string;
  manifest?: Record<string, unknown> | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListScriptsQuery {
  page?: number;
  pageSize?: number;
}

export async function listStrategyScripts(strategyId: number, params: ListScriptsQuery = {}) {
  const { data } = await client.get<PaginatedResponse<StrategyScriptDto>>(
    `/strategies/${strategyId}/scripts`,
    { params },
  );
  return data;
}

export interface CreateStrategyScriptPayload {
  versionCode?: string;
  description?: string | null;
  changelog?: string | null;
  manifest?: Record<string, unknown> | null;
  isPrimary?: boolean;
  scriptSource: string;
}

export async function createStrategyScript(
  strategyId: number,
  payload: CreateStrategyScriptPayload,
) {
  const { data } = await client.post<StrategyScriptDto>(
    `/strategies/${strategyId}/scripts`,
    payload,
  );
  return data;
}

export async function getStrategyScript(scriptId: number) {
  const { data } = await client.get<StrategyScriptDto>(`/scripts/${scriptId}`);
  return data;
}

export async function updateStrategyScript(scriptId: number, payload: Partial<CreateStrategyScriptPayload>) {
  const { data } = await client.patch<StrategyScriptDto>(`/scripts/${scriptId}`, payload);
  return data;
}
