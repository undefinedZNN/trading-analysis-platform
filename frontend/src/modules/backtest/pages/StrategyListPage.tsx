import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
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
  updateStrategy,
} from '../../../shared/api/strategyManagement';

type StrategyFilters = {
  keyword?: string;
  tags?: string[];
};

function normalizeCommaList(input?: string): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const StrategyFormModal: React.FC<{
  open: boolean;
  mode: 'create' | 'edit';
  initialValues?: StrategyFormValues;
  onOk: (values: StrategyFormValues) => Promise<void>;
  onCancel: () => void;
  confirmLoading?: boolean;
}> = ({ open, mode, initialValues, onOk, onCancel, confirmLoading }) => {
  const [form] = Form.useForm<StrategyFormValues>();

  useEffect(() => {
    if (open && initialValues) {
      form.setFieldsValue({
        name: initialValues.name,
        tags: initialValues.tags,
        description: initialValues.description,
      });
    }
  }, [open, initialValues, form]);

  return (
    <Modal
      title={mode === 'create' ? '创建策略' : '编辑策略'}
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
      width={600}
    >
      <Form<StrategyFormValues> form={form} layout="vertical">
        <Form.Item
          name="name"
          label="策略名称"
          rules={[
            { required: true, message: '请输入策略名称' },
            { max: 100, message: '名称长度不能超过 100 个字符' },
          ]}
        >
          <Input placeholder="例如：趋势跟踪策略" />
        </Form.Item>
        <Form.Item name="tags" label="标签">
          <Input placeholder="多个以逗号分隔，如 趋势,期货" />
        </Form.Item>
        <Form.Item name="description" label="策略说明">
          <Input.TextArea rows={4} showCount maxLength={1000} placeholder="描述策略的交易逻辑和适用场景" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

type StrategyFormValues = {
  name: string;
  tags?: string;
  description?: string;
};

const StrategyListPage: React.FC = () => {
  const { modal, message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StrategyDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<StrategyFilters>({});
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formModalMode, setFormModalMode] = useState<'create' | 'edit'>('create');
  const [editingStrategy, setEditingStrategy] = useState<StrategyDto | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
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
          tags: nextFilters.tags || undefined,
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
    [page, pageSize, filters, message],
  );

  useEffect(() => {
    fetchData(1, pageSize, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(() => {
    const values = form.getFieldsValue();
    const nextFilters: StrategyFilters = {
      keyword: values.keyword?.trim(),
      tags: values.tags,
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

  const handleFormSubmit = useCallback(
    async (values: StrategyFormValues) => {
      setFormSubmitting(true);
      try {
        if (formModalMode === 'create') {
          await createStrategy({
            name: values.name.trim(),
            tags: normalizeCommaList(values.tags),
            description: values.description?.trim() || undefined,
          });
          message.success('策略创建成功');
        } else if (editingStrategy) {
          await updateStrategy(editingStrategy.strategyId, {
            name: values.name.trim(),
            tags: normalizeCommaList(values.tags),
            description: values.description?.trim() || undefined,
          });
          message.success('策略更新成功');
        }
        setFormModalOpen(false);
        setEditingStrategy(null);
        await fetchData(1, pageSize, filters);
      } catch (error) {
        console.error(error);
        message.error(formModalMode === 'create' ? '创建策略失败，请检查输入或稍后再试' : '更新策略失败，请稍后再试');
      } finally {
        setFormSubmitting(false);
      }
    },
    [formModalMode, editingStrategy, fetchData, pageSize, filters, message],
  );

  const handleOpenCreate = useCallback(() => {
    setFormModalMode('create');
    setEditingStrategy(null);
    setFormModalOpen(true);
  }, []);

  const handleOpenEdit = useCallback((record: StrategyDto) => {
    setFormModalMode('edit');
    setEditingStrategy(record);
    setFormModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (record: StrategyDto) => {
      modal.confirm({
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
    [modal, fetchData, page, pageSize, filters],
  );

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    data.forEach((strategy) => {
      strategy.tags.forEach((tag) => {
        if (tag.trim()) {
          tagSet.add(tag);
        }
      });
    });
    return Array.from(tagSet).sort();
  }, [data]);

  const columns: ColumnsType<StrategyDto> = useMemo(
    () => [
      {
        title: '策略 ID',
        dataIndex: 'strategyId',
        width: 100,
      },
      {
        title: '策略名称',
        dataIndex: 'name',
        width: 200,
      },
      {
        title: '标签',
        dataIndex: 'tags',
        width: 250,
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
        title: '策略说明',
        dataIndex: 'description',
        width: 300,
        ellipsis: true,
        render: (value?: string | null) => value || '-',
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value: string) => new Date(value).toLocaleString(),
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
        width: 260,
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => navigate(`/backtest/strategies/${record.strategyId}`)}>
              查看详情
            </Button>
            <Button size="small" type="primary" onClick={() => handleOpenEdit(record)}>
              编辑
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
    [handleDelete, handleOpenEdit, navigate],
  );

  return (
    <Card
      title="策略列表"
      extra={
        <Button type="primary" onClick={handleOpenCreate}>
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
            placeholder="根据策略名称搜索"
            allowClear
            onSearch={handleSearch}
            style={{ width: 250 }}
          />
        </Form.Item>
        <Form.Item name="tags">
          <Select
            mode="multiple"
            placeholder="筛选标签"
            allowClear
            style={{ minWidth: 200 }}
            options={availableTags.map((tag) => ({ label: tag, value: tag }))}
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
      <StrategyFormModal
        open={formModalOpen}
        mode={formModalMode}
        initialValues={
          editingStrategy
            ? {
                name: editingStrategy.name,
                tags: editingStrategy.tags.join(', '),
                description: editingStrategy.description || undefined,
              }
            : undefined
        }
        confirmLoading={formSubmitting}
        onCancel={() => {
          setFormModalOpen(false);
          setEditingStrategy(null);
        }}
        onOk={handleFormSubmit}
      />
    </Card>
  );
};

export default StrategyListPage;
