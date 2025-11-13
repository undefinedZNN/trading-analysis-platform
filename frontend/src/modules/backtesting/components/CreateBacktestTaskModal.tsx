import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  Divider,
  message,
  Space,
  Collapse,
  Alert,
} from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { StrategyDetail, StrategySummary } from '../../../shared/api/backtesting';
import { fetchStrategy, listStrategies } from '../../../shared/api/backtesting';
import {
  createBacktestTask,
  type CreateBacktestTaskRequest,
} from '../../../shared/api/backtestTasks';
import { DynamicParamsForm, type ParamSchema } from './DynamicParamsForm';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

interface CreateBacktestTaskModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  /**
   * 预选的策略ID（可选）
   * - 如果传入：场景1（从策略列表/详情页创建），策略已知，只需选择版本
   * - 如果为空：场景2（从任务列表页创建），需要先选择策略，再选择版本
   */
  strategyId?: string;
  /**
   * 可用的数据集列表
   */
  datasets?: Array<{
    datasetId: number;
    name: string;
    tradingPair: string;
    granularity: string;
    timeStart: string;
    timeEnd: string;
    rowCount: number;
  }>;
}

/**
 * 创建回测任务模态框
 */
export const CreateBacktestTaskModal: React.FC<CreateBacktestTaskModalProps> = ({
  open,
  onCancel,
  onSuccess,
  strategyId: propsStrategyId,
  datasets = [],
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [strategies, setStrategies] = useState<StrategySummary[]>([]);
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | undefined>();
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [parameterSchema, setParameterSchema] = useState<ParamSchema[]>([]);

  // 场景判断
  const isScenario1 = !!propsStrategyId; // 场景1：策略已知
  const isScenario2 = !propsStrategyId; // 场景2：需要选择策略

  // 场景1：同步propsStrategyId到selectedStrategyId
  useEffect(() => {
    if (open && propsStrategyId) {
      setSelectedStrategyId(propsStrategyId);
    }
  }, [open, propsStrategyId]);

  // 场景2：加载策略列表
  useEffect(() => {
    if (open && isScenario2) {
      setLoadingStrategies(true);
      listStrategies({ pageSize: 100 })  // 后端限制最大100
        .then((response) => {
          setStrategies(response.items);
        })
        .catch((err) => {
          message.error('加载策略列表失败: ' + err.message);
        })
        .finally(() => {
          setLoadingStrategies(false);
        });
    }
  }, [open, isScenario2]);

  // 加载策略详情（场景1自动加载，场景2在选择策略后加载）
  useEffect(() => {
    if (open && selectedStrategyId) {
      fetchStrategy(selectedStrategyId)
        .then((data) => {
          setStrategy(data);
          // 默认选择master版本
          const masterVersion = data.masterVersion || data.latestVersion;
          if (masterVersion) {
            form.setFieldsValue({
              scriptVersionId: masterVersion.scriptVersionId,
            });
            // 设置参数Schema
            if (masterVersion.parameterSchema) {
              setParameterSchema(masterVersion.parameterSchema as ParamSchema[]);
            }
          }
        })
        .catch((err) => {
          message.error('加载策略详情失败: ' + err.message);
        });
    }
  }, [open, selectedStrategyId, form]);

  // 监听数据集选择变化
  const handleDatasetChange = (datasetId: number) => {
    const dataset = datasets.find((d) => d.datasetId === datasetId);
    if (dataset) {
      setSelectedDataset(dataset);
      // 自动填充时间范围
      form.setFieldsValue({
        dataConfig: {
          timeRange: [dayjs(dataset.timeStart), dayjs(dataset.timeEnd)],
          timeframe: dataset.granularity, // 默认使用数据集的粒度
        },
      });
    }
  };

  // 场景2：监听策略选择变化
  const handleStrategyChange = (strategyId: string) => {
    setSelectedStrategyId(strategyId);
    // 清空版本和参数
    form.setFieldsValue({
      scriptVersionId: undefined,
      strategyParams: {},
    });
    setParameterSchema([]);
  };

  // 监听版本变化
  const handleVersionChange = (versionId: string) => {
    const version = strategy?.scriptVersions.find(
      (v) => v.scriptVersionId === versionId,
    );
    if (version?.parameterSchema) {
      setParameterSchema(version.parameterSchema as ParamSchema[]);
      // 清空之前的参数值
      form.setFieldsValue({ strategyParams: {} });
    }
  };

  // 关闭模态框时重置状态
  const handleCancel = () => {
    form.resetFields();
    setStrategy(null);
    setSelectedStrategyId(undefined);
    setParameterSchema([]);
    setSelectedDataset(null);
    onCancel();
  };

  // 提交表单
  const handleSubmit = async (values: any) => {
    try {
      setLoading(true);

      // 使用propsStrategyId（场景1）或selectedStrategyId（场景2）
      const targetStrategyId = propsStrategyId || selectedStrategyId;
      if (!targetStrategyId) {
        message.error('请选择策略');
        return;
      }

      // 构建请求payload
      const payload: CreateBacktestTaskRequest = {
        taskName: values.taskName,
        taskDescription: values.taskDescription,
        strategyId: targetStrategyId,
        scriptVersionId: values.scriptVersionId,
        datasetId: values.datasetId,
        strategyParams: values.strategyParams || {},
        executionConfig: {
          initialCapital: values.executionConfig.initialCapital,
          leverage: values.executionConfig.leverage || 1,
          slippage: values.executionConfig.slippage || 0,
          fees: {
            makerFee: values.executionConfig.fees.makerFee,
            takerFee: values.executionConfig.fees.takerFee,
          },
          tradingHours: values.executionConfig.tradingHours,
        },
        dataConfig: {
          timeRange: {
            start: values.dataConfig.timeRange[0].toISOString(),
            end: values.dataConfig.timeRange[1].toISOString(),
          },
          timeframe: values.dataConfig.timeframe,
        },
      };

      await createBacktestTask(payload);
      message.success('回测任务创建成功！');
      form.resetFields();
      setParameterSchema([]);
      onSuccess();
    } catch (error: any) {
      message.error('创建任务失败: ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 生成默认任务名称
  const generateTaskName = () => {
    if (strategy && selectedDataset) {
      const date = dayjs().format('YYYY-MM-DD');
      return `${strategy.name}-${selectedDataset.name}-${date}`;
    }
    return '';
  };

  return (
    <Modal
      title="创建回测任务"
      open={open}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      width={900}
      okText="创建任务"
      cancelText="取消"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          executionConfig: {
            initialCapital: 10000,
            leverage: 1,
            slippage: 0,
            fees: {
              makerFee: 0.0002,
              takerFee: 0.0005,
            },
          },
        }}
      >
        {/* 基本信息 */}
        <Alert
          message="提示"
          description="请填写回测任务的基本信息和配置参数。任务创建后将自动加入执行队列。"
          type="info"
          icon={<InfoCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Form.Item
          name="taskName"
          label="任务名称"
          rules={[
            { required: true, message: '请输入任务名称' },
            { max: 100, message: '任务名称最多100个字符' },
          ]}
          tooltip="建议使用描述性的名称，包含策略、数据集和时间信息"
        >
          <Input
            placeholder={generateTaskName() || '例如：双均线策略-BTC/USDT-2024全年'}
            suffix={
              <a onClick={() => form.setFieldsValue({ taskName: generateTaskName() })}>
                自动生成
              </a>
            }
          />
        </Form.Item>

        <Form.Item
          name="taskDescription"
          label="任务描述"
          rules={[{ max: 500, message: '描述最多500个字符' }]}
        >
          <TextArea
            rows={2}
            placeholder="可选，描述本次回测的目的和预期"
          />
        </Form.Item>

        <Divider>策略配置</Divider>

        {/* 场景2：选择策略 */}
        {isScenario2 && (
          <Form.Item
            name="strategyId"
            label="选择策略"
            rules={[{ required: true, message: '请选择策略' }]}
            tooltip="选择要进行回测的策略"
          >
            <Select
              placeholder="请选择策略"
              loading={loadingStrategies}
              showSearch
              optionFilterProp="label"
              onChange={handleStrategyChange}
              options={strategies.map((s) => ({
                label: s.name,
                value: s.strategyId,
              }))}
            />
          </Form.Item>
        )}

        {/* 场景1：显示策略名称（只读） */}
        {isScenario1 && strategy && (
          <Form.Item label="策略名称">
            <Input value={strategy.name} disabled />
          </Form.Item>
        )}

        {/* 策略版本选择（两种场景都需要） */}
        <Form.Item
          name="scriptVersionId"
          label="脚本版本"
          rules={[{ required: true, message: '请选择脚本版本' }]}
          tooltip="默认选择master版本，也可以选择其他版本进行测试"
        >
          <Select
            placeholder="请选择脚本版本"
            disabled={!strategy}
            onChange={handleVersionChange}
            options={strategy?.scriptVersions.map((v) => ({
              label: (
                <span>
                  {v.versionName}
                  {v.isMaster && <span style={{ color: '#52c41a' }}> [Master]</span>}
                  {v.remark && <span style={{ color: '#999' }}> - {v.remark}</span>}
                </span>
              ),
              value: v.scriptVersionId,
            }))}
          />
        </Form.Item>

        {/* 动态策略参数 */}
        {parameterSchema.length > 0 && (
          <>
            <Divider>策略参数</Divider>
            <DynamicParamsForm parameterSchema={parameterSchema} />
          </>
        )}

        <Divider>数据配置</Divider>

        {/* 数据集选择 */}
        <Form.Item
          name="datasetId"
          label="数据集"
          rules={[{ required: true, message: '请选择数据集' }]}
          tooltip="选择用于回测的历史数据集"
        >
          <Select
            placeholder="请选择数据集"
            showSearch
            optionFilterProp="label"
            onChange={handleDatasetChange}
            options={datasets.map((d) => ({
              label: `${d.name} (${d.tradingPair} - ${d.granularity} - ${d.rowCount}条)`,
              value: d.datasetId,
            }))}
          />
        </Form.Item>

        {selectedDataset && (
          <Alert
            message="数据集信息"
            description={`时间范围: ${dayjs(selectedDataset.timeStart).format('YYYY-MM-DD')} ~ ${dayjs(selectedDataset.timeEnd).format('YYYY-MM-DD')} | 数据量: ${selectedDataset.rowCount.toLocaleString()}条`}
            type="success"
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 时间范围 */}
        <Form.Item
          name={['dataConfig', 'timeRange']}
          label="回测时间范围"
          rules={[{ required: true, message: '请选择时间范围' }]}
          tooltip="默认使用数据集的完整时间范围，可以手动调整"
        >
          <RangePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            disabledDate={(current) => {
              if (!selectedDataset) return false;
              return (
                current &&
                (current < dayjs(selectedDataset.timeStart) ||
                  current > dayjs(selectedDataset.timeEnd))
              );
            }}
          />
        </Form.Item>

        {/* 交易周期 */}
        <Form.Item
          name={['dataConfig', 'timeframe']}
          label="交易时间周期"
          rules={[{ required: true, message: '请选择时间周期' }]}
          tooltip="最小粒度由数据集决定"
        >
          <Select
            placeholder="请选择时间周期"
            options={[
              { label: '1分钟', value: '1m' },
              { label: '5分钟', value: '5m' },
              { label: '15分钟', value: '15m' },
              { label: '30分钟', value: '30m' },
              { label: '1小时', value: '1h' },
              { label: '4小时', value: '4h' },
              { label: '1天', value: '1d' },
            ]}
          />
        </Form.Item>

        <Divider>执行配置</Divider>

        {/* 初始资金 */}
        <Form.Item
          name={['executionConfig', 'initialCapital']}
          label="初始资金（USD）"
          rules={[
            { required: true, message: '请输入初始资金' },
            { type: 'number', min: 1, max: 10000000, message: '初始资金范围: 1 - 10,000,000' },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            max={10000000}
            formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value!.replace(/\$\s?|(,*)/g, '')}
          />
        </Form.Item>

        {/* 手续费配置 */}
        <Space style={{ width: '100%' }} size="large">
          <Form.Item
            name={['executionConfig', 'fees', 'makerFee']}
            label="Maker手续费率"
            rules={[{ required: true }, { type: 'number', min: 0, max: 0.01 }]}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              min={0}
              max={0.01}
              step={0.0001}
              formatter={(value) => `${(value! * 100).toFixed(2)}%`}
              parser={(value) => parseFloat(value!.replace('%', '')) / 100}
            />
          </Form.Item>

          <Form.Item
            name={['executionConfig', 'fees', 'takerFee']}
            label="Taker手续费率"
            rules={[{ required: true }, { type: 'number', min: 0, max: 0.01 }]}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              min={0}
              max={0.01}
              step={0.0001}
              formatter={(value) => `${(value! * 100).toFixed(2)}%`}
              parser={(value) => parseFloat(value!.replace('%', '')) / 100}
            />
          </Form.Item>
        </Space>

        {/* 高级配置（可折叠） */}
        <Collapse
          ghost
          items={[
            {
              key: 'advanced',
              label: '高级配置（可选）',
              children: (
                <>
                  <Form.Item
                    name={['executionConfig', 'leverage']}
                    label="杠杆倍数"
                    tooltip="MVP阶段暂不支持，默认为1"
                  >
                    <InputNumber min={1} max={125} disabled />
                  </Form.Item>

                  <Form.Item
                    name={['executionConfig', 'slippage']}
                    label="滑点"
                    tooltip="MVP阶段暂不支持，默认为0"
                  >
                    <InputNumber min={0} max={1} step={0.0001} disabled />
                  </Form.Item>

                  <Form.Item
                    name={['executionConfig', 'tradingHours', 'start']}
                    label="交易开始时间"
                    tooltip="限制交易时段，格式：HH:mm"
                  >
                    <Input placeholder="09:00" />
                  </Form.Item>

                  <Form.Item
                    name={['executionConfig', 'tradingHours', 'end']}
                    label="交易结束时间"
                    tooltip="限制交易时段，格式：HH:mm"
                  >
                    <Input placeholder="15:00" />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
};

export default CreateBacktestTaskModal;

