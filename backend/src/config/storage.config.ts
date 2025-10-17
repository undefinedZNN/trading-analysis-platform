import { mkdirSync } from 'fs';
import { resolve } from 'path';

const STORAGE_ROOT = resolve(process.cwd(), 'storage');

const DEFAULT_RAW_UPLOADS_ROOT = resolve(STORAGE_ROOT, 'raw_uploads');
const DEFAULT_DATASETS_ROOT = resolve(STORAGE_ROOT, 'datasets');

export const RAW_UPLOADS_ROOT = process.env.RAW_UPLOADS_ROOT
  ? resolve(process.env.RAW_UPLOADS_ROOT)
  : DEFAULT_RAW_UPLOADS_ROOT;

export const DATASETS_ROOT = process.env.DATASETS_ROOT
  ? resolve(process.env.DATASETS_ROOT)
  : DEFAULT_DATASETS_ROOT;

export function ensureRawUploadsDir(): void {
  mkdirSync(RAW_UPLOADS_ROOT, { recursive: true });
  mkdirSync(DATASETS_ROOT, { recursive: true });
}

export function resolveImportUploadPath(importId: string): string {
  return resolve(RAW_UPLOADS_ROOT, importId);
}

export function resolveDatasetPath(relativePath: string): string {
  return resolve(DATASETS_ROOT, relativePath);
}
