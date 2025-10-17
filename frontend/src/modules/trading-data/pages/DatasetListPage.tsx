import { useEffect, useState, useMemo } from 'react';
import { Card, Table, Button, Space, Tag, Popconfirm, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchDatasets, deleteDataset, restoreDataset } from '../../../shared/api/tradingData';
import type { DatasetDto } from '../../../shared/api/tradingData';

type DatasetListPageProps = {
  onUpdated?: () => void;
};

export function DatasetListPage({ onUpdated }: DatasetListPageProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DatasetDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await fetchDatasets({ page: nextPage, pageSize: nextPageSize });
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
  };

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (datasetId: number) => {
    try {
      await deleteDataset(datasetId);
      message.success('数据集已软删除');
      await load(page, pageSize);
    } catch (error) {
      console.error(error);
      message.error('软删除失败，请稍后重试');
    }
  };

  const handleRestore = async (datasetId: number) => {
    try {
      await restoreDataset(datasetId);
      message.success('数据集已恢复');
      await load(page, pageSize);
    } catch (error) {
      console.error(error);
      message.error('恢复失败，请稍后重试');
    }
  };

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
        render: (value) => value || '-',
      },
      {
        title: '交易对',
        dataIndex: 'tradingPair',
      },
      {
        title: '时间粒度',
        dataIndex: 'granularity',
      },
      {
        title: '起止时间',
        render: (_, record) =>
          `${new Date(record.timeStart).toLocaleString()} ~ ${new Date(
            record.timeEnd,
          ).toLocaleString()}`,
      },
      {
        title: '行数',
        dataIndex: 'rowCount',
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
        title: '状态',
        dataIndex: 'deletedAt',
        render: (value: string | null) =>
          value ? <Tag color="default">已删除</Tag> : <Tag color="success">可用</Tag>,
      },
      {
        title: '操作',
        key: 'actions',
        width: 160,
        render: (_, record) =>
          record.deletedAt ? (
            <Button size="small" type="primary" onClick={() => handleRestore(record.datasetId)}>
              恢复
            </Button>
          ) : (
            <Popconfirm
              title="确认软删除该数据集？"
              onConfirm={() => handleDelete(record.datasetId)}
            >
              <Button size="small" danger>
                软删除
              </Button>
            </Popconfirm>
          ),
      },
    ],
    [],
  );

  return (
    <Card
      title="已清洗数据集"
      bordered={false}
      className="card-section"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => load()}>
          刷新
        </Button>
      }
    >
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
          onChange: (nextPage, nextPageSize) => load(nextPage, nextPageSize),
        }}
        scroll={{ x: 1100 }}
      />
    </Card>
  );
}

export default DatasetListPage;
