import { useCallback, useEffect, useState } from 'react';
import {
  Drawer,
  Space,
  Button,
  Descriptions,
  Typography,
  Progress,
  Tag,
  Divider,
  Empty,
  Spin,
  message,
} from 'antd';
import type { ImportTaskDto } from '../../../shared/api/tradingData';
import { fetchImport } from '../../../shared/api/tradingData';
import StatusTag from '../../../shared/components/StatusTag';
import { IMPORT_STATUS_COLORS, IMPORT_STATUS_LABELS } from '../../../shared/constants/status';

const { Text } = Typography;

type ImportDetailDrawerProps = {
  open: boolean;
  importId: number | null;
  onClose: () => void;
  onRefresh?: () => void | Promise<void>;
  onViewLog: (importId: number) => void;
};

export default function ImportDetailDrawer({
  open,
  importId,
  onClose,
  onRefresh,
  onViewLog,
}: ImportDetailDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [task, setTask] = useState<ImportTaskDto | null>(null);

  const loadDetail = useCallback(async () => {
    if (!importId) {
      setTask(null);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchImport(importId);
      setTask(result);
    } catch (error) {
      console.error(error);
      message.error('加载导入详情失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [importId]);

  useEffect(() => {
    if (open) {
      void loadDetail();
    } else {
      setTask(null);
    }
  }, [open, loadDetail]);

  const handleRefresh = async () => {
    await loadDetail();
    await onRefresh?.();
  };

  const handleViewLog = () => {
    if (importId) {
      onViewLog(importId);
    }
  };

  const metadata = task?.metadata ?? undefined;
  const dataset = task?.dataset ?? null;
  const labels = Array.isArray(metadata?.labels) ? metadata.labels : [];

  const formatDateTime = useCallback((value?: string | Date | null) => {
    if (!value) {
      return '-';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return date.toLocaleString();
  }, []);

  return (
    <Drawer
      width={640}
      title={`导入任务 #${importId ?? '-'}`}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={handleRefresh} disabled={!importId} loading={loading}>
            刷新
          </Button>
          <Button onClick={handleViewLog} disabled={!importId}>
            查看日志
          </Button>
        </Space>
      }
    >
      {loading ? (
        <Spin />
      ) : !task ? (
        <Empty description="暂无详情" />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space align="center" size="middle">
            <StatusTag
              value={task.status}
              colorMap={IMPORT_STATUS_COLORS}
              labelMap={IMPORT_STATUS_LABELS}
            />
            <Text type="secondary">阶段：{task.stage || '未开始'}</Text>
            <Progress
              percent={Math.round(task.progress ?? 0)}
              size="small"
              style={{ width: 160, marginBottom: 0 }}
            />
          </Space>

          {task.message && (
            <Text type="warning">当前信息：{task.message}</Text>
          )}

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="插件">
              {task.pluginName} v{task.pluginVersion}
            </Descriptions.Item>
            <Descriptions.Item label="创建人">
              {task.createdBy || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="来源">
              {metadata?.source || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="交易对">
              {metadata?.tradingPair || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="时间粒度">
              {metadata?.granularity || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="时间范围（表单）">
              {formatDateTime(metadata?.timeStart)} ~ {formatDateTime(metadata?.timeEnd)}
            </Descriptions.Item>
            <Descriptions.Item label="描述">
              {metadata?.description || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {formatDateTime(task.createdAt)}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {formatDateTime(task.updatedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="更新人">
              {task.updatedBy || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="完成时间">
              {formatDateTime(task.finishedAt ?? null)}
            </Descriptions.Item>
          </Descriptions>

          {labels.length > 0 && (
            <Space size={[4, 4]} wrap>
              {labels.map((label) => (
                <Tag key={label}>{label}</Tag>
              ))}
            </Space>
          )}

          <Divider plain>清洗结果</Divider>
          {dataset ? (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="数据集 ID">{dataset.datasetId}</Descriptions.Item>
              <Descriptions.Item label="时间范围">
                {formatDateTime(dataset.timeStart)} ~ {formatDateTime(dataset.timeEnd)}
              </Descriptions.Item>
              <Descriptions.Item label="记录数">{dataset.rowCount}</Descriptions.Item>
              <Descriptions.Item label="校验值">{dataset.checksum}</Descriptions.Item>
              <Descriptions.Item label="存储路径">{dataset.path}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Text type="secondary">尚未生成数据集或仍在处理中。</Text>
          )}
        </Space>
      )}
    </Drawer>
  );
}
