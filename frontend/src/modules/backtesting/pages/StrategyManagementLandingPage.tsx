import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Badge,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Button,
  Switch,
} from 'antd';
import { CheckCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import Editor from '@monaco-editor/react';
import { isAxiosError } from 'axios';
import SchemaPreview from '../components/SchemaPreview';
import type { SchemaField } from '../components/SchemaPreview';
import {
  fetchBacktestingHealth,
  fetchStrategy,
  fetchStrategyTags,
  listStrategies,
  createStrategy,
  updateStrategy,
  createStrategyVersion,
  updateStrategyVersion,
  fetchStrategyVersionDiff,
} from '../../../shared/api/backtesting';
import type {
  BacktestingHealth,
  StrategySummary,
  StrategyDetail,
  StrategyVersionSummary,
} from '../../../shared/api/backtesting';
import type { VersionCodeDiffSegment, VersionDiffResponse } from '../../../shared/api/backtesting';

const { Title, Paragraph, Text } = Typography;

const DATE_FORMAT = 'YYYY-MM-DD HH:mm';
type StrategyVersionDiff = VersionDiffResponse;
const DEFAULT_SCRIPT_TEMPLATE = `import { defineStrategy } from '@platform/backtesting-sdk';

export default defineStrategy({
  parameters: [],
  factors: [],
  run(ctx) {
    // TODO: implement strategy logic
  },
});
`;

const normalizeSchemaFields = (value: unknown): SchemaField[] =>
  Array.isArray(value) ? (value as SchemaField[]) : [];

const normalizeField = (value: unknown): SchemaField => {
  if (!value || typeof value !== 'object') {
    return { key: '' };
  }
  const record = value as Record<string, unknown>;
  const keyValue = record.key ?? record.id ?? '';
  const labels = typeof record.label === 'string' ? record.label : undefined;
  const descValue =
    typeof record.desc === 'string'
      ? record.desc
      : typeof record.description === 'string'
      ? record.description
      : undefined;
  const enumOptions = Array.isArray(record.enumOptions)
    ? (record.enumOptions as Array<{ label: string; value: unknown }>)
    : undefined;
  return {
    key: String(keyValue),
    label: labels,
    type: typeof record.type === 'string' ? record.type : undefined,
    component: typeof record.component === 'string' ? record.component : undefined,
    desc: descValue ?? null,
    required: typeof record.required === 'boolean' ? record.required : undefined,
    defaultValue: record.defaultValue,
    enumOptions,
    validator: record.validator,
  };
};

const renderFieldDiffTable = (
  title: string,
  fields: SchemaField[],
) => (
  <SchemaPreview
    title={title}
    parameters={fields}
    factors={[]}
  />
);

type ChangedField = {
  key: string;
  before: SchemaField;
  after: SchemaField;
};

const changedFieldColumns: ColumnsType<ChangedField> = [
  {
    title: '字段 key',
    dataIndex: 'key',
    key: 'key',
    width: 160,
  },
  {
    title: '原值',
    dataIndex: 'before',
    key: 'before',
    ellipsis: true,
    render: (field: SchemaField) => field.label ?? field.type ?? field.component ?? '—',
  },
  {
    title: '新值',
    dataIndex: 'after',
    key: 'after',
    ellipsis: true,
    render: (field: SchemaField) => field.label ?? field.type ?? field.component ?? '—',
  },
];

function StrategyManagementLandingPage() {
  const { message } = App.useApp();
  const [health, setHealth] = useState<BacktestingHealth | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<StrategySummary[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [strategyDetail, setStrategyDetail] = useState<StrategyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyModalMode, setStrategyModalMode] = useState<'create' | 'edit'>('create');
  const [strategyModalLoading, setStrategyModalLoading] = useState(false);
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null);
  const [versionModalState, setVersionModalState] = useState<{
    mode: 'create' | 'copy' | 'edit';
    strategyId: string;
    baseVersion?: StrategyVersionSummary;
  } | null>(null);
  const [versionModalLoading, setVersionModalLoading] = useState(false);
  const [versionCode, setVersionCode] = useState<string>('');
  const [diffModalState, setDiffModalState] = useState<
    | null
    | {
        strategyId: string;
        baseVersion: StrategyVersionSummary;
      }
  >(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffData, setDiffData] = useState<StrategyVersionDiff | null>(null);
  const [diffCompareId, setDiffCompareId] = useState<string | undefined>();
  const [strategyModalError, setStrategyModalError] = useState<string | null>(null);
  const [versionModalError, setVersionModalError] = useState<string | null>(null);

  const [form] = Form.useForm<{ keyword?: string; tags?: string[] }>();
  const [createForm] = Form.useForm<{
    name: string;
    description?: string;
    tags?: string[];
    versionName?: string;
    remark?: string;
    code: string;
  }>();
  const [versionForm] = Form.useForm<{
    versionName?: string;
    remark?: string;
    isMaster?: boolean;
  }>();

  const reloadHealth = async () => {
    try {
      setCheckingHealth(true);
      setHealthError(null);
      const data = await fetchBacktestingHealth();
      setHealth(data);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : '无法连接回测服务');
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    void reloadHealth();
  }, []);

  const loadStrategies = useCallback(async (page = 1, pageSize = 10) => {
    const keyword = form.getFieldValue('keyword');
    const tags = form.getFieldValue('tags');
    try {
      setListLoading(true);
      setListError(null);
      const data = await listStrategies({
        page,
        pageSize,
        keyword: keyword ? keyword.trim() : undefined,
        tags: Array.isArray(tags) && tags.length ? tags : undefined,
      });
      setStrategies(data.items);
      setPagination({
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
      });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : '加载策略列表失败';
      setListError(messageText);
    } finally {
      setListLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void loadStrategies(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    await loadStrategies(1, pagination.pageSize);
  };

  const handleReset = () => {
    form.resetFields();
    void loadStrategies(1, pagination.pageSize);
  };

  const refreshDetail = useCallback(async (strategyId: string) => {
    setDetailLoading(true);
    try {
      const detail = await fetchStrategy(strategyId);
      setStrategyDetail(detail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '获取策略详情失败';
      message.error(msg);
      setStrategyDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [message]);

  const openDetail = useCallback(async (record: StrategySummary) => {
    setSelectedStrategyId(record.strategyId);
    setDrawerOpen(true);
    await refreshDetail(record.strategyId);
  }, [refreshDetail]);

  const handleEditStrategy = useCallback(
    async (strategyId: string) => {
      setStrategyModalMode('edit');
      setStrategyModalOpen(true);
      setStrategyModalError(null);
      setStrategyModalError(null);
      setStrategyModalLoading(true);
      setEditingStrategyId(strategyId);
      try {
        const detail = await fetchStrategy(strategyId);
        createForm.resetFields();
        createForm.setFieldsValue({
          name: detail.name,
          description: detail.description ?? undefined,
          tags: detail.tags ?? [],
          versionName: undefined,
          remark: undefined,
          isMaster: false,
          code: DEFAULT_SCRIPT_TEMPLATE,
        });
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载策略信息失败');
        setStrategyModalOpen(false);
        setEditingStrategyId(null);
      } finally {
        setStrategyModalLoading(false);
      }
    },
    [createForm, message],
  );

  const columns: ColumnsType<StrategySummary> = useMemo(
    () => [
      {
        title: '策略名称',
        dataIndex: 'name',
        key: 'name',
        render: (_, record) => (
          <Button type="link" onClick={() => void openDetail(record)}>
            {record.name}
          </Button>
        ),
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
      {
        title: '标签',
        dataIndex: 'tags',
        key: 'tags',
        render: (tags?: string[]) =>
          tags?.length ? (
            <Space wrap size={4}>
              {tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: 'Master 版本',
        key: 'masterVersion',
        render: (_, record) =>
          record.masterVersion ? (
            <Space size={4}>
              <Badge status="processing" />
              <span>{record.masterVersion.versionName}</span>
            </Space>
          ) : (
            <Text type="secondary">未设置</Text>
          ),
      },
      {
        title: '最近更新',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        render: (value: string) => dayjs(value).format(DATE_FORMAT),
        defaultSortOrder: 'descend',
        sorter: (a, b) =>
          dayjs(a.updatedAt).valueOf() - dayjs(b.updatedAt).valueOf(),
      },
      {
        title: '操作',
        key: 'actions',
        render: (_, record) => (
          <Space size={8}>
            <Button
              size="small"
              onClick={() => void handleEditStrategy(record.strategyId)}
            >
              编辑
            </Button>
          </Space>
        ),
      },
    ],
    [handleEditStrategy, openDetail],
  );

  const loadTags = useCallback(async () => {
    try {
      setTagsLoading(true);
      const data = await fetchStrategyTags();
      setTagOptions(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载标签失败';
      message.warning(msg);
    } finally {
      setTagsLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const handleSaveStrategy = useCallback(async () => {
    try {
      const values = await createForm.validateFields();
      if ((values.tags?.length ?? 0) > 6) {
        message.error('标签最多 6 个');
        return;
      }
      setStrategyModalLoading(true);
      if (strategyModalMode === 'create') {
        await createStrategy({
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
          tags: values.tags,
          initialVersion: {
            code: values.code,
            versionName: values.versionName?.trim() || undefined,
            remark: values.remark?.trim() || undefined,
          },
        });
        message.success('策略创建成功');
      } else if (editingStrategyId) {
        await updateStrategy(editingStrategyId, {
          description: values.description?.trim() || null,
          tags: values.tags,
        });
        message.success('策略已更新');
        if (editingStrategyId === selectedStrategyId && selectedStrategyId) {
          await refreshDetail(selectedStrategyId);
        }
      }
      setStrategyModalOpen(false);
      setStrategyModalError(null);
      setEditingStrategyId(null);
      createForm.resetFields();
      await Promise.all([
        loadStrategies(
          strategyModalMode === 'create' ? 1 : pagination.page,
          pagination.pageSize,
        ),
        loadTags(),
      ]);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // form validation errors already displayed
        return;
      }
      const fallback =
        strategyModalMode === 'edit' ? '更新策略失败' : '创建策略失败';
      const errorMessage = isAxiosError(err)
        ? Array.isArray(err.response?.data?.message)
          ? err.response?.data?.message.join('\n')
          : err.response?.data?.message ?? err.message
        : err instanceof Error
        ? err.message
        : fallback;
      setStrategyModalError(errorMessage);
      message.error(errorMessage);
    } finally {
      setStrategyModalLoading(false);
    }
  }, [
    createForm,
    editingStrategyId,
    loadStrategies,
    loadTags,
    message,
    pagination.page,
    pagination.pageSize,
    refreshDetail,
    selectedStrategyId,
    strategyModalMode,
  ]);

  const handleSetMaster = useCallback(
    async (strategyId: string, version: StrategyVersionSummary) => {
      try {
        await updateStrategyVersion(strategyId, version.scriptVersionId, {
          setMaster: true,
        });
        message.success('已设置为 master 版本');
        await Promise.all([
          refreshDetail(strategyId),
          loadStrategies(pagination.page, pagination.pageSize),
        ]);
      } catch (err) {
        message.error(err instanceof Error ? err.message : '设置 master 失败');
      }
    },
    [loadStrategies, message, pagination.page, pagination.pageSize, refreshDetail],
  );

  const openVersionModal = useCallback(
    (
      strategyId: string,
      mode: 'create' | 'copy' | 'edit',
      baseVersion?: StrategyVersionSummary,
    ) => {
      setVersionModalError(null);
      setVersionModalState({ strategyId, mode, baseVersion });
      versionForm.setFieldsValue({
        versionName:
          mode === 'edit'
            ? baseVersion?.versionName
            : undefined,
        remark: baseVersion?.remark,
        isMaster:
          mode === 'edit'
            ? baseVersion?.isMaster ?? false
            : false,
      });
      setVersionCode(baseVersion?.code ?? DEFAULT_SCRIPT_TEMPLATE);
    },
    [versionForm],
  );

  const closeVersionModal = useCallback(() => {
    setVersionModalState(null);
    setVersionCode('');
    setVersionModalError(null);
    versionForm.resetFields();
  }, [versionForm]);

  const handleCreateVersion = useCallback(async () => {
    if (!versionModalState) return;
    try {
      const values = await versionForm.validateFields();
      if (!versionCode.trim()) {
        message.error('请填写脚本代码');
        return;
      }
      setVersionModalError(null);
      setVersionModalLoading(true);
      if (versionModalState.mode === 'edit' && versionModalState.baseVersion) {
        await updateStrategyVersion(
          versionModalState.strategyId,
          versionModalState.baseVersion.scriptVersionId,
          {
            code: versionCode,
            versionName: values.versionName?.trim() || undefined,
            remark: values.remark?.trim() || undefined,
            setMaster: values.isMaster ?? undefined,
          },
        );
        message.success('脚本版本已更新');
      } else {
        await createStrategyVersion(versionModalState.strategyId, {
          code: versionCode,
          versionName: values.versionName?.trim() || undefined,
          remark: values.remark?.trim() || undefined,
          isMaster: values.isMaster ?? false,
        });
        message.success('脚本版本创建成功');
      }
      closeVersionModal();
      await Promise.all([
        refreshDetail(versionModalState.strategyId),
        loadStrategies(pagination.page, pagination.pageSize),
      ]);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return;
      }
      const fallback =
        versionModalState.mode === 'edit'
          ? '更新脚本版本失败'
          : '创建脚本版本失败';
      const errorMessage = isAxiosError(err)
        ? Array.isArray(err.response?.data?.message)
          ? err.response?.data?.message.join('\n')
          : err.response?.data?.message ?? err.message
        : err instanceof Error
        ? err.message
        : fallback;
      setVersionModalError(errorMessage);
      message.error(errorMessage);
    } finally {
      setVersionModalLoading(false);
    }
  }, [
    closeVersionModal,
    loadStrategies,
    message,
    pagination.page,
    pagination.pageSize,
    refreshDetail,
    versionCode,
    versionForm,
    versionModalState,
  ]);

  useEffect(() => {
    if (!diffModalState) {
      setDiffCompareId(undefined);
      setDiffData(null);
      setDiffLoading(false);
      return;
    }

    if (!diffCompareId) {
      const versions = strategyDetail?.scriptVersions ?? [];
      const candidate = versions.find(
        (v) => v.scriptVersionId !== diffModalState.baseVersion.scriptVersionId,
      );
      setDiffCompareId(candidate?.scriptVersionId);
      return;
    }

    let cancelled = false;
    setDiffLoading(true);
    fetchStrategyVersionDiff(
      diffModalState.strategyId,
      diffModalState.baseVersion.scriptVersionId,
      { compareVersionId: diffCompareId },
    )
      .then((data) => {
        if (!cancelled) {
          setDiffData(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDiffData(null);
          message.error(err instanceof Error ? err.message : '获取版本对比失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDiffLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [diffCompareId, diffModalState, message, strategyDetail?.scriptVersions]);

  const closeDiffModal = () => {
    setDiffModalState(null);
    setDiffCompareId(undefined);
    setDiffData(null);
  };

  const renderDiffSegment = (segment: VersionCodeDiffSegment, index: number) => {
    let color = 'inherit';
    if (segment.type === 'added') color = '#389e0d';
    if (segment.type === 'removed') color = '#cf1322';
    return (
      <pre
        key={`${segment.type}-${index}`}
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          background:
            segment.type === 'equal' ? 'transparent' : 'rgba(0,0,0,0.03)',
          padding: segment.type === 'equal' ? 0 : '4px 6px',
          color,
        }}
      >
        {segment.value}
      </pre>
    );
  };

  const versionColumns = useMemo<ColumnsType<StrategyVersionSummary>>(() => {
    const strategyId = strategyDetail?.strategyId ?? selectedStrategyId ?? '';
    const hasMultipleVersions = (strategyDetail?.scriptVersions.length ?? 0) > 1;
    return [
      {
        title: '版本号',
        dataIndex: 'versionName',
        key: 'versionName',
        render: (value: string, record) => (
          <Space>
            <Text strong>{value}</Text>
            {record.isMaster && <Tag color="processing">master</Tag>}
          </Space>
        ),
      },
      {
        title: '备注',
        dataIndex: 'remark',
        key: 'remark',
        render: (value?: string | null) => value || <Text type="secondary">—</Text>,
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        render: (value: string) => dayjs(value).format(DATE_FORMAT),
        sorter: (a, b) =>
          dayjs(a.updatedAt).valueOf() - dayjs(b.updatedAt).valueOf(),
        defaultSortOrder: 'descend',
      },
      {
        title: '参数字段',
        key: 'parameterCount',
        render: (_, record) =>
          Array.isArray(record.parameterSchema)
            ? record.parameterSchema.length
            : 0,
      },
      {
        title: '因子字段',
        key: 'factorCount',
        render: (_, record) =>
          Array.isArray(record.factorSchema)
            ? record.factorSchema.length
            : 0,
      },
      {
        title: '操作',
        key: 'actions',
        render: (_, record) => (
          <Space size={8}>
            <Button
              size="small"
              onClick={() =>
                strategyId &&
                openVersionModal(strategyId, 'copy', record)
              }
            >
              基于此复制
            </Button>
            <Button
              size="small"
              onClick={() =>
                strategyId &&
                openVersionModal(strategyId, 'edit', record)
              }
            >
              编辑
            </Button>
            {!record.isMaster && strategyId && (
              <Button
                size="small"
                onClick={() =>
                  void handleSetMaster(strategyId, record)
                }
              >
                设为 master
              </Button>
            )}
            {hasMultipleVersions && (
              <Button
                size="small"
                onClick={() =>
                  strategyId &&
                  setDiffModalState({ strategyId, baseVersion: record })
                }
              >
                对比
              </Button>
            )}
          </Space>
        ),
      },
    ];
  }, [handleSetMaster, openVersionModal, selectedStrategyId, strategyDetail]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography>
        <Title level={3}>策略管理</Title>
        <Paragraph type="secondary">
          浏览、筛选并管理回测策略，查看脚本版本历史，为回测任务选择合适的回测脚本。
        </Paragraph>
      </Typography>

      <Card
        title="模块健康检查"
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void reloadHealth()}
            loading={checkingHealth}
          >
            刷新
          </Button>
        }
      >
        {checkingHealth ? (
          <Space size={12} align="center">
            <Spin />
            <Text>正在检查回测服务状态...</Text>
          </Space>
        ) : healthError ? (
          <Alert
            type="error"
            message="回测服务不可用"
            description={healthError}
            showIcon
          />
        ) : (
          <Space size={12} align="center">
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
            <div>
              <Text strong>服务状态：{health?.status ?? '未知'}</Text>
              <Paragraph style={{ marginBottom: 0 }} type="secondary">
                最近响应时间：{health?.timestamp
                  ? dayjs(health.timestamp).format(DATE_FORMAT)
                  : '未知'}
              </Paragraph>
            </div>
          </Space>
        )}
      </Card>

      <Card>
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="keyword" label="关键词">
            <Input
              allowClear
              placeholder="按策略名称搜索"
              onPressEnter={() => void handleSearch()}
              style={{ width: 240 }}
            />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select
              mode="multiple"
              allowClear
              placeholder="按标签筛选"
              loading={tagsLoading}
              options={tagOptions.map((tag) => ({ label: tag, value: tag }))}
              style={{ minWidth: 220 }}
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SearchOutlined />}
                loading={listLoading}
              >
                搜索
              </Button>
              <Button onClick={handleReset} disabled={listLoading}>
                重置
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  createForm.resetFields();
                  setStrategyModalMode('create');
                  setEditingStrategyId(null);
                  setStrategyModalOpen(true);
                  setStrategyModalLoading(false);
                  createForm.setFieldsValue({
                    name: '',
                    description: undefined,
                    tags: [],
                    versionName: undefined,
                    remark: undefined,
                    code: DEFAULT_SCRIPT_TEMPLATE,
                  });
                }}
              >
                新建策略
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {listError && <Alert type="error" message={listError} showIcon />}

      <Card>
        <Table<StrategySummary>
          rowKey="strategyId"
          columns={columns}
          dataSource={strategies}
          loading={listLoading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
          }}
          onChange={(pager) => {
            void loadStrategies(pager.current ?? 1, pager.pageSize ?? pagination.pageSize);
          }}
        />
      </Card>

      <Drawer
        title="策略详情"
        open={drawerOpen}
        width={'80%'}
        onClose={() => {
          setDrawerOpen(false);
          setStrategyDetail(null);
          setSelectedStrategyId(null);
        }}
      >
        {detailLoading ? (
          <Space style={{ width: '100%', justifyContent: 'center', marginTop: 32 }}>
            <Spin />
          </Space>
        ) : strategyDetail ? (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} labelStyle={{ width: 120 }}>
              <Descriptions.Item label="策略名称">{strategyDetail.name}</Descriptions.Item>
              <Descriptions.Item label="描述">
                {strategyDetail.description || <Text type="secondary">暂无</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="标签">
                {strategyDetail.tags.length ? (
                  <Space wrap size={4}>
                    {strategyDetail.tags.map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">未设置</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(strategyDetail.createdAt).format(DATE_FORMAT)}
              </Descriptions.Item>
              <Descriptions.Item label="最近更新">
                {dayjs(strategyDetail.updatedAt).format(DATE_FORMAT)}
              </Descriptions.Item>
            </Descriptions>

            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Typography.Title level={5} style={{ marginBottom: 0 }}>
                脚本版本
              </Typography.Title>
              <Button
                type="primary"
                onClick={() =>
                  openVersionModal(strategyDetail.strategyId, 'create')
                }
              >
                新建脚本版本
              </Button>
            </Space>
            {strategyDetail.scriptVersions.length ? (
              <Table<StrategyVersionSummary>
                rowKey="scriptVersionId"
                columns={versionColumns}
                dataSource={strategyDetail.scriptVersions}
                expandable={{
                  expandedRowRender: (record) => (
                    <SchemaPreview
                      parameters={normalizeSchemaFields(record.parameterSchema)}
                      factors={normalizeSchemaFields(record.factorSchema)}
                    />
                  ),
                }}
                pagination={false}
                size="small"
                style={{ marginTop: 12 }}
              />
            ) : (
              <Alert type="info" message="暂无脚本版本" showIcon />
            )}
          </Space>
        ) : selectedStrategyId ? (
          <Alert type="error" message="加载策略详情失败" showIcon />
        ) : null}
      </Drawer>

      <Modal
        title={strategyModalMode === 'edit' ? '编辑策略' : '新建策略'}
        open={strategyModalOpen}
        onCancel={() => {
          setStrategyModalOpen(false);
          setStrategyModalMode('create');
          setStrategyModalLoading(false);
          setEditingStrategyId(null);
          setStrategyModalError(null);
          createForm.resetFields();
        }}
        onOk={() => void handleSaveStrategy()}
        confirmLoading={strategyModalLoading}
        width={720}
        okText={strategyModalMode === 'edit' ? '保存修改' : '创建策略'}
        cancelText="取消"
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{
            code: DEFAULT_SCRIPT_TEMPLATE,
          }}
        >
          {strategyModalError && (
            <Alert
              type="error"
              message={strategyModalError}
              showIcon
              style={{ marginBottom: 12 }}
            />
          )}
          <Form.Item
            label="策略名称"
            name="name"
            rules={[
              { required: true, message: '请输入策略名称' },
              { min: 3, max: 60, message: '策略名称需在 3-60 个字符之间' },
            ]}
          >
            <Input
              placeholder="例如：均线交叉策略"
              disabled={strategyModalMode === 'edit'}
            />
          </Form.Item>
          <Form.Item
            label="策略描述"
            name="description"
            rules={[{ max: 200, message: '描述最多 200 个字符' }]}
          >
            <Input.TextArea rows={2} placeholder="简要说明策略逻辑（可选）" />
          </Form.Item>
          <Form.Item label="标签" name="tags">
            <Select
              mode="tags"
              placeholder="可输入新标签，最多 6 个"
              maxTagCount="responsive"
              options={tagOptions.map((tag) => ({ label: tag, value: tag }))}
              onChange={(values) => {
                if (values.length > 6) {
                  message.warning('标签最多 6 个');
                  createForm.setFieldsValue({ tags: values.slice(0, 6) });
                }
              }}
            />
          </Form.Item>
          {strategyModalMode === 'create' ? (
            <>
              <Space size={16} style={{ width: '100%' }} wrap>
                <Form.Item
                  label="版本号"
                  name="versionName"
                  rules={[
                    { max: 20, message: '版本号最长 20 个字符' },
                    { pattern: /^v\\d+(\\.\\d+)*$/, message: '版本号需以 v 开头，例如 v1.0' },
                  ]}
                >
                  <Input placeholder="默认自动生成，可选填" />
                </Form.Item>
                <Form.Item
                  label="版本备注"
                  name="remark"
                  style={{ flex: 1 }}
                  rules={[{ max: 500, message: '备注最多 500 个字符' }]}
                >
                  <Input placeholder="可选" />
                </Form.Item>
                <Form.Item label="设为 master" name="isMaster" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Space>
              <Form.Item
                label="策略脚本"
                name="code"
                rules={[{ required: true, message: '请输入策略脚本' }]}
              >
                <Editor
                  height="320px"
                  language="typescript"
                  value={createForm.getFieldValue('code') ?? ''}
                  onChange={(value) =>
                    createForm.setFieldsValue({ code: value ?? '' })
                  }
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                  }}
                />
              </Form.Item>
            </>
          ) : (
            <Alert
              type="info"
              message="脚本版本可在策略详情页中管理（支持新建、复制、编辑、对比等操作）"
              showIcon
            />
          )}
        </Form>
      </Modal>

      <Modal
        title=
          {versionModalState?.mode === 'copy'
            ? '基于现有版本复制'
            : versionModalState?.mode === 'edit'
            ? '编辑脚本版本'
            : '新建脚本版本'}
        open={Boolean(versionModalState)}
        onCancel={closeVersionModal}
        onOk={() => void handleCreateVersion()}
        okText={versionModalState?.mode === 'edit' ? '保存修改' : '保存版本'}
        cancelText="取消"
        confirmLoading={versionModalLoading}
        width={800}
        destroyOnHidden
      >
        <Form form={versionForm} layout="vertical">
          {versionModalError && (
            <Alert
              type="error"
              message={versionModalError}
              showIcon
              style={{ marginBottom: 12 }}
            />
          )}
          <Space size={16} style={{ width: '100%' }} wrap>
            <Form.Item
              label="版本号"
              name="versionName"
              rules={[
                { max: 20, message: '版本号最长 20 个字符' },
                { pattern: /^v\\d+(\\.\\d+)*$/, message: '版本号需以 v 开头，例如 v1.0' },
              ]}
            >
              <Input placeholder="默认自动生成，可选填" />
            </Form.Item>
            <Form.Item label="设为 master" name="isMaster" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item label="版本备注" name="remark" rules={[{ max: 500, message: '备注最多 500 个字符' }]}>
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="脚本代码">
            <Editor
              height="320px"
              language="typescript"
              value={versionCode}
              onChange={(value) => setVersionCode(value ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
              }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="版本对比"
        open={Boolean(diffModalState)}
        onCancel={closeDiffModal}
        footer={null}
        width={880}
        destroyOnHidden
      >
        {!diffModalState ? null : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space align="center" wrap>
              <Text>对比版本：</Text>
              <Select
                value={diffCompareId}
                style={{ minWidth: 240 }}
                onChange={(value) => setDiffCompareId(value)}
              >
                {(strategyDetail?.scriptVersions ?? [])
                  .filter(
                    (v) =>
                      v.scriptVersionId !==
                      diffModalState.baseVersion.scriptVersionId,
                  )
                  .map((version) => (
                    <Select.Option
                      value={version.scriptVersionId}
                      key={version.scriptVersionId}
                    >
                      {version.versionName}
                    </Select.Option>
                  ))}
              </Select>
            </Space>

            {diffLoading ? (
              <Space style={{ width: '100%', justifyContent: 'center' }}>
                <Spin />
              </Space>
            ) : diffData ? (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card size="small" title="版本信息">
                  <Space direction="vertical" size={4}>
                    <Text>
                      基准版本：{diffData.baseVersion.versionName}{' '}
                      ({dayjs(diffData.baseVersion.updatedAt).format(
                        DATE_FORMAT,
                      )})
                    </Text>
                    <Text>
                      对比版本：{diffData.compareVersion.versionName}{' '}
                      ({dayjs(diffData.compareVersion.updatedAt).format(
                        DATE_FORMAT,
                      )})
                    </Text>
                  </Space>
                </Card>

                <Card size="small" title="代码差异">
                  {diffData.codeDiff.length ? (
                    diffData.codeDiff.map(renderDiffSegment)
                  ) : (
                    <Text type="secondary">无差异</Text>
                  )}
                </Card>

                <Card size="small" title="参数字段差异">
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Text>新增：{diffData.parameterDiff.added.length}</Text>
                    <Text>删除：{diffData.parameterDiff.removed.length}</Text>
                    <Text>修改：{diffData.parameterDiff.changed.length}</Text>
                  </Space>
                </Card>

              <Card size="small" title="因子字段差异">
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text>新增：{diffData.factorDiff.added.length}</Text>
                  <Text>删除：{diffData.factorDiff.removed.length}</Text>
                  <Text>修改：{diffData.factorDiff.changed.length}</Text>
                </Space>
              </Card>

                <SchemaPreview
                  title={`基准版本字段（${diffData.baseVersion.versionName}）`}
                  parameters={normalizeSchemaFields(diffData.baseVersion.parameterSchema)}
                  factors={normalizeSchemaFields(diffData.baseVersion.factorSchema)}
                />

                <SchemaPreview
                  title={`对比版本字段（${diffData.compareVersion.versionName}）`}
                  parameters={normalizeSchemaFields(diffData.compareVersion.parameterSchema)}
                  factors={normalizeSchemaFields(diffData.compareVersion.factorSchema)}
                />
              </Space>
            ) : (
              <Alert type="warning" message="暂无对比数据" />
            )}
          </Space>
        )}
      </Modal>
    </Space>
  );
}

export default StrategyManagementLandingPage;
