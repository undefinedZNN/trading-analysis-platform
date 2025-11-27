import { mkdirSync } from 'fs';
import { resolve, isAbsolute } from 'path';

const STORAGE_ROOT = resolve(process.cwd(), 'storage');

const DEFAULT_RAW_UPLOADS_ROOT = resolve(STORAGE_ROOT, 'raw_uploads');
const DEFAULT_DATASETS_ROOT = resolve(STORAGE_ROOT, 'datasets');
const DEFAULT_BACKTEST_RESULTS_ROOT = resolve(STORAGE_ROOT, 'backtest-results');

export const RAW_UPLOADS_ROOT = process.env.RAW_UPLOADS_ROOT
  ? resolve(process.env.RAW_UPLOADS_ROOT)
  : DEFAULT_RAW_UPLOADS_ROOT;

export const DATASETS_ROOT = process.env.DATASETS_ROOT
  ? resolve(process.env.DATASETS_ROOT)
  : DEFAULT_DATASETS_ROOT;

export const BACKTEST_RESULTS_ROOT = process.env.BACKTEST_RESULTS_ROOT
  ? resolve(process.env.BACKTEST_RESULTS_ROOT)
  : DEFAULT_BACKTEST_RESULTS_ROOT;

export function ensureRawUploadsDir(): void {
  mkdirSync(RAW_UPLOADS_ROOT, { recursive: true });
  mkdirSync(DATASETS_ROOT, { recursive: true });
}

export function resolveImportUploadPath(importId: string): string {
  return resolve(RAW_UPLOADS_ROOT, importId);
}

function normalizeRelativePath(input: string, anchor: string): { relative: string; absolute?: string } {
  if (!input) {
    return { relative: '' };
  }
  const normalized = input.replace(/\\/g, '/');
  if (isAbsolute(normalized)) {
    return { relative: normalized, absolute: normalized };
  }
  const match = normalized.match(new RegExp(`${anchor}/(.+)$`));
  if (match) {
    return { relative: match[1] };
  }
  return { relative: normalized };
}

export function resolveDatasetPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath, 'datasets');
  if (normalized.absolute) {
    return normalized.absolute;
  }
  return resolve(DATASETS_ROOT, normalized.relative);
}

export function resolveBacktestResultPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath, 'backtest-results');
  if (normalized.absolute) {
    return normalized.absolute;
  }
  return resolve(BACKTEST_RESULTS_ROOT, normalized.relative);
}
