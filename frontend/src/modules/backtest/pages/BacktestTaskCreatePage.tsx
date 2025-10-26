import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { CreateBacktestTaskPayload } from '../../../shared/api/backtesting';
import { createBacktestTask } from '../../../shared/api/backtesting';
import type { StrategyDto } from '../../../shared/api/strategyManagement';
import { listStrategies } from '../../../shared/api/strategyManagement';
import type { StrategyScriptDto } from '../../../shared/api/strategyManagement';
import { listStrategyScripts } from '../../../shared/api/strategyManagement';
import type { DatasetDto } from '../../../shared/api/tradingData';
import { listDatasets } from '../../../shared/api/tradingData';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

type Step1FormValues = {
  name: string;
  description?: string;
  strategyId?: number;
};

type Step2FormValues = {
  scriptId?: number;
  datasetId?: number;
  dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
};

type Step3FormValues = {
  initialCapital: number;
  timeLevel: string;
  slippageType?: 'fixed' | 'percentage';
  slippageValue?: number;
  commissionType?: 'fixed' | 'percentage';
  commissionValue?: number;
  enableRiskConstraints?: boolean;
  maxDrawdownPercent?: number;
  maxDailyLossPercent?: number;
  maxPositionSize?: number;
  maxLeverage?: number;
};

const BacktestTaskCreatePage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [strategies, setStrategies] = useState<StrategyDto[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [step1Form] = Form.useForm<Step1FormValues>();
  const [step1Data, setStep1Data] = useState<Step1FormValues | null>(null);

  // Step 2
  const [scripts, setScripts] = useState<StrategyScriptDto[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [step2Form] = Form.useForm<Step2FormValues>();
  const [step2Data, setStep2Data] = useState<Step2FormValues | null>(null);

  // Step 3
  const [step3Form] = Form.useForm<Step3FormValues>();

  // 加载策略列表
  useEffect(() => {
    const loadStrategies = async () => {
      setLoadingStrategies(true);
      try {
        const res = await listStrategies({ page: 1, pageSize: 100 });
        setStrategies(res.items);
      } catch (error) {
        console.error(error);
        message.error('加载策略列表失败');
      } finally {
        setLoadingStrategies(false);
      }
    };
    loadStrategies();
  }, [message]);

  // 加载数据集列表
  useEffect(() => {
    const loadDatasets = async () => {
      setLoadingDatasets(true);
      try {
        const res = await listDatasets({ page: 1, pageSize: 100 });
        setDatasets(res.items);
      } catch (error) {
        console.error(error);
        message.error('加载数据集列表失败');
      } finally {
        setLoadingDatasets(false);
      }
    };
    loadDatasets();
  }, [message]);

  // 当选择策略后，加载脚本版本
  const handleStrategyChange = useCallback(
    async (strategyId: number) => {
      setLoadingScripts(true);
      try {
        const res = await listStrategyScripts(strategyId, { page: 1, pageSize: 100 });
        setScripts(res.items);
        step2Form.setFieldsValue({ scriptId: undefined });
      } catch (error) {
        console.error(error);
        message.error('加载脚本版本失败');
      } finally {
        setLoadingScripts(false);
      }
    },
    [step2Form, message],
  );

  // Step 1: 下一步
  const handleStep1Next = useCallback(async () => {
    try {
      const values = await step1Form.validateFields();
      setStep1Data(values);
      if (values.strategyId) {
        await handleStrategyChange(values.strategyId);
      }
      setCurrent(1);
    } catch (error) {
      console.error(error);
    }
  }, [step1Form, handleStrategyChange]);

  // Step 2: 下一步
  const handleStep2Next = useCallback(async () => {
    try {
      const values = await step2Form.validateFields();
      setStep2Data(values);
      setCurrent(2);
    } catch (error) {
      console.error(error);
    }
  }, [step2Form]);

  // Step 3: 提交
  const handleSubmit = useCallback(async () => {
    if (!step1Data || !step2Data) return;

    try {
      const step3Values = await step3Form.validateFields();
      setSubmitting(true);

      const payload: CreateBacktestTaskPayload = {
        name: step1Data.name,
        description: step1Data.description,
        strategyId: step1Data.strategyId!,
        scriptId: step2Data.scriptId!,
        datasetId: step2Data.datasetId!,
        backtestStartDate: step2Data.dateRange![0].toISOString(),
        backtestEndDate: step2Data.dateRange![1].toISOString(),
        config: {
          initialCapital: step3Values.initialCapital,
          timeLevel: step3Values.timeLevel,
          slippageModel:
            step3Values.slippageType && step3Values.slippageValue !== undefined
              ? {
                  type: step3Values.slippageType,
                  value: step3Values.slippageValue,
                }
              : undefined,
          commission:
            step3Values.commissionType && step3Values.commissionValue !== undefined
              ? {
                  type: step3Values.commissionType,
                  value: step3Values.commissionValue,
                }
              : undefined,
          riskConstraints: step3Values.enableRiskConstraints
            ? {
                maxDrawdownPercent: step3Values.maxDrawdownPercent,
                maxDailyLossPercent: step3Values.maxDailyLossPercent,
                maxPositionSize: step3Values.maxPositionSize,
                maxLeverage: step3Values.maxLeverage,
              }
            : undefined,
        },
      };

      const task = await createBacktestTask(payload);
      message.success('回测任务创建成功');
      navigate(`/backtest/tasks/${task.taskId}`);
    } catch (error) {
      console.error(error);
      message.error('创建任务失败，请检查配置后重试');
    } finally {
      setSubmitting(false);
    }
  }, [step1Data, step2Data, step3Form, navigate, message]);

  const strategyColumns: ColumnsType<StrategyDto> = [
    { title: '策略 ID', dataIndex: 'strategyId', width: 100 },
    { title: '策略名称', dataIndex: 'name', width: 200 },
    {
      title: '标签',
      dataIndex: 'tags',
      render: (tags: string[]) => (
        <Space wrap>
          {tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Space>
      ),
    },
  ];

  const scriptColumns: ColumnsType<StrategyScriptDto> = [
    { title: '脚本 ID', dataIndex: 'scriptId', width: 100 },
    { title: '版本号', dataIndex: 'versionCode', width: 200 },
    {
      title: '主版本',
      dataIndex: 'isPrimary',
      width: 100,
      render: (isPrimary: boolean) => (isPrimary ? <Tag color="blue">主版本</Tag> : '-'),
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
  ];

  const datasetColumns: ColumnsType<DatasetDto> = [
    { title: '数据集 ID', dataIndex: 'datasetId', width: 100 },
    { title: '来源', dataIndex: 'source', width: 150 },
    { title: '交易对', dataIndex: 'tradingPair', width: 100 },
    { title: '粒度', dataIndex: 'granularity', width: 100 },
    {
      title: '时间范围',
      width: 250,
      render: (_, record) =>
        `${new Date(record.timeStart).toLocaleDateString()} ~ ${new Date(
          record.timeEnd,
        ).toLocaleDateString()}`,
    },
  ];

  const steps = [
    { title: '基本信息', description: '任务名称与策略' },
    { title: '数据配置', description: '脚本、数据集与时间' },
    { title: '回测参数', description: '资金、滑点与风控' },
  ];

  return (
    <Card title="创建回测任务">
      <Steps current={current} items={steps} style={{ marginBottom: 32 }} />

      {/* Step 1: 基本信息 */}
      {current === 0 && (
        <Form<Step1FormValues>
          form={step1Form}
          layout="vertical"
          initialValues={step1Data || {}}
        >
          <Form.Item
            name="name"
            label="任务名称"
            rules={[
              { required: true, message: '请输入任务名称' },
              { max: 200, message: '名称不能超过200个字符' },
            ]}
          >
            <Input placeholder="例如：ES 期货趋势策略回测 - Q1 2023" />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <TextArea rows={3} maxLength={1000} showCount placeholder="描述回测目的和预期" />
          </Form.Item>
          <Form.Item
            name="strategyId"
            label="选择策略"
            rules={[{ required: true, message: '请选择策略' }]}
          >
            <Select
              placeholder="请选择策略"
              loading={loadingStrategies}
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={strategies.map((s) => ({
                label: `${s.name} (ID: ${s.strategyId})`,
                value: s.strategyId,
              }))}
            />
          </Form.Item>
          {step1Form.getFieldValue('strategyId') && (
            <Table<StrategyDto>
              size="small"
              rowKey="strategyId"
              columns={strategyColumns}
              dataSource={strategies.filter(
                (s) => s.strategyId === step1Form.getFieldValue('strategyId'),
              )}
              pagination={false}
            />
          )}
          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button onClick={() => navigate('/backtest/tasks')}>取消</Button>
              <Button type="primary" onClick={handleStep1Next}>
                下一步
              </Button>
            </Space>
          </Form.Item>
        </Form>
      )}

      {/* Step 2: 数据配置 */}
      {current === 1 && (
        <Form<Step2FormValues>
          form={step2Form}
          layout="vertical"
          initialValues={step2Data || {}}
        >
          <Form.Item
            name="scriptId"
            label="选择脚本版本"
            rules={[{ required: true, message: '请选择脚本版本' }]}
          >
            <Select
              placeholder="请选择脚本版本"
              loading={loadingScripts}
              options={scripts.map((s) => ({
                label: `${s.versionCode}${s.isPrimary ? ' (主版本)' : ''}`,
                value: s.scriptId,
              }))}
            />
          </Form.Item>
          {step2Form.getFieldValue('scriptId') && (
            <Table<StrategyScriptDto>
              size="small"
              rowKey="scriptId"
              columns={scriptColumns}
              dataSource={scripts.filter(
                (s) => s.scriptId === step2Form.getFieldValue('scriptId'),
              )}
              pagination={false}
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item
            name="datasetId"
            label="选择数据集"
            rules={[{ required: true, message: '请选择数据集' }]}
          >
            <Select
              placeholder="请选择数据集"
              loading={loadingDatasets}
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={datasets.map((d) => ({
                label: `${d.source} - ${d.tradingPair} (${d.granularity})`,
                value: d.datasetId,
              }))}
            />
          </Form.Item>
          {step2Form.getFieldValue('datasetId') && (
            <Table<DatasetDto>
              size="small"
              rowKey="datasetId"
              columns={datasetColumns}
              dataSource={datasets.filter(
                (d) => d.datasetId === step2Form.getFieldValue('datasetId'),
              )}
              pagination={false}
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item
            name="dateRange"
            label="回测时间范围"
            rules={[{ required: true, message: '请选择回测时间范围' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button onClick={() => setCurrent(0)}>上一步</Button>
              <Button type="primary" onClick={handleStep2Next}>
                下一步
              </Button>
            </Space>
          </Form.Item>
        </Form>
      )}

      {/* Step 3: 回测参数 */}
      {current === 2 && (
        <Form<Step3FormValues>
          form={step3Form}
          layout="vertical"
          initialValues={{
            initialCapital: 100000,
            timeLevel: '1m',
          }}
        >
          <Form.Item
            name="initialCapital"
            label="初始资金"
            rules={[{ required: true, message: '请输入初始资金' }]}
          >
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              placeholder="例如：100000"
              addonAfter="元"
            />
          </Form.Item>
          <Form.Item
            name="timeLevel"
            label="交易时间级别"
            rules={[{ required: true, message: '请选择时间级别' }]}
          >
            <Select
              options={[
                { label: '1 分钟', value: '1m' },
                { label: '5 分钟', value: '5m' },
                { label: '15 分钟', value: '15m' },
                { label: '30 分钟', value: '30m' },
                { label: '1 小时', value: '1h' },
                { label: '4 小时', value: '4h' },
                { label: '1 天', value: '1d' },
              ]}
            />
          </Form.Item>
          <Card size="small" title="滑点模型（可选）" style={{ marginBottom: 16 }}>
            <Form.Item name="slippageType" label="滑点类型">
              <Select
                placeholder="不设置"
                allowClear
                options={[
                  { label: '固定滑点', value: 'fixed' },
                  { label: '百分比滑点', value: 'percentage' },
                ]}
              />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.slippageType !== currentValues.slippageType
              }
            >
              {({ getFieldValue }) =>
                getFieldValue('slippageType') ? (
                  <Form.Item name="slippageValue" label="滑点值">
                    <InputNumber
                      min={0}
                      style={{ width: '100%' }}
                      placeholder="例如：0.5"
                      addonAfter={getFieldValue('slippageType') === 'percentage' ? '%' : ''}
                    />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </Card>
          <Card size="small" title="手续费模型（可选）" style={{ marginBottom: 16 }}>
            <Form.Item name="commissionType" label="手续费类型">
              <Select
                placeholder="不设置"
                allowClear
                options={[
                  { label: '固定手续费', value: 'fixed' },
                  { label: '百分比手续费', value: 'percentage' },
                ]}
              />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.commissionType !== currentValues.commissionType
              }
            >
              {({ getFieldValue }) =>
                getFieldValue('commissionType') ? (
                  <Form.Item name="commissionValue" label="手续费率">
                    <InputNumber
                      min={0}
                      style={{ width: '100%' }}
                      placeholder="例如：0.001"
                      addonAfter={getFieldValue('commissionType') === 'percentage' ? '%' : ''}
                    />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </Card>
          <Card size="small" title="风险约束（可选）" style={{ marginBottom: 16 }}>
            <Form.Item name="enableRiskConstraints" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.enableRiskConstraints !== currentValues.enableRiskConstraints
              }
            >
              {({ getFieldValue }) =>
                getFieldValue('enableRiskConstraints') ? (
                  <>
                    <Form.Item name="maxDrawdownPercent" label="最大回撤（%）">
                      <InputNumber min={0} max={100} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="maxDailyLossPercent" label="最大单日亏损（%）">
                      <InputNumber min={0} max={100} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="maxPositionSize" label="最大持仓数量">
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="maxLeverage" label="最大杠杆倍数">
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                ) : null
              }
            </Form.Item>
          </Card>
          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button onClick={() => setCurrent(1)}>上一步</Button>
              <Button type="primary" onClick={handleSubmit} loading={submitting}>
                创建任务
              </Button>
            </Space>
          </Form.Item>
        </Form>
      )}
    </Card>
  );
};

export default BacktestTaskCreatePage;

