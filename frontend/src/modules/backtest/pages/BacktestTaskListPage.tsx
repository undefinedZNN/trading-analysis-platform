import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type {
  BacktestTaskDto,
} from '../../../shared/api/backtesting';
import {
  BacktestTaskStatus,
  cancelBacktestTask,
  deleteBacktestTask,
  listBacktestTasks,
} from '../../../shared/api/backtesting';

type TaskFilters = {
  keyword?: string;
  status?: BacktestTaskStatus[];
};

const STATUS_COLORS: Record<BacktestTaskStatus, string> = {
  [BacktestTaskStatus.SUBMITTED]: 'default',
  [BacktestTaskStatus.QUEUED]: 'processing',
  [BacktestTaskStatus.RUNNING]: 'processing',
  [BacktestTaskStatus.FINISHED]: 'success',
  [BacktestTaskStatus.FAILED]: 'error',
  [BacktestTaskStatus.CANCELLED]: 'warning',
};

const STATUS_TEXT: Record<BacktestTaskStatus, string> = {
  [BacktestTaskStatus.SUBMITTED]: '已提交',
  [BacktestTaskStatus.QUEUED]: '排队中',
  [BacktestTaskStatus.RUNNING]: '运行中',
  [BacktestTaskStatus.FINISHED]: '已完成',
  [BacktestTaskStatus.FAILED]: '失败',
  [BacktestTaskStatus.CANCELLED]: '已取消',
};

const BacktestTaskListPage: React.FC = () => {
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BacktestTaskDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [form] = Form.useForm<TaskFilters>();

  const fetchData = useCallback(
    async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
      setLoading(true);
      try {
        const res = await listBacktestTasks({
          page: nextPage,
          pageSize: nextPageSize,
          keyword: nextFilters.keyword?.trim(),
          status: nextFilters.status,
        });
        setData(res.items);
        setTotal(res.total);
        setPage(res.page);
        setPageSize(res.pageSize);
      } catch (error) {
        console.error(error);
        message.error('加载任务列表失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, filters, message],
  );

  useEffect(() => {
    fetchData(1, pageSize, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(() => {
    const values = form.getFieldsValue();
    const nextFilters: TaskFilters = {
      keyword: values.keyword?.trim(),
      status: values.status,
    };
    setFilters(nextFilters);
    fetchData(1, pageSize, nextFilters);
  }, [form, fetchData, pageSize]);

  const handleReset = useCallback(() => {
    form.resetFields();
    const nextFilters: TaskFilters = {};
    setFilters(nextFilters);
    fetchData(1, pageSize, nextFilters);
  }, [form, fetchData, pageSize]);

  const handleCancel = useCallback(
    async (record: BacktestTaskDto) => {
      modal.confirm({
        title: '确认取消任务？',
        content: `任务"${record.name}"正在执行中，取消后无法恢复`,
        okText: '取消任务',
        okButtonProps: { danger: true },
        cancelText: '返回',
        onOk: async () => {
          try {
            await cancelBacktestTask(record.taskId);
            message.success('任务已取消');
            await fetchData(page, pageSize, filters);
          } catch (error) {
            console.error(error);
            message.error('取消任务失败，请稍后重试');
          }
        },
      });
    },
    [modal, fetchData, page, pageSize, filters, message],
  );

  const handleDelete = useCallback(
    async (record: BacktestTaskDto) => {
      modal.confirm({
        title: '确认删除任务？',
        content: `删除后可在数据库恢复，但平台将不可见（任务ID: ${record.taskId}）`,
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          try {
            await deleteBacktestTask(record.taskId);
            message.success('任务已删除');
            await fetchData(page, pageSize, filters);
          } catch (error) {
            console.error(error);
            message.error('删除失败，请稍后重试');
          }
        },
      });
    },
    [modal, fetchData, page, pageSize, filters, message],
  );

  const columns: ColumnsType<BacktestTaskDto> = useMemo(
    () => [
      {
        title: '任务 ID',
        dataIndex: 'taskId',
        width: 100,
        fixed: 'left',
      },
      {
        title: '任务名称',
        dataIndex: 'name',
        width: 200,
        ellipsis: true,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        render: (status: BacktestTaskStatus) => (
          <Tag color={STATUS_COLORS[status]}>{STATUS_TEXT[status]}</Tag>
        ),
      },
      {
        title: '进度',
        dataIndex: 'progress',
        width: 100,
        render: (progress?: number) => (progress !== undefined ? `${progress}%` : '-'),
      },
      {
        title: '策略',
        dataIndex: 'strategy',
        width: 150,
        ellipsis: true,
        render: (strategy?: { name: string }) => strategy?.name || '-',
      },
      {
        title: '脚本版本',
        dataIndex: 'scriptVersion',
        width: 150,
        render: (scriptVersion?: { versionCode: string }) =>
          scriptVersion?.versionCode || '-',
      },
      {
        title: '数据集',
        dataIndex: 'dataset',
        width: 120,
        render: (dataset?: { source: string }) => dataset?.source || '-',
      },
      {
        title: '回测时间范围',
        width: 200,
        render: (_, record) => {
          const start = new Date(record.backtestStartDate).toLocaleDateString();
          const end = new Date(record.backtestEndDate).toLocaleDateString();
          return `${start} ~ ${end}`;
        },
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value: string) => new Date(value).toLocaleString(),
      },
      {
        title: '操作',
        fixed: 'right',
        width: 260,
        render: (_, record) => {
          const canCancel =
            record.status === BacktestTaskStatus.SUBMITTED ||
            record.status === BacktestTaskStatus.QUEUED ||
            record.status === BacktestTaskStatus.RUNNING;
          const canDelete =
            record.status === BacktestTaskStatus.FINISHED ||
            record.status === BacktestTaskStatus.FAILED ||
            record.status === BacktestTaskStatus.CANCELLED;

          return (
            <Space>
              <Button
                size="small"
                onClick={() => navigate(`/backtest/tasks/${record.taskId}`)}
              >
                查看详情
              </Button>
              {canCancel && (
                <Button size="small" danger onClick={() => handleCancel(record)}>
                  取消
                </Button>
              )}
              {canDelete && (
                <Button size="small" danger onClick={() => handleDelete(record)}>
                  删除
                </Button>
              )}
            </Space>
          );
        },
      },
    ],
    [handleCancel, handleDelete, navigate],
  );

  return (
    <Card
      title="回测任务列表"
      extra={
        <Button type="primary" onClick={() => navigate('/backtest/tasks/create')}>
          创建回测任务
        </Button>
      }
    >
      <Form<TaskFilters>
        layout="inline"
        form={form}
        initialValues={{}}
        style={{ marginBottom: 16 }}
        onFinish={handleSearch}
      >
        <Form.Item name="keyword">
          <Input.Search
            placeholder="根据任务名称搜索"
            allowClear
            onSearch={handleSearch}
            style={{ width: 250 }}
          />
        </Form.Item>
        <Form.Item name="status">
          <Select
            mode="multiple"
            placeholder="筛选状态"
            allowClear
            style={{ minWidth: 200 }}
            options={Object.entries(STATUS_TEXT).map(([value, label]) => ({
              label,
              value,
            }))}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
            <Button onClick={handleReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>
      <Table<BacktestTaskDto>
        rowKey="taskId"
        loading={loading}
        columns={columns}
        dataSource={data}
        scroll={{ x: 1400 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => {
            fetchData(nextPage, nextPageSize, filters);
          },
        }}
      />
    </Card>
  );
};

export default BacktestTaskListPage;

