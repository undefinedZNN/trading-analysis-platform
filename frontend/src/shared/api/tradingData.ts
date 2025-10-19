import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000/api/v1/trading-data',
  timeout: 10000,
});

export interface ImportTaskDto {
  importId: number;
  sourceFile: string;
  storedFilePath: string;
  status: string;
  progress: number;
  stage?: string | null;
  message?: string | null;
  errorLog?: string | null;
  datasetId?: number | null;
  dataset?: DatasetDto | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  finishedAt?: string | null;
  targetDatasetId?: number | null;
  pluginName?: string;
  pluginVersion?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    source?: string | null;
    tradingPair?: string;
    granularity?: string;
    description?: string | null;
    labels?: string[];
    timeStart?: string | null;
    timeEnd?: string | null;
  } | null;
}

export interface DatasetDto {
  datasetId: number;
  source?: string | null;
  tradingPair: string;
  granularity: string;
  path: string;
  timeStart: string;
  timeEnd: string;
  rowCount: number;
  checksum: string;
  labels: string[];
  description?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ImportLogChunkResponse {
  entries: string[];
  cursor: number;
  nextCursor: number | null;
  hasMore: boolean;
  totalLines: number;
}

export interface ListDatasetsQuery {
  page?: number;
  pageSize?: number;
  status?: 'active' | 'deleted' | 'all';
  source?: string | null;
  tradingPair?: string | null;
  granularity?: string | null;
  dataStart?: string;
  dataEnd?: string;
  createdStart?: string;
  createdEnd?: string;
  tags?: string[];
  importStatus?: string | null;
  keyword?: string | null;
}

export interface DatasetCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DatasetCandlesResponse {
  datasetId: number;
  symbol: string;
  granularity: string;
  resolution: string;
  from: number;
  to: number;
  limit: number;
  hasMore: boolean;
  candles: DatasetCandle[];
}

export async function fetchImports(params: Record<string, unknown> = {}) {
  const { data } = await client.get<PaginatedResponse<ImportTaskDto>>('/imports', {
    params,
  });
  return data;
}

export async function fetchImport(importId: number) {
  const { data } = await client.get<ImportTaskDto>(`/imports/${importId}`);
  return data;
}

export async function createImport(formData: FormData) {
  const { data } = await client.post('/imports', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as ImportTaskDto;
}

export async function retryImport(importId: number, formData: FormData) {
  const { data } = await client.post(`/imports/${importId}/retry`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as ImportTaskDto;
}

export async function fetchImportLogChunk(
  importId: number,
  params: { cursor?: number; limit?: number } = {},
) {
  const { data } = await client.get<ImportLogChunkResponse>(`/imports/${importId}/error-log`, {
    params,
  });
  return data;
}

export async function fetchDatasets(params: ListDatasetsQuery = {}) {
  const { data } = await client.get<PaginatedResponse<DatasetDto>>('/datasets', {
    params,
  });
  return data;
}

export async function deleteDataset(datasetId: number, operator?: string) {
  await client.post(`/datasets/${datasetId}/delete`, {
    operator,
  });
}

export async function restoreDataset(datasetId: number, operator?: string) {
  await client.post(`/datasets/${datasetId}/restore`, {
    operator,
  });
}

export async function appendDataset(
  datasetId: number,
  formData: FormData,
) {
  const { data } = await client.post<ImportTaskDto>(
    `/datasets/${datasetId}/append`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return data;
}

export async function updateDataset(
  datasetId: number,
  payload: { description?: string | null; labels?: string[]; updatedBy?: string },
) {
  const { data } = await client.patch<DatasetDto>(`/datasets/${datasetId}`, payload);
  return data;
}

export async function fetchDatasetCandles(
  datasetId: number,
  params: { resolution?: string; from?: number; to?: number; limit?: number } = {},
) {
  const { data } = await client.get<DatasetCandlesResponse>(`/datasets/${datasetId}/candles`, {
    params,
  });
  return data;
}
