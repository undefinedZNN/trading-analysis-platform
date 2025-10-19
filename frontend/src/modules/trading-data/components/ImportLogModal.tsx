import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Typography, Button, Space, List, message } from 'antd';
import type { ImportLogChunkResponse } from '../../../shared/api/tradingData';
import { fetchImportLogChunk } from '../../../shared/api/tradingData';

const { Text } = Typography;

const DEFAULT_LIMIT = 100;

type ImportLogModalProps = {
  open: boolean;
  importId: number | null;
  onClose: () => void;
};

export default function ImportLogModal({ open, importId, onClose }: ImportLogModalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const resetState = () => {
    setLogs([]);
    setNextCursor(null);
    setHasMore(false);
  };

  const loadChunk = useCallback(
    async (targetCursor = 0) => {
      if (!importId) {
        return;
      }
      setLoading(true);
      try {
        const payload: ImportLogChunkResponse = await fetchImportLogChunk(importId, {
          cursor: targetCursor,
          limit: DEFAULT_LIMIT,
        });
        setLogs((prev) =>
          targetCursor === 0 ? payload.entries : [...prev, ...payload.entries],
        );
        setNextCursor(payload.nextCursor);
        setHasMore(payload.hasMore);
      } catch (error) {
        console.error(error);
        message.error('加载错误日志失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [importId],
  );

  useEffect(() => {
    if (open && importId) {
      resetState();
      void loadChunk(0);
    }
    if (!open) {
      resetState();
    }
  }, [open, importId, loadChunk]);

  const footer = useMemo(
    () => [
      <Button key="close" onClick={onClose}>
        关闭
      </Button>,
      <Button
        key="more"
        type="primary"
        onClick={() => {
          if (nextCursor !== null) {
            void loadChunk(nextCursor);
          }
        }}
        disabled={!hasMore || loading}
        loading={loading && hasMore}
      >
        {hasMore ? '加载更多' : '没有更多日志'}
      </Button>,
    ],
    [onClose, hasMore, loading, nextCursor, loadChunk],
  );

  return (
    <Modal
      open={open && importId !== null}
      title={`导入任务 #${importId ?? '-'} 错误日志`}
      onCancel={onClose}
      footer={footer}
      width={720}
      destroyOnClose
    >
      {logs.length === 0 && loading ? (
        <Text type="secondary">正在加载...</Text>
      ) : logs.length === 0 ? (
        <Text type="secondary">暂无错误日志。</Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <List
            size="small"
            dataSource={logs}
            style={{ maxHeight: 400, overflow: 'auto', width: '100%' }}
            renderItem={(item, index) => (
              <List.Item key={`${index}-${item}`} style={{ paddingLeft: 0, paddingRight: 0 }}>
                <Text code>{logs.length - index}.</Text>
                <Text style={{ marginLeft: 8, whiteSpace: 'pre-wrap' }}>{item || ' '}</Text>
              </List.Item>
            )}
          />
        </Space>
      )}
    </Modal>
  );
}
