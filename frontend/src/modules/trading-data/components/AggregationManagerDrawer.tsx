import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Drawer,
  Table,
  Tag,
  Space,
  Button,
  Typography,
  Divider,
  message,
  Form,
  Select,
  Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type {
  DatasetDto,
  DatasetAggregationDto,
  AggregationTaskDto,
} from '../../../shared/api/tradingData';
import {
  fetchDatasetAggregations,
  fetchDatasetAggregationTasks,
  triggerDatasetAggregations,
} from '../../../shared/api/tradingData';

const GRANULARITY_OPTIONS = [
  { label: '5分钟 (5m)', value: '5m' },
  { label: '15分钟 (15m)', value: '15m' },
  { label: '30分钟 (30m)', value: '30m' },
  { label: '1小时 (1h)', value: '1h' },
  { label: '1天 (1d)', value: '1d' },
  { label: '1月 (1M)', value: '1M' },
];

const statusTagMap: Record<string, { text: string; color: string }> = {
  pending: { text: '待执行', color: 'default' },
  processing: { text: '执行中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  failed: { text: '失败', color: 'red' },
};

const taskStatusTagMap: Record<string, { text: string; color: string }> = {
  pending: { text: '排队', color: 'default' },
  running: { text: '执行中', color: 'blue' },
  completed: { text: '完成', color: 'green' },
  failed: { text: '失败', color: 'red' },
  cancelled: { text: '取消', color: 'orange' },
};

function renderStatus(status?: string) {
  if (!status) {
    return <Tag>-</Tag>;
  }
  const meta = statusTagMap[status] ?? { text: status, color: 'default' };
  return <Tag color={meta.color}>{meta.text}</Tag>;
}

function renderTaskStatus(status?: string) {
  if (!status) {
    return <Tag>-</Tag>;
  }
  const meta = taskStatusTagMap[status] ?? { text: status, color: 'default' };
  return <Tag color={meta.color}>{meta.text}</Tag>;
}

type AggregationManagerDrawerProps = {
  dataset: DatasetDto | null;
  open: boolean;
  onClose: () => void;
};

export default function AggregationManagerDrawer({ dataset, open, onClose }: AggregationManagerDrawerProps) {
  const [aggregations, setAggregations] = useState<DatasetAggregationDto[]>([]);
  const [tasks, setTasks] = useState<AggregationTaskDto[]>([]);
  const [loadingAggregations, setLoadingAggregations] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [form] = Form.useForm<{ granularities?: string[] }>();

  const datasetId = dataset?.datasetId;

  const loadAggregations = useCallback(async () => {
    if (!datasetId) return;
    setLoadingAggregations(true);
    try {
      const items = await fetchDatasetAggregations(datasetId);
      setAggregations(items);
    } catch (error) {
      console.error(error);
      message.error('加载聚合列表失败');
    } finally {
      setLoadingAggregations(false);
    }
  }, [datasetId]);

  const loadTasks = useCallback(async () => {
    if (!datasetId) return;
    setLoadingTasks(true);
    try {
      const items = await fetchDatasetAggregationTasks(datasetId);
      setTasks(items);
    } catch (error) {
      console.error(error);
      message.error('加载聚合任务失败');
    } finally {
      setLoadingTasks(false);
    }
  }, [datasetId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadAggregations(), loadTasks()]);
  }, [loadAggregations, loadTasks]);

  useEffect(() => {
    if (open && datasetId) {
      void refreshAll();
    }
  }, [open, datasetId, refreshAll]);

  const handleTrigger = useCallback(async () => {
    if (!datasetId) return;
    try {
      const values = await form.validateFields();
      setTriggering(true);
      await triggerDatasetAggregations(datasetId, {
        granularities: values.granularities,
      });
      message.success('已创建聚合任务');
      form.resetFields();
      await refreshAll();
    } catch (error) {
      if ((error as Error)?.name !== 'ValidationError') {
        console.error(error);
        message.error('创建聚合任务失败');
      }
    } finally {
      setTriggering(false);
    }
  }, [datasetId, form, refreshAll]);

  const aggregationColumns = useMemo<ColumnsType<DatasetAggregationDto>>(
    () => [
      {
        title: '目标粒度',
        dataIndex: 'targetGranularity',
        width: 120,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: string) => renderStatus(value?.toLowerCase()),
      },
      {
        title: '进度',
        dataIndex: 'progress',
        width: 140,
        render: (value: number) => `${value?.toFixed?.(2) ?? 0}%`,
      },
      {
        title: '时间范围',
        render: (_, record) =>
          `${dayjs(record.timeStart).format('YYYY-MM-DD HH:mm')} ~ ${dayjs(record.timeEnd).format('YYYY-MM-DD HH:mm')}`,
      },
      {
        title: '记录数',
        dataIndex: 'rowCount',
        width: 160,
        render: (value: number) => value?.toLocaleString?.() ?? '-',
      },
      {
        title: '上次更新',
        dataIndex: 'updatedAt',
        width: 180,
        render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
      },
    ],
    [],
  );

  const taskColumns = useMemo<ColumnsType<AggregationTaskDto>>(
    () => [
      {
        title: '任务ID',
        dataIndex: 'taskId',
        width: 100,
      },
      {
        title: '目标粒度',
        dataIndex: 'targetGranularity',
        width: 120,
      },
      {
        title: '触发方式',
        dataIndex: 'triggerType',
        width: 120,
        render: (value: string) => value?.toUpperCase?.(),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: string) => renderTaskStatus(value?.toLowerCase()),
      },
      {
        title: '进度',
        dataIndex: 'progress',
        width: 100,
        render: (value: number) => `${value?.toFixed?.(1) ?? 0}%`,
      },
      {
        title: '开始时间',
        dataIndex: 'startedAt',
        width: 180,
        render: (value: string | null | undefined) =>
          value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
      },
      {
        title: '结束时间',
        dataIndex: 'finishedAt',
        width: 180,
        render: (value: string | null | undefined) =>
          value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
      },
      {
        title: '消息',
        dataIndex: 'message',
        ellipsis: true,
        render: (value: string | null | undefined) => value || '-',
      },
    ],
    [],
  );

  const latestError = useMemo(() => {
    const failedAggregation = aggregations.find((item) => item.status === 'failed' && item.errorLog);
    if (failedAggregation) {
      return `聚合 ${failedAggregation.targetGranularity} 失败：${failedAggregation.errorLog}`;
    }
    const failedTask = tasks.find((task) => task.status === 'failed' && task.errorLog);
    if (failedTask) {
      return `任务 ${failedTask.taskId} 失败：${failedTask.errorLog}`;
    }
    return null;
  }, [aggregations, tasks]);

  return (
    <Drawer
      title={`聚合管理 - ${dataset?.tradingPair ?? '-'}`}
      width={960}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={() => void refreshAll()}>刷新</Button>
        </Space>
      }
    >
      {dataset ? (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Typography.Paragraph>
              数据集 ID：{dataset.datasetId}，基础粒度：{dataset.granularity}
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary">
              时间范围：{dayjs(dataset.timeStart).format('YYYY-MM-DD HH:mm:ss')} ~{' '}
              {dayjs(dataset.timeEnd).format('YYYY-MM-DD HH:mm:ss')}
            </Typography.Paragraph>
          </div>

          <Divider orientation="left">手动触发聚合</Divider>
          <Form layout="inline" form={form} style={{ marginBottom: 12 }}>
            <Form.Item
              label="聚合粒度"
              name="granularities"
              rules={[{ required: true, message: '请选择至少一个粒度' }]}
            >
              <Select
                mode="multiple"
                style={{ minWidth: 280 }}
                placeholder="选择目标粒度"
                options={GRANULARITY_OPTIONS}
                allowClear
              />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" onClick={() => void handleTrigger()} loading={triggering}>
                  立即生成
                </Button>
                <Button onClick={() => form.resetFields()} disabled={triggering}>
                  重置
                </Button>
              </Space>
            </Form.Item>
          </Form>

          {latestError ? (
            <Alert type="error" message={latestError} showIcon closable style={{ marginBottom: 12 }} />
          ) : null}

          <Divider orientation="left">聚合列表</Divider>
          <Table<DatasetAggregationDto>
            rowKey="aggregationId"
            dataSource={aggregations}
            columns={aggregationColumns}
            loading={loadingAggregations}
            pagination={false}
            size="small"
          />

          <Divider orientation="left">聚合任务</Divider>
          <Table<AggregationTaskDto>
            rowKey="taskId"
            dataSource={tasks}
            columns={taskColumns}
            loading={loadingTasks}
            pagination={{ pageSize: 8 }}
            size="small"
          />
        </Space>
      ) : (
        <Typography.Paragraph>未选择数据集</Typography.Paragraph>
      )}
    </Drawer>
  );
}
