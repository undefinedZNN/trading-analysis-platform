export const IMPORT_STATUS_COLORS: Record<string, string> = {
  pending: 'default',
  uploading: 'processing',
  processing: 'warning',
  completed: 'success',
  failed: 'error',
};

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  uploading: '上传中',
  processing: '清洗中',
  completed: '已完成',
  failed: '失败',
};
