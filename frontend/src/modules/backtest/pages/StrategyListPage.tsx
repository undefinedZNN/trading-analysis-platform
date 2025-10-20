import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Modal,
  Space,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { StrategyDto } from '../../../shared/api/strategyManagement';
import {
  createStrategy,
  deleteStrategy,
  listStrategies,
} from '../../../shared/api/strategyManagement';

type StrategyFilters = {
  keyword?: string;
};

function normalizeCommaList(input?: string): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const StrategyCreateModal: React.FC<{
  open: boolean;
  onOk: (values: StrategyCreateFormValues) => Promise<void>;
  onCancel: () => void;
  confirmLoading?: boolean;
}> = ({ open, onOk, onCancel, confirmLoading }) => {
  const [form] = Form.useForm<StrategyCreateFormValues>();

  return (
    <Modal
      title="创建策略"
      open={open}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={() => {
        form
          .validateFields()
          .then((values) => onOk(values))
          .then(() => {
            form.resetFields();
          })
          .catch(() => {});
      }}
      confirmLoading={confirmLoading}
      destroyOnClose
    >
      <Form<StrategyCreateFormValues> form={form} layout="vertical">
        <Form.Item
          name="code"
          label="策略编码"
          rules={[
            { required: true, message: '请输入策略编码' },
            { max: 50, message: '编码长度不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="例如 ma-crossover-long" />
        </Form.Item>
        <Form.Item
          name="name"
          label="策略名称"
          rules={[
            { required: true, message: '请输入策略名称' },
            { max: 100, message: '名称长度不能超过 100 个字符' },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="team" label="团队">
          <Input placeholder="可选，例如 alpha-team" />
        </Form.Item>
        <Form.Item
          name="markets"
          label="适用市场"
          rules={[
            {
              validator: (_, value) => {
                const normalized = normalizeCommaList(value);
                return normalized.length === 0
                  ? Promise.reject(new Error('请至少填写一个市场标识'))
                  : Promise.resolve();
              },
            },
          ]}
        >
          <Input placeholder="多个以逗号分隔，如 crypto:spot,us:equity" />
        </Form.Item>
        <Form.Item name="frequency" label="交易频率">
          <Input placeholder="如 1m、5m、1d" />
        </Form.Item>
        <Form.Item name="tags" label="标签">
          <Input placeholder="多个以逗号分隔，如 momentum,alpha" />
        </Form.Item>
        <Form.Item name="description" label="策略说明">
          <Input.TextArea rows={3} showCount maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

type StrategyCreateFormValues = {
  code: string;
  name: string;
  team?: string;
  markets?: string;
  frequency?: string;
  tags?: string;
  description?: string;
};

const StrategyListPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StrategyDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<StrategyFilters>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [form] = Form.useForm<StrategyFilters>();
  const navigate = useNavigate();

  const fetchData = useCallback(
    async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
      setLoading(true);
      try {
        const res = await listStrategies({
          page: nextPage,
          pageSize: nextPageSize,
          keyword: nextFilters.keyword?.trim(),
        });
        setData(res.items);
        setTotal(res.total);
        setPage(res.page);
        setPageSize(res.pageSize);
      } catch (error) {
        console.error(error);
        message.error('加载策略列表失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, filters],
  );

  useEffect(() => {
    fetchData(1, pageSize, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(() => {
    const values = form.getFieldsValue();
    const nextFilters: StrategyFilters = {
      keyword: values.keyword?.trim(),
    };
    setFilters(nextFilters);
    fetchData(1, pageSize, nextFilters);
  }, [form, fetchData, pageSize]);

  const handleReset = useCallback(() => {
    form.resetFields();
    const nextFilters: StrategyFilters = {};
    setFilters(nextFilters);
    fetchData(1, pageSize, nextFilters);
  }, [form, fetchData, pageSize]);

  const handleCreateStrategy = useCallback(
    async (values: StrategyCreateFormValues) => {
      setCreateSubmitting(true);
      try {
        await createStrategy({
          code: values.code.trim(),
          name: values.name.trim(),
          team: values.team?.trim() || undefined,
          markets: normalizeCommaList(values.markets),
          frequency: values.frequency?.trim() || undefined,
          tags: normalizeCommaList(values.tags),
          description: values.description?.trim() || undefined,
        });
        message.success('策略创建成功');
        setCreateModalOpen(false);
        await fetchData(1, pageSize, filters);
      } catch (error) {
        console.error(error);
        message.error('创建策略失败，请检查输入或稍后再试');
      } finally {
        setCreateSubmitting(false);
      }
    },
    [fetchData, pageSize, filters],
  );

  const handleDelete = useCallback(
    async (record: StrategyDto) => {
      Modal.confirm({
        title: '确认删除策略？',
        content: `删除后可在后端数据库恢复，但平台将不可见（策略ID: ${record.strategyId}）`,
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          try {
            await deleteStrategy(record.strategyId);
            message.success('策略已删除');
            await fetchData(page, pageSize, filters);
          } catch (error) {
            console.error(error);
            message.error('删除失败，请稍后重试');
          }
        },
      });
    },
    [fetchData, page, pageSize, filters],
  );

  const columns: ColumnsType<StrategyDto> = useMemo(
    () => [
      {
        title: '策略 ID',
        dataIndex: 'strategyId',
        width: 100,
      },
      {
        title: '策略编码',
        dataIndex: 'code',
        width: 140,
      },
      {
        title: '策略名称',
        dataIndex: 'name',
        width: 160,
      },
      {
        title: '团队',
        dataIndex: 'team',
        width: 150,
        render: (value?: string | null) => value || '-',
      },
      {
        title: '适用市场',
        dataIndex: 'markets',
        width: 200,
        render: (markets: string[]) =>
          markets?.length ? (
            <Space wrap size={[4, 4]}>
              {markets.map((item) => (
                <Tag key={item}>{item}</Tag>
              ))}
            </Space>
          ) : (
            '-'
          ),
      },
      {
        title: '频率',
        dataIndex: 'frequency',
        width: 100,
        render: (value?: string | null) => value || '-',
      },
      {
        title: '标签',
        dataIndex: 'tags',
        width: 200,
        render: (tags: string[]) =>
          tags?.length ? (
            <Space wrap size={[4, 4]}>
              {tags.map((tag) => (
                <Tag key={tag} color="blue">
                  {tag}
                </Tag>
              ))}
            </Space>
          ) : (
            '-'
          ),
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        width: 180,
        render: (value: string) => new Date(value).toLocaleString(),
      },
      {
        title: '操作',
        fixed: 'right',
        width: 200,
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => navigate(`/backtest/strategies/${record.strategyId}`)}>
              查看
            </Button>
            <Button
              size="small"
              danger
              onClick={() => handleDelete(record)}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [handleDelete, navigate],
  );

  return (
    <Card
      title="策略列表"
      extra={
        <Button type="primary" onClick={() => setCreateModalOpen(true)}>
          创建策略
        </Button>
      }
    >
      <Form<StrategyFilters>
        layout="inline"
        form={form}
        initialValues={{}}
        style={{ marginBottom: 16 }}
        onFinish={handleSearch}
      >
        <Form.Item name="keyword">
          <Input.Search
            placeholder="根据名称或编码搜索"
            allowClear
            onSearch={handleSearch}
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
      <Table<StrategyDto>
        rowKey="strategyId"
        loading={loading}
        columns={columns}
        dataSource={data}
        scroll={{ x: 900 }}
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
      <StrategyCreateModal
        open={createModalOpen}
        confirmLoading={createSubmitting}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateStrategy}
      />
    </Card>
  );
};

export default StrategyListPage;
