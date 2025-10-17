import { useEffect, useMemo, useState } from 'react';
import { Card, Table, Button, Space, Modal, message } from 'antd';
import { ReloadOutlined, FileTextOutlined, RetweetOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchImports, fetchImportLog, retryImport } from '../../../shared/api/tradingData';
import type { ImportTaskDto } from '../../../shared/api/tradingData';
import StatusTag from '../../../shared/components/StatusTag';
import { IMPORT_STATUS_COLORS, IMPORT_STATUS_LABELS } from '../../../shared/constants/status';
import RetryImportModal from '../components/RetryImportModal';

type ImportListPageProps = {
  onRefreshed?: () => void;
};

export function ImportListPage({ onRefreshed }: ImportListPageProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ImportTaskDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [logLoading, setLogLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryTask, setRetryTask] = useState<ImportTaskDto | null>(null);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await fetchImports({ page: nextPage, pageSize: nextPageSize });
      setData(res.items);
      setTotal(res.total);
      setPage(res.page);
      setPageSize(res.pageSize);
      onRefreshed?.();
    } catch (error) {
      console.error(error);
      message.error('加载导入任务失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewLog = async (record: ImportTaskDto) => {
    setLogLoading(true);
    try {
      const log = await fetchImportLog(record.importId);
      Modal.info({
        title: `导入任务 #${record.importId} 错误日志`,
        width: 720,
        content: (
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>
            {log || '暂无错误日志'}
          </pre>
        ),
      });
    } catch (error) {
      console.error(error);
      message.error('获取错误日志失败');
    } finally {
      setLogLoading(false);
    }
  };

  const handleRetry = async (options: { reuseOriginalFile: boolean; file?: File | null }) => {
    if (!retryTask) return;
    setRetryLoading(true);
    const formData = new FormData();
    formData.append('reuseOriginalFile', String(options.reuseOriginalFile));
    if (options.file) {
      formData.append('file', options.file);
    }
    try {
      await retryImport(retryTask.importId, formData);
      message.success('导入任务已重新调度');
      setRetryTask(null);
      await load(page, pageSize);
    } catch (error) {
      console.error(error);
      message.error('重试导入失败');
    } finally {
      setRetryLoading(false);
    }
  };

  const columns: ColumnsType<ImportTaskDto> = useMemo(
    () => [
      {
        title: '任务 ID',
        dataIndex: 'importId',
        width: 100,
        fixed: 'left',
      },
      {
        title: '来源',
        dataIndex: ['metadata', 'source'],
        render: (value) => value || '-',
      },
      {
        title: '交易对',
        dataIndex: ['metadata', 'tradingPair'],
        render: (value) => value || '-',
      },
      {
        title: '时间粒度',
        dataIndex: ['metadata', 'granularity'],
        render: (value) => value || '-',
      },
      {
        title: '状态',
        dataIndex: 'status',
        render: (status: string) => (
          <StatusTag
            value={status}
            colorMap={IMPORT_STATUS_COLORS}
            labelMap={IMPORT_STATUS_LABELS}
          />
        ),
      },
      {
        title: '进度',
        dataIndex: 'progress',
        render: (progress: number) => `${Math.round(progress)}%`,
      },
      {
        title: '阶段',
        dataIndex: 'stage',
        render: (stage: string | null) => stage || '-',
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        render: (value: string) => new Date(value).toLocaleString(),
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => handleViewLog(record)}
              loading={logLoading}
            >
              日志
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<RetweetOutlined />}
              disabled={record.status !== 'failed'}
              onClick={() => setRetryTask(record)}
            >
              重试
            </Button>
          </Space>
        ),
      },
    ],
    [logLoading],
  );

  return (
    <Card
      title="导入任务列表"
      bordered={false}
      className="card-section"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => load()}>
          刷新
        </Button>
      }
    >
      <Table<ImportTaskDto>
        rowKey="importId"
        dataSource={data}
        columns={columns}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => load(nextPage, nextPageSize),
        }}
        scroll={{ x: 1100 }}
      />

      <RetryImportModal
        open={!!retryTask}
        importId={retryTask?.importId}
        loading={retryLoading}
        onCancel={() => setRetryTask(null)}
        onOk={handleRetry}
      />
    </Card>
  );
}

export default ImportListPage;
