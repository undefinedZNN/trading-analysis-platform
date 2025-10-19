import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  message,
  Form,
  Select,
  Input,
  DatePicker,
  Dropdown,
} from 'antd';
import type { MenuProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  fetchDatasets,
  deleteDataset,
  restoreDataset,
  type ListDatasetsQuery,
} from '../../../shared/api/tradingData';
import type { DatasetDto } from '../../../shared/api/tradingData';
import EditDatasetModal from '../components/EditDatasetModal';
import AppendDatasetModal from '../components/AppendDatasetModal';
import DatasetChartDrawer from '../components/DatasetChartDrawer';
import { MoreOutlined } from '@ant-design/icons';

type DatasetListPageProps = {
  onUpdated?: () => void;
};

export function DatasetListPage({ onUpdated }: DatasetListPageProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DatasetDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [editingDataset, setEditingDataset] = useState<DatasetDto | null>(null);
  const [appendDatasetTarget, setAppendDatasetTarget] = useState<DatasetDto | null>(null);
  const [chartDataset, setChartDataset] = useState<DatasetDto | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [filters, setFilters] = useState<ListDatasetsQuery>({ status: 'active' });
  const [form] = Form.useForm();

  const buildFilters = useCallback(
    (values: Record<string, unknown>): ListDatasetsQuery => {
      const next: ListDatasetsQuery = {};
      const statusValueRaw = values.status ?? filters.status ?? 'active';
      const statusValue =
        typeof statusValueRaw === 'string' && ['active', 'deleted', 'all'].includes(statusValueRaw)
          ? (statusValueRaw as 'active' | 'deleted' | 'all')
          : 'active';
      next.status = statusValue;

      const tradingPair = typeof values.tradingPair === 'string' ? values.tradingPair.trim() : '';
      if (tradingPair) {
        next.tradingPair = tradingPair;
      }

      const source = typeof values.source === 'string' ? values.source.trim() : '';
      if (source) {
        next.source = source;
      }

      const granularity = typeof values.granularity === 'string' ? values.granularity.trim() : '';
      if (granularity) {
        next.granularity = granularity;
      }

      const keyword = typeof values.keyword === 'string' ? values.keyword.trim() : '';
      if (keyword) {
        next.keyword = keyword;
      }

      const range = values.createdRange;
      if (range && Array.isArray(range)) {
        const [start, end] = range;
        if (start?.toISOString) {
          next.createdStart = start.toISOString();
        }
        if (end?.toISOString) {
          next.createdEnd = end.toISOString();
        }
      }

      return next;
    },
    [filters.status],
  );

  const load = useCallback(
    async (nextPage = page, nextPageSize = pageSize, nextFilters?: ListDatasetsQuery) => {
      setLoading(true);
      try {
        const effectiveFilters = nextFilters ?? filters;
        const params: Record<string, unknown> = {
          page: nextPage,
          pageSize: nextPageSize,
          ...effectiveFilters,
        };
        const res = await fetchDatasets(params);
        setData(res.items);
        setTotal(res.total);
        setPage(res.page);
        setPageSize(res.pageSize);
        onUpdated?.();
      } catch (error) {
        console.error(error);
        message.error('加载数据集失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, filters, onUpdated],
  );

  useEffect(() => {
    load(1, pageSize, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = useCallback(
    async (datasetId: number) => {
      try {
        await deleteDataset(datasetId);
        message.success('数据集已软删除');
        await load(page, pageSize, filters);
      } catch (error) {
        console.error(error);
        message.error('软删除失败，请稍后重试');
      }
    },
    [load, page, pageSize, filters],
  );

  const handleRestore = useCallback(
    async (datasetId: number) => {
      try {
        await restoreDataset(datasetId);
        message.success('数据集已恢复');
        await load(page, pageSize, filters);
      } catch (error) {
        console.error(error);
        message.error('恢复失败，请稍后重试');
      }
    },
    [load, page, pageSize, filters],
  );

  const columns: ColumnsType<DatasetDto> = useMemo(
    () => [
      {
        title: '数据集 ID',
        dataIndex: 'datasetId',
        width: 120,
      },
      {
        title: '来源',
        dataIndex: 'source',
        width: 140,
        render: (value) => value || '-',
      },
      {
        title: '交易对',
        dataIndex: 'tradingPair',
        width: 160,
      },
      {
        title: '时间粒度',
        dataIndex: 'granularity',
        width: 120,
      },
      {
        title: '起止时间',
        width: 320,
        render: (_, record) =>
          `${new Date(record.timeStart).toLocaleString()} ~ ${new Date(
            record.timeEnd,
          ).toLocaleString()}`,
      },
      {
        title: '行数',
        dataIndex: 'rowCount',
        width: 140,
        render: (value: number) => {
          if (value === null || value === undefined) {
            return '-';
          }
          const formatted = value.toLocaleString();
          const display = value >= 10_000_000
            ? `${Math.floor(value / 10_000_000)}千万+`
            : value >= 1_000_000
              ? `${Math.floor(value / 1_000_000)}百万+`
              : value >= 10_000
                ? `${Math.floor(value / 1_000)}K+`
                : formatted;
          return <span title={formatted}>{display}</span>;
        },
      },
      {
        title: '标签',
        dataIndex: 'labels',
        render: (labels: string[]) =>
          labels?.length ? (
            <Space size={[4, 4]} wrap>
              {labels.map((label) => (
                <Tag key={label}>{label}</Tag>
              ))}
            </Space>
          ) : (
            '-'
          ),
      },
      {
        title: '描述',
        dataIndex: 'description',
        ellipsis: true,
        render: (value: string | null | undefined) => value || '-',
      },
      {
        title: '状态',
        dataIndex: 'deletedAt',
        render: (value: string | null) =>
          value ? <Tag color="default">已删除</Tag> : <Tag color="success">可用</Tag>,
      },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        render: (_, record) => {
          const menuItems: MenuProps['items'] = [
            {
              key: 'view-chart',
              label: '查看图表',
              onClick: () => {
                setChartDataset(record);
                setChartOpen(true);
              },
            },
            {
              key: 'edit-metadata',
              label: '编辑元数据',
              onClick: () => setEditingDataset(record),
            },
          ];

          if (!record.deletedAt) {
            menuItems.push(
              {
                key: 'append-data',
                label: '追加数据',
                onClick: () => setAppendDatasetTarget(record),
              },
              {
                key: 'soft-delete',
                label: '软删除',
                danger: true,
                onClick: () => handleDelete(record.datasetId),
              },
            );
          } else {
            menuItems.push({
              key: 'restore-dataset',
              label: '恢复数据集',
              onClick: () => handleRestore(record.datasetId),
            });
          }

          return (
            <Space size="small">
              <Button
                size="small"
                onClick={() => {
                  setChartDataset(record);
                  setChartOpen(true);
                }}
              >
                查看图表
              </Button>
              <Dropdown
                menu={{ items: menuItems }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button size="small" icon={<MoreOutlined />} />
              </Dropdown>
            </Space>
          );
        },
      },
    ],
    [handleDelete, handleRestore],
  );

  return (
    <Card
      title="已清洗数据集"
      bordered={false}
      className="card-section"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load(page, pageSize, filters)}>
            刷新
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="inline"
        style={{ marginBottom: 16 }}
        initialValues={{ status: 'active' }}
        onFinish={(values) => {
          const nextFilters = buildFilters(values);
          setFilters(nextFilters);
          void load(1, pageSize, nextFilters);
        }}
        onValuesChange={(changedValues, allValues) => {
          if ('status' in changedValues) {
            const nextFilters = buildFilters(allValues);
            setFilters(nextFilters);
            void load(1, pageSize, nextFilters);
          }
        }}
      >
        <Form.Item label="状态" name="status">
          <Select
            style={{ width: 160 }}
            options={[
              { label: '仅显示可用', value: 'active' },
              { label: '仅显示已删除', value: 'deleted' },
              { label: '全部', value: 'all' },
            ]}
          />
        </Form.Item>
        <Form.Item label="交易对" name="tradingPair">
          <Input allowClear placeholder="如：BTC/USDT" style={{ width: 200 }} />
        </Form.Item>
        <Form.Item label="创建时间" name="createdRange">
          <DatePicker.RangePicker showTime allowClear />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button
              onClick={() => {
                form.resetFields();
                setFilters({ status: 'active' });
                void load(1, pageSize, { status: 'active' });
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
      <Table<DatasetDto>
        rowKey="datasetId"
        dataSource={data}
        columns={columns}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => load(nextPage, nextPageSize, filters),
        }}
        scroll={{ x: 1100 }}
      />
      <EditDatasetModal
        open={Boolean(editingDataset)}
        dataset={editingDataset}
        onCancel={() => setEditingDataset(null)}
        onUpdated={async () => {
          setEditingDataset(null);
          await load(page, pageSize, filters);
        }}
      />
      <AppendDatasetModal
        open={Boolean(appendDatasetTarget)}
        dataset={appendDatasetTarget}
        onCancel={() => setAppendDatasetTarget(null)}
        onSuccess={async () => {
          setAppendDatasetTarget(null);
          await load(page, pageSize, filters);
        }}
      />
      <DatasetChartDrawer
        open={chartOpen}
        dataset={chartDataset}
        onClose={() => {
          setChartOpen(false);
          setChartDataset(null);
        }}
      />
    </Card>
  );
}

export default DatasetListPage;
