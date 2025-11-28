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
  Collapse,
  Alert,
  Card,
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
import {
  AssetType,
  CommissionType,
  ASSET_TYPE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
} from '../../../shared/types/asset-types';

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
    assetType?: string;
    contractSpecs?: {
      multiplier?: number;
      marginRatio?: number;
      lotSize?: number;
      tickSize?: number;
    };
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
  const [selectedAssetType, setSelectedAssetType] = useState<string | undefined>(AssetType.Crypto);
  const [selectedCommissionType, setSelectedCommissionType] = useState<string>(CommissionType.MakerTaker);

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
          
          // 自动选择 master 版本（如果存在）
          const masterVersion = data.masterVersion || data.latestVersion;
          if (masterVersion) {
            // 设置参数Schema
            if (masterVersion.parameterSchema) {
              setParameterSchema(masterVersion.parameterSchema as ParamSchema[]);
            }
            
            // 自动填充版本ID到表单
            form.setFieldsValue({
              scriptVersionId: masterVersion.scriptVersionId,
            });
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
      
      // 自动填充时间范围和信号周期（默认5分钟）
      const formValues: any = {
        dataConfig: {
          timeRange: [dayjs(dataset.timeStart), dayjs(dataset.timeEnd)],
          timeframe: '5m', // 默认5分钟
        },
      };
      
      // 如果数据集有资产类型和合约规格，自动填充到执行配置
      if (dataset.assetType) {
        setSelectedAssetType(dataset.assetType);
        formValues.executionConfig = {
          assetType: dataset.assetType,
          contractSpecs: dataset.contractSpecs || undefined,
        };
      }
      
      form.setFieldsValue(formValues);
    }
  };

  // 场景2：监听策略选择变化
  const handleStrategyChange = (strategyId: string) => {
    setSelectedStrategyId(strategyId);
    // 清空参数（版本ID会在useEffect中自动设置为master）
    form.setFieldsValue({
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
    setSelectedAssetType(AssetType.Crypto);
    setSelectedCommissionType(CommissionType.MakerTaker);
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

      // 处理 tradingHours：如果没有填写 start 和 end，则不发送
      const tradingHours = values.executionConfig.tradingHours;
      const hasTradingHours = tradingHours?.start && tradingHours?.end;

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
          slippage: values.executionConfig.slippage || 0,
          assetType: values.executionConfig.assetType,
          contractSpecs: values.executionConfig.contractSpecs,
          commission: values.executionConfig.commission,
          tradingHours: hasTradingHours ? tradingHours : undefined,
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
          dataConfig: {
            timeframe: '5m', // 默认推荐5分钟
          },
          executionConfig: {
            initialCapital: 10000,
            slippage: 0,
            assetType: AssetType.Crypto,
            commission: {
              type: CommissionType.MakerTaker,
              makerRate: 0.001,
              takerRate: 0.001,
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
          tooltip="建议选择Master版本（已验证的稳定版本）。如需测试新功能，可选择其他版本"
          extra={
            strategy?.masterVersion && (
              <span style={{ color: '#52c41a' }}>
                💡 推荐选择 Master 版本：{strategy.masterVersion.versionName}
              </span>
            )
          }
        >
          <Select
            placeholder="请选择脚本版本（建议选择Master版本）"
            disabled={!strategy}
            onChange={handleVersionChange}
            options={strategy?.scriptVersions
              .sort((a, b) => {
                // Master版本排在最前面
                if (a.isMaster) return -1;
                if (b.isMaster) return 1;
                // 然后按创建时间降序
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              })
              .map((v) => ({
                label: (
                  <span>
                    {v.isMaster && <span style={{ color: '#52c41a', fontWeight: 'bold' }}>⭐ </span>}
                    {v.versionName}
                    {v.isMaster && <span style={{ color: '#52c41a' }}> [Master - 推荐]</span>}
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

        {/* 策略信号周期 */}
        <Form.Item
          name={['dataConfig', 'timeframe']}
          label="策略信号周期"
          rules={[{ required: true, message: '请选择策略信号周期' }]}
          tooltip="策略计算交易信号的时间周期。系统会自动使用1秒数据进行精确成交模拟，确保回测精度。"
        >
          <Select
            placeholder="请选择策略信号周期"
            options={[
              { 
                label: '1秒 (最精确，适合高频策略)', 
                value: '1s',
              },
              { 
                label: '5秒', 
                value: '5s',
              },
              { 
                label: '15秒', 
                value: '15s',
              },
              { 
                label: '30秒', 
                value: '30s',
              },
              { 
                label: '1分钟', 
                value: '1m',
              },
              { 
                label: '5分钟 (推荐，平衡速度与精度)', 
                value: '5m',
              },
              { 
                label: '15分钟', 
                value: '15m',
              },
              { 
                label: '30分钟', 
                value: '30m',
              },
              { 
                label: '1小时 (快速验证)', 
                value: '1h',
              },
              { 
                label: '4小时', 
                value: '4h',
              },
              { 
                label: '1天', 
                value: '1d',
              },
            ]}
          />
        </Form.Item>

        {/* 精度说明 */}
        <Alert
          message="🎯 多周期回测说明"
          description={
            <div>
              <p>• <strong>策略信号</strong>：基于您选择的周期（如5分钟）计算交易信号</p>
              <p>• <strong>成交模拟</strong>：自动使用1秒数据进行精确成交价格模拟</p>
              <p>• <strong>回测精度</strong>：消除Bar内成交顺序误差，提供生产级精度</p>
              <p>• <strong>性能参考</strong>：5分钟周期约需2-3秒，1秒周期约需10-15分钟</p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

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
          <InputNumber<number>
            style={{ width: '100%' }}
            min={1}
            max={10000000}
            formatter={(value) =>
              `$ ${value !== undefined ? value.toString() : ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
            }
            parser={(value) => {
              if (!value) return 0 as number;
              const numeric = value.replace(/\$\s?|(,*)/g, '');
              const parsed = Number(numeric);
              return Number.isFinite(parsed) ? parsed : 0;
            }}
          />
        </Form.Item>

        {/* 资产类型选择 */}
        <Form.Item
          name={['executionConfig', 'assetType']}
          label="资产类型"
          rules={[{ required: true, message: '请选择资产类型' }]}
          tooltip="选择回测的资产类型，不同类型有不同的交易规则"
        >
          <Select
            placeholder="请选择资产类型"
            options={ASSET_TYPE_OPTIONS}
            onChange={(value) => {
              setSelectedAssetType(value);
              // 切换资产类型时清空合约规格
              form.setFieldsValue({
                executionConfig: {
                  contractSpecs: undefined,
                },
              });
            }}
          />
        </Form.Item>

        {/* 合约规格配置（根据资产类型显示） */}
        {(selectedAssetType === AssetType.Futures || selectedAssetType === AssetType.Stock) && (
          <Card
            size="small"
            title="合约规格配置"
            style={{ marginBottom: 16 }}
          >
            {selectedAssetType === AssetType.Futures && (
              <>
                <Form.Item
                  name={['executionConfig', 'contractSpecs', 'multiplier']}
                  label="合约乘数"
                  tooltip="每手对应的标的物数量，例如螺纹钢期货为 10 吨/手"
                  rules={[{ required: true, message: '期货必须设置合约乘数' }]}
                >
                  <InputNumber
                    min={1}
                    placeholder="例：10"
                    style={{ width: '100%' }}
                  />
                </Form.Item>

                <Form.Item
                  name={['executionConfig', 'contractSpecs', 'marginRatio']}
                  label="保证金比例"
                  tooltip="交易所规定的保证金比例，例如 0.09 表示 9%，0.007 表示 0.7%"
                  rules={[{ required: true, message: '期货必须设置保证金比例' }]}
                >
                <InputNumber
                  min={0}
                  max={1}
                  step={0.001}
                  placeholder="例：0.09 或 0.007"
                  style={{ width: '100%' }}
                  formatter={(value) => value ? `${(value * 100).toFixed(2)}%` : ''}
                  parser={(value) => {
                    const num = value ? parseFloat(value.replace('%', '')) / 100 : 0;
                    return num as number;
                  }}
                />
                </Form.Item>

                <Form.Item
                  name={['executionConfig', 'contractSpecs', 'tickSize']}
                  label="最小变动价位"
                  tooltip="合约价格的最小变动单位"
                >
                  <InputNumber
                    min={0}
                    step={0.01}
                    placeholder="例：1.0"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </>
            )}

            {selectedAssetType === AssetType.Stock && (
              <Form.Item
                name={['executionConfig', 'contractSpecs', 'lotSize']}
                label="最小交易单位"
                tooltip="最小交易单位，例如 A 股为 100 股/手"
              >
                <InputNumber
                  min={1}
                  placeholder="例：100"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            )}
          </Card>
        )}

        {/* 佣金配置 */}
        <Form.Item
          name={['executionConfig', 'commission', 'type']}
          label="佣金类型"
          rules={[{ required: true, message: '请选择佣金类型' }]}
          tooltip="选择佣金计算方式"
        >
          <Select
            placeholder="请选择佣金类型"
            options={COMMISSION_TYPE_OPTIONS}
            onChange={(value) => {
              setSelectedCommissionType(value);
              // 切换佣金类型时清空相关字段
              form.setFieldsValue({
                executionConfig: {
                  commission: {
                    type: value,
                    rate: undefined,
                    amount: undefined,
                    makerRate: undefined,
                    takerRate: undefined,
                    minCommission: undefined,
                    stampDuty: undefined,
                  },
                },
              });
            }}
          />
        </Form.Item>

        {/* 根据佣金类型显示不同字段 */}
        {selectedCommissionType === CommissionType.Percentage && (
          <Card size="small" title="百分比佣金配置" style={{ marginBottom: 16 }}>
            <Form.Item
              name={['executionConfig', 'commission', 'rate']}
              label="费率"
              rules={[{ required: true, message: '请输入费率' }]}
              tooltip="佣金费率，例如 0.0003 表示万分之三"
            >
              <InputNumber
                min={0}
                max={0.1}
                step={0.0001}
                placeholder="例：0.0003"
                style={{ width: '100%' }}
                formatter={(value) => value ? `${(value * 10000).toFixed(1)}‱` : ''}
                parser={(value) => {
                  const num = value ? parseFloat(value.replace('‱', '')) / 10000 : 0;
                  return num as number;
                }}
              />
            </Form.Item>

            <Form.Item
              name={['executionConfig', 'commission', 'minCommission']}
              label="最低佣金（可选）"
              tooltip="最低佣金金额，例如 A 股最低 5 元"
            >
              <InputNumber
                min={0}
                placeholder="例：5.0"
                style={{ width: '100%' }}
              />
            </Form.Item>

            {selectedAssetType === AssetType.Stock && (
              <Form.Item
                name={['executionConfig', 'commission', 'stampDuty']}
                label="印花税率（可选）"
                tooltip="股票印花税率，例如 A 股为 0.001（千分之一）"
              >
              <InputNumber
                min={0}
                max={0.01}
                step={0.0001}
                placeholder="例：0.001"
                style={{ width: '100%' }}
                formatter={(value) => value ? `${(value * 1000).toFixed(1)}‰` : ''}
                parser={(value) => {
                  const num = value ? parseFloat(value.replace('‰', '')) / 1000 : 0;
                  return num as number;
                }}
              />
              </Form.Item>
            )}
          </Card>
        )}

        {selectedCommissionType === CommissionType.Fixed && (
          <Card size="small" title="固定佣金配置" style={{ marginBottom: 16 }}>
            <Form.Item
              name={['executionConfig', 'commission', 'amount']}
              label="固定金额"
              rules={[{ required: true, message: '请输入固定佣金金额' }]}
              tooltip="每手/每笔固定佣金，例如期货 2 元/手"
            >
              <InputNumber
                min={0}
                placeholder="例：2.0"
                style={{ width: '100%' }}
                formatter={(value) => value ? `${value} 元` : ''}
                parser={(value) => {
                  const num = value ? parseFloat(value.replace('元', '').trim()) : 0;
                  return num as number;
                }}
              />
            </Form.Item>
          </Card>
        )}

        {selectedCommissionType === CommissionType.MakerTaker && (
          <Card size="small" title="Maker/Taker 佣金配置" style={{ marginBottom: 16 }}>
            <Form.Item
              name={['executionConfig', 'commission', 'makerRate']}
              label="Maker 费率"
              rules={[{ required: true, message: '请输入 Maker 费率' }]}
              tooltip="Maker（提供流动性）费率"
            >
              <InputNumber
                min={0}
                max={0.1}
                step={0.0001}
                placeholder="例：0.001"
                style={{ width: '100%' }}
                formatter={(value) => value ? `${(value * 10000).toFixed(1)}‱` : ''}
                parser={(value) => {
                  const num = value ? parseFloat(value.replace('‱', '')) / 10000 : 0;
                  return num as number;
                }}
              />
            </Form.Item>

            <Form.Item
              name={['executionConfig', 'commission', 'takerRate']}
              label="Taker 费率"
              rules={[{ required: true, message: '请输入 Taker 费率' }]}
              tooltip="Taker（消耗流动性）费率"
            >
              <InputNumber
                min={0}
                max={0.1}
                step={0.0001}
                placeholder="例：0.001"
                style={{ width: '100%' }}
                formatter={(value) => value ? `${(value * 10000).toFixed(1)}‱` : ''}
                parser={(value) => {
                  const num = value ? parseFloat(value.replace('‱', '')) / 10000 : 0;
                  return num as number;
                }}
              />
            </Form.Item>
          </Card>
        )}

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
                    name={['executionConfig', 'slippage']}
                    label="滑点比例"
                    tooltip="滑点比例，例如 0.0005 表示 0.05%"
                  >
                    <InputNumber
                      min={0}
                      max={0.01}
                      step={0.0001}
                      placeholder="例：0.0005"
                      style={{ width: '100%' }}
                      formatter={(value) => value ? `${(value * 100).toFixed(2)}%` : ''}
                      parser={(value) => {
                        const num = value ? parseFloat(value.replace('%', '')) / 100 : 0;
                        return num as number;
                      }}
                    />
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
