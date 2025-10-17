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
  createdAt: string;
  updatedAt: string;
  metadata?: {
    source?: string | null;
    tradingPair?: string;
    granularity?: string;
    description?: string | null;
    labels?: string[];
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

export async function fetchImportLog(importId: number) {
  const { data } = await client.get<string>(`/imports/${importId}/error-log`, {
    responseType: 'text',
  });
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

export async function fetchDatasets(params: Record<string, unknown> = {}) {
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
