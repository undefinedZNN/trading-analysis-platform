import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  message,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Editor from '@monaco-editor/react';
import type { StrategyDto, StrategyScriptDto } from '../../../shared/api/strategyManagement';
import {
  createStrategyScript,
  getStrategy,
  getStrategyScript,
  listStrategyScripts,
  updateStrategyScript,
} from '../../../shared/api/strategyManagement';

const SCRIPT_TEMPLATE = `import { defineStrategy } from '@platform/backtest-sdk';

export default defineStrategy({
  meta: {
    name: 'sample-strategy',
    version: '1.0.0',
    description: '示例策略脚本，展示 SDK 用法',
    tags: ['sample'],
  },
  hooks: {
    onInit: async ({ context }) => {
      context.logger.info('strategy init');
    },
    onBar: async ({ bar, context }) => {
      context.logger.debug('bar', bar);
    },
  },
});
`;

type ScriptModalMode = 'create' | 'edit';

type ScriptFormValues = {
  versionCode?: string;
  description?: string;
  changelog?: string;
  manifest?: string;
  isPrimary?: boolean;
};

const StrategyDetailPage: React.FC = () => {
  const { strategyId } = useParams<{ strategyId: string }>();
  const navigate = useNavigate();
  const [strategy, setStrategy] = useState<StrategyDto | null>(null);
  const [scripts, setScripts] = useState<StrategyScriptDto[]>([]);
  const [activeScript, setActiveScript] = useState<StrategyScriptDto | null>(null);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ScriptModalMode>('create');
  const [editorValue, setEditorValue] = useState<string>(SCRIPT_TEMPLATE);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [form] = Form.useForm<ScriptFormValues>();

  const numericStrategyId = useMemo(() => {
    const parsed = Number(strategyId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [strategyId]);

  const loadStrategy = useCallback(async () => {
    if (!numericStrategyId) return;
    try {
      const res = await getStrategy(numericStrategyId);
      setStrategy(res);
    } catch (error) {
      console.error(error);
      message.error('策略不存在或已被删除');
      navigate('/backtest/strategies', { replace: true });
    }
  }, [numericStrategyId, navigate]);

  const loadScripts = useCallback(async () => {
    if (!numericStrategyId) return;
    setLoadingScripts(true);
    try {
      const res = await listStrategyScripts(numericStrategyId, { page: 1, pageSize: 100 });
      setScripts(res.items);
      if (res.items.length > 0) {
        setActiveScript(res.items[0]);
      } else {
        setActiveScript(null);
      }
    } catch (error) {
      console.error(error);
      message.error('加载脚本版本失败，请稍后再试');
    } finally {
      setLoadingScripts(false);
    }
  }, [numericStrategyId]);

  useEffect(() => {
    loadStrategy();
    loadScripts();
  }, [loadStrategy, loadScripts]);

  const columns: ColumnsType<StrategyScriptDto> = useMemo(
    () => [
      {
        title: '版本号',
        dataIndex: 'versionCode',
        width: 160,
      },
      {
        title: '主版本',
        dataIndex: 'isPrimary',
        width: 120,
        render: (value: boolean) => (value ? <Tag color="blue">主版本</Tag> : '-'),
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        width: 200,
        render: (value: string) => new Date(value).toLocaleString(),
      },
      {
        title: '操作',
        width: 220,
        fixed: 'right',
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => setActiveScript(record)}>
              查看
            </Button>
            <Button size="small" onClick={() => openEditModal(record)}>
              编辑
            </Button>
          </Space>
        ),
      },
    ],
    [],
  );

  const openCreateModal = useCallback(() => {
    setModalMode('create');
    form.resetFields();
    form.setFieldsValue({
      isPrimary: scripts.length === 0,
    });
    setEditorValue(SCRIPT_TEMPLATE);
    setModalOpen(true);
  }, [form, scripts.length]);

  const openEditModal = useCallback(
    async (script: StrategyScriptDto) => {
      setModalMode('edit');
      try {
        const fullScript = await getStrategyScript(script.scriptId);
        setEditorValue(fullScript.scriptSource);
        form.setFieldsValue({
          versionCode: fullScript.versionCode,
          description: fullScript.description ?? undefined,
          changelog: fullScript.changelog ?? undefined,
          manifest: fullScript.manifest ? JSON.stringify(fullScript.manifest, null, 2) : undefined,
          isPrimary: fullScript.isPrimary,
        });
        setActiveScript(fullScript);
        setModalOpen(true);
      } catch (error) {
        console.error(error);
        message.error('加载脚本详情失败');
      }
    },
    [form],
  );

  const handleSubmit = useCallback(async () => {
    if (!numericStrategyId) return;
    try {
      const values = await form.validateFields();
      let manifest: Record<string, unknown> | null | undefined;
      if (values.manifest) {
        try {
          manifest = JSON.parse(values.manifest);
        } catch (error) {
          throw new Error('Manifest 不是合法 JSON');
        }
      }

      setModalSubmitting(true);

      if (modalMode === 'create') {
        await createStrategyScript(numericStrategyId, {
          versionCode: values.versionCode?.trim() || undefined,
          description: values.description?.trim() || undefined,
          changelog: values.changelog?.trim() || undefined,
          manifest: manifest ?? undefined,
          isPrimary: values.isPrimary,
          scriptSource: editorValue,
        });
        message.success('脚本版本创建成功');
      } else if (activeScript) {
        await updateStrategyScript(activeScript.scriptId, {
          description: values.description?.trim() || undefined,
          changelog: values.changelog?.trim() || undefined,
          manifest: manifest ?? undefined,
          isPrimary: values.isPrimary,
          scriptSource: editorValue,
        });
        message.success('脚本版本更新成功');
      }

      setModalOpen(false);
      await loadScripts();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      } else {
        console.error(error);
        message.error('保存失败，请稍后再试');
      }
    } finally {
      setModalSubmitting(false);
    }
  }, [numericStrategyId, form, modalMode, editorValue, activeScript, loadScripts]);

  const activeManifest = useMemo(() => {
    if (!activeScript?.manifest) return '-';
    try {
      return JSON.stringify(activeScript.manifest, null, 2);
    } catch {
      return '-';
    }
  }, [activeScript]);

  if (!numericStrategyId) {
    return (
      <Card>
        <Alert
          type="error"
          message="策略 ID 无效"
          action={
            <Button type="primary" onClick={() => navigate('/backtest/strategies')}>
              返回列表
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="策略概览"
        extra={
          <Button onClick={() => navigate('/backtest/strategies')}>
            返回策略列表
          </Button>
        }
      >
        {strategy ? (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="策略 ID">{strategy.strategyId}</Descriptions.Item>
            <Descriptions.Item label="策略编码">{strategy.code}</Descriptions.Item>
            <Descriptions.Item label="策略名称">{strategy.name}</Descriptions.Item>
            <Descriptions.Item label="团队">{strategy.team || '-'}</Descriptions.Item>
            <Descriptions.Item label="交易频率">{strategy.frequency || '-'}</Descriptions.Item>
            <Descriptions.Item label="市场">
              <Space wrap>
                {strategy.markets?.map((item) => (
                  <Tag key={item}>{item}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="标签">
              <Space wrap>
                {strategy.tags?.length
                  ? strategy.tags.map((tag) => (
                      <Tag key={tag} color="blue">
                        {tag}
                      </Tag>
                    ))
                  : '-'}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="策略说明" span={2}>
              {strategy.description || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {new Date(strategy.createdAt).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {new Date(strategy.updatedAt).toLocaleString()}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Alert type="info" message="正在加载策略信息..." />
        )}
      </Card>

      <Card
        title="脚本版本"
        extra={
          <Button type="primary" onClick={openCreateModal}>
            新建脚本版本
          </Button>
        }
      >
        <Table<StrategyScriptDto>
          rowKey="scriptId"
          loading={loadingScripts}
          columns={columns}
          dataSource={scripts}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>

      <Card title={activeScript ? `脚本预览 - ${activeScript.versionCode}` : '脚本预览'}>
        {activeScript ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Editor
              height="420px"
              language="typescript"
              theme="vs-dark"
              value={activeScript.scriptSource}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                automaticLayout: true,
              }}
            />
            <Card size="small" title="Manifest">
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{activeManifest}</pre>
            </Card>
          </Space>
        ) : (
          <Alert message="暂无脚本，请先创建脚本版本" type="info" />
        )}
      </Card>

      <Modal
        title={modalMode === 'create' ? '新建脚本版本' : '编辑脚本版本'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={handleSubmit}
        confirmLoading={modalSubmitting}
        width={960}
        destroyOnClose
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Form<ScriptFormValues> layout="vertical" form={form}>
            <Form.Item name="versionCode" label="版本号">
              <Input placeholder="留空则自动生成" disabled={modalMode === 'edit'} />
            </Form.Item>
            <Form.Item name="description" label="版本描述">
              <Input.TextArea rows={2} maxLength={200} showCount />
            </Form.Item>
            <Form.Item name="changelog" label="变更记录">
              <Input.TextArea rows={3} maxLength={2000} showCount />
            </Form.Item>
            <Form.Item name="manifest" label="Manifest (JSON)">
              <Input.TextArea rows={3} placeholder='例如 {"entry":"src/index.ts"}' />
            </Form.Item>
            <Form.Item name="isPrimary" label="设置为主版本" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
          <Editor
            height="420px"
            language="typescript"
            theme="vs-dark"
            value={editorValue}
            onChange={(value) => setEditorValue(value ?? '')}
            options={{
              minimap: { enabled: false },
              automaticLayout: true,
            }}
          />
        </Space>
      </Modal>
    </Space>
  );
};

export default StrategyDetailPage;
